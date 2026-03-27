-- Ensure app schema exists
CREATE SCHEMA IF NOT EXISTS "pulso";

-- CreateEnum
CREATE TYPE "pulso"."PollStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "pulso"."Poll" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "hookLabel" TEXT NOT NULL DEFAULT 'Encuesta Nacional',
    "footerCta" TEXT NOT NULL DEFAULT 'Vota y explica por que',
    "description" TEXT,
    "interviewUrl" TEXT,
    "coverImageUrl" TEXT,
    "status" "pulso"."PollStatus" NOT NULL DEFAULT 'DRAFT',
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Poll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pulso"."PollOption" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "colorHex" TEXT,
    "emoji" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pulso"."PollVote" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "voterHash" TEXT NOT NULL,
    "sourceRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Poll_slug_key" ON "pulso"."Poll"("slug");

-- CreateIndex
CREATE INDEX "Poll_status_publishedAt_idx" ON "pulso"."Poll"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "Poll_isFeatured_publishedAt_idx" ON "pulso"."Poll"("isFeatured", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PollOption_pollId_sortOrder_key" ON "pulso"."PollOption"("pollId", "sortOrder");

-- CreateIndex
CREATE INDEX "PollOption_pollId_idx" ON "pulso"."PollOption"("pollId");

-- CreateIndex
CREATE UNIQUE INDEX "PollVote_pollId_voterHash_key" ON "pulso"."PollVote"("pollId", "voterHash");

-- CreateIndex
CREATE INDEX "PollVote_pollId_createdAt_idx" ON "pulso"."PollVote"("pollId", "createdAt");

-- CreateIndex
CREATE INDEX "PollVote_optionId_idx" ON "pulso"."PollVote"("optionId");

-- AddForeignKey
ALTER TABLE "pulso"."PollOption" ADD CONSTRAINT "PollOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "pulso"."Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pulso"."PollVote" ADD CONSTRAINT "PollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "pulso"."Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pulso"."PollVote" ADD CONSTRAINT "PollVote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "pulso"."PollOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
