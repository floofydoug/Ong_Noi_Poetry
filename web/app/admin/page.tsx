"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const TOTAL_GROUPS = 298; // full corpus, for projections

type Data = {
  progress: any | null;
  errors: any[];
  library: {
    groups: number; poems: number; pages: number;
    confidence: Record<string, number>;
    sensitivity: Record<string, number>;
    tokens: { in: number; out: number }; billedUsd: number;
    items: any[];
  };
  serverTime: string;
};

const fmt = (n: number) => n.toLocaleString();
const secs = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`);

export default function AdminDashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<any>(null);

  async function tick() {
    try {
      const r = await fetch("/api/analysis/progress", { cache: "no-store" });
      setData(await r.json());
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  useEffect(() => {
    tick();
    timer.current = setInterval(tick, 2000); // live poll
    return () => clearInterval(timer.current);
  }, []);

  if (!data) return <div className="admin"><p>Loading analysis dashboard…</p></div>;

  const p = data.progress;
  const lib = data.library;
  const running = p?.status === "running";
  const doneN = (p?.completed?.length || 0) + (p?.failed?.length || 0);
  const totalN = p?.queued?.length || 0;
  const pct = totalN ? Math.round((doneN / totalN) * 100) : 0;
  const t = p?.totals || {};
  const projUsd = lib.groups ? (lib.billedUsd / lib.groups) * TOTAL_GROUPS : 0;

  return (
    <div className="admin dash">
      <div className="dash-top">
        <div>
          <h1>Analysis dashboard</h1>
          <span className="g-sub">live · polls every 2s · {err ? `⚠ ${err}` : "connected"}</span>
        </div>
        <div className="dash-top-right">
          <AdminToggle />
          <Link href="/" className="back">‹ all poems</Link>
        </div>
      </div>

      {/* ---- live run ---- */}
      <section className={`runcard ${running ? "live" : ""}`}>
        <div className="runhead">
          <span className={`dot ${running ? "on" : ""}`} />
          <strong>
            {p ? (running ? "Run in progress" : "Last run complete") : "No run yet"}
          </strong>
          {p && <span className="muted">{p.mode} · {p.model}</span>}
        </div>

        {p && (
          <>
            <div className="bar"><div className="fill" style={{ width: `${pct}%` }} /></div>
            <div className="barlbl">
              {doneN}/{totalN} groups · {pct}%
              {p.current && <> · now: <b>{p.current.group}</b> ({p.current.index}/{p.current.of})</>}
            </div>

            {p.mode === "batch" && p.batch && (
              <div className="batchline">
                Batch chunk <b>{p.batch.chunk}/{p.batch.chunks}</b> · {p.batch.status || "…"}
                {" · "}server: {p.batch.counts?.succeeded ?? 0} done, {p.batch.counts?.processing ?? 0} processing, {p.batch.counts?.errored ?? 0} errored
                {p.batch.batch_id && <span className="mono"> · {p.batch.batch_id}</span>}
              </div>
            )}

            <div className="statgrid">
              <Stat k="OK" v={t.ok ?? 0} />
              <Stat k="Failed" v={t.fail ?? 0} warn={!!t.fail} />
              <Stat k="Poems found" v={t.poems ?? 0} />
              <Stat k="Avg / group" v={t.avg_seconds ? `${t.avg_seconds}s` : "—"} />
              <Stat k="Elapsed" v={secs(t.elapsed_s ?? 0)} />
              <Stat k="Tokens in/out" v={`${fmt(t.in_tokens ?? 0)} / ${fmt(t.out_tokens ?? 0)}`} />
              <Stat k="Billed (run)" v={`$${(t.billed_usd ?? 0).toFixed(3)}`} />
            </div>

            {p.completed?.length > 0 && (
              <table className="rtable">
                <thead><tr><th>group</th><th>poems</th><th>sec</th><th>conf</th><th>out tok</th><th></th></tr></thead>
                <tbody>
                  {[...p.completed].reverse().map((c: any) => (
                    <tr key={c.group}>
                      <td className="mono">{c.group}</td>
                      <td>{c.poems}</td>
                      <td>{c.seconds != null ? `${c.seconds}s` : "—"}</td>
                      <td>{(c.confidence || []).map((x: string, i: number) => <span key={i} className={`cf ${x}`}>{x?.[0] ?? "?"}</span>)}</td>
                      <td>{fmt(c.out_tokens)}</td>
                      <td><Link href={`/poems/${c.group}`} className="mini">view →</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>

      {/* ---- cumulative library ---- */}
      <section>
        <h2 className="sec-h">Library totals</h2>
        <div className="statgrid big">
          <Stat k="Groups analyzed" v={`${lib.groups} / ${TOTAL_GROUPS}`} />
          <Stat k="Poems" v={fmt(lib.poems)} />
          <Stat k="Pages" v={fmt(lib.pages)} />
          <Stat k="Total tokens" v={`${fmt(lib.tokens.in)} in / ${fmt(lib.tokens.out)} out`} />
          <Stat k="Spent so far" v={`$${lib.billedUsd.toFixed(2)}`} />
          <Stat k="Projected full corpus" v={`≈ $${projUsd.toFixed(2)}`} />
        </div>
        <div className="breakdowns">
          <Breakdown title="Confidence" data={lib.confidence} order={["high", "medium", "low"]} />
          <Breakdown title="Sensitivity" data={lib.sensitivity} order={["none", "low", "medium", "high"]} />
        </div>
      </section>

      {/* ---- all analyzed groups ---- */}
      <section>
        <h2 className="sec-h">Analyzed groups ({lib.items.length})</h2>
        <table className="rtable full">
          <thead><tr><th>group</th><th>pages</th><th>poems</th><th>titles</th><th>conf</th><th>sens</th><th></th></tr></thead>
          <tbody>
            {lib.items.map((it) => (
              <tr key={it.group}>
                <td className="mono">{it.group}</td>
                <td>{it.pages}</td>
                <td>{it.poems}</td>
                <td className="titles">{it.titles.join(" · ")}</td>
                <td>{it.confidence.map((x: string, i: number) => <span key={i} className={`cf ${x}`}>{x?.[0] ?? "?"}</span>)}</td>
                <td>{it.sensitivity.map((x: string, i: number) => x !== "none" ? <span key={i} className={`sv ${x}`}>{x}</span> : null)}</td>
                <td><Link href={`/poems/${it.group}`} className="mini">view →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ---- errors ---- */}
      <section>
        <h2 className="sec-h">Errors log ({data.errors.length})</h2>
        {data.errors.length === 0 ? (
          <p className="muted">No errors logged.</p>
        ) : (
          <table className="rtable">
            <thead><tr><th>time</th><th>group</th><th>kind</th><th>detail</th></tr></thead>
            <tbody>
              {[...data.errors].reverse().map((e: any, i: number) => (
                <tr key={i}>
                  <td className="mono">{(e.timestamp || "").slice(11, 19)}</td>
                  <td className="mono">{e.group}</td>
                  <td><span className="cf low">{e.kind || e.result_type}</span></td>
                  <td className="titles">{e.error || e.result_type || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function AdminToggle() {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => { fetch("/api/me").then((r) => r.json()).then((d) => setEmail(d.email)); }, []);
  async function logout() { await fetch("/api/admin/logout", { method: "POST" }); location.href = "/"; }
  return (
    <span className="admin-id">
      {email && <span className="muted">{email}</span>}
      <button className="admtoggle on" onClick={logout} title="Sign out">log out</button>
      <Link href="/admin/edits" className="admtoggle">edit review</Link>
      <Link href="/admin/team" className="admtoggle">invite admins</Link>
    </span>
  );
}

function Stat({ k, v, warn }: { k: string; v: any; warn?: boolean }) {
  return (
    <div className={`stat ${warn ? "warn" : ""}`}>
      <div className="sv">{v}</div>
      <div className="sk">{k}</div>
    </div>
  );
}

function Breakdown({ title, data, order }: { title: string; data: Record<string, number>; order: string[] }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="bd">
      <div className="bd-h">{title}</div>
      {order.map((k) => (
        <div key={k} className="bd-row">
          <span className="bd-k">{k}</span>
          <span className="bd-bar"><span className={`bd-fill ${k}`} style={{ width: `${(data[k] / total) * 100}%` }} /></span>
          <span className="bd-n">{data[k]}</span>
        </div>
      ))}
    </div>
  );
}
