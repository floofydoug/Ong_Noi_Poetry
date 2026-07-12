"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import SearchBar from "@/components/SearchBar";

type Row = { slug: string; group: string; titleVi: string | null; title: string | null;
  dateText: string | null; place: string | null; snippet: string | null };

function anchorHref(row: Row) {
  const n = parseInt(row.slug.match(/-p(\d+)$/)?.[1] || "1", 10);
  return `/poems/${row.group}#poem-${n - 1}`;
}

function Results() {
  const sp = useSearchParams();
  const q = sp.get("q") || "";
  const mode = sp.get("mode") || "text";
  const kind = sp.get("kind") || "";
  const [data, setData] = useState<{ results: Row[]; count: number } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q) { setData(null); return; }
    setLoading(true);
    const url = `/api/search?q=${encodeURIComponent(q)}&mode=${mode}${kind ? `&kind=${kind}` : ""}`;
    fetch(url, { cache: "no-store" }).then((r) => r.json()).then((d) => setData(d)).finally(() => setLoading(false));
  }, [q, mode, kind]);

  const label = mode === "tag" ? (kind === "person" ? "person" : "tag") : "text";

  return (
    <div className="searchpage">
      <div className="search-head">
        <Link href="/" className="back">‹ all poems</Link>
        <SearchBar initialQ={q} initialMode={mode} big />
      </div>

      {q && (
        <p className="search-meta">
          {loading ? "Searching…" : `${data?.count ?? 0} poem${(data?.count ?? 0) === 1 ? "" : "s"}`} for{" "}
          <b>{q}</b> <span className="pill">{label} {label === "text" ? "search" : "filter"}</span>
        </p>
      )}

      <ol className="search-results">
        {(data?.results || []).map((r) => (
          <li key={r.slug}>
            <Link href={anchorHref(r)} className="sr-item">
              <span className="sr-title">{r.titleVi || r.title || "Không đề"}</span>
              <span className="sr-meta">{[r.dateText, r.place, r.group].filter(Boolean).join(" · ")}</span>
              {r.snippet && <span className="sr-snippet">{r.snippet}</span>}
            </Link>
          </li>
        ))}
      </ol>
      {q && !loading && data?.count === 0 && <p className="muted">No matches. Try the other mode, or a different word.</p>}
    </div>
  );
}

export default function SearchPage() {
  return <Suspense fallback={<div className="searchpage" />}><Results /></Suspense>;
}
