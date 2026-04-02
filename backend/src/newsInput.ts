import { type PrismaClient, NewsStatus } from "@prisma/client";
import {
  asNullable,
  isNewsSection,
  isNewsStatus,
  isProvince,
  normalizeHttpUrl,
  normalizeImageUrl,
  readBoolean,
  readString,
  slugifyText,
} from "./utils";
import type { NormalizedNewsInput } from "./types";

function trimExcerpt(rawExcerpt: string | null, body: string | null): string | null {
  if (rawExcerpt && rawExcerpt.length > 0) {
    return rawExcerpt.slice(0, 220);
  }
  if (body && body.length > 0) {
    return body.slice(0, 220);
  }
  return null;
}

export function normalizeNewsInput(raw: Record<string, unknown>): NormalizedNewsInput {
  const title = readString(raw.title);
  if (title.length < 8) {
    throw new Error("El titulo debe tener al menos 8 caracteres.");
  }

  const sectionRaw = readString(raw.section).toUpperCase();
  if (!isNewsSection(sectionRaw)) {
    throw new Error("La seccion indicada no es valida.");
  }

  const statusRaw = (readString(raw.status).toUpperCase() || NewsStatus.DRAFT) as string;
  if (!isNewsStatus(statusRaw)) {
    throw new Error("El estado indicado no es valido.");
  }

  const provinceRaw = readString(raw.province).toUpperCase();
  const province = provinceRaw && isProvince(provinceRaw) ? provinceRaw : null;
  const publishedAtRaw = readString(raw.publishedAt);

  let publishedAt: Date | null = null;
  if (publishedAtRaw.length > 0) {
    const parsedDate = new Date(publishedAtRaw);
    if (Number.isNaN(parsedDate.getTime())) {
      throw new Error("La fecha de publicacion no es valida.");
    }
    publishedAt = parsedDate;
  }

  if (statusRaw === NewsStatus.PUBLISHED && !publishedAt) {
    publishedAt = new Date();
  }

  const tagsSource = Array.isArray(raw.tags) ? raw.tags.join(",") : readString(raw.tags);
  const tags = tagsSource
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);

  return {
    title,
    slug: slugifyText(readString(raw.slug) || title),
    kicker: asNullable(readString(raw.kicker)),
    excerpt: trimExcerpt(asNullable(readString(raw.excerpt)), asNullable(readString(raw.body))),
    body: asNullable(readString(raw.body)),
    imageUrl: normalizeImageUrl(raw.imageUrl),
    sourceName: asNullable(readString(raw.sourceName)),
    sourceUrl: normalizeHttpUrl(raw.sourceUrl),
    authorName: asNullable(readString(raw.authorName)),
    section: sectionRaw,
    province,
    tags,
    status: statusRaw,
    publishedAt,
    isSponsored: readBoolean(raw.isSponsored),
    isFeatured: readBoolean(raw.isFeatured),
    isHero: readBoolean(raw.isHero),
    isInterview: readBoolean(raw.isInterview),
    isOpinion: readBoolean(raw.isOpinion),
    isRadar: readBoolean(raw.isRadar),
  };
}

export async function ensureUniqueSlug(prisma: PrismaClient, baseSlug: string, excludeId?: string): Promise<string> {
  const root = baseSlug.length > 0 ? baseSlug : `nota-${Date.now()}`;
  let candidate = root;
  let counter = 1;

  while (true) {
    const existing = await prisma.news.findFirst({
      where: {
        slug: candidate,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (!existing) {
      return candidate;
    }

    counter += 1;
    candidate = `${root}-${counter}`;
  }
}
