-- CreateEnum
CREATE TYPE "AiDecision" AS ENUM ('ALLOW', 'REVIEW', 'REJECT');

-- AlterTable
ALTER TABLE "News"
ADD COLUMN "aiDecision" "AiDecision" NOT NULL DEFAULT 'REVIEW',
ADD COLUMN "aiReason" TEXT,
ADD COLUMN "aiScore" INTEGER,
ADD COLUMN "aiWarnings" TEXT[],
ADD COLUMN "aiModel" TEXT,
ADD COLUMN "aiEvaluatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "News_aiDecision_publishedAt_idx" ON "News"("aiDecision", "publishedAt");
