#!/usr/bin/env python3
"""Normalize the POET's full name in the `author` field to the correct 'Thanh-Phùng' (dấu huyền).

OCR scattered it as Phụng (nặng), Phượng/Phương, Phong, Thung, Hùng, Thành…, etc. Per instruction:
  - KEEP initials/signature forms untouched (T.P., TP, CTM (T.P.), …) — those are how he signs.
  - Only rewrite the spelled-out full name (incl. inside a dharma-name paren) to 'Thanh-Phùng'.
  - Leave unrelated values alone (Tuệ Minh, place names, other initials).

Full name = 'Thanh/Thành' + a second word that starts Ph/Th/H and ends in 'ng' (covers every
observed OCR slip). Pure-initial strings never match, so they're preserved.

Run:  ./.venv/bin/python scripts/fix_author.py           # dry run — shows every change
      ./.venv/bin/python scripts/fix_author.py --apply    # write the fixes
"""
import argparse, json, glob, re, collections

CANON = "Thanh-Phùng"
# 'Thanh' with any first-syllable OCR slip (thanh/thành/thạnh/thảnh…) + a second word starting
# Ph/Th/H ending 'ng'. Deliberately NARROW: does not touch initials, the wife's name (Phong-Lê /
# Chân Phổ Phước / Lê Thị Phong), or reordered formal names — those go to human review.
POET = re.compile(r"th[aàảãáạ]nh[\s\-–]*(?:ph|th|h)\w{0,5}ng", re.IGNORECASE | re.UNICODE)


def fix(a):
    return POET.sub(CANON, a) if a else a


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    files = sorted(glob.glob("/Users/doug/ongs_poems/data/transcriptions/*.json"))
    changes = collections.Counter()   # (old -> new): count
    kept = collections.Counter()      # untouched values
    poems_changed = 0

    for f in files:
        d = json.load(open(f))
        dirty = False
        for p in d.get("poems", []):
            a = (p.get("author") or "").strip()
            if not a:
                continue
            nb = fix(a)
            if nb != a:
                changes[(a, nb)] += 1
                poems_changed += 1
                if args.apply:
                    p["author"] = nb
                    dirty = True
            else:
                kept[a] += 1
        if args.apply and dirty:
            json.dump(d, open(f, "w"), ensure_ascii=False, indent=2)

    print(f"{'APPLIED' if args.apply else 'DRY RUN'} — poems whose author changes: {poems_changed}\n")
    print("CHANGES (old -> new):")
    for (o, n), c in sorted(changes.items(), key=lambda x: -x[1]):
        print(f"  {c:4}  {o!r:34} -> {n!r}")
    print(f"\nKEPT UNTOUCHED (top 15 — initials & non-poet values):")
    for a, c in kept.most_common(15):
        print(f"  {c:4}  {a!r}")


if __name__ == "__main__":
    main()
