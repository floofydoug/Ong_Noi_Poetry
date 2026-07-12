-- CreateTable
CREATE TABLE "poem_reanalyses" (
    "id" TEXT NOT NULL,
    "poemId" TEXT NOT NULL,
    "proposed" JSONB NOT NULL,
    "crop" JSONB,
    "estTokens" INTEGER,
    "inTokens" INTEGER,
    "outTokens" INTEGER,
    "editorLabel" TEXT NOT NULL DEFAULT 'guest',
    "ipHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "poem_reanalyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "poem_reanalyses_poemId_idx" ON "poem_reanalyses"("poemId");

-- CreateIndex
CREATE INDEX "poem_reanalyses_ipHash_createdAt_idx" ON "poem_reanalyses"("ipHash", "createdAt");

-- AddForeignKey
ALTER TABLE "poem_reanalyses" ADD CONSTRAINT "poem_reanalyses_poemId_fkey" FOREIGN KEY ("poemId") REFERENCES "poems"("id") ON DELETE CASCADE ON UPDATE CASCADE;
