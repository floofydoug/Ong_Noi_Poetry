import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Admin-only. Verify (approve a community tag / clear a flag) or remove a poem tag/person link.
export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!(await getCurrentAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { poemSlug, kind, id, action } = await req.json().catch(() => ({}));
  const poem = await prisma.poem.findUnique({ where: { slug: poemSlug }, select: { id: true } });
  if (!poem || !id) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const person = kind === "person";
  if (action === "remove") {
    if (person) await prisma.poemPerson.delete({ where: { poemId_personId: { poemId: poem.id, personId: id } } });
    else await prisma.poemTag.delete({ where: { poemId_tagId: { poemId: poem.id, tagId: id } } });
  } else { // verify: approve + clear any flag
    const data = { verified: true, flagged: false, flagCount: 0 };
    if (person) await prisma.poemPerson.update({ where: { poemId_personId: { poemId: poem.id, personId: id } }, data });
    else await prisma.poemTag.update({ where: { poemId_tagId: { poemId: poem.id, tagId: id } }, data });
  }
  return NextResponse.json({ ok: true });
}
