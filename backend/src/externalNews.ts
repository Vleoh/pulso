import Parser from "rss-parser";
import { fetchArticleSnapshot, pickBestEditorialImageUrl } from "./articleMedia";
import { asNullable, isGoogleNewsUrl, normalizeHttpUrl, normalizeImageUrl, parseGdeltDate, readString } from "./utils";
import { dedupeByKey, guessSectionFromText, resolveManagedFeedImage } from "./feed";
import type { FeedItem } from "./types";

const rssParser = new Parser();
const EXTERNAL_IMAGE_ENRICH_LIMIT = 10;
const DIRECT_RSS_TIMEOUT_MS = 12_000;
const POLITICAL_KEYWORDS = [
  "milei",
  "gobierno",
  "congreso",
  "eleccion",
  "electoral",
  "senado",
  "diputados",
  "presidente",
  "ministro",
  "bullrich",
  "macri",
  "kicillof",
  "massa",
  "villarruel",
  "grabois",
  "bregman",
  "casa rosada",
  "provincia",
  "intendente",
  "legislatura",
  "justicia",
  "seguridad",
  "dolar",
  "inflacion",
  "economia",
];

const DIRECT_RSS_FEEDS = [
  {
    id: "clarin-politica",
    url: "https://www.clarin.com/rss/politica/",
    sourceName: "Clarín",
    strictPolitics: true,
  },
  {
    id: "lanacion-general",
    url: "https://www.lanacion.com.ar/arc/outboundfeeds/rss/?outputType=xml",
    sourceName: "La Nación",
    strictPolitics: false,
  },
  {
    id: "perfil-general",
    url: "https://www.perfil.com/feed/",
    sourceName: "Perfil",
    strictPolitics: false,
  },
] as const;

function extractRssImage(content: string): string | null {
  const match = content.match(/<img[^>]+src=["']([^"']+)["']/i);
  return normalizeImageUrl(match?.[1] ?? null);
}

function looksPolitical(text: string, strictPolitics: boolean): boolean {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const hits = POLITICAL_KEYWORDS.reduce((acc, token) => (normalized.includes(token) ? acc + 1 : acc), 0);
  return strictPolitics ? hits >= 1 : hits >= 2;
}

async function parseRemoteFeed(feedUrl: string): Promise<Parser.Output<Record<string, unknown>>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DIRECT_RSS_TIMEOUT_MS);
  try {
    const response = await fetch(feedUrl, {
      signal: controller.signal,
      headers: {
        "user-agent": "PulsoPaisFeedBot/1.0",
        accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      },
    });
    if (!response.ok) {
      throw new Error(`RSS respondio ${response.status}`);
    }
    const xml = await response.text();
    return await rssParser.parseString(xml);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchExternalFromDirectFeeds(): Promise<FeedItem[]> {
  const settled = await Promise.allSettled(
    DIRECT_RSS_FEEDS.map(async (feedConfig) => {
      const feed = await parseRemoteFeed(feedConfig.url);
      return { feedConfig, feed };
    }),
  );

  const mapped: FeedItem[] = [];
  for (const result of settled) {
    if (result.status !== "fulfilled") {
      continue;
    }

    const { feedConfig, feed } = result.value;
    for (const [index, item] of (feed.items ?? []).entries()) {
      const title = readString(item.title);
      const sourceUrl = normalizeHttpUrl(item.link ?? item.guid);
      if (!title || !sourceUrl) {
        continue;
      }

      const htmlContent =
        readString((item as Record<string, unknown>)["content:encoded"]) ||
        readString(item.content) ||
        readString((item as Record<string, unknown>)["content:encodedSnippet"]);
      const snippet = asNullable(readString(item.contentSnippet)) ?? asNullable(readString(item.summary));
      const thematicText = `${title} ${snippet ?? ""} ${htmlContent}`.trim();
      if (!looksPolitical(thematicText, feedConfig.strictPolitics)) {
        continue;
      }

      const enclosureUrl =
        normalizeImageUrl((item as { enclosure?: { url?: string | null } }).enclosure?.url ?? null) ??
        normalizeImageUrl((item as Record<string, unknown>)["media:content"]) ??
        extractRssImage(htmlContent);

      mapped.push({
        id: `${feedConfig.id}-${Date.now()}-${index}`,
        slug: null,
        title,
        kicker: "Pulso en tiempo real",
        excerpt: snippet ?? "Actualizacion automatica desde fuentes periodisticas abiertas.",
        imageUrl: resolveManagedFeedImage(enclosureUrl, {
          sourceUrl,
          seed: `${title} ${feedConfig.sourceName}`,
        }),
        sourceName:
          asNullable(readString((item as Record<string, unknown>).creator)) ??
          asNullable(readString(feed.title)) ??
          feedConfig.sourceName,
        sourceUrl,
        section: guessSectionFromText(thematicText),
        province: null,
        publishedAt: new Date(readString(item.isoDate) || readString(item.pubDate) || Date.now()).toISOString(),
        isSponsored: false,
        isFeatured: false,
        isExternal: true,
      });
    }
  }

  return mapped;
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
      imageUrl: resolveManagedFeedImage(normalizeImageUrl(article.socialimage), {
        sourceUrl,
        seed: `${title} ${readString(article.domain)}`,
      }),
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
      imageUrl: resolveManagedFeedImage(extractRssImage(content), {
        sourceUrl,
        seed: `${title} ${readString(feed.title)}`,
      }),
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

async function enrichExternalImages(items: FeedItem[]): Promise<FeedItem[]> {
  const targets = items.slice(0, Math.min(EXTERNAL_IMAGE_ENRICH_LIMIT, items.length));
  const snapshots = await Promise.allSettled(
    targets.map(async (item) => {
      if (!item.sourceUrl) {
        return null;
      }
      const snapshot = await fetchArticleSnapshot(item.sourceUrl);
      return { itemId: item.id, snapshot };
    }),
  );

  const snapshotById = new Map<string, Awaited<ReturnType<typeof fetchArticleSnapshot>>>();
  for (const entry of snapshots) {
    if (entry.status !== "fulfilled" || !entry.value) {
      continue;
    }
    snapshotById.set(entry.value.itemId, entry.value.snapshot);
  }

  return items.map((item) => {
    if (isGoogleNewsUrl(item.sourceUrl)) {
      return {
        ...item,
        imageUrl: null,
      };
    }
    const snapshot = snapshotById.get(item.id);
    if (!snapshot) {
      return item;
    }
    const imageUrl = resolveManagedFeedImage(
      pickBestEditorialImageUrl([snapshot.imageUrl, ...snapshot.imageCandidates, snapshot.videoPosterUrl, item.imageUrl]),
      {
        sourceUrl: item.sourceUrl,
        seed: `${item.title} ${item.sourceName ?? ""}`,
      },
    );
    return {
      ...item,
      imageUrl: imageUrl ?? item.imageUrl,
    };
  });
}

let externalCache: { expiresAt: number; items: FeedItem[] } = {
  expiresAt: 0,
  items: [],
};

export async function getExternalNews(): Promise<FeedItem[]> {
  if (externalCache.items.length > 0 && Date.now() < externalCache.expiresAt) {
    return externalCache.items;
  }

  const results = await Promise.allSettled([
    fetchExternalFromDirectFeeds(),
    fetchExternalFromGdelt(),
    fetchExternalFromGoogleRss(),
  ]);
  const fromDirectFeeds = results[0].status === "fulfilled" ? results[0].value : [];
  const fromGdelt = results[1].status === "fulfilled" ? results[1].value : [];
  const fromGoogle = results[2].status === "fulfilled" ? results[2].value : [];
  const deduped = dedupeByKey([...fromDirectFeeds, ...fromGdelt, ...fromGoogle]).sort(
    (left, right) => +new Date(right.publishedAt) - +new Date(left.publishedAt),
  );
  const directItems = deduped.filter((item) => !isGoogleNewsUrl(item.sourceUrl));
  const googleItems = deduped.filter((item) => isGoogleNewsUrl(item.sourceUrl));
  const mergedBase = [...directItems.slice(0, 28), ...googleItems.slice(0, 12)].slice(0, 40);
  const merged = await enrichExternalImages(mergedBase);

  externalCache = {
    expiresAt: Date.now() + 8 * 60 * 1000,
    items: merged,
  };

  return merged;
}
