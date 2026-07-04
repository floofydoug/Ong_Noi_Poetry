"use client";
import type { Suggestion } from "./types";
import { supabase } from "./supabaseClient";

// Suggestions default to on-device storage (works offline, private to this device).
// If Supabase env is configured, they persist to the `edit_suggestions` table instead.
const KEY = "ongnoi.suggestions.v1";

function localAll(): Suggestion[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}
function localWrite(all: Suggestion[]) {
  localStorage.setItem(KEY, JSON.stringify(all));
}

function rid(): string {
  return "s_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function saveSuggestion(
  s: Omit<Suggestion, "id" | "status" | "createdAt">
): Promise<Suggestion> {
  const full: Suggestion = {
    ...s,
    id: rid(),
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  if (supabase) {
    const { error } = await supabase.from("edit_suggestions").insert({
      scan_id: full.scanId,
      poem_index: full.poemIndex,
      line_index: full.lineIndex,
      original_text: full.originalText,
      selected_text: full.selectedText,
      suggested_text: full.suggestedText,
      spoken_text: full.spokenText,
      status: full.status,
    });
    if (error) throw error;
  } else {
    localWrite([full, ...localAll()]);
  }
  return full;
}

export async function listSuggestions(scanId?: string): Promise<Suggestion[]> {
  if (supabase) {
    let q = supabase.from("edit_suggestions").select("*").order("created_at", { ascending: false });
    if (scanId) q = q.eq("scan_id", scanId);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map((r): Suggestion => ({
      id: r.id,
      scanId: r.scan_id,
      poemIndex: r.poem_index,
      lineIndex: r.line_index,
      originalText: r.original_text,
      selectedText: r.selected_text,
      suggestedText: r.suggested_text,
      spokenText: r.spoken_text,
      status: r.status,
      createdAt: r.created_at,
    }));
  }
  const all = localAll();
  return scanId ? all.filter((s) => s.scanId === scanId) : all;
}

export async function setStatus(id: string, status: Suggestion["status"]) {
  if (supabase) {
    await supabase.from("edit_suggestions").update({ status }).eq("id", id);
  } else {
    localWrite(localAll().map((s) => (s.id === id ? { ...s, status } : s)));
  }
}
