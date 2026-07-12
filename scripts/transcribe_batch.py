#!/usr/bin/env python3
"""Full-corpus analysis via the Batch API (50% cheaper), CHUNKED and RESUMABLE, with live
progress written to data/analysis-progress.json for the admin dashboard.

Why resumable: Batch jobs run on Anthropic's servers, so they keep going even if this laptop
sleeps/closes. Only our local *collector* is fragile. So every submitted batch is recorded to
data/analysis-batches.json (batch id + the groups in it). On any machine you can then:

  --status   : query every recorded batch's live status (no local run needed) and refresh the
               dashboard file. Safe to run from a second laptop mid-run.
  (default)  : reconcile — collect results from any already-submitted batch that isn't collected
               yet (writing the JSON + image), THEN submit whatever groups still remain. So if the
               run dies, just run it again anywhere with the repo + key and it picks up — no
               double-spend (in-flight batches are reconnected, not resubmitted).

Reuses the prompt / schema / all-frames preprocessing from transcribe.py.

Run:  ./.venv/bin/python scripts/transcribe_batch.py            # start / resume the full run
      ./.venv/bin/python scripts/transcribe_batch.py --status   # just show progress (any laptop)
      ./.venv/bin/python scripts/transcribe_batch.py --force     # re-do everything
"""
import argparse, base64, datetime, hashlib, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import transcribe as T
import build_derivatives

MANIFEST = "/Users/doug/ongs_poems/data/analysis-batches.json"  # durable batch ledger (committable)
NOW = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()


def _retry(fn, tries=8, base=8):
    """Call fn(), retrying transient API/network errors (timeouts, dropped connections) with
    backoff instead of crashing a multi-hour collector. Returns None if all tries fail."""
    for i in range(tries):
        try:
            return fn()
        except Exception as e:
            print(f"  (transient API error, retry {i + 1}/{tries}: {type(e).__name__})")
            time.sleep(min(90, base * (i + 1)))
    return None


def is_fresh(g):
    """A group is 'done' only if it has an ALL-FRAMES transcription. Old frame-0-only JSONs
    (pre multi-page fix) lack the `_meta.files` marker → treated as stale, to be redone."""
    p = os.path.join(T.OUT_DIR, f"{g}.json")
    if not os.path.exists(p):
        return False
    try:
        return json.load(open(p)).get("_meta", {}).get("files") is not None
    except Exception:
        return False


def load_manifest():
    try:
        return json.load(open(MANIFEST))
    except Exception:
        return []


def save_manifest(entries):
    tmp = MANIFEST + ".tmp"
    with open(tmp, "w") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)
    os.replace(tmp, MANIFEST)


def parse_message(msg):
    """Extract the poems array from a batch result message (raises on truncation/bad JSON)."""
    text = next(blk.text for blk in msg.content if blk.type == "text")
    data = json.loads(text)
    if "poems" not in data:
        raise ValueError("missing 'poems'")
    return data["poems"]


def collect_results(client, entry, state, run_t0):
    """STITCH an ALREADY-ENDED batch: a sitting >20 pages was split into sub-requests
    (custom_id `base__i`); merge their poems in page order into one JSON per sitting. A sitting
    is only written when ALL its sub-requests in this batch succeeded. Idempotent + retry-safe."""
    bid = entry["batch_id"]
    # gather results per base sitting: sub_index -> (poems, usage) | None(failed)
    import collections as _c
    got = _c.defaultdict(dict)
    results = _retry(lambda: list(client.messages.batches.results(bid)))
    if results is None:
        print(f"  ! chunk {entry['chunk']}: could not fetch results (will retry next pass)"); return
    for r in results:
        base, _, sub = r.custom_id.partition("__")
        si = int(sub) if sub else 0
        if r.result.type != "succeeded":
            got[base][si] = None
            T.log_err({"group": base, "sub": si, "kind": "batch_result",
                       "result_type": r.result.type, "batch_id": bid})
        else:
            try:
                got[base][si] = (parse_message(r.result.message), r.result.message.usage)
            except Exception as e:
                got[base][si] = None
                T.log_err({"group": base, "sub": si, "kind": "parse_error", "error": str(e),
                           "stop_reason": getattr(r.result.message, "stop_reason", None), "batch_id": bid})

    for base, subs in got.items():
        meta = entry["groups"][base]
        n = meta.get("subs", 1)
        if is_fresh(base):
            continue
        if len(subs) < n or any(subs.get(i) is None for i in range(n)):  # incomplete → resubmit later
            state["totals"]["fail"] += 1
            state["failed"].append({"group": base, "kind": "incomplete",
                                    "error": f"{sum(1 for i in range(n) if subs.get(i))}/{n} sub-requests ok"})
            T.write_progress(state); continue
        poems, tin, tout = [], 0, 0
        for i in range(n):
            p, u = subs[i]
            poems += p; tin += u.input_tokens; tout += u.output_tokens
        data = {"poems": poems, "_meta": {
            "group": base, "scan_ids": meta["scan_ids"], "pages": meta["pages"],
            "files": meta["files"], "subrequests": n, "model": T.MODEL,
            "prompt_version": T.PROMPT_VERSION, "input_tokens": tin, "output_tokens": tout,
            "batch_id": bid, "analyzed_at": NOW(), "status": "needs_review"}}
        with open(os.path.join(T.OUT_DIR, f"{base}.json"), "w") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        try:
            build_derivatives.build_group(base)
        except Exception as e:
            print(f"  ! {base}: image build failed ({e})")
        state["totals"]["ok"] += 1
        state["totals"]["in_tokens"] += tin
        state["totals"]["out_tokens"] += tout
        state["completed"].append({
            "group": base, "poems": len(poems), "pages": meta.get("pages"), "seconds": None,
            "in_tokens": tin, "out_tokens": tout,
            "titles": [(p.get("title_vi") or p.get("title") or "Không đề") for p in poems],
            "confidence": [p.get("confidence") for p in poems],
            "sensitivity": [(p.get("sensitivity") or {}).get("level") for p in poems],
        })
        state["totals"]["billed_usd"] = round(
            (state["totals"]["in_tokens"] * 5 + state["totals"]["out_tokens"] * 25) / 1e6 * 0.5, 4)
        state["totals"]["poems"] = sum(c["poems"] for c in state["completed"])
        state["totals"]["elapsed_s"] = round(time.time() - run_t0)
        T.write_progress(state)
    entry["status"] = "collected"
    save_manifest(state["_manifest"])


def base_state(groups, todo, chunks):
    done = sum(1 for g in groups if os.path.exists(os.path.join(T.OUT_DIR, f"{g}.json")))
    return {
        "status": "running", "mode": "batch", "started_at": NOW(),
        "model": T.MODEL, "prompt_version": T.PROMPT_VERSION,
        "total_groups": len(groups), "already_done": done,
        "queued": [g for g, _ in todo], "current": None, "completed": [], "failed": [],
        "batch": {"chunk": 0, "chunks": chunks, "batch_id": None, "status": None,
                  "counts": {"processing": 0, "succeeded": 0, "errored": 0}},
        "totals": {"ok": 0, "fail": 0, "in_tokens": 0, "out_tokens": 0,
                   "billed_usd": 0.0, "elapsed_s": 0, "poems": 0, "avg_seconds": 0},
    }


def cmd_status(client):
    """Cross-device: query every recorded batch and print + refresh the dashboard file."""
    entries = load_manifest()
    if not entries:
        print("No batches recorded yet."); return
    total_ok = total_err = total_proc = 0
    print(f"{'chunk':6} {'batch_id':30} {'status':12} succ/err/proc")
    for e in entries:
        b = client.messages.batches.retrieve(e["batch_id"])
        c = b.request_counts
        total_ok += c.succeeded; total_err += c.errored; total_proc += c.processing
        print(f"{e['chunk']:<6} {e['batch_id']:30} {b.processing_status:12} "
              f"{c.succeeded}/{c.errored}/{c.processing}")
    done_files = len([f for f in os.listdir(T.OUT_DIR) if f.endswith('.json')])
    print(f"\nrecorded batches: {len(entries)} | server succeeded={total_ok} errored={total_err} "
          f"processing={total_proc} | groups written to disk: {done_files}")
    print("Tip: raw batch status is also at console.anthropic.com → Batches.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chunk", type=int, default=30, help="(unused; batches now pack by size)")
    ap.add_argument("--maxmb", type=int, default=180, help="max payload MB per batch (256 is the API cap)")
    ap.add_argument("--force", action="store_true", help="re-analyze all groups, incl. already done")
    ap.add_argument("--limit", type=int, default=0, help="cap number of groups (0 = all)")
    ap.add_argument("--poll", type=int, default=20, help="seconds between batch status polls")
    ap.add_argument("--status", action="store_true", help="show batch progress from anywhere, then exit")
    args = ap.parse_args()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        sys.exit("Set ANTHROPIC_API_KEY first")
    import anthropic
    from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
    from anthropic.types.messages.batch_create_params import Request
    client = anthropic.Anthropic()
    os.makedirs(T.OUT_DIR, exist_ok=True)

    if args.status:
        cmd_status(client); return

    groups = T.load_groups()
    manifest = load_manifest()
    run_t0 = time.time()
    state = base_state(groups, [(g, groups[g]) for g in groups if not is_fresh(g)], 0)
    state["_manifest"] = manifest

    # Sittings already in an un-collected batch: collect (below), never resubmit — that's
    # double-spend. Lets us submit the REMAINING sittings in parallel without waiting.
    in_flight = {g for e in manifest if e.get("status") != "collected" for g in e.get("groups", {})}
    if in_flight:
        print(f"Resuming: {len(in_flight)} sittings already in flight — will collect, not resubmit.\n")

    # ---- SUBMIT: every sitting lacking a FRESH transcription and not already in flight. ----
    todo = [(g, rows) for g, rows in groups.items()
            if (args.force or not is_fresh(g)) and g not in in_flight]
    if args.limit:
        todo = todo[: args.limit]
    if not todo and not in_flight:
        state["status"] = "done"; T.write_progress(state)
        print("Nothing left to do — all sittings have fresh transcriptions."); return
    state["queued"] = [g for g, _ in todo] + sorted(in_flight)  # bar total = submit + collect
    print(f"Submitting {len(todo)} sittings, packed by payload size (≤{args.maxmb} MB/batch)\n")

    # ---- 2a) SUBMIT, packing groups into batches by BYTES (not count) — page counts vary
    #          3–64, so a fixed group count can blow the 256 MB batch limit. Each batch is
    #          recorded durably the instant it exists, and all process in PARALLEL server-side. ----
    LIMIT = args.maxmb * 1024 * 1024
    cur_reqs, cur_meta, cur_bytes = [], {}, 0

    def flush():
        nonlocal cur_reqs, cur_meta, cur_bytes
        if not cur_reqs:
            return
        batch = client.messages.batches.create(requests=cur_reqs)
        ci = len(manifest) + 1
        entry = {"batch_id": batch.id, "chunk": ci, "submitted_at": NOW(),
                 "status": "in_progress", "groups": cur_meta}
        manifest.append(entry)
        save_manifest(manifest)  # durable the instant a batch exists — survives a laptop change
        state["batch"].update({"chunk": ci, "batch_id": batch.id, "status": "submitted"})
        T.write_progress(state)
        print(f"chunk {ci}: batch {batch.id} submitted ({len(cur_reqs)} requests, "
              f"{len(cur_meta)} sittings, {cur_bytes//1024//1024} MB)")
        cur_reqs, cur_meta, cur_bytes = [], {}, 0

    def image_block(x):
        return {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": x}}

    for g, rows in todo:
        imgs = [png for r in rows for png in T.preprocess_frames(r["original_filename"])]
        b64 = [base64.standard_b64encode(b).decode() for b in imgs]
        payload = sum(len(x) for x in b64)  # base64 bytes ≈ dominant request size
        # keep a sitting's sub-requests together in one batch (so stitching is local to a batch)
        if cur_reqs and cur_bytes + payload > LIMIT:
            flush()
        # SUBDIVIDE: >20 pages would trip Anthropic's 2000px many-image cap. Split into
        # ≤20-page sub-requests so every page keeps full 2576px resolution.
        n_pages = len(b64)
        step = T.SUBDIVIDE_AT
        subs = (n_pages + step - 1) // step
        for si in range(subs):
            part = b64[si * step:(si + 1) * step]
            content = [image_block(x) for x in part]
            content.append({"type": "text", "text": T.USER_TEXT})
            mt = min(32000, max(8000, 3000 * len(part)))  # ~3k/page: headroom for dense bilingual poems
            cid = g if subs == 1 else f"{g}__{si}"  # '#' is illegal in custom_id; '__' is safe
            cur_reqs.append(Request(custom_id=cid, params=MessageCreateParamsNonStreaming(
                model=T.MODEL, max_tokens=mt, system=T.SYSTEM,
                output_config={"format": {"type": "json_schema", "schema": T.SCHEMA}},
                messages=[{"role": "user", "content": content}])))
        cur_meta[g] = {"scan_ids": [r["scan_id"] for r in rows], "pages": n_pages,
                       "files": len(rows), "subs": subs}
        cur_bytes += payload
    flush()
    state["batch"]["chunks"] = len(manifest)

    # ---- 2b) COLLECT: poll ALL batches each pass; collect whichever has ENDED first (don't
    #        block on a slow chunk). Transient API errors retry instead of killing the run. ----
    pending = [e for e in manifest if e.get("status") != "collected"]
    while pending:
        progressed = False
        for e in list(pending):
            b = _retry(lambda: client.messages.batches.retrieve(e["batch_id"]))
            if b is None:
                continue
            c = b.request_counts
            state["batch"].update({"batch_id": e["batch_id"], "chunk": e["chunk"],
                                   "status": b.processing_status,
                                   "counts": {"processing": c.processing, "succeeded": c.succeeded,
                                              "errored": c.errored}})
            state["totals"]["elapsed_s"] = round(time.time() - run_t0)
            T.write_progress(state)
            if b.processing_status == "ended":
                collect_results(client, e, state, run_t0)
                if e.get("status") == "collected":
                    pending.remove(e); progressed = True
                    print(f"  chunk {e['chunk']} collected — ok={state['totals']['ok']} "
                          f"fail={state['totals']['fail']} poems={state['totals']['poems']}")
        if pending and not progressed:
            time.sleep(args.poll)

    state["status"] = "done"; state["batch"]["status"] = "ended"
    state["totals"]["elapsed_s"] = round(time.time() - run_t0)
    T.write_progress(state)
    print(f"\nDONE — ok={state['totals']['ok']} fail={state['totals']['fail']} "
          f"poems={state['totals']['poems']} billed≈${state['totals']['billed_usd']:.2f}")


if __name__ == "__main__":
    main()
