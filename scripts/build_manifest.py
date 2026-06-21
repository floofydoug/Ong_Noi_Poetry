#!/usr/bin/env python3
"""Build a non-destructive manifest of the original TIF scans.

Parses each original filename into clean, structured fields WITHOUT renaming
the source files. Preserves provenance (original_filename) and captures the
meaningful Vietnamese descriptors as notes. Output: data/originals-manifest.csv
"""
import os, re, csv, glob, unicodedata

SRC = "/Users/doug/ongs_poems/originals"
OUT = "/Users/doug/ongs_poems/data/originals-manifest.csv"

# Tokens that are noise (scanner artifacts), removed before parsing the suffix.
NOISE = re.compile(r"\b(tif|001)\b", re.IGNORECASE)

def strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s)
                   if unicodedata.category(c) != "Mn").lower()

def classify_note(rest_raw: str):
    """Return (note, needs_review) from leftover descriptive text."""
    flat = strip_accents(rest_raw).strip(" -")
    if not flat:
        return "", False
    if "muc luc" in flat:
        return "table of contents (Mục lục)", True
    if "trang sau cua set 30" in flat:
        return "back page of Set 30 (Trang sau của set 30)", True
    if "khong de" in flat or "khong dde" in flat:
        return "poem is untitled (Không đề)", False
    if flat == "large":
        return "large-format scan", False
    if flat == "long":
        return 'descriptor "long" — verify during review', True
    return f"unrecognized descriptor: {rest_raw.strip()}", True

def parse(stem: str):
    # Leading "Set"/"SeT" + number (drop zero padding), capture the remainder.
    m = re.match(r"^[Ss]e[Tt]\s*0*(\d+)\s*(.*)$", stem)
    if not m:
        return dict(set_number="", page="", variant="", normalized="",
                    note="UNPARSEABLE", needs_review=True)
    set_number = int(m.group(1))
    rest = m.group(2)

    variant = ""
    # " 2" style second scan (e.g. "Set 102 2")
    if re.fullmatch(r"\s*2\s*", rest):
        variant = "second-scan"
        rest = ""

    rest = NOISE.sub(" ", rest)          # strip "Tif"/"001"
    rest = re.sub(r"\s+", " ", rest).strip(" -")

    # Leading page letter(s): single (A) or doubled (AA -> A)
    page = ""
    pm = re.match(r"^([A-Za-z])\1?\b\s*(.*)$", rest)  # AA, BB -> A, B
    if pm and not pm.group(2).strip().lower().startswith(("tif",)):
        page = pm.group(1).upper()
        rest = pm.group(2).strip(" -")
    else:
        pm2 = re.match(r"^([A-Za-z])\b\s*(.*)$", rest)
        if pm2:
            page = pm2.group(1).upper()
            rest = pm2.group(2).strip(" -")

    note, needs_review = classify_note(rest)

    norm = f"Set {set_number:03d}{page}"
    if variant == "second-scan":
        norm += " (dup #)"
        needs_review = True  # ' 2' files are distinct poems sharing a set number
        if not note:
            note = ("distinct poem sharing set number (filename ' 2'); "
                    "likely needs renumbering — verify during review")
    return dict(set_number=set_number, page=page, variant=variant,
                normalized=norm, note=note, needs_review=needs_review)

rows = []
for path in glob.glob(os.path.join(SRC, "*.tif")):
    fn = os.path.basename(path)
    stem = fn[:-4]
    info = parse(stem)
    slug = (f"set-{info['set_number']:03d}" if info["set_number"] != "" else "unknown")
    if info["page"]:
        slug += info["page"].lower()
    if info["variant"] == "second-scan":
        slug += "-2"
    rows.append({
        "scan_id": slug,
        "original_filename": fn,
        "set_number": info["set_number"],
        "page": info["page"],
        "variant": info["variant"],
        "normalized_name": info["normalized"],
        "note": info["note"],
        "needs_review": info["needs_review"],
        "size_bytes": os.path.getsize(path),
    })

# Sort by set number then page then variant
rows.sort(key=lambda r: (r["set_number"] if r["set_number"] != "" else 99999,
                          r["page"], r["variant"], r["original_filename"]))

# Disambiguate any colliding scan_ids (e.g. "Set 005.tif" vs "Set 5.tif").
seen = {}
for r in rows:
    sid = r["scan_id"]
    if sid in seen:
        seen[sid] += 1
        r["scan_id"] = f"{sid}-alt{seen[sid]}"
        r["needs_review"] = True
        r["note"] = (r["note"] + "; " if r["note"] else "") + \
            f"duplicate set number — distinct image colliding with '{sid}'; resolve during review"
    else:
        seen[sid] = 1

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
    w.writeheader()
    w.writerows(rows)

# Summary to stdout
total = len(rows)
flagged = sum(1 for r in rows if r["needs_review"])
noted = [r for r in rows if r["note"]]
dup_ids = {}
for r in rows:
    dup_ids.setdefault(r["scan_id"], 0)
    dup_ids[r["scan_id"]] += 1
collisions = {k: v for k, v in dup_ids.items() if v > 1}
print(f"Wrote {OUT}")
print(f"Total scans: {total}")
print(f"Flagged needs_review: {flagged}")
print(f"Scan_id collisions: {collisions if collisions else 'none'}")
print("\nAll rows with notes / flags:")
for r in noted:
    print(f"  {r['original_filename']:<32} -> {r['normalized_name']:<18} | {r['note']}")
