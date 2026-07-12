import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth";

// Admin-only. approve → replace the poem with the re-analyzed version (old lines stay in history
// via originalLines / edits). reject → discard.
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const { action } = await req.json().catch(() => ({}));
  const rec = await prisma.poemReanalysis.findUnique({ where: { id } });
  if (!rec) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (action === "approve") {
    // the re-analysis is already live — just clear the "unverified" flag
    await prisma.$transaction([
      prisma.poem.update({ where: { id: rec.poemId }, data: { reanalysisVerified: true } }),
      prisma.poemReanalysis.update({ where: { id }, data: { status: "approved", reviewedById: admin.id, reviewedAt: new Date() } }),
    ]);
    return NextResponse.json({ ok: true, approved: true });
  }
  if (action === "reject") {
    // roll the poem back to its pre-re-analysis state
    const prev = (rec.previous as any) || {};
    const lines = prev.lines || [];
    await prisma.$transaction([
      prisma.poem.update({
        where: { id: rec.poemId },
        data: {
          lines, titleVi: prev.titleVi ?? null, title: prev.title ?? null,
          dateText: prev.dateText ?? null, place: prev.place ?? null, author: prev.author ?? null,
          transcription: (lines as any[]).map((l) => l.vi).filter(Boolean).join("\n"),
          reanalyzedAt: null, reanalysisVerified: true, croppedImage: prev.croppedImage ?? null,
        },
      }),
      prisma.poemReanalysis.update({ where: { id }, data: { status: "rejected", reviewedById: admin.id, reviewedAt: new Date() } }),
    ]);
    return NextResponse.json({ ok: true, rejected: true });
  }
  return NextResponse.json({ error: "bad action" }, { status: 400 });
}
