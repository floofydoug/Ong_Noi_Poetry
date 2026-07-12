-- AlterTable
ALTER TABLE "poem_reanalyses" ADD COLUMN     "previous" JSONB;

-- AlterTable
ALTER TABLE "poems" ADD COLUMN     "reanalysisVerified" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reanalyzedAt" TIMESTAMP(3);
