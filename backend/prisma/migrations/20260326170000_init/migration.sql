-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "NewsStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "NewsSection" AS ENUM ('NACION', 'PROVINCIAS', 'MUNICIPIOS', 'OPINION', 'ENTREVISTAS', 'PUBLINOTAS', 'RADAR_ELECTORAL', 'ECONOMIA', 'INTERNACIONALES', 'DISTRITOS');

-- CreateEnum
CREATE TYPE "Province" AS ENUM ('CABA', 'BUENOS_AIRES', 'CATAMARCA', 'CHACO', 'CHUBUT', 'CORDOBA', 'CORRIENTES', 'ENTRE_RIOS', 'FORMOSA', 'JUJUY', 'LA_PAMPA', 'LA_RIOJA', 'MENDOZA', 'MISIONES', 'NEUQUEN', 'RIO_NEGRO', 'SALTA', 'SAN_JUAN', 'SAN_LUIS', 'SANTA_CRUZ', 'SANTA_FE', 'SANTIAGO_DEL_ESTERO', 'TIERRA_DEL_FUEGO', 'TUCUMAN');

-- CreateTable
CREATE TABLE "News" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kicker" TEXT,
    "excerpt" TEXT,
    "body" TEXT,
    "imageUrl" TEXT,
    "sourceName" TEXT,
    "sourceUrl" TEXT,
    "authorName" TEXT,
    "section" "NewsSection" NOT NULL,
    "province" "Province",
    "tags" TEXT[],
    "isSponsored" BOOLEAN NOT NULL DEFAULT false,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isHero" BOOLEAN NOT NULL DEFAULT false,
    "isInterview" BOOLEAN NOT NULL DEFAULT false,
    "isOpinion" BOOLEAN NOT NULL DEFAULT false,
    "isRadar" BOOLEAN NOT NULL DEFAULT false,
    "status" "NewsStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "News_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "News_slug_key" ON "News"("slug");

-- CreateIndex
CREATE INDEX "News_status_publishedAt_idx" ON "News"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "News_section_publishedAt_idx" ON "News"("section", "publishedAt");

-- CreateIndex
CREATE INDEX "News_province_publishedAt_idx" ON "News"("province", "publishedAt");

