# Pipeline — setup & run

Model: SET (a sitting) → PAGE(s)/scans → POEM(s). See `../data/originals-manifest.csv`.

## 1. Manifest (done)
`python3 scripts/build_manifest.py` → `data/originals-manifest.csv` (414 rows, 18 flagged).

## 2. AI transcription drafts
```bash
pip install anthropic pillow
export ANTHROPIC_API_KEY=sk-ant-...
python3 scripts/transcribe.py --limit 5     # sanity-check a few, inspect data/transcriptions/*.json
python3 scripts/transcribe.py               # full run (resumable; ~$15–20 on Opus 4.8)
```
Each scan → `data/transcriptions/<scan_id>.json`: an array of poems (title/date/place/
author/transcription/confidence/uncertain_spans) + `_meta` (set_number, page, status=needs_review).
Preprocessing auto-orients + boosts contrast for faint/rotated scans.

## 3. Supabase (hosted — no Docker needed locally)
1. Create a free project at supabase.com → note the **Project URL**, **anon key**, **service_role key**.
2. Apply the schema: paste `supabase/migrations/0001_init.sql` into the Supabase SQL editor
   (or `npx supabase db push` after `npx supabase link`).
3. Loader (next to build): `scripts/load_to_supabase.py` reads `data/transcriptions/*.json`,
   upserts `sets` / `scans` / `poems` / `poem_scans` using the service_role key.

## 4. Review (the metadata gate)
Local Next.js admin (`next dev`) shows each scan beside its draft; you confirm title/date/
set + page grouping, fix duplicate-numbered sittings, then mark `verified`. Only `verified`
poems reach the public site.

## 5. Assets + public site
`scripts/ingest-assets.ts` (sharp): TIF → web JPEG/thumb → Supabase Storage. Next.js static
export pulls verified poems at build time → GitHub Pages.
