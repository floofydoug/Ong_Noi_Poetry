#!/usr/bin/env python3
"""Guarantee every analyzed group has a web image. Exits non-zero if any are missing
(so it can gate a deploy). Optionally rebuilds the missing ones with --fix.

Run:  ./.venv/bin/python scripts/audit_images.py          # report only
      ./.venv/bin/python scripts/audit_images.py --fix    # build any that are missing
"""
import argparse, glob, os, sys

TRANSCRIPTIONS = "/Users/doug/ongs_poems/data/transcriptions"
SCANS = "/Users/doug/ongs_poems/web/public/scans"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fix", action="store_true", help="build any missing images")
    args = ap.parse_args()

    groups = sorted(os.path.basename(f)[:-5] for f in glob.glob(f"{TRANSCRIPTIONS}/*.json"))
    missing = [g for g in groups
               if not os.path.exists(f"{SCANS}/{g}.jpg") or os.path.getsize(f"{SCANS}/{g}.jpg") == 0]

    print(f"groups: {len(groups)}  with-image: {len(groups) - len(missing)}  missing: {len(missing)}")
    if missing:
        print("  missing:", ", ".join(missing))

    if missing and args.fix:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import build_derivatives
        for g in missing:
            try:
                build_derivatives.build_group(g)
                print(f"  ✓ built {g}.jpg")
            except Exception as e:
                print(f"  ✗ {g}: {e}")
        missing = [g for g in groups
                   if not os.path.exists(f"{SCANS}/{g}.jpg") or os.path.getsize(f"{SCANS}/{g}.jpg") == 0]

    sys.exit(1 if missing else 0)


if __name__ == "__main__":
    main()
