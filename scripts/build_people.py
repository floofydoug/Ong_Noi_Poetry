#!/usr/bin/env python3
"""Build a PRIVATE people registry from the mentions already captured in the transcriptions.

Name-matching only (no LLM): aggregate every `mention` across the fresh transcriptions, drop
generic kinship terms (mẹ/con/cha/cháu…), keep PROPER NAMES, and cluster them into candidate
`Person` records — with all alias spellings, relationships, aggregated life-events, and the
poems each is referenced in. The 4 known grandchildren are seeded as confirmed anchors.

Output: data/people.json  (gitignored — real family names; for local review, seeded to DB later).
Re-runnable: re-run after more sittings land.

Run:  ./.venv/bin/python scripts/build_people.py
"""
import json, glob, os, re, unicodedata, collections

TRANSCRIPTIONS = "/Users/doug/ongs_poems/data/transcriptions"
OUT = "/Users/doug/ongs_poems/data/people.json"

# Confirmed people — seeded as verified anchors so matching mentions attach to a known identity.
KNOWN_PEOPLE = [
    {"canonical": "Lê Thị Phong", "relationship": "wife",
     "aliases": ["Le Thi Phong", "Phong Le", "Chan Pho Phuoc", "Chon Pho Phuoc"]},
    {"canonical": "Minh-Đức", "relationship": "grandchild", "aliases": ["Minh Duc"]},
    {"canonical": "Levy", "relationship": "grandchild", "aliases": ["Levy"]},
    {"canonical": "Lynsa", "relationship": "grandchild", "aliases": ["Lynsa"]},
    {"canonical": "Lâm Anh", "relationship": "grandchild", "aliases": ["Lamanh", "Lam Anh"]},
]

# Vietnamese kinship / generic terms — NOT individuals. Used both as standalone generics and as
# leading titles to strip ("Bà Nhi" -> "Nhi", "cháu Minh" -> "Minh", "mẹ cha" -> generic).
KINSHIP = {
    "mẹ", "má", "mạ", "u", "bu", "cha", "ba", "bố", "tía", "con", "cháu", "chắt",
    "ông", "bà", "cụ", "cố", "anh", "chị", "em", "cô", "dì", "chú", "bác", "cậu",
    "mợ", "thím", "dượng", "vợ", "chồng", "nàng", "chàng", "bé", "thằng", "đứa",
    "người", "ai", "gia", "đình", "gia đình", "nhà", "họ", "mọi", "các", "những",
    "cha mẹ", "mẹ cha", "bố mẹ", "ông bà", "con cháu", "cháu con", "vợ chồng",
    "anh em", "chị em", "các con", "các cháu", "mọi người", "con cái",
    "tôi", "mình", "ta", "tớ", "tao", "mày", "nó", "chúng", "chúng tôi", "chúng ta",  # pronouns
}
TITLE_PREFIXES = {"b.s.", "bs", "bs.", "dr", "dr.", "mr", "mr.", "mrs", "mrs.",
                  "thầy", "cô", "ông", "bà", "cụ", "cố", "anh", "chị", "em", "chú",
                  "bác", "dì", "cậu", "bé", "con", "cháu", "chị", "thánh", "đức"}


def norm(s):
    return re.sub(r"\s+", " ", (s or "").strip().lower()).strip(" .,:;!?-–—\"'")


def strip_diacritics(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").replace("đ", "d")


def core_of(name):
    """Strip leading kinship/title words; return the proper-name core (lowercased, diacritics kept),
    or '' if the whole thing is generic."""
    toks = norm(name).split()
    # drop leading title/kinship tokens
    while toks and (toks[0] in TITLE_PREFIXES or toks[0] in KINSHIP):
        toks.pop(0)
    core = " ".join(toks).strip(" .,:;-")
    if not core or core in KINSHIP:
        return ""
    # a bare single kinship token left, or all-generic
    if all(t in KINSHIP for t in core.split()):
        return ""
    return core


def main():
    files = sorted(glob.glob(f"{TRANSCRIPTIONS}/*.json"))
    people = collections.defaultdict(lambda: {
        "aliases": collections.Counter(), "relationships": collections.Counter(),
        "life_events": set(), "poems": []})
    skipped = collections.Counter()
    n_poems = 0

    for f in files:
        d = json.load(open(f))
        if d.get("_meta", {}).get("files") is None:
            continue  # only fresh (all-frames) transcriptions
        group = d["_meta"]["group"]
        for pi, p in enumerate(d.get("poems", [])):
            n_poems += 1
            for m in (p.get("mentions") or []):
                naw = (m.get("name_as_written") or "").strip()
                if not naw:
                    continue
                key = core_of(naw)
                if not key:
                    skipped[norm(naw)] += 1
                    continue
                rec = people[key]
                rec["aliases"][naw] += 1
                if m.get("relationship"):
                    rec["relationships"][norm(m["relationship"])] += 1
                if m.get("life_event"):
                    rec["life_events"].add(m["life_event"].strip())
                rec["poems"].append({"group": group, "poem_index": pi, "name_as_written": naw})

    # seed confirmed people (wife + grandchildren): match clusters to a known identity
    def dk(s):
        return strip_diacritics(norm(s)).replace("-", " ").replace(".", " ").split()
    known_map = {}  # cluster core_key -> known-person dict
    for kp in KNOWN_PEOPLE:
        alias_sets = [tuple(dk(a)) for a in kp["aliases"]]
        for key in people:
            if tuple(dk(key)) in alias_sets:
                known_map[key] = kp

    out = []
    for key, rec in people.items():
        kp = known_map.get(key)
        canonical = kp["canonical"] if kp else rec["aliases"].most_common(1)[0][0]
        out.append({
            "id": "p_" + re.sub(r"[^a-z0-9]+", "-", strip_diacritics(key)).strip("-"),
            "core_key": key,
            "canonical_name": canonical,
            "known": bool(kp),
            "relationship": (kp["relationship"] if kp else
                             (rec["relationships"].most_common(1)[0][0]
                              if rec["relationships"] else None)),
            "relationships": dict(rec["relationships"]),
            "aliases": [a for a, _ in rec["aliases"].most_common()],
            "life_events": sorted(rec["life_events"]),
            "mention_count": sum(rec["aliases"].values()),
            "poem_count": len(set((x["group"], x["poem_index"]) for x in rec["poems"])),
            "poems": rec["poems"],
            "verified": bool(kp),  # seeded people start confirmed
        })
    out.sort(key=lambda x: (-x["mention_count"], x["canonical_name"]))

    doc = {
        "generated_from_poems": n_poems,
        "people_count": len(out),
        "known_matched": sum(1 for x in out if x["known"]),
        "skipped_generic_count": sum(skipped.values()),
        "top_skipped_generic": dict(skipped.most_common(15)),
        "people": out,
    }
    json.dump(doc, open(OUT, "w"), ensure_ascii=False, indent=2)
    print(f"poems scanned: {n_poems}")
    print(f"proper-name people: {len(out)}  (known grandchildren matched: {doc['known_matched']})")
    print(f"generic mentions skipped: {doc['skipped_generic_count']}")
    print(f"\ntop 20 people by mentions:")
    for x in out[:20]:
        tag = " [KNOWN]" if x["known"] else ""
        print(f"  {x['mention_count']:3}  {x['canonical_name']:20} {x['relationship'] or '':12} {x['poem_count']} poems{tag}")
    print(f"\n-> {OUT}")


if __name__ == "__main__":
    main()
