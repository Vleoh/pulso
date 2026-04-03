import { type News, NewsSection } from "@prisma/client";
import { buildManagedImageUrl } from "./mediaProxy";
import type { FeedItem } from "./types";
import { normalizeHttpUrl, normalizeImageUrl } from "./utils";

const FEED_FALLBACK_IMAGES = [
  "https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1444653389962-8149286c578a?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1504711331083-9c895941bf81?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1464207687429-7505649dae38?auto=format&fit=crop&w=1600&q=80",
];

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

function fallbackFeedImage(seedText: string): string {
  const source = seedText.trim().toLowerCase() || "pulso-pais";
  let hash = 0;
  for (const char of source) {
    hash = (hash * 31 + char.charCodeAt(0)) % 2147483647;
  }
  return FEED_FALLBACK_IMAGES[Math.abs(hash) % FEED_FALLBACK_IMAGES.length] ?? FEED_FALLBACK_IMAGES[0] ?? "";
}

function articleScreenshotCandidates(sourceUrl: string | null): string[] {
  if (!sourceUrl) {
    return [];
  }
  const encoded = encodeURIComponent(sourceUrl);
  return [
    `https://s.wordpress.com/mshots/v1/${encoded}?w=1600`,
    `https://image.thum.io/get/width/1600/noanimate/${sourceUrl}`,
  ];
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
  const normalizedSource = normalizeHttpUrl(options?.sourceUrl);
  const seed = options?.seed?.trim() || normalizedSource || normalizedImage || "pulso-pais";

  const candidates = [
    ...(normalizedImage && !looksInvalidInternalMedia(normalizedImage) ? [normalizedImage] : []),
    ...articleScreenshotCandidates(normalizedSource),
    fallbackFeedImage(seed),
  ];

  for (const candidate of candidates) {
    const managed = buildManagedImageUrl(candidate);
    if (managed) {
      return managed;
    }
  }

  return null;
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
