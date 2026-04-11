import { type PrismaClient, NewsSection, NewsStatus } from "@prisma/client";
import { PROVINCE_OPTIONS, sectionLabel } from "./catalog";
import { dedupeByKey, toFeedItem } from "./feed";
import type { HomePayload } from "./types";
import { getHomeEngagementSettings, getHomeTheme } from "./siteSettings";
import { getSignalData } from "./signalData";

function daysAgo(date: Date): number {
  const diff = Date.now() - date.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function seededReactions(seed: string, index: number) {
  const hash = Array.from(seed).reduce((acc, char) => acc + char.charCodeAt(0), 0) + index * 17;
  return {
    apoyo: 25 + (hash % 120),
    analisis: 8 + (hash % 44),
    guardados: 11 + (hash % 60),
  };
}

function compactTopic(input: string): string {
  return input
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 28);
}

function feedVisualScore(item: { imageUrl: string | null; excerpt?: string | null; isExternal?: boolean; publishedAt: string; isFeatured?: boolean; isSponsored?: boolean }): number {
  const ageHours = Math.max(0, (Date.now() - +new Date(item.publishedAt)) / (1000 * 60 * 60));
  return [
    item.imageUrl ? 12 : 0,
    item.excerpt ? 4 : 0,
    item.isFeatured ? 3 : 0,
    item.isSponsored ? 0 : 1,
    item.isExternal ? 0 : 6,
    Math.max(0, 10 - Math.floor(ageHours / 8)),
  ].reduce((acc, value) => acc + value, 0);
}

export async function buildHomePayload(prisma: PrismaClient): Promise<HomePayload> {
  const [internalNews, theme, engagement, signalData] = await Promise.all([
    prisma.news.findMany({
      where: {
        status: NewsStatus.PUBLISHED,
      },
      orderBy: [{ isHero: "desc" }, { isFeatured: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
      take: 180,
    }),
    getHomeTheme(prisma),
    getHomeEngagementSettings(prisma),
    getSignalData(),
  ]);

  const internal = internalNews.map(toFeedItem);
  const hero =
    internal.find((item) => {
      const original = internalNews.find((candidate) => candidate.id === item.id);
      return Boolean(original?.isHero);
    }) ??
    internal[0] ?? null;

  const secondary = dedupeByKey(internal.filter((item) => item.id !== hero?.id)).slice(0, 3);

  const latest = dedupeByKey(
    internal.filter((item) => item.id !== hero?.id && !secondary.some((secondaryItem) => secondaryItem.id === item.id)),
  ).slice(0, 12);

  const radarElectoral = dedupeByKey(internal.filter((item) => item.section === NewsSection.RADAR_ELECTORAL)).slice(0, 8);

  const interviews = dedupeByKey([...internal.filter((item) => item.section === NewsSection.ENTREVISTAS), ...latest]).slice(0, 6);
  const opinion = dedupeByKey([...internal.filter((item) => item.section === NewsSection.OPINION), ...latest]).slice(0, 6);
  const sponsored = dedupeByKey([...internal.filter((item) => item.isSponsored || item.section === NewsSection.PUBLINOTAS), ...latest]).slice(0, 6);

  const trendTopics = Array.from(
    new Set(
      [
        ...internalNews.flatMap((item) => item.tags ?? []),
        ...internalNews.map((item) => sectionLabel(item.section)),
        "Pulso Live",
        "Fact-check",
        "Comunidad",
      ]
        .map((topic) => compactTopic(topic))
        .filter(Boolean),
    ),
  ).slice(0, 10);

  const ticker = dedupeByKey([...(hero ? [hero] : []), ...secondary, ...radarElectoral, ...latest])
    .slice(0, 12)
    .map((item) => item.title);

  const fallbackFederalPool = dedupeByKey(internal)
    .sort((left, right) => feedVisualScore(right) - feedVisualScore(left))
    .filter((item) => Boolean(item.imageUrl || item.excerpt));
  const usedFederalFallbackIds = new Set<string>();

  const federalHighlights = PROVINCE_OPTIONS.map((provinceOption) => {
    const internalByProvince = [...internal]
      .filter((item) => item.province === provinceOption.value)
      .sort((left, right) => feedVisualScore(right) - feedVisualScore(left))[0];
    if (internalByProvince) {
      return {
        id: internalByProvince.id,
        province: provinceOption.label,
        headline: internalByProvince.title,
        section: sectionLabel(internalByProvince.section),
        slug: internalByProvince.slug,
        isExternal: Boolean(internalByProvince.isExternal),
        imageUrl: internalByProvince.imageUrl,
        excerpt: internalByProvince.excerpt,
        sourceUrl: internalByProvince.sourceUrl,
        publishedAt: internalByProvince.publishedAt,
      };
    }

    const fallback =
      fallbackFederalPool.find((item) => {
        if (usedFederalFallbackIds.has(item.id)) {
          return false;
        }
        usedFederalFallbackIds.add(item.id);
        return true;
      }) ??
      fallbackFederalPool[0] ??
      hero;
    return {
      id: fallback?.id ?? `federal-fallback-${provinceOption.value}`,
      province: provinceOption.label,
      headline: fallback?.title ?? "Cobertura federal en actualizacion",
      section: fallback ? sectionLabel(fallback.section) : "Pulso Federal",
      slug: fallback?.slug ?? null,
      isExternal: Boolean(fallback?.isExternal),
      imageUrl: fallback?.imageUrl ?? null,
      excerpt: fallback?.excerpt ?? null,
      sourceUrl: fallback?.sourceUrl ?? null,
      publishedAt: fallback?.publishedAt ?? new Date().toISOString(),
    };
  });

  const microCards = dedupeByKey(latest)
    .slice(0, 12)
    .map((item, index) => ({
      id: item.id,
      title: item.title,
      section: item.section,
      province: item.province,
      sourceName: item.sourceName,
      publishedAt: item.publishedAt,
      imageUrl: item.imageUrl,
      excerpt: item.excerpt,
      reactions: seededReactions(item.id, index),
    }));

  const internationalLive = dedupeByKey(internal.filter((item) => item.section === NewsSection.INTERNACIONALES))
    .slice(0, 9)
    .map((item) => ({
      id: item.id,
      title: item.title,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
      publishedAt: item.publishedAt,
      section: item.section,
    }));

  const todayPublishedCount = internalNews.filter((item) => (item.publishedAt ?? item.createdAt).toDateString() === new Date().toDateString()).length;
  const activeDistricts = new Set(internalNews.map((item) => item.province).filter(Boolean)).size;
  const averageFreshnessDays =
    internalNews.length > 0
      ? Math.round(internalNews.reduce((acc, item) => acc + daysAgo(item.publishedAt ?? item.createdAt), 0) / internalNews.length)
      : 0;

  return {
    generatedAt: new Date().toISOString(),
    theme,
    engagement,
    ticker,
    hero,
    secondary,
    latest,
    radarElectoral,
    interviews,
    opinion,
    sponsored,
    externalPulse: [],
    federalHighlights,
    adSlots: [
      {
        id: "top-leaderboard",
        title: "Top Banner Institucional",
        detail: "Espacio premium 970x90 para campanas nacionales y cobertura especial.",
      },
      {
        id: "middle-sponsor",
        title: "Modulo Patrocinado",
        detail: "Ubicacion editorial entre secciones de alta lectura.",
      },
      {
        id: "district-pack",
        title: "Paquete Distrital",
        detail: "Visibilidad por provincia para candidaturas y equipos territoriales.",
      },
    ],
    social: {
      trendTopics,
      weather: signalData.weather,
      markets: signalData.markets,
      gadgets: [
        {
          id: "live-updates",
          label: "Pulso Live",
          value: String(latest.length + radarElectoral.length),
          detail: "Items activos para consumo rapido.",
        },
        {
          id: "published-today",
          label: "Publicadas hoy",
          value: String(todayPublishedCount),
          detail: "Notas internas con sello editorial del dia.",
        },
        {
          id: "district-presence",
          label: "Distritos activos",
          value: String(activeDistricts),
          detail: "Cobertura provincial y municipal en tiempo real.",
        },
        {
          id: "freshness",
          label: "Frescura media",
          value: `${averageFreshnessDays}d`,
          detail: "Antiguedad promedio del inventario editorial.",
        },
      ],
      microCards,
      suggestedSections: [
        {
          id: "pulso-live",
          label: "Pulso Live",
          detail: "Stream continuo de titulares breves y contexto en 30 segundos.",
        },
        {
          id: "fact-check",
          label: "Fact-check",
          detail: "Chequeo rapido de frases, cifras y promesas de campana.",
        },
        {
          id: "comunidad",
          label: "Comunidad",
          detail: "Preguntas de lectores, reacciones y seguimiento por distrito.",
        },
        {
          id: "radar-social",
          label: "Radar Social",
          detail: "Que conversa la audiencia politica en tiempo real.",
        },
      ],
      internationalLive,
    },
  };
}
