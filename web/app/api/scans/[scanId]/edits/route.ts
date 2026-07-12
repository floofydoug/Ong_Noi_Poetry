import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// One fetch per poem page: for every MODIFIED poem in this scan, the current DB lines (so live
// edits + re-analyses show), plus which lines are unverified and whether a re-analysis is pending.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ scanId: string }> }) {
  const { scanId } = await params;
  const poems = await prisma.poem.findMany({
    where: { slug: { startsWith: `${scanId}-p` } },
    select: {
      slug: true, lines: true, titleVi: true, title: true, reanalyzedAt: true, reanalysisVerified: true,
      croppedImage: true,
      edits: { where: { reverted: false }, orderBy: { createdAt: "asc" }, select: { lineIndex: true, verified: true } },
    },
  });
  const out: Record<number, any> = {};
  for (const p of poems) {
    const idx = parseInt(p.slug.match(/-p(\d+)$/)?.[1] || "0", 10) - 1;
    const editedLines: Record<number, boolean> = {};
    for (const e of p.edits) editedLines[e.lineIndex] = e.verified;
    const hasRe = !!p.reanalyzedAt;
    if (!hasRe && !p.croppedImage && Object.keys(editedLines).length === 0) continue;
    out[idx] = {
      lines: p.lines, titleVi: p.titleVi, title: p.title, editedLines, croppedImage: p.croppedImage,
      reanalysis: hasRe ? { at: p.reanalyzedAt, verified: p.reanalysisVerified } : null,
    };
  }
  return NextResponse.json({ poems: out });
}
