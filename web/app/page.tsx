import Link from "next/link";
import { getScans } from "@/lib/poems";
import type { Scan } from "@/lib/types";
import LiveBanner from "@/components/LiveBanner";
import SearchBar from "@/components/SearchBar";
import AuthNav from "@/components/AuthNav";

const SENS: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3 };

function yearOf(scan: Scan): string | null {
  for (const p of scan.poems) {
    const d = p.date_text || "";
    const m4 = d.match(/\b(19|20)\d{2}\b/);
    if (m4) return m4[0];
    // date like DD-MM-YY / D/M/YY → 2-digit year (e.g. 13-04-18 → 2018)
    const m2 = d.match(/\b\d{1,2}[-/]\d{1,2}[-/](\d{2})\b/);
    if (m2) {
      const yy = parseInt(m2[1], 10);
      return String(yy <= 40 ? 2000 + yy : 1900 + yy);
    }
  }
  return null;
}

function isSensitive(scan: Scan): boolean {
  return scan.poems.some(
    (p) => (p.visibility || "public") !== "public" || (SENS[p.sensitivity?.level || "none"] || 0) >= 2
  );
}

function Card({ scan, bySet }: { scan: Scan; bySet?: boolean }) {
  const date = scan.poems.find((p) => p.date_text)?.date_text || "";
  const place = scan.poems.find((p) => p.place)?.place || "";
  const sub = bySet ? scan.scanId : [date, place].filter(Boolean).join(" · ");
  return (
    <div className="pcard">
      <ol className="ptitles">
        {scan.poems.map((p, i) => (
          <li key={i}>
            {/* jumps straight to this poem's section on the sitting page */}
            <Link href={`/poems/${scan.scanId}#poem-${i}`} className="ptitle">
              {p.title_vi || p.title || "Không đề"}
            </Link>
          </li>
        ))}
      </ol>
      <div className="pmt">
        <Link href={`/poems/${scan.scanId}`} className="pmt-link">{sub || scan.scanId}</Link>
        {scan.poems.length > 1 && <span className="pill">{scan.poems.length} poems</span>}
        {isSensitive(scan) && <span className="pill fam">family</span>}
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";

export default async function Home() {
  const scans = await getScans();
  const total = scans.reduce((n, s) => n + s.poems.length, 0);

  const byYear = new Map<string, Scan[]>();
  const undated: Scan[] = [];
  for (const s of scans) {
    const y = yearOf(s);
    if (y) {
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y)!.push(s);
    } else {
      undated.push(s);
    }
  }
  const years = [...byYear.keys()].sort((a, b) => Number(b) - Number(a));
  undated.sort((a, b) => a.scanId.localeCompare(b.scanId));

  // "By set" index for the wide-screen left sidebar — every sitting, in set-number order.
  const setNum = (id: string) => { const m = id.match(/(\d+)/); return m ? parseInt(m[1], 10) : 0; };
  const bySet = [...scans].sort(
    (a, b) => setNum(a.scanId) - setNum(b.scanId) || a.scanId.localeCompare(b.scanId)
  );

  return (
    <>
      <LiveBanner />
      <header className="g-header">
        <AuthNav />
        <h1>Thanh Phung Poetry</h1>
        <div className="g-sub">
          {scans.length} pages · {total} poems
        </div>
        <SearchBar />
      </header>

      <div className="home-main">
        {/* wide-screen only: everything indexed by set (sitting) */}
        <aside className="setnav">
          <div className="setnav-h">By set</div>
          <nav>
            {bySet.map((s) => (
              <Link key={s.scanId} href={`/poems/${s.scanId}`} className="setnav-item">
                <span className="sn-num">{s.scanId.replace(/^set-/, "Set ")}</span>
                <span className="sn-ttl">
                  {s.poems.map((p) => p.title_vi || p.title || "Không đề").join(" · ")}
                </span>
              </Link>
            ))}
          </nav>
        </aside>

        <div className="years">
          {years.map((y) => (
            <section key={y} className="yr">
              <h2 className="yr-h">{y}</h2>
              <div className="yr-grid">
                {byYear.get(y)!.map((s) => <Card key={s.scanId} scan={s} />)}
              </div>
            </section>
          ))}

          {undated.length > 0 && (
            <section className="yr">
              <h2 className="yr-h">Undated · by set</h2>
              <div className="yr-grid">
                {undated.map((s) => <Card key={s.scanId} scan={s} bySet />)}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
