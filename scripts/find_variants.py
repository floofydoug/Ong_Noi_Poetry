#!/usr/bin/env python3
"""Reused-line index → flag poems that may be VERSIONS of one another.

Ông rewrote poems across sittings. This normalizes every Vietnamese line, indexes
which poems contain it, and reports poem pairs that share several distinct lines.
Output: data/poem-variants.json (candidate version pairs + clusters).

Usage: ./.venv/bin/python scripts/find_variants.py [--min-shared 3]
"""
import argparse, glob, json, re, unicodedata
from collections import defaultdict

TRANSCRIPTS = "/Users/doug/ongs_poems/data/transcriptions"
OUT = "/Users/doug/ongs_poems/data/poem-variants.json"


def norm(line: str) -> str:
    """Normalize a VI line for matching: drop [?], lowercase, strip punctuation/space."""
    s = line.replace("[?]", " ")
    s = unicodedata.normalize("NFC", s).lower()
    s = re.sub(r"[^\wàáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ\s]",
               " ", s)
    return re.sub(r"\s+", " ", s).strip()


def poem_lines(p):
    out = []
    for L in p.get("lines") or []:
        n = norm(L.get("vi", ""))
        if len(n.split()) >= 3:          # ignore very short/common lines
            out.append(n)
    return set(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-shared", type=int, default=3)
    args = ap.parse_args()

    poems = {}      # poem_key -> {title, scan, lines:set}
    line_index = defaultdict(set)
    for f in sorted(glob.glob(f"{TRANSCRIPTS}/*.json")):
        d = json.load(open(f))
        scan = d["_meta"]["scan_id"]
        for i, p in enumerate(d.get("poems", [])):
            key = f"{scan}#{i}"
            lines = poem_lines(p)
            poems[key] = {"title": p.get("title_vi") or p.get("title"),
                          "scan": scan, "lines": lines}
            for ln in lines:
                line_index[ln].add(key)

    # Count shared lines per poem pair.
    pair_shared = defaultdict(int)
    for ln, keys in line_index.items():
        keys = sorted(keys)
        for a in range(len(keys)):
            for b in range(a + 1, len(keys)):
                pair_shared[(keys[a], keys[b])] += 1

    pairs = []
    for (a, b), n in sorted(pair_shared.items(), key=lambda x: -x[1]):
        if n < args.min_shared:
            continue
        la, lb = len(poems[a]["lines"]), len(poems[b]["lines"])
        jac = n / len(poems[a]["lines"] | poems[b]["lines"]) if (la or lb) else 0
        pairs.append({"a": a, "b": b, "a_title": poems[a]["title"],
                      "b_title": poems[b]["title"], "shared_lines": n,
                      "jaccard": round(jac, 2), "relation": "possible-version"})

    # Cluster pairs (connected components) into version groups.
    parent = {}
    def find(x): parent.setdefault(x, x); return x if parent[x] == x else find(parent[x])
    def union(x, y): parent[find(x)] = find(y)
    for pr in pairs:
        union(pr["a"], pr["b"])
    clusters = defaultdict(list)
    for k in parent:
        clusters[find(k)].append(k)
    groups = [sorted(v) for v in clusters.values() if len(v) > 1]

    json.dump({"poems_indexed": len(poems), "min_shared": args.min_shared,
               "pairs": pairs, "version_groups": groups},
              open(OUT, "w"), ensure_ascii=False, indent=2)
    print(f"Indexed {len(poems)} poems. Found {len(pairs)} candidate version pair(s), "
          f"{len(groups)} version group(s). → {OUT}")
    for pr in pairs[:15]:
        print(f"  {pr['a']} ⇄ {pr['b']}  shared={pr['shared_lines']} jac={pr['jaccard']}")


if __name__ == "__main__":
    main()
