#!/usr/bin/env python3
"""AI/OCR transcription of grandfather's poem scans.

Reads data/originals-manifest.csv, preprocesses each TIF (auto-orient + grayscale
+ contrast boost + downscale), sends it to Claude vision, and writes one JSON
draft per scan to data/transcriptions/. Resumable: skips scans already done.

Per-scan metadata is the source of truth — title/date/place/author are written on
each page. A page may hold MULTIPLE poems (e.g. Set 102), so the model returns an
array. It does NOT guess themed-set membership (a human assigns that during review).

Setup:
    pip install anthropic pillow
    export ANTHROPIC_API_KEY=sk-ant-...
Run:
    python3 scripts/transcribe.py --limit 5      # try a handful first
    python3 scripts/transcribe.py                # full run
"""
import argparse, base64, csv, io, json, os, sys, time

MANIFEST = "/Users/doug/ongs_poems/data/originals-manifest.csv"
ORIGINALS = "/Users/doug/ongs_poems/originals"
OUT_DIR = "/Users/doug/ongs_poems/data/transcriptions"
MODEL = "claude-opus-4-8"
MAX_EDGE = 2200  # px; Opus 4.8 supports up to 2576 — keep headroom, control cost

SYSTEM = (
    "You transcribe scanned, handwritten Vietnamese poems by a single author. "
    "Preserve EXACT Vietnamese diacritics and line breaks. Do not translate, "
    "modernize, or correct spelling. Mark any unreadable character as [?] and "
    "list those fragments in uncertain_spans. The page may be rotated or faint. "
    "A single page usually contains SEVERAL distinct poems — segment them all."
)

# Structured-output schema: one page -> array of poems.
SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["poems", "page_notes"],
    "properties": {
        "poems": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["title", "title_vi", "date_text", "place",
                             "author", "lines", "tags", "marginalia",
                             "footnotes", "boundary_reason", "boundary_confidence",
                             "mentions", "sensitivity", "visibility",
                             "confidence", "uncertain_spans", "notes"],
                "properties": {
                    "title": {"type": ["string", "null"],
                              "description": "Title as written (may be English or Vietnamese); null if untitled"},
                    "title_vi": {"type": ["string", "null"],
                                 "description": "Vietnamese title with full diacritics, if present"},
                    "date_text": {"type": ["string", "null"],
                                  "description": "Date exactly as written, e.g. '08-09-2018'"},
                    "place": {"type": ["string", "null"],
                              "description": "Place written on the page, e.g. 'Everett', 'Lake Jackson'"},
                    "author": {"type": ["string", "null"],
                               "description": "Signature/initials, e.g. 'Thanh-Phụng' or 'T.P.'"},
                    "lines": {
                        "type": "array",
                        "description": "Ordered poem lines; each Vietnamese line paired with a faithful line-by-line English translation. Empty vi+en marks a stanza break.",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["vi", "en"],
                            "properties": {
                                "vi": {"type": "string", "description": "One line of Vietnamese, exact diacritics; '' for a stanza break; mark unreadable chars [?]"},
                                "en": {"type": "string", "description": "Faithful, natural English translation of this same line; '' for a stanza break"},
                            },
                        },
                    },
                    "tags": {
                        "type": "array",
                        "description": "3-8 lowercase-kebab tags: themes/motifs (e.g. 'home', 'exile', 'family', 'faith', 'aging', 'gratitude', 'vietnam') AND structural flags (e.g. 'untitled', 'has-strikethrough', 'has-marginalia', 'bilingual-title').",
                        "items": {"type": "string"},
                    },
                    "marginalia": {
                        "type": "array",
                        "description": "Every scribble, edit, or mark on the page that is NOT part of the clean poem text.",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["kind", "text", "translation"],
                            "properties": {
                                "kind": {"type": "string",
                                         "enum": ["insertion", "strikethrough", "correction",
                                                  "side_note", "doodle", "other"]},
                                "text": {"type": "string", "description": "The mark transcribed (Vietnamese, exact diacritics; [?] if unreadable)"},
                                "translation": {"type": ["string", "null"], "description": "English translation, or null if not text"},
                            },
                        },
                    },
                    "footnotes": {
                        "type": "array",
                        "description": "Explanatory footnotes ONLY where you genuinely understand something worth noting — a cultural/religious reference, the meaning of an edit, an idiom, or a likely reading of an unclear word. Omit if you'd just be guessing.",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["anchor", "note"],
                            "properties": {
                                "anchor": {"type": "string", "description": "The exact Vietnamese word/phrase/line the note refers to"},
                                "note": {"type": "string", "description": "Concise English explanation"},
                            },
                        },
                    },
                    "boundary_reason": {"type": "string",
                                        "enum": ["title", "signature", "separator", "gap", "only-poem"],
                                        "description": "What marks this as its own poem on the page"},
                    "boundary_confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                    "mentions": {
                        "type": "array",
                        "description": "PRIVATE. People the poem refers to. Do NOT guess real identities.",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["relationship", "name_as_written", "life_event"],
                            "properties": {
                                "relationship": {"type": ["string", "null"], "description": "e.g. 'daughter', 'grandchild', 'wife', 'in-law'"},
                                "name_as_written": {"type": ["string", "null"], "description": "Name/initials exactly as written, or null"},
                                "life_event": {"type": ["string", "null"], "description": "e.g. 'divorce', 'marriage', 'illness', 'emigration', 'death'"},
                            },
                        },
                    },
                    "sensitivity": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["level", "reason"],
                        "description": "How sensitive for LIVING family; raise for divorce/conflict/illness.",
                        "properties": {
                            "level": {"type": "string", "enum": ["none", "low", "medium", "high"]},
                            "reason": {"type": ["string", "null"]},
                        },
                    },
                    "visibility": {"type": "string", "enum": ["public", "family", "private"],
                                   "description": "Suggested default; use 'family' for sensitive content about the living"},
                    "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                    "uncertain_spans": {"type": "array", "items": {"type": "string"}},
                    "notes": {"type": ["string", "null"]},
                },
            },
        },
        "page_notes": {"type": ["string", "null"],
                       "description": "Page-level observations (rotation, damage, table-of-contents, etc.)"},
    },
}

USER_TEXT = (
    "Transcribe every poem on this page. Return an array — one entry per distinct "
    "poem. For each: extract any title, date, place, and author signature written "
    "on the page (null if absent). Then give `lines`: an ordered array where each "
    "entry has `vi` (one line of the Vietnamese, EXACT diacritics) and `en` (a "
    "faithful, natural English translation of that same line). Use an empty "
    "{vi:'', en:''} entry to mark a stanza break. Mark unreadable Vietnamese "
    "characters as [?] and list them in uncertain_spans. Do not guess which set "
    "(sitting) this belongs to.\n\n"
    "SEGMENTATION — a single page very often holds SEVERAL distinct poems; return ALL "
    "of them as separate array entries. Start a NEW poem at: a new title, a new "
    "signature/date (e.g. another 'T.P.' + place), or a clear separator (a drawn rule, "
    "a large blank gap, or '· · ·'). A plain stanza/line break is NOT by itself a new "
    "poem — keep stanzas of one poem together. When a boundary is ambiguous, PREFER "
    "splitting and set boundary_confidence='low'. Set boundary_reason on every poem.\n\n"
    "PRIVATE metadata: in `mentions`, list family members the poem refers to "
    "(relationship, name-as-written, life-event) WITHOUT guessing real identities. Set "
    "`sensitivity` (raise it for divorce, family conflict, or illness involving living "
    "people) and a suggested `visibility` ('family' when sensitive, else 'public').\n\n"
    "ALSO capture everything else on the page: every scribble, struck-through word, "
    "inserted word/caret, correction, side-note, or doodle goes in `marginalia` "
    "(with its kind). Assign 3-8 `tags` (themes + structural flags). Add `footnotes` "
    "only where you genuinely understand something worth explaining (a cultural or "
    "religious reference, what an edit changed, an idiom, a likely reading of an "
    "unclear word) — omit footnotes you would only be guessing at."
)


def preprocess(path: str) -> bytes:
    """Auto-orient, grayscale, boost contrast, downscale -> PNG bytes."""
    from PIL import Image, ImageOps
    img = Image.open(path)
    img = ImageOps.exif_transpose(img)        # honor EXIF rotation
    img = img.convert("L")                     # grayscale
    img = ImageOps.autocontrast(img, cutoff=1)  # lift faint pencil
    w, h = img.size
    scale = MAX_EDGE / max(w, h)
    if scale < 1:
        img = img.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def load_manifest():
    with open(MANIFEST, newline="") as f:
        return list(csv.DictReader(f))


def transcribe_one(client, row):
    png = preprocess(os.path.join(ORIGINALS, row["original_filename"]))
    b64 = base64.standard_b64encode(png).decode()
    resp = client.messages.create(
        model=MODEL,
        max_tokens=4096,
        system=SYSTEM,
        output_config={"format": {"type": "json_schema", "schema": SCHEMA}},
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64",
                                             "media_type": "image/png", "data": b64}},
                {"type": "text", "text": USER_TEXT},
            ],
        }],
    )
    text = next(b.text for b in resp.content if b.type == "text")
    data = json.loads(text)
    data["_meta"] = {
        "scan_id": row["scan_id"],
        "original_filename": row["original_filename"],
        "set_number": row["set_number"],
        "page": row["page"],
        "manifest_note": row["note"],
        "model": MODEL,
        "status": "needs_review",
        "input_tokens": resp.usage.input_tokens,
        "output_tokens": resp.usage.output_tokens,
    }
    return data


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, help="process at most N scans")
    ap.add_argument("--only", help="single scan_id to (re)process")
    ap.add_argument("--force", action="store_true", help="redo even if output exists")
    args = ap.parse_args()

    if not os.environ.get("ANTHROPIC_API_KEY"):
        sys.exit("Set ANTHROPIC_API_KEY first (export ANTHROPIC_API_KEY=sk-ant-...)")
    import anthropic
    client = anthropic.Anthropic()
    os.makedirs(OUT_DIR, exist_ok=True)

    rows = load_manifest()
    if args.only:
        rows = [r for r in rows if r["scan_id"] == args.only]
    done = skipped = 0
    for row in rows:
        out = os.path.join(OUT_DIR, f"{row['scan_id']}.json")
        if os.path.exists(out) and not args.force:
            skipped += 1
            continue
        if args.limit and done >= args.limit:
            break
        try:
            data = transcribe_one(client, row)
            with open(out, "w") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            n = len(data.get("poems", []))
            print(f"✓ {row['scan_id']}: {n} poem(s)")
            done += 1
        except Exception as e:  # keep going; rerun picks up failures
            print(f"✗ {row['scan_id']}: {e}", file=sys.stderr)
        time.sleep(0.2)  # gentle pacing
    print(f"\nDone. transcribed={done} skipped(existing)={skipped}")


if __name__ == "__main__":
    main()
