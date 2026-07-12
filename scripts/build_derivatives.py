#!/usr/bin/env python3
"""Build web display JPEGs from the original TIFs, one per transcription GROUP.

The site serves a single image per group at web/public/scans/<group>.jpg. A group
may span several pages (A/B/C continuation scans) — those are stacked vertically
into one tall JPEG so every page is visible. Auto-orients + boosts contrast to
match what the analysis pipeline sees.

Run:  ./.venv/bin/python scripts/build_derivatives.py            # only missing
      ./.venv/bin/python scripts/build_derivatives.py --force    # rebuild all
      ./.venv/bin/python scripts/build_derivatives.py --only set-032
"""
import argparse, csv, glob, json, os
from PIL import Image, ImageOps

MANIFEST = "/Users/doug/ongs_poems/data/originals-manifest.csv"
ORIGINALS = "/Users/doug/ongs_poems/originals"
TRANSCRIPTIONS = "/Users/doug/ongs_poems/data/transcriptions"
OUT_DIR = "/Users/doug/ongs_poems/web/public/scans"
ROTATIONS = "/Users/doug/ongs_poems/data/scan-rotations.json"  # user rotations to re-apply
MAX_EDGE = 1600      # long-edge cap for a single page
GAP = 24             # white gap between stacked pages
QUALITY = 85


def load_rotations():
    try:
        return json.load(open(ROTATIONS))
    except Exception:
        return {}


def load_manifest():
    return {r["scan_id"]: r["original_filename"]
            for r in csv.DictReader(open(MANIFEST))}


def _prep(img):
    img = ImageOps.exif_transpose(img).convert("RGB")
    img = ImageOps.autocontrast(img, cutoff=1)
    w, h = img.size
    s = MAX_EDGE / max(w, h)
    if s < 1:
        img = img.resize((round(w * s), round(h * s)), Image.LANCZOS)
    return img


def render_pages(filename):
    """A single .tif is a MULTI-PAGE scan (one sitting) — return EVERY frame, in order.
    Reading only frame 0 (the old bug) dropped ~92% of the archive's pages."""
    im = Image.open(os.path.join(ORIGINALS, filename))
    out = []
    for i in range(getattr(im, "n_frames", 1)):
        im.seek(i)
        out.append(_prep(im.copy()))
    return out


def stack(pages):
    """Vertically stack page images on a white canvas (centered)."""
    if len(pages) == 1:
        return pages[0]
    width = max(p.width for p in pages)
    height = sum(p.height for p in pages) + GAP * (len(pages) - 1)
    canvas = Image.new("RGB", (width, height), (255, 255, 255))
    y = 0
    for p in pages:
        canvas.paste(p, ((width - p.width) // 2, y))
        y += p.height + GAP
    # JPEG/PNG max dimension is 65500px — a 50+ page vertical stack overflows it. Scale to fit.
    MAXDIM = 65000
    if canvas.height > MAXDIM:
        s = MAXDIM / canvas.height
        canvas = canvas.resize((max(1, round(width * s)), MAXDIM), Image.LANCZOS)
    return canvas


def group_scan_ids(group):
    """Pages of a group come from its transcription _meta (authoritative order)."""
    meta = json.load(open(os.path.join(TRANSCRIPTIONS, f"{group}.json")))["_meta"]
    return meta.get("scan_ids") or [group]


def build_group(group, manifest=None, rotations=None, force=True):
    """Build web/public/scans/<group>.jpg from the original TIF(s). Returns True on
    success. Reusable by the transcription pipeline so a scan's image is generated the
    instant its analysis lands (no separate manual step). Raises on source problems."""
    os.makedirs(OUT_DIR, exist_ok=True)
    manifest = manifest if manifest is not None else load_manifest()
    rotations = rotations if rotations is not None else load_rotations()
    out = os.path.join(OUT_DIR, f"{group}.jpg")
    if os.path.exists(out) and not force:
        return False
    pages = []
    for sid in group_scan_ids(group):
        fn = manifest.get(sid)
        if not fn:
            print(f"  ! {group}: no manifest row for page {sid}")
            continue
        pages.extend(render_pages(fn))  # every frame of every scan in the group
    if not pages:
        raise FileNotFoundError(f"{group}: no source pages found")
    img = stack(pages)
    deg = (rotations.get(group, 0) or 0) % 360
    if deg:
        img = img.rotate(-deg, expand=True)  # stored deg is clockwise; PIL is CCW-positive
    img.save(out, "JPEG", quality=QUALITY, optimize=True)
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="rebuild even if the jpg exists")
    ap.add_argument("--only", help="single group id, e.g. set-032")
    args = ap.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    manifest = load_manifest()
    rotations = load_rotations()
    groups = ([args.only] if args.only
              else sorted(os.path.basename(f)[:-5]
                          for f in glob.glob(f"{TRANSCRIPTIONS}/*.json")))

    built = skipped = missing = 0
    for g in groups:
        out = os.path.join(OUT_DIR, f"{g}.jpg")
        if os.path.exists(out) and not args.force:
            skipped += 1
            continue
        try:
            made = build_group(g, manifest, rotations, force=True)
            built += 1 if made else 0
            deg = (rotations.get(g, 0) or 0) % 360
            print(f"  ✓ {g}.jpg{'  (rotated %d°)' % deg if deg else ''}")
        except Exception as e:
            missing += 1
            print(f"  ✗ {g}: {type(e).__name__}: {e}")

    print(f"\nbuilt={built}  skipped(existing)={skipped}  failed={missing}  → {OUT_DIR}")


if __name__ == "__main__":
    main()
