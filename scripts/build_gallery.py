#!/usr/bin/env python3
"""Build a browsable local review gallery of every transcribed poem.

Regenerates verification/<scan_id>.html for each transcription and writes
verification/index.html linking to them all, with review-at-a-glance metadata.

    ./.venv/bin/python scripts/build_gallery.py
    cd verification && python3 -m http.server 8000   →  http://localhost:8000
"""
import glob, html, json, os
import build_verification as bv   # reuse render(), OUT, TRANSCRIPTS

SENS = {"none": 0, "low": 1, "medium": 2, "high": 3}


def esc(s):
    return html.escape(str(s or ""))


def summarize(scan_id):
    d = json.load(open(f"{bv.TRANSCRIPTS}/{scan_id}.json"))
    poems = d.get("poems", [])
    titles = [p.get("title_vi") or p.get("title") or "Không đề" for p in poems]
    date = next((p.get("date_text") for p in poems if p.get("date_text")), "")
    place = next((p.get("place") for p in poems if p.get("place")), "")
    worst_conf = next((c for c in ("low", "medium", "high")
                       if c in [p.get("confidence") for p in poems]), "?")
    sens = max([SENS.get((p.get("sensitivity") or {}).get("level", "none"), 0)
                for p in poems] or [0])
    private = any((p.get("visibility") or "public") != "public" for p in poems)
    tags = sorted({t for p in poems for t in (p.get("tags") or [])})
    return {
        "scan_id": scan_id,
        "filename": d["_meta"].get("original_filename", ""),
        "titles": titles,
        "date": date, "place": place,
        "n_poems": len(poems),
        "confidence": worst_conf,
        "sensitive": sens >= 2 or private,
        "footnotes": sum(len(p.get("footnotes") or []) for p in poems),
        "marginalia": sum(len(p.get("marginalia") or []) for p in poems),
        "tags": tags,
    }


def card(s):
    titles = " · ".join(esc(t) for t in s["titles"])
    meta = " · ".join(x for x in [esc(s["date"]), esc(s["place"])] if x)
    badges = [f'<span class="b">{s["n_poems"]} poem{"s" if s["n_poems"] != 1 else ""}</span>',
              f'<span class="b conf-{s["confidence"]}">{s["confidence"]}</span>']
    if s["sensitive"]:
        badges.append('<span class="b sens">family/sensitive</span>')
    if s["footnotes"]:
        badges.append(f'<span class="b muted">{s["footnotes"]} fn</span>')
    if s["marginalia"]:
        badges.append(f'<span class="b muted">{s["marginalia"]} marg</span>')
    tags = "".join(f'<span class="tag">{esc(t)}</span>' for t in s["tags"][:8])
    return f"""<a class="card" href="{esc(s['scan_id'])}.html">
      <div class="sid">{esc(s['scan_id'])} · {esc(s['filename'])}</div>
      <div class="ttl">{titles}</div>
      <div class="mt">{meta}</div>
      <div class="badges">{''.join(badges)}</div>
      <div class="tags">{tags}</div>
    </a>"""


def main():
    os.makedirs(bv.OUT, exist_ok=True)
    scans = sorted(os.path.basename(f)[:-5]
                   for f in glob.glob(f"{bv.TRANSCRIPTS}/*.json"))
    summaries = []
    for sid in scans:
        with open(os.path.join(bv.OUT, f"{sid}.html"), "w") as f:
            f.write(bv.render(sid))          # (re)build each poem page
        summaries.append(summarize(sid))
        print(f"· {sid}")

    total_poems = sum(s["n_poems"] for s in summaries)
    cards = "\n".join(card(s) for s in summaries)
    index = f"""<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ông Nội Poetry — review</title>
<style>
  :root {{ --ink:#1d1b16; --paper:#fbfaf7; --muted:#9b9482; --line:#e7e2d6; }}
  body {{ margin:0; background:var(--paper); color:var(--ink);
         font:16px/1.6 Georgia,serif; }}
  header {{ padding:56px 40px 24px; max-width:1100px; margin:0 auto; }}
  h1 {{ font-weight:400; font-size:28px; margin:0 0 6px; }}
  .sub {{ color:var(--muted); font-size:14px; }}
  .grid {{ max-width:1100px; margin:0 auto; padding:12px 40px 80px;
          display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:16px; }}
  .card {{ display:block; text-decoration:none; color:inherit; background:#fff;
          border:1px solid var(--line); border-radius:10px; padding:18px 20px;
          transition:box-shadow .15s; }}
  .card:hover {{ box-shadow:0 4px 20px rgba(0,0,0,.08); }}
  .sid {{ font:10px/1 ui-monospace,monospace; color:var(--muted);
         letter-spacing:.1em; text-transform:uppercase; }}
  .ttl {{ font-size:20px; margin:8px 0 2px; }}
  .mt {{ color:var(--muted); font-size:13px; font-style:italic; }}
  .badges {{ margin:12px 0 8px; display:flex; flex-wrap:wrap; gap:6px; }}
  .b {{ font:11px/1 ui-monospace,monospace; padding:3px 7px; border-radius:8px;
       background:#efece2; color:#7a7464; letter-spacing:.03em; }}
  .b.conf-low {{ background:#fbeaea; color:#b23b3b; }}
  .b.conf-medium {{ background:#fdf3e0; color:#a9740a; }}
  .b.conf-high {{ background:#e8f3ea; color:#2e7d4f; }}
  .b.sens {{ background:#efe6f5; color:#7a4fa0; }}
  .b.muted {{ background:transparent; border:1px solid var(--line); }}
  .tags {{ display:flex; flex-wrap:wrap; gap:5px; }}
  .tag {{ font:10px/1 ui-monospace,monospace; color:#8a8474; background:#f2efe7;
         padding:3px 7px; border-radius:10px; }}
</style></head>
<body>
  <header>
    <h1>Ông Nội Poetry — review gallery</h1>
    <div class="sub">{len(summaries)} scans · {total_poems} poems transcribed ·
      click a card to see the bilingual page + original scan</div>
  </header>
  <div class="grid">{cards}</div>
</body></html>"""
    with open(os.path.join(bv.OUT, "index.html"), "w") as f:
        f.write(index)
    print(f"\nGallery: {bv.OUT}/index.html  ({len(summaries)} scans, {total_poems} poems)")


if __name__ == "__main__":
    main()
