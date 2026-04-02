import Parser from "rss-parser";
import { asNullable, normalizeHttpUrl, normalizeImageUrl, parseGdeltDate, readString } from "./utils";
import { dedupeByKey, guessSectionFromText } from "./feed";
import type { FeedItem } from "./types";

const rssParser = new Parser();

function extractRssImage(content: string): string | null {
  const match = content.match(/<img[^>]+src=["']([^"']+)["']/i);
  return normalizeImageUrl(match?.[1] ?? null);
}

async function fetchExternalFromGdelt(): Promise<FeedItem[]> {
  const query = encodeURIComponent("sourcecountry:AR AND (politica OR elecciones OR congreso OR gobernador OR intendente)");
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=ArtList&maxrecords=35&format=json&sort=DateDesc`;

  const response = await fetch(url, {
    headers: {
      "user-agent": "PulsoPaisBot/1.0",
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`GDELT respondio ${response.status}`);
  }

  const payload = (await response.json()) as { articles?: Array<Record<string, unknown>> };
  const articles = payload.articles ?? [];

  const mapped: FeedItem[] = [];
  for (const [index, article] of articles.entries()) {
    const title = readString(article.title);
    const sourceUrl = normalizeHttpUrl(article.url);
    if (!title || !sourceUrl) {
      continue;
    }
    const section = guessSectionFromText(`${title} ${readString(article.seendate)}`);
    mapped.push({
      id: `gdelt-${Date.now()}-${index}`,
      slug: null,
      title,
      kicker: "Pulso en tiempo real",
      excerpt: readString(article.snippet) || "Actualizacion automatica desde fuentes periodisticas abiertas.",
      imageUrl: normalizeImageUrl(article.socialimage),
      sourceName: asNullable(readString(article.domain)) ?? "Fuente Externa",
      sourceUrl,
      section,
      province: null,
      publishedAt: parseGdeltDate(readString(article.seendate)),
      isSponsored: false,
      isFeatured: false,
      isExternal: true,
    });
  }
  return mapped;
}

async function fetchExternalFromGoogleRss(): Promise<FeedItem[]> {
  const rssUrl = "https://news.google.com/rss/search?q=politica+argentina+elecciones+gobierno&hl=es-419&gl=AR&ceid=AR:es-419";
  const feed = await rssParser.parseURL(rssUrl);

  const mapped: FeedItem[] = [];
  for (const [index, item] of (feed.items ?? []).entries()) {
    const title = readString(item.title);
    const sourceUrl = normalizeHttpUrl(item.link);
    if (!title || !sourceUrl) {
      continue;
    }
    const content = readString(item["content:encoded"] as string) || readString(item.content);
    mapped.push({
      id: `google-rss-${Date.now()}-${index}`,
      slug: null,
      title,
      kicker: "Monitor nacional",
      excerpt: asNullable(readString(item.contentSnippet)),
      imageUrl: extractRssImage(content),
      sourceName: asNullable(readString(item.creator)) ?? asNullable(readString(feed.title)) ?? "Google News",
      sourceUrl,
      section: guessSectionFromText(`${title} ${readString(item.contentSnippet)}`),
      province: null,
      publishedAt: new Date(readString(item.isoDate) || readString(item.pubDate) || Date.now()).toISOString(),
      isSponsored: false,
      isFeatured: false,
      isExternal: true,
    });
  }
  return mapped;
}

let externalCache: { expiresAt: number; items: FeedItem[] } = {
  expiresAt: 0,
  items: [],
};

export async function getExternalNews(): Promise<FeedItem[]> {
  if (externalCache.items.length > 0 && Date.now() < externalCache.expiresAt) {
    return externalCache.items;
  }

  const results = await Promise.allSettled([fetchExternalFromGdelt(), fetchExternalFromGoogleRss()]);
  const fromGdelt = results[0].status === "fulfilled" ? results[0].value : [];
  const fromGoogle = results[1].status === "fulfilled" ? results[1].value : [];
  const merged = dedupeByKey([...fromGdelt, ...fromGoogle])
    .sort((left, right) => +new Date(right.publishedAt) - +new Date(left.publishedAt))
    .slice(0, 40);

  externalCache = {
    expiresAt: Date.now() + 8 * 60 * 1000,
    items: merged,
  };

  return merged;
}
