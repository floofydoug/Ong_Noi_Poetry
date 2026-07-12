"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAdmin } from "@/lib/useAdmin";

type Tag = { id: string; kind: string; label: string; verified: boolean; flagged: boolean; source: string };
const KINDS = ["subject", "person", "place", "form"] as const;

export default function PoemTags({ poemSlug }: { poemSlug: string }) {
  const [subjects, setSubjects] = useState<Tag[]>([]);
  const [people, setPeople] = useState<Tag[]>([]);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<(typeof KINDS)[number]>("subject");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isAdmin = useAdmin();

  async function admin(t: Tag, action: "verify" | "remove") {
    if (action === "remove" && !confirm(`Remove "${t.label}"?`)) return;
    await fetch("/api/admin/tags", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ poemSlug, kind: t.kind === "person" ? "person" : "tag", id: t.id, action }),
    });
    await load();
  }

  async function load() {
    const r = await fetch(`/api/poems/${poemSlug}/tags`, { cache: "no-store" });
    if (!r.ok) return;
    const d = await r.json();
    setSubjects(d.subjects || []);
    setPeople(d.people || []);
  }
  useEffect(() => { load(); }, [poemSlug]);

  async function add() {
    if (!label.trim() || busy) return;
    setBusy(true);
    try {
      await fetch(`/api/poems/${poemSlug}/tags`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: label.trim(), kind }),
      });
      setLabel(""); await load(); inputRef.current?.focus();
    } finally { setBusy(false); }
  }

  async function flag(t: Tag) {
    if (!confirm(`Flag "${t.label}" as incorrect? An admin will review it for removal.`)) return;
    await fetch(`/api/poems/${poemSlug}/tags/flag`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: t.kind === "person" ? "person" : "tag", id: t.id }),
    });
    await load();
  }

  const all = [...people, ...subjects];

  return (
    <div className="ptags">
      <div className="ptags-row">
        {all.map((t) => (
          <span key={`${t.kind}:${t.id}`}
            className={`ctag k-${t.kind} ${t.verified ? "" : "unverified"} ${t.flagged ? "flagged" : ""}`}
            title={t.flagged ? "flagged for removal" : t.verified ? t.kind : `${t.kind} · unverified`}>
            <Link className="ctag-label"
              href={`/search?mode=tag&q=${encodeURIComponent(t.label)}&kind=${t.kind}`}>{t.label}</Link>
            {isAdmin ? (
              <>
                {(!t.verified || t.flagged) && (
                  <button className="ctag-adm ok" onClick={() => admin(t, "verify")} title="verify (approve)">✓</button>
                )}
                <button className="ctag-adm rm" onClick={() => admin(t, "remove")} title="remove">×</button>
              </>
            ) : (
              !t.flagged && (
                <button className="ctag-x" onClick={() => flag(t)} aria-label="flag as incorrect"
                  title="suggest removal">×</button>
              )
            )}
          </span>
        ))}

        {adding ? (
          <span className="ctag-add">
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <input ref={inputRef} autoFocus value={label} onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") add(); if (e.key === "Escape") setAdding(false); }}
              placeholder="add a tag…" />
            <button onClick={add} disabled={busy}>add</button>
            <button className="ghost" onClick={() => setAdding(false)}>done</button>
          </span>
        ) : (
          <button className="ctag-newbtn" onClick={() => setAdding(true)}>+ tag</button>
        )}
      </div>
    </div>
  );
}
