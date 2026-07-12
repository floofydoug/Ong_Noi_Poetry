"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

// Sits at the top of the home page. Polls the analysis endpoint and, whenever a run
// is active, shows a live strip (current group, progress, avg time) linking to the
// full dashboard. Renders nothing when idle, so the home page stays clean.
export default function LiveBanner() {
  const [p, setP] = useState<any | null>(null);

  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const r = await fetch("/api/analysis/progress", { cache: "no-store" });
        const d = await r.json();
        if (alive) setP(d.progress);
      } catch {
        /* ignore transient errors */
      }
    }
    tick();
    const id = setInterval(tick, 2000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (!p || p.status !== "running") return null;

  const done = (p.completed?.length || 0) + (p.failed?.length || 0);
  const total = p.queued?.length || 0;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const cur = p.current?.group;
  const avg = p.totals?.avg_seconds;

  return (
    <Link href="/admin" className="livebanner">
      <span className="lb-dot" />
      <span className="lb-txt">
        Analyzing{cur ? <> <b>{cur}</b></> : ""} · {done}/{total} groups
        {avg ? <> · ~{avg}s each</> : ""}
      </span>
      <span className="lb-bar"><span className="lb-fill" style={{ width: `${pct}%` }} /></span>
      <span className="lb-cta">live dashboard ›</span>
    </Link>
  );
}
