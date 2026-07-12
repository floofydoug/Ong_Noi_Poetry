import { prisma } from "./prisma";
import type { Scan, Poem } from "./types";

// Data layer now reads the DATABASE (was gitignored JSON). Soft-deleted poems are excluded.
function mapPoem(p: any): Poem {
  return {
    title: p.title ?? null,
    title_vi: p.titleVi ?? null,
    date_text: p.dateText ?? null,
    place: p.place ?? null,
    author: p.author ?? null,
    lines: (p.lines as any[]) ?? [],
    tags: [], // tags/people load via the /api/.../tags endpoint
    marginalia: (p.marginalia ?? []).map((m: any) => ({ kind: m.kind ?? "", text: m.text ?? "", translation: m.translation ?? null })),
    footnotes: (p.footnotes ?? []).map((f: any) => ({ anchor: f.anchor ?? "", note: f.note ?? "" })),
    confidence: p.confidence ?? "",
    uncertain_spans: p.uncertainSpans ?? [],
    visibility: p.visibility,
    sensitivity: { level: p.sensitivityLevel ?? "none", reason: p.sensitivityReason ?? null },
    boundary_reason: p.boundaryReason ?? undefined,
    notes: p.notes ?? null,
  };
}

// Gallery: light — only what the cards need (no lines/footnotes).
export async function getScans(): Promise<Scan[]> {
  const sets = await prisma.set.findMany({
    orderBy: { slug: "asc" },
    include: {
      poems: {
        where: { deletedAt: null }, orderBy: { sortOrder: "asc" },
        select: { titleVi: true, title: true, dateText: true, place: true, visibility: true, sensitivityLevel: true },
      },
    },
  });
  return sets.filter((s) => s.poems.length).map((s) => ({
    scanId: s.slug, filename: s.slug, pageNotes: null,
    poems: s.poems.map((p) => ({
      title: p.title, title_vi: p.titleVi, date_text: p.dateText, place: p.place, author: null,
      lines: [], tags: [], marginalia: [], footnotes: [], confidence: "", uncertain_spans: [],
      visibility: p.visibility, sensitivity: { level: p.sensitivityLevel ?? "none", reason: null }, notes: null,
    })),
  }));
}

// Poem page: full data for one sitting.
export async function getScan(scanId: string): Promise<Scan | undefined> {
  const set = await prisma.set.findUnique({
    where: { slug: scanId },
    include: {
      poems: {
        where: { deletedAt: null }, orderBy: { sortOrder: "asc" },
        include: { footnotes: { orderBy: { sortOrder: "asc" } }, marginalia: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });
  if (!set) return undefined;
  return { scanId: set.slug, filename: set.slug, pageNotes: null, poems: set.poems.map(mapPoem) };
}
