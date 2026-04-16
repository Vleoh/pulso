import { getExternalNews } from "./externalNews";
import { type FeedItem } from "./types";
import { isGoogleNewsUrl, normalizeHttpUrl } from "./utils";
import {
  fetchArticleSnapshot,
  pickBestEditorialImageUrl,
  type ArticleSnapshot,
} from "./articleMedia";

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

function compactText(input: string, maxLength: number): string {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return normalized.slice(0, maxLength);
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

function scoreArgentinaFocus(sourceText: string, sourceUrl: string): number {
  const haystack = sourceText.toLowerCase();
  let score = 0;
  const positive = [
    "argentina",
    "buenos aires",
    "caba",
    "casa rosada",
    "congreso",
    "senado",
    "diputados",
    "gobernador",
    "provincia",
    "mendoza",
    "cordoba",
    "santa fe",
    "la plata",
  ];
  const negative = [
    "united states",
    "usa",
    "new york",
    "washington",
    "california",
    "florida",
    "white house",
    "trump",
  ];
  for (const token of positive) {
    if (haystack.includes(token)) {
      score += 2;
    }
  }
  for (const token of negative) {
    if (haystack.includes(token)) {
      score -= 2;
    }
  }
  try {
    const host = new URL(sourceUrl).hostname.toLowerCase();
    if (host.endsWith(".ar") || host.includes("argentina")) {
      score += 3;
    }
  } catch {
    return score;
  }
  return score;
}

function ensureAbsoluteUrl(input: string): string {
  const normalized = input.trim();
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return normalized;
  }
  return `https://${normalized.replace(/^\/+/, "")}`;
}

export function buildCroppedImageUrl(imageUrl: string, width: number, height: number): string {
  void width;
  void height;
  return ensureAbsoluteUrl(imageUrl);
}

type RankedSource = {
  source: NewsResearchSource;
  extendedText: string;
};

async function buildRankedSources(options: NewsResearchOptions): Promise<RankedSource[]> {
  const externalItems = await getExternalNews();
  const sliced = externalItems.slice(0, Math.max(5, Math.min(40, options.limit + 12)));
  const tokens = tokenizeBrief(options.brief);
  const argentinaFocus = /\b(argentina|nacion|provincia|federal|caba|conurbano)\b/i.test(options.brief);
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
    if (isGoogleNewsUrl(item.sourceUrl)) {
      continue;
    }
    const withSnapshot = item.sourceUrl ? snapshotByUrl.get(item.sourceUrl) ?? null : null;
    const title = withSnapshot?.title || item.title;
    const excerpt = withSnapshot?.description || item.excerpt || null;
    const imageUrl = pickBestEditorialImageUrl([
      withSnapshot?.imageUrl,
      item.imageUrl,
      withSnapshot?.videoPosterUrl,
    ]);
    const paragraphText = withSnapshot?.paragraphs.join(" || ") || "";
    const sourceText = `${title} ${excerpt ?? ""} ${paragraphText}`.trim();
    let score = scoreByBrief(sourceText, tokens);
    if (argentinaFocus) {
      score += scoreArgentinaFocus(sourceText, item.sourceUrl ?? "");
    }

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
    .filter((entry) => !isGoogleNewsUrl(entry.source.sourceUrl))
    .filter((entry) => Boolean(entry.source.imageUrl || entry.source.videoPosterUrl))
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
