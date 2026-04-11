import { promises as fs } from "node:fs";
import path from "node:path";
import mammoth from "mammoth";
import { NewsStatus, PollStatus } from "@prisma/client";
import type { NormalizedNewsInput } from "./types";
import { slugifyText } from "./utils";
import { FIXED_CANDIDATE_OPTIONS } from "./polls";

export type AiDecision = "ALLOW" | "REVIEW" | "REJECT";

export type EditorialReview = {
  decision: AiDecision;
  reason: string;
  score: number | null;
  warnings: string[];
  suggestedTitle: string | null;
  suggestedKicker: string | null;
  suggestedExcerpt: string | null;
  suggestedTags: string[];
  model: string;
};

export type EditorialAssistInput = {
  brief: string;
  sectionHint: string | null;
  provinceHint: string | null;
  isSponsored: boolean;
  currentTitle: string | null;
  currentKicker: string | null;
  currentExcerpt: string | null;
  currentBody: string | null;
  currentImageUrl: string | null;
  currentSourceName: string | null;
  currentSourceUrl: string | null;
  currentAuthorName: string | null;
  currentStatus: string | null;
  currentPublishedAt: string | null;
  currentSection: string | null;
  currentProvince: string | null;
  currentFlags: {
    isHero: boolean;
    isFeatured: boolean;
    isSponsored: boolean;
    isInterview: boolean;
    isOpinion: boolean;
    isRadar: boolean;
  };
  currentTags: string[];
};

export type EditorialAssistDraft = {
  title: string | null;
  kicker: string | null;
  excerpt: string | null;
  body: string | null;
  imageUrl: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  authorName: string | null;
  tags: string[];
  section: string | null;
  province: string | null;
  status: NewsStatus | null;
  publishedAt: string | null;
  flags: {
    isHero: boolean;
    isFeatured: boolean;
    isSponsored: boolean;
    isInterview: boolean;
    isOpinion: boolean;
    isRadar: boolean;
  };
  notes: string[];
  publishNowRecommended: boolean;
  model: string;
};

export type EditorialAskResponse = {
  answer: string;
  shouldApplyDraft: boolean;
  draft: EditorialAssistDraft | null;
  model: string;
};

export type EditorialBatchAssistInput = {
  totalItems: number;
  campaignPercent: number;
  campaignTopic: string;
  generalBrief: string;
  sectionHint: string | null;
  provinceHint: string | null;
  publishStatus: NewsStatus;
  requireImageUrl: boolean;
};

export type EditorialBatchAssistItem = {
  slot: number;
  focus: "CAMPAIGN" | "GENERAL";
  draft: EditorialAssistDraft;
};

export type EditorialBatchAssistOutput = {
  items: EditorialBatchAssistItem[];
  summary: string | null;
  model: string;
};

export type EditorialCommandOperation =
  | {
      kind: "CREATE_STORIES";
      count: number;
      brief: string;
      campaignPercent: number;
      campaignTopic: string | null;
      generalBrief: string;
      useResearchAgent: boolean;
      requireImageUrl: boolean;
      publishStatus: NewsStatus | null;
      sectionHint: string | null;
      provinceHint: string | null;
      includeCampaignLine: boolean;
      rationale: string | null;
    }
  | {
      kind: "INTERNALIZE_EXTERNALS";
      instruction: string;
      limit: number;
      scope: "mixed" | "existing" | "feed";
      publishStatus: NewsStatus | null;
      sectionHint: string | null;
      provinceHint: string | null;
      includeCampaignLine: boolean;
      deleteDuplicates: boolean;
      rationale: string | null;
    }
  | {
      kind: "REWRITE_EXISTING";
      match: string;
      limit: number;
      instruction: string;
      useResearchAgent: boolean;
      requireImageUrl: boolean;
      publishStatus: NewsStatus | null;
      sectionHint: string | null;
      provinceHint: string | null;
      includeCampaignLine: boolean;
      rationale: string | null;
    }
  | {
      kind: "UPDATE_METADATA";
      match: string;
      limit: number;
      fields: {
        kicker: string | null;
        section: string | null;
        province: string | null;
        status: NewsStatus | null;
        isFeatured: boolean | null;
        isHero: boolean | null;
        isSponsored: boolean | null;
        isInterview: boolean | null;
        isOpinion: boolean | null;
        isRadar: boolean | null;
        authorName: string | null;
        sourceName: string | null;
        addTags: string[];
        removeTags: string[];
      };
      rationale: string | null;
    }
  | {
      kind: "DELETE_NEWS";
      match: string;
      limit: number;
      onlyThinExternal: boolean;
      rationale: string | null;
    };

export type EditorialCommandPlanInput = {
  instruction: string;
  campaignLine: string | null;
  allowDestructive: boolean;
};

export type EditorialCommandPlan = {
  summary: string;
  notes: string[];
  destructive: boolean;
  requiresConfirmation: boolean;
  operations: EditorialCommandOperation[];
  model: string;
};

export type EditorialCommandChatResponse = {
  answer: string;
  plan: EditorialCommandPlan | null;
  mode: "DISCUSS" | "PLAN";
  model: string;
};

export type PollAssistInput = {
  brief: string;
  currentTitle: string | null;
  currentSlug: string | null;
  currentQuestion: string | null;
  currentHookLabel: string | null;
  currentFooterCta: string | null;
  currentDescription: string | null;
  currentInterviewUrl: string | null;
  currentCoverImageUrl: string | null;
  currentStatus: PollStatus | null;
  currentPublishedAt: string | null;
  currentStartsAt: string | null;
  currentEndsAt: string | null;
  currentIsFeatured: boolean;
};

export type PollAssistDraft = {
  title: string | null;
  slug: string | null;
  question: string | null;
  hookLabel: string | null;
  footerCta: string | null;
  description: string | null;
  interviewUrl: string | null;
  coverImageUrl: string | null;
  status: PollStatus | null;
  publishedAt: string | null;
  startsAt: string | null;
  endsAt: string | null;
  isFeatured: boolean;
  customSheetCode: string | null;
  notes: string[];
  model: string;
};

export type EditorialAiHealth = {
  enabled: boolean;
  enforce: boolean;
  providerOrder: string[];
  primaryProvider: "gemini" | "ollama";
  aiReachable: boolean;
  geminiConfigured: boolean;
  geminiModel: string;
  geminiReachable: boolean;
  ollamaUrl: string;
  configuredModel: string;
  model: string;
  ollamaReachable: boolean;
  guidelinesLoaded: boolean;
  checkedAt: string;
  error: string | null;
};

const AI_FILTER_ENABLED = (process.env.AI_FILTER_ENABLED ?? "true").toLowerCase() !== "false";
const AI_FILTER_ENFORCE = (process.env.AI_FILTER_ENFORCE ?? "true").toLowerCase() !== "false";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
const GEMINI_FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS ?? "gemini-2.0-flash-lite,gemini-1.5-flash-latest")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const GEMINI_API_BASE = process.env.GEMINI_API_BASE ?? "https://generativelanguage.googleapis.com/v1beta";
const AI_OLLAMA_URL = process.env.AI_OLLAMA_URL ?? "http://localhost:11434";
const AI_MODEL = process.env.AI_MODEL ?? "qwen3";
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS ?? 20000);
const GEMINI_RETRIES = Math.max(0, Math.min(4, Number(process.env.GEMINI_RETRIES ?? 2)));
const GEMINI_RETRY_BASE_MS = Math.max(300, Math.min(5000, Number(process.env.GEMINI_RETRY_BASE_MS ?? 1200)));
const AI_PROVIDER_ORDER = (process.env.AI_PROVIDER_ORDER ?? "gemini,ollama")
  .split(",")
  .map((item) => item.trim().toLowerCase())
  .filter((item) => item === "gemini" || item === "ollama");
let resolvedModelCache: { key: string; value: string; expiresAt: number } | null = null;

const GUIDELINE_CANDIDATES = [
  process.env.EDITORIAL_GUIDELINES_PATH,
  path.resolve(process.cwd(), "editorial", "pulso-pais-linea-editorial.txt"),
  path.resolve(process.cwd(), "editorial", "pulso-pais-linea-editorial.docx"),
  path.resolve(process.cwd(), "..", "pulso-pais-linea-editorial.docx"),
  path.resolve(process.cwd(), "..", "pulso-pais-linea-editorial.txt"),
].filter(Boolean) as string[];

let guidelineCache: {
  loadedPath: string;
  mtimeMs: number;
  content: string;
} | null = null;

const EDITORIAL_OPERATING_CONSTITUTION = `
IDENTIDAD OPERATIVA DE PULSO PAIS

Pulso Pais es un medio argentino de politica, poder e interes publico. No opera como militante, propagandista ni vocero. Observa la politica, el poder y la conversacion publica con distancia critica. No responde a oficialismo, oposicion ni facciones. No busca agradar a dirigentes. Busca detectar que paso, por que importa, a quien afecta, que contradicciones existen y que consecuencias reales puede tener.

ROLES OPERATIVOS
- radar: detectar temas, agenda, senales y novedades
- reportero: reunir fuentes, separar lo confirmado de lo no confirmado y resumir hechos
- editor: decidir si vale publicar, esperar, seguir o descartar
- estilista de marca: mantener tono, formato y consistencia de Pulso Pais
- compliance: bloquear basura, difamacion, inventos, propaganda obvia y riesgos legales evitables

PRINCIPIOS PERMANENTES
- priorizar hechos verificables
- distinguir noticia, contexto, seguimiento, analisis e hipotesis
- no inventar datos, citas, nombres, antecedentes ni exclusivas
- no afirmar intenciones sin evidencia
- no usar lenguaje panfletario, militante o emocionalmente manipulador
- desconfiar por igual de todas las fuerzas politicas y de toda fuente interesada
- premiar interes publico y consecuencias reales antes que ruido de redes
- marcar incertidumbre cuando falte confirmacion
- separar operacion, percepcion y hecho comprobable
- no copiar textual largos pasajes de terceros
- no autopublicar si la evidencia es insuficiente

PRIORIDADES
- economia cotidiana, inflacion, empleo, salarios, consumo
- seguridad
- poder politico y disputas de gobierno
- corrupcion y transparencia
- legislacion, justicia y administracion publica
- conflictos territoriales y provinciales
- educacion, salud e infraestructura
- desinformacion, manipulacion digital y operaciones mediaticas
- fenomenos emergentes con impacto social o politico

CRITERIOS DE PUBLICACION
Publicar solo si se cumplen varias de estas condiciones:
- hay novedad real
- hay impacto publico
- hay evidencia suficiente
- hay aceleracion de conversacion o cobertura
- hay actores relevantes involucrados
- Pulso Pais agrega contexto util
- hay contradicciones con archivo o desplazamientos de agenda que merecen seguimiento

DESCARTAR O REBAJAR
- chimento politico sin consecuencia real
- ruido de redes sin impacto material
- propaganda partidaria obvia
- acusaciones graves sin sustento
- duplicacion innecesaria
- contenido con riesgo legal evidente sin base suficiente
- declaraciones redundantes sin novedad

PIPELINE MINIMO
Antes de redactar:
1) descubre agenda y senales
2) prefiltra por relevancia, novedad, confiabilidad y riesgo
3) investiga entre 3 y 8 fuentes cuando sea posible
4) identifica contradicciones, actores, fechas, lugares e intereses
5) decide si corresponde noticia, analisis, seguimiento, espera o descarte
6) produce titular, bajada, cuerpo, contexto, caption y formato corto si vale publicar

HEURISTICA DE INTERPRETACION
- sospechar de relatos demasiado convenientes
- buscar quien gana y quien pierde
- identificar contradicciones con archivo
- priorizar impacto material sobre performance discursiva
- no confundir tendencia digital con realidad material
- tratar la politica como sistema de incentivos, no como teatro moral

AUTOCHEQUEO OBLIGATORIO
Antes de cerrar una pieza o un plan, responder internamente:
- estoy describiendo o interpretando
- estoy usando una vara distinta segun el actor
- estoy presentando una inferencia como hecho
- tengo evidencia suficiente
- esta pieza agrega algo mas que repeticion

CRITERIO DE AUTOPUBLICACION
Solo autopublicar si:
- el tema es relevante
- la evidencia minima es suficiente
- el texto es consistente
- no hay senales fuertes de falsedad
- no hay riesgo legal evidente
- la pieza agrega algo mas que repeticion

ESTILO
argentino, contemporaneo, inteligente, periodistico, sobrio, directo, no academico, no complaciente, no militante.
`.trim();

const VALID_SECTIONS = new Set([
  "NACION",
  "PROVINCIAS",
  "MUNICIPIOS",
  "OPINION",
  "ENTREVISTAS",
  "PUBLINOTAS",
  "RADAR_ELECTORAL",
  "ECONOMIA",
  "INTERNACIONALES",
  "DISTRITOS",
]);

const VALID_PROVINCES = new Set([
  "CABA",
  "BUENOS_AIRES",
  "CATAMARCA",
  "CHACO",
  "CHUBUT",
  "CORDOBA",
  "CORRIENTES",
  "ENTRE_RIOS",
  "FORMOSA",
  "JUJUY",
  "LA_PAMPA",
  "LA_RIOJA",
  "MENDOZA",
  "MISIONES",
  "NEUQUEN",
  "RIO_NEGRO",
  "SALTA",
  "SAN_JUAN",
  "SAN_LUIS",
  "SANTA_CRUZ",
  "SANTA_FE",
  "SANTIAGO_DEL_ESTERO",
  "TIERRA_DEL_FUEGO",
  "TUCUMAN",
]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLocalOllamaUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(url);
}

function toAiDecision(input: string): AiDecision {
  const normalized = input.toUpperCase().trim();
  if (normalized === "REJECT") {
    return "REJECT";
  }
  if (normalized === "ALLOW") {
    return "ALLOW";
  }
  return "REVIEW";
}

function asCleanText(value: unknown, maxLength = 360): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned) {
    return null;
  }
  return cleaned.slice(0, maxLength);
}

function asLongText(value: unknown, maxLength = 6000): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = value.replace(/\r/g, "").trim();
  if (!cleaned) {
    return null;
  }
  return cleaned.slice(0, maxLength);
}

function asStringList(value: unknown, maxItems = 10, maxLength = 80): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .map((item) => item.slice(0, maxLength))
    .slice(0, maxItems);
}

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value === 1;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
  }
  return false;
}

function asNullableCleanText(value: unknown, maxLength = 280): string | null {
  const cleaned = asCleanText(value, maxLength);
  if (!cleaned || cleaned.toLowerCase() === "null") {
    return null;
  }
  return cleaned;
}

function asPositiveInt(value: unknown, fallback: number, min = 1, max = 40): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

function normalizeCmsStatus(value: unknown): NewsStatus | null {
  const cleaned = asNullableCleanText(value, 24);
  if (!cleaned) {
    return null;
  }
  return cleaned === NewsStatus.PUBLISHED ? NewsStatus.PUBLISHED : cleaned === NewsStatus.DRAFT ? NewsStatus.DRAFT : null;
}

function normalizeCmsSection(value: unknown): string | null {
  const cleaned = normalizeHintToken(asNullableCleanText(value, 48));
  return cleaned && VALID_SECTIONS.has(cleaned) ? cleaned : null;
}

function normalizeCmsProvince(value: unknown): string | null {
  const cleaned = normalizeHintToken(asNullableCleanText(value, 48));
  return cleaned && VALID_PROVINCES.has(cleaned) ? cleaned : null;
}

function normalizeCommandScope(value: unknown): "mixed" | "existing" | "feed" {
  const cleaned = asNullableCleanText(value, 24)?.toLowerCase();
  if (cleaned === "existing") {
    return "existing";
  }
  if (cleaned === "feed") {
    return "feed";
  }
  return "mixed";
}

function normalizeCommandOperation(raw: unknown): EditorialCommandOperation | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const data = raw as Record<string, unknown>;
  const kind = asNullableCleanText(data.kind, 40)?.toUpperCase();

  if (kind === "CREATE_STORIES") {
    const count = asPositiveInt(data.count, 1, 1, 40);
    const brief = asNullableCleanText(data.brief, 1200) ?? "";
    const generalBrief = asNullableCleanText(data.general_brief, 1200) ?? brief;
    if (!brief && !generalBrief) {
      return null;
    }
    return {
      kind: "CREATE_STORIES",
      count,
      brief: brief || generalBrief,
      campaignPercent: asPositiveInt(data.campaign_percent, 0, 0, 100),
      campaignTopic: asNullableCleanText(data.campaign_topic, 900),
      generalBrief: generalBrief || brief,
      useResearchAgent: asBoolean(data.use_research_agent),
      requireImageUrl: asBoolean(data.require_image_url) || true,
      publishStatus: normalizeCmsStatus(data.publish_status),
      sectionHint: normalizeCmsSection(data.section_hint),
      provinceHint: normalizeCmsProvince(data.province_hint),
      includeCampaignLine: asBoolean(data.include_campaign_line),
      rationale: asNullableCleanText(data.rationale, 420),
    };
  }

  if (kind === "INTERNALIZE_EXTERNALS") {
    const instruction = asNullableCleanText(data.instruction, 1600);
    if (!instruction) {
      return null;
    }
    return {
      kind: "INTERNALIZE_EXTERNALS",
      instruction,
      limit: asPositiveInt(data.limit, 6, 1, 20),
      scope: normalizeCommandScope(data.scope),
      publishStatus: normalizeCmsStatus(data.publish_status),
      sectionHint: normalizeCmsSection(data.section_hint),
      provinceHint: normalizeCmsProvince(data.province_hint),
      includeCampaignLine: asBoolean(data.include_campaign_line),
      deleteDuplicates: asBoolean(data.delete_duplicates),
      rationale: asNullableCleanText(data.rationale, 420),
    };
  }

  if (kind === "REWRITE_EXISTING") {
    const instruction = asNullableCleanText(data.instruction, 1200);
    const match = asNullableCleanText(data.match, 260);
    if (!instruction || !match) {
      return null;
    }
    return {
      kind: "REWRITE_EXISTING",
      match,
      limit: asPositiveInt(data.limit, 6, 1, 30),
      instruction,
      useResearchAgent: asBoolean(data.use_research_agent),
      requireImageUrl: asBoolean(data.require_image_url) || true,
      publishStatus: normalizeCmsStatus(data.publish_status),
      sectionHint: normalizeCmsSection(data.section_hint),
      provinceHint: normalizeCmsProvince(data.province_hint),
      includeCampaignLine: asBoolean(data.include_campaign_line),
      rationale: asNullableCleanText(data.rationale, 420),
    };
  }

  if (kind === "UPDATE_METADATA") {
    const match = asNullableCleanText(data.match, 260);
    if (!match) {
      return null;
    }
    const rawFields = data.fields && typeof data.fields === "object" ? (data.fields as Record<string, unknown>) : {};
    return {
      kind: "UPDATE_METADATA",
      match,
      limit: asPositiveInt(data.limit, 8, 1, 40),
      fields: {
        kicker: asNullableCleanText(rawFields.kicker, 120),
        section: normalizeCmsSection(rawFields.section),
        province: normalizeCmsProvince(rawFields.province),
        status: normalizeCmsStatus(rawFields.status),
        isFeatured: rawFields.is_featured === undefined ? null : asBoolean(rawFields.is_featured),
        isHero: rawFields.is_hero === undefined ? null : asBoolean(rawFields.is_hero),
        isSponsored: rawFields.is_sponsored === undefined ? null : asBoolean(rawFields.is_sponsored),
        isInterview: rawFields.is_interview === undefined ? null : asBoolean(rawFields.is_interview),
        isOpinion: rawFields.is_opinion === undefined ? null : asBoolean(rawFields.is_opinion),
        isRadar: rawFields.is_radar === undefined ? null : asBoolean(rawFields.is_radar),
        authorName: asNullableCleanText(rawFields.author_name, 120),
        sourceName: asNullableCleanText(rawFields.source_name, 120),
        addTags: asStringList(rawFields.add_tags, 12, 48),
        removeTags: asStringList(rawFields.remove_tags, 12, 48),
      },
      rationale: asNullableCleanText(data.rationale, 420),
    };
  }

  if (kind === "DELETE_NEWS") {
    const match = asNullableCleanText(data.match, 260);
    if (!match) {
      return null;
    }
    return {
      kind: "DELETE_NEWS",
      match,
      limit: asPositiveInt(data.limit, 5, 1, 500),
      onlyThinExternal: asBoolean(data.only_thin_external),
      rationale: asNullableCleanText(data.rationale, 420),
    };
  }

  return null;
}

function extractJsonPayload(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  const firstBracket = trimmed.indexOf("{");
  const lastBracket = trimmed.lastIndexOf("}");
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    return trimmed.slice(firstBracket, lastBracket + 1);
  }
  return trimmed;
}

function resolvedProviderOrder(): Array<"gemini" | "ollama"> {
  const base = AI_PROVIDER_ORDER.length > 0 ? AI_PROVIDER_ORDER : ["gemini", "ollama"];
  const unique = Array.from(new Set(base)).filter((item): item is "gemini" | "ollama" => item === "gemini" || item === "ollama");
  if (!unique.includes("gemini")) {
    unique.push("gemini");
  }
  if (!unique.includes("ollama")) {
    unique.push("ollama");
  }
  return unique;
}

async function readGuidelines(): Promise<string> {
  const errors: string[] = [];

  for (const candidatePath of GUIDELINE_CANDIDATES) {
    try {
      const stat = await fs.stat(candidatePath);

      if (
        guidelineCache &&
        guidelineCache.loadedPath === candidatePath &&
        guidelineCache.mtimeMs === stat.mtimeMs &&
        guidelineCache.content.length > 0
      ) {
        return guidelineCache.content;
      }

      const extension = path.extname(candidatePath).toLowerCase();
      let content = "";

      if (extension === ".docx") {
        const extracted = await mammoth.extractRawText({ path: candidatePath });
        content = extracted.value;
      } else {
        content = await fs.readFile(candidatePath, "utf8");
      }

      const normalized = content.replace(/\r/g, "").trim();
      if (!normalized) {
        errors.push(`${candidatePath}: vacio`);
        continue;
      }

      guidelineCache = {
        loadedPath: candidatePath,
        mtimeMs: stat.mtimeMs,
        content: normalized,
      };

      return normalized;
    } catch (error) {
      errors.push(`${candidatePath}: ${(error as Error).message}`);
    }
  }

  throw new Error(`No se pudo cargar la linea editorial. Revisar archivos: ${errors.join(" | ")}`);
}

function buildPrompt(input: NormalizedNewsInput, guidelineText: string, newsContext: string | null): string {
  const payload = {
    title: input.title,
    kicker: input.kicker,
    excerpt: input.excerpt,
    body: input.body,
    section: input.section,
    province: input.province,
    tags: input.tags,
    status: input.status,
    isSponsored: input.isSponsored,
  };

  return [
    "LINEA EDITORIAL DE REFERENCIA:",
    guidelineText,
    "",
    "NOTA A EVALUAR:",
    JSON.stringify(payload, null, 2),
    "",
    "CONTEXTO DE AGENDA PROVISTO POR WRAPPER:",
    newsContext ?? "Sin contexto adicional disponible.",
    "",
    "TAREA:",
    "1) Evalua alineacion editorial.",
    "2) Determina decision ALLOW, REVIEW o REJECT.",
    "3) Si hay desalineacion, explica el motivo con precision.",
    "4) Sugiere ajustes concretos para titulo, volanta, bajada y tags.",
    "5) Si hay riesgo legal, desinformacion, sesgo excesivo o tono fuera de marca, marca warnings.",
    "6) Usa el contexto del wrapper para evitar contradicciones de agenda y mejorar enfoque.",
    "",
    "RESPUESTA OBLIGATORIA EN JSON ESTRICTO:",
    "(todo texto en espanol neutro, sin ingles)",
    "{",
    '  "decision": "ALLOW|REVIEW|REJECT",',
    '  "reason": "motivo breve",',
    '  "score": 0-100,',
    '  "warnings": ["..."],',
    '  "suggested_title": "opcional",',
    '  "suggested_kicker": "opcional",',
    '  "suggested_excerpt": "opcional",',
    '  "suggested_tags": ["tag1","tag2"]',
    "}",
  ].join("\n");
}

async function resolveOllamaModelName(): Promise<string> {
  const cacheKey = `${AI_OLLAMA_URL}|${AI_MODEL}`;
  if (resolvedModelCache && resolvedModelCache.key === cacheKey && Date.now() < resolvedModelCache.expiresAt) {
    return resolvedModelCache.value;
  }

  if (AI_MODEL.includes(":")) {
    resolvedModelCache = {
      key: cacheKey,
      value: AI_MODEL,
      expiresAt: Date.now() + 5 * 60 * 1000,
    };
    return AI_MODEL;
  }

  try {
    const response = await fetch(`${AI_OLLAMA_URL}/api/tags`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      return AI_MODEL;
    }

    const payload = (await response.json()) as { models?: Array<{ name?: string }> };
    const modelNames = (payload.models ?? []).map((model) => model.name ?? "").filter(Boolean);

    const exact = modelNames.find((name) => name === AI_MODEL);
    if (exact) {
      resolvedModelCache = {
        key: cacheKey,
        value: exact,
        expiresAt: Date.now() + 5 * 60 * 1000,
      };
      return exact;
    }

    const tagged = modelNames.find((name) => name.startsWith(`${AI_MODEL}:`));
    if (tagged) {
      resolvedModelCache = {
        key: cacheKey,
        value: tagged,
        expiresAt: Date.now() + 5 * 60 * 1000,
      };
      return tagged;
    }
  } catch {
    return AI_MODEL;
  }

  return AI_MODEL;
}

async function pingOllama(): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(AI_TIMEOUT_MS, 6000));
  try {
    const response = await fetch(`${AI_OLLAMA_URL}/api/tags`, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function pingGemini(): Promise<boolean> {
  if (!GEMINI_API_KEY) {
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(AI_TIMEOUT_MS, 6000));
  try {
    const response = await fetch(`${GEMINI_API_BASE}/models?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function runOllamaJson(params: {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
}): Promise<{ parsed: Record<string, unknown>; modelUsed: string }> {
  const modelName = await resolveOllamaModelName();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(AI_TIMEOUT_MS, 60000));

  try {
    const response = await fetch(`${AI_OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: modelName,
        stream: false,
        format: "json",
        options: {
          temperature: params.temperature ?? 0.15,
        },
        messages: [
          {
            role: "system",
            content: params.systemPrompt,
          },
          {
            role: "user",
            content: params.userPrompt,
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Ollama respondio ${response.status}: ${detail.slice(0, 220)}`);
    }

    const payload = (await response.json()) as { message?: { content?: string } };
    const raw = payload.message?.content ?? "";
    const jsonPayload = extractJsonPayload(raw);
    const parsed = JSON.parse(jsonPayload) as Record<string, unknown>;
    return { parsed, modelUsed: modelName };
  } finally {
    clearTimeout(timeout);
  }
}

async function runGeminiJson(params: {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
}): Promise<{ parsed: Record<string, unknown>; modelUsed: string }> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY no configurada.");
  }

  const modelsToTry = Array.from(new Set([GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS])).filter(Boolean);
  const modelErrors: string[] = [];

  for (const modelName of modelsToTry) {
    for (let attempt = 0; attempt <= GEMINI_RETRIES; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

      try {
        const response = await fetch(
          `${GEMINI_API_BASE}/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              systemInstruction: {
                role: "system",
                parts: [{ text: params.systemPrompt }],
              },
              contents: [
                {
                  role: "user",
                  parts: [{ text: params.userPrompt }],
                },
              ],
              generationConfig: {
                temperature: params.temperature ?? 0.15,
                responseMimeType: "application/json",
              },
            }),
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          const detail = await response.text();
          const retryableStatus = response.status === 429 || response.status === 503 || response.status >= 500;

          if (retryableStatus && attempt < GEMINI_RETRIES) {
            await sleep(GEMINI_RETRY_BASE_MS * (attempt + 1));
            continue;
          }

          modelErrors.push(`${modelName} -> ${response.status}: ${detail.slice(0, 240)}`);
          break;
        }

        const payload = (await response.json()) as {
          candidates?: Array<{
            content?: {
              parts?: Array<{ text?: string }>;
            };
          }>;
          promptFeedback?: { blockReason?: string };
        };

        const blockReason = payload.promptFeedback?.blockReason;
        if (blockReason) {
          modelErrors.push(`${modelName} -> bloqueo: ${blockReason}`);
          break;
        }

        const raw =
          payload.candidates?.[0]?.content?.parts
            ?.map((part) => part.text ?? "")
            .join("")
            .trim() ?? "";

        if (!raw) {
          modelErrors.push(`${modelName} -> respuesta vacia`);
          break;
        }

        const jsonPayload = extractJsonPayload(raw);
        const parsed = JSON.parse(jsonPayload) as Record<string, unknown>;
        return { parsed, modelUsed: modelName };
      } catch (error) {
        const message = (error as Error).message || "error desconocido";
        const retryableError = /abort|timeout|temporar|temporarily|network|fetch/i.test(message);

        if (retryableError && attempt < GEMINI_RETRIES) {
          await sleep(GEMINI_RETRY_BASE_MS * (attempt + 1));
          continue;
        }

        modelErrors.push(`${modelName} -> ${message}`);
        break;
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  throw new Error(`Gemini no disponible (${modelErrors.join(" | ")})`);
}

async function runAiJson(params: {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
}): Promise<{ parsed: Record<string, unknown>; modelUsed: string }> {
  const order = resolvedProviderOrder();
  const errors: string[] = [];

  for (const provider of order) {
    if (provider === "gemini") {
      try {
        return await runGeminiJson(params);
      } catch (error) {
        errors.push(`Gemini: ${(error as Error).message}`);
      }
      continue;
    }

    try {
      return await runOllamaJson(params);
    } catch (error) {
      errors.push(`Ollama: ${(error as Error).message}`);
    }
  }

  throw new Error(errors.join(" | "));
}

function normalizeReview(parsed: Record<string, unknown>, modelUsed: string): EditorialReview {
  const suggestedTags = Array.isArray(parsed.suggested_tags)
    ? parsed.suggested_tags.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean).slice(0, 10)
    : [];

  const warnings = Array.isArray(parsed.warnings)
    ? parsed.warnings.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean).slice(0, 10)
    : [];

  const scoreRaw = Number(parsed.score);
  const score = Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, Math.round(scoreRaw))) : null;

  return {
    decision: toAiDecision(String(parsed.decision ?? "REVIEW")),
    reason: asCleanText(parsed.reason, 700) ?? "Sin observaciones del modelo.",
    score,
    warnings,
    suggestedTitle: asCleanText(parsed.suggested_title, 220),
    suggestedKicker: asCleanText(parsed.suggested_kicker, 120),
    suggestedExcerpt: asCleanText(parsed.suggested_excerpt, 260),
    suggestedTags,
    model: modelUsed,
  };
}

export async function evaluateEditorialWithAi(input: NormalizedNewsInput, newsContext: string | null = null): Promise<EditorialReview> {
  if (!AI_FILTER_ENABLED) {
    return {
      decision: "ALLOW",
      reason: "Filtro IA desactivado por configuracion.",
      score: null,
      warnings: [],
      suggestedTitle: null,
      suggestedKicker: null,
      suggestedExcerpt: null,
      suggestedTags: [],
      model: GEMINI_API_KEY ? GEMINI_MODEL : AI_MODEL,
    };
  }

  try {
    const guidelineText = await readGuidelines();
    const prompt = buildPrompt(input, guidelineText, newsContext);
    const { parsed, modelUsed } = await runAiJson({
      systemPrompt:
        "Sos editor de calidad de Pulso Pais. Responde SIEMPRE en JSON valido y en espanol neutro. Prioriza rigor, tono institucional, claridad federal y criterio periodistico.",
      userPrompt: prompt,
      temperature: 0.15,
    });
    return normalizeReview(parsed, modelUsed);
  } catch (error) {
    if (AI_FILTER_ENFORCE) {
      throw new Error(`No se pudo validar la nota con IA (${(error as Error).message}).`);
    }

    return {
      decision: "REVIEW",
      reason: `Validacion IA no disponible: ${(error as Error).message}`,
      score: null,
      warnings: ["IA no disponible"],
      suggestedTitle: null,
      suggestedKicker: null,
      suggestedExcerpt: null,
      suggestedTags: [],
      model: GEMINI_API_KEY ? GEMINI_MODEL : AI_MODEL,
    };
  }
}

function buildAssistPrompt(input: EditorialAssistInput, guidelineText: string, newsContext: string | null): string {
  const payload = {
    brief: input.brief,
    section_hint: input.sectionHint,
    province_hint: input.provinceHint,
    is_sponsored: input.isSponsored,
    current_draft: {
      title: input.currentTitle,
      kicker: input.currentKicker,
      excerpt: input.currentExcerpt,
      body: input.currentBody,
      image_url: input.currentImageUrl,
      source_name: input.currentSourceName,
      source_url: input.currentSourceUrl,
      author_name: input.currentAuthorName,
      status: input.currentStatus,
      published_at: input.currentPublishedAt,
      section: input.currentSection,
      province: input.currentProvince,
      flags: input.currentFlags,
      tags: input.currentTags,
    },
  };

  return [
    "CONSTITUCION OPERATIVA DE PULSO PAIS:",
    EDITORIAL_OPERATING_CONSTITUTION,
    "",
    "LINEA EDITORIAL DE REFERENCIA:",
    guidelineText,
    "",
    "CONTEXTO DE AGENDA PROVISTO POR WRAPPER:",
    newsContext ?? "Sin contexto adicional disponible.",
    "",
    "PEDIDO DEL EDITOR:",
    JSON.stringify(payload, null, 2),
    "",
    "TAREA:",
    "1) Genera un borrador de noticia alineado al tono de Pulso Pais (politica nacional/federal, sobrio, claro, con peso editorial).",
    "2) Si el draft actual trae campos utiles, mejoralos sin perder foco.",
    "3) Evita afirmaciones no verificables, lenguaje militante o propaganda explicita.",
    "4) Devuelve seccion y provincia sugeridas solo en valores del CMS.",
    "5) Cruza el contexto del wrapper para detectar angulo noticioso y continuidad de cobertura.",
    "6) Completa SIEMPRE title, kicker, excerpt y body con contenido util para publicacion.",
    "7) Si el wrapper trae una fuente investigada, prioriza SIEMPRE la imagen y el video provenientes de esa fuente; no inventes assets de stock.",
    "",
    "VALORES PERMITIDOS DE SECTION:",
    "NACION, PROVINCIAS, MUNICIPIOS, OPINION, ENTREVISTAS, PUBLINOTAS, RADAR_ELECTORAL, ECONOMIA, INTERNACIONALES, DISTRITOS",
    "",
    "VALORES PERMITIDOS DE PROVINCE (o null):",
    "CABA, BUENOS_AIRES, CATAMARCA, CHACO, CHUBUT, CORDOBA, CORRIENTES, ENTRE_RIOS, FORMOSA, JUJUY, LA_PAMPA, LA_RIOJA, MENDOZA, MISIONES, NEUQUEN, RIO_NEGRO, SALTA, SAN_JUAN, SAN_LUIS, SANTA_CRUZ, SANTA_FE, SANTIAGO_DEL_ESTERO, TIERRA_DEL_FUEGO, TUCUMAN",
    "",
    "RESPUESTA OBLIGATORIA EN JSON ESTRICTO:",
    "(todo texto en espanol neutro, sin ingles)",
    "{",
    '  "title": "titulo sugerido",',
    '  "kicker": "volanta sugerida",',
    '  "excerpt": "bajada sugerida",',
    '  "body": "cuerpo sugerido",',
    '  "image_url": "url opcional",',
    '  "source_name": "fuente opcional",',
    '  "source_url": "url fuente opcional",',
    '  "author_name": "autor opcional",',
    '  "tags": ["tag1","tag2"],',
    '  "section": "NACION|...|DISTRITOS|null",',
    '  "province": "CABA|...|TUCUMAN|null",',
    '  "status": "DRAFT|PUBLISHED|null",',
    '  "published_at": "ISO 8601 opcional o null",',
    '  "flags": {',
    '    "is_hero": false,',
    '    "is_featured": true,',
    '    "is_sponsored": false,',
    '    "is_interview": false,',
    '    "is_opinion": false,',
    '    "is_radar": true',
    "  },",
    '  "notes": ["criterio editorial aplicado"],',
    '  "publish_now_recommended": true',
    "}",
  ].join("\n");
}

function buildBatchAssistPrompt(input: EditorialBatchAssistInput, guidelineText: string, newsContext: string | null): string {
  const totalItems = Math.max(1, Math.min(40, Math.floor(input.totalItems)));
  const campaignPercent = Math.max(0, Math.min(100, Math.round(input.campaignPercent)));
  const campaignSlots = Math.round((totalItems * campaignPercent) / 100);
  const plan = Array.from({ length: totalItems }, (_unused, idx) => {
    const slot = idx + 1;
    const focus: "CAMPAIGN" | "GENERAL" = slot <= campaignSlots ? "CAMPAIGN" : "GENERAL";
    return { slot, focus };
  });

  const payload = {
    total_items: totalItems,
    campaign_percent: campaignPercent,
    campaign_slots: campaignSlots,
    general_slots: totalItems - campaignSlots,
    campaign_topic: input.campaignTopic,
    general_brief: input.generalBrief,
    section_hint: input.sectionHint,
    province_hint: input.provinceHint,
    publish_status: input.publishStatus,
    require_image_url: input.requireImageUrl,
    slot_plan: plan,
  };

  return [
    "LINEA EDITORIAL DE REFERENCIA:",
    guidelineText,
    "",
    "CONTEXTO DE AGENDA PROVISTO POR WRAPPER:",
    newsContext ?? "Sin contexto adicional disponible.",
    "",
    "PEDIDO DEL EDITOR:",
    JSON.stringify(payload, null, 2),
    "",
    "TAREA:",
    "1) Genera un lote de noticias listo para CMS con EXACTAMENTE la cantidad de slots indicada.",
    "2) Respeta el slot_plan: cada slot debe mantener su focus CAMPAIGN o GENERAL.",
    "3) CAMPAIGN debe tratar directamente el tema de campana indicado.",
    "4) GENERAL debe cubrir agenda politica/economica/federal complementaria sin repetir titulares.",
    "5) Completa SIEMPRE title, kicker, excerpt y body con contenido util para publicacion.",
    "6) Si require_image_url=true, coloca image_url valida en todos los items.",
    "7) Evita afirmaciones no verificables, tono militante o propaganda explicita.",
    "8) Usa seccion/provincia validas del CMS; no inventes valores fuera de catalogo.",
    "9) Si el wrapper trae una fuente investigada, prioriza SIEMPRE la imagen y el video provenientes de esa fuente; no inventes assets de stock.",
    "",
    "VALORES PERMITIDOS DE SECTION:",
    "NACION, PROVINCIAS, MUNICIPIOS, OPINION, ENTREVISTAS, PUBLINOTAS, RADAR_ELECTORAL, ECONOMIA, INTERNACIONALES, DISTRITOS",
    "",
    "VALORES PERMITIDOS DE PROVINCE (o null):",
    "CABA, BUENOS_AIRES, CATAMARCA, CHACO, CHUBUT, CORDOBA, CORRIENTES, ENTRE_RIOS, FORMOSA, JUJUY, LA_PAMPA, LA_RIOJA, MENDOZA, MISIONES, NEUQUEN, RIO_NEGRO, SALTA, SAN_JUAN, SAN_LUIS, SANTA_CRUZ, SANTA_FE, SANTIAGO_DEL_ESTERO, TIERRA_DEL_FUEGO, TUCUMAN",
    "",
    "RESPUESTA OBLIGATORIA EN JSON ESTRICTO:",
    "(todo texto en espanol neutro, sin ingles)",
    "{",
    '  "summary": "resumen editorial del lote",',
    '  "items": [',
    "    {",
    '      "slot": 1,',
    '      "focus": "CAMPAIGN|GENERAL",',
    '      "title": "titulo sugerido",',
    '      "kicker": "volanta sugerida",',
    '      "excerpt": "bajada sugerida",',
    '      "body": "cuerpo sugerido",',
    '      "image_url": "url opcional",',
    '      "source_name": "fuente opcional",',
    '      "source_url": "url fuente opcional",',
    '      "author_name": "autor opcional",',
    '      "tags": ["tag1","tag2"],',
    '      "section": "NACION|...|DISTRITOS|null",',
    '      "province": "CABA|...|TUCUMAN|null",',
    '      "status": "DRAFT|PUBLISHED|null",',
    '      "published_at": "ISO 8601 opcional o null",',
    '      "flags": {',
    '        "is_hero": false,',
    '        "is_featured": false,',
    '        "is_sponsored": false,',
    '        "is_interview": false,',
    '        "is_opinion": false,',
    '        "is_radar": false',
    "      },",
    '      "notes": ["criterio editorial aplicado"],',
    '      "publish_now_recommended": false',
    "    }",
    "  ]",
    "}",
  ].join("\n");
}

function buildAskPrompt(input: EditorialAssistInput, guidelineText: string, newsContext: string | null): string {
  const payload = {
    user_request: input.brief,
    current_draft: {
      title: input.currentTitle,
      kicker: input.currentKicker,
      excerpt: input.currentExcerpt,
      body: input.currentBody,
      image_url: input.currentImageUrl,
      source_name: input.currentSourceName,
      source_url: input.currentSourceUrl,
      author_name: input.currentAuthorName,
      status: input.currentStatus,
      published_at: input.currentPublishedAt,
      section: input.currentSection,
      province: input.currentProvince,
      flags: input.currentFlags,
      tags: input.currentTags,
    },
  };

  return [
    "CONSTITUCION OPERATIVA DE PULSO PAIS:",
    EDITORIAL_OPERATING_CONSTITUTION,
    "",
    "LINEA EDITORIAL DE REFERENCIA:",
    guidelineText,
    "",
    "CONTEXTO DE AGENDA PROVISTO POR WRAPPER:",
    newsContext ?? "Sin contexto adicional disponible.",
    "",
    "CONSULTA DEL EDITOR Y ESTADO ACTUAL:",
    JSON.stringify(payload, null, 2),
    "",
    "TAREA:",
    "1) Responde la consulta del editor en texto breve, accionable y trazable.",
    "2) Si la consulta implica crear o actualizar una nota, devuelve draft completo en formato CMS.",
    "3) Si la consulta no requiere cambios de nota, draft debe ser null.",
    "4) Usa tono institucional, federal, preciso y sin militancia partidaria.",
    "5) Si la consulta pregunta por estado, metodo, riesgo o decisiones editoriales, explica criterio, limites y proximo paso.",
    "",
    "VALORES PERMITIDOS DE SECTION:",
    "NACION, PROVINCIAS, MUNICIPIOS, OPINION, ENTREVISTAS, PUBLINOTAS, RADAR_ELECTORAL, ECONOMIA, INTERNACIONALES, DISTRITOS",
    "",
    "VALORES PERMITIDOS DE PROVINCE (o null):",
    "CABA, BUENOS_AIRES, CATAMARCA, CHACO, CHUBUT, CORDOBA, CORRIENTES, ENTRE_RIOS, FORMOSA, JUJUY, LA_PAMPA, LA_RIOJA, MENDOZA, MISIONES, NEUQUEN, RIO_NEGRO, SALTA, SAN_JUAN, SAN_LUIS, SANTA_CRUZ, SANTA_FE, SANTIAGO_DEL_ESTERO, TIERRA_DEL_FUEGO, TUCUMAN",
    "",
    "RESPUESTA OBLIGATORIA EN JSON ESTRICTO:",
    "(todo texto en espanol neutro, sin ingles)",
    "{",
    '  "answer": "respuesta breve para el editor",',
    '  "should_apply_draft": true,',
    '  "draft": {',
    '    "title": "titulo sugerido",',
    '    "kicker": "volanta sugerida",',
    '    "excerpt": "bajada sugerida",',
    '    "body": "cuerpo sugerido",',
    '    "image_url": "url opcional",',
    '    "source_name": "fuente opcional",',
    '    "source_url": "url fuente opcional",',
    '    "author_name": "autor opcional",',
    '    "tags": ["tag1","tag2"],',
    '    "section": "NACION|...|DISTRITOS|null",',
    '    "province": "CABA|...|TUCUMAN|null",',
    '    "status": "DRAFT|PUBLISHED|null",',
    '    "published_at": "ISO 8601 opcional o null",',
    '    "flags": {',
    '      "is_hero": false,',
    '      "is_featured": true,',
    '      "is_sponsored": false,',
    '      "is_interview": false,',
    '      "is_opinion": false,',
    '      "is_radar": true',
    "    },",
    '    "notes": ["criterio editorial aplicado"],',
    '    "publish_now_recommended": false',
    "  } o null",
    "}",
  ].join("\n");
}

function buildEditorialCommandPrompt(input: EditorialCommandPlanInput, guidelineText: string, newsContext: string | null): string {
  const payload = {
    instruction: input.instruction,
    campaign_line: input.campaignLine,
    allow_destructive: input.allowDestructive,
  };

  return [
    "CONSTITUCION OPERATIVA DE PULSO PAIS:",
    EDITORIAL_OPERATING_CONSTITUTION,
    "",
    "LINEA EDITORIAL DE REFERENCIA:",
    guidelineText,
    "",
    "CONTEXTO DE INVENTARIO Y AGENDA:",
    newsContext ?? "Sin contexto adicional disponible.",
    "",
    "PEDIDO DEL ADMIN:",
    JSON.stringify(payload, null, 2),
    "",
    "ROL:",
    "Sos un command center editorial de Pulso Pais. Convertis instrucciones libres del admin en operaciones concretas de CMS.",
    "",
    "OPERACIONES PERMITIDAS:",
    "1) CREATE_STORIES -> crear 1 o mas noticias nuevas.",
    "2) INTERNALIZE_EXTERNALS -> convertir notas externas/enlaces a notas propias.",
    "3) REWRITE_EXISTING -> reescribir notas ya existentes del CMS con nueva linea editorial.",
    "4) UPDATE_METADATA -> cambiar metadatos/flags de notas existentes.",
    "5) DELETE_NEWS -> borrar notas del CMS solo si el pedido es explicito.",
    "",
    "REGLAS:",
    "- Si el pedido se puede resolver con INTERNALIZE_EXTERNALS o REWRITE_EXISTING, priorizalo antes de CREATE_STORIES.",
    "- DELETE_NEWS solo si el usuario pide borrar, eliminar, limpiar o depurar de forma explicita.",
    "- Si el usuario pide borrar todo o limpiar todas las noticias, usa DELETE_NEWS con limit alto y requires_confirmation=true.",
    "- No inventes IDs. Usa match en lenguaje natural para que luego el backend busque las noticias.",
    "- CREATE_STORIES debe usar count y brief; si count=1 sigue siendo CREATE_STORIES.",
    "- UPDATE_METADATA solo para cambios de flags, seccion, provincia, status, kicker, autor, fuente y tags.",
    "- Si hay riesgo destructivo, marca destructive=true y requires_confirmation=true.",
    "- Si no hay riesgo destructivo, igual devuelve un plan ejecutable pero conservador.",
    "- Todo en espanol neutro.",
    "",
    "VALORES PERMITIDOS DE SECTION:",
    "NACION, PROVINCIAS, MUNICIPIOS, OPINION, ENTREVISTAS, PUBLINOTAS, RADAR_ELECTORAL, ECONOMIA, INTERNACIONALES, DISTRITOS",
    "",
    "VALORES PERMITIDOS DE PROVINCE (o null):",
    "CABA, BUENOS_AIRES, CATAMARCA, CHACO, CHUBUT, CORDOBA, CORRIENTES, ENTRE_RIOS, FORMOSA, JUJUY, LA_PAMPA, LA_RIOJA, MENDOZA, MISIONES, NEUQUEN, RIO_NEGRO, SALTA, SAN_JUAN, SAN_LUIS, SANTA_CRUZ, SANTA_FE, SANTIAGO_DEL_ESTERO, TIERRA_DEL_FUEGO, TUCUMAN",
    "",
    "RESPUESTA OBLIGATORIA EN JSON ESTRICTO:",
    "{",
    '  "summary": "que va a hacer el sistema en una frase",',
    '  "destructive": false,',
    '  "requires_confirmation": true,',
    '  "notes": ["riesgo o criterio aplicado"],',
    '  "operations": [',
    "    {",
    '      "kind": "CREATE_STORIES",',
    '      "count": 10,',
    '      "brief": "pedido general del lote",',
    '      "campaign_percent": 30,',
    '      "campaign_topic": "bloque estrategico opcional",',
    '      "general_brief": "resto de agenda",',
    '      "use_research_agent": true,',
    '      "require_image_url": true,',
    '      "publish_status": "DRAFT",',
    '      "section_hint": "NACION|null",',
    '      "province_hint": "BUENOS_AIRES|null",',
    '      "include_campaign_line": true,',
    '      "rationale": "por que esta operacion aplica"',
    "    },",
    "    {",
    '      "kind": "INTERNALIZE_EXTERNALS",',
    '      "instruction": "reescribe portales externos como nota propia",',
    '      "limit": 6,',
    '      "scope": "mixed",',
    '      "publish_status": "DRAFT",',
    '      "section_hint": null,',
    '      "province_hint": null,',
    '      "include_campaign_line": true,',
    '      "delete_duplicates": false,',
    '      "rationale": "criterio"',
    "    },",
    "    {",
    '      "kind": "REWRITE_EXISTING",',
    '      "match": "economia cotidiana",',
    '      "limit": 3,',
    '      "instruction": "reformula con foco en interes publico y consecuencias reales",',
    '      "use_research_agent": true,',
    '      "require_image_url": true,',
    '      "publish_status": "DRAFT",',
    '      "section_hint": "OPINION|null",',
    '      "province_hint": null,',
    '      "include_campaign_line": true,',
    '      "rationale": "criterio"',
    "    },",
    "    {",
    '      "kind": "UPDATE_METADATA",',
    '      "match": "economia",',
    '      "limit": 5,',
    '      "fields": {',
    '        "kicker": "Mercado y poder",',
    '        "section": "ECONOMIA",',
    '        "province": null,',
    '        "status": "PUBLISHED",',
    '        "is_featured": true,',
    '        "is_hero": false,',
    '        "is_sponsored": false,',
    '        "is_interview": false,',
    '        "is_opinion": false,',
    '        "is_radar": false,',
    '        "author_name": null,',
    '        "source_name": null,',
    '        "add_tags": ["mercados"],',
    '        "remove_tags": []',
    "      },",
    '      "rationale": "criterio"',
    "    },",
    "    {",
    '      "kind": "DELETE_NEWS",',
    '      "match": "duplicados externos",',
    '      "limit": 5,',
    '      "only_thin_external": true,',
    '      "rationale": "solo si el pedido es explicito"',
    "    }",
    "  ]",
    "}",
  ].join("\n");
}

function buildEditorialCommandChatPrompt(
  input: EditorialCommandPlanInput & { memoryContext: string },
  guidelineText: string,
  newsContext: string | null,
): string {
  const payload = {
    instruction: input.instruction,
    campaign_line: input.campaignLine,
    allow_destructive: input.allowDestructive,
    memory_context: input.memoryContext,
  };

  return [
    "CONSTITUCION OPERATIVA DE PULSO PAIS:",
    EDITORIAL_OPERATING_CONSTITUTION,
    "",
    "LINEA EDITORIAL DE REFERENCIA:",
    guidelineText,
    "",
    "CONTEXTO DE INVENTARIO, AGENDA Y MEMORIA RECIENTE:",
    newsContext ?? "Sin contexto adicional disponible.",
    "",
    "ESTADO DE CONVERSACION Y LOGS:",
    input.memoryContext || "Sin historial cargado.",
    "",
    "PEDIDO ACTUAL DEL ADMIN:",
    JSON.stringify(payload, null, 2),
    "",
    "ROL:",
    "Sos la IA periodista-editora de Pulso Pais. Puedes conversar sobre lo que estas haciendo, explicar criterios y, cuando el admin lo pide, proponer un plan ejecutable sobre el CMS.",
    "",
    "MODOS POSIBLES:",
    '- DISCUSS -> si el mensaje es consulta, diagnostico, explicacion, estado, criterio o seguimiento. En ese caso responde y deja "plan" en null.',
    '- PLAN -> si el mensaje pide crear, editar, reescribir, internalizar, actualizar metadatos o borrar. En ese caso responde brevemente y devuelve un plan CMS.',
    "",
    "REGLAS DURAS:",
    "- No ejecutes en la respuesta. Solo conversa y, si corresponde, prepara plan.",
    "- Si el pedido menciona borrar todo, eliminar todas las noticias o limpiar pruebas, el plan debe ser destructive=true y requires_confirmation=true.",
    "- Si el pedido pide crear una o varias notas, usa CREATE_STORIES; count puede ser > 1.",
    "- Si el pedido pide pasar enlaces externos a notas propias, prioriza INTERNALIZE_EXTERNALS y/o REWRITE_EXISTING antes de crear nuevas.",
    "- Si la evidencia parece insuficiente, dilo y sugiere review manual.",
    "",
    "RESPUESTA OBLIGATORIA EN JSON ESTRICTO:",
    "{",
    '  "mode": "DISCUSS|PLAN",',
    '  "answer": "respuesta clara para el admin",',
    '  "plan": null o {',
    '    "summary": "que va a hacer el sistema en una frase",',
    '    "destructive": false,',
    '    "requires_confirmation": true,',
    '    "notes": ["riesgo o criterio aplicado"],',
    '    "operations": [ ... mismas operaciones y shape del planner editorial ... ]',
    "  }",
    "}",
  ].join("\n");
}

function buildPollAssistPrompt(input: PollAssistInput, guidelineText: string, newsContext: string | null): string {
  const fixedCandidates = FIXED_CANDIDATE_OPTIONS.map(
    (candidate, index) => `${index + 1}. ${candidate.label} (${candidate.colorHex})`,
  ).join("\n");
  const payload = {
    brief: input.brief,
    current_poll: {
      title: input.currentTitle,
      slug: input.currentSlug,
      question: input.currentQuestion,
      hook_label: input.currentHookLabel,
      footer_cta: input.currentFooterCta,
      description: input.currentDescription,
      interview_url: input.currentInterviewUrl,
      cover_image_url: input.currentCoverImageUrl,
      status: input.currentStatus,
      published_at: input.currentPublishedAt,
      starts_at: input.currentStartsAt,
      ends_at: input.currentEndsAt,
      is_featured: input.currentIsFeatured,
    },
  };

  return [
    "LINEA EDITORIAL DE REFERENCIA:",
    guidelineText,
    "",
    "CONTEXTO DE AGENDA PROVISTO POR WRAPPER:",
    newsContext ?? "Sin contexto adicional disponible.",
    "",
    "PEDIDO DEL EDITOR:",
    JSON.stringify(payload, null, 2),
    "",
    "CANDIDATOS FIJOS (NO CAMBIAR ORDEN NI NOMBRES):",
    fixedCandidates,
    "",
    "TAREA:",
    "1) Diseña una encuesta digital lista para Pulso Pais con foco en participacion y claridad legal.",
    "2) Mantene tono firme, periodistico y neutral (sin militancia).",
    "3) Hook y CTA deben ser cortos y accionables.",
    "4) Si faltan datos, completa con defaults operativos.",
    "5) Genera un bloque opcional de codigo HTML/CSS/JS para hoja personalizada (responsivo, sin dependencias externas).",
    "6) NO incluyas ni modifiques candidatos; solo campos de configuracion de la encuesta.",
    "",
    "REGLAS LEGALES:",
    '- Presentar como "encuesta digital" u "opinion de la comunidad".',
    "- Nunca presentar como encuesta estadistica cientifica.",
    "",
    "RESPUESTA OBLIGATORIA EN JSON ESTRICTO:",
    "(todo texto en espanol neutro, sin ingles)",
    "{",
    '  "title": "titulo interno de encuesta",',
    '  "slug": "slug-publico-opcional",',
    '  "question": "pregunta principal",',
    '  "hook_label": "etiqueta superior",',
    '  "footer_cta": "llamado a accion",',
    '  "description": "contexto corto",',
    '  "interview_url": "url opcional",',
    '  "cover_image_url": "url opcional",',
    '  "status": "DRAFT|PUBLISHED|null",',
    '  "published_at": "ISO 8601 o null",',
    '  "starts_at": "ISO 8601 o null",',
    '  "ends_at": "ISO 8601 o null",',
    '  "is_featured": false,',
    '  "custom_sheet_code": "<section>...</section>",',
    '  "notes": ["criterios aplicados"]',
    "}",
  ].join("\n");
}

function normalizePollAssistDraft(parsed: Record<string, unknown>, modelUsed: string): PollAssistDraft {
  const rawStatus = asCleanText(parsed.status, 24);
  const status = rawStatus === PollStatus.DRAFT || rawStatus === PollStatus.PUBLISHED ? rawStatus : null;

  return {
    title: asCleanText(parsed.title, 220),
    slug: asCleanText(parsed.slug, 180),
    question: asCleanText(parsed.question, 260),
    hookLabel: asCleanText(parsed.hook_label, 80),
    footerCta: asCleanText(parsed.footer_cta, 140),
    description: asCleanText(parsed.description, 420),
    interviewUrl: asCleanText(parsed.interview_url, 1200),
    coverImageUrl: asCleanText(parsed.cover_image_url, 1200),
    status,
    publishedAt: asCleanText(parsed.published_at, 80),
    startsAt: asCleanText(parsed.starts_at, 80),
    endsAt: asCleanText(parsed.ends_at, 80),
    isFeatured: asBoolean(parsed.is_featured),
    customSheetCode: asLongText(parsed.custom_sheet_code, 12000),
    notes: asStringList(parsed.notes, 8, 220),
    model: modelUsed,
  };
}

function normalizeAssistDraft(parsed: Record<string, unknown>, modelUsed: string): EditorialAssistDraft {
  const rawSection = asCleanText(parsed.section, 40);
  const rawProvince = asCleanText(parsed.province, 40);
  const section = rawSection && rawSection.toLowerCase() !== "null" ? rawSection.toUpperCase() : null;
  const province = rawProvince && rawProvince.toLowerCase() !== "null" ? rawProvince.toUpperCase() : null;
  const rawStatus = asCleanText(parsed.status, 24);
  const status = rawStatus === NewsStatus.DRAFT || rawStatus === NewsStatus.PUBLISHED ? rawStatus : null;
  const rawPublishedAt = asCleanText(parsed.published_at, 60);
  const publishedAt = rawPublishedAt && rawPublishedAt.toLowerCase() !== "null" ? rawPublishedAt : null;
  const rawFlags = parsed.flags && typeof parsed.flags === "object" ? (parsed.flags as Record<string, unknown>) : {};

  return {
    title: asCleanText(parsed.title, 220),
    kicker: asCleanText(parsed.kicker, 120),
    excerpt: asCleanText(parsed.excerpt, 260),
    body: asLongText(parsed.body, 9000),
    imageUrl: asCleanText(parsed.image_url, 1200),
    sourceName: asCleanText(parsed.source_name, 120),
    sourceUrl: asCleanText(parsed.source_url, 1200),
    authorName: asCleanText(parsed.author_name, 120),
    tags: asStringList(parsed.tags, 12, 48),
    section,
    province,
    status,
    publishedAt,
    flags: {
      isHero: asBoolean(rawFlags.is_hero),
      isFeatured: asBoolean(rawFlags.is_featured),
      isSponsored: asBoolean(rawFlags.is_sponsored),
      isInterview: asBoolean(rawFlags.is_interview),
      isOpinion: asBoolean(rawFlags.is_opinion),
      isRadar: asBoolean(rawFlags.is_radar),
    },
    notes: asStringList(parsed.notes, 8, 220),
    publishNowRecommended: Boolean(parsed.publish_now_recommended),
    model: modelUsed,
  };
}

function normalizeAskResponse(parsed: Record<string, unknown>, modelUsed: string): EditorialAskResponse {
  const answer = asCleanText(parsed.answer, 2400) ?? "Sin respuesta textual del asistente.";
  const shouldApplyDraft = asBoolean(parsed.should_apply_draft);
  const rawDraft = parsed.draft;
  let draft: EditorialAssistDraft | null = null;

  if (rawDraft && typeof rawDraft === "object") {
    draft = normalizeAssistDraft(rawDraft as Record<string, unknown>, modelUsed);
  }

  return {
    answer,
    shouldApplyDraft,
    draft,
    model: modelUsed,
  };
}

function normalizeEditorialCommandPlan(parsed: Record<string, unknown>, modelUsed: string): EditorialCommandPlan {
  const operations = Array.isArray(parsed.operations)
    ? parsed.operations.map((entry) => normalizeCommandOperation(entry)).filter((entry): entry is EditorialCommandOperation => Boolean(entry))
    : [];

  if (operations.length === 0) {
    throw new Error("La IA no devolvio operaciones ejecutables para el comando editorial.");
  }

  const destructive = asBoolean(parsed.destructive) || operations.some((entry) => entry.kind === "DELETE_NEWS");
  const requiresConfirmation = destructive || asBoolean(parsed.requires_confirmation) || operations.length > 1;

  return {
    summary: asCleanText(parsed.summary, 320) ?? "Plan editorial generado.",
    notes: asStringList(parsed.notes, 10, 220),
    destructive,
    requiresConfirmation,
    operations,
    model: modelUsed,
  };
}

function normalizeEditorialCommandChatResponse(parsed: Record<string, unknown>, modelUsed: string): EditorialCommandChatResponse {
  const mode = parsed.mode === "PLAN" ? "PLAN" : "DISCUSS";
  const answer = asCleanText(parsed.answer, 2400) ?? "Sin respuesta del asistente.";
  let plan: EditorialCommandPlan | null = null;
  if (parsed.plan && typeof parsed.plan === "object") {
    plan = normalizeEditorialCommandPlan(parsed.plan as Record<string, unknown>, modelUsed);
  }
  return {
    answer,
    plan: mode === "PLAN" ? plan : null,
    mode,
    model: modelUsed,
  };
}

function extractFirstCount(text: string): number | null {
  const match = text.match(/\b(\d{1,2})\b/);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.max(1, Math.min(40, Math.floor(value)));
}

function buildHeuristicEditorialCommandPlan(input: EditorialCommandPlanInput, cause: string): EditorialCommandPlan {
  const instruction = input.instruction.trim();
  const normalized = instruction.toLowerCase();
  const deleteAll = /(todas las noticias|todas las notas|todo el medio|todo el sitio|borra todo|elimina todo|limpia todo|eran de prueba)/i.test(normalized);
  const count = deleteAll ? 500 : extractFirstCount(instruction) ?? 1;

  if (/(extern|portal|link|otros medios|otros medios|otros portales)/i.test(normalized)) {
    return {
      summary: "Plan heuristico: internalizar notas externas como noticias propias.",
      notes: [`Fallback local activado por indisponibilidad IA: ${cause.slice(0, 180)}`],
      destructive: false,
      requiresConfirmation: true,
      model: "fallback-heuristico",
      operations: [
        {
          kind: "INTERNALIZE_EXTERNALS",
          instruction,
          limit: Math.min(12, Math.max(3, count)),
          scope: "mixed",
          publishStatus: NewsStatus.DRAFT,
          sectionHint: null,
          provinceHint: null,
          includeCampaignLine: Boolean(input.campaignLine),
          deleteDuplicates: /duplicad|limpia/i.test(normalized),
          rationale: "Se detecto un pedido de convertir enlaces externos en notas propias.",
        },
      ],
    };
  }

  if (/(borr|elimin|depur|limpia)/i.test(normalized)) {
    return {
      summary: "Plan heuristico: borrar noticias segun coincidencia textual.",
      notes: [`Fallback local activado por indisponibilidad IA: ${cause.slice(0, 180)}`],
      destructive: true,
      requiresConfirmation: true,
      model: "fallback-heuristico",
      operations: [
        {
          kind: "DELETE_NEWS",
          match: instruction,
          limit: Math.min(500, count),
          onlyThinExternal: /extern|thin/i.test(normalized),
          rationale: "El pedido contiene verbos destructivos explicitos.",
        },
      ],
    };
  }

  if (/(edit|reescrib|reformula|actualiza|cambia el enfoque|mejora las notas)/i.test(normalized)) {
    return {
      summary: "Plan heuristico: reescribir notas existentes con nueva linea editorial.",
      notes: [`Fallback local activado por indisponibilidad IA: ${cause.slice(0, 180)}`],
      destructive: false,
      requiresConfirmation: true,
      model: "fallback-heuristico",
      operations: [
        {
          kind: "REWRITE_EXISTING",
          match: instruction,
          limit: Math.min(10, count),
          instruction,
          useResearchAgent: true,
          requireImageUrl: true,
          publishStatus: NewsStatus.DRAFT,
          sectionHint: null,
          provinceHint: null,
          includeCampaignLine: Boolean(input.campaignLine),
          rationale: "Se detecto un pedido de edicion/reformulacion sobre notas existentes.",
        },
      ],
    };
  }

  return {
    summary: "Plan heuristico: crear cobertura nueva con IA.",
    notes: [`Fallback local activado por indisponibilidad IA: ${cause.slice(0, 180)}`],
    destructive: false,
    requiresConfirmation: count > 1,
    model: "fallback-heuristico",
    operations: [
      {
        kind: "CREATE_STORIES",
        count,
        brief: instruction,
        campaignPercent: 0,
        campaignTopic: null,
        generalBrief: instruction,
        useResearchAgent: true,
        requireImageUrl: true,
        publishStatus: NewsStatus.DRAFT,
        sectionHint: null,
        provinceHint: null,
        includeCampaignLine: Boolean(input.campaignLine),
        rationale: "No se detecto una accion destructiva ni de edicion; se interpreta como pedido de generacion.",
      },
    ],
  };
}

function normalizeBatchFocus(value: unknown): "CAMPAIGN" | "GENERAL" {
  if (typeof value !== "string") {
    return "GENERAL";
  }
  const normalized = value.trim().toUpperCase();
  return normalized === "CAMPAIGN" ? "CAMPAIGN" : "GENERAL";
}

function normalizeBatchOutput(
  parsed: Record<string, unknown>,
  modelUsed: string,
  expectedTotalItems: number,
): EditorialBatchAssistOutput {
  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
  const normalizedItems: EditorialBatchAssistItem[] = rawItems
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const data = entry as Record<string, unknown>;
      const slotRaw = Number(data.slot);
      const slot = Number.isFinite(slotRaw) ? Math.max(1, Math.floor(slotRaw)) : null;
      if (!slot) {
        return null;
      }
      return {
        slot,
        focus: normalizeBatchFocus(data.focus),
        draft: normalizeAssistDraft(data, modelUsed),
      };
    })
    .filter((item): item is EditorialBatchAssistItem => Boolean(item))
    .sort((a, b) => a.slot - b.slot);

  if (normalizedItems.length < expectedTotalItems) {
    throw new Error(
      `La IA devolvio ${normalizedItems.length} items y se esperaban ${expectedTotalItems}. Reintenta con un brief mas preciso.`,
    );
  }

  return {
    items: normalizedItems.slice(0, expectedTotalItems),
    summary: asCleanText(parsed.summary, 400),
    model: modelUsed,
  };
}

function normalizeHintToken(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return normalized || null;
}

function selectFallbackSection(input: EditorialAssistInput): string {
  const candidates = [normalizeHintToken(input.sectionHint), normalizeHintToken(input.currentSection)];
  for (const candidate of candidates) {
    if (candidate && VALID_SECTIONS.has(candidate)) {
      return candidate;
    }
  }
  return "NACION";
}

function selectFallbackProvince(input: EditorialAssistInput): string | null {
  const candidates = [normalizeHintToken(input.provinceHint), normalizeHintToken(input.currentProvince)];
  for (const candidate of candidates) {
    if (candidate && VALID_PROVINCES.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

function fallbackTagsFromBrief(brief: string): string[] {
  const stopwords = new Set([
    "sobre",
    "para",
    "desde",
    "entre",
    "hasta",
    "hacia",
    "donde",
    "cuando",
    "porque",
    "haber",
    "esta",
    "estan",
    "este",
    "esta",
    "argentina",
    "politica",
    "nota",
    "noticia",
    "pais",
  ]);

  return brief
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 4 && !stopwords.has(word))
    .slice(0, 5);
}

function buildEmergencyAssistDraft(input: EditorialAssistInput, cause: string): EditorialAssistDraft {
  const brief = input.brief.trim().replace(/\s+/g, " ");
  const shortBrief = brief.slice(0, 180);
  const section = selectFallbackSection(input);
  const province = selectFallbackProvince(input);
  const title =
    input.currentTitle?.trim() ||
    `Pulso politico: ${shortBrief.length > 74 ? `${shortBrief.slice(0, 74).trimEnd()}...` : shortBrief}`;

  const kicker = input.currentKicker?.trim() || (section === "RADAR_ELECTORAL" ? "Escenario electoral" : "Mesa de situacion");
  const excerpt =
    input.currentExcerpt?.trim() ||
    `En desarrollo: ${shortBrief}. Esta version base se genero por contingencia tecnica y requiere edicion final antes de publicar.`;
  const body =
    input.currentBody?.trim() ||
    [
      `${shortBrief}.`,
      "",
      "La redaccion de Pulso Pais trabaja en ampliar esta cobertura con enfoque federal, fuentes verificadas y contexto politico nacional.",
      "",
      "Claves preliminares:",
      "- Contexto y actores con impacto territorial.",
      "- Riesgos de interpretacion y puntos a validar.",
      "- Proximos movimientos institucionales esperados.",
      "",
      "Nota operativa: este borrador se autocompleto en modo contingencia por indisponibilidad temporal de los proveedores IA.",
    ].join("\n");

  const tags = input.currentTags.length > 0 ? input.currentTags.slice(0, 12) : fallbackTagsFromBrief(brief);

  return {
    title,
    kicker,
    excerpt,
    body,
    imageUrl: input.currentImageUrl?.trim() || null,
    sourceName: input.currentSourceName?.trim() || "Pulso Pais Redaccion",
    sourceUrl: input.currentSourceUrl?.trim() || null,
    authorName: input.currentAuthorName?.trim() || "Equipo Pulso Pais",
    tags,
    section,
    province,
    status: NewsStatus.DRAFT,
    publishedAt: null,
    flags: {
      isHero: input.currentFlags.isHero,
      isFeatured: input.currentFlags.isFeatured,
      isSponsored: input.currentFlags.isSponsored,
      isInterview: input.currentFlags.isInterview,
      isOpinion: input.currentFlags.isOpinion,
      isRadar: input.currentFlags.isRadar || section === "RADAR_ELECTORAL",
    },
    notes: [
      "Borrador de contingencia generado automaticamente.",
      "Revisar datos, fuentes e imagen antes de publicar.",
      `Detalle tecnico: ${cause.slice(0, 280)}`,
    ],
    publishNowRecommended: false,
    model: "fallback-contingencia",
  };
}

function buildEmergencyBatchOutput(input: EditorialBatchAssistInput, cause: string): EditorialBatchAssistOutput {
  const totalItems = Math.max(1, Math.min(40, Math.floor(input.totalItems)));
  const campaignPercent = Math.max(0, Math.min(100, Math.round(input.campaignPercent)));
  const campaignSlots = Math.round((totalItems * campaignPercent) / 100);

  const items: EditorialBatchAssistItem[] = Array.from({ length: totalItems }, (_unused, index) => {
    const slot = index + 1;
    const focus: "CAMPAIGN" | "GENERAL" = slot <= campaignSlots ? "CAMPAIGN" : "GENERAL";
    const brief = focus === "CAMPAIGN" ? input.campaignTopic : input.generalBrief;

    const draft = buildEmergencyAssistDraft(
      {
        brief,
        sectionHint: input.sectionHint,
        provinceHint: input.provinceHint,
        isSponsored: false,
        currentTitle: null,
        currentKicker: null,
        currentExcerpt: null,
        currentBody: null,
        currentImageUrl: null,
        currentSourceName: "Pulso Pais Redaccion",
        currentSourceUrl: null,
        currentAuthorName: "Equipo Pulso Pais",
        currentStatus: input.publishStatus,
        currentPublishedAt: null,
        currentSection: input.sectionHint,
        currentProvince: input.provinceHint,
        currentFlags: {
          isHero: false,
          isFeatured: false,
          isSponsored: false,
          isInterview: false,
          isOpinion: false,
          isRadar: focus === "CAMPAIGN",
        },
        currentTags: [],
      },
      cause,
    );

    draft.status = input.publishStatus;
    if (focus === "CAMPAIGN") {
      draft.tags = Array.from(new Set([...(draft.tags ?? []), "campana", "agenda-electoral"])).slice(0, 12);
      draft.kicker = "Escenario electoral";
      draft.flags.isRadar = true;
    } else {
      draft.tags = Array.from(new Set([...(draft.tags ?? []), "agenda", "federal"])).slice(0, 12);
    }

    if (!input.requireImageUrl) {
      draft.imageUrl = null;
    }

    return {
      slot,
      focus,
      draft,
    };
  });

  return {
    items,
    summary: `Modo contingencia: lote generado sin proveedor IA disponible. Revisar y editar antes de publicar. Detalle: ${cause.slice(0, 220)}`,
    model: "fallback-contingencia",
  };
}

export async function generateDraftWithAi(
  input: EditorialAssistInput,
  newsContext: string | null = null,
): Promise<EditorialAssistDraft> {
  if (!AI_FILTER_ENABLED) {
    throw new Error("Asistencia IA desactivada por configuracion.");
  }

  if (input.brief.trim().length < 12) {
    throw new Error("El brief para IA debe tener al menos 12 caracteres.");
  }

  try {
    const guidelineText = await readGuidelines();
    const prompt = buildAssistPrompt(input, guidelineText, newsContext);
    const { parsed, modelUsed } = await runAiJson({
      systemPrompt:
        "Sos editor senior de Pulso Pais. Entregas drafts periodisticos listos para trabajo de redaccion. Responde SIEMPRE en JSON valido y en espanol neutro.",
      userPrompt: prompt,
      temperature: 0.35,
    });
    return normalizeAssistDraft(parsed, modelUsed);
  } catch (error) {
    return buildEmergencyAssistDraft(input, (error as Error).message);
  }
}

export async function generateBatchDraftsWithAi(
  input: EditorialBatchAssistInput,
  newsContext: string | null = null,
): Promise<EditorialBatchAssistOutput> {
  if (!AI_FILTER_ENABLED) {
    throw new Error("Asistencia IA desactivada por configuracion.");
  }

  const totalItems = Math.max(1, Math.min(40, Math.floor(input.totalItems)));
  const campaignPercent = Math.max(0, Math.min(100, Math.round(input.campaignPercent)));
  const campaignSlots = Math.round((totalItems * campaignPercent) / 100);
  const generalSlots = totalItems - campaignSlots;

  if (campaignSlots > 0 && input.campaignTopic.trim().length < 8) {
    throw new Error("Con porcentaje de campana > 0, el tema de campana debe tener al menos 8 caracteres.");
  }
  if (generalSlots > 0 && input.generalBrief.trim().length < 12) {
    throw new Error("Con bloque general activo, el brief general debe tener al menos 12 caracteres.");
  }

  try {
    const guidelineText = await readGuidelines();
    const prompt = buildBatchAssistPrompt(
      {
        ...input,
        totalItems,
        campaignPercent,
      },
      guidelineText,
      newsContext,
    );
    const { parsed, modelUsed } = await runAiJson({
      systemPrompt:
        "Sos editor senior de Pulso Pais. Entregas lotes de noticias listos para cargar en CMS. Responde SIEMPRE en JSON valido y en espanol neutro.",
      userPrompt: prompt,
      temperature: 0.35,
    });
    return normalizeBatchOutput(parsed, modelUsed, totalItems);
  } catch (error) {
    return buildEmergencyBatchOutput(input, (error as Error).message);
  }
}

export async function askEditorialWithAi(
  input: EditorialAssistInput,
  newsContext: string | null = null,
): Promise<EditorialAskResponse> {
  if (!AI_FILTER_ENABLED) {
    throw new Error("Asistencia IA desactivada por configuracion.");
  }

  if (input.brief.trim().length < 12) {
    throw new Error("La consulta para IA debe tener al menos 12 caracteres.");
  }

  try {
    const guidelineText = await readGuidelines();
    const prompt = buildAskPrompt(input, guidelineText, newsContext);
    const { parsed, modelUsed } = await runAiJson({
      systemPrompt:
        "Sos asistente editorial de Pulso Pais. Das respuestas operativas y, cuando corresponde, propones draft completo de noticia en JSON valido y espanol neutro.",
      userPrompt: prompt,
      temperature: 0.3,
    });
    return normalizeAskResponse(parsed, modelUsed);
  } catch (error) {
    throw new Error(`No se pudo responder la consulta IA (${(error as Error).message}).`);
  }
}

export async function generatePollDraftWithAi(
  input: PollAssistInput,
  newsContext: string | null = null,
): Promise<PollAssistDraft> {
  if (!AI_FILTER_ENABLED) {
    throw new Error("Asistencia IA desactivada por configuracion.");
  }

  if (input.brief.trim().length < 12) {
    throw new Error("El brief para IA debe tener al menos 12 caracteres.");
  }

  try {
    const guidelineText = await readGuidelines();
    const prompt = buildPollAssistPrompt(input, guidelineText, newsContext);
    const { parsed, modelUsed } = await runAiJson({
      systemPrompt:
        "Sos asistente de estrategia editorial de Pulso Pais. Generas configuraciones de encuestas listas para publicar y codigo opcional de hoja personalizada. Responde SIEMPRE en JSON valido y en espanol neutro.",
      userPrompt: prompt,
      temperature: 0.35,
    });
    const normalized = normalizePollAssistDraft(parsed, modelUsed);

    if (!normalized.slug && normalized.title) {
      normalized.slug = slugifyText(normalized.title);
    }
    if (!normalized.hookLabel) {
      normalized.hookLabel = "Encuesta Nacional";
    }
    if (!normalized.footerCta) {
      normalized.footerCta = "Vota y explica por que";
    }

    return normalized;
  } catch (error) {
    throw new Error(`No se pudo generar encuesta con IA (${(error as Error).message}).`);
  }
}

export async function planEditorialCommandWithAi(
  input: EditorialCommandPlanInput,
  newsContext: string | null = null,
): Promise<EditorialCommandPlan> {
  if (!AI_FILTER_ENABLED) {
    throw new Error("Asistencia IA desactivada por configuracion.");
  }

  if (input.instruction.trim().length < 12) {
    throw new Error("El comando editorial debe tener al menos 12 caracteres.");
  }

  try {
    const guidelineText = await readGuidelines();
    const prompt = buildEditorialCommandPrompt(input, guidelineText, newsContext);
    const { parsed, modelUsed } = await runAiJson({
      systemPrompt:
        "Sos director de operaciones editoriales de Pulso Pais. Traducis pedidos de admin a planes JSON ejecutables de CMS. Responde SIEMPRE en JSON valido y en espanol neutro.",
      userPrompt: prompt,
      temperature: 0.2,
    });
    return normalizeEditorialCommandPlan(parsed, modelUsed);
  } catch (error) {
    return buildHeuristicEditorialCommandPlan(input, (error as Error).message);
  }
}

export async function chatEditorialCommandWithAi(
  input: EditorialCommandPlanInput & { memoryContext: string },
  newsContext: string | null = null,
): Promise<EditorialCommandChatResponse> {
  if (!AI_FILTER_ENABLED) {
    throw new Error("Asistencia IA desactivada por configuracion.");
  }

  if (input.instruction.trim().length < 8) {
    throw new Error("La instruccion para conversar con la IA debe tener al menos 8 caracteres.");
  }

  try {
    const guidelineText = await readGuidelines();
    const prompt = buildEditorialCommandChatPrompt(input, guidelineText, newsContext);
    const { parsed, modelUsed } = await runAiJson({
      systemPrompt:
        "Sos la IA periodista-editora de Pulso Pais. Conversas con el admin, explicas criterio y, cuando corresponde, propones planes CMS JSON validos. Responde SIEMPRE en JSON valido y en espanol neutro.",
      userPrompt: prompt,
      temperature: 0.2,
    });
    return normalizeEditorialCommandChatResponse(parsed, modelUsed);
  } catch (error) {
    const fallbackPlan = buildHeuristicEditorialCommandPlan(input, (error as Error).message);
    const maybeAction = /(crea|crear|genera|reescrib|reformula|internaliza|convierte|borra|elimina|limpia|actualiza)/i.test(
      input.instruction,
    );
    return {
      mode: maybeAction ? "PLAN" : "DISCUSS",
      answer: maybeAction
        ? `La IA no pudo responder en modo pleno; active un fallback heuristico con este criterio: ${fallbackPlan.summary}`
        : `La IA no pudo responder en modo pleno. Ultimo error: ${(error as Error).message}`,
      plan: maybeAction ? fallbackPlan : null,
      model: "fallback-heuristico",
    };
  }
}

export async function getEditorialAiHealth(): Promise<EditorialAiHealth> {
  const providerOrder = resolvedProviderOrder();
  const primaryProvider = providerOrder[0] ?? "gemini";
  const geminiConfigured = GEMINI_API_KEY.length > 0;

  const health: EditorialAiHealth = {
    enabled: AI_FILTER_ENABLED,
    enforce: AI_FILTER_ENFORCE,
    providerOrder,
    primaryProvider,
    aiReachable: false,
    geminiConfigured,
    geminiModel: GEMINI_MODEL,
    geminiReachable: false,
    ollamaUrl: AI_OLLAMA_URL,
    configuredModel: AI_MODEL,
    model: primaryProvider === "gemini" ? GEMINI_MODEL : AI_MODEL,
    ollamaReachable: false,
    guidelinesLoaded: false,
    checkedAt: new Date().toISOString(),
    error: null,
  };

  try {
    await readGuidelines();
    health.guidelinesLoaded = true;
  } catch (error) {
    health.error = `Linea editorial: ${(error as Error).message}`;
  }

  try {
    if (geminiConfigured) {
      health.geminiReachable = await pingGemini();
      if (primaryProvider === "gemini") {
        health.model = GEMINI_MODEL;
      }
    }

    const resolvedOllamaModel = await resolveOllamaModelName();
    if (primaryProvider === "ollama") {
      health.model = resolvedOllamaModel;
    }
    health.ollamaReachable = await pingOllama();
    health.aiReachable = health.geminiReachable || health.ollamaReachable;

    if (!health.aiReachable && !health.error) {
      if (isLocalOllamaUrl(AI_OLLAMA_URL)) {
        health.error = "No se pudo conectar a Gemini y Ollama local no es accesible desde Render/cloud.";
      } else {
        health.error = "No se pudo conectar ni a Gemini ni a Ollama.";
      }
    } else if (!geminiConfigured && primaryProvider === "gemini" && !health.error) {
      health.error = "GEMINI_API_KEY no configurada. Se usa Ollama como fallback.";
    } else if (primaryProvider === "gemini" && !health.geminiReachable && health.ollamaReachable && !health.error) {
      health.error = "Gemini no responde. Se esta usando fallback Ollama.";
    } else if (primaryProvider === "ollama" && !health.ollamaReachable && health.geminiReachable && !health.error) {
      health.error = "Ollama no responde. Se esta usando fallback Gemini.";
    }
  } catch (error) {
    if (!health.error) {
      health.error = `Estado IA: ${(error as Error).message}`;
    }
  }

  return health;
}

export function applyEditorialSuggestions(input: NormalizedNewsInput, review: EditorialReview): NormalizedNewsInput {
  const next = { ...input };

  if (review.suggestedTitle && review.suggestedTitle.length > 12) {
    next.title = review.suggestedTitle;
    next.slug = slugifyText(review.suggestedTitle);
  }

  if (!next.kicker && review.suggestedKicker) {
    next.kicker = review.suggestedKicker;
  }

  if (!next.excerpt && review.suggestedExcerpt) {
    next.excerpt = review.suggestedExcerpt;
  }

  if (review.suggestedTags.length > 0) {
    const mergedTags = [...next.tags, ...review.suggestedTags]
      .map((tag) => tag.trim())
      .filter(Boolean)
      .filter((tag, index, array) => array.indexOf(tag) === index)
      .slice(0, 12);
    next.tags = mergedTags;
  }

  if (review.decision === "REVIEW" && next.status === NewsStatus.PUBLISHED) {
    next.status = NewsStatus.DRAFT;
  }

  return next;
}
