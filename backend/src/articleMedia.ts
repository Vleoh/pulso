import { isGoogleNewsUrl, normalizeHttpUrl, normalizeImageUrl, readString } from "./utils";

export type ArticleSnapshot = {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  imageCandidates: string[];
  videoUrl: string | null;
  videoPosterUrl: string | null;
  paragraphs: string[];
};

function stripHtmlTags(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findMetaCandidates(html: string, key: string): string[] {
  const escaped = escapeRegExp(key);
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "gi",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
      "gi",
    ),
  ];
  const values: string[] = [];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const value = stripHtmlTags(match[1] ?? "").slice(0, 800);
      if (value) {
        values.push(value);
      }
    }
  }
  return Array.from(new Set(values));
}

function findMetaContent(html: string, key: string): string | null {
  return findMetaCandidates(html, key)[0] ?? null;
}

function absoluteMediaUrl(pageUrl: string, candidate: string | null | undefined, kind: "image" | "video"): string | null {
  const value = stripHtmlTags(candidate ?? "");
  if (!value) {
    return null;
  }
  try {
    const resolved = new URL(value, pageUrl).toString();
    return kind === "image" ? normalizeImageUrl(resolved) : normalizeHttpUrl(resolved);
  } catch {
    return kind === "image" ? normalizeImageUrl(value) : normalizeHttpUrl(value);
  }
}

function extractAttributeCandidates(html: string, expression: RegExp): string[] {
  const results: string[] = [];
  for (const match of html.matchAll(expression)) {
    const value = stripHtmlTags(match[1] ?? "").slice(0, 800);
    if (value) {
      results.push(value);
    }
  }
  return Array.from(new Set(results));
}

function parseTagAttributes(tag: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const match of tag.matchAll(/([:@a-zA-Z0-9_-]+)\s*=\s*["']([^"']+)["']/g)) {
    const key = (match[1] ?? "").trim().toLowerCase();
    const value = stripHtmlTags(match[2] ?? "").trim();
    if (key && value) {
      attributes.set(key, value);
    }
  }
  return attributes;
}

function parseSrcsetCandidates(rawValue: string | null | undefined): string[] {
  const value = stripHtmlTags(rawValue ?? "");
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [urlPart, descriptorPart] = item.split(/\s+/, 2);
      const descriptor = (descriptorPart ?? "").trim().toLowerCase();
      let weight = 0;
      if (descriptor.endsWith("w")) {
        weight = Number(descriptor.slice(0, -1)) || 0;
      } else if (descriptor.endsWith("x")) {
        weight = (Number(descriptor.slice(0, -1)) || 0) * 1000;
      }
      return { url: urlPart?.trim() ?? "", weight };
    })
    .filter((entry) => entry.url.length > 0)
    .sort((left, right) => right.weight - left.weight)
    .map((entry) => entry.url);
}

function computeContextScore(fragment: string, widthRaw: string | undefined, heightRaw: string | undefined): number {
  const context = fragment.toLowerCase();
  let score = 0;

  if (context.includes("<article")) {
    score += 5;
  }
  if (context.includes("<main")) {
    score += 4;
  }
  if (context.includes("<figure")) {
    score += 4;
  }
  if (
    context.includes("hero") ||
    context.includes("featured") ||
    context.includes("cover") ||
    context.includes("story") ||
    context.includes("article-body") ||
    context.includes("entry-content")
  ) {
    score += 4;
  }

  const width = Number(widthRaw ?? "");
  const height = Number(heightRaw ?? "");
  if (Number.isFinite(width) && Number.isFinite(height)) {
    const area = width * height;
    if (width >= 900 || area >= 600_000) {
      score += 5;
    } else if (width >= 600 || area >= 200_000) {
      score += 3;
    } else if (width <= 200 || height <= 120) {
      score -= 6;
    }
  }

  return score;
}

function extractImageTagCandidates(html: string, pageUrl: string): string[] {
  const ranked = new Map<string, number>();
  const tagPattern = /<(img|source)\b[^>]*>/gi;

  for (const match of html.matchAll(tagPattern)) {
    const rawTag = match[0] ?? "";
    const startIndex = Math.max(0, (match.index ?? 0) - 200);
    const endIndex = Math.min(html.length, (match.index ?? 0) + rawTag.length + 200);
    const surrounding = html.slice(startIndex, endIndex);
    const attrs = parseTagAttributes(rawTag);
    const candidateValues = [
      attrs.get("src"),
      attrs.get("data-src"),
      attrs.get("data-lazy-src"),
      attrs.get("data-original"),
      attrs.get("data-image"),
      attrs.get("data-thumb"),
      attrs.get("data-full-size"),
      attrs.get("data-large-file"),
      attrs.get("data-medium-file"),
      ...parseSrcsetCandidates(attrs.get("srcset")),
      ...parseSrcsetCandidates(attrs.get("data-srcset")),
      ...parseSrcsetCandidates(attrs.get("data-lazy-srcset")),
    ];

    const contextScore = computeContextScore(surrounding, attrs.get("width"), attrs.get("height"));
    for (const candidate of candidateValues) {
      const resolved = absoluteMediaUrl(pageUrl, candidate, "image");
      if (!resolved || !isLikelyEditorialImage(resolved)) {
        continue;
      }
      const score = scoreImageCandidate(resolved) + contextScore;
      ranked.set(resolved, Math.max(score, ranked.get(resolved) ?? -1000));
    }
  }

  return Array.from(ranked.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([candidate]) => normalizeImageUrl(candidate))
    .filter((candidate): candidate is string => Boolean(candidate));
}

function collectJsonLdImageValues(input: unknown, bucket: string[]): void {
  if (!input) {
    return;
  }
  if (typeof input === "string") {
    bucket.push(input);
    return;
  }
  if (Array.isArray(input)) {
    for (const item of input) {
      collectJsonLdImageValues(item, bucket);
    }
    return;
  }
  if (typeof input === "object") {
    const record = input as Record<string, unknown>;
    if (typeof record.url === "string") {
      bucket.push(record.url);
    }
    if ("image" in record) {
      collectJsonLdImageValues(record.image, bucket);
    }
    if ("thumbnailUrl" in record) {
      collectJsonLdImageValues(record.thumbnailUrl, bucket);
    }
  }
}

function extractJsonLdImageCandidates(html: string, pageUrl: string): string[] {
  const results: string[] = [];
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const rawJson = (match[1] ?? "").trim();
    if (!rawJson) {
      continue;
    }
    try {
      const parsed = JSON.parse(rawJson) as unknown;
      const values: string[] = [];
      collectJsonLdImageValues(parsed, values);
      for (const value of values) {
        const resolved = absoluteMediaUrl(pageUrl, value, "image");
        if (resolved && isLikelyEditorialImage(resolved)) {
          results.push(resolved);
        }
      }
    } catch {
      continue;
    }
  }
  return Array.from(new Set(results));
}

export function scoreImageCandidate(candidate: string): number {
  const normalized = candidate.trim().toLowerCase();
  if (!normalized) {
    return -100;
  }

  let score = 0;
  const negativeSignals = [
    "logo",
    "icon",
    "favicon",
    "avatar",
    "author",
    "authors",
    "newsletter",
    "header",
    "sharing",
    "followgoogle",
    "google-logo",
    "google-icon",
    "app-store",
    "android-store",
    "gda",
    "placeholder",
    "sprite",
    "spacer",
    "document",
    "docs",
    "sheet",
    "mshots",
    "thum.io",
    "googleusercontent.com",
    "gstatic.com",
    "google.com",
    "screenshot",
    "elementor",
    "/pf/resources/images/",
    "/img/authors/",
    "ads",
    "banner",
    "pixel",
    "default",
    "fallback",
    "unsplash.com",
    "flyer",
    "afiche",
    "comunicado",
    "placa",
    "votacion",
    "padron",
    "escuela",
    "pdf",
  ];
  const positiveSignals = [
    "og-image",
    "featured",
    "hero",
    "cover",
    "nota",
    "article",
    "news",
    "media",
    "upload",
    "image",
    "photo",
    "foto",
  ];

  for (const token of negativeSignals) {
    if (normalized.includes(token)) {
      score -= 7;
    }
  }
  for (const token of positiveSignals) {
    if (normalized.includes(token)) {
      score += 3;
    }
  }

  if (/\.(jpe?g|png|webp|avif)(\?|$)/i.test(normalized)) {
    score += 5;
  }
  if (/\.(svg|ico|gif)(\?|$)/i.test(normalized)) {
    score -= 10;
  }
  if (/\/(wp-json|api|embed)\//i.test(normalized)) {
    score -= 6;
  }

  return score;
}

export function isLikelyEditorialImage(candidate: string): boolean {
  const normalized = candidate.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  const hardBlockedSignals = [
    "clarin-newsletter",
    "clarin-sharing",
    "/img/authors/",
    "/collections/followgoogle/",
    "/landings/bundles/landing/img/components/header/",
    "/pf/resources/images/la-nacion.webp",
    "/pf/resources/images/android-store",
    "/pf/resources/images/app-store",
    "/pf/resources/images/gda",
    "google-icon",
    "google-logo",
  ];
  if (hardBlockedSignals.some((token) => normalized.includes(token))) {
    return false;
  }
  try {
    const parsed = new URL(normalized);
    if (parsed.pathname === "/" || parsed.pathname.length < 2) {
      return false;
    }
  } catch {
    return false;
  }
  if (/^data:/i.test(normalized)) {
    return false;
  }
  if (/\.(svg|ico)(\?|$)/i.test(normalized)) {
    return false;
  }
  return scoreImageCandidate(normalized) >= 0;
}

export function pickBestEditorialImageUrl(candidates: Array<string | null | undefined>): string | null {
  const normalized = candidates
    .map((candidate) => normalizeImageUrl(candidate))
    .filter((candidate): candidate is string => Boolean(candidate))
    .filter((candidate) => isLikelyEditorialImage(candidate))
    .sort((left, right) => scoreImageCandidate(right) - scoreImageCandidate(left));

  return normalized[0] ?? null;
}

function extractImageCandidates(html: string, pageUrl: string): string[] {
  const rawCandidates = [
    ...findMetaCandidates(html, "og:image"),
    ...findMetaCandidates(html, "og:image:secure_url"),
    ...findMetaCandidates(html, "og:image:url"),
    ...findMetaCandidates(html, "twitter:image"),
    ...findMetaCandidates(html, "twitter:image:src"),
    ...findMetaCandidates(html, "image"),
    ...extractJsonLdImageCandidates(html, pageUrl),
    ...extractImageTagCandidates(html, pageUrl),
    ...extractAttributeCandidates(html, /<img[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["']/gi),
  ];

  return Array.from(
    new Set(
      rawCandidates
        .map((candidate) => absoluteMediaUrl(pageUrl, candidate, "image"))
        .filter((candidate): candidate is string => Boolean(candidate))
        .filter((candidate) => isLikelyEditorialImage(candidate))
        .sort((left, right) => scoreImageCandidate(right) - scoreImageCandidate(left))
        .map((candidate) => normalizeImageUrl(candidate))
        .filter((candidate): candidate is string => Boolean(candidate)),
    ),
  ).slice(0, 8);
}

function normalizeEmbeddableVideoUrl(pageUrl: string, candidate: string | null): string | null {
  const resolved = absoluteMediaUrl(pageUrl, candidate, "video");
  if (!resolved) {
    return null;
  }

  try {
    const parsed = new URL(resolved);
    const host = parsed.hostname.toLowerCase();

    if (host === "youtu.be") {
      const id = parsed.pathname.replace(/^\/+/, "").split("/")[0] ?? "";
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }

    if (host.includes("youtube.com") || host.includes("youtube-nocookie.com")) {
      if (parsed.pathname.startsWith("/embed/")) {
        return parsed.toString();
      }
      const watchId = parsed.searchParams.get("v") ?? "";
      return watchId ? `https://www.youtube.com/embed/${watchId}` : null;
    }

    if (host === "vimeo.com") {
      const id = parsed.pathname.replace(/^\/+/, "").split("/")[0] ?? "";
      return /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
    }

    if (host.includes("player.vimeo.com")) {
      return parsed.toString();
    }

    return parsed.toString();
  } catch {
    return resolved;
  }
}

function extractVideoSnapshot(html: string, pageUrl: string): { videoUrl: string | null; videoPosterUrl: string | null } {
  const videoCandidates = [
    ...findMetaCandidates(html, "og:video"),
    ...findMetaCandidates(html, "og:video:url"),
    ...findMetaCandidates(html, "twitter:player:stream"),
    ...findMetaCandidates(html, "twitter:player"),
    ...extractAttributeCandidates(html, /<video[^>]+src=["']([^"']+)["']/gi),
    ...extractAttributeCandidates(html, /<source[^>]+src=["']([^"']+)["'][^>]*type=["']video\/[^"']+["']/gi),
    ...extractAttributeCandidates(html, /<iframe[^>]+src=["']([^"']+)["']/gi),
  ];

  const posterCandidates = [
    ...findMetaCandidates(html, "og:video:image"),
    ...findMetaCandidates(html, "twitter:image"),
    ...extractAttributeCandidates(html, /<video[^>]+poster=["']([^"']+)["']/gi),
  ];

  return {
    videoUrl:
      videoCandidates
        .map((candidate) => normalizeEmbeddableVideoUrl(pageUrl, candidate))
        .find((candidate): candidate is string => Boolean(candidate)) ?? null,
    videoPosterUrl:
      posterCandidates
        .map((candidate) => absoluteMediaUrl(pageUrl, candidate, "image"))
        .find((candidate): candidate is string => Boolean(candidate)) ?? null,
  };
}

function extractParagraphs(html: string, maxItems = 3): string[] {
  const matches = Array.from(html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi));
  const paragraphs: string[] = [];
  for (const match of matches) {
    const candidate = stripHtmlTags(match[1] ?? "");
    if (candidate.length < 60) {
      continue;
    }
    paragraphs.push(candidate.slice(0, 360));
    if (paragraphs.length >= maxItems) {
      break;
    }
  }
  return paragraphs;
}

export async function fetchArticleSnapshot(url: string): Promise<ArticleSnapshot> {
  if (isGoogleNewsUrl(url)) {
    return {
      title: null,
      description: null,
      imageUrl: null,
      imageCandidates: [],
      videoUrl: null,
      videoPosterUrl: null,
      paragraphs: [],
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": "PulsoPaisResearchBot/1.0",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const html = await response.text();
    const ogTitle = findMetaContent(html, "og:title");
    const ogDescription = findMetaContent(html, "og:description");
    const imageCandidates = extractImageCandidates(html, response.url || url);
    const videoSnapshot = extractVideoSnapshot(html, response.url || url);
    const paragraphs = extractParagraphs(html);

    return {
      title: ogTitle,
      description: ogDescription,
      imageUrl: imageCandidates[0] ?? videoSnapshot.videoPosterUrl ?? null,
      imageCandidates,
      videoUrl: videoSnapshot.videoUrl,
      videoPosterUrl: videoSnapshot.videoPosterUrl,
      paragraphs,
    };
  } catch {
    return {
      title: null,
      description: null,
      imageUrl: null,
      imageCandidates: [],
      videoUrl: null,
      videoPosterUrl: null,
      paragraphs: [],
    };
  } finally {
    clearTimeout(timeout);
  }
}
