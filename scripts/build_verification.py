#!/usr/bin/env python3
"""Build a self-contained verification page per scan: original TIF (left) beside the
digital Vietnamese transcription (right), rendered as the poem page will look.

Usage:  ./.venv/bin/python scripts/build_verification.py set-102 [set-001 ...]
Output: verification/<scan_id>.html  (scan embedded as base64 — no external files)
"""
import base64, html, io, json, os, subprocess, sys, tempfile

ORIGINALS = "/Users/doug/ongs_poems/originals"
TRANSCRIPTS = "/Users/doug/ongs_poems/data/transcriptions"
OUT = "/Users/doug/ongs_poems/verification"
MANIFEST = "/Users/doug/ongs_poems/data/originals-manifest.csv"


def tif_to_png_b64(filename: str) -> str:
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp_path = tmp.name
    src = os.path.join(ORIGINALS, filename)
    subprocess.run(["sips", "-s", "format", "png", "--resampleWidth", "1400",
                    src, "--out", tmp_path],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    with open(tmp_path, "rb") as f:
        b64 = base64.standard_b64encode(f.read()).decode()
    os.unlink(tmp_path)
    return b64


def filename_for(scan_id: str) -> str:
    import csv
    with open(MANIFEST, newline="") as f:
        for r in csv.DictReader(f):
            if r["scan_id"] == scan_id:
                return r["original_filename"]
    sys.exit(f"{scan_id} not in manifest")


def esc(s) -> str:
    return html.escape(s or "")


def with_unc(s: str) -> str:
    """Highlight [?] uncertainties in already-escaped text."""
    return s.replace("[?]", '<span class="unc">[?]</span>')


def render_vi(vi: str, footnotes: list, used: set) -> str:
    """Escape a VI line and inject superscript footnote markers (once per anchor)."""
    out = esc(vi)
    for i, fn in enumerate(footnotes, 1):
        if i in used:
            continue
        a = esc(fn.get("anchor", ""))
        if a and a in out:
            out = out.replace(a, f'{a}<sup class="fnmark">{i}</sup>', 1)
            used.add(i)
    return with_unc(out)


def poem_lines_html(p: dict, footnotes: list, used: set) -> str:
    """Two-column line-by-line grid: Vietnamese (left) · English (right)."""
    lines = p.get("lines")
    if not lines:  # fallback for older JSON that used a single transcription string
        lines = [{"vi": ln, "en": ""} for ln in (p.get("transcription") or "").split("\n")]
    cells = []
    for L in lines:
        vi, en = L.get("vi", ""), L.get("en", "")
        if not vi and not en:
            cells.append('<div class="stanza-gap"></div>')
        else:
            cells.append(f'<div class="vi">{render_vi(vi, footnotes, used)}</div>'
                         f'<div class="en">{with_unc(esc(en))}</div>')
    return f'<div class="lines">{"".join(cells)}</div>'


def render(scan_id: str) -> str:
    fn = filename_for(scan_id)
    data = json.load(open(os.path.join(TRANSCRIPTS, f"{scan_id}.json")))
    b64 = tif_to_png_b64(fn)

    poems_html = []
    for i, p in enumerate(data["poems"]):
        if i:
            poems_html.append('<div class="divider">· · ·</div>')
        meta = " · ".join(x for x in [p.get("date_text"), p.get("place"),
                                      p.get("author")] if x)
        conf = (p.get("confidence") or "?").lower()
        footnotes = p.get("footnotes") or []
        used = set()
        lines_html = poem_lines_html(p, footnotes, used)

        fn_html = ""
        if footnotes:
            items = "".join(
                f'<li><sup>{i}</sup> <em>{esc(fn.get("anchor"))}</em> — {esc(fn.get("note"))}</li>'
                for i, fn in enumerate(footnotes, 1))
            fn_html = f'<div class="notes-block"><span>footnotes</span><ol>{items}</ol></div>'

        marg = p.get("marginalia") or []
        marg_html = ""
        if marg:
            items = "".join(
                f'<li><span class="mk">{esc(m.get("kind"))}</span> {with_unc(esc(m.get("text")))}'
                f'{(" — <em>" + esc(m.get("translation")) + "</em>") if m.get("translation") else ""}</li>'
                for m in marg)
            marg_html = f'<div class="notes-block"><span>marginalia</span><ul>{items}</ul></div>'

        spans = "".join(f"<li>{esc(s)}</li>" for s in p.get("uncertain_spans") or [])
        unc_html = (f'<div class="notes-block"><span>uncertain readings</span><ul>{spans}</ul></div>'
                    if spans else "")

        tags = p.get("tags") or []
        tags_html = ("".join(f'<span class="tag">{esc(t)}</span>' for t in tags))
        tags_block = f'<div class="tags">{tags_html}</div>' if tags else ""

        poems_html.append(f"""
        <article class="poem">
          <h2>{esc(p.get('title_vi') or p.get('title') or 'Không đề')}</h2>
          <p class="meta">{esc(meta)} <span class="badge {conf}">{conf}</span></p>
          {lines_html}
          {fn_html}{marg_html}{unc_html}{tags_block}
        </article>""")

    page_notes = data.get("page_notes") or ""
    return f"""<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{scan_id}</title>
<style>
  :root {{ --ink:#1d1b16; --paper:#fbfaf7; --muted:#9b9482; --line:#e7e2d6;
           --unc:#b23b3b; }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; background:var(--paper); color:var(--ink);
         font:18px/1.75 Georgia,"Times New Roman",serif;
         -webkit-font-smoothing:antialiased; }}
  .page {{ max-width:880px; margin:0 auto; padding:72px 40px 96px; }}
  .sid {{ font:11px/1 ui-monospace,monospace; color:var(--muted);
          letter-spacing:.14em; text-transform:uppercase; margin-bottom:48px; }}
  .poem {{ margin:0 0 12px; }}
  .poem h2 {{ font-weight:400; font-size:30px; letter-spacing:.01em; margin:0 0 6px; }}
  .meta {{ color:var(--muted); font-size:14px; font-style:italic; margin:0 0 36px; }}
  /* Vietnamese (left) · English translation (right), aligned line-by-line */
  .lines {{ display:grid; grid-template-columns:1fr 1fr; column-gap:56px;
            row-gap:2px; align-items:baseline; }}
  .vi {{ font-size:20px; }}
  .en {{ font-size:16px; color:var(--muted); }}
  .stanza-gap {{ grid-column:1 / -1; height:18px; }}
  .unc {{ color:var(--unc); border-bottom:1px dotted var(--unc); }}
  .badge {{ display:inline-block; font:11px/1 ui-monospace,monospace; padding:3px 8px;
            border-radius:10px; font-style:normal; letter-spacing:.06em;
            text-transform:uppercase; vertical-align:middle; margin-left:8px; }}
  .badge.low {{ background:#fbeaea; color:#b23b3b; }}
  .badge.medium {{ background:#fdf3e0; color:#a9740a; }}
  .badge.high {{ background:#e8f3ea; color:#2e7d4f; }}
  .fnmark {{ font-size:11px; color:var(--unc); vertical-align:super; padding-left:1px; }}
  .notes-block {{ margin-top:26px; border-top:1px solid var(--line); padding-top:12px;
                  font-size:13px; color:var(--muted); }}
  .notes-block > span {{ text-transform:uppercase; letter-spacing:.1em; font-size:11px;
                         display:block; margin-bottom:6px; }}
  .notes-block ul, .notes-block ol {{ margin:0; padding-left:18px; }}
  .notes-block li {{ margin:3px 0; }}
  .notes-block em {{ color:var(--ink); font-style:italic; }}
  .mk {{ display:inline-block; font:10px/1 ui-monospace,monospace; text-transform:uppercase;
         letter-spacing:.05em; background:#efece2; color:#7a7464; padding:2px 6px;
         border-radius:8px; margin-right:6px; }}
  .tags {{ margin-top:26px; display:flex; flex-wrap:wrap; gap:7px; }}
  .tag {{ font:11px/1 ui-monospace,monospace; color:#7a7464; background:#efece2;
          padding:4px 9px; border-radius:12px; letter-spacing:.03em; }}
  .divider {{ text-align:center; color:var(--muted); letter-spacing:.5em; margin:44px 0; }}
  .pagenote {{ color:var(--muted); font-size:13px; font-style:italic; margin:8px 0 0; }}
  /* Original manuscript — scroll down */
  .original {{ margin-top:80px; border-top:1px solid var(--line); padding-top:40px;
               text-align:center; }}
  .original .label {{ font:11px/1 ui-monospace,monospace; color:var(--muted);
                      letter-spacing:.14em; text-transform:uppercase; }}
  .original img {{ display:block; margin:28px auto 0; max-width:100%;
                   box-shadow:0 2px 24px rgba(0,0,0,.12); }}
</style></head>
<body><div class="page">
  <div class="sid">{scan_id} · {html.escape(fn)}</div>
  {''.join(poems_html)}
  {f'<p class="pagenote">{html.escape(page_notes)}</p>' if page_notes else ''}
  <div class="original">
    <div class="label">Original manuscript</div>
    <img src="data:image/png;base64,{b64}" alt="original scan">
  </div>
</div></body></html>"""


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: build_verification.py <scan_id> [scan_id ...]")
    os.makedirs(OUT, exist_ok=True)
    for scan_id in sys.argv[1:]:
        path = os.path.join(OUT, f"{scan_id}.html")
        with open(path, "w") as f:
            f.write(render(scan_id))
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
