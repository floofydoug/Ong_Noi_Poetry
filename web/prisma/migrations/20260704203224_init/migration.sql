-- CreateEnum
CREATE TYPE "PoemStatus" AS ENUM ('draft', 'needs_review', 'verified');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('public', 'family', 'private');

-- CreateTable
CREATE TABLE "sets" (
    "id" TEXT NOT NULL,
    "setNumber" INTEGER,
    "slug" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "sittingDate" DATE,
    "sortOrder" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scans" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "setNumber" INTEGER,
    "page" TEXT,
    "variant" TEXT,
    "s3Original" TEXT,
    "s3Display" TEXT,
    "s3Thumb" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "note" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poems" (
    "id" TEXT NOT NULL,
    "setId" TEXT,
    "slug" TEXT NOT NULL,
    "title" TEXT,
    "titleVi" TEXT,
    "dateText" TEXT,
    "dateIso" DATE,
    "place" TEXT,
    "author" TEXT,
    "lines" JSONB,
    "transcription" TEXT,
    "uncertainSpans" TEXT[],
    "confidence" TEXT,
    "notes" TEXT,
    "visibility" "Visibility" NOT NULL DEFAULT 'public',
    "sensitivityLevel" TEXT DEFAULT 'none',
    "sensitivityReason" TEXT,
    "boundaryReason" TEXT,
    "boundaryConfidence" TEXT,
    "sortOrder" INTEGER,
    "status" "PoemStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "poems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poem_scans" (
    "poemId" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "pageOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "poem_scans_pkey" PRIMARY KEY ("poemId","scanId")
);

-- CreateTable
CREATE TABLE "footnotes" (
    "id" TEXT NOT NULL,
    "poemId" TEXT NOT NULL,
    "anchor" TEXT,
    "note" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "footnotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marginalia" (
    "id" TEXT NOT NULL,
    "poemId" TEXT NOT NULL,
    "kind" TEXT,
    "text" TEXT,
    "translation" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "marginalia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT,
    "kind" TEXT,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poem_tags" (
    "poemId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "poem_tags_pkey" PRIMARY KEY ("poemId","tagId")
);

-- CreateTable
CREATE TABLE "poem_mentions" (
    "id" TEXT NOT NULL,
    "poemId" TEXT NOT NULL,
    "relationship" TEXT,
    "nameAsWritten" TEXT,
    "lifeEvent" TEXT,

    CONSTRAINT "poem_mentions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poem_relations" (
    "id" TEXT NOT NULL,
    "poemAId" TEXT NOT NULL,
    "poemBId" TEXT NOT NULL,
    "sharedLines" INTEGER NOT NULL DEFAULT 0,
    "relation" TEXT,

    CONSTRAINT "poem_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edit_suggestions" (
    "id" TEXT NOT NULL,
    "poemId" TEXT,
    "scanId" TEXT,
    "poemIndex" INTEGER,
    "lineIndex" INTEGER,
    "originalText" TEXT,
    "selectedText" TEXT,
    "suggestedText" TEXT,
    "spokenText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "submittedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "edit_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sets_slug_key" ON "sets"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "scans_scanId_key" ON "scans"("scanId");

-- CreateIndex
CREATE UNIQUE INDEX "poems_slug_key" ON "poems"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tags_slug_key" ON "tags"("slug");

-- AddForeignKey
ALTER TABLE "poems" ADD CONSTRAINT "poems_setId_fkey" FOREIGN KEY ("setId") REFERENCES "sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poem_scans" ADD CONSTRAINT "poem_scans_poemId_fkey" FOREIGN KEY ("poemId") REFERENCES "poems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poem_scans" ADD CONSTRAINT "poem_scans_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "footnotes" ADD CONSTRAINT "footnotes_poemId_fkey" FOREIGN KEY ("poemId") REFERENCES "poems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marginalia" ADD CONSTRAINT "marginalia_poemId_fkey" FOREIGN KEY ("poemId") REFERENCES "poems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poem_tags" ADD CONSTRAINT "poem_tags_poemId_fkey" FOREIGN KEY ("poemId") REFERENCES "poems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poem_tags" ADD CONSTRAINT "poem_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poem_mentions" ADD CONSTRAINT "poem_mentions_poemId_fkey" FOREIGN KEY ("poemId") REFERENCES "poems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poem_relations" ADD CONSTRAINT "poem_relations_poemAId_fkey" FOREIGN KEY ("poemAId") REFERENCES "poems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poem_relations" ADD CONSTRAINT "poem_relations_poemBId_fkey" FOREIGN KEY ("poemBId") REFERENCES "poems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edit_suggestions" ADD CONSTRAINT "edit_suggestions_poemId_fkey" FOREIGN KEY ("poemId") REFERENCES "poems"("id") ON DELETE SET NULL ON UPDATE CASCADE;
