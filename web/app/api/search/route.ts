import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Search poems. mode=text → accent-insensitive fuzzy match over title + body.
// mode=tag → poems carrying a subject/place/form tag OR (kind=person) a person.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = { slug: string; group: string; titleVi: string | null; title: string | null;
  dateText: string | null; place: string | null; snippet: string | null };

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const mode = url.searchParams.get("mode") === "tag" ? "tag" : "text";
  const kind = url.searchParams.get("kind") || "any"; // 'any' = match both people and tags
  if (!q) return NextResponse.json({ mode, q, results: [] });

  let results: Row[] = [];

  if (mode === "text") {
    const like = `%${q}%`;
    results = await prisma.$queryRaw<Row[]>`
      SELECT p.slug, s.slug AS "group", p."titleVi", p.title, p."dateText", p.place,
             left(regexp_replace(p.transcription, '\\s+', ' ', 'g'), 160) AS snippet
      FROM poems p JOIN sets s ON s.id = p."setId"
      WHERE p."deletedAt" IS NULL AND (
            unaccent(coalesce(p."titleVi",'')) ILIKE unaccent(${like})
         OR unaccent(coalesce(p.title,''))    ILIKE unaccent(${like})
         OR unaccent(coalesce(p.transcription,'')) ILIKE unaccent(${like}) )
      ORDER BY
        (unaccent(coalesce(p."titleVi",'')) ILIKE unaccent(${like})) DESC,
        similarity(unaccent(coalesce(p.transcription,'')), unaccent(${q})) DESC
      LIMIT 200`;
  } else {
    // tag filter. person / subject|place|form → that source only; otherwise match BOTH.
    const wantPeople = kind === "person" || !["subject", "place", "form"].includes(kind);
    const wantTags = kind !== "person";
    const byId = new Map<string, Row>();
    if (wantPeople) {
      const r = await prisma.$queryRaw<Row[]>`
        SELECT DISTINCT p.slug, s.slug AS "group", p."titleVi", p.title, p."dateText", p.place,
               left(regexp_replace(p.transcription, '\\s+', ' ', 'g'), 160) AS snippet
        FROM poems p JOIN sets s ON s.id = p."setId"
        JOIN poem_people pp ON pp."poemId" = p.id
        JOIN people pe ON pe.id = pp."personId"
        WHERE unaccent(pe."canonicalName") ILIKE unaccent(${q})
           OR EXISTS (SELECT 1 FROM unnest(pe.aliases) a WHERE unaccent(a) ILIKE unaccent(${q}))
        LIMIT 500`;
      for (const x of r) byId.set(x.slug, x);
    }
    if (wantTags) {
      const r = await prisma.$queryRaw<Row[]>`
        SELECT DISTINCT p.slug, s.slug AS "group", p."titleVi", p.title, p."dateText", p.place,
               left(regexp_replace(p.transcription, '\\s+', ' ', 'g'), 160) AS snippet
        FROM poems p JOIN sets s ON s.id = p."setId"
        JOIN poem_tags pt ON pt."poemId" = p.id
        JOIN tags t ON t.id = pt."tagId"
        WHERE t.slug = ${q.toLowerCase()} OR unaccent(coalesce(t.label,'')) ILIKE unaccent(${q})
        LIMIT 500`;
      for (const x of r) byId.set(x.slug, x);
    }
    results = [...byId.values()].sort((a, b) => a.slug.localeCompare(b.slug, undefined, { numeric: true }));
  }

  return NextResponse.json({ mode, q, kind, count: results.length, results });
}
