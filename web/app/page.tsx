import Link from "next/link";
import { getScans } from "@/lib/poems";
import type { Poem } from "@/lib/types";

const SENS: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3 };

function worstConf(poems: Poem[]) {
  for (const c of ["low", "medium", "high"]) if (poems.some((p) => p.confidence === c)) return c;
  return "?";
}

export default function Home() {
  const scans = getScans();
  const totalPoems = scans.reduce((n, s) => n + s.poems.length, 0);

  return (
    <>
      <header className="g-header">
        <h1>Ông Nội Poetry — review gallery</h1>
        <div className="g-sub">
          {scans.length} scans · {totalPoems} poems · click a card to read + suggest edits ·{" "}
          <Link href="/admin/suggestions">admin ›</Link>
        </div>
      </header>
      <div className="grid">
        {scans.map((s) => {
          const titles = s.poems.map((p) => p.title_vi || p.title || "Không đề").join(" · ");
          const date = s.poems.find((p) => p.date_text)?.date_text || "";
          const place = s.poems.find((p) => p.place)?.place || "";
          const conf = worstConf(s.poems);
          const sensitive =
            s.poems.some((p) => (p.visibility || "public") !== "public") ||
            Math.max(...s.poems.map((p) => SENS[p.sensitivity?.level || "none"] || 0)) >= 2;
          const fn = s.poems.reduce((n, p) => n + (p.footnotes?.length || 0), 0);
          const marg = s.poems.reduce((n, p) => n + (p.marginalia?.length || 0), 0);
          const tags = Array.from(new Set(s.poems.flatMap((p) => p.tags || []))).slice(0, 8);
          return (
            <Link key={s.scanId} href={`/poems/${s.scanId}`} className="card">
              <div className="sid">{s.scanId} · {s.filename}</div>
              <div className="ttl">{titles}</div>
              <div className="mt">{[date, place].filter(Boolean).join(" · ")}</div>
              <div className="badges">
                <span className="b">{s.poems.length} poem{s.poems.length !== 1 ? "s" : ""}</span>
                <span className={`b conf-${conf}`}>{conf}</span>
                {sensitive && <span className="b sens">family/sensitive</span>}
                {fn > 0 && <span className="b muted">{fn} fn</span>}
                {marg > 0 && <span className="b muted">{marg} marg</span>}
              </div>
              <div className="tags">
                {tags.map((t) => <span key={t} className="tag">{t}</span>)}
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
