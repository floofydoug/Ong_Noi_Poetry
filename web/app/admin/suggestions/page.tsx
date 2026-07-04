"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Suggestion } from "@/lib/types";
import { listSuggestions, setStatus } from "@/lib/suggestions";
import { hasSupabase } from "@/lib/supabaseClient";

export default function AdminSuggestions() {
  const [rows, setRows] = useState<Suggestion[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function refresh() {
    setRows(await listSuggestions());
    setLoaded(true);
  }
  useEffect(() => { refresh(); }, []);

  async function act(id: string, status: Suggestion["status"]) {
    await setStatus(id, status);
    refresh();
  }

  const pending = rows.filter((r) => r.status === "pending");

  return (
    <div className="admin">
      <p><Link href="/" className="back">‹ gallery</Link></p>
      <h1>Suggestions</h1>
      <p className="g-sub">
        {pending.length} pending · {rows.length} total ·{" "}
        {hasSupabase ? "stored in Supabase" : "stored on this device (localStorage) until Supabase is wired"}
      </p>

      {loaded && rows.length === 0 && (
        <p className="hint">No suggestions yet. Open a poem, tap “suggest edits”, highlight Vietnamese, and speak a correction.</p>
      )}

      {rows.map((s) => (
        <div className="sitem" key={s.id}>
          <div className="where">
            <Link href={`/poems/${s.scanId}`}>{s.scanId}</Link> · poem {s.poemIndex + 1} · line {s.lineIndex + 1} · {s.status}
          </div>
          <div className="diff">
            <span className="from">{s.selectedText}</span> → <span className="to">{s.suggestedText}</span>
          </div>
          <div className="hint">in: “{s.originalText}”{s.spokenText ? ` · heard: “${s.spokenText}”` : ""}</div>
          {s.status === "pending" && (
            <div className="acts">
              <button className="btn primary" onClick={() => act(s.id, "accepted")}>accept</button>
              <button className="btn ghost" onClick={() => act(s.id, "rejected")}>reject</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
