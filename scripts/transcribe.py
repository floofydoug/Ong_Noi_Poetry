#!/usr/bin/env python3
"""AI analysis of the poem scans — grouped by sitting, SYNCHRONOUS (one call per group).

- Groups A/B/C continuation pages of one sitting into a SINGLE multi-image request
  (so poems that span pages aren't split). Duplicate-numbered scans stay separate.
- Calls the Messages API one group at a time (streamed) so timing is PREDICTABLE
  (~steady seconds per group) and files land immediately — no async batch queue.
  Full price (no 50% batch discount); the tradeoff we chose for predictability.
- Logs parse/validation/API errors per group instead of crashing the run.
- Reports wall-clock timing + token usage, and extrapolates to all 298 groups.

Output: data/transcriptions/<group>.json  — the IMMUTABLE analysis for that sitting
(raw model output + provenance). One file per group; resumable (skips done groups).

Setup:  pip install anthropic pillow ; export ANTHROPIC_API_KEY=...
Run:    python3 scripts/transcribe.py --limit 5
"""
import argparse, base64, collections, csv, datetime, hashlib, io, json, os, re, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_derivatives  # reuse the web-JPEG builder so images land with the analysis

MANIFEST = "/Users/doug/ongs_poems/data/originals-manifest.csv"
ORIGINALS = "/Users/doug/ongs_poems/originals"
OUT_DIR = "/Users/doug/ongs_poems/data/transcriptions"
ERR_JSON = "/Users/doug/ongs_poems/data/analysis-errors.json"
PROGRESS_JSON = "/Users/doug/ongs_poems/data/analysis-progress.json"  # live run state for the UI
MODEL = "claude-opus-4-8"
PROMPT_VERSION = "3-grouped"
MAX_EDGE = 2576  # Opus 4.8 high-res tier native max (2576px / 4784 visual tokens). For sittings
                 # with >20 pages we subdivide into ≤20-image sub-requests so this full res is kept
                 # (the 2000px cap only applies to requests with >20 images). See transcribe_batch.py.
SUBDIVIDE_AT = 10  # max images per request. ≤20 keeps full 2576px res; 10 also keeps each
                   # request's JSON output well under the token cap (20 was truncating dense sittings).
TOTAL_GROUPS = 298  # for extrapolation (from the manifest)

# Real family names are PRIVATE — kept in a gitignored local file, injected at runtime
# so they never appear in this public script. Absent file → the hint is simply omitted.
FAMILY_NAMES_FILE = "/Users/doug/ongs_poems/data/family-names.local.json"


def family_hint():
    try:
        names = json.load(open(FAMILY_NAMES_FILE)).get("grandchildren") or []
    except Exception:
        return ""
    if not names:
        return ""
    return (
        "\n\nKNOWN FAMILY NAMES (the author's grandchildren) — when a scrawled or "
        "unclear word plausibly matches one of these, prefer the known spelling "
        "rather than guessing a common word or marking it [?]: "
        + ", ".join(names) + ". Apply the diacritics you actually see. Whenever one "
        "appears, capture it in that poem's `mentions` with relationship='grandchild' "
        "and name_as_written set to exactly how it is spelled on the page."
    )


SYSTEM = (
    "You transcribe scanned, handwritten Vietnamese poems by a single author. "
    "Preserve EXACT Vietnamese diacritics and line breaks. Do not translate, "
    "modernize, or correct spelling. Mark any unreadable character as [?] and "
    "list those fragments in uncertain_spans. Pages may be rotated or faint. "
    "A page usually contains SEVERAL distinct poems — segment them all.\n\n"
    "THE AUTHOR/POET always signs these. His name is 'Thanh-Phùng' (dấu HUYỀN on the u → ù) — "
    "when the full name is spelled out, render it 'Thanh-Phùng', NOT Phụng/Phượng/Phương/Phong. "
    "He also signs with initials 'T.P.' or his dharma name 'Chánh Tuệ Minh' — keep those as written. "
    "His wife co-signs some poems as 'Chân/Chơn Phổ Phước' / 'Lê Thị Phong' — she is a DIFFERENT "
    "person; never merge her name into his."
    + family_hint()
)

# (schema identical to the per-poem structure we settled on)
SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["poems", "page_notes"],
    "properties": {
        "poems": {"type": "array", "items": {
            "type": "object", "additionalProperties": False,
            "required": ["title", "title_vi", "date_text", "place", "author", "lines",
                         "tags", "marginalia", "footnotes", "boundary_reason",
                         "boundary_confidence", "mentions", "sensitivity", "visibility",
                         "confidence", "uncertain_spans", "notes"],
            "properties": {
                "title": {"type": ["string", "null"]},
                "title_vi": {"type": ["string", "null"]},
                "date_text": {"type": ["string", "null"]},
                "place": {"type": ["string", "null"]},
                "author": {"type": ["string", "null"]},
                "lines": {"type": "array", "items": {
                    "type": "object", "additionalProperties": False,
                    "required": ["vi", "en"],
                    "properties": {"vi": {"type": "string"}, "en": {"type": "string"}}}},
                "tags": {"type": "array", "items": {"type": "string"}},
                "marginalia": {"type": "array", "items": {
                    "type": "object", "additionalProperties": False,
                    "required": ["kind", "text", "translation"],
                    "properties": {
                        "kind": {"type": "string", "enum": ["insertion", "strikethrough",
                                 "correction", "side_note", "doodle", "other"]},
                        "text": {"type": "string"},
                        "translation": {"type": ["string", "null"]}}}},
                "footnotes": {"type": "array", "items": {
                    "type": "object", "additionalProperties": False,
                    "required": ["anchor", "note"],
                    "properties": {"anchor": {"type": "string"}, "note": {"type": "string"}}}},
                "boundary_reason": {"type": "string",
                    "enum": ["title", "signature", "separator", "gap", "only-poem"]},
                "boundary_confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                "mentions": {"type": "array", "items": {
                    "type": "object", "additionalProperties": False,
                    "required": ["relationship", "name_as_written", "life_event"],
                    "properties": {
                        "relationship": {"type": ["string", "null"]},
                        "name_as_written": {"type": ["string", "null"]},
                        "life_event": {"type": ["string", "null"]}}}},
                "sensitivity": {"type": "object", "additionalProperties": False,
                    "required": ["level", "reason"],
                    "properties": {"level": {"type": "string", "enum": ["none", "low", "medium", "high"]},
                                   "reason": {"type": ["string", "null"]}}},
                "visibility": {"type": "string", "enum": ["public", "family", "private"]},
                "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                "uncertain_spans": {"type": "array", "items": {"type": "string"}},
                "notes": {"type": ["string", "null"]},
            }}},
        "page_notes": {"type": ["string", "null"]},
    },
}

USER_TEXT = (
    "The image(s) below are consecutive pages of ONE sitting, in order. A poem may "
    "continue from one page onto the next — treat continued text as the SAME poem. "
    "Transcribe EVERY poem across ALL pages, returning one array entry per distinct poem.\n\n"
    "For each poem: extract any title, date, place, and author signature (null if absent). "
    "Give `lines`: an ordered array of {vi, en} — `vi` is one line of Vietnamese with EXACT "
    "diacritics, `en` a faithful English translation of that line; empty {vi:'',en:''} marks a "
    "stanza break. Mark unreadable chars [?] and list them in uncertain_spans.\n\n"
    "Start a NEW poem only at a new title, a new signature/date, or a clear separator — not at "
    "a mere stanza break; when unsure prefer splitting with boundary_confidence='low'. Set "
    "boundary_reason on every poem.\n\n"
    "Capture every scribble/edit/strike-through/doodle in `marginalia`; assign 3-8 `tags`; add "
    "`footnotes` only where you genuinely understand something worth explaining. In `mentions` "
    "list family members referenced (relationship, name-as-written, life-event) WITHOUT guessing "
    "identities; set `sensitivity` (raise for divorce/conflict/illness about the living) and a "
    "suggested `visibility` ('family' when sensitive, else 'public'). Do not guess set membership."
)


def group_id(scan_id):
    m = re.match(r"^(set-\d+)([a-z])?(-.*)?$", scan_id)
    base, letter, suffix = m.groups()
    return scan_id if suffix else base


def preprocess_frames(filename):
    """A .tif is a MULTI-PAGE scan (one sitting) — return a PNG for EVERY frame, in
    order. Reading only frame 0 dropped ~92% of the archive's pages."""
    from PIL import Image, ImageOps
    im = Image.open(os.path.join(ORIGINALS, filename))
    out = []
    for i in range(getattr(im, "n_frames", 1)):
        im.seek(i)
        img = ImageOps.exif_transpose(im.copy()).convert("L")
        img = ImageOps.autocontrast(img, cutoff=1)
        w, h = img.size
        s = MAX_EDGE / max(w, h)
        if s < 1:
            img = img.resize((round(w * s), round(h * s)), Image.LANCZOS)
        buf = io.BytesIO(); img.save(buf, format="PNG"); out.append(buf.getvalue())
    return out


def load_groups():
    rows = list(csv.DictReader(open(MANIFEST)))
    groups = collections.defaultdict(list)
    for r in rows:
        groups[group_id(r["scan_id"])].append(r)
    # order pages within a group (base before A/B/C), and groups by id
    for g in groups.values():
        g.sort(key=lambda r: r["scan_id"])
    return dict(sorted(groups.items()))


def log_err(rec):
    """Append a structured error record to data/analysis-errors.json."""
    rec = {"timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(), **rec}
    errs = []
    if os.path.exists(ERR_JSON):
        try:
            errs = json.load(open(ERR_JSON))
        except Exception:
            errs = []
    errs.append(rec)
    json.dump(errs, open(ERR_JSON, "w"), ensure_ascii=False, indent=2)


def write_progress(state):
    """Atomically write live run state so the UI can poll it while we work."""
    state["updated_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    tmp = PROGRESS_JSON + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)
    os.replace(tmp, PROGRESS_JSON)  # atomic — the UI never reads a half-written file


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=5, help="number of groups to process")
    ap.add_argument("--only", help="comma-separated group ids to (re)process, e.g. set-052,set-010")
    ap.add_argument("--force", action="store_true", help="re-analyze even if a json already exists")
    args = ap.parse_args()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        sys.exit("Set ANTHROPIC_API_KEY first")
    import anthropic
    client = anthropic.Anthropic()
    os.makedirs(OUT_DIR, exist_ok=True)

    groups = load_groups()
    if args.only:
        want = {g.strip() for g in args.only.split(",")}
        todo = [(g, rows) for g, rows in groups.items() if g in want]
    else:
        todo = [(g, rows) for g, rows in groups.items()
                if args.force or not os.path.exists(os.path.join(OUT_DIR, f"{g}.json"))][: args.limit]
    if not todo:
        print("Nothing to do — all selected groups already analyzed."); return
    done_count = sum(1 for g in groups if os.path.exists(os.path.join(OUT_DIR, f"{g}.json")))
    print(f"Groups total={len(groups)}  done={done_count}  running now={len(todo)}\n")

    print("Processing synchronously — one group at a time, streamed.\n")
    tin = tout = ok = fail = 0
    times = []
    run_t0 = time.time()
    state = {
        "status": "running",
        "started_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "model": MODEL, "prompt_version": PROMPT_VERSION,
        "total_groups": len(groups), "already_done": done_count,
        "limit": args.limit, "mode": "synchronous",
        "queued": [g for g, _ in todo], "current": None,
        "completed": [], "failed": [],
        "totals": {"ok": 0, "fail": 0, "in_tokens": 0, "out_tokens": 0,
                   "billed_usd": 0.0, "elapsed_s": 0, "poems": 0, "avg_seconds": 0},
    }
    write_progress(state)

    for i, (g, rows) in enumerate(todo):
        state["current"] = {"group": g, "index": i + 1, "of": len(todo),
                            "pages": len(rows), "started_at":
                            datetime.datetime.now(datetime.timezone.utc).isoformat()}
        state["totals"]["elapsed_s"] = round(time.time() - run_t0)
        write_progress(state)

        # every frame of every scan in this sitting, in order
        imgs = [png for r in rows for png in preprocess_frames(r["original_filename"])]
        b64 = [base64.standard_b64encode(b).decode() for b in imgs]
        sha = hashlib.sha256(b"".join(imgs)).hexdigest()[:16]
        scan_ids = [r["scan_id"] for r in rows]

        # SUBDIVIDE dense sittings into ≤SUBDIVIDE_AT-page requests (keeps full 2576px res and
        # avoids output truncation), streaming each, then STITCH poems back in page order.
        nsub = (len(b64) + SUBDIVIDE_AT - 1) // SUBDIVIDE_AT
        t0 = time.time(); poems = []; ui = uo = 0; err = None
        for si in range(nsub):
            part = b64[si * SUBDIVIDE_AT:(si + 1) * SUBDIVIDE_AT]
            content = [{"type": "image", "source": {"type": "base64", "media_type": "image/png",
                        "data": x}} for x in part]
            content.append({"type": "text", "text": USER_TEXT})
            mt = min(32000, max(8000, 3000 * len(part)))
            try:
                with client.messages.stream(
                    model=MODEL, max_tokens=mt, system=SYSTEM,
                    output_config={"format": {"type": "json_schema", "schema": SCHEMA}},
                    messages=[{"role": "user", "content": content}],
                ) as stream:
                    msg = stream.get_final_message()
                text = next(blk.text for blk in msg.content if blk.type == "text")
                d = json.loads(text)
                if "poems" not in d:
                    raise ValueError("missing 'poems'")
                poems += d["poems"]; ui += msg.usage.input_tokens; uo += msg.usage.output_tokens
            except Exception as e:
                err = e
                log_err({"group": g, "sub": si, "scan_ids": scan_ids, "kind": "parse_error",
                         "error": str(e), "stop_reason": getattr(locals().get("msg", None), "stop_reason", None)})
                break
        dt = time.time() - t0

        if err is not None:
            fail += 1
            state["failed"].append({"group": g, "kind": "sub_failed", "error": str(err)})
            state["totals"]["fail"] = fail; state["current"] = None; write_progress(state)
            print(f"  ✗ {g}: {err}"); continue

        tin += ui; tout += uo; ok += 1; times.append(dt)
        data = {"poems": poems, "_meta": {
            "group": g, "scan_ids": scan_ids, "pages": len(imgs), "files": len(rows),
            "subrequests": nsub, "images_sha": sha, "model": MODEL,
            "prompt_version": PROMPT_VERSION, "input_tokens": ui, "output_tokens": uo,
            "analyzed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "status": "needs_review"}}
        with open(os.path.join(OUT_DIR, f"{g}.json"), "w") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        # Build the web display JPEG immediately so the poem is never imageless.
        try:
            build_derivatives.build_group(g)
        except Exception as e:
            print(f"  ! {g}: analysis saved but image build failed ({e})")
        poems = data.get("poems", [])
        n = len(poems)
        state["completed"].append({
            "group": g, "poems": n, "pages": len(imgs), "seconds": round(dt),
            "in_tokens": ui, "out_tokens": uo,
            "titles": [(p.get("title_vi") or p.get("title") or "Không đề") for p in poems],
            "confidence": [p.get("confidence") for p in poems],
            "sensitivity": [(p.get("sensitivity") or {}).get("level") for p in poems],
        })
        state["current"] = None
        state["totals"].update({
            "ok": ok, "fail": fail, "in_tokens": tin, "out_tokens": tout,
            "billed_usd": round((tin * 5 + tout * 25) / 1e6, 4),
            "elapsed_s": round(time.time() - run_t0),
            "poems": sum(c["poems"] for c in state["completed"]),
            "avg_seconds": round(sum(times) / len(times)) if times else 0,
        })
        write_progress(state)
        print(f"  ✓ {g}: {n} poem(s)  {dt:.0f}s  in/out={ui}/{uo}")
    elapsed = time.time() - run_t0
    state["status"] = "done"; state["current"] = None
    state["totals"]["elapsed_s"] = round(elapsed)
    write_progress(state)

    # ---- report ----
    billed = (tin * 5 + tout * 25) / 1e6  # synchronous = full price (no batch discount)
    print(f"\n=== run report ===")
    print(f"  groups ok={ok} fail={fail}  wall-clock={elapsed:.0f}s")
    print(f"  tokens: in={tin:,} out={tout:,}  billed≈${billed:.3f} (synchronous, full price)")
    if ok:
        avg_in, avg_out = tin / ok, tout / ok
        avg_t = sum(times) / len(times)
        full = (avg_in * 5 + avg_out * 25) / 1e6 * TOTAL_GROUPS
        print(f"  per-group avg: {avg_t:.0f}s  in={avg_in:.0f} out={avg_out:.0f}")
        print(f"  EXTRAPOLATION to all {TOTAL_GROUPS} groups: "
              f"≈${full:.2f} billed, ≈{avg_t * TOTAL_GROUPS / 60:.0f} min sequential")
    if fail:
        print(f"  {fail} failure(s) logged to {ERR_JSON}")


if __name__ == "__main__":
    main()
