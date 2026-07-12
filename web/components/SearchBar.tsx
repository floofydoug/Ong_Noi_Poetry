"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Top search bar: dropdown chooses a fuzzy TEXT search or a TAG/person FILTER.
export default function SearchBar({ initialQ = "", initialMode = "text", big = false }:
  { initialQ?: string; initialMode?: string; big?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState(initialQ);
  const [mode, setMode] = useState(initialMode === "tag" ? "tag" : "text");

  function go(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    router.push(`/search?q=${encodeURIComponent(q.trim())}&mode=${mode}`);
  }

  return (
    <form className={`searchbar ${big ? "big" : ""}`} onSubmit={go}>
      <select value={mode} onChange={(e) => setMode(e.target.value)} aria-label="search mode">
        <option value="text">Search text</option>
        <option value="tag">Filter by tag / person</option>
      </select>
      <input
        value={q} onChange={(e) => setQ(e.target.value)}
        placeholder={mode === "tag" ? "tag or person name…" : "search words in poems…"}
      />
      <button type="submit">Search</button>
    </form>
  );
}
