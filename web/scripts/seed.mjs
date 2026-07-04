// Seed Aurora from the local transcription JSON (idempotent).
// Run:  set -a; . web/.env; set +a; node web/scripts/seed.mjs
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();
const DIR = "/Users/doug/ongs_poems/data/transcriptions";

const VIS = new Set(["public", "family", "private"]);

async function main() {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
  let poemCount = 0;

  for (const f of files) {
    const d = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
    const scanId = d._meta.scan_id;
    const setNumber = d._meta.set_number ? parseInt(d._meta.set_number, 10) || null : null;

    const scan = await prisma.scan.upsert({
      where: { scanId },
      update: { originalFilename: d._meta.original_filename || "", setNumber, page: d._meta.page || null, note: d._meta.manifest_note || null, s3Display: `scans/${scanId}.jpg` },
      create: { scanId, originalFilename: d._meta.original_filename || "", setNumber, page: d._meta.page || null, note: d._meta.manifest_note || null, s3Display: `scans/${scanId}.jpg` },
    });

    // One Set (sitting) per scan for now — review can regroup A/B/C pages later.
    const set = await prisma.set.upsert({
      where: { slug: scanId },
      update: { setNumber },
      create: { slug: scanId, setNumber, title: d.poems?.[0]?.title_vi || d.poems?.[0]?.title || null },
    });

    for (let i = 0; i < (d.poems || []).length; i++) {
      const p = d.poems[i];
      const slug = `${scanId}-p${i + 1}`;
      const visibility = VIS.has(p.visibility) ? p.visibility : "public";
      const data = {
        setId: set.id,
        title: p.title ?? null,
        titleVi: p.title_vi ?? null,
        dateText: p.date_text ?? null,
        place: p.place ?? null,
        author: p.author ?? null,
        lines: p.lines ?? [],
        uncertainSpans: p.uncertain_spans ?? [],
        confidence: p.confidence ?? null,
        notes: p.notes ?? null,
        visibility,
        sensitivityLevel: p.sensitivity?.level ?? "none",
        sensitivityReason: p.sensitivity?.reason ?? null,
        boundaryReason: p.boundary_reason ?? null,
        boundaryConfidence: p.boundary_confidence ?? null,
        sortOrder: i,
        status: "needs_review",
      };
      const poem = await prisma.poem.upsert({ where: { slug }, update: data, create: { slug, ...data } });

      // Replace children for idempotency.
      await prisma.footnote.deleteMany({ where: { poemId: poem.id } });
      await prisma.marginalia.deleteMany({ where: { poemId: poem.id } });
      await prisma.poemMention.deleteMany({ where: { poemId: poem.id } });
      await prisma.poemTag.deleteMany({ where: { poemId: poem.id } });
      await prisma.poemScan.deleteMany({ where: { poemId: poem.id } });

      await prisma.poemScan.create({ data: { poemId: poem.id, scanId: scan.id, pageOrder: 0 } });
      for (const fn of p.footnotes || [])
        await prisma.footnote.create({ data: { poemId: poem.id, anchor: fn.anchor ?? null, note: fn.note ?? "" } });
      for (const m of p.marginalia || [])
        await prisma.marginalia.create({ data: { poemId: poem.id, kind: m.kind ?? null, text: m.text ?? null, translation: m.translation ?? null } });
      for (const mn of p.mentions || [])
        await prisma.poemMention.create({ data: { poemId: poem.id, relationship: mn.relationship ?? null, nameAsWritten: mn.name_as_written ?? null, lifeEvent: mn.life_event ?? null } });
      for (const t of p.tags || []) {
        const tag = await prisma.tag.upsert({ where: { slug: t }, update: {}, create: { slug: t } });
        await prisma.poemTag.create({ data: { poemId: poem.id, tagId: tag.id } });
      }
      poemCount++;
    }
  }
  console.log(`Seeded ${files.length} scans, ${poemCount} poems.`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
