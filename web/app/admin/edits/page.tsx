"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

type Edit = {
  id: string; lineIndex: number; field: string; before: string; after: string;
  editorLabel: string; createdAt: string; poemSlug: string; group: string; poemTitle: string;
};

type Re = { id: string; proposed: any; editorLabel: string; createdAt: string; poemSlug: string;
  group: string; poemTitle: string; currentLines: any };

export default function EditsQueue() {
  const [edits, setEdits] = useState<Edit[]>([]);
  const [res, setRes] = useState<Re[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [a, b] = await Promise.all([
      fetch("/api/admin/edits", { cache: "no-store" }).then((r) => r.ok ? r.json() : { edits: [] }),
      fetch("/api/admin/reanalyses", { cache: "no-store" }).then((r) => r.ok ? r.json() : { items: [] }),
    ]);
    setEdits(a.edits || []); setRes(b.items || []); setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function act(id: string, action: "verify" | "revert") {
    await fetch(`/api/admin/edits/${id}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }),
    });
    setEdits((e) => e.filter((x) => x.id !== id));
  }
  async function actRe(id: string, action: "approve" | "reject") {
    await fetch(`/api/admin/reanalyses/${id}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }),
    });
    setRes((e) => e.filter((x) => x.id !== id));
  }

  return (
    <div className="admin">
      <div className="dash-top">
        <h1>Edit review ({edits.length})</h1>
        <Link href="/admin" className="back">‹ dashboard</Link>
      </div>
      <p className="muted">Edits apply to the poem immediately. Verify to approve, or revert to roll the line back.</p>

      {res.length > 0 && (
        <>
          <h2 className="sec-h">Re-analyses ({res.length})</h2>
          <ul className="editq">
            {res.map((r) => (
              <li key={r.id} className="editq-item">
                <div className="editq-where">
                  <Link href={`/poems/${r.group}`}>{r.poemTitle}</Link>
                  <span className="mono"> · re-analyzed by {r.editorLabel} · {new Date(r.createdAt).toLocaleString()}</span>
                </div>
                <div className="re-compare">
                  <div><div className="re-col-h">current</div>{(r.currentLines || []).map((l: any, i: number) => <div key={i} className="from-line">{l.vi}</div>)}</div>
                  <div><div className="re-col-h">proposed</div>{(r.proposed.lines || []).map((l: any, i: number) => <div key={i} className="to-line">{l.vi}</div>)}</div>
                </div>
                <div className="editq-acts">
                  <button className="btn primary" onClick={() => actRe(r.id, "approve")}>✓ approve (replace poem)</button>
                  <button className="btn ghost" onClick={() => actRe(r.id, "reject")}>✕ reject</button>
                </div>
              </li>
            ))}
          </ul>
          <h2 className="sec-h">Line edits ({edits.length})</h2>
        </>
      )}

      {loading ? <p className="muted">Loading…</p> : edits.length === 0 ? (
        <p className="muted">Nothing pending — all edits verified. 🎉</p>
      ) : (
        <ul className="editq">
          {edits.map((e) => (
            <li key={e.id} className="editq-item">
              <div className="editq-where">
                <Link href={`/poems/${e.group}#poem-${parseInt(e.poemSlug.match(/-p(\d+)$/)?.[1] || "1") - 1}`}>
                  {e.poemTitle}
                </Link>
                <span className="mono"> · line {e.lineIndex + 1} · {e.editorLabel} · {new Date(e.createdAt).toLocaleString()}</span>
              </div>
              <div className="editq-diff">
                <div className="from">{e.before || <em>(empty)</em>}</div>
                <div className="to">{e.after}</div>
              </div>
              <div className="editq-acts">
                <button className="btn primary" onClick={() => act(e.id, "verify")}>✓ verify</button>
                <button className="btn ghost" onClick={() => act(e.id, "revert")}>⤺ revert</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
