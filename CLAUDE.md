# Ông Nội Poetry — project guide

A digital archive of ~hundreds–thousands of handwritten Vietnamese poems by the user's
grandfather ("Ông", signs **Thanh-Phụng / T.P.**). For each scan we produce a best-effort
**digital transcription** with **line-by-line English translation**, shown in a
[spacesleftblank.com](https://spacesleftblank.com)-style layout (minimalist serif, near-white
paper, `· · ·` dividers), with the **original scan below** (scroll down). Guests browse;
v2 adds auth + edit suggestions.

Repo: **github.com/floofydoug/Ong_Noi_Poetry** (currently **PUBLIC** — see Constraints).

## Key facts & decisions (don't re-learn these)

- **A "Set" = a *sitting*** — a session where Ông was asked to write out older work. NOT a theme,
  NOT one poem. `Set <number>` in the filename is the reliable sitting id.
- **414 = scans/TIFs (≈ pages), NOT poems.** A page often holds **multiple poems** (`set-102`
  → 2). True poem count is **likely many hundreds–thousands**. Transcription segments each page
  into an array of poems, splitting on **new title / new signature-date / separator**; a bare
  line break is *not* necessarily a new poem (`boundary_reason`/`boundary_confidence` record this).
- **Versions exist** — Ông rewrote poems across sittings. `scripts/find_variants.py` builds a
  reused-line index → `poem_relations` (possible-version pairs) for review.
- **Per-scan metadata is the source of truth**: title, date, place (e.g. *Lake Jackson 2009* →
  *Everett 2018*), author signature — all written on the page.
- **People & sensitivity (privacy):** capture references to family as **private, unresolved
  `mentions`** (relationship / name-as-written / life-event) — never guess real identities, never
  expose publicly. Each poem has `sensitivity` + `visibility` (public | family | private); Opus
  flags sensitive poems (divorce/conflict/illness about the living) → default **family**. Public
  site shows only `verified AND visibility='public'`. v2: family-curated `people` registry behind auth.
- **Duplicate-numbered scans** (`Set 5`/`005`, the ` 2` files like `Set 102 2`) are *different*
  sittings mislabeled with the same number → renumber during review. `A/B/C` suffixes ARE
  continuation pages of one sitting.
- **Mục lục (TOC)** scans `set-280a/b` are NOT a master key (numbering doesn't match Sets; big gaps).

## Current status

- ✅ 414 TIFs downloaded from iCloud → `originals/` (2.9 GB, gitignored).
- ✅ `data/originals-manifest.csv` — 414 rows, clean `scan_id`s, 18 flagged for review.
- ✅ Transcription pipeline works (Opus 4.8 vision, structured output). **~11 scans transcribed**
  (set-001…009, set-005-alt2, set-102). Captures: bilingual `lines`, title/date/place/author,
  `tags`, `marginalia`, `footnotes`, private `mentions`, `sensitivity`, `visibility`,
  `boundary_reason`, confidence/uncertain_spans. ~$0.048/scan → full run ≈ $20.
- ✅ Bilingual renderer + Playwright QA screenshots (`verification/`, gitignored).
- ✅ Supabase schema written (`supabase/migrations/0001_init.sql`) — NOT applied yet.
- ⏳ Not done: rest of the ~403 scans, variant pass at scale, Supabase project + loader,
  review admin, public Next.js site.

## Run commands

```bash
# one-time: deps + key
python3 -m venv .venv && ./.venv/bin/pip install anthropic pillow
# create .env with:  ANTHROPIC_API_KEY=sk-ant-...   (gitignored)

set -a && . ./.env && set +a                     # load key
./.venv/bin/python scripts/build_manifest.py      # rebuild manifest
./.venv/bin/python scripts/transcribe.py --limit 10        # transcribe (resumable)
./.venv/bin/python scripts/transcribe.py --only set-102 --force
./.venv/bin/python scripts/build_verification.py set-102   # render bilingual HTML
node scripts/screenshot.mjs set-102                        # Playwright screenshot
./.venv/bin/python scripts/find_variants.py                # version detection
```
Outputs: scans → `originals/`; LLM JSON → `data/transcriptions/`; pages → `verification/`.

## Data model (Supabase, condensed)

`sets`(sitting) → `poem_scans` ← `scans`(TIF); `poems` belong to a set, link to scans
(one scan→many poems, one poem→many pages). Plus `footnotes`, `marginalia`, `tags`+`poem_tags`.
PRIVATE: `poem_mentions`, `poem_relations` (versions). RLS: public reads only
`verified AND visibility='public'`; private tables never public. Full DDL in
`supabase/migrations/0001_init.sql`.

## Stack

Next.js static export → GitHub Pages (`basePath` for repo pages); Supabase Postgres + Storage
(+ Auth in v2); Python `.venv` for the transcription pipeline; Playwright for QA.

## Constraints & gotchas

- **Repo is PUBLIC.** `data/transcriptions/` is **gitignored** (holds private mentions). Consider
  `gh repo edit floofydoug/Ong_Noi_Poetry --visibility private`.
- **Never commit** `.env`, `originals/`, `.venv`, `node_modules/`, `verification/`.
- **No Docker locally** → use a **hosted** Supabase project (not local CLI).
- Anthropic account credits run out between runs — top up at console.anthropic.com.
- macOS shell is **zsh** (no unquoted-variable word-splitting — pass args explicitly).
- Many scans are **faint pencil / rotated 90°** → pipeline auto-orients + boosts contrast.
- **Pacing:** work in small named batches, commit as we go.

## Working agreement

Iterate slowly in small batches; commit each slice. Getting **title / date / set / poem
segmentation** correct is the top priority — everything flows through a human review gate
(only `verified` poems reach the public site).
