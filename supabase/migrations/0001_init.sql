-- Grandfather's poems archive — initial schema.
-- Model: SET (a "sitting") -> PAGE(s)/scans -> POEM(s). One scan can hold many poems;
-- one poem can span many scans (A/B/C pages). See data/originals-manifest.csv.

create extension if not exists "pgcrypto";

create type poem_status as enum ('draft', 'needs_review', 'verified');

-- A SET = a sitting/session in which Ông organized older work. NOT a theme.
create table sets (
  id           uuid primary key default gen_random_uuid(),
  set_number   integer,                 -- reliable sitting id from the filename
  slug         text unique not null,
  title        text,
  description  text,
  sitting_date date,
  sort_order   integer,
  created_at   timestamptz default now()
);

-- One row per original TIF (mirrors data/originals-manifest.csv).
create table scans (
  id                uuid primary key default gen_random_uuid(),
  scan_id           text unique not null,        -- e.g. 'set-101a'
  original_filename text not null,
  set_number        integer,
  page              text,                         -- 'A' | 'B' | '' ...
  variant           text,                         -- e.g. 'second-scan'
  storage_original  text,                          -- Supabase Storage path (TIF)
  storage_display   text,                          -- web JPEG/WebP
  storage_thumb     text,
  width             integer,
  height            integer,
  note              text,                          -- e.g. 'table of contents (Mục lục)'
  needs_review      boolean default false,
  created_at        timestamptz default now()
);

create table poems (
  id            uuid primary key default gen_random_uuid(),
  set_id        uuid references sets(id) on delete set null,
  slug          text unique not null,
  title         text,
  title_vi      text,
  date_text     text,                              -- as written, e.g. '08-09-2018'
  date_iso      date,
  place         text,                              -- e.g. 'Everett', 'Lake Jackson'
  author        text,                              -- signature, e.g. 'Thanh-Phụng'
  sort_order    integer,
  lines         jsonb,                             -- [{vi, en}, ...] line-by-line bilingual
  transcription text,                              -- plain VI text (derived, for search)
  confidence    text,                              -- 'high' | 'medium' | 'low'
  uncertain_spans text[],
  notes         text,
  status        poem_status not null default 'draft',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- Many-to-many: one scan -> many poems, one poem -> many scans (pages).
create table poem_scans (
  poem_id    uuid references poems(id) on delete cascade,
  scan_id    uuid references scans(id) on delete cascade,
  page_order integer default 0,
  primary key (poem_id, scan_id)
);

-- Opus-generated explanatory footnotes (cultural refs, edits, idioms, likely readings).
create table footnotes (
  id          uuid primary key default gen_random_uuid(),
  poem_id     uuid references poems(id) on delete cascade,
  anchor      text,                                -- VI phrase the note attaches to
  note        text not null,
  sort_order  integer default 0
);

-- Everything on the page that isn't clean poem text: scribbles, edits, doodles.
create table marginalia (
  id          uuid primary key default gen_random_uuid(),
  poem_id     uuid references poems(id) on delete cascade,
  kind        text,                                -- insertion|strikethrough|correction|side_note|doodle|other
  text        text,
  translation text,
  sort_order  integer default 0
);

-- Controlled tag vocabulary (themes/motifs + structural flags), grown as we transcribe.
create table tags (
  id    uuid primary key default gen_random_uuid(),
  slug  text unique not null,                      -- e.g. 'gratitude', 'has-strikethrough'
  label text,
  kind  text                                       -- 'theme' | 'structural'
);
create table poem_tags (
  poem_id uuid references poems(id) on delete cascade,
  tag_id  uuid references tags(id) on delete cascade,
  primary key (poem_id, tag_id)
);

-- ---- Row Level Security: public can read ONLY verified content ----
alter table sets        enable row level security;
alter table scans       enable row level security;
alter table poems       enable row level security;
alter table poem_scans  enable row level security;
alter table footnotes   enable row level security;
alter table marginalia  enable row level security;
alter table tags        enable row level security;
alter table poem_tags   enable row level security;

create policy "public reads verified poems" on poems
  for select using (status = 'verified');

create policy "public reads scans of verified poems" on scans
  for select using (exists (
    select 1 from poem_scans ps join poems p on p.id = ps.poem_id
    where ps.scan_id = scans.id and p.status = 'verified'));

create policy "public reads sets with verified poems" on sets
  for select using (exists (
    select 1 from poems p where p.set_id = sets.id and p.status = 'verified'));

create policy "public reads poem_scans of verified poems" on poem_scans
  for select using (exists (
    select 1 from poems p where p.id = poem_scans.poem_id and p.status = 'verified'));

create policy "public reads footnotes of verified poems" on footnotes
  for select using (exists (
    select 1 from poems p where p.id = footnotes.poem_id and p.status = 'verified'));

create policy "public reads marginalia of verified poems" on marginalia
  for select using (exists (
    select 1 from poems p where p.id = marginalia.poem_id and p.status = 'verified'));

create policy "public reads poem_tags of verified poems" on poem_tags
  for select using (exists (
    select 1 from poems p where p.id = poem_tags.poem_id and p.status = 'verified'));

create policy "tag vocabulary is public" on tags for select using (true);

-- Writes happen via the service role (review tooling) or, later, authenticated admins,
-- both of which bypass / extend these policies. v2 adds: edit_suggestions, profiles, auth.
