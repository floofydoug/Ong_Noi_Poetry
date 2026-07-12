import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";

// Live analysis dashboard data: the current/last run's progress (from the pipeline's local run
// file — only present on a machine actively running transcribe.py) and cumulative library stats
// computed from the DATABASE (the source of truth in prod), plus any logged errors.
export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // never cache — this is live state

const DATA = path.join(process.cwd(), "..", "data");

async function readJson<T>(p: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(p, "utf8")) as T;
  } catch {
    return fallback;
  }
}

// Corpus stats straight from the DB — mirrors what actually shipped to prod. (The old version
// scanned data/transcriptions/*.json on the dev machine, which don't exist on the server.)
async function library() {
  const [groups, poems, pages, confRows, sensRows, sets] = await Promise.all([
    prisma.set.count(),
    prisma.poem.count({ where: { deletedAt: null } }),
    prisma.scan.count(),
    prisma.poem.groupBy({ by: ["confidence"], where: { deletedAt: null }, _count: true }),
    prisma.poem.groupBy({ by: ["sensitivityLevel"], where: { deletedAt: null }, _count: true }),
    prisma.set.findMany({
      orderBy: { slug: "asc" },
      select: {
        slug: true,
        poems: {
          where: { deletedAt: null }, orderBy: { sortOrder: "asc" },
          select: { titleVi: true, title: true, confidence: true, sensitivityLevel: true },
        },
      },
    }),
  ]);
  const conf = { high: 0, medium: 0, low: 0 } as Record<string, number>;
  for (const r of confRows) { const k = r.confidence || ""; if (conf[k] !== undefined) conf[k] = r._count; }
  const sens = { none: 0, low: 0, medium: 0, high: 0 } as Record<string, number>;
  for (const r of sensRows) { const k = r.sensitivityLevel || "none"; if (sens[k] !== undefined) sens[k] = r._count; }
  const items = sets.map((s) => ({
    group: s.slug,
    scanIds: [] as string[],
    pages: 1,
    poems: s.poems.length,
    titles: s.poems.map((p) => p.titleVi || p.title || "Không đề"),
    confidence: s.poems.map((p) => p.confidence),
    sensitivity: s.poems.map((p) => p.sensitivityLevel || "none"),
    inTokens: 0, outTokens: 0, analyzedAt: null, model: null,
  }));
  return {
    groups, poems, pages,
    confidence: conf, sensitivity: sens,
    tokens: { in: 0, out: 0 }, billedUsd: 0, // per-run token cost isn't tracked in the DB
    items,
  };
}

export async function GET() {
  const [progress, errors, lib] = await Promise.all([
    readJson<any>(path.join(DATA, "analysis-progress.json"), null),
    readJson<any[]>(path.join(DATA, "analysis-errors.json"), []),
    library(),
  ]);
  return NextResponse.json({ progress, errors, library: lib, serverTime: new Date().toISOString() });
}
