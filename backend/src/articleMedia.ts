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
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
      "i",
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

function absoluteMediaUrl(pageUrl: string, candidate: string | null, kind: "image" | "video"): string | null {
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
    "ads",
    "banner",
    "pixel",
    "default",
    "fallback",
    "unsplash.com",
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
    ...findMetaCandidates(html, "og:image:url"),
    ...findMetaCandidates(html, "twitter:image"),
    ...findMetaCandidates(html, "twitter:image:src"),
    ...findMetaCandidates(html, "image"),
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
