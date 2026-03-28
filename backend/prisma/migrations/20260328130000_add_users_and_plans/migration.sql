-- Ensure app schema exists
CREATE SCHEMA IF NOT EXISTS "pulso";

-- CreateEnum
CREATE TYPE "pulso"."UserPlan" AS ENUM ('FREE', 'PREMIUM');

-- CreateTable
CREATE TABLE "pulso"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "passwordHash" TEXT NOT NULL,
    "plan" "pulso"."UserPlan" NOT NULL DEFAULT 'FREE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pulso"."UserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "pulso"."User"("email");

-- CreateIndex
CREATE INDEX "User_plan_createdAt_idx" ON "pulso"."User"("plan", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_tokenHash_key" ON "pulso"."UserSession"("tokenHash");

-- CreateIndex
CREATE INDEX "UserSession_userId_expiresAt_idx" ON "pulso"."UserSession"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "UserSession_expiresAt_idx" ON "pulso"."UserSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "pulso"."UserSession"
ADD CONSTRAINT "UserSession_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "pulso"."User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
