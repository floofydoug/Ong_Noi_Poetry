import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getCurrentAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const recs = await prisma.poemReanalysis.findMany({
    where: { status: "applied" }, orderBy: { createdAt: "desc" }, take: 100,
    include: { poem: { select: { slug: true, titleVi: true, title: true, lines: true } } },
  });
  return NextResponse.json({
    count: recs.length,
    items: recs.map((r) => ({
      id: r.id, proposed: r.proposed, editorLabel: r.editorLabel, createdAt: r.createdAt,
      poemSlug: r.poem.slug, group: r.poem.slug.replace(/-p\d+$/, ""),
      poemTitle: r.poem.titleVi || r.poem.title || "Không đề", currentLines: r.poem.lines,
    })),
  });
}
