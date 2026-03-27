-- CreateTable
CREATE TABLE "SiteSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("key")
);

-- Seed default home theme
INSERT INTO "SiteSetting" ("key", "value", "updatedAt")
VALUES ('home_theme', 'premium', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
