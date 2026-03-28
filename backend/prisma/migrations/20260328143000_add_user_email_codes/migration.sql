-- Ensure app schema exists
CREATE SCHEMA IF NOT EXISTS "pulso";

-- CreateEnum
CREATE TYPE "pulso"."UserEmailCodePurpose" AS ENUM ('ACCOUNT_VERIFY', 'PASSWORD_RESET');

-- AlterTable
ALTER TABLE "pulso"."User"
ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "pulso"."UserEmailCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "pulso"."UserEmailCodePurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserEmailCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserEmailCode_userId_purpose_expiresAt_idx" ON "pulso"."UserEmailCode"("userId", "purpose", "expiresAt");

-- CreateIndex
CREATE INDEX "UserEmailCode_expiresAt_idx" ON "pulso"."UserEmailCode"("expiresAt");

-- AddForeignKey
ALTER TABLE "pulso"."UserEmailCode"
ADD CONSTRAINT "UserEmailCode_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "pulso"."User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
