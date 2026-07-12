import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// A visitor flags a tag as incorrect (suggest removal). Marks it flagged for admin review.
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const poem = await prisma.poem.findUnique({ where: { slug }, select: { id: true } });
  if (!poem) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { kind, id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  if (kind === "person") {
    await prisma.poemPerson.update({
      where: { poemId_personId: { poemId: poem.id, personId: id } },
      data: { flagged: true, flagCount: { increment: 1 } },
    });
  } else {
    await prisma.poemTag.update({
      where: { poemId_tagId: { poemId: poem.id, tagId: id } },
      data: { flagged: true, flagCount: { increment: 1 } },
    });
  }
  return NextResponse.json({ ok: true });
}
