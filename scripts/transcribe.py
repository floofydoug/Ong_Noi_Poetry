#!/usr/bin/env python3
"""AI analysis of the poem scans — grouped by sitting, via the Batch API.

- Groups A/B/C continuation pages of one sitting into a SINGLE multi-image request
  (so poems that span pages aren't split). Duplicate-numbered scans stay separate.
- Uses the Anthropic Message Batches API (50% cheaper, offline-friendly).
- Logs parse/validation errors per request instead of crashing the run.
- Reports wall-clock timing + token usage, and extrapolates to all 298 groups.

Output: data/transcriptions/<group>.json  — the IMMUTABLE analysis for that sitting
(raw model output + provenance). One file per group; resumable (skips done groups).

Setup:  pip install anthropic pillow ; export ANTHROPIC_API_KEY=...
Run:    python3 scripts/transcribe.py --limit 5
"""
import argparse, base64, collections, csv, datetime, hashlib, io, json, os, re, sys, time

MANIFEST = "/Users/doug/ongs_poems/data/originals-manifest.csv"
ORIGINALS = "/Users/doug/ongs_poems/originals"
OUT_DIR = "/Users/doug/ongs_poems/data/transcriptions"
ERR_LOG = "/Users/doug/ongs_poems/data/analysis-errors.log"
MODEL = "claude-opus-4-8"
PROMPT_VERSION = "3-grouped"
MAX_EDGE = 2200
TOTAL_GROUPS = 298  # for extrapolation (from the manifest)

SYSTEM = (
    "You transcribe scanned, handwritten Vietnamese poems by a single author. "
    "Preserve EXACT Vietnamese diacritics and line breaks. Do not translate, "
    "modernize, or correct spelling. Mark any unreadable character as [?] and "
    "list those fragments in uncertain_spans. Pages may be rotated or faint. "
    "A page usually contains SEVERAL distinct poems — segment them all."
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


def preprocess(filename):
    from PIL import Image, ImageOps
    img = Image.open(os.path.join(ORIGINALS, filename))
    img = ImageOps.exif_transpose(img).convert("L")
    img = ImageOps.autocontrast(img, cutoff=1)
    w, h = img.size
    s = MAX_EDGE / max(w, h)
    if s < 1:
        img = img.resize((round(w * s), round(h * s)), Image.LANCZOS)
    buf = io.BytesIO(); img.save(buf, format="PNG"); return buf.getvalue()


def load_groups():
    rows = list(csv.DictReader(open(MANIFEST)))
    groups = collections.defaultdict(list)
    for r in rows:
        groups[group_id(r["scan_id"])].append(r)
    # order pages within a group (base before A/B/C), and groups by id
    for g in groups.values():
        g.sort(key=lambda r: r["scan_id"])
    return dict(sorted(groups.items()))


def log_err(msg):
    with open(ERR_LOG, "a") as f:
        f.write(f"{datetime.datetime.now().isoformat()}  {msg}\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=5, help="number of groups to process")
    ap.add_argument("--poll", type=int, default=15, help="seconds between batch status polls")
    args = ap.parse_args()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        sys.exit("Set ANTHROPIC_API_KEY first")
    import anthropic
    from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
    from anthropic.types.messages.batch_create_params import Request
    client = anthropic.Anthropic()
    os.makedirs(OUT_DIR, exist_ok=True)

    groups = load_groups()
    todo = [(g, rows) for g, rows in groups.items()
            if not os.path.exists(os.path.join(OUT_DIR, f"{g}.json"))][: args.limit]
    if not todo:
        print("Nothing to do — all selected groups already analyzed."); return
    done_count = sum(1 for g in groups if os.path.exists(os.path.join(OUT_DIR, f"{g}.json")))
    print(f"Groups total={len(groups)}  done={done_count}  running now={len(todo)}\n")

    # Build one batch request per group (multi-image).
    reqs, meta = [], {}
    for g, rows in todo:
        imgs = [preprocess(r["original_filename"]) for r in rows]
        sha = hashlib.sha256(b"".join(imgs)).hexdigest()[:16]
        content = [{"type": "image", "source": {"type": "base64", "media_type": "image/png",
                    "data": base64.standard_b64encode(b).decode()}} for b in imgs]
        content.append({"type": "text", "text": USER_TEXT})
        reqs.append(Request(custom_id=g, params=MessageCreateParamsNonStreaming(
            model=MODEL, max_tokens=8000, system=SYSTEM,
            output_config={"format": {"type": "json_schema", "schema": SCHEMA}},
            messages=[{"role": "user", "content": content}])))
        meta[g] = {"scan_ids": [r["scan_id"] for r in rows], "pages": len(rows), "images_sha": sha}
        print(f"  queued {g}  ({len(rows)} page{'s' if len(rows) > 1 else ''})")

    print("\nSubmitting batch…")
    t0 = time.time()
    batch = client.messages.batches.create(requests=reqs)
    print(f"  batch {batch.id} — polling every {args.poll}s")
    while True:
        b = client.messages.batches.retrieve(batch.id)
        c = b.request_counts
        if b.processing_status == "ended":
            break
        print(f"  … {b.processing_status}: processing={c.processing} succeeded={c.succeeded} errored={c.errored}")
        time.sleep(args.poll)
    elapsed = time.time() - t0
    print(f"  ended in {elapsed:.0f}s\n")

    tin = tout = ok = fail = 0
    for r in client.messages.batches.results(batch.id):
        g = r.custom_id
        if r.result.type != "succeeded":
            fail += 1; log_err(f"{g}: batch result {r.result.type}"); print(f"  ✗ {g}: {r.result.type}"); continue
        msg = r.result.message
        try:
            text = next(blk.text for blk in msg.content if blk.type == "text")
            data = json.loads(text)
            if "poems" not in data:
                raise ValueError("missing 'poems'")
        except Exception as e:
            fail += 1
            log_err(f"{g}: parse error: {e} :: {(text[:300] if 'text' in dir() else '')!r}")
            print(f"  ✗ {g}: parse error ({e})"); continue
        ui, uo = msg.usage.input_tokens, msg.usage.output_tokens
        tin += ui; tout += uo; ok += 1
        data["_meta"] = {
            "group": g, **meta[g], "model": MODEL, "prompt_version": PROMPT_VERSION,
            "input_tokens": ui, "output_tokens": uo, "batch_id": batch.id,
            "analyzed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "status": "needs_review",
        }
        with open(os.path.join(OUT_DIR, f"{g}.json"), "w") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        n = len(data.get("poems", []))
        print(f"  ✓ {g}: {n} poem(s)  in/out={ui}/{uo}")

    # ---- report ----
    billed = (tin * 5 + tout * 25) / 1e6 * 0.5  # batch = 50% off
    print(f"\n=== run report ===")
    print(f"  groups ok={ok} fail={fail}  wall-clock={elapsed:.0f}s")
    print(f"  tokens: in={tin:,} out={tout:,}  billed≈${billed:.3f} (Batch API, 50% off)")
    if ok:
        avg_in, avg_out = tin / ok, tout / ok
        full = (avg_in * 5 + avg_out * 25) / 1e6 * 0.5 * TOTAL_GROUPS
        print(f"  per-group avg: in={avg_in:.0f} out={avg_out:.0f}")
        print(f"  EXTRAPOLATION to all {TOTAL_GROUPS} groups: ≈${full:.2f} billed")
        print(f"    (time: Batch API runs requests in parallel — a single {TOTAL_GROUPS}-group batch")
        print(f"     typically finishes well under an hour, NOT {elapsed/ok*TOTAL_GROUPS/60:.0f} min linearly)")
    if fail:
        print(f"  see {ERR_LOG} for failures")


if __name__ == "__main__":
    main()
