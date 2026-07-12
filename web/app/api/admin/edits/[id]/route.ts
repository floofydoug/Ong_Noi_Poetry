import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth";

// Admin-only. verify = approve an edit (clears the pending marker).
// revert = roll the line back to this edit's `before`, live, and mark the edit reverted.
export const runtime = "nodejs";

type Line = { vi: string; en: string };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const { action } = await req.json().catch(() => ({}));
  const edit = await prisma.poemEdit.findUnique({ where: { id }, include: { poem: { select: { id: true, lines: true } } } });
  if (!edit) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (action === "verify") {
    await prisma.poemEdit.update({ where: { id }, data: { verified: true, verifiedById: admin.id, verifiedAt: new Date() } });
    return NextResponse.json({ ok: true, verified: true });
  }

  if (action === "revert") {
    const lines = (edit.poem.lines as Line[]) || [];
    if (lines[edit.lineIndex]) (lines[edit.lineIndex] as any)[edit.field] = edit.before;
    const transcription = lines.map((l) => l.vi).filter(Boolean).join("\n");
    await prisma.$transaction([
      prisma.poemEdit.update({ where: { id }, data: { reverted: true } }),
      prisma.poem.update({ where: { id: edit.poem.id }, data: { lines: lines as any, transcription } }),
    ]);
    return NextResponse.json({ ok: true, reverted: true, restored: edit.before });
  }

  return NextResponse.json({ error: "bad action" }, { status: 400 });
}
