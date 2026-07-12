-- AlterTable
ALTER TABLE "poems" ADD COLUMN     "originalLines" JSONB;

-- CreateTable
CREATE TABLE "poem_edits" (
    "id" TEXT NOT NULL,
    "poemId" TEXT NOT NULL,
    "lineIndex" INTEGER NOT NULL,
    "field" TEXT NOT NULL DEFAULT 'vi',
    "before" TEXT NOT NULL,
    "after" TEXT NOT NULL,
    "editorLabel" TEXT NOT NULL DEFAULT 'guest',
    "editorId" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "reverted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "poem_edits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "poem_edits_poemId_idx" ON "poem_edits"("poemId");

-- AddForeignKey
ALTER TABLE "poem_edits" ADD CONSTRAINT "poem_edits_poemId_fkey" FOREIGN KEY ("poemId") REFERENCES "poems"("id") ON DELETE CASCADE ON UPDATE CASCADE;
