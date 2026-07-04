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
    return {
      scanId: d._meta.scan_id as string,
      filename: (d._meta.original_filename as string) || "",
      poems: d.poems || [],
      pageNotes: d.page_notes ?? null,
    };
  });
}

export function getScan(scanId: string): Scan | undefined {
  return getScans().find((s) => s.scanId === scanId);
}
