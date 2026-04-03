import { getExternalNews } from "./externalNews";
import { type FeedItem } from "./types";
import { normalizeHttpUrl, normalizeImageUrl } from "./utils";

export type NewsResearchOptions = {
  brief: string;
  limit: number;
  fetchArticleText: boolean;
  campaignLine: string | null;
};

export type NewsResearchSource = {
  rank: number;
  title: string;
  sourceName: string | null;
  sourceUrl: string;
  imageUrl: string | null;
  videoUrl: string | null;
  videoPosterUrl: string | null;
  excerpt: string | null;
  section: string;
  publishedAt: string;
  matchScore: number;
};

export type NewsResearchResult = {
  contextText: string;
  sources: NewsResearchSource[];
  lead: NewsResearchSource | null;
};

type ArticleSnapshot = {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  imageCandidates: string[];
  videoUrl: string | null;
  videoPosterUrl: string | null;
  paragraphs: string[];
};

function compactText(input: string, maxLength: number): string {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return normalized.slice(0, maxLength);
}

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

function extractImageCandidates(html: string, pageUrl: string): string[] {
  const rawCandidates = [
    ...findMetaCandidates(html, "og:image"),
    ...findMetaCandidates(html, "og:image:url"),
    ...findMetaCandidates(html, "twitter:image"),
    ...findMetaCandidates(html, "twitter:image:src"),
    ...findMetaCandidates(html, "image"),
    ...extractAttributeCandidates(html, /<img[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["']/gi),
  ];

  const screenshotCandidates = [
    `https://s.wordpress.com/mshots/v1/${encodeURIComponent(pageUrl)}?w=1600`,
    `https://image.thum.io/get/width/1600/noanimate/${pageUrl}`,
  ];

  return Array.from(
    new Set(
      [...rawCandidates, ...screenshotCandidates]
        .map((candidate) => absoluteMediaUrl(pageUrl, candidate, "image"))
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

async function fetchArticleSnapshot(url: string): Promise<ArticleSnapshot> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
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
    const imageCandidates = extractImageCandidates(html, url);
    const videoSnapshot = extractVideoSnapshot(html, url);
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

function tokenizeBrief(brief: string): string[] {
  return brief
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4)
    .slice(0, 20);
}

function scoreByBrief(text: string, tokens: string[]): number {
  if (tokens.length === 0) {
    return 0;
  }
  const haystack = text.toLowerCase();
  return tokens.reduce((acc, token) => (haystack.includes(token) ? acc + 1 : acc), 0);
}

function ensureAbsoluteUrl(input: string): string {
  const normalized = input.trim();
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return normalized;
  }
  return `https://${normalized.replace(/^\/+/, "")}`;
}

function toWsrvSourceParam(input: string): string {
  const absolute = ensureAbsoluteUrl(input);
  try {
    const parsed = new URL(absolute);
    const hostAndPath = `${parsed.hostname}${parsed.pathname}${parsed.search}`;
    return parsed.protocol === "https:" ? `ssl:${hostAndPath}` : hostAndPath;
  } catch {
    return absolute;
  }
}

export function buildCroppedImageUrl(imageUrl: string, width: number, height: number): string {
  const safeWidth = Math.max(480, Math.min(2400, Math.round(width)));
  const safeHeight = Math.max(320, Math.min(1800, Math.round(height)));
  const params = new URLSearchParams({
    url: toWsrvSourceParam(imageUrl),
    w: String(safeWidth),
    h: String(safeHeight),
    fit: "cover",
    output: "jpg",
    q: "82",
  });
  return `https://wsrv.nl/?${params.toString()}`;
}

type RankedSource = {
  source: NewsResearchSource;
  extendedText: string;
};

async function buildRankedSources(options: NewsResearchOptions): Promise<RankedSource[]> {
  const externalItems = await getExternalNews();
  const sliced = externalItems.slice(0, Math.max(5, Math.min(40, options.limit + 12)));
  const tokens = tokenizeBrief(options.brief);
  const snapshotByUrl = new Map<string, ArticleSnapshot>();

  if (options.fetchArticleText) {
    const snapshotTargets = sliced
      .slice(0, Math.min(8, sliced.length))
      .map((item) => item.sourceUrl)
      .filter((url): url is string => Boolean(url));

    const snapshotPairs = await Promise.all(
      snapshotTargets.map(async (url) => {
        const snapshot = await fetchArticleSnapshot(url);
        return [url, snapshot] as const;
      }),
    );

    for (const [url, snapshot] of snapshotPairs) {
      snapshotByUrl.set(url, snapshot);
    }
  }

  const ranked: RankedSource[] = [];
  for (const [index, item] of sliced.entries()) {
    const withSnapshot = item.sourceUrl ? snapshotByUrl.get(item.sourceUrl) ?? null : null;
    const title = withSnapshot?.title || item.title;
    const excerpt = withSnapshot?.description || item.excerpt || null;
    const imageUrl = normalizeImageUrl(withSnapshot?.imageUrl || item.imageUrl || withSnapshot?.videoPosterUrl || null);
    const paragraphText = withSnapshot?.paragraphs.join(" || ") || "";
    const sourceText = `${title} ${excerpt ?? ""} ${paragraphText}`.trim();
    const score = scoreByBrief(sourceText, tokens);

    ranked.push({
      source: {
        rank: index + 1,
        title: compactText(title, 220),
        sourceName: item.sourceName,
        sourceUrl: item.sourceUrl || "",
        imageUrl,
        videoUrl: withSnapshot?.videoUrl ?? null,
        videoPosterUrl: withSnapshot?.videoPosterUrl ?? null,
        excerpt: excerpt ? compactText(excerpt, 260) : null,
        section: item.section,
        publishedAt: item.publishedAt,
        matchScore: score,
      },
      extendedText: compactText(sourceText, 900),
    });
  }

  return ranked
    .filter((entry) => entry.source.sourceUrl.length > 0)
    .sort((left, right) => {
      if (right.source.matchScore !== left.source.matchScore) {
        return right.source.matchScore - left.source.matchScore;
      }
      return +new Date(right.source.publishedAt) - +new Date(left.source.publishedAt);
    })
    .map((entry, index) => ({
      ...entry,
      source: {
        ...entry.source,
        rank: index + 1,
      },
    }));
}

function formatContextLines(ranked: RankedSource[], limit: number): string[] {
  return ranked.slice(0, limit).map((entry, index) => {
    const source = entry.source;
    const sourceName = compactText(source.sourceName ?? "Fuente abierta", 60);
    const excerpt = source.excerpt ? ` -- ${source.excerpt}` : "";
    const paragraphs = entry.extendedText && source.excerpt && entry.extendedText !== source.excerpt ? ` -- ${entry.extendedText}` : "";
    return `${index + 1}. [HOT|${source.section}|${sourceName}|${source.publishedAt}|score:${source.matchScore}] ${source.title}${excerpt}${paragraphs}`;
  });
}

export async function buildNewsResearchContext(options: NewsResearchOptions): Promise<NewsResearchResult> {
  const limit = Math.max(3, Math.min(20, Math.round(options.limit)));
  const ranked = await buildRankedSources(options);
  const picked = ranked.slice(0, limit);
  const lines = formatContextLines(picked, limit);

  const campaignBlock =
    options.campaignLine && options.campaignLine.trim().length > 0
      ? [
          "",
          "BAJADA/CAMPANA ACTIVA (prioritaria para enfoque editorial):",
          compactText(options.campaignLine, 260),
        ]
      : [];

  const contextText = [
    "CAPA DE INVESTIGACION PERIODISTICA (fuentes abiertas):",
    `- Fuentes candidatas analizadas: ${ranked.length}`,
    `- Fuentes calientes usadas en contexto: ${picked.length}`,
    "- Objetivo: reescribir noticia propia de Pulso Pais sin copiar literal.",
    "",
    "AGENDA CALIENTE INVESTIGADA:",
    ...lines,
    ...campaignBlock,
  ].join("\n");

  return {
    contextText,
    sources: picked.map((entry) => entry.source),
    lead: picked[0]?.source ?? null,
  };
}

export function sourceFeedToText(items: NewsResearchSource[], maxItems = 8): string {
  const top = items.slice(0, maxItems);
  if (top.length === 0) {
    return "";
  }
  return top
    .map((item, index) => `${index + 1}. ${item.title} (${item.sourceName ?? "Fuente"}) ${item.sourceUrl}`)
    .join("\n");
}

export function isExternalFeedItem(item: FeedItem): boolean {
  return Boolean(item.isExternal || item.sourceUrl);
}
