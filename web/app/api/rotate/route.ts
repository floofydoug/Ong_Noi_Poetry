import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";

// Rotating the scan re-encodes the display JPEG in place AND records the cumulative
// rotation in data/scan-rotations.json, so a later `build_derivatives.py` rebuild
// re-applies it instead of reverting the scan to its sideways original.
export const runtime = "nodejs";

const SCAN_DIR = path.join(process.cwd(), "public", "scans");
const ROTATIONS = path.join(process.cwd(), "..", "data", "scan-rotations.json");
const SCAN_ID = /^set-[a-z0-9-]+$/; // guard against path traversal

async function readRotations(): Promise<Record<string, number>> {
  try {
    return JSON.parse(await fs.readFile(ROTATIONS, "utf8"));
  } catch {
    return {};
  }
}

export async function POST(req: Request) {
  const { scanId, dir } = await req.json().catch(() => ({}));
  if (!scanId || !SCAN_ID.test(scanId)) {
    return NextResponse.json({ error: "bad scanId" }, { status: 400 });
  }
  const delta = dir === "ccw" ? 270 : 90; // clockwise by default
  const file = path.join(SCAN_DIR, `${scanId}.jpg`);

  try {
    const buf = await fs.readFile(file); // read first — can't stream in/out same file
    const rotated = await sharp(buf).rotate(delta).jpeg({ quality: 85 }).toBuffer();
    await fs.writeFile(file, rotated);

    const rotations = await readRotations();
    const total = ((rotations[scanId] || 0) + delta) % 360;
    rotations[scanId] = total;
    await fs.writeFile(ROTATIONS, JSON.stringify(rotations, null, 2));

    return NextResponse.json({ ok: true, scanId, rotation: total });
  } catch (e) {
    return NextResponse.json(
      { error: `rotate failed: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}
