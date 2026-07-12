import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth";

// Admin-only. The verification queue: every live edit still awaiting approval.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getCurrentAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const edits = await prisma.poemEdit.findMany({
    where: { verified: false, reverted: false },
    orderBy: { createdAt: "desc" }, take: 300,
    include: { poem: { select: { slug: true, titleVi: true, title: true } } },
  });
  const rows = edits.map((e) => ({
    id: e.id, lineIndex: e.lineIndex, field: e.field, before: e.before, after: e.after,
    editorLabel: e.editorLabel, createdAt: e.createdAt,
    poemSlug: e.poem.slug, group: e.poem.slug.replace(/-p\d+$/, ""),
    poemTitle: e.poem.titleVi || e.poem.title || "Không đề",
  }));
  return NextResponse.json({ count: rows.length, edits: rows });
}
