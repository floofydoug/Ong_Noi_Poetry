import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth";

// GET → current lines + per-line edit status (for the "pending" markers) + history.
// POST → apply a line edit LIVE and log a PoemEdit (verified if an admin made it).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Line = { vi: string; en: string };

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const poem = await prisma.poem.findUnique({ where: { slug }, select: { id: true, lines: true, originalLines: true } });
  if (!poem) return NextResponse.json({ error: "not found" }, { status: 404 });
  const edits = await prisma.poemEdit.findMany({ where: { poemId: poem.id }, orderBy: { createdAt: "desc" } });
  // latest non-reverted edit per line → status marker
  const status: Record<string, { verified: boolean; editorLabel: string }> = {};
  for (const e of [...edits].reverse()) {
    if (e.reverted) { delete status[`${e.lineIndex}:${e.field}`]; continue; }
    status[`${e.lineIndex}:${e.field}`] = { verified: e.verified, editorLabel: e.editorLabel };
  }
  return NextResponse.json({ lines: poem.lines, originalLines: poem.originalLines, status, edits });
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const admin = await getCurrentAdmin();
  const body = await req.json().catch(() => ({}));
  const lineIndex = Number(body.lineIndex);
  const field = body.field === "en" ? "en" : "vi";
  const after = (body.after ?? "").toString();
  const poem = await prisma.poem.findUnique({ where: { slug }, select: { id: true, lines: true } });
  if (!poem || !Number.isInteger(lineIndex)) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const lines = (poem.lines as Line[]) || [];
  if (lineIndex < 0 || lineIndex >= lines.length) return NextResponse.json({ error: "line out of range" }, { status: 400 });
  const before = (lines[lineIndex] as any)[field] ?? "";
  if (after === before) return NextResponse.json({ ok: true, unchanged: true });

  (lines[lineIndex] as any)[field] = after;
  const transcription = lines.map((l) => l.vi).filter(Boolean).join("\n");
  await prisma.$transaction([
    prisma.poemEdit.create({
      data: {
        poemId: poem.id, lineIndex, field, before, after,
        editorLabel: admin?.email || "guest", editorId: admin?.id ?? null,
        verified: !!admin, verifiedById: admin?.id ?? null, verifiedAt: admin ? new Date() : null,
      },
    }),
    prisma.poem.update({ where: { id: poem.id }, data: { lines: lines as any, transcription } }),
  ]);
  return NextResponse.json({ ok: true, verified: !!admin });
}
