-- CreateTable
CREATE TABLE "people" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'person',
    "relationship" TEXT,
    "aliases" TEXT[],
    "gender" TEXT,
    "deceased" BOOLEAN NOT NULL DEFAULT false,
    "nationality" TEXT,
    "lifeEvents" TEXT[],
    "notes" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_relations" (
    "id" TEXT NOT NULL,
    "personAId" TEXT NOT NULL,
    "personBId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,

    CONSTRAINT "person_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poem_people" (
    "poemId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "nameAsWritten" TEXT,
    "role" TEXT,
    "confidence" TEXT,

    CONSTRAINT "poem_people_pkey" PRIMARY KEY ("poemId","personId")
);

-- CreateIndex
CREATE UNIQUE INDEX "people_slug_key" ON "people"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "person_relations_personAId_personBId_kind_key" ON "person_relations"("personAId", "personBId", "kind");

-- AddForeignKey
ALTER TABLE "person_relations" ADD CONSTRAINT "person_relations_personAId_fkey" FOREIGN KEY ("personAId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_relations" ADD CONSTRAINT "person_relations_personBId_fkey" FOREIGN KEY ("personBId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poem_people" ADD CONSTRAINT "poem_people_poemId_fkey" FOREIGN KEY ("poemId") REFERENCES "poems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poem_people" ADD CONSTRAINT "poem_people_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;
