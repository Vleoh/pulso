import { type News, NewsSection } from "@prisma/client";
import { buildManagedImageUrl } from "./mediaProxy";
import { isLikelyEditorialImage } from "./articleMedia";
import type { FeedItem } from "./types";
import { normalizeHttpUrl, normalizeImageUrl } from "./utils";

export function guessSectionFromText(text: string): NewsSection {
  const normalized = text.toLowerCase();
  if (normalized.includes("eleccion") || normalized.includes("encuesta") || normalized.includes("candidato")) {
    return NewsSection.RADAR_ELECTORAL;
  }
  if (normalized.includes("econom") || normalized.includes("dolar") || normalized.includes("inflacion")) {
    return NewsSection.ECONOMIA;
  }
  if (normalized.includes("internacional") || normalized.includes("eeuu") || normalized.includes("brasil")) {
    return NewsSection.INTERNACIONALES;
  }
  if (normalized.includes("municip")) {
    return NewsSection.MUNICIPIOS;
  }
  if (normalized.includes("provincia")) {
    return NewsSection.PROVINCIAS;
  }
  return NewsSection.NACION;
}

function looksInvalidInternalMedia(url: string | null): boolean {
  if (!url) {
    return true;
  }
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return host === "pulsopais.com.ar" || host.endsWith(".invalid") || host.endsWith(".local");
  } catch {
    return true;
  }
}

export function resolveManagedFeedImage(
  rawImageUrl: unknown,
  options?: {
    sourceUrl?: unknown;
    seed?: string;
  },
): string | null {
  const normalizedImage = normalizeImageUrl(rawImageUrl);
  void options;

  if (!normalizedImage || looksInvalidInternalMedia(normalizedImage) || !isLikelyEditorialImage(normalizedImage)) {
    return null;
  }

  return buildManagedImageUrl(normalizedImage);
}

export function toFeedItem(news: News): FeedItem {
  return {
    id: news.id,
    slug: news.slug,
    title: news.title,
    kicker: news.kicker,
    excerpt: news.excerpt,
    imageUrl: resolveManagedFeedImage(news.imageUrl, {
      sourceUrl: news.sourceUrl,
      seed: `${news.title} ${news.section}`,
    }),
    sourceName: news.sourceName,
    sourceUrl: normalizeHttpUrl(news.sourceUrl),
    section: news.section,
    province: news.province,
    publishedAt: (news.publishedAt ?? news.createdAt).toISOString(),
    isSponsored: news.isSponsored,
    isFeatured: news.isFeatured,
    isExternal: false,
  };
}

export function dedupeByKey(items: FeedItem[]): FeedItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.sourceUrl ?? item.slug ?? item.title}`.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
