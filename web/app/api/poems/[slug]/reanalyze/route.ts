import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { analyzeCrop } from "@/lib/analyze";
import { saveCrop } from "@/lib/storage";
import { getCurrentAdmin } from "@/lib/auth";

// Anyone may re-analyze a cropped poem (light rate limit for non-admins). The result is stored
// as a PENDING version for an admin to approve. The browser sends the already-processed crop.
export const runtime = "nodejs";
export const maxDuration = 60;

const PER_IP = 5;    // re-analyses per visitor per day
const PER_DAY = 100; // global daily ceiling

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  console.log(`[reanalyze] POST /api/poems/${slug}/reanalyze`);
  const poem = await prisma.poem.findUnique({
    where: { slug },
    select: { id: true, lines: true, titleVi: true, title: true, dateText: true, place: true, author: true, croppedImage: true },
  });
  if (!poem) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const image = (body.image || "").replace(/^data:image\/\w+;base64,/, "");
  if (!image) return NextResponse.json({ error: "no image" }, { status: 400 });

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
  const ipHash = createHash("sha256").update(ip).digest("hex");
  const admin = await getCurrentAdmin();

  if (!admin) {
    const since = new Date(); since.setHours(0, 0, 0, 0);
    const [mine, total] = await Promise.all([
      prisma.poemReanalysis.count({ where: { ipHash, createdAt: { gte: since } } }),
      prisma.poemReanalysis.count({ where: { createdAt: { gte: since } } }),
    ]);
    if (mine >= PER_IP)
      return NextResponse.json({ error: `You've reached today's re-analyze limit (${PER_IP}). Please try again tomorrow.` }, { status: 429 });
    if (total >= PER_DAY)
      return NextResponse.json({ error: "The site's daily re-analyze limit is reached. Please try again tomorrow." }, { status: 429 });
  }

  const context = typeof body.context === "string" ? body.context.slice(0, 1000) : undefined;
  let result;
  try {
    result = await analyzeCrop(image, context);
  } catch (e) {
    console.error(`[reanalyze] FAILED for ${slug}:`, (e as Error).message);
    return NextResponse.json({ error: `re-analysis failed: ${(e as Error).message}` }, { status: 500 });
  }

  const p = result.poem;
  const lines = p.lines ?? [];
  const proposed = {
    titleVi: p.title_vi ?? null, title: p.title ?? null, dateText: p.date_text ?? null,
    place: p.place ?? null, author: p.author ?? null, lines,
    confidence: p.confidence ?? null, uncertainSpans: p.uncertain_spans ?? [],
  };
  const previous = {
    titleVi: poem.titleVi, title: poem.title, dateText: poem.dateText,
    place: poem.place, author: poem.author, lines: poem.lines, croppedImage: poem.croppedImage,
  };
  const now = new Date();

  // save the crop as THIS poem's own manuscript image (already cropped + oriented in the browser)
  let croppedImage: string | null = null;
  try {
    const stored = await saveCrop(slug, Buffer.from(image, "base64")); // S3 in prod, local in dev
    croppedImage = `${stored}?v=${now.getTime()}`;
  } catch { /* non-fatal */ }
  // apply LIVE (unverified) so the public sees the re-read immediately; keep `previous` for revert
  const [, rec] = await prisma.$transaction([
    prisma.poem.update({
      where: { id: poem.id },
      data: {
        lines, titleVi: proposed.titleVi ?? undefined, title: proposed.title ?? undefined,
        dateText: proposed.dateText ?? undefined, place: proposed.place ?? undefined,
        author: proposed.author ?? undefined,
        transcription: lines.map((l: any) => l.vi).filter(Boolean).join("\n"),
        reanalyzedAt: now, reanalysisVerified: false, croppedImage,
      },
    }),
    prisma.poemReanalysis.create({
      data: {
        poemId: poem.id, proposed, previous, crop: body.crop ?? null, estTokens: body.estTokens ?? null,
        inTokens: result.usage.input_tokens, outTokens: result.usage.output_tokens,
        editorLabel: admin?.email || "guest", ipHash, status: "applied",
      },
    }),
  ]);
  return NextResponse.json({
    ok: true, id: rec.id, proposed, reanalyzedAt: now,
    tokens: { in: result.usage.input_tokens, out: result.usage.output_tokens },
  });
}
