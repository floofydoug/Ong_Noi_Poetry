import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Community tags for one poem. GET lists subject + people tags; POST adds one
// (guest-added → source='community', verified=false, shown immediately as "unverified").
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);

async function poemBySlug(slug: string) {
  return prisma.poem.findUnique({ where: { slug }, select: { id: true } });
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const poem = await poemBySlug(slug);
  if (!poem) return NextResponse.json({ error: "not found" }, { status: 404 });
  const [pt, pp] = await Promise.all([
    prisma.poemTag.findMany({ where: { poemId: poem.id }, include: { tag: true } }),
    prisma.poemPerson.findMany({ where: { poemId: poem.id }, include: { person: true } }),
  ]);
  const subjects = pt.map((x) => ({
    id: x.tagId, kind: x.tag.kind || "subject", label: x.tag.label || x.tag.slug,
    verified: x.verified, flagged: x.flagged, source: x.source,
  }));
  const people = pp.map((x) => ({
    id: x.personId, kind: "person", label: x.person.canonicalName,
    verified: x.verified, flagged: x.flagged, source: x.source,
  }));
  return NextResponse.json({ subjects, people });
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const poem = await poemBySlug(slug);
  if (!poem) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const label = (body.label || "").trim();
  const kind = ["subject", "person", "place", "form"].includes(body.kind) ? body.kind : "subject";
  if (!label) return NextResponse.json({ error: "empty label" }, { status: 400 });

  if (kind === "person") {
    // reuse an existing person if the name matches; else create an unverified community person
    let person = await prisma.person.findFirst({
      where: { OR: [{ canonicalName: { equals: label, mode: "insensitive" } }, { aliases: { has: label } }] },
      select: { id: true },
    });
    if (!person) {
      person = await prisma.person.create({
        data: { slug: `community-${slugify(label)}-${Math.random().toString(36).slice(2, 7)}`,
          canonicalName: label, aliases: [label], verified: false },
        select: { id: true },
      });
    }
    await prisma.poemPerson.upsert({
      where: { poemId_personId: { poemId: poem.id, personId: person.id } },
      update: {},
      create: { poemId: poem.id, personId: person.id, nameAsWritten: label, role: "mentioned",
        source: "community", verified: false, confidence: "proposed" },
    });
  } else {
    const tag = await prisma.tag.upsert({
      where: { slug: slugify(label) }, update: {},
      create: { slug: slugify(label), label, kind },
    });
    await prisma.poemTag.upsert({
      where: { poemId_tagId: { poemId: poem.id, tagId: tag.id } },
      update: {},
      create: { poemId: poem.id, tagId: tag.id, source: "community", verified: false },
    });
  }
  return NextResponse.json({ ok: true });
}
