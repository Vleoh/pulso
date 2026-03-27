import { type PrismaClient, type News } from "@prisma/client";
import { provinceLabel, sectionLabel } from "./catalog";
import { getExternalNews } from "./externalNews";
import { readString } from "./utils";

type WrapperNewsContextMeta = {
  generatedAt: string;
  internalCount: number;
  externalCount: number;
  linesUsed: number;
};

export type WrapperNewsContext = {
  contextText: string;
  meta: WrapperNewsContextMeta;
};

let contextCache: {
  expiresAt: number;
  context: WrapperNewsContext;
} | null = null;

function compactText(input: string, maxLength = 220): string {
  const clean = input.replace(/\s+/g, " ").trim();
  if (!clean) {
    return "";
  }
  return clean.slice(0, maxLength);
}

function internalLine(news: News, index: number): string {
  const publishedAt = (news.publishedAt ?? news.createdAt).toISOString();
  const district = news.province ? provinceLabel(news.province) ?? news.province : "Nacional";
  const section = sectionLabel(news.section);
  const headline = compactText(news.title, 170);
  const excerpt = compactText(news.excerpt ?? news.body ?? "", 160);
  const source = compactText(readString(news.sourceName) || "Pulso Pais", 46);
  const status = news.status;
  return `${index + 1}. [INTERNA|${status}|${section}|${district}|${source}|${publishedAt}] ${headline}${excerpt ? ` -- ${excerpt}` : ""}`;
}

function externalLine(
  item: { title: string; excerpt: string | null; sourceName: string | null; section: string; publishedAt: string },
  index: number,
): string {
  const headline = compactText(item.title, 170);
  const excerpt = compactText(item.excerpt ?? "", 150);
  const source = compactText(item.sourceName ?? "Fuente Externa", 46);
  return `${index + 1}. [EXTERNA|PUBLISHED|${item.section}|Nacional|${source}|${item.publishedAt}] ${headline}${excerpt ? ` -- ${excerpt}` : ""}`;
}

export async function buildAiNewsContext(prisma: PrismaClient): Promise<WrapperNewsContext> {
  if (contextCache && Date.now() < contextCache.expiresAt) {
    return contextCache.context;
  }

  const [internalCount, internalNews, externalNews] = await Promise.all([
    prisma.news.count(),
    prisma.news.findMany({
      orderBy: [{ updatedAt: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
      take: 700,
    }),
    getExternalNews().catch(() => []),
  ]);

  const internalLines = internalNews.slice(0, 120).map((item, index) => internalLine(item, index));
  const externalLines = externalNews.slice(0, 40).map((item, index) => externalLine(item, index));

  const lines = [...internalLines, ...externalLines].slice(0, 150);
  const contextText = [
    "WRAPPER DE CONTEXTO DE NOTICIAS (Pulso Pais):",
    `- Noticias internas totales en base de datos: ${internalCount}`,
    `- Noticias internas de referencia tomadas para contexto: ${internalNews.length}`,
    `- Noticias externas abiertas: ${externalNews.length}`,
    `- Lineas incluidas en contexto para IA: ${lines.length}`,
    "",
    "AGENDA RECIENTE:",
    ...lines,
  ].join("\n");

  const context: WrapperNewsContext = {
    contextText,
    meta: {
      generatedAt: new Date().toISOString(),
      internalCount,
      externalCount: externalNews.length,
      linesUsed: lines.length,
    },
  };

  contextCache = {
    expiresAt: Date.now() + 3 * 60 * 1000,
    context,
  };

  return context;
}
