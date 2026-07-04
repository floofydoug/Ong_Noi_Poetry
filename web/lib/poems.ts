import fs from "fs";
import path from "path";
import type { Scan } from "./types";

// Transcriptions live outside web/ (private, gitignored) and are read at build time.
const DIR = path.join(process.cwd(), "..", "data", "transcriptions");

export function getScans(): Scan[] {
  if (!fs.existsSync(DIR)) return [];
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
  return files.map((f) => {
    const d = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
    const m = d._meta || {};
    // Supports both the old per-scan format (scan_id) and the new grouped format
    // (group + scan_ids, where A/B/C pages are analyzed together).
    const scanId: string = m.scan_id ?? m.group;
    const filename: string = m.original_filename ?? (m.scan_ids || []).join(", ") ?? m.group;
    return {
      scanId,
      filename,
      poems: d.poems || [],
      pageNotes: d.page_notes ?? null,
    };
  });
}

export function getScan(scanId: string): Scan | undefined {
  return getScans().find((s) => s.scanId === scanId);
}
