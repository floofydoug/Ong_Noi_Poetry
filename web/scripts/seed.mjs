// Seed the DB from the local JSON (full reseed — JSON is the source of truth, so we wipe & bulk-insert).
// Loads: sittings/scans/poems (+footnotes, marginalia, mentions, tags) from data/transcriptions/*.json,
// then the PRIVATE people registry (data/people.json clusters) overlaid with the human-confirmed
// family identities + family tree (data/people-identities.json).
//   Run:  set -a; . web/.env; set +a; node web/scripts/seed.mjs
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import fs from "fs";

const prisma = new PrismaClient();
const ROOT = "/Users/doug/ongs_poems";
const DIR = `${ROOT}/data/transcriptions`;
const VIS = new Set(["public", "family", "private"]);

const dstrip = (s) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
const dcore = (s) => dstrip((s || "").toLowerCase()).replace(/[-._]/g, " ").replace(/\s+/g, " ").trim();

function readManifest() {
  const rows = fs.readFileSync(`${ROOT}/data/originals-manifest.csv`, "utf8").trim().split("\n").slice(1);
  const m = {};
  for (const line of rows) {
    const c = line.split(",");
    m[c[0]] = { originalFilename: c[1], setNumber: parseInt(c[2], 10) || null, page: c[3] || null, variant: c[4] || null };
  }
  return m;
}

async function wipe() {
  // children first (FK order); Prisma has no TRUNCATE CASCADE helper.
  for (const t of ["poemPerson", "personRelation", "person", "poemTag", "tag", "poemMention",
    "marginalia", "footnote", "poemScan", "poemRelation", "editSuggestion", "poem", "scan", "set"])
    await prisma[t].deleteMany({});
}

async function main() {
  console.log("wiping…");
  await wipe();

  const manifest = readManifest();
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();

  const sets = [], scans = [], poems = [], poemScans = [];
  const footnotes = [], marginalia = [], mentions = [];
  const tagMap = new Map(); // slug -> id
  const poemTags = [];
  const scanIdDb = {}; // scan_id -> db id
  const poemIdBy = {}; // `${group}-p${i+1}` -> db id

  for (const f of files) {
    const d = JSON.parse(fs.readFileSync(`${DIR}/${f}`, "utf8"));
    const meta = d._meta || {};
    if (meta.files == null) continue; // only fresh all-frames transcriptions
    const group = meta.group;
    const setId = randomUUID();
    const scanIds = meta.scan_ids || [group];
    sets.push({ id: setId, slug: group, setNumber: manifest[scanIds[0]]?.setNumber ?? null,
      title: d.poems?.[0]?.title_vi || d.poems?.[0]?.title || null });

    for (const sid of scanIds) {
      const id = randomUUID(); scanIdDb[sid] = id;
      const mf = manifest[sid] || {};
      scans.push({ id, scanId: sid, originalFilename: mf.originalFilename || "", setNumber: mf.setNumber ?? null,
        page: mf.page || null, variant: mf.variant || null, s3Display: `scans/${group}.jpg` });
    }

    (d.poems || []).forEach((p, i) => {
      const poemId = randomUUID();
      const slug = `${group}-p${i + 1}`;
      poemIdBy[slug] = poemId;
      poems.push({
        id: poemId, setId, slug, title: p.title ?? null, titleVi: p.title_vi ?? null,
        dateText: p.date_text ?? null, place: p.place ?? null, author: p.author ?? null,
        lines: p.lines ?? [], transcription: (p.lines || []).map((L) => L.vi).filter(Boolean).join("\n"),
        uncertainSpans: p.uncertain_spans ?? [], confidence: p.confidence ?? null, notes: p.notes ?? null,
        visibility: VIS.has(p.visibility) ? p.visibility : "public",
        sensitivityLevel: p.sensitivity?.level ?? "none", sensitivityReason: p.sensitivity?.reason ?? null,
        boundaryReason: p.boundary_reason ?? null, boundaryConfidence: p.boundary_confidence ?? null,
        sortOrder: i, status: "needs_review",
      });
      scanIds.forEach((sid, k) => poemScans.push({ poemId, scanId: scanIdDb[sid], pageOrder: k }));
      (p.footnotes || []).forEach((fn) => footnotes.push({ id: randomUUID(), poemId, anchor: fn.anchor ?? null, note: fn.note ?? "" }));
      (p.marginalia || []).forEach((m) => marginalia.push({ id: randomUUID(), poemId, kind: m.kind ?? null, text: m.text ?? null, translation: m.translation ?? null }));
      (p.mentions || []).forEach((mn) => mentions.push({ id: randomUUID(), poemId, relationship: mn.relationship ?? null, nameAsWritten: mn.name_as_written ?? null, lifeEvent: mn.life_event ?? null }));
      (p.tags || []).forEach((t) => {
        if (!tagMap.has(t)) tagMap.set(t, randomUUID());
        poemTags.push({ poemId, tagId: tagMap.get(t) });
      });
    });
  }

  console.log(`inserting ${sets.length} sets, ${scans.length} scans, ${poems.length} poems…`);
  await prisma.set.createMany({ data: sets });
  await prisma.scan.createMany({ data: scans });
  // poems in chunks (Postgres param limit)
  for (let i = 0; i < poems.length; i += 500) await prisma.poem.createMany({ data: poems.slice(i, i + 500) });
  await prisma.tag.createMany({ data: [...tagMap].map(([slug, id]) => ({ id, slug, kind: "subject" })) });
  for (let i = 0; i < poemScans.length; i += 1000) await prisma.poemScan.createMany({ data: poemScans.slice(i, i + 1000), skipDuplicates: true });
  for (let i = 0; i < footnotes.length; i += 1000) await prisma.footnote.createMany({ data: footnotes.slice(i, i + 1000) });
  for (let i = 0; i < marginalia.length; i += 1000) await prisma.marginalia.createMany({ data: marginalia.slice(i, i + 1000) });
  for (let i = 0; i < mentions.length; i += 1000) await prisma.poemMention.createMany({ data: mentions.slice(i, i + 1000) });
  for (let i = 0; i < poemTags.length; i += 1000) await prisma.poemTag.createMany({ data: poemTags.slice(i, i + 1000), skipDuplicates: true });

  // ---------- PEOPLE ----------
  await seedPeople(poemIdBy);
  console.log("done.");
  await prisma.$disconnect();
}

async function seedPeople(poemIdBy) {
  const clusters = JSON.parse(fs.readFileSync(`${ROOT}/data/people.json`, "utf8")).people;
  const ident = JSON.parse(fs.readFileSync(`${ROOT}/data/people-identities.json`, "utf8"));

  // flatten curated identities into one list with family metadata
  const fam = [];
  const add = (o, relationship) => fam.push({ ...o, relationship: o.relationship || relationship });
  add(ident.spouse_of_poet, "wife");
  (ident.children || []).forEach((c) => add(c, "child"));
  (ident.children_in_law || []).forEach((c) => add(c, "child-in-law"));
  (ident.grandchildren || []).forEach((c) => add(c, "grandchild"));
  (ident.non_family || []).forEach((c) => add(c, c.relationship || "non-family"));
  // aliases that belong to >1 curated person are AMBIGUOUS (e.g. Minh, Lan) — don't auto-merge those
  const aliasOwners = {};
  for (const p of fam)
    for (const a of [p.canonical, ...(p.aliases || [])]) {
      const k = dcore(a); (aliasOwners[k] = aliasOwners[k] || new Set()).add(p.canonical);
    }

  let personRows = []; const poemPersonRows = [];
  const idBySlug = {}; // person slug -> id (for family relations)
  const clusterByCore = {}; // dcore -> {id, slug}

  // 1) seed mention-clusters as proposed people (+ poem links)
  for (const c of clusters) {
    const id = randomUUID();
    const slug = `${c.id}-${id.slice(0, 6)}`; // c.id (diacritic-stripped) isn't unique — suffix it
    clusterByCore[dcore(c.core_key)] = { id, slug };
    idBySlug[slug] = id;
    personRows.push({ id, slug, canonicalName: c.canonical_name, kind: "person",
      relationship: c.relationship ?? null, aliases: c.aliases, lifeEvents: c.life_events,
      verified: !!c.known });
    for (const pm of c.poems) {
      const poemId = poemIdBy[`${pm.group}-p${pm.poem_index + 1}`];
      if (poemId) poemPersonRows.push({ poemId, personId: id, nameAsWritten: pm.name_as_written,
        role: "mentioned", confidence: c.known ? "confirmed" : "proposed",
        source: "ai", verified: !!c.known });
    }
  }

  // 2) overlay curated family: merge into a cluster when the alias is unambiguous, else standalone
  const famId = {}; // canonical -> person id
  for (const p of fam) {
    const cores = [p.canonical, ...(p.aliases || [])].map(dcore);
    let target = null;
    for (const k of cores)
      if (aliasOwners[k]?.size === 1 && clusterByCore[k]) { target = clusterByCore[k]; break; }
    if (target) {
      const row = personRows.find((r) => r.id === target.id);
      row.canonicalName = p.canonical; row.relationship = p.relationship;
      row.verified = true; row.gender = p.gender ?? null; row.deceased = !!p.deceased;
      row.nationality = p.nationality ?? null; row.notes = p.notes ?? null;
      row.aliases = [...new Set([...(row.aliases || []), ...(p.aliases || []), p.canonical])];
      famId[p.canonical] = target.id;
    } else {
      const id = randomUUID();
      const slug = "fam-" + dcore(p.canonical).replace(/\s+/g, "-") + "-" + id.slice(0, 4);
      personRows.push({ id, slug, canonicalName: p.canonical, kind: "person", relationship: p.relationship,
        aliases: [...new Set([p.canonical, ...(p.aliases || [])])], lifeEvents: [], gender: p.gender ?? null,
        deceased: !!p.deceased, nationality: p.nationality ?? null, notes: p.notes ?? null, verified: true });
      famId[p.canonical] = id;
    }
  }

  // poet + relations
  const poetId = randomUUID();
  personRows.push({ id: poetId, slug: "poet-thanh-phung", canonicalName: ident.poet.canonical,
    kind: "person", relationship: "poet", aliases: ident.poet.aliases || [], lifeEvents: [], verified: true });
  famId[ident.poet.canonical] = poetId;

  let rel = []; const seen = new Set();
  const link = (a, b, kind) => {
    const ai = famId[a], bi = famId[b]; if (!ai || !bi || ai === bi) return;
    const key = [ai, bi, kind].sort().join(); if (seen.has(key)) return; seen.add(key);
    rel.push({ id: randomUUID(), personAId: ai, personBId: bi, kind });
  };
  // poet <-> wife
  if (ident.spouse_of_poet) link(ident.poet.canonical, ident.spouse_of_poet.canonical, "spouse");
  // poet -> each child; child <-> spouse
  for (const c of ident.children || []) {
    if (famId[c.canonical]) link(ident.poet.canonical, c.canonical, "parent");
    if (c.spouse) link(c.canonical, c.spouse, "spouse");
  }
  for (const g of ident.grandchildren || [])
    for (const par of g.parents || []) link(par, g.canonical, "parent");

  // dedupe verified people sharing a canonical name (same person split across alias-clusters):
  // pick one survivor, fold aliases/life-events in, and remap poem-links + relations onto it.
  const survivorOf = {}, remap = {};
  const byId = Object.fromEntries(personRows.map((r) => [r.id, r]));
  for (const r of personRows) {
    if (!r.verified) continue;
    if (survivorOf[r.canonicalName]) {
      const s = byId[survivorOf[r.canonicalName]];
      s.aliases = [...new Set([...(s.aliases || []), ...(r.aliases || [])])];
      s.lifeEvents = [...new Set([...(s.lifeEvents || []), ...(r.lifeEvents || [])])];
      remap[r.id] = s.id;
    } else survivorOf[r.canonicalName] = r.id;
  }
  for (const pp of poemPersonRows) if (remap[pp.personId]) pp.personId = remap[pp.personId];
  for (const rr of rel) { if (remap[rr.personAId]) rr.personAId = remap[rr.personAId]; if (remap[rr.personBId]) rr.personBId = remap[rr.personBId]; }
  rel = rel.filter((rr) => rr.personAId !== rr.personBId);
  personRows = personRows.filter((r) => !remap[r.id]);

  console.log(`inserting ${personRows.length} people, ${rel.length} relations, ${poemPersonRows.length} poem-links…`);
  for (let i = 0; i < personRows.length; i += 500) await prisma.person.createMany({ data: personRows.slice(i, i + 500) });
  await prisma.personRelation.createMany({ data: rel, skipDuplicates: true });
  for (let i = 0; i < poemPersonRows.length; i += 1000) await prisma.poemPerson.createMany({ data: poemPersonRows.slice(i, i + 1000), skipDuplicates: true });
}

main().catch((e) => { console.error(e); process.exit(1); });
