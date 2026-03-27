import { promises as fs } from "node:fs";
import path from "node:path";
import mammoth from "mammoth";
import { NewsStatus } from "@prisma/client";
import type { NormalizedNewsInput } from "./types";
import { slugifyText } from "./utils";

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
const GEMINI_API_BASE = process.env.GEMINI_API_BASE ?? "https://generativelanguage.googleapis.com/v1beta";
const AI_OLLAMA_URL = process.env.AI_OLLAMA_URL ?? "http://localhost:11434";
const AI_MODEL = process.env.AI_MODEL ?? "qwen3";
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS ?? 20000);
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${GEMINI_API_BASE}/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
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
      throw new Error(`Gemini respondio ${response.status}: ${detail.slice(0, 320)}`);
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
      throw new Error(`Gemini bloqueo la solicitud: ${blockReason}`);
    }

    const raw =
      payload.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("")
        .trim() ?? "";

    if (!raw) {
      throw new Error("Gemini devolvio respuesta vacia.");
    }

    const jsonPayload = extractJsonPayload(raw);
    const parsed = JSON.parse(jsonPayload) as Record<string, unknown>;
    return { parsed, modelUsed: GEMINI_MODEL };
  } finally {
    clearTimeout(timeout);
  }
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
    "1) Responde la consulta del editor en texto breve y accionable.",
    "2) Si la consulta implica crear o actualizar una nota, devuelve draft completo en formato CMS.",
    "3) Si la consulta no requiere cambios de nota, draft debe ser null.",
    "4) Usa tono institucional, federal, preciso y sin militancia partidaria.",
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
    throw new Error(`No se pudo generar borrador con IA (${(error as Error).message}).`);
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
      health.error = "No se pudo conectar ni a Gemini ni a Ollama.";
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
