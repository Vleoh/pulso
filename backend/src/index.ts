import "dotenv/config";

import crypto from "node:crypto";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import morgan from "morgan";
import { type News, type Poll, type Prisma, NewsStatus, PollStatus, UserEmailCodePurpose, UserPlan } from "@prisma/client";
import { adminApiGuard, backofficeGuard, extractAdminToken, signAdminToken, verifyAdminToken } from "./auth";
import {
  backofficeShell,
  type BackofficeUserListItem,
  renderIaLab,
  renderLogin,
  renderNewsForm,
  renderNewsTable,
  renderPollForm,
  renderPollTable,
  renderUserForm,
  renderUsersTable,
  type BackofficePollListItem,
} from "./backofficeViews";
import { buildHomePayload } from "./homePayload";
import { ensureUniqueSlug, normalizeNewsInput } from "./newsInput";
import { dedupeByKey, resolveManagedFeedImage, toFeedItem } from "./feed";
import { getExternalNews } from "./externalNews";
import { getMarketData, getWeatherData } from "./signalData";
import { buildManagedImageUrl, buildManagedVideoUrl, ensureManagedImageCaptured, proxyManagedMediaRequest } from "./mediaProxy";
import { PROVINCE_OPTIONS, SECTION_OPTIONS } from "./catalog";
import {
  asNullable,
  escapeHtml,
  isNewsSection,
  isNewsStatus,
  isPollStatus,
  isProvince,
  normalizeHttpUrl,
  normalizeImageUrl,
  readString,
  readBoolean,
  slugifyText,
} from "./utils";
import { prisma } from "./prismaClient";
import {
  applyEditorialSuggestions,
  askEditorialWithAi,
  chatEditorialCommandWithAi,
  evaluateEditorialWithAi,
  generateBatchDraftsWithAi,
  generatePollDraftWithAi,
  generateDraftWithAi,
  getEditorialAiHealth,
  planEditorialCommandWithAi,
  type EditorialCommandOperation,
  type EditorialCommandPlan,
  type EditorialReview,
} from "./editorialAi";
import { buildAiNewsContext } from "./newsContextWrapper";
import {
  getAiResearchSettings,
  getEditorialAutopilotSettings,
  getHomeEngagementSettings,
  getHomeTheme,
  getInstagramPublishingSettings,
  HOME_THEME_OPTIONS,
  normalizeHomeTheme,
  setEditorialAutopilotSettings,
  setAiResearchSettings,
  setHomeEngagementSettings,
  setHomeTheme,
  setInstagramPublishingSettings,
  EDITORIAL_AUTOPILOT_MODE_OPTIONS,
  getEditorialCommandChatState,
  setEditorialCommandChatState,
  type EditorialCommandChatMessage,
  type EditorialCommandLogEntry,
} from "./siteSettings";
import { buildCroppedImageUrl, buildNewsResearchContext, sourceFeedToText } from "./newsResearchAgent";
import {
  getInstagramConnectionSummary,
  publishNewsToInstagram,
  type InstagramManagedAccount,
} from "./instagram";
import {
  FIXED_CANDIDATE_OPTIONS,
  fixedCandidateTemplateForLabel,
  hardcodedVoteCountForLabel,
  buildPollSnapshot,
  ensureUniquePollSlug,
  normalizePollQuestionText,
  normalizePollInput,
  type PollReasonPublic,
  toPollPublicView,
} from "./polls";
import {
  assertValidUserEmail,
  assertValidUserPassword,
  createEmailCode,
  createUserSessionToken,
  hashEmailCode,
  hashUserPassword,
  hashUserSessionToken,
  normalizeEmailCode,
  normalizeDisplayName,
  normalizeUserEmail,
  normalizeUserPlanInput,
  toPublicUser,
  verifyUserPassword,
} from "./users";
import { emailHealth, sendAccountCodeEmail, sendWelcomeEmail } from "./email";
const app = express();

const PORT = Number(process.env.PORT ?? 8080);
const NODE_ENV = process.env.NODE_ENV ?? "development";
const IS_PRODUCTION = NODE_ENV === "production" || Boolean(process.env.RENDER);

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@pulsopais.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "cambiar-este-password";
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET ?? "pulso-pais-admin-secret";
const ADMIN_COOKIE_NAME = process.env.ADMIN_COOKIE_NAME ?? "pulso_admin_session";
const USER_SESSION_COOKIE_NAME = process.env.USER_SESSION_COOKIE_NAME ?? "pulso_user_session";
const USER_SESSION_SECRET = process.env.USER_SESSION_SECRET ?? `${ADMIN_JWT_SECRET}-users`;
const USER_SESSION_HOURS = Math.max(1, Math.min(24 * 90, Number(process.env.USER_SESSION_HOURS ?? 24 * 30)));
const AUTH_RATE_LIMIT_WINDOW_MS = Math.max(30_000, Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? 10 * 60 * 1000));
const AUTH_RATE_LIMIT_MAX_ATTEMPTS = Math.max(3, Number(process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS ?? 20));
const USER_EMAIL_CODE_SECRET = process.env.USER_EMAIL_CODE_SECRET ?? `${USER_SESSION_SECRET}-email-code`;
const USER_EMAIL_CODE_TTL_MINUTES = Math.max(5, Math.min(60, Number(process.env.USER_EMAIL_CODE_TTL_MINUTES ?? 15)));

type RuntimeVersionInfo = {
  app: "backend" | "frontend";
  provider: string;
  commit: string;
  branch: string | null;
  deployment: string | null;
  publicUrl: string;
  generatedAt: string;
  versionLabel: string;
};

function resolveFrontendPublicUrl(): string {
  const fallback = IS_PRODUCTION ? "https://pulso-pais.vercel.app" : "http://localhost:3000";
  const raw =
    process.env.FRONTEND_PUBLIC_URL ?? process.env.NEXT_PUBLIC_FRONTEND_URL ?? process.env.VERCEL_URL ?? fallback;

  const normalized = readString(raw);
  if (!normalized) {
    return fallback;
  }

  const hasLocalHost = /localhost|127\.0\.0\.1/i.test(normalized);
  if (IS_PRODUCTION && hasLocalHost) {
    return "https://pulso-pais.vercel.app";
  }

  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return normalized;
  }
  return `https://${normalized}`;
}

const FALLBACK_FRONTEND_PUBLIC_URL = IS_PRODUCTION ? "https://pulso-pais.vercel.app" : "http://localhost:3000";
const FRONTEND_PUBLIC_URL = resolveFrontendPublicUrl() || FALLBACK_FRONTEND_PUBLIC_URL;
const AUTOPILOT_RUN_SECRET = readString(process.env.AUTOPILOT_RUN_SECRET);
const AUTOPILOT_HEARTBEAT_ENABLED =
  readString(process.env.AUTOPILOT_HEARTBEAT_ENABLED).length > 0
    ? readBoolean(process.env.AUTOPILOT_HEARTBEAT_ENABLED)
    : IS_PRODUCTION;
const AUTOPILOT_HEARTBEAT_MINUTES = Math.max(
  5,
  Math.min(60, Number(readString(process.env.AUTOPILOT_HEARTBEAT_MINUTES) || "20") || 20),
);
const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? "*,http://localhost:3000,http://127.0.0.1:3000,https://*.vercel.app")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const BATCH_NEWS_FALLBACK_IMAGES: string[] = [];
const GALLERY_BLOCK_START = "[[GALERIA_FOTOS]]";
const GALLERY_BLOCK_END = "[[/GALERIA_FOTOS]]";
const GALLERY_BLOCK_REGEX = /\[\[GALERIA_FOTOS\]\][\s\S]*?\[\[\/GALERIA_FOTOS\]\]/gi;
const VIDEO_BLOCK_START = "[[VIDEO_PRINCIPAL]]";
const VIDEO_BLOCK_END = "[[/VIDEO_PRINCIPAL]]";
const VIDEO_BLOCK_REGEX = /\[\[VIDEO_PRINCIPAL\]\][\s\S]*?\[\[\/VIDEO_PRINCIPAL\]\]/gi;
const IMAGE_PROBE_TIMEOUT_MS = 4500;
const IMAGE_PROBE_CACHE_TTL_MS = 15 * 60 * 1000;
const imageProbeCache = new Map<string, { ok: boolean; expiresAt: number }>();
let autopilotHeartbeatTimer: NodeJS.Timeout | null = null;
let autopilotHeartbeatRunning = false;

async function ensureAutopilotDueRun(triggerLabel: string): Promise<void> {
  try {
    await runEditorialAutopilotHeartbeat(triggerLabel);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Fallo desconocido al asegurar autopiloto';
    console.error(`[autopilot:${triggerLabel}] ${message}`);
  }
}

function shortCommit(input: string | null | undefined): string {
  const value = readString(input);
  return value ? value.slice(0, 7) : "dev";
}

function buildBackendVersionInfo(): RuntimeVersionInfo {
  const commit =
    readString(process.env.RENDER_GIT_COMMIT) ||
    readString(process.env.VERCEL_GIT_COMMIT_SHA) ||
    readString(process.env.GIT_COMMIT_SHA) ||
    "dev-local";
  const branch =
    readString(process.env.RENDER_GIT_BRANCH) ||
    readString(process.env.VERCEL_GIT_COMMIT_REF) ||
    null;
  const deployment =
    readString(process.env.RENDER_SERVICE_ID) ||
    readString(process.env.RENDER_DEPLOY_ID) ||
    readString(process.env.VERCEL_DEPLOYMENT_ID) ||
    null;

  return {
    app: "backend",
    provider: process.env.RENDER ? "render" : process.env.VERCEL ? "vercel" : "local",
    commit,
    branch,
    deployment,
    publicUrl: readString(process.env.BACKEND_PUBLIC_URL) || readString(process.env.RENDER_EXTERNAL_URL) || `http://localhost:${PORT}`,
    generatedAt: new Date().toISOString(),
    versionLabel: shortCommit(commit),
  };
}

async function buildDeployStatusPayload(): Promise<{
  backend: RuntimeVersionInfo;
  frontend: RuntimeVersionInfo | null;
  sync: "synced" | "drift" | "unknown";
  error: string | null;
}> {
  const backend = buildBackendVersionInfo();

  try {
    const response = await fetch(`${normalizedFrontendBaseUrl().replace(/\/+$/, "")}/api/version`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      return {
        backend,
        frontend: null,
        sync: "unknown",
        error: `Frontend respondio ${response.status}.`,
      };
    }
    const frontend = (await response.json()) as RuntimeVersionInfo;
    const sync =
      frontend.commit &&
      backend.commit &&
      frontend.commit !== "dev-local" &&
      backend.commit !== "dev-local" &&
      frontend.commit === backend.commit
        ? "synced"
        : frontend.commit && backend.commit && frontend.commit !== backend.commit
          ? "drift"
          : "unknown";
    return {
      backend,
      frontend,
      sync,
      error: null,
    };
  } catch (error) {
    return {
      backend,
      frontend: null,
      sync: "unknown",
      error: (error as Error).message,
    };
  }
}

function uniqueNormalizedImageUrls(values: Array<string | null | undefined>, maxItems = 6): string[] {
  const normalized = values.map((item) => normalizeImageUrl(item)).filter((item): item is string => Boolean(item));
  return Array.from(new Set(normalized)).slice(0, maxItems);
}

function uniqueNormalizedVideoUrls(values: Array<string | null | undefined>, maxItems = 3): string[] {
  const normalized = values.map((item) => normalizeHttpUrl(item)).filter((item): item is string => Boolean(item));
  return Array.from(new Set(normalized)).slice(0, maxItems);
}

function applyResearchImageTransform(
  imageUrl: string | null,
  settings: Awaited<ReturnType<typeof getAiResearchSettings>>,
): string | null {
  if (!imageUrl) {
    return null;
  }
  if (!settings.cropImage) {
    return imageUrl;
  }
  return buildCroppedImageUrl(imageUrl, settings.cropWidth, settings.cropHeight);
}

function fallbackResearchImage(seedText: string): string {
  void seedText;
  return "";
}

function appendGalleryBlockToBody(body: string | null | undefined, imageUrls: string[]): string | null {
  const cleanedBody = readString(body).replace(GALLERY_BLOCK_REGEX, "").trim();
  const gallery = Array.from(new Set(imageUrls.map((item) => item.trim()).filter(Boolean))).slice(0, 6);

  if (gallery.length === 0) {
    return cleanedBody.length > 0 ? cleanedBody : null;
  }

  const galleryBlock = [GALLERY_BLOCK_START, ...gallery.map((url) => `- ${url}`), GALLERY_BLOCK_END].join("\n");
  if (!cleanedBody) {
    return galleryBlock;
  }
  return `${cleanedBody}\n\n${galleryBlock}`;
}

function appendPrimaryVideoBlockToBody(
  body: string | null | undefined,
  videoUrl: string | null,
  posterUrl?: string | null,
): string | null {
  const cleanedBody = readString(body).replace(VIDEO_BLOCK_REGEX, "").trim();
  if (!videoUrl) {
    return cleanedBody.length > 0 ? cleanedBody : null;
  }

  const lines = [VIDEO_BLOCK_START, `url: ${videoUrl}`];
  if (posterUrl) {
    lines.push(`poster: ${posterUrl}`);
  }
  lines.push(VIDEO_BLOCK_END);

  const block = lines.join("\n");
  if (!cleanedBody) {
    return block;
  }

  return `${block}\n\n${cleanedBody}`;
}

async function probeMediaUrl(url: string, kind: "image" | "video"): Promise<boolean> {
  const cacheKey = `${kind}:${url}`;
  const cached = imageProbeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.ok;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_PROBE_TIMEOUT_MS);

  const persist = (ok: boolean) => {
    imageProbeCache.set(cacheKey, { ok, expiresAt: Date.now() + IMAGE_PROBE_CACHE_TTL_MS });
    return ok;
  };

  try {
    const head = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      headers: {
        accept: kind === "image" ? "image/*,*/*;q=0.8" : "video/*,*/*;q=0.8",
        "user-agent": "PulsoPaisMediaProbe/1.0",
      },
    });

    if (head.ok) {
      const contentType = head.headers.get("content-type") ?? "";
      if (!contentType || contentType.startsWith(`${kind}/`) || contentType === "application/octet-stream") {
        return persist(true);
      }
    }

    if (head.status !== 405 && head.status !== 403 && head.status !== 400) {
      return persist(false);
    }

    const get = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        accept: kind === "image" ? "image/*,*/*;q=0.8" : "video/*,*/*;q=0.8",
        range: "bytes=0-1024",
        "user-agent": "PulsoPaisMediaProbe/1.0",
      },
    });

    if (!get.ok) {
      return persist(false);
    }
    const contentType = get.headers.get("content-type") ?? "";
    if (!contentType || contentType.startsWith(`${kind}/`) || contentType === "application/octet-stream") {
      return persist(true);
    }
    return persist(false);
  } catch {
    return persist(false);
  } finally {
    clearTimeout(timeout);
  }
}

async function probeImageUrl(url: string): Promise<boolean> {
  return probeMediaUrl(url, "image");
}

async function probeVideoUrl(url: string): Promise<boolean> {
  return probeMediaUrl(url, "video");
}

function isEmbeddableVideoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (
      host.includes("youtube.com") ||
      host.includes("youtu.be") ||
      host.includes("youtube-nocookie.com") ||
      host.includes("vimeo.com")
    );
  } catch {
    return false;
  }
}

async function probeEmbeddableVideoUrl(url: string): Promise<boolean> {
  const cacheKey = `embed:${url}`;
  const cached = imageProbeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.ok;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_PROBE_TIMEOUT_MS);
  const persist = (ok: boolean) => {
    imageProbeCache.set(cacheKey, { ok, expiresAt: Date.now() + IMAGE_PROBE_CACHE_TTL_MS });
    return ok;
  };

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml",
        range: "bytes=0-1024",
        "user-agent": "PulsoPaisEmbedProbe/1.0",
      },
    });
    if (!response.ok) {
      return persist(false);
    }
    const contentType = response.headers.get("content-type") ?? "";
    return persist(!contentType || contentType.includes("text/html") || contentType.includes("application/xhtml+xml"));
  } catch {
    return persist(false);
  } finally {
    clearTimeout(timeout);
  }
}

type ManagedImageCandidate = {
  url: string | null | undefined;
  referer?: string | null;
};

async function pickReachableImage(imageUrls: string[], maxChecks = 4): Promise<string | null> {
  const unique = Array.from(new Set(imageUrls.map((item) => item.trim()).filter(Boolean)));
  const capped = unique.slice(0, Math.max(1, maxChecks));

  for (const url of capped) {
    if (await probeImageUrl(url)) {
      return url;
    }
  }

  return null;
}

async function pickReachableVideo(videoUrls: string[], maxChecks = 3): Promise<string | null> {
  const unique = Array.from(new Set(videoUrls.map((item) => item.trim()).filter(Boolean)));
  const capped = unique.slice(0, Math.max(1, maxChecks));

  for (const url of capped) {
    const ok = isEmbeddableVideoUrl(url) ? await probeEmbeddableVideoUrl(url) : await probeVideoUrl(url);
    if (ok) {
      return url;
    }
  }

  return null;
}

async function pickReachableImages(
  imageUrls: string[],
  maxItems = 4,
  maxChecks = 10,
): Promise<string[]> {
  const unique = Array.from(new Set(imageUrls.map((item) => item.trim()).filter(Boolean)));
  const selected: string[] = [];

  for (const url of unique.slice(0, Math.max(maxChecks, maxItems))) {
    if (selected.length >= maxItems) {
      break;
    }
    if (await probeImageUrl(url)) {
      selected.push(url);
    }
  }

  return selected;
}

async function pickManagedImageCandidate(
  candidates: ManagedImageCandidate[],
  maxChecks = 6,
): Promise<{ rawUrl: string; managedUrl: string } | null> {
  const seen = new Set<string>();
  let inspected = 0;

  for (const candidate of candidates) {
    const normalizedUrl = normalizeImageUrl(candidate.url);
    if (!normalizedUrl || seen.has(normalizedUrl)) {
      continue;
    }
    seen.add(normalizedUrl);
    inspected += 1;
    if (inspected > Math.max(1, maxChecks)) {
      break;
    }

    const managedUrl = await ensureManagedImageCaptured(normalizedUrl, { referer: candidate.referer ?? null });
    if (managedUrl) {
      return { rawUrl: normalizedUrl, managedUrl };
    }
  }

  return null;
}

async function captureManagedImageList(candidates: Array<string | ManagedImageCandidate>, maxItems = 4): Promise<string[]> {
  const managed: string[] = [];
  const seen = new Set<string>();
  for (const entry of candidates) {
    if (managed.length >= maxItems) {
      break;
    }
    const candidate = typeof entry === "string" ? { url: entry, referer: null } : entry;
    const normalizedUrl = normalizeImageUrl(candidate.url);
    if (!normalizedUrl || seen.has(normalizedUrl)) {
      continue;
    }
    seen.add(normalizedUrl);
    const captured = await ensureManagedImageCaptured(normalizedUrl, { referer: candidate.referer ?? null });
    if (captured) {
      managed.push(captured);
    }
  }
  return managed;
}

async function createReviewNewsDraft(params: {
  title: string;
  excerpt?: string | null;
  kicker?: string | null;
  body?: string | null;
  section?: Prisma.NewsUncheckedCreateInput["section"] | null;
  province?: Prisma.NewsUncheckedCreateInput["province"] | null;
  tags?: string[];
  sourceName?: string | null;
  sourceUrl?: string | null;
  authorName?: string | null;
  aiReason: string;
  aiWarnings?: string[];
  aiModel?: string | null;
}): Promise<void> {
  const normalized = normalizeNewsInput({
    title: params.title,
    slug: "",
    kicker: params.kicker ?? "Revision editorial",
    excerpt: params.excerpt ?? params.aiReason,
    body:
      params.body ??
      `${params.excerpt ?? params.title}\n\nEstado: pendiente de revision editorial.\nMotivo: ${params.aiReason}`,
    imageUrl: "",
    sourceName: params.sourceName ?? "Pulso Pais IA",
    sourceUrl: normalizeHttpUrl(params.sourceUrl) ?? "",
    authorName: params.authorName ?? "Agente periodista",
    section: params.section ?? "NACION",
    province: params.province ?? "",
    tags: (params.tags ?? []).filter(Boolean),
    status: NewsStatus.DRAFT,
    publishedAt: "",
    isSponsored: false,
    isFeatured: false,
    isHero: false,
    isInterview: false,
    isOpinion: false,
    isRadar: params.section === "RADAR_ELECTORAL",
  });

  const existingReview =
    params.sourceUrl && normalizeHttpUrl(params.sourceUrl)
      ? await prisma.news.findFirst({
          where: {
            sourceUrl: normalizeHttpUrl(params.sourceUrl),
            aiDecision: "REVIEW",
          },
          orderBy: [{ updatedAt: "desc" }],
        })
      : null;

  if (existingReview) {
    const uniqueSlug = await ensureUniqueSlug(prisma, normalized.slug, existingReview.id);
    await prisma.news.update({
      where: { id: existingReview.id },
      data: {
        ...normalized,
        slug: uniqueSlug,
        aiDecision: "REVIEW",
        aiReason: params.aiReason,
        aiWarnings: params.aiWarnings ?? [],
        aiModel: params.aiModel ?? null,
        aiEvaluatedAt: new Date(),
      },
    });
    return;
  }

  const uniqueSlug = await ensureUniqueSlug(prisma, normalized.slug);
  await prisma.news.create({
    data: {
      ...normalized,
      slug: uniqueSlug,
      aiDecision: "REVIEW",
      aiReason: params.aiReason,
      aiWarnings: params.aiWarnings ?? [],
      aiModel: params.aiModel ?? null,
      aiEvaluatedAt: new Date(),
    },
  });
}

function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function isOriginAllowed(origin: string): boolean {
  if (CORS_ORIGINS.includes("*")) {
    return true;
  }
  return CORS_ORIGINS.some((allowedOrigin) => {
    if (allowedOrigin === origin) {
      return true;
    }
    if (allowedOrigin.includes("*")) {
      return wildcardToRegExp(allowedOrigin).test(origin);
    }
    return false;
  });
}

async function validateWithEditorialAi(
  normalized: ReturnType<typeof normalizeNewsInput>,
): Promise<{
  safeInput: ReturnType<typeof normalizeNewsInput>;
  review: EditorialReview;
  contextMeta: {
    generatedAt: string;
    internalCount: number;
    externalCount: number;
    linesUsed: number;
  };
}> {
  const context = await buildAiNewsContext(prisma);
  const review = await evaluateEditorialWithAi(normalized, context.contextText);
  if (review.decision === "REJECT") {
    throw new Error(`Bloqueado por IA editorial: ${review.reason}`);
  }
  const safeInput = applyEditorialSuggestions(normalized, review);
  return { safeInput, review, contextMeta: context.meta };
}

function buildEditorialAssistInput(raw: Record<string, unknown>) {
  const brief = readString(raw.brief);
  if (brief.length < 12) {
    throw new Error("El brief para IA debe tener al menos 12 caracteres.");
  }

  const sectionHintRaw = readString(raw.sectionHint).toUpperCase();
  const provinceHintRaw = readString(raw.provinceHint).toUpperCase();

  const tagsRaw = Array.isArray(raw.currentTags) ? raw.currentTags.join(",") : readString(raw.currentTags);
  const currentTags = tagsRaw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);

  return {
    brief,
    sectionHint: isNewsSection(sectionHintRaw) ? sectionHintRaw : null,
    provinceHint: isProvince(provinceHintRaw) ? provinceHintRaw : null,
    isSponsored: readBoolean(raw.isSponsored),
    currentTitle: readString(raw.currentTitle) || null,
    currentKicker: readString(raw.currentKicker) || null,
    currentExcerpt: readString(raw.currentExcerpt) || null,
    currentBody: readString(raw.currentBody) || null,
    currentImageUrl: readString(raw.currentImageUrl) || null,
    currentSourceName: readString(raw.currentSourceName) || null,
    currentSourceUrl: readString(raw.currentSourceUrl) || null,
    currentAuthorName: readString(raw.currentAuthorName) || null,
    currentStatus: isNewsStatus(readString(raw.currentStatus).toUpperCase()) ? readString(raw.currentStatus).toUpperCase() : null,
    currentPublishedAt: readString(raw.currentPublishedAt) || null,
    currentSection: isNewsSection(readString(raw.currentSection).toUpperCase()) ? readString(raw.currentSection).toUpperCase() : null,
    currentProvince: isProvince(readString(raw.currentProvince).toUpperCase()) ? readString(raw.currentProvince).toUpperCase() : null,
    currentFlags: {
      isHero: readBoolean(raw.isHero),
      isFeatured: readBoolean(raw.isFeatured),
      isSponsored: readBoolean(raw.isSponsored),
      isInterview: readBoolean(raw.isInterview),
      isOpinion: readBoolean(raw.isOpinion),
      isRadar: readBoolean(raw.isRadar),
    },
    currentTags,
  };
}

function selectedCampaignLine(raw: Record<string, unknown>, fallbackLine: string): string | null {
  const includeCampaignLine = readBoolean(raw.includeCampaignLine);
  if (!includeCampaignLine) {
    return null;
  }
  const requested = readString(raw.campaignLine);
  if (requested.length > 0) {
    return requested.slice(0, 260);
  }
  const fallback = fallbackLine.trim();
  return fallback.length > 0 ? fallback.slice(0, 260) : null;
}

async function postProcessResearchedSuggestion(
  suggestion: Awaited<ReturnType<typeof generateDraftWithAi>>,
  settings: Awaited<ReturnType<typeof getAiResearchSettings>>,
  leadSource:
    | {
        sourceName: string | null;
        sourceUrl: string;
        imageUrl: string | null;
        videoUrl: string | null;
        videoPosterUrl: string | null;
      }
    | null,
  sources: Array<{
    imageUrl: string | null;
    sourceName: string | null;
    sourceUrl: string;
    videoUrl: string | null;
    videoPosterUrl: string | null;
  }>,
  fallbackSeed: string,
): Promise<Awaited<ReturnType<typeof generateDraftWithAi>>> {
  const notes = Array.isArray(suggestion.notes) ? suggestion.notes.slice(0, 7) : [];
  notes.unshift("Borrador generado con agente periodista + agente fotografo (agenda caliente + reescritura propia).");

  const sourceImageCandidates = uniqueNormalizedImageUrls(sources.map((item) => item.imageUrl), 8);
  const coverImageCandidatesRaw = uniqueNormalizedImageUrls(
    [
      suggestion.imageUrl,
      leadSource?.imageUrl,
      leadSource?.videoPosterUrl,
      ...sourceImageCandidates,
      fallbackResearchImage(fallbackSeed),
    ],
    8,
  );
  const coverImageCandidates = coverImageCandidatesRaw
    .map((url) => applyResearchImageTransform(url, settings))
    .filter((url): url is string => Boolean(url));
  const leadReferer = leadSource?.sourceUrl ?? sources[0]?.sourceUrl ?? null;
  const managedCoverCandidate = await pickManagedImageCandidate(
    coverImageCandidates.map((url) => ({ url, referer: leadReferer })),
    8,
  );
  if (!managedCoverCandidate) {
    throw new Error("El agente fotografo no encontro una portada editorial valida en la fuente. La pieza queda en revision.");
  }
  const finalImage = managedCoverCandidate.rawUrl;
  const proxiedCover = managedCoverCandidate.managedUrl;

  const gallerySourceRaw = sourceImageCandidates
    .filter((url) => !coverImageCandidatesRaw.includes(url))
    .slice(0, 6);
  const galleryCandidates = gallerySourceRaw
    .map((url) => applyResearchImageTransform(url, settings))
    .filter((url): url is string => Boolean(url));
  const galleryImages = await captureManagedImageList(
    galleryCandidates
      .filter((url) => url !== finalImage)
      .map((url, index) => ({ url, referer: sources[index % Math.max(1, sources.length)]?.sourceUrl ?? leadReferer })),
    4,
  );

  const rawVideoCandidates = uniqueNormalizedVideoUrls(
    [leadSource?.videoUrl, ...sources.map((item) => item.videoUrl), normalizeHttpUrl((suggestion as { videoUrl?: string | null }).videoUrl)],
    4,
  );
  const rawPosterCandidates = uniqueNormalizedImageUrls(
    [leadSource?.videoPosterUrl, ...sources.map((item) => item.videoPosterUrl), finalImage],
    4,
  );
  const finalVideo = await pickReachableVideo(rawVideoCandidates, 3);
  const finalVideoPoster = uniqueNormalizedImageUrls(
    [finalImage, ...rawPosterCandidates],
    3,
  )[0] ?? null;
  const proxiedPoster =
    finalVideoPoster
      ? (await ensureManagedImageCaptured(finalVideoPoster, { referer: leadReferer })) ?? buildManagedImageUrl(finalVideoPoster)
      : null;
  let finalBody = appendPrimaryVideoBlockToBody(
    suggestion.body ?? suggestion.excerpt ?? null,
    buildManagedVideoUrl(finalVideo),
    proxiedPoster,
  );
  finalBody = appendGalleryBlockToBody(finalBody, galleryImages);
  notes.push("Portada visual confirmada por agente fotografo.");
  if (galleryImages.length > 0) {
    notes.push(`Galeria IA agregada (${galleryImages.length} fotos).`);
  }
  if (finalVideo) {
    notes.push("Video principal detectado y enlazado para consumo in-page.");
  }

  const finalSourceName =
    suggestion.sourceName ||
    leadSource?.sourceName ||
    sources[0]?.sourceName ||
    (settings.internalizeSourceLinks ? "Pulso Pais (elaboracion propia sobre fuentes abiertas)" : "Pulso Pais IA");

  return {
    ...suggestion,
    imageUrl: proxiedCover,
    body: finalBody,
    sourceName: finalSourceName,
    sourceUrl: settings.internalizeSourceLinks
      ? null
      : normalizeHttpUrl(suggestion.sourceUrl) || normalizeHttpUrl(leadSource?.sourceUrl) || normalizeHttpUrl(sources[0]?.sourceUrl) || null,
    notes: notes.slice(0, 8),
  };
}

async function findNewsMatchesForCommand(match: string, limit: number): Promise<News[]> {
  const query = readString(match);
  if (!query) {
    return [];
  }
  const normalizedQuery = query.toLowerCase();
  const deleteAllSignal = /(todas las noticias|todas las notas|todo el medio|todo el sitio|borra todo|elimina todo|limpia todo|eran de prueba)/i.test(
    normalizedQuery,
  );

  if (deleteAllSignal) {
    return prisma.news.findMany({
      orderBy: [{ updatedAt: "desc" }, { publishedAt: "desc" }],
      take: Math.max(1, Math.min(500, limit || 500)),
    });
  }

  const directId = await prisma.news.findUnique({ where: { id: query } });
  if (directId) {
    return [directId];
  }

  const directSlug = await prisma.news.findUnique({ where: { slug: query } });
  if (directSlug) {
    return [directSlug];
  }

  const slugCandidate = slugifyText(query);
  const rows = await prisma.news.findMany({
    where: {
      OR: [
        { slug: { contains: slugCandidate || query, mode: "insensitive" } },
        { title: { contains: query, mode: "insensitive" } },
        { kicker: { contains: query, mode: "insensitive" } },
        { excerpt: { contains: query, mode: "insensitive" } },
        { sourceName: { contains: query, mode: "insensitive" } },
        { sourceUrl: { contains: query, mode: "insensitive" } },
        ...(query.includes(" ") ? [] : [{ tags: { has: query } }]),
      ],
    },
    orderBy: [{ updatedAt: "desc" }, { publishedAt: "desc" }],
    take: Math.max(1, Math.min(80, limit)),
  });

  return rows;
}

async function createStoriesFromBatchState(formState: BatchNewsFormState): Promise<{
  createdCount: number;
  totalRequested: number;
  researchSourcesUsed: number;
  model: string;
  errors: string[];
}> {
  const aiResearchSettings = await getAiResearchSettings(prisma);
  const campaignSlots = Math.round((formState.totalItems * formState.campaignPercent) / 100);
  const generalSlots = formState.totalItems - campaignSlots;

  if (campaignSlots > 0 && formState.campaignTopic.length < 8) {
    throw new Error("Con porcentaje de campana > 0, el tema de campana debe tener al menos 8 caracteres.");
  }
  if (generalSlots > 0 && formState.generalBrief.length < 12) {
    throw new Error("Con bloque general activo, el brief general debe tener al menos 12 caracteres.");
  }
  if (formState.useResearchAgent && !aiResearchSettings.enabled) {
    throw new Error("El agente periodista esta desactivado en Panel. Activalo o desmarca 'Modo periodista'.");
  }

  const safeCampaignTopic = campaignSlots > 0 ? formState.campaignTopic : "Sin bloque de campana";
  const safeGeneralBrief = generalSlots > 0 ? formState.generalBrief : "Sin bloque general";

  const context = await buildAiNewsContext(prisma);
  let mergedContext = context.contextText;
  let researchLead:
    | {
        sourceName: string | null;
        sourceUrl: string;
        imageUrl: string | null;
        videoUrl: string | null;
        videoPosterUrl: string | null;
      }
    | null = null;
  let researchSources: Array<{
    sourceName: string | null;
    sourceUrl: string;
    imageUrl: string | null;
    videoUrl: string | null;
    videoPosterUrl: string | null;
  }> = [];
  let researchSourcesUsed = 0;

  if (formState.useResearchAgent) {
    const researchBriefParts = [campaignSlots > 0 ? formState.campaignTopic : "", generalSlots > 0 ? formState.generalBrief : ""]
      .map((part) => part.trim())
      .filter(Boolean);
    const researchBrief = researchBriefParts.join(" | ") || "Agenda politica federal Argentina";
    const research = await buildNewsResearchContext({
      brief: researchBrief,
      limit: aiResearchSettings.hotNewsLimit,
      fetchArticleText: aiResearchSettings.fetchArticleText,
      campaignLine: formState.includeCampaignLine ? formState.campaignLine : "",
    });
    researchLead = research.lead;
    researchSources = research.sources;
    researchSourcesUsed = research.sources.length;
    const sourceList = sourceFeedToText(research.sources, 12);
    mergedContext = [context.contextText, "", research.contextText, sourceList ? `FUENTES INVESTIGADAS:\n${sourceList}` : ""]
      .filter(Boolean)
      .join("\n");
  }

  const batch = await generateBatchDraftsWithAi(
    {
      totalItems: formState.totalItems,
      campaignPercent: formState.campaignPercent,
      campaignTopic: safeCampaignTopic,
      generalBrief: safeGeneralBrief,
      sectionHint: formState.sectionHint || null,
      provinceHint: formState.provinceHint || null,
      publishStatus: formState.publishStatus,
      requireImageUrl: formState.requireImageUrl || formState.useResearchAgent,
    },
    mergedContext,
  );

  let createdCount = 0;
  const errors: string[] = [];
  const nowBase = Date.now();

  for (const [index, item] of batch.items.entries()) {
    const draft = item.draft;
    const fallbackTitle = item.focus === "CAMPAIGN" ? `Radar de campana ${index + 1}` : `Agenda politica ${index + 1}`;
    const fallbackKicker = item.focus === "CAMPAIGN" ? "Escenario Electoral" : "Mesa de situacion";
    const fallbackExcerpt = item.focus === "CAMPAIGN" ? safeCampaignTopic : safeGeneralBrief;
    const sourceItem = researchSources.length > 0 ? researchSources[index % researchSources.length] : null;
    const sourceGalleryCandidates =
      researchSources.length > 0
        ? [researchSources[(index + 1) % researchSources.length], researchSources[(index + 2) % researchSources.length]]
        : [];
    try {
      const finalSection = draft.section && isNewsSection(draft.section) ? draft.section : formState.sectionHint || "NACION";
      const finalProvince = draft.province && isProvince(draft.province) ? draft.province : formState.provinceHint || "";
      const sourceVideoCandidates = researchSources.length > 0 ? [sourceItem, researchLead, ...sourceGalleryCandidates] : [];
      const baseImageCandidatesRaw = uniqueNormalizedImageUrls(
        [
          draft.imageUrl,
          sourceItem?.imageUrl ?? null,
          researchLead?.imageUrl ?? null,
          sourceItem?.videoPosterUrl ?? null,
          formState.requireImageUrl || formState.useResearchAgent ? fallbackBatchImageByIndex(index) : null,
        ],
        5,
      );
      const baseImageCandidates = baseImageCandidatesRaw
        .map((url) => applyResearchImageTransform(url, aiResearchSettings))
        .filter((url): url is string => Boolean(url));
      const imageReferer = sourceItem?.sourceUrl ?? researchLead?.sourceUrl ?? null;
      const managedCoverCandidate = await pickManagedImageCandidate(
        baseImageCandidates.map((url) => ({ url, referer: imageReferer })),
        5,
      );
      if (!managedCoverCandidate) {
        throw new Error("El agente fotografo no encontro una portada editorial valida para este item.");
      }
      const finalImage = managedCoverCandidate.rawUrl;
      const galleryImages = uniqueNormalizedImageUrls(
        sourceGalleryCandidates.map((entry) => entry?.imageUrl ?? null),
        3,
      )
        .filter((url) => !baseImageCandidatesRaw.includes(url))
        .map((url) => applyResearchImageTransform(url, aiResearchSettings))
        .filter((url): url is string => Boolean(url));
      const reachableGallery = await captureManagedImageList(
        galleryImages
          .filter((url) => url !== finalImage)
          .map((url, galleryIndex) => ({
            url,
            referer: sourceGalleryCandidates[galleryIndex]?.sourceUrl ?? imageReferer,
          })),
        3,
      );
      const reachableVideo = await pickReachableVideo(
        uniqueNormalizedVideoUrls(sourceVideoCandidates.map((entry) => entry?.videoUrl ?? null), 3),
        3,
      );
      const videoPosterSource =
        uniqueNormalizedImageUrls([sourceItem?.videoPosterUrl ?? null, researchLead?.videoPosterUrl ?? null, finalImage], 3)[0] ?? null;
      const videoPoster =
        videoPosterSource
          ? (await ensureManagedImageCaptured(videoPosterSource, { referer: imageReferer })) ?? buildManagedImageUrl(videoPosterSource)
          : null;
      const managedCover = managedCoverCandidate.managedUrl;

      const finalSourceName = draft.sourceName ?? sourceItem?.sourceName ?? researchLead?.sourceName ?? formState.defaultSourceName;
      const finalSourceUrl =
        formState.useResearchAgent && aiResearchSettings.internalizeSourceLinks
          ? ""
          : normalizeHttpUrl(draft.sourceUrl) ??
            normalizeHttpUrl(sourceItem?.sourceUrl) ??
            normalizeHttpUrl(researchLead?.sourceUrl) ??
            normalizeHttpUrl(formState.defaultSourceUrl) ??
            "";
      const finalBody = appendGalleryBlockToBody(
        appendPrimaryVideoBlockToBody(
          draft.body ?? draft.excerpt ?? fallbackExcerpt,
          buildManagedVideoUrl(reachableVideo),
          videoPoster,
        ),
        reachableGallery,
      );

      const normalized = normalizeNewsInput({
        title: draft.title ?? fallbackTitle,
        slug: "",
        kicker: draft.kicker ?? fallbackKicker,
        excerpt: draft.excerpt ?? fallbackExcerpt,
        body: finalBody ?? fallbackExcerpt,
        imageUrl: managedCover,
        sourceName: finalSourceName,
        sourceUrl: finalSourceUrl,
        authorName: draft.authorName ?? formState.defaultAuthorName,
        section: finalSection,
        province: finalProvince,
        tags: draft.tags.length > 0 ? draft.tags : [item.focus === "CAMPAIGN" ? "campana" : "agenda", "pulso-pais"],
        status: formState.publishStatus,
        publishedAt: formState.publishStatus === NewsStatus.PUBLISHED ? new Date(nowBase + index * 1000).toISOString() : "",
        isSponsored: false,
        isFeatured: draft.flags.isFeatured,
        isHero: false,
        isInterview: draft.flags.isInterview,
        isOpinion: draft.flags.isOpinion,
        isRadar: draft.flags.isRadar || finalSection === "RADAR_ELECTORAL",
      });

      const uniqueSlug = await ensureUniqueSlug(prisma, normalized.slug);
      await prisma.news.create({
        data: {
          ...normalized,
          slug: uniqueSlug,
          aiDecision: "ALLOW",
          aiReason: `Generada en lote IA (${batch.model}) [${item.focus}]${formState.useResearchAgent ? " [AGENTE PERIODISTA]" : ""}`,
          aiWarnings: draft.notes,
          aiModel: batch.model,
          aiEvaluatedAt: new Date(),
        },
      });
      createdCount += 1;
    } catch (error) {
      const errorMessage = (error as Error).message;
      const reviewSection =
        draft.section && isNewsSection(draft.section)
          ? draft.section
          : isNewsSection(formState.sectionHint)
            ? formState.sectionHint
            : "NACION";
      const reviewProvince =
        draft.province && isProvince(draft.province)
          ? draft.province
          : isProvince(formState.provinceHint)
            ? formState.provinceHint
            : null;
      await createReviewNewsDraft({
        title: draft.title ?? fallbackTitle,
        excerpt: draft.excerpt ?? fallbackExcerpt,
        kicker: draft.kicker ?? fallbackKicker,
        body: draft.body ?? fallbackExcerpt,
        section: reviewSection,
        province: reviewProvince,
        tags: draft.tags.length > 0 ? draft.tags : [item.focus === "CAMPAIGN" ? "campana" : "agenda", "revision-fotografo"],
        sourceName: draft.sourceName ?? sourceItem?.sourceName ?? researchLead?.sourceName ?? formState.defaultSourceName,
        sourceUrl: draft.sourceUrl ?? sourceItem?.sourceUrl ?? researchLead?.sourceUrl ?? formState.defaultSourceUrl,
        authorName: draft.authorName ?? formState.defaultAuthorName,
        aiReason: errorMessage,
        aiWarnings: draft.notes,
        aiModel: batch.model,
      });
      errors.push(`Item ${index + 1}: ${errorMessage}`);
    }
  }

  if (createdCount === 0 && errors.length === 0) {
    throw new Error("No se pudo crear ninguna noticia del lote.");
  }

  return {
    createdCount,
    totalRequested: batch.items.length,
    researchSourcesUsed,
    model: batch.model,
    errors,
  };
}

async function internalizeExternalNewsFromState(rewriteState: ExternalRewriteFormState): Promise<{
  createdCount: number;
  updatedCount: number;
  deletedCount: number;
  errors: string[];
}> {
  const settings = await getAiResearchSettings(prisma);
  if (!settings.enabled) {
    throw new Error("El agente periodista esta desactivado en Panel. Activalo antes de internalizar fuentes externas.");
  }
  if (rewriteState.instruction.length < 18) {
    throw new Error("La instruccion administrativa debe tener al menos 18 caracteres.");
  }

  const research = await buildNewsResearchContext({
    brief: rewriteState.instruction,
    limit: Math.min(16, Math.max(rewriteState.limit * 2, settings.hotNewsLimit)),
    fetchArticleText: settings.fetchArticleText,
    campaignLine: rewriteState.includeCampaignLine ? rewriteState.campaignLine : "",
  });
  const context = await buildAiNewsContext(prisma);
  const existingRows = await prisma.news.findMany({
    orderBy: [{ updatedAt: "desc" }],
    take: 180,
  });

  const existingBySource = new Map<string, News[]>();
  for (const row of existingRows) {
    const key = normalizeExternalKey(row.sourceUrl);
    if (!key) {
      continue;
    }
    const bucket = existingBySource.get(key) ?? [];
    bucket.push(row);
    existingBySource.set(key, bucket);
  }

  const matchedFromResearch = research.sources
    .map((source) => ({
      source,
      existing: (existingBySource.get(normalizeExternalKey(source.sourceUrl)) ?? []).find((row) => isLikelyThinExternalNews(row)) ?? null,
    }))
    .filter((item) => rewriteState.scope !== "existing" || item.existing)
    .slice(0, rewriteState.limit);

  const fallbackExistingCandidates =
    rewriteState.scope === "existing"
      ? existingRows
          .filter((row) => isLikelyThinExternalNews(row))
          .filter((row) => !matchedFromResearch.some((item) => item.existing?.id === row.id))
          .slice(0, rewriteState.limit)
          .map((row, index) => ({
            source: {
              rank: matchedFromResearch.length + index + 1,
              title: row.title,
              sourceName: row.sourceName,
              sourceUrl: normalizeHttpUrl(row.sourceUrl) ?? "",
              imageUrl: normalizeImageUrl(row.imageUrl),
              videoUrl: null,
              videoPosterUrl: null,
              excerpt: row.excerpt,
              section: row.section,
              publishedAt: (row.publishedAt ?? row.updatedAt).toISOString(),
              matchScore: 0,
            },
            existing: row,
          }))
          .filter((item) => item.source.sourceUrl.length > 0)
      : [];

  const candidates = [...matchedFromResearch, ...fallbackExistingCandidates].slice(0, rewriteState.limit);
  if (candidates.length === 0) {
    throw new Error("No se encontraron fuentes externas candidatas para internalizar con ese criterio.");
  }

  let createdCount = 0;
  let updatedCount = 0;
  let deletedCount = 0;
  const errors: string[] = [];

  for (const [index, candidate] of candidates.entries()) {
    const source = candidate.source;
    const externalKey = normalizeExternalKey(source.sourceUrl);
    const duplicateRows = existingBySource.get(externalKey) ?? [];
    const existing = candidate.existing;
    try {
      const assistInput = {
        brief: `${rewriteState.instruction}\nFuente objetivo: ${source.title}`,
        sectionHint: rewriteState.sectionHint || (isNewsSection(source.section) ? source.section : null),
        provinceHint: rewriteState.provinceHint || null,
        isSponsored: existing?.isSponsored ?? false,
        currentTitle: existing?.title ?? null,
        currentKicker: existing?.kicker ?? null,
        currentExcerpt: existing?.excerpt ?? source.excerpt ?? null,
        currentBody: existing?.body ?? null,
        currentImageUrl: existing?.imageUrl ?? source.imageUrl ?? null,
        currentSourceName: existing?.sourceName ?? source.sourceName ?? null,
        currentSourceUrl: source.sourceUrl,
        currentAuthorName: existing?.authorName ?? null,
        currentStatus: rewriteState.publishStatus,
        currentPublishedAt: existing?.publishedAt ? existing.publishedAt.toISOString() : null,
        currentSection: existing?.section ?? null,
        currentProvince: existing?.province ?? null,
        currentFlags: {
          isHero: existing?.isHero ?? false,
          isFeatured: existing?.isFeatured ?? false,
          isSponsored: existing?.isSponsored ?? false,
          isInterview: existing?.isInterview ?? false,
          isOpinion: existing?.isOpinion ?? false,
          isRadar: existing?.isRadar ?? false,
        },
        currentTags: existing?.tags ?? [],
      };

      const mergedContext = [
        context.contextText,
        "",
        research.contextText,
        "FUENTE OBJETIVO:",
        `- titulo: ${source.title}`,
        `- medio: ${source.sourceName ?? "Fuente abierta"}`,
        `- url: ${source.sourceUrl}`,
        source.excerpt ? `- resumen: ${source.excerpt}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const suggestion = await generateDraftWithAi(assistInput, mergedContext);
      const finalSuggestion = await postProcessResearchedSuggestion(suggestion, settings, source, [source], rewriteState.instruction);

      const finalSection = rewriteState.sectionHint || existing?.section || (isNewsSection(source.section) ? source.section : "NACION");
      const finalProvince = rewriteState.provinceHint || existing?.province || null;
      const finalPublishedAt =
        rewriteState.publishStatus === NewsStatus.PUBLISHED
          ? existing?.publishedAt?.toISOString() ?? new Date(Date.now() + index * 1000).toISOString()
          : "";

      const normalized = normalizeNewsInput({
        title: finalSuggestion.title ?? existing?.title ?? source.title,
        slug: existing?.slug ?? "",
        kicker:
          finalSuggestion.kicker ??
          existing?.kicker ??
          (finalSection === "RADAR_ELECTORAL" ? "Escenario Electoral" : "Mesa de situacion"),
        excerpt: finalSuggestion.excerpt ?? existing?.excerpt ?? source.excerpt ?? rewriteState.instruction,
        body: finalSuggestion.body ?? existing?.body ?? source.excerpt ?? rewriteState.instruction,
        imageUrl: finalSuggestion.imageUrl ?? source.imageUrl ?? "",
        sourceName:
          finalSuggestion.sourceName ??
          existing?.sourceName ??
          source.sourceName ??
          "Pulso Pais (elaboracion propia sobre fuentes abiertas)",
        sourceUrl: settings.internalizeSourceLinks ? "" : normalizeHttpUrl(source.sourceUrl) ?? "",
        authorName: finalSuggestion.authorName ?? existing?.authorName ?? "Redaccion Pulso Pais",
        section: finalSection,
        province: finalProvince,
        tags: finalSuggestion.tags.length > 0 ? finalSuggestion.tags : existing?.tags?.length ? existing.tags : ["pulso-pais", "agenda-propia"],
        status: rewriteState.publishStatus,
        publishedAt: finalPublishedAt,
        isSponsored: existing?.isSponsored ?? false,
        isFeatured: finalSuggestion.flags.isFeatured || existing?.isFeatured || false,
        isHero: false,
        isInterview: finalSuggestion.flags.isInterview || existing?.isInterview || false,
        isOpinion: finalSuggestion.flags.isOpinion || existing?.isOpinion || false,
        isRadar: finalSuggestion.flags.isRadar || existing?.isRadar || finalSection === "RADAR_ELECTORAL",
      });

      if (existing) {
        const uniqueSlug = await ensureUniqueSlug(prisma, normalized.slug, existing.id);
        await prisma.news.update({
          where: { id: existing.id },
          data: {
            ...normalized,
            slug: uniqueSlug,
            aiDecision: "ALLOW",
            aiReason: `Internalizada desde fuente externa (${finalSuggestion.model})`,
            aiWarnings: finalSuggestion.notes,
            aiModel: finalSuggestion.model,
            aiEvaluatedAt: new Date(),
          },
        });
        updatedCount += 1;

        if (rewriteState.deleteDuplicates && duplicateRows.length > 1) {
          const duplicateIds = duplicateRows.filter((row) => row.id !== existing.id).map((row) => row.id);
          if (duplicateIds.length > 0) {
            const deleted = await prisma.news.deleteMany({ where: { id: { in: duplicateIds } } });
            deletedCount += deleted.count;
          }
        }
      } else {
        const uniqueSlug = await ensureUniqueSlug(prisma, normalized.slug);
        await prisma.news.create({
          data: {
            ...normalized,
            slug: uniqueSlug,
            aiDecision: "ALLOW",
            aiReason: `Creada desde fuente externa (${finalSuggestion.model})`,
            aiWarnings: finalSuggestion.notes,
            aiModel: finalSuggestion.model,
            aiEvaluatedAt: new Date(),
          },
        });
        createdCount += 1;
      }
    } catch (error) {
      const errorMessage = (error as Error).message;
      const reviewSection =
        isNewsSection(rewriteState.sectionHint)
          ? rewriteState.sectionHint
          : isNewsSection(source.section)
            ? source.section
            : "NACION";
      const reviewProvince = isProvince(rewriteState.provinceHint) ? rewriteState.provinceHint : null;
      if (!existing) {
        await createReviewNewsDraft({
          title: source.title,
          excerpt: source.excerpt ?? rewriteState.instruction,
          kicker: isNewsSection(source.section) && source.section === "RADAR_ELECTORAL" ? "Escenario Electoral" : "Revision editorial",
          body: source.excerpt ?? rewriteState.instruction,
          section: reviewSection,
          province: reviewProvince,
          tags: ["revision-fotografo", "fuente-externa"],
          sourceName: source.sourceName ?? "Fuente abierta",
          sourceUrl: source.sourceUrl,
          authorName: "Agente periodista",
          aiReason: errorMessage,
          aiModel: "journalist-agent",
        });
      } else {
        await prisma.news.update({
          where: { id: existing.id },
          data: {
            aiDecision: "REVIEW",
            aiReason: errorMessage,
            aiEvaluatedAt: new Date(),
          },
        });
      }
      errors.push(`Fuente ${index + 1}: ${errorMessage}`);
    }
  }

  if (createdCount === 0 && updatedCount === 0) {
    throw new Error(errors[0] ?? "No se pudo internalizar ninguna fuente externa.");
  }

  return {
    createdCount,
    updatedCount,
    deletedCount,
    errors,
  };
}

async function rewriteExistingNewsByCommand(operation: Extract<EditorialCommandOperation, { kind: "REWRITE_EXISTING" }>, campaignLine: string): Promise<{
  updatedCount: number;
  errors: string[];
}> {
  const rows = await findNewsMatchesForCommand(operation.match, operation.limit);
  if (rows.length === 0) {
    throw new Error(`No se encontraron noticias para reescribir con el criterio: ${operation.match}`);
  }

  const settings = await getAiResearchSettings(prisma);
  if (operation.useResearchAgent && !settings.enabled) {
    throw new Error("El agente periodista esta desactivado en Panel. Activalo antes de usar reescritura con investigacion.");
  }

  const context = await buildAiNewsContext(prisma);
  let updatedCount = 0;
  const errors: string[] = [];

  for (const [index, row] of rows.entries()) {
    try {
      let mergedContext = context.contextText;
      let researchLead: Awaited<ReturnType<typeof buildNewsResearchContext>>["lead"] = null;
      let researchSources: Awaited<ReturnType<typeof buildNewsResearchContext>>["sources"] = [];

      if (operation.useResearchAgent) {
        const research = await buildNewsResearchContext({
          brief: `${operation.instruction} | ${row.title} | ${row.excerpt ?? ""}`,
          limit: Math.min(8, settings.hotNewsLimit),
          fetchArticleText: settings.fetchArticleText,
          campaignLine: operation.includeCampaignLine ? campaignLine : "",
        });
        researchLead = research.lead;
        researchSources = research.sources;
        const sourceList = sourceFeedToText(research.sources, 8);
        mergedContext = [context.contextText, "", research.contextText, sourceList ? `FUENTES INVESTIGADAS:\n${sourceList}` : ""]
          .filter(Boolean)
          .join("\n");
      }

      const assistInput = {
        brief: operation.instruction,
        sectionHint: operation.sectionHint,
        provinceHint: operation.provinceHint,
        isSponsored: row.isSponsored,
        currentTitle: row.title,
        currentKicker: row.kicker,
        currentExcerpt: row.excerpt,
        currentBody: row.body,
        currentImageUrl: row.imageUrl,
        currentSourceName: row.sourceName,
        currentSourceUrl: row.sourceUrl,
        currentAuthorName: row.authorName,
        currentStatus: operation.publishStatus ?? row.status,
        currentPublishedAt: row.publishedAt?.toISOString() ?? null,
        currentSection: row.section,
        currentProvince: row.province,
        currentFlags: {
          isHero: row.isHero,
          isFeatured: row.isFeatured,
          isSponsored: row.isSponsored,
          isInterview: row.isInterview,
          isOpinion: row.isOpinion,
          isRadar: row.isRadar,
        },
        currentTags: row.tags,
      };

      const suggestion = await generateDraftWithAi(assistInput, mergedContext);
      const processed = operation.useResearchAgent
        ? await postProcessResearchedSuggestion(suggestion, settings, researchLead, researchSources, `${operation.instruction} ${row.title}`)
        : suggestion;

      const baseCoverCandidates = uniqueNormalizedImageUrls(
        [processed.imageUrl, row.imageUrl, fallbackResearchImage(row.title)],
        4,
      );
      const coverReferer = researchLead?.sourceUrl ?? row.sourceUrl ?? null;
      const managedCoverCandidate = await pickManagedImageCandidate(
        baseCoverCandidates.map((url) => ({ url, referer: coverReferer })),
        5,
      );
      if (operation.requireImageUrl && !managedCoverCandidate) {
        throw new Error("No se pudo asegurar una portada valida para la reescritura.");
      }
      const managedCover = managedCoverCandidate?.managedUrl ?? null;

      const normalized = normalizeNewsInput({
        title: processed.title ?? row.title,
        slug: row.slug,
        kicker: processed.kicker ?? row.kicker ?? "Mesa de situacion",
        excerpt: processed.excerpt ?? row.excerpt ?? operation.instruction,
        body: processed.body ?? row.body ?? operation.instruction,
        imageUrl: managedCover ?? processed.imageUrl ?? row.imageUrl ?? "",
        sourceName: processed.sourceName ?? row.sourceName ?? "Pulso Pais",
        sourceUrl: normalizeHttpUrl(processed.sourceUrl) ?? normalizeHttpUrl(row.sourceUrl) ?? "",
        authorName: processed.authorName ?? row.authorName ?? "Redaccion Pulso Pais",
        section: (processed.section && isNewsSection(processed.section) ? processed.section : operation.sectionHint) ?? row.section,
        province: (processed.province && isProvince(processed.province) ? processed.province : operation.provinceHint) ?? row.province ?? "",
        tags: processed.tags.length > 0 ? processed.tags : row.tags,
        status: operation.publishStatus ?? row.status,
        publishedAt:
          (operation.publishStatus ?? row.status) === NewsStatus.PUBLISHED
            ? row.publishedAt?.toISOString() ?? new Date(Date.now() + index * 1000).toISOString()
            : "",
        isSponsored: row.isSponsored,
        isFeatured: processed.flags.isFeatured || row.isFeatured,
        isHero: row.isHero,
        isInterview: processed.flags.isInterview || row.isInterview,
        isOpinion: processed.flags.isOpinion || row.isOpinion,
        isRadar: processed.flags.isRadar || row.isRadar,
      });

      const uniqueSlug = await ensureUniqueSlug(prisma, normalized.slug, row.id);
      await prisma.news.update({
        where: { id: row.id },
        data: {
          ...normalized,
          slug: uniqueSlug,
          aiDecision: "ALLOW",
          aiReason: `Reescrita por comando editorial (${processed.model})`,
          aiWarnings: processed.notes,
          aiModel: processed.model,
          aiEvaluatedAt: new Date(),
        },
      });
      updatedCount += 1;
    } catch (error) {
      const errorMessage = (error as Error).message;
      await prisma.news.update({
        where: { id: row.id },
        data: {
          aiDecision: "REVIEW",
          aiReason: errorMessage,
          aiEvaluatedAt: new Date(),
        },
      });
      errors.push(`Nota ${index + 1}: ${errorMessage}`);
    }
  }

  if (updatedCount === 0) {
    throw new Error(errors[0] ?? "No se pudo reescribir ninguna noticia.");
  }

  return { updatedCount, errors };
}

async function updateNewsMetadataByCommand(operation: Extract<EditorialCommandOperation, { kind: "UPDATE_METADATA" }>): Promise<{ updatedCount: number }> {
  const rows = await findNewsMatchesForCommand(operation.match, operation.limit);
  if (rows.length === 0) {
    throw new Error(`No se encontraron noticias para actualizar con el criterio: ${operation.match}`);
  }

  const shouldForceHero = operation.fields.isHero === true;
  if (shouldForceHero) {
    await prisma.news.updateMany({
      where: { isHero: true, id: { notIn: rows.map((row) => row.id) } },
      data: { isHero: false },
    });
  }

  let updatedCount = 0;
  for (const [index, row] of rows.entries()) {
    const nextTags = Array.from(
      new Set(
        row.tags
          .filter((tag) => !operation.fields.removeTags.includes(tag))
          .concat(operation.fields.addTags),
      ),
    ).slice(0, 16);

    const updateData: Prisma.NewsUpdateInput = {
      tags: nextTags,
      aiReason: `Metadatos actualizados por comando editorial${operation.rationale ? `: ${operation.rationale}` : ""}`,
      aiEvaluatedAt: new Date(),
    };

    if (operation.fields.kicker !== undefined) {
      updateData.kicker = operation.fields.kicker;
    }
    if (operation.fields.section && isNewsSection(operation.fields.section)) {
      updateData.section = operation.fields.section;
    }
    if (operation.fields.province === null) {
      updateData.province = null;
    } else if (operation.fields.province && isProvince(operation.fields.province)) {
      updateData.province = operation.fields.province;
    }
    if (operation.fields.status) {
      updateData.status = operation.fields.status;
    }
    if (typeof operation.fields.isFeatured === "boolean") {
      updateData.isFeatured = operation.fields.isFeatured;
    }
    if (shouldForceHero) {
      updateData.isHero = index === 0;
    } else if (typeof operation.fields.isHero === "boolean") {
      updateData.isHero = operation.fields.isHero;
    }
    if (typeof operation.fields.isSponsored === "boolean") {
      updateData.isSponsored = operation.fields.isSponsored;
    }
    if (typeof operation.fields.isInterview === "boolean") {
      updateData.isInterview = operation.fields.isInterview;
    }
    if (typeof operation.fields.isOpinion === "boolean") {
      updateData.isOpinion = operation.fields.isOpinion;
    }
    if (typeof operation.fields.isRadar === "boolean") {
      updateData.isRadar = operation.fields.isRadar;
    }
    if (operation.fields.authorName !== undefined) {
      updateData.authorName = operation.fields.authorName;
    }
    if (operation.fields.sourceName !== undefined) {
      updateData.sourceName = operation.fields.sourceName;
    }

    await prisma.news.update({
      where: { id: row.id },
      data: updateData,
    });
    updatedCount += 1;
  }

  return { updatedCount };
}

async function deleteNewsByCommand(operation: Extract<EditorialCommandOperation, { kind: "DELETE_NEWS" }>): Promise<{ deletedCount: number }> {
  const rows = await findNewsMatchesForCommand(operation.match, operation.limit);
  const filtered = operation.onlyThinExternal ? rows.filter((row) => isLikelyThinExternalNews(row)) : rows;
  if (filtered.length === 0) {
    throw new Error(`No se encontraron noticias para borrar con el criterio: ${operation.match}`);
  }

  const deleted = await prisma.news.deleteMany({
    where: { id: { in: filtered.map((row) => row.id) } },
  });
  return { deletedCount: deleted.count };
}

async function executeEditorialCommandPlan(plan: EditorialCommandPlan, commandState: EditorialCommandFormState): Promise<string> {
  if (plan.destructive && !commandState.allowDestructive) {
    throw new Error("El plan contiene acciones destructivas. Activa 'Permitir acciones destructivas' para ejecutarlo.");
  }

  const resultLines: string[] = [];

  for (const operation of plan.operations) {
    if (operation.kind === "CREATE_STORIES") {
      const count = Math.max(1, operation.count);
      const campaignPercent = Math.max(0, Math.min(100, operation.campaignPercent));
      const state: BatchNewsFormState = {
        ...defaultBatchNewsFormState(),
        totalItems: count,
        campaignPercent,
        campaignTopic: operation.campaignTopic ?? "",
        generalBrief: operation.generalBrief || operation.brief,
        useResearchAgent: operation.useResearchAgent,
        includeCampaignLine: operation.includeCampaignLine,
        campaignLine: commandState.campaignLine,
        publishStatus: operation.publishStatus ?? NewsStatus.DRAFT,
        sectionHint: operation.sectionHint ?? "",
        provinceHint: operation.provinceHint ?? "",
        requireImageUrl: operation.requireImageUrl,
        defaultSourceName: "Pulso Pais IA",
        defaultAuthorName: "Redaccion Pulso Pais",
        defaultSourceUrl: "",
      };
      const result = await createStoriesFromBatchState(state);
      const errorHint = result.errors.length > 0 ? ` &middot; alertas: ${result.errors.slice(0, 2).join(" | ")}` : "";
      resultLines.push(`Crear: ${result.createdCount}/${result.totalRequested} notas (${result.model})${errorHint}`);
      continue;
    }

    if (operation.kind === "INTERNALIZE_EXTERNALS") {
      const state: ExternalRewriteFormState = {
        ...defaultExternalRewriteFormState(commandState.campaignLine),
        instruction: operation.instruction,
        limit: operation.limit,
        scope: operation.scope,
        publishStatus: operation.publishStatus ?? NewsStatus.DRAFT,
        sectionHint: operation.sectionHint ?? "",
        provinceHint: operation.provinceHint ?? "",
        includeCampaignLine: operation.includeCampaignLine,
        campaignLine: commandState.campaignLine,
        deleteDuplicates: operation.deleteDuplicates,
      };
      try {
        const result = await internalizeExternalNewsFromState(state);
        const errorHint = result.errors.length > 0 ? ` &middot; alertas: ${result.errors.slice(0, 2).join(" | ")}` : "";
        resultLines.push(`Internalizar: ${result.createdCount} creadas, ${result.updatedCount} actualizadas, ${result.deletedCount} eliminadas${errorHint}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo internalizar la agenda externa.";
        const canFallback = message.includes("No se encontraron fuentes externas candidatas") || message.includes("No se pudo internalizar ninguna fuente externa");
        if (!canFallback) {
          throw error;
        }

        const fallbackState: BatchNewsFormState = {
          ...defaultBatchNewsFormState(),
          totalItems: Math.max(1, operation.limit),
          campaignPercent: 0,
          campaignTopic: "",
          generalBrief: operation.instruction,
          useResearchAgent: true,
          includeCampaignLine: operation.includeCampaignLine,
          campaignLine: commandState.campaignLine,
          publishStatus: operation.publishStatus ?? NewsStatus.DRAFT,
          sectionHint: operation.sectionHint ?? "",
          provinceHint: operation.provinceHint ?? "",
          requireImageUrl: true,
          defaultSourceName: "Pulso Pais IA",
          defaultAuthorName: "Redaccion Pulso Pais",
          defaultSourceUrl: "",
        };
        const fallback = await createStoriesFromBatchState(fallbackState);
        const errorHint = fallback.errors.length > 0 ? ` &middot; alertas: ${fallback.errors.slice(0, 2).join(" | ")}` : "";
        resultLines.push(`Internalizar: sin candidatas; fallback crear ${fallback.createdCount}/${fallback.totalRequested} notas (${fallback.model})${errorHint}`);
      }
      continue;
    }

    if (operation.kind === "REWRITE_EXISTING") {
      const result = await rewriteExistingNewsByCommand(operation, commandState.campaignLine);
      const errorHint = result.errors.length > 0 ? ` &middot; alertas: ${result.errors.slice(0, 2).join(" | ")}` : "";
      resultLines.push(`Reescritura: ${result.updatedCount} notas actualizadas${errorHint}`);
      continue;
    }

    if (operation.kind === "UPDATE_METADATA") {
      const result = await updateNewsMetadataByCommand(operation);
      resultLines.push(`Metadatos: ${result.updatedCount} notas ajustadas`);
      continue;
    }

    if (operation.kind === "DELETE_NEWS") {
      const result = await deleteNewsByCommand(operation);
      resultLines.push(`Borrado: ${result.deletedCount} notas eliminadas`);
    }
  }

  return resultLines.join(" | ");
}

async function maybePublishLatestNewsToInstagram(params: {
  instagramSettings: Awaited<ReturnType<typeof getInstagramPublishingSettings>>;
  cycleStartedAt: Date;
}): Promise<string | null> {
  const settings = params.instagramSettings;
  if (!settings.enabled || !settings.accountId) {
    return null;
  }

  const candidateNews = await prisma.news.findMany({
    where: {
      status: NewsStatus.PUBLISHED,
      imageUrl: { not: null },
      updatedAt: { gte: params.cycleStartedAt },
    },
    orderBy: [{ updatedAt: "desc" }],
    take: Math.max(1, settings.maxPostsPerRun) * 4,
  });

  const ranked = candidateNews
    .filter((item) => normalizeHttpUrl(item.imageUrl))
    .sort((left, right) => {
      const score = (item: (typeof candidateNews)[number]) =>
        Number(item.isHero) * 40 +
        Number(item.isFeatured) * 20 +
        Number(item.isRadar) * 12 +
        Number(item.isInterview) * 10 +
        Number(item.isOpinion) * 8 +
        (item.excerpt ? 4 : 0) +
        Math.min((item.tags?.length ?? 0), 4);
      return score(right) - score(left) || +new Date(right.updatedAt) - +new Date(left.updatedAt);
    })
    .slice(0, Math.max(1, settings.maxPostsPerRun));

  if (ranked.length === 0) {
    return "No hubo una nota publicada con portada valida para Instagram en esta corrida.";
  }

  const published: string[] = [];
  const failed: string[] = [];
  for (const target of ranked) {
    try {
      const result = await publishNewsToInstagram({
        news: target,
        preferences: settings,
        frontendBaseUrl: normalizedFrontendBaseUrl(),
      });
      published.push(result.permalink ? `${target.slug}: ${result.permalink}` : `${target.slug}: ${result.mediaId}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "fallo desconocido";
      failed.push(`${target.slug}: ${detail}`);
    }
  }

  if (published.length === 0) {
    throw new Error(`Instagram no publico ninguna pieza. ${failed.join(" | ")}`);
  }

  return [
    `Instagram publico ${published.length} pieza(s): ${published.join(" | ")}`,
    failed.length > 0 ? `fallidas: ${failed.join(" | ")}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

async function runEditorialAutopilotCycle(triggerLabel: string): Promise<AutopilotRunSummary> {
  const [autopilotSettings, aiResearchSettings, instagramSettings] = await Promise.all([
    getEditorialAutopilotSettings(prisma),
    getAiResearchSettings(prisma),
    getInstagramPublishingSettings(prisma),
  ]);

  if (!autopilotSettings.enabled) {
    throw new Error("El autopiloto editorial esta desactivado en el dashboard.");
  }
  if (!aiResearchSettings.enabled) {
    throw new Error("El agente periodista esta apagado. Activalo antes de correr el autopiloto.");
  }

  const nowParts = getBuenosAiresNowParts();
  const windowStart = Math.max(0, Math.min(23, autopilotSettings.windowStartHour));
  const windowEnd = Math.max(windowStart, Math.min(23, autopilotSettings.windowEndHour));
  if (nowParts.hour < windowStart || nowParts.hour > windowEnd) {
    throw new Error(`Fuera de ventana operativa. El autopiloto corre entre ${windowStart}:00 y ${windowEnd}:59.`);
  }

  let effectiveSettings = autopilotSettings;
  if (autopilotSettings.todayDate !== nowParts.dateKey || autopilotSettings.todayTarget <= 0) {
    effectiveSettings = await setEditorialAutopilotSettings(prisma, {
      todayDate: nowParts.dateKey,
      todayTarget: randomIntInRange(autopilotSettings.minDailyStories, autopilotSettings.maxDailyStories),
    });
  }

  const alreadyProducedToday = await prisma.news.count({
    where: {
      aiReason: { contains: "IA" },
      createdAt: {
        gte: new Date(`${nowParts.dateKey}T00:00:00-03:00`),
        lt: new Date(`${nowParts.dateKey}T23:59:59-03:00`),
      },
    },
  });
  const remainingToday = Math.max(0, effectiveSettings.todayTarget - alreadyProducedToday);
  if (remainingToday <= 0) {
    const summary = `Objetivo diario cubierto (${alreadyProducedToday}/${effectiveSettings.todayTarget})`;
    await setEditorialAutopilotSettings(prisma, {
      lastRunAt: new Date().toISOString(),
      lastRunSummary: summary,
      nextRunAt: computeNextAutopilotRunAt({
        settings: effectiveSettings,
        now: new Date(),
        nowParts,
        remainingToday: 0,
      }),
    });
    return {
      executedAt: new Date().toISOString(),
      planSummary: summary,
      executionSummary: "Sin acciones nuevas.",
      socialSummary: null,
    };
  }

  const cycleStartedAt = new Date();
  const context = await buildAiNewsContext(prisma);
  const basePlan = applyAutopilotPolicyToPlan(
    await planEditorialCommandWithAi(
      {
        instruction: buildAutopilotInstruction(effectiveSettings),
        campaignLine: aiResearchSettings.campaignLine || null,
        allowDestructive: effectiveSettings.allowDelete,
      },
      context.contextText,
    ),
    effectiveSettings,
  );
  const plan: EditorialCommandPlan = {
    ...basePlan,
    operations: basePlan.operations.map((operation) => {
      if (operation.kind === "CREATE_STORIES") {
        return {
          ...operation,
          count: Math.max(1, Math.min(operation.count, effectiveSettings.maxStoriesPerRun, remainingToday)),
        };
      }
      if (operation.kind === "REWRITE_EXISTING") {
        return {
          ...operation,
          limit: Math.max(1, Math.min(operation.limit, effectiveSettings.maxStoriesPerRun, remainingToday)),
        };
      }
      if (operation.kind === "INTERNALIZE_EXTERNALS") {
        return {
          ...operation,
          limit: Math.max(1, Math.min(operation.limit, effectiveSettings.internalizeLimit || remainingToday, remainingToday)),
        };
      }
      return operation;
    }),
  };

  const executionSummary = await executeEditorialCommandPlan(plan, {
    instruction: `${triggerLabel}: ${buildAutopilotInstruction(effectiveSettings)}`,
    campaignLine: aiResearchSettings.campaignLine,
    allowDestructive: effectiveSettings.allowDelete,
    autoExecuteSafe: true,
  });

  let socialSummary: string | null = null;
  if (effectiveSettings.socialEnabled) {
    socialSummary = await maybePublishLatestNewsToInstagram({
      instagramSettings,
      cycleStartedAt,
    });
  }

  const result: AutopilotRunSummary = {
    executedAt: cycleStartedAt.toISOString(),
    planSummary: plan.summary,
    executionSummary,
    socialSummary,
  };

  await setEditorialAutopilotSettings(prisma, {
    lastRunAt: result.executedAt,
    lastRunSummary: [result.planSummary, result.executionSummary, result.socialSummary].filter(Boolean).join(" | "),
    nextRunAt: computeNextAutopilotRunAt({
      settings: effectiveSettings,
      now: new Date(),
      nowParts: getBuenosAiresNowParts(new Date()),
      remainingToday: Math.max(0, remainingToday - Math.max(1, effectiveSettings.maxStoriesPerRun)),
    }),
  });

  return result;
}

async function runEditorialAutopilotHeartbeat(triggerLabel: string): Promise<void> {
  if (!AUTOPILOT_HEARTBEAT_ENABLED || autopilotHeartbeatRunning) {
    return;
  }

  const settings = await getEditorialAutopilotSettings(prisma);
  if (!settings.enabled || settings.mode === "MANUAL") {
    return;
  }

  const now = new Date();
  const nowParts = getBuenosAiresNowParts(now);
  if (settings.nextRunAt) {
    const nextRun = new Date(settings.nextRunAt);
    if (Number.isFinite(nextRun.getTime()) && now.getTime() < nextRun.getTime()) {
      return;
    }
  } else {
    const seededNextRunAt = computeNextAutopilotRunAt({ settings, now, nowParts, remainingToday: settings.todayTarget });
    if (seededNextRunAt) {
      await setEditorialAutopilotSettings(prisma, { nextRunAt: seededNextRunAt });
      const seededDate = new Date(seededNextRunAt);
      if (Number.isFinite(seededDate.getTime()) && now.getTime() < seededDate.getTime()) {
        return;
      }
    }
  }

  autopilotHeartbeatRunning = true;
  try {
    const result = await runEditorialAutopilotCycle(triggerLabel);
    console.log(
      `[autopilot:${triggerLabel}] ${[result.planSummary, result.executionSummary, result.socialSummary]
        .filter(Boolean)
        .join(" | ")}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fallo desconocido en autopiloto";
    const expectedSkip =
      message.includes("Fuera de ventana operativa") ||
      message.includes("Objetivo diario cubierto") ||
      message.includes("esta desactivado") ||
      message.includes("esta apagado");
    if (expectedSkip) {
      console.log(`[autopilot:${triggerLabel}] ${message}`);
    } else {
      console.error(`[autopilot:${triggerLabel}] ${message}`);
    }
  } finally {
    autopilotHeartbeatRunning = false;
  }
}

function startEditorialAutopilotHeartbeat(): void {
  if (!AUTOPILOT_HEARTBEAT_ENABLED || autopilotHeartbeatTimer) {
    return;
  }

  const intervalMs = 60 * 1000;
  void runEditorialAutopilotHeartbeat("boot");
  autopilotHeartbeatTimer = setInterval(() => {
    void runEditorialAutopilotHeartbeat("heartbeat");
  }, intervalMs);
  console.log(
    `[autopilot] heartbeat activo cada ${AUTOPILOT_HEARTBEAT_MINUTES} minuto(s)${IS_PRODUCTION ? " en produccion" : ""}.`,
  );
}

function buildPollAssistInput(raw: Record<string, unknown>) {
  const brief = readString(raw.brief);
  if (brief.length < 12) {
    throw new Error("El brief para IA de encuesta debe tener al menos 12 caracteres.");
  }

  const statusRaw = readString(raw.currentStatus).toUpperCase();

  return {
    brief,
    currentTitle: readString(raw.currentTitle) || null,
    currentSlug: readString(raw.currentSlug) || null,
    currentQuestion: readString(raw.currentQuestion) || null,
    currentHookLabel: readString(raw.currentHookLabel) || null,
    currentFooterCta: readString(raw.currentFooterCta) || null,
    currentDescription: readString(raw.currentDescription) || null,
    currentInterviewUrl: readString(raw.currentInterviewUrl) || null,
    currentCoverImageUrl: readString(raw.currentCoverImageUrl) || null,
    currentStatus: isPollStatus(statusRaw) ? statusRaw : null,
    currentPublishedAt: readString(raw.currentPublishedAt) || null,
    currentStartsAt: readString(raw.currentStartsAt) || null,
    currentEndsAt: readString(raw.currentEndsAt) || null,
    currentIsFeatured: readBoolean(raw.currentIsFeatured),
  };
}

const POLL_VOTE_COOKIE_PREFIX = "pulso_poll_vote_";
const POLL_VOTE_SECRET = process.env.POLL_VOTE_SECRET ?? ADMIN_JWT_SECRET;
const authAttemptBuckets = new Map<string, { count: number; resetAt: number }>();

function voteCookieName(slug: string): string {
  return `${POLL_VOTE_COOKIE_PREFIX}${slug}`;
}

function isPollAvailableNow(poll: { status: PollStatus; startsAt: Date | string | null; endsAt: Date | string | null }): boolean {
  if (poll.status !== PollStatus.PUBLISHED) {
    return false;
  }
  const now = Date.now();
  const startsAtMs = poll.startsAt ? new Date(poll.startsAt).getTime() : null;
  const endsAtMs = poll.endsAt ? new Date(poll.endsAt).getTime() : null;
  if (startsAtMs && startsAtMs > now) {
    return false;
  }
  if (endsAtMs && endsAtMs < now) {
    return false;
  }
  return true;
}

function buildVoterHash(request: Request, pollId: string): string {
  const forwarded = request.headers["x-forwarded-for"];
  const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const firstChunk = (forwardedIp || request.ip || request.socket.remoteAddress || "unknown").toString().split(",")[0];
  const ip = (firstChunk ?? "unknown").trim();
  const userAgent = request.headers["user-agent"] ?? "unknown";
  const raw = `${pollId}|${ip}|${userAgent}|${POLL_VOTE_SECRET}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function userSessionCookieSameSite(): "none" | "lax" {
  return IS_PRODUCTION ? "none" : "lax";
}

function setUserSessionCookie(response: Response, token: string, expiresAt: Date): void {
  response.cookie(USER_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: userSessionCookieSameSite(),
    secure: IS_PRODUCTION,
    expires: expiresAt,
  });
}

function clearUserSessionCookie(response: Response): void {
  response.clearCookie(USER_SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: userSessionCookieSameSite(),
    secure: IS_PRODUCTION,
  });
}

function extractCookieToken(request: Request, cookieName: string): string | null {
  const value = request.cookies?.[cookieName];
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return null;
}

function authRateLimitKey(request: Request, routeName: string): string {
  const forwarded = request.headers["x-forwarded-for"];
  const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const firstChunk = (forwardedIp || request.ip || request.socket.remoteAddress || "unknown").toString().split(",")[0];
  const ip = (firstChunk ?? "unknown").trim() || "unknown";
  return `${routeName}:${ip}`;
}

function isAuthRateLimited(request: Request, routeName: string): boolean {
  const now = Date.now();
  const key = authRateLimitKey(request, routeName);
  const existing = authAttemptBuckets.get(key);

  if (!existing || existing.resetAt <= now) {
    authAttemptBuckets.set(key, { count: 1, resetAt: now + AUTH_RATE_LIMIT_WINDOW_MS });
    return false;
  }

  existing.count += 1;
  authAttemptBuckets.set(key, existing);
  return existing.count > AUTH_RATE_LIMIT_MAX_ATTEMPTS;
}

function clearAuthRateLimitBucket(request: Request, routeName: string): void {
  authAttemptBuckets.delete(authRateLimitKey(request, routeName));
}

function clampInteger(rawValue: unknown, min: number, max: number, fallback: number): number {
  const source = typeof rawValue === "number" ? rawValue : Number(readString(rawValue));
  if (!Number.isFinite(source)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(source)));
}

function clampOptionalInteger(rawValue: unknown, min: number, max: number): number | null {
  const raw = readString(rawValue);
  if (!raw) {
    return null;
  }
  const source = Number(raw);
  if (!Number.isFinite(source)) {
    return null;
  }
  return Math.max(min, Math.min(max, Math.floor(source)));
}

function fallbackBatchImageByIndex(index: number): string {
  void index;
  return "";
}

async function issueUserSession(userId: string, response: Response): Promise<{ expiresAt: Date }> {
  const token = createUserSessionToken();
  const tokenHash = hashUserSessionToken(token, USER_SESSION_SECRET);
  const expiresAt = new Date(Date.now() + USER_SESSION_HOURS * 60 * 60 * 1000);

  await prisma.userSession.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  setUserSessionCookie(response, token, expiresAt);
  return { expiresAt };
}

type AuthenticatedUserSession = {
  sessionId: string;
  expiresAt: Date;
  user: {
    id: string;
    email: string;
    displayName: string | null;
    plan: UserPlan;
    emailVerifiedAt: Date | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    lastLoginAt: Date | null;
  };
};

async function getAuthenticatedUserSession(request: Request): Promise<AuthenticatedUserSession | null> {
  const token = extractCookieToken(request, USER_SESSION_COOKIE_NAME);
  if (!token) {
    return null;
  }

  const tokenHash = hashUserSessionToken(token, USER_SESSION_SECRET);
  const session = await prisma.userSession.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          plan: true,
          emailVerifiedAt: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          lastLoginAt: true,
        },
      },
    },
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt.getTime() <= Date.now() || !session.user.isActive) {
    await prisma.userSession.deleteMany({ where: { id: session.id } });
    return null;
  }

  return {
    sessionId: session.id,
    expiresAt: session.expiresAt,
    user: session.user,
  };
}

async function getPollVoteCountMap(pollId: string): Promise<Map<string, number>> {
  const grouped = await prisma.pollVote.groupBy({
    by: ["optionId"],
    where: { pollId },
    _count: { _all: true },
  });

  return new Map(grouped.map((entry) => [entry.optionId, entry._count._all]));
}

function normalizeVoteReasonInput(raw: unknown): string | null {
  const reason = readString(raw)
    .replace(/\uFFFD/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!reason) {
    return null;
  }

  if (reason.length < 8) {
    throw new Error("Tu explicacion debe tener al menos 8 caracteres.");
  }

  if (reason.length > 360) {
    throw new Error("Tu explicacion no puede superar 360 caracteres.");
  }

  return reason;
}

async function getRecentPollReasons(pollId: string, limit = 12): Promise<PollReasonPublic[]> {
  const rows = await prisma.pollVote.findMany({
    where: {
      pollId,
      reasonText: {
        not: null,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
    select: {
      id: true,
      optionId: true,
      reasonText: true,
      createdAt: true,
      option: {
        select: {
          label: true,
          colorHex: true,
        },
      },
    },
  });

  return rows
    .filter((row) => Boolean(row.reasonText && row.reasonText.trim().length > 0))
    .map((row) => ({
      id: row.id,
      optionId: row.optionId,
      optionLabel: row.option.label,
      optionColorHex: row.option.colorHex ?? "#c8a64f",
      text: (row.reasonText ?? "").trim(),
      createdAt: row.createdAt.toISOString(),
    }));
}

async function replacePollVotesWithHardcodedBase(pollId: string): Promise<{
  totalVotes: number;
  perCandidate: Array<{ label: string; votes: number }>;
}> {
  const options = await prisma.pollOption.findMany({
    where: { pollId },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      label: true,
      sortOrder: true,
      colorHex: true,
      emoji: true,
    },
  });

  if (options.length === 0) {
    throw new Error("La encuesta no tiene candidatos cargados.");
  }

  const perCandidate = options.map((option) => ({
    label: option.label,
    votes: hardcodedVoteCountForLabel(option.label),
  }));
  const totalVotes = perCandidate.reduce((acc, item) => acc + item.votes, 0);
  const batchKey = Date.now();

  await prisma.$transaction(async (tx) => {
    await tx.pollVote.deleteMany({
      where: { pollId },
    });

    for (const option of options) {
      const template = fixedCandidateTemplateForLabel(option.label);
      if (
        template &&
        (option.label !== template.label || option.colorHex !== template.colorHex || option.emoji !== template.emoji)
      ) {
        await tx.pollOption.update({
          where: { id: option.id },
          data: {
            label: template.label,
            colorHex: template.colorHex,
            emoji: template.emoji,
          },
        });
      }

      const votes = hardcodedVoteCountForLabel(option.label);
      if (votes <= 0) {
        continue;
      }

      await tx.pollVote.createMany({
        data: Array.from({ length: votes }, (_unused, voteIndex) => ({
          pollId,
          optionId: option.id,
          voterHash: `hardcoded-${batchKey}-${option.sortOrder}-${voteIndex + 1}`,
          sourceRef: "hardcoded-import",
        })),
      });
    }
  });

  return { totalVotes, perCandidate };
}

async function buildPollPublicPayloadBySlug(slug: string) {
  const poll = await prisma.poll.findUnique({
    where: { slug },
    include: {
      options: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!poll) {
    return null;
  }

  const [voteMap, recentReasons] = await Promise.all([getPollVoteCountMap(poll.id), getRecentPollReasons(poll.id)]);
  const snapshot = buildPollSnapshot(poll.options, voteMap);
  return toPollPublicView(poll, snapshot, recentReasons);
}

async function buildBackofficePollRows(): Promise<BackofficePollListItem[]> {
  const polls = await prisma.poll.findMany({
    orderBy: [{ isFeatured: "desc" }, { updatedAt: "desc" }],
    include: {
      options: {
        orderBy: { sortOrder: "asc" },
      },
    },
    take: 300,
  });

  if (polls.length === 0) {
    return [];
  }

  const voteCounts = await prisma.pollVote.groupBy({
    by: ["pollId", "optionId"],
    where: {
      pollId: { in: polls.map((poll) => poll.id) },
    },
    _count: { _all: true },
  });

  const pollVoteMap = new Map<string, Map<string, number>>();
  for (const entry of voteCounts) {
    const existing = pollVoteMap.get(entry.pollId) ?? new Map<string, number>();
    existing.set(entry.optionId, entry._count._all);
    pollVoteMap.set(entry.pollId, existing);
  }

  return polls.map((poll) => {
    const snapshot = buildPollSnapshot(poll.options, pollVoteMap.get(poll.id) ?? new Map<string, number>());
    return {
      id: poll.id,
      title: poll.title,
      slug: poll.slug,
      publicUrl: pollPublicUrl(poll.slug),
      question: poll.question,
      status: poll.status,
      isFeatured: poll.isFeatured,
      publishedAt: poll.publishedAt,
      updatedAt: poll.updatedAt,
      totalVotes: snapshot.totalVotes,
      leaderLabel: snapshot.leader?.label ?? null,
    };
  });
}

async function buildBackofficeUserRows(): Promise<BackofficeUserListItem[]> {
  const users = await prisma.user.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: {
      _count: {
        select: {
          sessions: {
            where: {
              expiresAt: { gt: new Date() },
            },
          },
        },
      },
    },
    take: 600,
  });

  return users.map((user) => ({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    plan: user.plan,
    isActive: user.isActive,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    activeSessions: user._count.sessions,
  }));
}

function normalizedFrontendBaseUrl(): string {
  return FRONTEND_PUBLIC_URL.startsWith("http://") || FRONTEND_PUBLIC_URL.startsWith("https://")
    ? FRONTEND_PUBLIC_URL
    : `https://${FRONTEND_PUBLIC_URL}`;
}

function pollPublicUrl(slug: string): string {
  return `${normalizedFrontendBaseUrl().replace(/\/+$/, "")}/encuestas/${slug}`;
}

type BatchNewsFormState = {
  totalItems: number;
  campaignPercent: number;
  campaignTopic: string;
  generalBrief: string;
  useResearchAgent: boolean;
  includeCampaignLine: boolean;
  campaignLine: string;
  publishStatus: NewsStatus;
  sectionHint: string;
  provinceHint: string;
  requireImageUrl: boolean;
  defaultSourceName: string;
  defaultAuthorName: string;
  defaultSourceUrl: string;
  summary?: string;
};

type ExternalRewriteFormState = {
  instruction: string;
  limit: number;
  scope: "mixed" | "existing" | "feed";
  publishStatus: NewsStatus;
  sectionHint: string;
  provinceHint: string;
  includeCampaignLine: boolean;
  campaignLine: string;
  deleteDuplicates: boolean;
  summary?: string;
};

type EditorialCommandPreviewState = {
  summary: string;
  notes: string[];
  destructive: boolean;
  requiresConfirmation: boolean;
  operations: Array<{
    kind: string;
    title: string;
    detail: string;
  }>;
  model: string;
};

type EditorialCommandFormState = {
  instruction: string;
  campaignLine: string;
  allowDestructive: boolean;
  autoExecuteSafe: boolean;
  summary?: string;
  planJson?: string;
  preview?: EditorialCommandPreviewState | null;
  quantityHint?: number | null;
  history?: EditorialCommandChatMessage[];
  logs?: EditorialCommandLogEntry[];
  pendingPlan?: {
    summary: string;
    planJson: string;
    destructive: boolean;
    requiresConfirmation: boolean;
  } | null;
};

type AutopilotRunSummary = {
  executedAt: string;
  planSummary: string;
  executionSummary: string;
  socialSummary: string | null;
};

function defaultBatchNewsFormState(): BatchNewsFormState {
  return {
    totalItems: 1,
    campaignPercent: 0,
    campaignTopic: "",
    generalBrief: "",
    useResearchAgent: true,
    includeCampaignLine: true,
    campaignLine: "",
    publishStatus: NewsStatus.DRAFT,
    sectionHint: "",
    provinceHint: "",
    requireImageUrl: true,
    defaultSourceName: "Pulso Pais IA",
    defaultAuthorName: "Redaccion Pulso Pais",
    defaultSourceUrl: "",
  };
}

function defaultExternalRewriteFormState(campaignLine = ""): ExternalRewriteFormState {
  return {
    instruction:
      "Convierte las noticias externas relevantes en notas propias de Pulso Pais, manteniendo hechos, reformulando la redaccion a nuestra editorial y asegurando portada con imagen valida.",
    limit: 6,
    scope: "mixed",
    publishStatus: NewsStatus.DRAFT,
    sectionHint: "",
    provinceHint: "",
    includeCampaignLine: true,
    campaignLine,
    deleteDuplicates: false,
  };
}

function defaultEditorialCommandFormState(campaignLine = ""): EditorialCommandFormState {
  return {
    instruction:
      "Revisa las notas externas del sitio, internaliza las mas relevantes como noticias propias de Pulso Pais y deja las candidatas listas para revision.",
    campaignLine,
    allowDestructive: false,
    autoExecuteSafe: true,
    quantityHint: null,
    summary: "",
    planJson: "",
    preview: null,
    history: [],
    logs: [],
    pendingPlan: null,
  };
}

function resolveEditorialCommandTemplate(template: string, campaignLine = ""): Partial<EditorialCommandFormState> {
  switch (template.trim().toLowerCase()) {
    case "internalize":
      return {
        instruction:
          "Revisa las noticias externas del sitio, prioriza las mas relevantes y conviertelas en notas propias de Pulso Pais con imagen valida, contexto adicional y tono editorial consistente.",
        campaignLine,
        allowDestructive: false,
        autoExecuteSafe: true,
        quantityHint: 4,
      };
    case "cleanup":
      return {
        instruction:
          "Elimina todas las noticias de prueba y deja el medio listo para empezar a publicar solo noticias reales propias basadas en fuentes externas. Antes de ejecutar, explicame el alcance y prepara confirmacion obligatoria.",
        campaignLine,
        allowDestructive: true,
        autoExecuteSafe: false,
        quantityHint: null,
      };
    case "coverage":
      return {
        instruction:
          "Investiga la agenda politica argentina mas caliente del momento y genera varias notas propias de Pulso Pais con foto valida, foco en impacto real y continuidad federal.",
        campaignLine,
        allowDestructive: false,
        autoExecuteSafe: true,
        quantityHint: 4,
      };
    case "status":
      return {
        instruction:
          "Explicame que estas haciendo ahora, que logs recientes tienes, que pendientes detectas en el CMS y cuales son las mejores 3 oportunidades editoriales inmediatas.",
        campaignLine,
        allowDestructive: false,
        autoExecuteSafe: false,
        quantityHint: null,
      };
    default:
      return {};
  }
}

function renderDashboardActionIcon(name: "create" | "internalize" | "cleanup" | "autopilot" | "users"): string {
  switch (name) {
    case "create":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"></path><path d="M5 12h14"></path><rect x="4" y="4" width="16" height="16" rx="4"></rect></svg>`;
    case "internalize":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6"></path><path d="M10 20H4v-6"></path><path d="m20 4-8 8"></path><path d="m4 20 8-8"></path></svg>`;
    case "cleanup":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M7 7l1 12h8l1-12"></path><path d="M10 11v5"></path><path d="M14 11v5"></path></svg>`;
    case "autopilot":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l2.2 4.7L19 10l-3.5 3.4.8 4.8L12 16l-4.3 2.2.8-4.8L5 10l4.8-1.3L12 4Z"></path></svg>`;
    case "users":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.25"></circle><path d="M3.5 19a5.5 5.5 0 0 1 11 0"></path><circle cx="17.25" cy="9.5" r="2.5"></circle><path d="M15 18.5a4.5 4.5 0 0 1 6 0"></path></svg>`;
  }
}

function createEditorialChatId(prefix = "chat"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatEditorialChatMemory(history: EditorialCommandChatMessage[], logs: EditorialCommandLogEntry[]): string {
  const historyText = history
    .slice(-10)
    .map((item) => `[${item.role.toUpperCase()}|${item.kind}] ${item.text}`)
    .join("\n");
  const logText = logs
    .slice(-8)
    .map((item) => `[${item.level.toUpperCase()}] ${item.title} :: ${item.detail}`)
    .join("\n");
  return [historyText ? `HISTORIAL:\n${historyText}` : "", logText ? `LOGS:\n${logText}` : ""].filter(Boolean).join("\n\n");
}

function appendChatHistory(
  current: EditorialCommandChatMessage[],
  entry: Omit<EditorialCommandChatMessage, "id" | "createdAt"> & { createdAt?: string; id?: string },
): EditorialCommandChatMessage[] {
  const nextEntry: EditorialCommandChatMessage = {
    id: entry.id ?? createEditorialChatId("msg"),
    createdAt: entry.createdAt ?? new Date().toISOString(),
    role: entry.role,
    kind: entry.kind,
    text: entry.text,
  };
  if (entry.meta) {
    nextEntry.meta = entry.meta;
  }
  return [
    ...current,
    nextEntry,
  ].slice(-24);
}

function appendChatLog(
  current: EditorialCommandLogEntry[],
  entry: Omit<EditorialCommandLogEntry, "id" | "createdAt"> & { createdAt?: string; id?: string },
): EditorialCommandLogEntry[] {
  return [
    ...current,
    {
      id: entry.id ?? createEditorialChatId("log"),
      createdAt: entry.createdAt ?? new Date().toISOString(),
      level: entry.level,
      title: entry.title,
      detail: entry.detail,
    },
  ].slice(-40);
}

function normalizeExternalRewriteScope(raw: unknown): ExternalRewriteFormState["scope"] {
  const value = readString(raw).toLowerCase();
  if (value === "existing") {
    return "existing";
  }
  if (value === "feed") {
    return "feed";
  }
  return "mixed";
}

function normalizeExternalKey(url: string | null | undefined): string {
  return (normalizeHttpUrl(url) ?? "").replace(/\/+$/, "").toLowerCase();
}

function isLikelyThinExternalNews(item: {
  sourceUrl?: string | null;
  body?: string | null;
  imageUrl?: string | null;
}): boolean {
  const hasExternalSource = normalizeExternalKey(item.sourceUrl).length > 0;
  const bodyLength = readString(item.body).length;
  const hasImage = Boolean(normalizeImageUrl(item.imageUrl));
  return hasExternalSource && (bodyLength < 900 || !hasImage);
}

function encodeEditorialCommandPlan(plan: EditorialCommandPlan): string {
  return Buffer.from(JSON.stringify(plan), "utf8").toString("base64url");
}

function decodeEditorialCommandPlan(input: string): EditorialCommandPlan {
  try {
    const raw = Buffer.from(input, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as Partial<EditorialCommandPlan>;
    if (!parsed || typeof parsed.summary !== "string" || !Array.isArray(parsed.operations) || typeof parsed.model !== "string") {
      throw new Error("Plan incompleto.");
    }
    return parsed as EditorialCommandPlan;
  } catch (error) {
    throw new Error(`No se pudo leer el plan editorial (${(error as Error).message}).`);
  }
}

function describeEditorialCommandOperation(operation: EditorialCommandOperation): { title: string; detail: string } {
  if (operation.kind === "CREATE_STORIES") {
    return {
      title: `Crear ${operation.count} noticia${operation.count === 1 ? "" : "s"}`,
      detail: `${operation.useResearchAgent ? "Modo periodista" : "Generacion directa"} &middot; ${operation.publishStatus ?? "DRAFT"} &middot; ${operation.requireImageUrl ? "con portada obligatoria" : "media opcional"}`,
    };
  }
  if (operation.kind === "INTERNALIZE_EXTERNALS") {
    return {
      title: `Internalizar externas (${operation.limit})`,
      detail: `${operation.scope} &middot; ${operation.publishStatus ?? "DRAFT"}${operation.deleteDuplicates ? " &middot; limpiar duplicados" : ""}`,
    };
  }
  if (operation.kind === "REWRITE_EXISTING") {
    return {
      title: `Reescribir notas existentes (${operation.limit})`,
      detail: `match: ${operation.match} &middot; ${operation.useResearchAgent ? "con investigacion" : "sin investigacion"}`,
    };
  }
  if (operation.kind === "UPDATE_METADATA") {
    const activeFields = [
      operation.fields.kicker ? "volanta" : "",
      operation.fields.section ? "seccion" : "",
      operation.fields.province ? "distrito" : "",
      operation.fields.status ? "estado" : "",
      operation.fields.isFeatured !== null ? "destacada" : "",
      operation.fields.isHero !== null ? "hero" : "",
      operation.fields.isSponsored !== null ? "patrocinio" : "",
      operation.fields.isInterview !== null ? "entrevista" : "",
      operation.fields.isOpinion !== null ? "opinion" : "",
      operation.fields.isRadar !== null ? "radar" : "",
      operation.fields.authorName ? "autor" : "",
      operation.fields.sourceName ? "fuente" : "",
      operation.fields.addTags.length > 0 || operation.fields.removeTags.length > 0 ? "tags" : "",
    ]
      .filter(Boolean)
      .join(", ");
    return {
      title: `Actualizar metadatos (${operation.limit})`,
      detail: `match: ${operation.match}${activeFields ? ` &middot; ${activeFields}` : ""}`,
    };
  }
  return {
    title: `Borrar noticias (${operation.limit})`,
    detail: `match: ${operation.match}${operation.onlyThinExternal ? " &middot; solo thin external" : ""}`,
  };
}

function previewEditorialCommandPlan(plan: EditorialCommandPlan): EditorialCommandPreviewState {
  return {
    summary: plan.summary,
    notes: Array.isArray(plan.notes) ? plan.notes.slice(0, 8) : [],
    destructive: Boolean(plan.destructive),
    requiresConfirmation: Boolean(plan.requiresConfirmation),
    operations: plan.operations.map((operation) => ({
      kind: operation.kind,
      ...describeEditorialCommandOperation(operation),
    })),
    model: plan.model,
  };
}

function buildAutopilotInstruction(settings: Awaited<ReturnType<typeof getEditorialAutopilotSettings>>): string {
  const shouldPublish = resolveAutopilotShouldPublish(settings);
  const guidance = [
    settings.instruction,
    settings.temporalPrompt,
    "Opera como radar, reportero, editor y estilista de marca; compliance manda sobre el resto.",
    `Limite operativo por corrida: hasta ${settings.maxStoriesPerRun} piezas nuevas o reformuladas.`,
    settings.internalizeLimit > 0
      ? `Si detectas thin external o enlaces a portales, internaliza hasta ${settings.internalizeLimit} primero.`
      : "No internalices notas externas en esta corrida salvo que la instruccion lo exija.",
    shouldPublish
      ? "Si la evidencia y la portada son suficientes, deja las notas listas para PUBLISHED."
      : "Trabaja conservadoramente y deja las notas nuevas en DRAFT.",
    settings.allowDelete
      ? "Puedes proponer depuracion o borrado si esta claramente justificado."
      : "No borres contenidos; si ves ruido, reescribe o actualiza en lugar de eliminar.",
    "Prioriza evidencia, novedad, impacto nacional, continuidad federal, claridad editorial y consecuencias reales.",
    "No dejes enlaces externos como destino principal si puedes internalizar la historia.",
  ];

  return guidance.filter(Boolean).join(" ");
}

function getBuenosAiresNowParts(baseDate = new Date()): { dateKey: string; hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(baseDate);
  const byType = new Map(parts.map((item) => [item.type, item.value]));
  const year = byType.get("year") ?? "0000";
  const month = byType.get("month") ?? "01";
  const day = byType.get("day") ?? "01";
  const hour = Number(byType.get("hour") ?? "0");
  const minute = Number(byType.get("minute") ?? "0");
  return {
    dateKey: `${year}-${month}-${day}`,
    hour,
    minute,
  };
}

function buildBuenosAiresDate(dateKey: string, hour: number, minute = 0): Date {
  return new Date(`${dateKey}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-03:00`);
}

function computeNextAutopilotRunAt(params: {
  settings: Awaited<ReturnType<typeof getEditorialAutopilotSettings>>;
  now?: Date;
  nowParts?: ReturnType<typeof getBuenosAiresNowParts>;
  remainingToday?: number;
}): string | null {
  const settings = params.settings;
  if (!settings.enabled || settings.mode === "MANUAL") {
    return null;
  }

  const now = params.now ?? new Date();
  const nowParts = params.nowParts ?? getBuenosAiresNowParts(now);
  const windowStart = Math.max(0, Math.min(23, settings.windowStartHour));
  const windowEnd = Math.max(windowStart, Math.min(23, settings.windowEndHour));
  const remainingToday = Math.max(0, params.remainingToday ?? settings.todayTarget);

  const currentMinuteOfDay = nowParts.hour * 60 + nowParts.minute;
  const windowStartMinute = windowStart * 60;
  const windowEndMinute = windowEnd * 60 + 59;
  const lastRunParts = settings.lastRunAt ? getBuenosAiresNowParts(new Date(settings.lastRunAt)) : null;
  const alreadyRanToday = Boolean(lastRunParts && lastRunParts.dateKey === nowParts.dateKey);

  if (currentMinuteOfDay < windowStartMinute) {
    return buildBuenosAiresDate(nowParts.dateKey, windowStart, 0).toISOString();
  }

  if (currentMinuteOfDay > windowEndMinute || remainingToday <= 0) {
    const nextDay = new Date(buildBuenosAiresDate(nowParts.dateKey, 12, 0).getTime() + 24 * 60 * 60 * 1000);
    const nextParts = getBuenosAiresNowParts(nextDay);
    return buildBuenosAiresDate(nextParts.dateKey, windowStart, 0).toISOString();
  }

  if (!alreadyRanToday) {
    return new Date(now.getTime() + 5_000).toISOString();
  }

  const maxStoriesPerRun = Math.max(1, settings.maxStoriesPerRun);
  const runsRemaining = Math.max(1, Math.ceil(remainingToday / maxStoriesPerRun));
  const minutesLeft = Math.max(1, windowEndMinute - currentMinuteOfDay);
  const spacing = Math.max(8, Math.floor(minutesLeft / (runsRemaining + 1)));
  const nextMinute = Math.min(windowEndMinute, currentMinuteOfDay + spacing);
  return buildBuenosAiresDate(nowParts.dateKey, Math.floor(nextMinute / 60), nextMinute % 60).toISOString();
}

function randomIntInRange(minValue: number, maxValue: number): number {
  const min = Math.min(minValue, maxValue);
  const max = Math.max(minValue, maxValue);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function resolveAutopilotShouldPublish(settings: Awaited<ReturnType<typeof getEditorialAutopilotSettings>>): boolean {
  return settings.mode === "AUTO" || settings.autoPublishSite;
}

function applyAutopilotPolicyToPlan(
  plan: EditorialCommandPlan,
  settings: Awaited<ReturnType<typeof getEditorialAutopilotSettings>>,
): EditorialCommandPlan {
  const maxStories = Math.max(1, settings.maxStoriesPerRun);
  const internalizeLimit = Math.max(0, settings.internalizeLimit);
  const publishStatus = resolveAutopilotShouldPublish(settings) ? NewsStatus.PUBLISHED : NewsStatus.DRAFT;

  return {
    ...plan,
    destructive: settings.allowDelete ? plan.destructive : false,
    requiresConfirmation: settings.allowDelete ? plan.requiresConfirmation : false,
    operations: plan.operations
      .filter((operation) => settings.allowDelete || operation.kind !== "DELETE_NEWS")
      .map((operation) => {
        if (operation.kind === "CREATE_STORIES") {
          return {
            ...operation,
            count: Math.max(1, Math.min(operation.count, maxStories)),
            publishStatus,
            requireImageUrl: true,
            useResearchAgent: true,
            includeCampaignLine: true,
          } satisfies EditorialCommandOperation;
        }
        if (operation.kind === "INTERNALIZE_EXTERNALS") {
          return {
            ...operation,
            limit: Math.max(1, Math.min(operation.limit, internalizeLimit || maxStories)),
            publishStatus,
            includeCampaignLine: true,
            deleteDuplicates: settings.allowDelete ? operation.deleteDuplicates : false,
          } satisfies EditorialCommandOperation;
        }
        if (operation.kind === "REWRITE_EXISTING") {
          return {
            ...operation,
            limit: Math.max(1, Math.min(operation.limit, maxStories)),
            publishStatus,
            requireImageUrl: true,
            useResearchAgent: true,
            includeCampaignLine: true,
          } satisfies EditorialCommandOperation;
        }
        return operation;
      }),
  };
}

function summarizeInstagramAccounts(accounts: InstagramManagedAccount[]): string {
  if (accounts.length === 0) {
    return "Sin cuentas de Instagram detectadas por el token actual.";
  }
  return accounts
    .slice(0, 4)
    .map((item) => {
      const username = item.instagramUsername ? `@${item.instagramUsername}` : item.instagramAccountId;
      return `${username} (${item.pageName})`;
    })
    .join(" | ");
}

function renderBatchNewsForm(params: {
  state?: Partial<BatchNewsFormState>;
  error?: string;
  summary?: string;
  aiResearch?: Awaited<ReturnType<typeof getAiResearchSettings>>;
}): string {
  const current = {
    ...defaultBatchNewsFormState(),
    campaignLine: params.aiResearch?.campaignLine ?? "",
    ...(params.state ?? {}),
  };
  const researchEnabledInSystem = params.aiResearch?.enabled ?? true;
  const error = params.error ? `<div class="error">${currentErrorSafe(params.error)}</div>` : "";
  const summary = params.summary
    ? `<div class="flash"><strong>Resumen IA:</strong> ${currentErrorSafe(params.summary)}</div>`
    : "";
  const sectionOptions = [
    `<option value="">Sin forzar (IA decide)</option>`,
    ...SECTION_OPTIONS.map(
      (option) =>
        `<option value="${option.value}" ${current.sectionHint === option.value ? "selected" : ""}>${option.label}</option>`,
    ),
  ].join("");
  const provinceOptions = [
    `<option value="">Sin forzar (IA decide)</option>`,
    ...PROVINCE_OPTIONS.map(
      (option) =>
        `<option value="${option.value}" ${current.provinceHint === option.value ? "selected" : ""}>${option.label}</option>`,
    ),
  ].join("");

  return backofficeShell(
    "Noticias en lote",
    `<div class="grid">
      <div class="card">
        <div class="split-title">
          <h3>Generacion IA (1 nota o lote)</h3>
          <span class="mini-tag">CMS + Agente periodista</span>
        </div>
        <p style="margin:0; color:#a9a9a9; line-height:1.5;">
          Usa un solo flujo para crear 1 nota (cantidad=1) o muchas notas en lote. Puedes activar investigacion periodistica para tomar agenda caliente y reescribir en tono Pulso Pais.
        </p>
        <p style="margin:0; color:#8f8f8f; line-height:1.45; font-size:12px;">
          Estado agente periodista: <strong>${researchEnabledInSystem ? "ACTIVO" : "DESACTIVADO"}</strong>
          ${
            params.aiResearch
              ? ` | fuentes:${params.aiResearch.hotNewsLimit} | lectura:${params.aiResearch.fetchArticleText ? "texto completo" : "titulares"} | crop:${
                  params.aiResearch.cropImage ? `${params.aiResearch.cropWidth}x${params.aiResearch.cropHeight}` : "OFF"
                }`
              : ""
          }
        </p>
        ${error}
        ${summary}
        <form method="post" action="/backoffice/news/batch" style="margin-top:14px;">
          <div class="card" style="padding:12px; border-style:dashed;">
            <div class="checks">
              <label>
                <input type="checkbox" name="useResearchAgent" ${current.useResearchAgent ? "checked" : ""} ${
      researchEnabledInSystem ? "" : "disabled"
    } />
                Modo periodista (investiga agenda caliente y genera nota propia)
              </label>
              <label>
                <input type="checkbox" name="includeCampaignLine" ${current.includeCampaignLine ? "checked" : ""} />
                Incluir bajada editorial/campana en la corrida
              </label>
            </div>
            <div class="field">
              <label for="campaignLine">Bajada editorial / campana activa (opcional)</label>
              <textarea id="campaignLine" name="campaignLine" rows="2" placeholder="Ej: consolidar presencia territorial en conurbano con foco en gestion y empleo.">${currentErrorSafe(
                current.campaignLine,
              )}</textarea>
            </div>
            ${
              researchEnabledInSystem
                ? ""
                : `<p class="hint" style="margin:0;">Activa el agente periodista en <a href="/backoffice#theme-control">Panel / Control de portada</a> para usar investigacion automatica.</p>`
            }
          </div>
          <div class="cols-2">
            <div class="field">
              <label for="totalItems">Cantidad total</label>
              <input id="totalItems" name="totalItems" type="number" min="1" max="40" value="${current.totalItems}" required />
              <p class="hint">Deja <strong>1</strong> para nota individual autogenerada.</p>
            </div>
            <div class="field">
              <label for="campaignPercent">Porcentaje campana (%)</label>
              <input id="campaignPercent" name="campaignPercent" type="number" min="0" max="100" value="${current.campaignPercent}" required />
              <p id="batchSplit" class="hint"></p>
            </div>
          </div>
          <div class="field">
            <label for="campaignTopic">Tema de campana (bloque estrategico)</label>
            <textarea id="campaignTopic" name="campaignTopic" rows="3" placeholder="Ej: cierre de alianzas y armados seccionales en PBA para 2027.">${currentErrorSafe(
              current.campaignTopic,
            )}</textarea>
          </div>
          <div class="field">
            <label for="generalBrief">Brief general para el resto de noticias</label>
            <textarea id="generalBrief" name="generalBrief" rows="4" placeholder="Ej: agenda nacional, economica, provincias clave, municipios y radar electoral de la semana.">${currentErrorSafe(
              current.generalBrief,
            )}</textarea>
          </div>
          <div class="cols-2">
            <div class="field">
              <label for="publishStatus">Estado de publicacion</label>
              <select id="publishStatus" name="publishStatus">
                <option value="DRAFT" ${current.publishStatus === NewsStatus.DRAFT ? "selected" : ""}>DRAFT</option>
                <option value="PUBLISHED" ${current.publishStatus === NewsStatus.PUBLISHED ? "selected" : ""}>PUBLISHED</option>
              </select>
            </div>
            <div class="field">
              <label for="sectionHint">Seccion sugerida base</label>
              <select id="sectionHint" name="sectionHint">${sectionOptions}</select>
            </div>
          </div>
          <div class="cols-2">
            <div class="field">
              <label for="provinceHint">Distrito sugerido base</label>
              <select id="provinceHint" name="provinceHint">${provinceOptions}</select>
            </div>
            <div class="field">
              <label for="defaultSourceName">Fuente por defecto (fallback)</label>
              <input id="defaultSourceName" name="defaultSourceName" value="${currentErrorSafe(current.defaultSourceName)}" />
            </div>
          </div>
          <div class="cols-2">
            <div class="field">
              <label for="defaultAuthorName">Autor por defecto (fallback)</label>
              <input id="defaultAuthorName" name="defaultAuthorName" value="${currentErrorSafe(current.defaultAuthorName)}" />
            </div>
            <div class="field">
              <label for="defaultSourceUrl">URL fuente por defecto (opcional)</label>
              <input id="defaultSourceUrl" name="defaultSourceUrl" placeholder="https://..." value="${currentErrorSafe(current.defaultSourceUrl)}" />
            </div>
          </div>
          <label style="display:inline-flex; gap:8px; align-items:center; font-size:13px; color:#dcdcdc;">
            <input type="checkbox" name="requireImageUrl" ${current.requireImageUrl ? "checked" : ""} />
            Exigir foto en todas las noticias (si falta, usa imagen fallback).
          </label>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="primary" type="submit">Generar y crear (1 o lote)</button>
            <a class="button" href="/backoffice/news/new">Editor manual (formulario completo)</a>
          </div>
        </form>
        <script>
          (function () {
            const totalInput = document.getElementById("totalItems");
            const percentInput = document.getElementById("campaignPercent");
            const target = document.getElementById("batchSplit");
            if (!totalInput || !percentInput || !target) return;
            function refresh() {
              const total = Math.max(1, Math.min(40, Number(totalInput.value || 1)));
              const pct = Math.max(0, Math.min(100, Number(percentInput.value || 0)));
              const campaign = Math.round((total * pct) / 100);
              const normal = total - campaign;
              target.textContent = "Distribucion estimada: " + campaign + " campana / " + normal + " agenda general.";
            }
            totalInput.addEventListener("input", refresh);
            percentInput.addEventListener("input", refresh);
            refresh();
          })();
        </script>
      </div>
    </div>`,
  );
}

function currentErrorSafe(value: string): string {
  return value.replace(/[&<>"]/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return char;
    }
  });
}

async function renderUnifiedEditorialPage(params?: {
  activeMode?: "single" | "batch" | "rewrite" | "command";
  error?: string;
  data?: Partial<Prisma.NewsUncheckedCreateInput>;
  batchState?: Partial<BatchNewsFormState>;
  rewriteState?: Partial<ExternalRewriteFormState>;
  commandState?: Partial<EditorialCommandFormState>;
}): Promise<string> {
  const [aiResearch, chatState] = await Promise.all([
    getAiResearchSettings(prisma),
    getEditorialCommandChatState(prisma),
  ]);
  let pendingPlan: EditorialCommandFormState["pendingPlan"] = null;
  if (chatState.pendingPlanJson) {
    try {
      const parsedPending = decodeEditorialCommandPlan(chatState.pendingPlanJson);
      pendingPlan = {
        summary: parsedPending.summary,
        planJson: chatState.pendingPlanJson,
        destructive: parsedPending.destructive,
        requiresConfirmation: parsedPending.requiresConfirmation,
      };
    } catch {
      pendingPlan = null;
    }
  }
  const renderParams: Parameters<typeof renderNewsForm>[0] = {
    mode: "create",
    action: "/backoffice/news",
    aiResearch,
    editorialStudio: {
      activeMode: params?.activeMode ?? "command",
      batch: {
        ...defaultBatchNewsFormState(),
        campaignLine: aiResearch.campaignLine,
        ...(params?.batchState ?? {}),
      },
      rewrite: {
        ...defaultExternalRewriteFormState(aiResearch.campaignLine),
        ...(params?.rewriteState ?? {}),
      },
      command: {
        ...defaultEditorialCommandFormState(aiResearch.campaignLine),
        history: chatState.history,
        logs: chatState.logs,
        pendingPlan,
        ...(params?.commandState ?? {}),
      },
    },
  };

  if (params?.error) {
    renderParams.error = params.error;
  }
  if (params?.data) {
    renderParams.data = params.data as Partial<News>;
  }

  return renderNewsForm(renderParams);
}

app.set("trust proxy", 1);
const apiCors = cors({
  origin(origin, callback) {
    if (!origin || isOriginAllowed(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Origen no permitido por CORS"));
  },
  credentials: true,
});

app.use("/api", apiCors);
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "script-src": ["'self'", "'unsafe-inline'"],
      },
    },
  }),
);
app.use(morgan(IS_PRODUCTION ? "combined" : "dev"));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(cookieParser());

app.get("/health", (_request, response) => {
  response.json({
    status: "ok",
    service: "pulso-backend",
    now: new Date().toISOString(),
  });
});

app.get("/api/version", (_request, response) => {
  response.json(buildBackendVersionInfo());
});

app.get("/api/deploy/status", async (_request, response, next) => {
  try {
    response.json(await buildDeployStatusPayload());
  } catch (error) {
    next(error);
  }
});

app.get("/api/autopilot/status", async (_request, response, next) => {
  try {
    await ensureAutopilotDueRun("status");
    const [autopilot, instagram] = await Promise.all([
      getEditorialAutopilotSettings(prisma),
      getInstagramPublishingSettings(prisma),
    ]);
    response.json({
      autopilot,
      instagram: {
        ...instagram,
        captionTemplate: undefined,
      },
      configured: {
        autopilotSecret: Boolean(AUTOPILOT_RUN_SECRET),
        instagramToken: Boolean(readString(process.env.INSTAGRAM_GRAPH_ACCESS_TOKEN)),
        heartbeatEnabled: AUTOPILOT_HEARTBEAT_ENABLED,
        heartbeatMinutes: AUTOPILOT_HEARTBEAT_MINUTES,
      },
      schedule: {
        nextRunAt: autopilot.nextRunAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/autopilot/run", async (request, response, next) => {
  try {
    const secret = readString(request.query.secret);
    if (!AUTOPILOT_RUN_SECRET || secret !== AUTOPILOT_RUN_SECRET) {
      response.status(403).json({ error: "Secret invalido para autopiloto." });
      return;
    }
    const result = await runEditorialAutopilotCycle("cron");
    response.json({ ok: true, result });
  } catch (error) {
    next(error);
  }
});

app.get("/api/home", async (_request, response, next) => {
  try {
    const payload = await buildHomePayload(prisma);
    response.json(payload);
  } catch (error) {
    next(error);
  }
});

app.get("/api/markets", async (request, response, next) => {
  try {
    const symbolsRaw = readString(request.query.symbols);
    const symbols = symbolsRaw
      ? symbolsRaw
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : undefined;

    const items = await getMarketData(symbols);
    response.json({
      generatedAt: new Date().toISOString(),
      items,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/weather", async (_request, response, next) => {
  try {
    const item = await getWeatherData();
    response.json({
      generatedAt: new Date().toISOString(),
      item,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/media/proxy/:kind/:payload", async (request, response, next) => {
  try {
    const kind = request.params.kind === "video" ? "video" : request.params.kind === "image" ? "image" : null;
    if (!kind) {
      response.status(400).json({ error: "Tipo de media invalido." });
      return;
    }
    await proxyManagedMediaRequest(request, response, kind);
  } catch (error) {
    next(error);
  }
});

app.head("/api/media/proxy/:kind/:payload", async (request, response, next) => {
  try {
    const kind = request.params.kind === "video" ? "video" : request.params.kind === "image" ? "image" : null;
    if (!kind) {
      response.status(400).end();
      return;
    }
    await proxyManagedMediaRequest(request, response, kind);
  } catch (error) {
    next(error);
  }
});

app.get("/api/news", async (request, response, next) => {
  try {
    const sectionQuery = readString(request.query.section).toUpperCase();
    const provinceQuery = readString(request.query.province).toUpperCase();
    const statusQuery = readString(request.query.status).toUpperCase();
    const limitQuery = Number(request.query.limit ?? 30);
    const includeExternal = readBoolean(request.query.external);

    const where: Prisma.NewsWhereInput = {};
    if (sectionQuery && isNewsSection(sectionQuery)) {
      where.section = sectionQuery;
    }
    if (provinceQuery && isProvince(provinceQuery)) {
      where.province = provinceQuery;
    }
    if (statusQuery && isNewsStatus(statusQuery)) {
      where.status = statusQuery;
    } else {
      where.status = NewsStatus.PUBLISHED;
    }

    const limit = Number.isFinite(limitQuery) ? Math.max(1, Math.min(100, limitQuery)) : 30;

    const internalNews = await prisma.news.findMany({
      where,
      orderBy: [{ isHero: "desc" }, { isFeatured: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
    });

    const internal = internalNews.map(toFeedItem);
    if (!includeExternal) {
      response.json({ items: internal });
      return;
    }

    const external = await getExternalNews();
    response.json({
      items: dedupeByKey([...internal, ...external]).slice(0, limit),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/news/:slug", async (request, response, next) => {
  try {
    const slug = readString(request.params.slug);
    if (!slug) {
      response.status(400).json({ error: "Slug de noticia invalido." });
      return;
    }

    const item = await prisma.news.findFirst({
      where: {
        slug,
        status: NewsStatus.PUBLISHED,
      },
    });

    if (!item) {
      response.status(404).json({ error: "Noticia no encontrada." });
      return;
    }

    const internalRelated = await prisma.news.findMany({
      where: {
        id: { not: item.id },
        status: NewsStatus.PUBLISHED,
        OR: [{ section: item.section }, ...(item.province ? [{ province: item.province }] : [])],
      },
      orderBy: [{ isFeatured: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
      take: 8,
    });

    response.json({
      item: {
        ...item,
        imageUrl: resolveManagedFeedImage(item.imageUrl, {
          sourceUrl: item.sourceUrl,
          seed: item.title,
        }),
        sourceUrl: normalizeHttpUrl(item.sourceUrl),
        publishedAt: (item.publishedAt ?? item.createdAt).toISOString(),
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      },
      related: dedupeByKey(internalRelated.map(toFeedItem)).slice(0, 6),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/polls", async (request, response, next) => {
  try {
    const statusQuery = readString(request.query.status).toUpperCase();
    const featuredOnly = readBoolean(request.query.featured);
    const limitQuery = Number(request.query.limit ?? 12);
    const limit = Number.isFinite(limitQuery) ? Math.max(1, Math.min(50, limitQuery)) : 12;
    const now = new Date();

    const where: Prisma.PollWhereInput = {};
    if (statusQuery && isPollStatus(statusQuery)) {
      where.status = statusQuery;
    } else {
      where.status = PollStatus.PUBLISHED;
    }
    if (featuredOnly) {
      where.isFeatured = true;
    }
    if (where.status === PollStatus.PUBLISHED) {
      where.AND = [
        {
          OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        },
        {
          OR: [{ endsAt: null }, { endsAt: { gte: now } }],
        },
      ];
    }

    const polls = await prisma.poll.findMany({
      where,
      orderBy: [{ isFeatured: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
      include: {
        options: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (polls.length === 0) {
      response.json({ items: [] });
      return;
    }

    const grouped = await prisma.pollVote.groupBy({
      by: ["pollId", "optionId"],
      where: {
        pollId: { in: polls.map((poll) => poll.id) },
      },
      _count: { _all: true },
    });

    const voteMapsByPoll = new Map<string, Map<string, number>>();
    for (const entry of grouped) {
      const map = voteMapsByPoll.get(entry.pollId) ?? new Map<string, number>();
      map.set(entry.optionId, entry._count._all);
      voteMapsByPoll.set(entry.pollId, map);
    }

    response.json({
      items: polls.map((poll) => toPollPublicView(poll, buildPollSnapshot(poll.options, voteMapsByPoll.get(poll.id) ?? new Map()))),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/polls/:slug", async (request, response, next) => {
  try {
    const slug = readString(request.params.slug);
    if (!slug) {
      response.status(400).json({ error: "Slug de encuesta invalido." });
      return;
    }

    const payload = await buildPollPublicPayloadBySlug(slug);
    if (!payload) {
      response.status(404).json({ error: "Encuesta no encontrada." });
      return;
    }

    if (!isPollAvailableNow(payload)) {
      response.status(404).json({ error: "Encuesta no disponible." });
      return;
    }

    const selectedCookie = readString(request.cookies[voteCookieName(slug)]);
    const selectedOptionId = payload.metrics.options.some((option) => option.id === selectedCookie) ? selectedCookie : null;
    response.json({ item: payload, selectedOptionId });
  } catch (error) {
    next(error);
  }
});

app.post("/api/polls/:slug/vote", async (request, response, next) => {
  try {
    const slug = readString(request.params.slug);
    if (!slug) {
      response.status(400).json({ error: "Slug de encuesta invalido." });
      return;
    }

    const optionId = readString(request.body.optionId);
    if (!optionId) {
      response.status(400).json({ error: "Selecciona una opcion para votar." });
      return;
    }
    let reasonText: string | null;
    try {
      reasonText = normalizeVoteReasonInput(request.body.reasonText);
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : "Explicacion invalida." });
      return;
    }

    const poll = await prisma.poll.findUnique({
      where: { slug },
      include: {
        options: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!poll || !isPollAvailableNow(poll)) {
      response.status(404).json({ error: "Encuesta no disponible para votar." });
      return;
    }

    const targetOption = poll.options.find((option) => option.id === optionId);
    if (!targetOption) {
      response.status(400).json({ error: "Opcion de voto invalida." });
      return;
    }

    const voterHash = buildVoterHash(request, poll.id);
    const existingVote = await prisma.pollVote.findUnique({
      where: { pollId_voterHash: { pollId: poll.id, voterHash } },
      select: { id: true, optionId: true, reasonText: true },
    });
    let reasonSaved = false;

    if (!existingVote) {
      await prisma.pollVote.create({
        data: {
          pollId: poll.id,
          optionId: targetOption.id,
          voterHash,
          sourceRef: asNullable(readString(request.body.sourceRef)),
          reasonText,
        },
      });
      reasonSaved = Boolean(reasonText);
    } else if (reasonText) {
      await prisma.pollVote.update({
        where: {
          pollId_voterHash: {
            pollId: poll.id,
            voterHash,
          },
        },
        data: {
          reasonText,
        },
      });
      reasonSaved = true;
    }

    response.cookie(voteCookieName(slug), existingVote?.optionId ?? targetOption.id, {
      httpOnly: false,
      sameSite: "lax",
      secure: IS_PRODUCTION,
      maxAge: 365 * 24 * 60 * 60 * 1000,
    });

    const payload = await buildPollPublicPayloadBySlug(slug);
    if (!payload) {
      response.status(404).json({ error: "No se pudo reconstruir la encuesta." });
      return;
    }

    const selectedOptionId = existingVote?.optionId ?? targetOption.id;
    response.json({
      item: payload,
      selectedOptionId,
      alreadyVoted: Boolean(existingVote),
      reasonSaved,
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
      response.status(409).json({ error: "Ya registraste un voto para esta encuesta." });
      return;
    }
    next(error);
  }
});

app.post("/api/polls/:slug/reason", async (request, response, next) => {
  try {
    const slug = readString(request.params.slug);
    if (!slug) {
      response.status(400).json({ error: "Slug de encuesta invalido." });
      return;
    }

    let reasonText: string | null;
    try {
      reasonText = normalizeVoteReasonInput(request.body.reasonText);
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : "Explicacion invalida." });
      return;
    }

    if (!reasonText) {
      response.status(400).json({ error: "Escribe una explicacion para guardar." });
      return;
    }

    const poll = await prisma.poll.findUnique({
      where: { slug },
      select: { id: true, status: true, startsAt: true, endsAt: true },
    });

    if (!poll || !isPollAvailableNow(poll)) {
      response.status(404).json({ error: "Encuesta no disponible." });
      return;
    }

    const voterHash = buildVoterHash(request, poll.id);
    const existingVote = await prisma.pollVote.findUnique({
      where: {
        pollId_voterHash: {
          pollId: poll.id,
          voterHash,
        },
      },
      select: {
        optionId: true,
      },
    });

    if (!existingVote) {
      response.status(404).json({ error: "Primero registra tu voto para poder explicar por que." });
      return;
    }

    await prisma.pollVote.update({
      where: {
        pollId_voterHash: {
          pollId: poll.id,
          voterHash,
        },
      },
      data: {
        reasonText,
      },
    });

    const payload = await buildPollPublicPayloadBySlug(slug);
    if (!payload) {
      response.status(404).json({ error: "No se pudo reconstruir la encuesta." });
      return;
    }

    response.json({
      item: payload,
      selectedOptionId: existingVote.optionId,
      reasonSaved: true,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/plans", (_request, response) => {
  response.json({
    default: UserPlan.FREE,
    items: Object.values(UserPlan),
  });
});

app.post("/api/auth/register", async (request, response, next) => {
  try {
    if (isAuthRateLimited(request, "register")) {
      response.status(429).json({ error: "Demasiados intentos de registro. Espera unos minutos." });
      return;
    }

    const email = normalizeUserEmail(request.body.email);
    const password = readString(request.body.password);
    const displayName = normalizeDisplayName(request.body.displayName);

    assertValidUserEmail(email);
    assertValidUserPassword(password);

    const passwordHash = await hashUserPassword(password);
    const created = await prisma.user.create({
      data: {
        email,
        displayName,
        passwordHash,
        plan: UserPlan.FREE,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        plan: true,
        emailVerifiedAt: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
      },
    });

    clearAuthRateLimitBucket(request, "register");
    const { expiresAt } = await issueUserSession(created.id, response);
    try {
      await sendWelcomeEmail({ email: created.email, displayName: created.displayName });
    } catch (mailError) {
      console.error("No se pudo enviar email de bienvenida", mailError);
    }
    response.status(201).json({
      item: toPublicUser(created),
      session: { expiresAt: expiresAt.toISOString() },
      defaultPlan: UserPlan.FREE,
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
      response.status(409).json({ error: "Ya existe un usuario con ese email." });
      return;
    }
    next(error);
  }
});

app.post("/api/auth/login", async (request, response, next) => {
  try {
    if (isAuthRateLimited(request, "login")) {
      response.status(429).json({ error: "Demasiados intentos de login. Espera unos minutos." });
      return;
    }

    const email = normalizeUserEmail(request.body.email);
    const password = readString(request.body.password);

    assertValidUserEmail(email);
    if (!password) {
      response.status(400).json({ error: "Password requerida." });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        displayName: true,
        plan: true,
        emailVerifiedAt: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
        passwordHash: true,
      },
    });

    if (!user || !user.isActive) {
      response.status(401).json({ error: "Credenciales invalidas." });
      return;
    }

    const valid = await verifyUserPassword(password, user.passwordHash);
    if (!valid) {
      response.status(401).json({ error: "Credenciales invalidas." });
      return;
    }

    clearAuthRateLimitBucket(request, "login");
    const now = new Date();
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: now },
    });

    await prisma.userSession.deleteMany({
      where: {
        userId: user.id,
        expiresAt: { lte: now },
      },
    });

    const { expiresAt } = await issueUserSession(user.id, response);
    response.json({
      item: toPublicUser({ ...user, lastLoginAt: now }),
      session: { expiresAt: expiresAt.toISOString() },
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/me", async (request, response, next) => {
  try {
    const auth = await getAuthenticatedUserSession(request);
    if (!auth) {
      response.status(401).json({ error: "No autenticado." });
      return;
    }

    response.json({
      item: toPublicUser(auth.user),
      session: {
        expiresAt: auth.expiresAt.toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", async (request, response, next) => {
  try {
    const auth = await getAuthenticatedUserSession(request);
    if (auth) {
      await prisma.userSession.deleteMany({
        where: {
          id: auth.sessionId,
        },
      });
    }
    clearUserSessionCookie(response);
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/email/health", (_request, response) => {
  response.json({ email: emailHealth() });
});

app.post("/api/auth/email/send-code", async (request, response, next) => {
  try {
    const auth = await getAuthenticatedUserSession(request);
    if (!auth) {
      response.status(401).json({ error: "No autenticado." });
      return;
    }

    const purposeRaw = readString(request.body.purpose).toUpperCase();
    const purpose =
      purposeRaw === UserEmailCodePurpose.PASSWORD_RESET ? UserEmailCodePurpose.PASSWORD_RESET : UserEmailCodePurpose.ACCOUNT_VERIFY;

    const now = new Date();
    const recentAttempt = await prisma.userEmailCode.findFirst({
      where: {
        userId: auth.user.id,
        purpose,
        createdAt: {
          gt: new Date(now.getTime() - 60 * 1000),
        },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (recentAttempt) {
      response.status(429).json({ error: "Espera 60 segundos antes de pedir otro codigo." });
      return;
    }

    const code = createEmailCode();
    const codeHash = hashEmailCode(code, USER_EMAIL_CODE_SECRET);
    const expiresAt = new Date(now.getTime() + USER_EMAIL_CODE_TTL_MINUTES * 60 * 1000);

    await prisma.userEmailCode.create({
      data: {
        userId: auth.user.id,
        purpose,
        codeHash,
        expiresAt,
      },
    });

    try {
      await sendAccountCodeEmail({ email: auth.user.email, code });
    } catch (mailError) {
      console.error("No se pudo enviar codigo por email", mailError);
      response.status(503).json({ error: "No se pudo enviar el email en este momento." });
      return;
    }

    response.json({
      ok: true,
      purpose,
      expiresAt: expiresAt.toISOString(),
      ...(IS_PRODUCTION ? {} : { debugCode: code }),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/email/verify-code", async (request, response, next) => {
  try {
    const auth = await getAuthenticatedUserSession(request);
    if (!auth) {
      response.status(401).json({ error: "No autenticado." });
      return;
    }

    const code = normalizeEmailCode(request.body.code);
    if (code.length !== 6) {
      response.status(400).json({ error: "Codigo invalido. Debe tener 6 digitos." });
      return;
    }

    const codeHash = hashEmailCode(code, USER_EMAIL_CODE_SECRET);
    const now = new Date();
    const match = await prisma.userEmailCode.findFirst({
      where: {
        userId: auth.user.id,
        purpose: UserEmailCodePurpose.ACCOUNT_VERIFY,
        codeHash,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (!match) {
      response.status(400).json({ error: "Codigo incorrecto o vencido." });
      return;
    }

    await prisma.$transaction([
      prisma.userEmailCode.update({
        where: { id: match.id },
        data: { consumedAt: now },
      }),
      prisma.user.update({
        where: { id: auth.user.id },
        data: { emailVerifiedAt: now },
      }),
    ]);

    const refreshed = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: {
        id: true,
        email: true,
        displayName: true,
        plan: true,
        emailVerifiedAt: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
      },
    });

    if (!refreshed) {
      response.status(404).json({ error: "Usuario no encontrado." });
      return;
    }

    response.json({
      ok: true,
      item: toPublicUser(refreshed),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/login", (request, response) => {
  const email = readString(request.body.email).toLowerCase();
  const password = readString(request.body.password);

  if (email !== ADMIN_EMAIL.toLowerCase() || password !== ADMIN_PASSWORD) {
    response.status(401).json({ error: "Credenciales invalidas" });
    return;
  }

  const token = signAdminToken(email, ADMIN_JWT_SECRET);
  response.cookie(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PRODUCTION,
    maxAge: 12 * 60 * 60 * 1000,
  });

  response.json({
    token,
    expiresIn: "12h",
  });
});

const apiGuard = adminApiGuard(ADMIN_JWT_SECRET, ADMIN_COOKIE_NAME);

app.get("/api/admin/users", apiGuard, async (_request, response, next) => {
  try {
    const now = new Date();
    const users = await prisma.user.findMany({
      orderBy: [{ createdAt: "desc" }],
      include: {
        sessions: {
          where: { expiresAt: { gt: now } },
          select: { id: true },
        },
      },
      take: 600,
    });

    response.json({
      items: users.map((user) => ({
        item: toPublicUser(user),
        activeSessions: user.sessions.length,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/users/:id/plan", apiGuard, async (request, response, next) => {
  try {
    const id = readString(request.params.id);
    if (!id) {
      response.status(400).json({ error: "ID invalido." });
      return;
    }

    const nextPlan = normalizeUserPlanInput(request.body.plan, UserPlan.FREE);
    const updated = await prisma.user.update({
      where: { id },
      data: { plan: nextPlan },
      select: {
        id: true,
        email: true,
        displayName: true,
        plan: true,
        emailVerifiedAt: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
      },
    });

    response.json({ item: toPublicUser(updated) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/polls", apiGuard, async (_request, response, next) => {
  try {
    const polls = await prisma.poll.findMany({
      orderBy: [{ isFeatured: "desc" }, { updatedAt: "desc" }],
      include: {
        options: {
          orderBy: { sortOrder: "asc" },
        },
      },
      take: 200,
    });

    if (polls.length === 0) {
      response.json({ items: [] });
      return;
    }

    const grouped = await prisma.pollVote.groupBy({
      by: ["pollId", "optionId"],
      where: {
        pollId: { in: polls.map((poll) => poll.id) },
      },
      _count: { _all: true },
    });

    const maps = new Map<string, Map<string, number>>();
    for (const entry of grouped) {
      const map = maps.get(entry.pollId) ?? new Map<string, number>();
      map.set(entry.optionId, entry._count._all);
      maps.set(entry.pollId, map);
    }

    response.json({
      items: polls.map((poll) => toPollPublicView(poll, buildPollSnapshot(poll.options, maps.get(poll.id) ?? new Map()))),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/polls", apiGuard, async (request, response, next) => {
  try {
    const normalized = normalizePollInput(request.body as Record<string, unknown>);
    const uniqueSlug = await ensureUniquePollSlug(prisma, normalized.slug);

    if (normalized.isFeatured) {
      await prisma.poll.updateMany({
        data: { isFeatured: false },
        where: { isFeatured: true },
      });
    }

    const created = await prisma.poll.create({
      data: {
        slug: uniqueSlug,
        title: normalized.title,
        question: normalized.question,
        hookLabel: normalized.hookLabel,
        footerCta: normalized.footerCta,
        description: normalized.description,
        customSheetCode: normalized.customSheetCode,
        interviewUrl: normalized.interviewUrl,
        coverImageUrl: normalized.coverImageUrl,
        status: normalized.status,
        isFeatured: normalized.isFeatured,
        startsAt: normalized.startsAt,
        endsAt: normalized.endsAt,
        publishedAt: normalized.publishedAt,
        options: {
          create: normalized.options,
        },
      },
      include: {
        options: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    response.status(201).json({ item: toPollPublicView(created, buildPollSnapshot(created.options, new Map())) });
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/polls/:id", apiGuard, async (request, response, next) => {
  try {
    const id = readString(request.params.id);
    if (!id) {
      response.status(400).json({ error: "ID invalido" });
      return;
    }

    const normalized = normalizePollInput(request.body as Record<string, unknown>);
    const uniqueSlug = await ensureUniquePollSlug(prisma, normalized.slug, id);

    if (normalized.isFeatured) {
      await prisma.poll.updateMany({
        data: { isFeatured: false },
        where: { isFeatured: true, id: { not: id } },
      });
    }

    await prisma.poll.update({
      where: { id },
      data: {
        slug: uniqueSlug,
        title: normalized.title,
        question: normalized.question,
        hookLabel: normalized.hookLabel,
        footerCta: normalized.footerCta,
        description: normalized.description,
        customSheetCode: normalized.customSheetCode,
        interviewUrl: normalized.interviewUrl,
        coverImageUrl: normalized.coverImageUrl,
        status: normalized.status,
        isFeatured: normalized.isFeatured,
        startsAt: normalized.startsAt,
        endsAt: normalized.endsAt,
        publishedAt: normalized.publishedAt,
      },
    });

    const existingOptions = await prisma.pollOption.findMany({
      where: { pollId: id },
      orderBy: { sortOrder: "asc" },
    });

    for (const option of normalized.options) {
      const current = existingOptions.find((candidate) => candidate.sortOrder === option.sortOrder);
      if (current) {
        await prisma.pollOption.update({
          where: { id: current.id },
          data: {
            label: option.label,
            colorHex: option.colorHex,
            emoji: option.emoji,
          },
        });
      } else {
        await prisma.pollOption.create({
          data: {
            pollId: id,
            label: option.label,
            sortOrder: option.sortOrder,
            colorHex: option.colorHex,
            emoji: option.emoji,
          },
        });
      }
    }

    const updated = await prisma.poll.findUnique({
      where: { id },
      include: {
        options: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!updated) {
      response.status(404).json({ error: "Encuesta no encontrada." });
      return;
    }

    const voteMap = await getPollVoteCountMap(updated.id);
    response.json({ item: toPollPublicView(updated, buildPollSnapshot(updated.options, voteMap)) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/polls/:id", apiGuard, async (request, response, next) => {
  try {
    const id = readString(request.params.id);
    if (!id) {
      response.status(400).json({ error: "ID invalido" });
      return;
    }
    await prisma.poll.delete({ where: { id } });
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/settings/theme", apiGuard, async (_request, response, next) => {
  try {
    const theme = await getHomeTheme(prisma);
    response.json({ theme, options: HOME_THEME_OPTIONS });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/settings/theme", apiGuard, async (request, response, next) => {
  try {
    const nextTheme = normalizeHomeTheme(readString(request.body.theme));
    const theme = await setHomeTheme(prisma, nextTheme);
    response.json({ theme });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/ai/assist", apiGuard, async (request, response, next) => {
  try {
    const assistInput = buildEditorialAssistInput(request.body as Record<string, unknown>);
    const context = await buildAiNewsContext(prisma);
    const suggestion = await generateDraftWithAi(assistInput, context.contextText);
    response.json({ suggestion, context: context.meta });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/ai/research-assist", apiGuard, async (request, response, next) => {
  try {
    const raw = request.body as Record<string, unknown>;
    const assistInput = buildEditorialAssistInput(raw);
    const settings = await getAiResearchSettings(prisma);
    if (!settings.enabled) {
      response.status(400).json({ error: "El agente periodista esta desactivado en configuracion." });
      return;
    }

    const research = await buildNewsResearchContext({
      brief: assistInput.brief,
      limit: settings.hotNewsLimit,
      fetchArticleText: settings.fetchArticleText,
      campaignLine: selectedCampaignLine(raw, settings.campaignLine),
    });
    const context = await buildAiNewsContext(prisma);
    const sourceList = sourceFeedToText(research.sources, 10);
    const mergedContext = [
      context.contextText,
      "",
      research.contextText,
      sourceList ? `\nFUENTES INVESTIGADAS (referencia):\n${sourceList}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const suggestion = await generateDraftWithAi(assistInput, mergedContext);
    const finalSuggestion = await postProcessResearchedSuggestion(
      suggestion,
      settings,
      research.lead,
      research.sources,
      assistInput.brief,
    );
    response.json({
      suggestion: finalSuggestion,
      context: context.meta,
      sources: research.sources,
      research: {
        lead: research.lead,
        settings,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/ai/ask", apiGuard, async (request, response, next) => {
  try {
    const assistInput = buildEditorialAssistInput(request.body as Record<string, unknown>);
    const context = await buildAiNewsContext(prisma);
    const answer = await askEditorialWithAi(assistInput, context.contextText);
    response.json({ answer, context: context.meta });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/ai/review", apiGuard, async (request, response, next) => {
  try {
    const normalized = normalizeNewsInput(request.body as Record<string, unknown>);
    const { safeInput, review, contextMeta } = await validateWithEditorialAi(normalized);
    response.json({
      review,
      context: contextMeta,
      suggestions: {
        title: safeInput.title,
        kicker: safeInput.kicker,
        excerpt: safeInput.excerpt,
        body: safeInput.body,
        imageUrl: safeInput.imageUrl,
        sourceName: safeInput.sourceName,
        sourceUrl: safeInput.sourceUrl,
        authorName: safeInput.authorName,
        section: safeInput.section,
        province: safeInput.province,
        tags: safeInput.tags,
        status: safeInput.status,
        publishedAt: safeInput.publishedAt ? safeInput.publishedAt.toISOString() : null,
        flags: {
          isHero: safeInput.isHero,
          isFeatured: safeInput.isFeatured,
          isSponsored: safeInput.isSponsored,
          isInterview: safeInput.isInterview,
          isOpinion: safeInput.isOpinion,
          isRadar: safeInput.isRadar,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/ai/context", apiGuard, async (_request, response, next) => {
  try {
    const context = await buildAiNewsContext(prisma);
    response.json(context);
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/ai/health", apiGuard, async (_request, response, next) => {
  try {
    const health = await getEditorialAiHealth();
    response.json({ health });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/news", apiGuard, async (request, response, next) => {
  try {
    const normalized = normalizeNewsInput(request.body as Record<string, unknown>);
    const { safeInput, review } = await validateWithEditorialAi(normalized);
    const uniqueSlug = await ensureUniqueSlug(prisma, safeInput.slug);

    if (safeInput.isHero) {
      await prisma.news.updateMany({
        data: { isHero: false },
        where: { isHero: true },
      });
    }

    const created = await prisma.news.create({
      data: {
        ...safeInput,
        slug: uniqueSlug,
        aiDecision: review.decision,
        aiReason: review.reason,
        aiScore: review.score,
        aiWarnings: review.warnings,
        aiModel: review.model,
        aiEvaluatedAt: new Date(),
      },
    });

    response.status(201).json({ item: toFeedItem(created), review });
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/news/:id", apiGuard, async (request, response, next) => {
  try {
    const id = readString(request.params.id);
    if (!id) {
      response.status(400).json({ error: "ID invalido" });
      return;
    }
    const normalized = normalizeNewsInput(request.body as Record<string, unknown>);
    const { safeInput, review } = await validateWithEditorialAi(normalized);
    const uniqueSlug = await ensureUniqueSlug(prisma, safeInput.slug, id);

    if (safeInput.isHero) {
      await prisma.news.updateMany({
        data: { isHero: false },
        where: { isHero: true, id: { not: id } },
      });
    }

    const updated = await prisma.news.update({
      where: { id },
      data: {
        ...safeInput,
        slug: uniqueSlug,
        aiDecision: review.decision,
        aiReason: review.reason,
        aiScore: review.score,
        aiWarnings: review.warnings,
        aiModel: review.model,
        aiEvaluatedAt: new Date(),
      },
    });

    response.json({ item: toFeedItem(updated), review });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/news/:id", apiGuard, async (request, response, next) => {
  try {
    const id = readString(request.params.id);
    if (!id) {
      response.status(400).json({ error: "ID invalido" });
      return;
    }
    await prisma.news.delete({ where: { id } });
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.get("/backoffice/login", (request, response) => {
  const token = extractAdminToken(request, ADMIN_COOKIE_NAME);
  if (token) {
    try {
      verifyAdminToken(token, ADMIN_JWT_SECRET);
      response.redirect("/backoffice");
      return;
    } catch {
      response.clearCookie(ADMIN_COOKIE_NAME);
    }
  }

  response.status(200).send(renderLogin(readString(request.query.error)));
});

app.post("/backoffice/login", (request, response) => {
  const email = readString(request.body.email).toLowerCase();
  const password = readString(request.body.password);

  if (email !== ADMIN_EMAIL.toLowerCase() || password !== ADMIN_PASSWORD) {
    response.status(401).send(renderLogin("Credenciales invalidas."));
    return;
  }

  const token = signAdminToken(email, ADMIN_JWT_SECRET);
  response.cookie(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PRODUCTION,
    maxAge: 12 * 60 * 60 * 1000,
  });

  response.redirect("/backoffice");
});

app.get("/backoffice/logout", (_request, response) => {
  response.clearCookie(ADMIN_COOKIE_NAME);
  response.redirect("/backoffice/login");
});

const boGuard = backofficeGuard(ADMIN_JWT_SECRET, ADMIN_COOKIE_NAME);

app.post("/backoffice/ai/assist", boGuard, async (request, response, next) => {
  try {
    const assistInput = buildEditorialAssistInput(request.body as Record<string, unknown>);
    const context = await buildAiNewsContext(prisma);
    const suggestion = await generateDraftWithAi(assistInput, context.contextText);
    const capturedImage = await ensureManagedImageCaptured(suggestion.imageUrl);
    response.json({
      suggestion: {
        ...suggestion,
        imageUrl: capturedImage ?? buildManagedImageUrl(suggestion.imageUrl),
      },
      context: context.meta,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/backoffice/ai/research-assist", boGuard, async (request, response, next) => {
  try {
    const raw = request.body as Record<string, unknown>;
    const assistInput = buildEditorialAssistInput(raw);
    const settings = await getAiResearchSettings(prisma);
    if (!settings.enabled) {
      response.status(400).json({ error: "El agente periodista esta desactivado en panel." });
      return;
    }

    const research = await buildNewsResearchContext({
      brief: assistInput.brief,
      limit: settings.hotNewsLimit,
      fetchArticleText: settings.fetchArticleText,
      campaignLine: selectedCampaignLine(raw, settings.campaignLine),
    });
    const context = await buildAiNewsContext(prisma);
    const sourceList = sourceFeedToText(research.sources, 10);
    const mergedContext = [
      context.contextText,
      "",
      research.contextText,
      sourceList ? `\nFUENTES INVESTIGADAS (referencia):\n${sourceList}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const suggestion = await generateDraftWithAi(assistInput, mergedContext);
    const finalSuggestion = await postProcessResearchedSuggestion(
      suggestion,
      settings,
      research.lead,
      research.sources,
      assistInput.brief,
    );
    response.json({
      suggestion: finalSuggestion,
      context: context.meta,
      sources: research.sources,
      research: {
        lead: research.lead,
        settings,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post("/backoffice/ai/ask", boGuard, async (request, response, next) => {
  try {
    const assistInput = buildEditorialAssistInput(request.body as Record<string, unknown>);
    const context = await buildAiNewsContext(prisma);
    const answer = await askEditorialWithAi(assistInput, context.contextText);
    const capturedDraftImage = answer?.draft ? await ensureManagedImageCaptured(answer.draft.imageUrl) : null;
    response.json({
      answer: answer?.draft
        ? {
            ...answer,
            draft: {
              ...answer.draft,
              imageUrl: capturedDraftImage ?? buildManagedImageUrl(answer.draft.imageUrl),
            },
          }
        : answer,
      context: context.meta,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/backoffice/ai/review", boGuard, async (request, response, next) => {
  try {
    const normalized = normalizeNewsInput(request.body as Record<string, unknown>);
    const { safeInput, review, contextMeta } = await validateWithEditorialAi(normalized);
    response.json({
      review,
      context: contextMeta,
      suggestions: {
        title: safeInput.title,
        kicker: safeInput.kicker,
        excerpt: safeInput.excerpt,
        body: safeInput.body,
        imageUrl: safeInput.imageUrl,
        sourceName: safeInput.sourceName,
        sourceUrl: safeInput.sourceUrl,
        authorName: safeInput.authorName,
        section: safeInput.section,
        province: safeInput.province,
        tags: safeInput.tags,
        status: safeInput.status,
        publishedAt: safeInput.publishedAt ? safeInput.publishedAt.toISOString() : null,
        flags: {
          isHero: safeInput.isHero,
          isFeatured: safeInput.isFeatured,
          isSponsored: safeInput.isSponsored,
          isInterview: safeInput.isInterview,
          isOpinion: safeInput.isOpinion,
          isRadar: safeInput.isRadar,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post("/backoffice/ai/polls/generate", boGuard, async (request, response, next) => {
  try {
    const assistInput = buildPollAssistInput(request.body as Record<string, unknown>);
    const context = await buildAiNewsContext(prisma);
    const suggestion = await generatePollDraftWithAi(assistInput, context.contextText);
    response.json({ suggestion, context: context.meta });
  } catch (error) {
    next(error);
  }
});

app.get("/backoffice/ai/context", boGuard, async (_request, response, next) => {
  try {
    const context = await buildAiNewsContext(prisma);
    response.json(context);
  } catch (error) {
    next(error);
  }
});

app.get("/backoffice/ai/health", boGuard, async (_request, response, next) => {
  try {
    const health = await getEditorialAiHealth();
    response.json({ health });
  } catch (error) {
    next(error);
  }
});

app.get("/backoffice", boGuard, async (request, response, next) => {
  try {
    await ensureAutopilotDueRun("dashboard");
    const [
      news,
      homeTheme,
      engagementSettings,
      aiResearchSettings,
      pollRows,
      deployStatus,
      autopilotSettings,
      instagramSettings,
    ] = await Promise.all([
      prisma.news.findMany({
        orderBy: [{ updatedAt: "desc" }],
        take: 300,
      }),
      getHomeTheme(prisma),
      getHomeEngagementSettings(prisma),
      getAiResearchSettings(prisma),
      buildBackofficePollRows(),
      buildDeployStatusPayload(),
      getEditorialAutopilotSettings(prisma),
      getInstagramPublishingSettings(prisma),
    ]);
    let instagramConnectionError: string | null = null;
    let instagramConnection: Awaited<ReturnType<typeof getInstagramConnectionSummary>> = {
      configured: false,
      accounts: [],
      selectedAccount: null,
    };
    try {
      instagramConnection = await getInstagramConnectionSummary(instagramSettings);
    } catch (error) {
      instagramConnectionError = (error as Error).message;
    }

    const themeOptions = HOME_THEME_OPTIONS.map(
      (option) =>
        `<option value="${option.value}" ${homeTheme === option.value ? "selected" : ""}>${option.label}</option>`,
    ).join("");

    const total = news.length;
    const published = news.filter((item) => item.status === NewsStatus.PUBLISHED).length;
    const drafts = news.filter((item) => item.status === NewsStatus.DRAFT).length;
    const aiReject = news.filter((item) => item.aiDecision === "REJECT").length;
    const aiReview = news.filter((item) => item.aiDecision === "REVIEW").length;
    const pollPublished = pollRows.filter((item) => item.status === PollStatus.PUBLISHED).length;
    const pollVotes = pollRows.reduce((acc, item) => acc + item.totalVotes, 0);
    const externalLinked = news.filter((item) => normalizeExternalKey(item.sourceUrl).length > 0).length;
    const thinExternal = news.filter((item) => isLikelyThinExternalNews(item)).length;
    const deployStatusClass =
      deployStatus.sync === "synced" ? "is-synced" : deployStatus.sync === "drift" ? "is-drift" : "is-unknown";
    const frontendVersionLabel = deployStatus.frontend?.versionLabel ?? "Sin respuesta publica";
    const autopilotModeLabel =
      EDITORIAL_AUTOPILOT_MODE_OPTIONS.find((option) => option.value === autopilotSettings.mode)?.label ??
      autopilotSettings.mode;
    const autopilotLastRunLabel = autopilotSettings.lastRunAt
      ? new Date(autopilotSettings.lastRunAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
      : "Nunca";
    const autopilotNextRunLabel = autopilotSettings.nextRunAt
      ? new Date(autopilotSettings.nextRunAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
      : "Pendiente de planificacion";
    const instagramAccountSummary = instagramConnectionError
      ? `Error Meta: ${instagramConnectionError}`
      : summarizeInstagramAccounts(instagramConnection.accounts);
    const instagramConfiguredCount = instagramConnection.accounts.length;
    const recentNewsRows = news
      .slice(0, 4)
      .map((item) => {
        const when = new Date(item.updatedAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
        const event =
          item.status === NewsStatus.PUBLISHED
            ? `Nota publicada: "${currentErrorSafe(item.title)}"`
            : `Borrador actualizado: "${currentErrorSafe(item.title)}"`;
        return `<div class="bo-activity-row">
          <div class="bo-activity-time">${when}</div>
          <div class="bo-activity-copy">
            <strong>${event}</strong>
            <span>${currentErrorSafe(item.section)}${item.province ? ` &middot; ${currentErrorSafe(item.province)}` : ""} &middot; IA ${currentErrorSafe(
              item.aiDecision ?? "REVIEW",
            )}</span>
          </div>
          <a class="button" href="/backoffice/news/${item.id}/edit">Abrir</a>
        </div>`;
      })
      .join("");
    const recentPollRows = pollRows
      .slice(0, 2)
      .map((item) => {
        const when = new Date(item.updatedAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
        return `<div class="bo-activity-row">
          <div class="bo-activity-time">${when}</div>
          <div class="bo-activity-copy">
            <strong>Encuesta ${currentErrorSafe(item.status.toLowerCase())}: "${currentErrorSafe(item.title)}"</strong>
            <span>${item.totalVotes} votos &middot; lider ${currentErrorSafe(item.leaderLabel ?? "sin definir")}</span>
          </div>
          <a class="button" href="/backoffice/polls/${item.id}/edit">Abrir</a>
        </div>`;
      })
      .join("");
    const reviewRows = news
      .filter((item) => item.aiDecision === "REVIEW")
      .slice(0, 6)
      .map((item) => {
        const when = new Date(item.updatedAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
        return `<div class="bo-soft-line">
          <strong>${currentErrorSafe(item.title)}</strong>
          <span>${currentErrorSafe(item.aiReason ?? "Pendiente de revision editorial")} &middot; ${when}</span>
        </div>`;
      })
      .join("");
    const body = `<div style="display:grid;gap:18px;">

      <!-- ══ AUTOPILOT COMMAND BAR ══ -->
      <section id="autopilot-section" class="ap-command-bar">
        <div class="ap-status-group">
          <div class="ap-status-dot ${autopilotSettings.enabled ? "" : "is-off"}"></div>
          <div>
            <div class="ap-status-label">${autopilotSettings.enabled ? "Autopiloto activo" : "Autopiloto apagado"}</div>
            <div style="color:#8a837a;font-size:10px;letter-spacing:.14em;text-transform:uppercase;font-weight:600;margin-top:2px;">Sala de Redaccion Autonoma</div>
          </div>
        </div>
        <div class="ap-meta">
          <div class="ap-meta-item">
            <label>Modo</label>
            <span>${escapeHtml(autopilotSettings.enabled ? autopilotModeLabel : "Inactivo")}</span>
          </div>
          <div class="ap-meta-item">
            <label>Ventana</label>
            <span>${autopilotSettings.windowStartHour}:00 — ${autopilotSettings.windowEndHour}:59</span>
          </div>
          <div class="ap-meta-item">
            <label>Cuota diaria</label>
            <span>${autopilotSettings.minDailyStories}–${autopilotSettings.maxDailyStories} notas</span>
          </div>
          <div class="ap-meta-item">
            <label>Ultimo ciclo</label>
            <span>${escapeHtml(autopilotLastRunLabel)}</span>
          </div>
          <div class="ap-meta-item">
            <label>Proximo ciclo</label>
            <span>${escapeHtml(autopilotNextRunLabel)}</span>
          </div>
          <div class="ap-meta-item">
            <label>Social</label>
            <span>${autopilotSettings.socialEnabled ? "Instagram ON" : "Social OFF"}</span>
          </div>
        </div>
        <div class="ap-actions">
          <a class="ap-btn" href="/backoffice#autopilot-config">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            Configurar
          </a>
          <form method="post" action="/backoffice/autopilot/run" style="display:inline;">
            <button type="submit" class="ap-btn primary">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"></polygon></svg>
              Ejecutar ciclo IA
            </button>
          </form>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          ${autopilotSettings.lastRunSummary ? `<span style="color:#8a837a;font-size:11px;max-width:220px;line-height:1.4;">${escapeHtml(currentErrorSafe(autopilotSettings.lastRunSummary).slice(0, 80))}${autopilotSettings.lastRunSummary.length > 80 ? "…" : ""}</span>` : ""}
        </div>
      </section>

      <!-- ══ AGENT PIPELINE ══ -->
      <section>
        <div class="section-header">
          <h3>Pipeline de agentes IA</h3>
          <div class="section-header-actions">
            <a class="button" href="/backoffice/news/new?template=coverage" style="font-size:11px;padding:7px 12px;min-height:auto;">Nueva cobertura</a>
          </div>
        </div>
        <div class="agent-pipeline">
          <div class="agent-card ${aiResearchSettings.enabled ? "is-ready" : "is-standby"}">
            <div class="agent-card-top">
              <div class="agent-icon"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"></circle><path d="m20 20-3.5-3.5"></path></svg></div>
              <div class="agent-status-dot"></div>
            </div>
            <div class="agent-name">Investigador</div>
            <div class="agent-role">Raspa fuentes, analiza agenda, rankea por relevancia editorial</div>
            <div class="agent-stat"><strong>${externalLinked}</strong> fuentes activas</div>
          </div>
          <div class="agent-card ${aiResearchSettings.enabled ? "is-active" : "is-standby"}">
            <div class="agent-card-top">
              <div class="agent-icon"><svg viewBox="0 0 24 24"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path></svg></div>
              <div class="agent-status-dot"></div>
            </div>
            <div class="agent-name">Redactor</div>
            <div class="agent-role">Reescribe con lineamiento Pulso Pais, genera titulos y copete</div>
            <div class="agent-stat"><strong>${drafts}</strong> en borrador</div>
          </div>
          <div class="agent-card is-ready">
            <div class="agent-card-top">
              <div class="agent-icon"><svg viewBox="0 0 24 24"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path><circle cx="12" cy="13" r="3"></circle></svg></div>
              <div class="agent-status-dot"></div>
            </div>
            <div class="agent-name">Fotografo</div>
            <div class="agent-role">Selecciona y valida portada editorial, cropea y optimiza imagen</div>
            <div class="agent-stat"><strong>${published}</strong> con foto aprobada</div>
          </div>
          <div class="agent-card ${aiReview > 0 ? "is-warning" : "is-ready"}">
            <div class="agent-card-top">
              <div class="agent-icon" style="background:#2a2520;"><svg viewBox="0 0 24 24"><path d="M9 12l2 2 4-4"></path><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"></path></svg></div>
              <div class="agent-status-dot ${aiReview > 0 ? "is-warning" : ""}"></div>
            </div>
            <div class="agent-name">Editor</div>
            <div class="agent-role">Compliance editorial, revision de calidad, aprobacion o rechazo</div>
            <div class="agent-stat"><strong>${aiReview}</strong> en cola revision</div>
          </div>
          <div class="agent-card is-ready">
            <div class="agent-card-top">
              <div class="agent-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg></div>
              <div class="agent-status-dot"></div>
            </div>
            <div class="agent-name">Publicador web</div>
            <div class="agent-role">Promueve PUBLISHED, gestiona slug y SEO, actualiza portada</div>
            <div class="agent-stat"><strong>${published}</strong> publicadas hoy</div>
          </div>
          <div class="agent-card ${autopilotSettings.socialEnabled && instagramConfiguredCount > 0 ? "is-active" : "is-standby"}">
            <div class="agent-card-top">
              <div class="agent-icon" style="background:linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045);"><svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg></div>
              <div class="agent-status-dot"></div>
            </div>
            <div class="agent-name">CM Social</div>
                    <div class="agent-role">Adapta notas al tono de Instagram, decide queue social y publica piezas nativas</div>
            <div class="agent-stat"><strong>${instagramConfiguredCount}</strong> cuenta${instagramConfiguredCount !== 1 ? "s" : ""} IG</div>
          </div>
        </div>
      </section>

      <!-- ══ METRICS RIBBON ══ -->
      <div class="metrics-ribbon">
        <div class="metric-cell">
          <label>Total notas</label>
          <strong>${total}</strong>
          <span>en el CMS</span>
        </div>
        <div class="metric-cell accent">
          <label>Publicadas</label>
          <strong>${published}</strong>
          <span>en el sitio</span>
        </div>
        <div class="metric-cell">
          <label>Borradores</label>
          <strong>${drafts}</strong>
          <span>en edicion</span>
        </div>
        <div class="metric-cell ${aiReview > 0 ? "accent" : ""}">
          <label>En revision</label>
          <strong>${aiReview}</strong>
          <span>pendientes IA</span>
        </div>
        <div class="metric-cell">
          <label>Externas</label>
          <strong>${externalLinked}</strong>
          <span>fuentes vinculadas</span>
        </div>
        <div class="metric-cell">
          <label>Thin ext.</label>
          <strong>${thinExternal}</strong>
          <span>a internalizar</span>
        </div>
        <div class="metric-cell">
          <label>Encuestas live</label>
          <strong>${pollPublished}</strong>
          <span>${pollVotes} votos totales</span>
        </div>
        <div class="metric-cell ${instagramConfiguredCount > 0 ? "accent" : ""}">
          <label>Instagram</label>
          <strong>${instagramConfiguredCount}</strong>
          <span>cuenta${instagramConfiguredCount !== 1 ? "s" : ""} activa${instagramConfiguredCount !== 1 ? "s" : ""}</span>
        </div>
      </div>

      <!-- ══ MAIN CONTENT GRID ══ -->
      <div class="content-grid-3">

        <!-- Actividad reciente + Acciones rapidas -->
        <div style="display:grid;gap:18px;">

          <!-- Quick Actions -->
          <div class="card" style="padding:20px;">
            <div class="section-header">
              <h3>Acciones rapidas</h3>
            </div>
            <div class="quick-actions">
              <a class="quick-action" href="/backoffice/news/new?template=coverage">
                <div class="quick-action-icon"><svg viewBox="0 0 24 24"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path></svg></div>
                <strong>Crear nota</strong>
                <small>Chat con el periodista IA para cobertura individual o en lote.</small>
              </a>
              <a class="quick-action" href="/backoffice/news/new?template=internalize">
                <div class="quick-action-icon"><svg viewBox="0 0 24 24"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"></path><path d="M18 14h-8"></path><path d="M15 18h-5"></path><path d="M10 6h8v4h-8V6Z"></path></svg></div>
                <strong>Internalizar</strong>
                <small>Convierte notas ajenas en propias con foto y tono editorial.</small>
              </a>
              <a class="quick-action" href="/backoffice/news/new?template=cleanup">
                <div class="quick-action-icon"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></div>
                <strong>Depurar CMS</strong>
                <small>IA corrige, limpia y prepara borrados con confirmacion.</small>
              </a>
              <a class="quick-action" href="/backoffice/polls/new">
                <div class="quick-action-icon"><svg viewBox="0 0 24 24"><path d="M4 19h16"></path><rect x="5" y="11" width="3" height="6" rx="1"></rect><rect x="10.5" y="7" width="3" height="10" rx="1"></rect><rect x="16" y="4" width="3" height="13" rx="1"></rect></svg></div>
                <strong>Nueva encuesta</strong>
                <small>Crea encuesta para Instagram y sitio con candidatos.</small>
              </a>
              <a class="quick-action" href="/backoffice/ia-lab">
                <div class="quick-action-icon"><svg viewBox="0 0 24 24"><path d="M10 3v4l-4.5 8.2A3 3 0 0 0 8.1 20h7.8a3 3 0 0 0 2.6-4.8L14 7V3"></path><path d="M8.5 13h7"></path></svg></div>
                <strong>Diagnostico IA</strong>
                <small>Verifica salud del modelo, contexto y tokens disponibles.</small>
              </a>
              <a class="quick-action" href="/backoffice/news/review">
                <div class="quick-action-icon" style="background:${aiReview > 0 ? "#7b3f00" : "#191714"};"><svg viewBox="0 0 24 24"><path d="M9 12l2 2 4-4"></path><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"></path></svg></div>
                <strong>Cola revision</strong>
                <small>${aiReview > 0 ? `${aiReview} pieza${aiReview !== 1 ? "s" : ""} pendiente${aiReview !== 1 ? "s" : ""} de revision.` : "Sin piezas pendientes ahora."}</small>
              </a>
            </div>
          </div>

          <!-- Actividad reciente del newsroom -->
          <div class="card" style="padding:20px;">
            <div class="section-header">
              <h3>Actividad del newsroom</h3>
            </div>
            <div class="activity-feed">
              ${recentNewsRows || `<div class="bo-note-box"><p class="muted">No hay actividad reciente registrada.</p></div>`}
              ${recentPollRows}
            </div>
          </div>
        </div>

        <!-- Config autopiloto + Cola revision -->
        <div style="display:grid;gap:18px;align-content:start;">

          <!-- Autopilot Config -->
          <div id="autopilot-config" class="autopilot-card">
            <div class="autopilot-header">
              <div class="autopilot-title">
                <div class="bo-kicker">Centro de mando IA</div>
                <h3>Autopiloto editorial</h3>
              </div>
              <div class="autopilot-badges">
                <span class="ap-badge ${autopilotSettings.enabled ? "on" : "off"}">${autopilotSettings.enabled ? "● Activo" : "○ Inactivo"}</span>
                ${autopilotSettings.socialEnabled ? `<span class="ap-badge social">📱 Social</span>` : ""}
              </div>
            </div>
            <form method="post" action="/backoffice/settings/autopilot" style="display:grid;gap:12px;">
              <div class="bo-toggle-row" style="border-bottom:1px solid #e8dfc9;padding-bottom:12px;">
                <div><strong>Activo</strong><span>Permite ciclos autonomos desde panel o cron</span></div>
                <label><input type="checkbox" name="enabled" ${autopilotSettings.enabled ? "checked" : ""} /></label>
              </div>
              <div class="field">
                <label for="autopilotMode2">Modo editorial</label>
                <select id="autopilotMode2" name="mode">${EDITORIAL_AUTOPILOT_MODE_OPTIONS.map((option) => `<option value="${option.value}" ${autopilotSettings.mode === option.value ? "selected" : ""}>${option.label}</option>`).join("")}</select>
              </div>
              <div class="bo-compact-grid">
                <div class="field">
                  <label>Notas por corrida</label>
                  <input name="maxStoriesPerRun" type="number" min="1" max="20" value="${autopilotSettings.maxStoriesPerRun}" />
                </div>
                <div class="field">
                  <label>Internalizar ext.</label>
                  <input name="internalizeLimit" type="number" min="0" max="20" value="${autopilotSettings.internalizeLimit}" />
                </div>
              </div>
              <div class="bo-compact-grid">
                <div class="field">
                  <label>Cuota min. diaria</label>
                  <input name="minDailyStories" type="number" min="1" max="30" value="${autopilotSettings.minDailyStories}" />
                </div>
                <div class="field">
                  <label>Cuota max. diaria</label>
                  <input name="maxDailyStories" type="number" min="1" max="30" value="${autopilotSettings.maxDailyStories}" />
                </div>
              </div>
              <div class="bo-compact-grid">
                <div class="field">
                  <label>Desde (hora)</label>
                  <input name="windowStartHour" type="number" min="0" max="23" value="${autopilotSettings.windowStartHour}" />
                </div>
                <div class="field">
                  <label>Hasta (hora)</label>
                  <input name="windowEndHour" type="number" min="1" max="23" value="${autopilotSettings.windowEndHour}" />
                </div>
              </div>
              <div class="field">
                <label>Prompt base persistente</label>
                <textarea name="instruction" rows="4" style="font-size:12px;">${currentErrorSafe(autopilotSettings.instruction)}</textarea>
              </div>
              <div class="field">
                <label>Prompt temporal (coyuntura)</label>
                <textarea name="temporalPrompt" rows="2" style="font-size:12px;">${currentErrorSafe(autopilotSettings.temporalPrompt)}</textarea>
              </div>
              <div class="bo-toggle-row" style="border:0;padding:0;">
                <div><strong>Auto publicar web</strong><span>Promueve a PUBLISHED si el ciclo cierra bien</span></div>
                <label><input type="checkbox" name="autoPublishSite" ${autopilotSettings.autoPublishSite ? "checked" : ""} /></label>
              </div>
              <div class="bo-toggle-row" style="border:0;padding:0;">
                <div><strong>Empujar a social</strong><span>El CM IA selecciona y publica hasta el maximo configurado en Instagram</span></div>
                <label><input type="checkbox" name="socialEnabled" ${autopilotSettings.socialEnabled ? "checked" : ""} /></label>
              </div>
              <div class="bo-form-actions">
                <button class="primary" type="submit">Guardar configuracion</button>
              </div>
            </form>
            <div style="background:rgba(0,0,0,.04);border-radius:14px;padding:12px;display:grid;gap:6px;">
              <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#7a6e5e;font-weight:700;">Ultimo ciclo</div>
              <p style="margin:0;font-size:12px;color:#4e4840;line-height:1.5;">${escapeHtml(autopilotSettings.lastRunSummary || "Sin corridas registradas todavia.")}</p>
            </div>
          </div>

          <!-- Cola de revision -->
          <div class="card" style="padding:20px;">
            <div class="section-header">
              <h3>Cola de revision <span style="background:${aiReview > 0 ? "#fff4d0" : "#f0f0f0"};color:${aiReview > 0 ? "#825f00" : "#888"};border-radius:999px;padding:2px 8px;font-size:11px;font-weight:700;">${aiReview}</span></h3>
              <a class="button" href="/backoffice/news/review" style="font-size:11px;padding:7px 12px;min-height:auto;">Ver todo</a>
            </div>
            <p class="muted" style="margin-bottom:12px;">Piezas bloqueadas por el agente editor o compliance que requieren intervencion humana.</p>
            <div class="log-feed">
              ${reviewRows ? reviewRows.split('<div class="bo-soft-line">').slice(1).slice(0,4).map(row => {
                const titleMatch = row.match(/<strong>(.*?)<\/strong>/);
                const spanMatch = row.match(/<span>(.*?)<\/span>/);
                return `<div class="log-entry warning">
                  <div class="log-icon warning">⚠</div>
                  <div class="log-body">
                    <strong>${titleMatch ? titleMatch[1] : "Pieza pendiente"}</strong>
                    <span>${spanMatch?.[1] ? spanMatch[1].replace(/<[^>]*>/g, "").slice(0, 80) : ""}</span>
                  </div>
                </div>`;
              }).join("") : `<div class="log-entry success"><div class="log-icon success">✓</div><div class="log-body"><strong>Cola limpia</strong><span>No hay piezas pendientes de revision.</span></div></div>`}
            </div>
          </div>
        </div>

        <!-- Sidebar: Social + Portada + Deploy -->
        <aside style="display:grid;gap:16px;align-content:start;">

          <!-- Agente periodista toggle -->
          <div class="card" style="padding:18px;">
            <div class="section-header" style="margin-bottom:12px;">
              <h3>Agente periodista</h3>
              <span class="ap-badge ${aiResearchSettings.enabled ? "on" : "off"}">${aiResearchSettings.enabled ? "ON" : "OFF"}</span>
            </div>
            <p class="muted" style="margin-bottom:12px;">Investiga agenda en tiempo real, reescribe con fuentes y consigue portada editorial valida.</p>
            <form method="post" action="/backoffice/settings/ai-research" style="display:grid;gap:10px;">
              <div class="bo-toggle-row" style="border:0;padding:0;">
                <div><strong>Activo</strong><span>${aiResearchSettings.enabled ? "Investigando fuentes" : "Desactivado"}</span></div>
                <label><input type="checkbox" name="enabled" ${aiResearchSettings.enabled ? "checked" : ""} /></label>
              </div>
              <button class="primary" type="submit" style="font-size:12px;">Guardar agente</button>
            </form>
          </div>

          <!-- Social: Instagram -->
          <div id="social-section" class="card" style="padding:18px;">
            <div class="section-header" style="margin-bottom:12px;">
              <h3>Social media</h3>
            </div>
            <div class="social-panel">
              <div class="social-account-card">
                <div class="social-platform-icon"><svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg></div>
                <div class="social-account-info">
                  <strong>Instagram</strong>
                  <span>${escapeHtml(instagramAccountSummary.slice(0, 48))}${instagramAccountSummary.length > 48 ? "…" : ""}</span>
                </div>
                <div class="social-stat">
                  <strong>${instagramConfiguredCount}</strong>
                  <span>cuentas</span>
                </div>
              </div>
            </div>
            <div style="margin-top:12px;display:grid;gap:8px;">
              <a class="button" href="/backoffice#autopilot-config" style="font-size:11px;padding:8px 12px;min-height:auto;text-align:center;">Configurar social</a>
            </div>
          </div>

          <!-- Control de portada -->
          <div id="theme-control" class="card" style="padding:18px;background:#191714;border-color:#2a2723;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;">
              <h3 style="margin:0;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#f2b705;">Control de portada</h3>
            </div>
            <p style="color:#d0cbc2;font-size:12px;line-height:1.5;margin:0 0 12px;">Layout editorial, interacciones y comportamiento del front.</p>
            <form id="form-theme" method="post" action="/backoffice/settings/theme" style="display:grid;gap:10px;">
              <div class="field">
                <label style="color:#ddd3bd;">Layout de portada</label>
                <select name="homeTheme" style="background:#24211d;border-color:#3a3630;color:#f6f4ee;">${themeOptions}</select>
              </div>
              <button class="primary" type="submit" style="font-size:12px;">Guardar portada</button>
            </form>
            <form method="post" action="/backoffice/settings/engagement" style="display:grid;gap:8px;margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.08);">
              <div class="bo-toggle-row" style="border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:8px;">
                <div><strong style="color:#f0ece4;font-size:12px;">Comentarios</strong></div>
                <label><input type="checkbox" name="commentsEnabled" ${engagementSettings.commentsEnabled ? "checked" : ""} /></label>
              </div>
              <div class="bo-toggle-row" style="border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:8px;">
                <div><strong style="color:#f0ece4;font-size:12px;">Reacciones</strong></div>
                <label><input type="checkbox" name="reactionsEnabled" ${engagementSettings.reactionsEnabled ? "checked" : ""} /></label>
              </div>
              <div class="bo-toggle-row" style="border:0;padding:0;">
                <div><strong style="color:#f0ece4;font-size:12px;">Analisis en vivo</strong></div>
                <label><input type="checkbox" name="analysisEnabled" ${engagementSettings.analysisEnabled ? "checked" : ""} /></label>
              </div>
              <button class="primary" type="submit" style="font-size:12px;margin-top:4px;">Guardar engagement</button>
            </form>
          </div>

          <!-- Deploy status -->
          <div class="card" id="boDeployStatus" style="padding:18px;">
            <div class="split-title" style="margin-bottom:12px;">
              <h3 style="font-size:13px;">Deploy status</h3>
              <span id="boDeployBadge" class="bo-deploy-status ${deployStatusClass}">${deployStatus.sync}</span>
            </div>
            <div style="display:grid;gap:8px;margin-bottom:12px;">
              <div style="display:flex;justify-content:space-between;font-size:12px;padding:8px 10px;background:#f5f2eb;border-radius:10px;">
                <span style="color:#6b6660;">Backend</span>
                <span id="boDeployBackend" style="font-weight:600;">${escapeHtml(deployStatus.backend.versionLabel)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:12px;padding:8px 10px;background:#f5f2eb;border-radius:10px;">
                <span style="color:#6b6660;">Frontend</span>
                <span id="boDeployFrontend" style="font-weight:600;">${escapeHtml(frontendVersionLabel)}</span>
              </div>
            </div>
            <p id="boDeploySummary" class="muted">${deployStatus.error ? escapeHtml(deployStatus.error) : `Sync: ${escapeHtml(deployStatus.sync)}.`}</p>
            <div class="actions" style="margin-top:10px;">
              <a class="button" href="${escapeHtml(normalizedFrontendBaseUrl())}" target="_blank" rel="noreferrer" style="font-size:11px;padding:7px 12px;min-height:auto;">Ver sitio</a>
            </div>
          </div>
        </aside>
      </div>

      <script>
        (() => {
          function renderStatus(payload) {
            const sync = payload.sync ?? "unknown";
            const badge = document.getElementById("boDeployBadge");
            const backendEl = document.getElementById("boDeployBackend");
            const frontendEl = document.getElementById("boDeployFrontend");
            const summaryEl = document.getElementById("boDeploySummary");
            if (!badge) return;
            badge.className = "bo-deploy-status " + (sync === "synced" ? "is-synced" : sync === "drift" ? "is-drift" : "is-unknown");
            badge.textContent = sync;
            if (backendEl) backendEl.textContent = payload.backend && payload.backend.versionLabel ? payload.backend.versionLabel : "Sin datos";
            if (frontendEl) frontendEl.textContent = payload.frontend && payload.frontend.versionLabel ? payload.frontend.versionLabel : "Sin respuesta publica";
            if (summaryEl) summaryEl.textContent = payload.error ? String(payload.error) : "Sincronizacion actual: " + String(sync) + ".";
          }
          async function refreshStatus() {
            try {
              const response = await fetch("/api/deploy/status", { headers: { accept: "application/json" } });
              if (!response.ok) return;
              renderStatus(await response.json());
            } catch (_error) {}
          }
          window.setTimeout(refreshStatus, 600);
          window.setInterval(refreshStatus, 15000);
        })();
      </script>
    </div>`;

    response.send(backofficeShell("Panel editorial", body, readString(request.query.ok)));
  } catch (error) {
    next(error);
  }
});

app.post("/backoffice/settings/theme", boGuard, async (request, response, next) => {
  try {
    const nextTheme = normalizeHomeTheme(readString(request.body.homeTheme));
    await setHomeTheme(prisma, nextTheme);
    response.redirect(`/backoffice?ok=${encodeURIComponent(`Tema de home actualizado: ${nextTheme}`)}`);
  } catch (error) {
    next(error);
  }
});

app.post("/backoffice/settings/engagement", boGuard, async (request, response, next) => {
  try {
    const settings = await setHomeEngagementSettings(prisma, {
      commentsEnabled: readBoolean(request.body.commentsEnabled),
      reactionsEnabled: readBoolean(request.body.reactionsEnabled),
      analysisEnabled: readBoolean(request.body.analysisEnabled),
    });
    response.redirect(
      `/backoffice?ok=${encodeURIComponent(
        `Interacciones actualizadas - comentarios:${settings.commentsEnabled ? "ON" : "OFF"} reacciones:${
          settings.reactionsEnabled ? "ON" : "OFF"
        } analisis:${settings.analysisEnabled ? "ON" : "OFF"}`,
      )}`,
    );
  } catch (error) {
    next(error);
  }
});

app.post("/backoffice/settings/ai-research", boGuard, async (request, response, next) => {
  try {
    const settings = await setAiResearchSettings(prisma, {
      enabled: readBoolean(request.body.enabled),
      hotNewsLimit: Number(readString(request.body.hotNewsLimit) || "12"),
      fetchArticleText: readBoolean(request.body.fetchArticleText),
      cropImage: readBoolean(request.body.cropImage),
      cropWidth: Number(readString(request.body.cropWidth) || "1200"),
      cropHeight: Number(readString(request.body.cropHeight) || "675"),
      internalizeSourceLinks: readBoolean(request.body.internalizeSourceLinks),
      campaignLine: readString(request.body.campaignLine),
    });
    response.redirect(
      `/backoffice?ok=${encodeURIComponent(
        `Agente periodista actualizado - estado:${settings.enabled ? "ON" : "OFF"} fuentes:${settings.hotNewsLimit} crop:${
          settings.cropImage ? `${settings.cropWidth}x${settings.cropHeight}` : "OFF"
        }`,
      )}`,
    );
  } catch (error) {
    next(error);
  }
});

app.post("/backoffice/settings/autopilot", boGuard, async (request, response, next) => {
  try {
    const minDailyStories = Number(readString(request.body.minDailyStories) || "4");
    const maxDailyStories = Number(readString(request.body.maxDailyStories) || "10");
    const settings = await setEditorialAutopilotSettings(prisma, {
      enabled: readBoolean(request.body.enabled),
      mode: readString(request.body.mode) as Awaited<ReturnType<typeof getEditorialAutopilotSettings>>["mode"],
      instruction: readString(request.body.instruction),
      temporalPrompt: readString(request.body.temporalPrompt),
      maxStoriesPerRun: Number(readString(request.body.maxStoriesPerRun) || "4"),
      internalizeLimit: Number(readString(request.body.internalizeLimit) || "4"),
      minDailyStories: Math.min(minDailyStories, maxDailyStories),
      maxDailyStories: Math.max(minDailyStories, maxDailyStories),
      windowStartHour: Number(readString(request.body.windowStartHour) || "8"),
      windowEndHour: Number(readString(request.body.windowEndHour) || "23"),
      autoPublishSite: readBoolean(request.body.autoPublishSite),
      allowDelete: readBoolean(request.body.allowDelete),
      socialEnabled: readBoolean(request.body.socialEnabled),
      nextRunAt: new Date().toISOString(),
    });
    if (settings.enabled && settings.mode !== "MANUAL") {
      await ensureAutopilotDueRun("settings");
    }
    response.redirect(
      `/backoffice?ok=${encodeURIComponent(
        `Autopiloto actualizado - estado:${settings.enabled ? "ON" : "OFF"} modo:${settings.mode} diario:${settings.minDailyStories}-${settings.maxDailyStories} ventana:${settings.windowStartHour}-${settings.windowEndHour}h social:${settings.socialEnabled ? "ON" : "OFF"}`,
      )}`,
    );
  } catch (error) {
    next(error);
  }
});

app.post("/backoffice/settings/instagram", boGuard, async (request, response, next) => {
  try {
    const settings = await setInstagramPublishingSettings(prisma, {
      enabled: readBoolean(request.body.enabled),
      accountId: readString(request.body.accountId),
      username: readString(request.body.username),
      captionTemplate: readString(request.body.captionTemplate),
      includeSiteUrl: readBoolean(request.body.includeSiteUrl),
      includeSourceCredit: readBoolean(request.body.includeSourceCredit),
      maxPostsPerRun: Number(readString(request.body.maxPostsPerRun) || "1"),
    });
    response.redirect(
      `/backoffice?ok=${encodeURIComponent(
        `Instagram actualizado - estado:${settings.enabled ? "ON" : "OFF"} cuenta:${settings.accountId || "sin seleccionar"} max:${settings.maxPostsPerRun}`,
      )}`,
    );
  } catch (error) {
    next(error);
  }
});

app.post("/backoffice/autopilot/run", boGuard, async (_request, response, next) => {
  try {
    const result = await runEditorialAutopilotCycle("panel");
    response.redirect(
      `/backoffice?ok=${encodeURIComponent(
        `Ciclo IA ejecutado - ${[result.planSummary, result.executionSummary, result.socialSummary].filter(Boolean).join(" | ")}`,
      )}`,
    );
  } catch (error) {
    if (error instanceof Error) {
      response.redirect(`/backoffice?ok=${encodeURIComponent(`Error autopiloto - ${error.message}`)}`);
      return;
    }
    next(error);
  }
});

app.get("/backoffice/news/batch", boGuard, async (request, response, next) => {
  try {
    const query = new URLSearchParams();
    query.set("studio", "batch");
    const ok = readString(request.query.ok);
    if (ok) {
      query.set("ok", ok);
    }
    response.redirect(`/backoffice/news/new?${query.toString()}`);
  } catch (error) {
    next(error);
  }
});

app.post("/backoffice/news/batch", boGuard, async (request, response, next) => {
  const totalItems = clampInteger(request.body.totalItems, 1, 40, 1);
  const campaignPercent = clampInteger(request.body.campaignPercent, 0, 100, 0);
  const campaignTopic = readString(request.body.campaignTopic);
  const generalBrief = readString(request.body.generalBrief);
  const useResearchAgent = readBoolean(request.body.useResearchAgent);
  const includeCampaignLine = readBoolean(request.body.includeCampaignLine);
  const campaignLine = readString(request.body.campaignLine);
  const publishStatus =
    readString(request.body.publishStatus).toUpperCase() === NewsStatus.PUBLISHED ? NewsStatus.PUBLISHED : NewsStatus.DRAFT;
  const sectionHintRaw = readString(request.body.sectionHint).toUpperCase();
  const provinceHintRaw = readString(request.body.provinceHint).toUpperCase();
  const sectionHint = isNewsSection(sectionHintRaw) ? sectionHintRaw : null;
  const provinceHint = isProvince(provinceHintRaw) ? provinceHintRaw : null;
  const requireImageUrl = request.body.requireImageUrl === undefined ? true : readBoolean(request.body.requireImageUrl);
  const defaultSourceName = readString(request.body.defaultSourceName) || "Pulso Pais IA";
  const defaultAuthorName = readString(request.body.defaultAuthorName) || "Redaccion Pulso Pais";
  const defaultSourceUrl = readString(request.body.defaultSourceUrl);

  const formState: BatchNewsFormState = {
    totalItems,
    campaignPercent,
    campaignTopic,
    generalBrief,
    useResearchAgent,
    includeCampaignLine,
    campaignLine,
    publishStatus,
    sectionHint: sectionHint ?? "",
    provinceHint: provinceHint ?? "",
    requireImageUrl,
    defaultSourceName,
    defaultAuthorName,
    defaultSourceUrl,
  };

  try {
    const aiResearchSettings = await getAiResearchSettings(prisma);
    const campaignSlots = Math.round((totalItems * campaignPercent) / 100);
    const generalSlots = totalItems - campaignSlots;

    if (campaignSlots > 0 && campaignTopic.length < 8) {
      throw new Error("Con porcentaje de campana > 0, el tema de campana debe tener al menos 8 caracteres.");
    }
    if (generalSlots > 0 && generalBrief.length < 12) {
      throw new Error("Con bloque general activo, el brief general debe tener al menos 12 caracteres.");
    }

    if (useResearchAgent && !aiResearchSettings.enabled) {
      throw new Error("El agente periodista esta desactivado en Panel. Activalo o desmarca 'Modo periodista'.");
    }

    const safeCampaignTopic = campaignSlots > 0 ? campaignTopic : "Sin bloque de campana";
    const safeGeneralBrief = generalSlots > 0 ? generalBrief : "Sin bloque general";

    const context = await buildAiNewsContext(prisma);
    let mergedContext = context.contextText;
    let researchLead:
      | {
          sourceName: string | null;
          sourceUrl: string;
          imageUrl: string | null;
          videoUrl: string | null;
          videoPosterUrl: string | null;
        }
      | null = null;
    let researchSources: Array<{
      sourceName: string | null;
      sourceUrl: string;
      imageUrl: string | null;
      videoUrl: string | null;
      videoPosterUrl: string | null;
    }> = [];
    let researchSourcesUsed = 0;

    if (useResearchAgent) {
      const researchBriefParts = [campaignSlots > 0 ? campaignTopic : "", generalSlots > 0 ? generalBrief : ""]
        .map((part) => part.trim())
        .filter(Boolean);
      const researchBrief = researchBriefParts.join(" | ") || "Agenda politica federal Argentina";
      const research = await buildNewsResearchContext({
        brief: researchBrief,
        limit: aiResearchSettings.hotNewsLimit,
        fetchArticleText: aiResearchSettings.fetchArticleText,
        campaignLine: selectedCampaignLine(request.body as Record<string, unknown>, includeCampaignLine ? campaignLine : ""),
      });
      researchLead = research.lead;
      researchSources = research.sources;
      researchSourcesUsed = research.sources.length;
      const sourceList = sourceFeedToText(research.sources, 12);
      mergedContext = [context.contextText, "", research.contextText, sourceList ? `FUENTES INVESTIGADAS:\n${sourceList}` : ""]
        .filter(Boolean)
        .join("\n");
    }

    const batch = await generateBatchDraftsWithAi(
      {
        totalItems,
        campaignPercent,
        campaignTopic: safeCampaignTopic,
        generalBrief: safeGeneralBrief,
        sectionHint,
        provinceHint,
        publishStatus,
        requireImageUrl: requireImageUrl || useResearchAgent,
      },
      mergedContext,
    );

    let createdCount = 0;
    const errors: string[] = [];
    const nowBase = Date.now();

    for (const [index, item] of batch.items.entries()) {
      const draft = item.draft;

      try {
        const finalSection = draft.section && isNewsSection(draft.section) ? draft.section : sectionHint ?? "NACION";
        const finalProvince = draft.province && isProvince(draft.province) ? draft.province : provinceHint ?? "";
        const fallbackTitle = item.focus === "CAMPAIGN" ? `Radar de campana ${index + 1}` : `Agenda politica ${index + 1}`;
        const fallbackKicker = item.focus === "CAMPAIGN" ? "Escenario Electoral" : "Mesa de situacion";
        const fallbackExcerpt = item.focus === "CAMPAIGN" ? safeCampaignTopic : safeGeneralBrief;
        const sourceItem = researchSources.length > 0 ? researchSources[index % researchSources.length] : null;
        const sourceGalleryCandidates =
          researchSources.length > 0
            ? [researchSources[(index + 1) % researchSources.length], researchSources[(index + 2) % researchSources.length]]
            : [];
        const sourceVideoCandidates = researchSources.length > 0 ? [sourceItem, researchLead, ...sourceGalleryCandidates] : [];
        const baseImageCandidatesRaw = uniqueNormalizedImageUrls(
          [
            draft.imageUrl,
            sourceItem?.imageUrl ?? null,
            researchLead?.imageUrl ?? null,
            sourceItem?.videoPosterUrl ?? null,
            requireImageUrl || useResearchAgent ? fallbackBatchImageByIndex(index) : null,
          ],
          5,
        );
        const baseImageCandidates = baseImageCandidatesRaw
          .map((url) => applyResearchImageTransform(url, aiResearchSettings))
          .filter((url): url is string => Boolean(url));
        const reachableCover = await pickReachableImage(baseImageCandidates, 3);
        const fallbackCover = applyResearchImageTransform(fallbackBatchImageByIndex(index), aiResearchSettings);
        const finalImage = reachableCover ?? (fallbackCover && (await probeImageUrl(fallbackCover)) ? fallbackCover : "");
        const galleryImages = uniqueNormalizedImageUrls(
          sourceGalleryCandidates.map((entry) => entry?.imageUrl ?? null),
          3,
        )
          .filter((url) => !baseImageCandidatesRaw.includes(url))
          .map((url) => applyResearchImageTransform(url, aiResearchSettings))
          .filter((url): url is string => Boolean(url));
        const reachableGallery = await captureManagedImageList(
          (await pickReachableImages(galleryImages, 3, 8)).filter((url) => url !== finalImage),
          3,
        );
        const reachableVideo = await pickReachableVideo(
          uniqueNormalizedVideoUrls(sourceVideoCandidates.map((entry) => entry?.videoUrl ?? null), 3),
          3,
        );
        const videoPosterSource =
          uniqueNormalizedImageUrls(
            [sourceItem?.videoPosterUrl ?? null, researchLead?.videoPosterUrl ?? null, finalImage],
            3,
          )[0] ?? null;
        const videoPoster =
          videoPosterSource ? (await ensureManagedImageCaptured(videoPosterSource)) ?? buildManagedImageUrl(videoPosterSource) : null;
        const managedCover = await ensureManagedImageCaptured(finalImage);
        if (!managedCover) {
          throw new Error("El agente fotografo no pudo capturar la portada editorial del item.");
        }

        const finalSourceName = draft.sourceName ?? sourceItem?.sourceName ?? researchLead?.sourceName ?? defaultSourceName;
        const finalSourceUrl =
          useResearchAgent && aiResearchSettings.internalizeSourceLinks
            ? ""
            : normalizeHttpUrl(draft.sourceUrl) ??
              normalizeHttpUrl(sourceItem?.sourceUrl) ??
              normalizeHttpUrl(researchLead?.sourceUrl) ??
              normalizeHttpUrl(defaultSourceUrl) ??
              "";
        const finalBody = appendGalleryBlockToBody(
          appendPrimaryVideoBlockToBody(
            draft.body ?? draft.excerpt ?? fallbackExcerpt,
            buildManagedVideoUrl(reachableVideo),
            videoPoster,
          ),
          reachableGallery,
        );

        const normalized = normalizeNewsInput({
          title: draft.title ?? fallbackTitle,
          slug: "",
          kicker: draft.kicker ?? fallbackKicker,
          excerpt: draft.excerpt ?? fallbackExcerpt,
          body: finalBody ?? fallbackExcerpt,
          imageUrl: managedCover,
          sourceName: finalSourceName,
          sourceUrl: finalSourceUrl,
          authorName: draft.authorName ?? defaultAuthorName,
          section: finalSection,
          province: finalProvince,
          tags: draft.tags.length > 0 ? draft.tags : [item.focus === "CAMPAIGN" ? "campana" : "agenda", "pulso-pais"],
          status: publishStatus,
          publishedAt: publishStatus === NewsStatus.PUBLISHED ? new Date(nowBase + index * 1000).toISOString() : "",
          isSponsored: false,
          isFeatured: draft.flags.isFeatured,
          isHero: false,
          isInterview: draft.flags.isInterview,
          isOpinion: draft.flags.isOpinion,
          isRadar: draft.flags.isRadar || finalSection === "RADAR_ELECTORAL",
        });

        const uniqueSlug = await ensureUniqueSlug(prisma, normalized.slug);
        await prisma.news.create({
          data: {
            ...normalized,
            slug: uniqueSlug,
            aiDecision: "ALLOW",
            aiReason: `Generada en lote IA (${batch.model}) [${item.focus}]${useResearchAgent ? " [AGENTE PERIODISTA]" : ""}`,
            aiWarnings: draft.notes,
            aiModel: batch.model,
            aiEvaluatedAt: new Date(),
          },
        });
        createdCount += 1;
      } catch (error) {
        errors.push(`Item ${index + 1}: ${(error as Error).message}`);
      }
    }

    if (createdCount === 0) {
      throw new Error(errors[0] ?? "No se pudo crear ninguna noticia del lote.");
    }

    const detail =
      errors.length > 0
        ? `Se crearon ${createdCount}/${batch.items.length}. Errores: ${errors.slice(0, 3).join(" | ")}`
        : `Se crearon ${createdCount} noticias.`;

    const researchDetail = useResearchAgent ? ` Fuentes investigadas: ${researchSourcesUsed}.` : "";
    response.redirect(
      `/backoffice/news/new?studio=command&ok=${encodeURIComponent(`${detail}${researchDetail} Modelo: ${batch.model}.`)}`,
    );
  } catch (error) {
    if (error instanceof Error) {
      response.status(400).send(
        await renderUnifiedEditorialPage({
          activeMode: "command",
          error: error.message,
          batchState: formState,
        }),
      );
      return;
    }
    next(error);
  }
});

app.post("/backoffice/news/internalize", boGuard, async (request, response, next) => {
  const limit = clampInteger(request.body.limit, 1, 20, 6);
  const scope = normalizeExternalRewriteScope(request.body.scope);
  const publishStatus =
    readString(request.body.publishStatus).toUpperCase() === NewsStatus.PUBLISHED ? NewsStatus.PUBLISHED : NewsStatus.DRAFT;
  const sectionHintRaw = readString(request.body.sectionHint).toUpperCase();
  const provinceHintRaw = readString(request.body.provinceHint).toUpperCase();
  const sectionHint = isNewsSection(sectionHintRaw) ? sectionHintRaw : null;
  const provinceHint = isProvince(provinceHintRaw) ? provinceHintRaw : null;
  const deleteDuplicates = readBoolean(request.body.deleteDuplicates);
  const rewriteState: ExternalRewriteFormState = {
    instruction: readString(request.body.instruction),
    limit,
    scope,
    publishStatus,
    sectionHint: sectionHint ?? "",
    provinceHint: provinceHint ?? "",
    includeCampaignLine: readBoolean(request.body.includeCampaignLine),
    campaignLine: readString(request.body.campaignLine),
    deleteDuplicates,
  };

  try {
    const settings = await getAiResearchSettings(prisma);
    if (!settings.enabled) {
      throw new Error("El agente periodista esta desactivado en Panel. Activalo antes de internalizar fuentes externas.");
    }
    if (rewriteState.instruction.length < 18) {
      throw new Error("La instruccion administrativa debe tener al menos 18 caracteres.");
    }

    const research = await buildNewsResearchContext({
      brief: rewriteState.instruction,
      limit: Math.min(16, Math.max(limit * 2, settings.hotNewsLimit)),
      fetchArticleText: settings.fetchArticleText,
      campaignLine: selectedCampaignLine(request.body as Record<string, unknown>, rewriteState.includeCampaignLine ? rewriteState.campaignLine : ""),
    });
    const context = await buildAiNewsContext(prisma);
    const existingRows = await prisma.news.findMany({
      orderBy: [{ updatedAt: "desc" }],
      take: 180,
    });

    const existingBySource = new Map<string, News[]>();
    for (const row of existingRows) {
      const key = normalizeExternalKey(row.sourceUrl);
      if (!key) {
        continue;
      }
      const bucket = existingBySource.get(key) ?? [];
      bucket.push(row);
      existingBySource.set(key, bucket);
    }

    const matchedFromResearch = research.sources
      .map((source) => ({
        source,
        existing: (existingBySource.get(normalizeExternalKey(source.sourceUrl)) ?? []).find((row) => isLikelyThinExternalNews(row)) ?? null,
      }))
      .filter((item) => scope !== "existing" || item.existing)
      .slice(0, limit);

    const fallbackExistingCandidates =
      scope === "existing"
        ? existingRows
            .filter((row) => isLikelyThinExternalNews(row))
            .filter((row) => !matchedFromResearch.some((item) => item.existing?.id === row.id))
            .slice(0, limit)
            .map((row, index) => ({
              source: {
                rank: matchedFromResearch.length + index + 1,
                title: row.title,
                sourceName: row.sourceName,
                sourceUrl: normalizeHttpUrl(row.sourceUrl) ?? "",
                imageUrl: normalizeImageUrl(row.imageUrl),
                videoUrl: null,
                videoPosterUrl: null,
                excerpt: row.excerpt,
                section: row.section,
                publishedAt: (row.publishedAt ?? row.updatedAt).toISOString(),
                matchScore: 0,
              },
              existing: row,
            }))
            .filter((item) => item.source.sourceUrl.length > 0)
        : [];

    const candidates = [...matchedFromResearch, ...fallbackExistingCandidates].slice(0, limit);
    if (candidates.length === 0) {
      throw new Error("No se encontraron fuentes externas candidatas para internalizar con ese criterio.");
    }

    let createdCount = 0;
    let updatedCount = 0;
    let deletedCount = 0;
    const errors: string[] = [];

    for (const [index, candidate] of candidates.entries()) {
      try {
        const source = candidate.source;
        const externalKey = normalizeExternalKey(source.sourceUrl);
        const duplicateRows = existingBySource.get(externalKey) ?? [];
        const existing = candidate.existing;

        const assistInput = {
          brief: `${rewriteState.instruction}\nFuente objetivo: ${source.title}`,
          sectionHint: sectionHint ?? (isNewsSection(source.section) ? source.section : null),
          provinceHint,
          isSponsored: existing?.isSponsored ?? false,
          currentTitle: existing?.title ?? null,
          currentKicker: existing?.kicker ?? null,
          currentExcerpt: existing?.excerpt ?? source.excerpt ?? null,
          currentBody: existing?.body ?? null,
          currentImageUrl: existing?.imageUrl ?? source.imageUrl ?? null,
          currentSourceName: existing?.sourceName ?? source.sourceName ?? null,
          currentSourceUrl: source.sourceUrl,
          currentAuthorName: existing?.authorName ?? null,
          currentStatus: publishStatus,
          currentPublishedAt: existing?.publishedAt ? existing.publishedAt.toISOString() : null,
          currentSection: existing?.section ?? null,
          currentProvince: existing?.province ?? null,
          currentFlags: {
            isHero: existing?.isHero ?? false,
            isFeatured: existing?.isFeatured ?? false,
            isSponsored: existing?.isSponsored ?? false,
            isInterview: existing?.isInterview ?? false,
            isOpinion: existing?.isOpinion ?? false,
            isRadar: existing?.isRadar ?? false,
          },
          currentTags: existing?.tags ?? [],
        };

        const mergedContext = [
          context.contextText,
          "",
          research.contextText,
          "FUENTE OBJETIVO:",
          `- titulo: ${source.title}`,
          `- medio: ${source.sourceName ?? "Fuente abierta"}`,
          `- url: ${source.sourceUrl}`,
          source.excerpt ? `- resumen: ${source.excerpt}` : "",
        ]
          .filter(Boolean)
          .join("\n");

        const suggestion = await generateDraftWithAi(assistInput, mergedContext);
        const finalSuggestion = await postProcessResearchedSuggestion(
          suggestion,
          settings,
          source,
          [source],
          rewriteState.instruction,
        );

        const finalSection =
          sectionHint ??
          (existing?.section ?? (isNewsSection(source.section) ? source.section : "NACION"));
        const finalProvince = provinceHint ?? existing?.province ?? null;
        const finalPublishedAt =
          publishStatus === NewsStatus.PUBLISHED
            ? existing?.publishedAt?.toISOString() ?? new Date(Date.now() + index * 1000).toISOString()
            : "";

        const normalized = normalizeNewsInput({
          title: finalSuggestion.title ?? existing?.title ?? source.title,
          slug: existing?.slug ?? "",
          kicker:
            finalSuggestion.kicker ??
            existing?.kicker ??
            (finalSection === "RADAR_ELECTORAL" ? "Escenario Electoral" : "Mesa de situacion"),
          excerpt: finalSuggestion.excerpt ?? existing?.excerpt ?? source.excerpt ?? rewriteState.instruction,
          body: finalSuggestion.body ?? existing?.body ?? source.excerpt ?? rewriteState.instruction,
          imageUrl: finalSuggestion.imageUrl ?? source.imageUrl ?? "",
          sourceName:
            finalSuggestion.sourceName ??
            existing?.sourceName ??
            source.sourceName ??
            "Pulso Pais (elaboracion propia sobre fuentes abiertas)",
          sourceUrl: settings.internalizeSourceLinks ? "" : normalizeHttpUrl(source.sourceUrl) ?? "",
          authorName: finalSuggestion.authorName ?? existing?.authorName ?? "Redaccion Pulso Pais",
          section: finalSection,
          province: finalProvince,
          tags: finalSuggestion.tags.length > 0 ? finalSuggestion.tags : existing?.tags?.length ? existing.tags : ["pulso-pais", "agenda-propia"],
          status: publishStatus,
          publishedAt: finalPublishedAt,
          isSponsored: existing?.isSponsored ?? false,
          isFeatured: finalSuggestion.flags.isFeatured || existing?.isFeatured || false,
          isHero: false,
          isInterview: finalSuggestion.flags.isInterview || existing?.isInterview || false,
          isOpinion: finalSuggestion.flags.isOpinion || existing?.isOpinion || false,
          isRadar:
            finalSuggestion.flags.isRadar ||
            existing?.isRadar ||
            finalSection === "RADAR_ELECTORAL",
        });

        if (existing) {
          const uniqueSlug = await ensureUniqueSlug(prisma, normalized.slug, existing.id);
          await prisma.news.update({
            where: { id: existing.id },
            data: {
              ...normalized,
              slug: uniqueSlug,
              aiDecision: "ALLOW",
              aiReason: `Internalizada desde fuente externa (${finalSuggestion.model})`,
              aiWarnings: finalSuggestion.notes,
              aiModel: finalSuggestion.model,
              aiEvaluatedAt: new Date(),
            },
          });
          updatedCount += 1;

          if (deleteDuplicates && duplicateRows.length > 1) {
            const duplicateIds = duplicateRows.filter((row) => row.id !== existing.id).map((row) => row.id);
            if (duplicateIds.length > 0) {
              const deleted = await prisma.news.deleteMany({ where: { id: { in: duplicateIds } } });
              deletedCount += deleted.count;
            }
          }
        } else {
          const uniqueSlug = await ensureUniqueSlug(prisma, normalized.slug);
          await prisma.news.create({
            data: {
              ...normalized,
              slug: uniqueSlug,
              aiDecision: "ALLOW",
              aiReason: `Creada desde fuente externa (${finalSuggestion.model})`,
              aiWarnings: finalSuggestion.notes,
              aiModel: finalSuggestion.model,
              aiEvaluatedAt: new Date(),
            },
          });
          createdCount += 1;
        }
      } catch (error) {
        errors.push(`Fuente ${index + 1}: ${(error as Error).message}`);
      }
    }

    if (createdCount === 0 && updatedCount === 0) {
      throw new Error(errors[0] ?? "No se pudo internalizar ninguna fuente externa.");
    }

    const summaryParts = [
      `Notas propias generadas: ${createdCount}`,
      `actualizadas: ${updatedCount}`,
    ];
    if (deletedCount > 0) {
      summaryParts.push(`duplicados limpiados: ${deletedCount}`);
    }
    if (errors.length > 0) {
      summaryParts.push(`alertas: ${errors.slice(0, 2).join(" | ")}`);
    }

    response.redirect(
      `/backoffice/news/new?studio=command&ok=${encodeURIComponent(summaryParts.join(" | "))}`,
    );
  } catch (error) {
    if (error instanceof Error) {
      response.status(400).send(
        await renderUnifiedEditorialPage({
          activeMode: "command",
          error: error.message,
          rewriteState,
        }),
      );
      return;
    }
    next(error);
  }
});

app.post("/backoffice/editorial-command/chat", boGuard, async (request, response, next) => {
  const commandState: EditorialCommandFormState = {
    instruction: readString(request.body.instruction),
    campaignLine: readString(request.body.campaignLine),
    allowDestructive: readBoolean(request.body.allowDestructive),
    autoExecuteSafe: readBoolean(request.body.autoExecuteSafe),
    quantityHint: clampOptionalInteger(request.body.quantityHint, 1, 40),
  };

  try {
    if (commandState.instruction.length < 8) {
      throw new Error("La instruccion para la IA editorial debe tener al menos 8 caracteres.");
    }

    const chatState = await getEditorialCommandChatState(prisma);
    const effectiveInstruction =
      (commandState.quantityHint ?? 0) > 1
        ? `${commandState.instruction}\n\nCantidad objetivo sugerida por editor: ${commandState.quantityHint} notas.`
        : commandState.instruction;
    const memoryContext = formatEditorialChatMemory(chatState.history, chatState.logs);
    const context = await buildAiNewsContext(prisma);
    const aiResponse = await chatEditorialCommandWithAi(
      {
        instruction: effectiveInstruction,
        campaignLine: commandState.campaignLine || null,
        allowDestructive: commandState.allowDestructive,
        memoryContext,
      },
      context.contextText,
    );

    let nextHistory = appendChatHistory(chatState.history, {
      role: "user",
      kind: "message",
      text: commandState.instruction,
    });
    let nextLogs = appendChatLog(chatState.logs, {
      level: "info",
      title: "Pedido del editor",
      detail: commandState.instruction.slice(0, 320),
    });
    let nextPendingPlanJson = chatState.pendingPlanJson;
    let summary = aiResponse.answer;

    if (aiResponse.plan) {
      const preview = previewEditorialCommandPlan(aiResponse.plan);
      nextHistory = appendChatHistory(nextHistory, {
        role: "assistant",
        kind: "plan",
        text: `${aiResponse.answer}\n\nPlan: ${preview.summary}`,
        meta: {
          destructive: aiResponse.plan.destructive,
          requiresConfirmation: aiResponse.plan.requiresConfirmation,
          model: aiResponse.model,
        },
      });
      nextLogs = appendChatLog(nextLogs, {
        level: aiResponse.plan.destructive ? "warn" : "info",
        title: "Plan editorial generado",
        detail: `${preview.summary} | ${preview.operations.length} operacion(es) | modelo ${aiResponse.model}`,
      });

      if (commandState.autoExecuteSafe && !aiResponse.plan.destructive) {
        const executionSummary = await executeEditorialCommandPlan(aiResponse.plan, commandState);
        nextHistory = appendChatHistory(nextHistory, {
          role: "assistant",
          kind: "execution",
          text: `Plan ejecutado automaticamente.\n${executionSummary}`,
          meta: { model: aiResponse.model },
        });
        nextLogs = appendChatLog(nextLogs, {
          level: "success",
          title: "Plan ejecutado",
          detail: executionSummary,
        });
        nextPendingPlanJson = "";
        summary = `Plan ejecutado automaticamente - ${executionSummary}`;
      } else {
        nextPendingPlanJson = encodeEditorialCommandPlan(aiResponse.plan);
        summary = aiResponse.plan.destructive
          ? `Plan listo con confirmacion obligatoria - ${aiResponse.plan.summary}`
          : `Plan listo - ${aiResponse.plan.summary}`;
      }
    } else {
      nextHistory = appendChatHistory(nextHistory, {
        role: "assistant",
        kind: "message",
        text: aiResponse.answer,
        meta: { model: aiResponse.model },
      });
      nextLogs = appendChatLog(nextLogs, {
        level: "info",
        title: "Consulta editorial respondida",
        detail: aiResponse.answer.slice(0, 320),
      });
    }

    await setEditorialCommandChatState(prisma, {
      history: nextHistory,
      logs: nextLogs,
      pendingPlanJson: nextPendingPlanJson,
    });

    response.redirect(`/backoffice/news/new?studio=command&ok=${encodeURIComponent(summary)}`);
  } catch (error) {
    if (error instanceof Error) {
      response.status(400).send(
        await renderUnifiedEditorialPage({
          activeMode: "command",
          error: error.message,
          commandState,
        }),
      );
      return;
    }
    next(error);
  }
});

app.post("/backoffice/editorial-command/confirm", boGuard, async (request, response, next) => {
  const commandState: EditorialCommandFormState = {
    instruction: "",
    campaignLine: readString(request.body.campaignLine),
    allowDestructive: readBoolean(request.body.allowDestructive),
    autoExecuteSafe: false,
    quantityHint: null,
  };

  try {
    const planJson = readString(request.body.planJson);
    const chatState = await getEditorialCommandChatState(prisma);
    const effectivePlanJson = planJson || chatState.pendingPlanJson;
    if (!effectivePlanJson) {
      throw new Error("No hay ningun plan pendiente para confirmar.");
    }
    const plan = decodeEditorialCommandPlan(effectivePlanJson);
    const executionSummary = await executeEditorialCommandPlan(plan, commandState);
    await setEditorialCommandChatState(prisma, {
      history: appendChatHistory(chatState.history, {
        role: "assistant",
        kind: "execution",
        text: `Plan confirmado y ejecutado.\n${executionSummary}`,
        meta: { destructive: plan.destructive, requiresConfirmation: false, model: plan.model },
      }),
      logs: appendChatLog(chatState.logs, {
        level: plan.destructive ? "warn" : "success",
        title: "Plan confirmado y ejecutado",
        detail: executionSummary,
      }),
      pendingPlanJson: "",
    });
    response.redirect(`/backoffice/news/new?studio=command&ok=${encodeURIComponent(`Comando ejecutado - ${executionSummary}`)}`);
  } catch (error) {
    if (error instanceof Error) {
      response.status(400).send(
        await renderUnifiedEditorialPage({
          activeMode: "command",
          error: error.message,
          commandState: {
            ...commandState,
            summary: "El plan no se pudo confirmar.",
          },
        }),
      );
      return;
    }
    next(error);
  }
});

app.post("/backoffice/editorial-command/history/clear", boGuard, async (_request, response, next) => {
  try {
    await setEditorialCommandChatState(prisma, {
      history: [],
      logs: [],
      pendingPlanJson: "",
    });
    response.redirect(`/backoffice/news/new?studio=command&ok=${encodeURIComponent("Historial y logs de la consola IA limpiados.")}`);
  } catch (error) {
    next(error);
  }
});

app.post("/backoffice/editorial-command/history/clear-pending", boGuard, async (_request, response, next) => {
  try {
    const chatState = await getEditorialCommandChatState(prisma);
    await setEditorialCommandChatState(prisma, {
      history: appendChatHistory(chatState.history, {
        role: "system",
        kind: "warning",
        text: "El editor descarto el plan pendiente antes de ejecutarlo.",
      }),
      logs: appendChatLog(chatState.logs, {
        level: "warn",
        title: "Plan pendiente descartado",
        detail: "Se removio el plan pendiente sin ejecutar cambios en el CMS.",
      }),
      pendingPlanJson: "",
    });
    response.redirect(`/backoffice/news/new?studio=command&ok=${encodeURIComponent("Plan pendiente descartado.")}`);
  } catch (error) {
    next(error);
  }
});

app.post("/backoffice/editorial-command/plan", boGuard, async (request, response, next) => {
  const commandState: EditorialCommandFormState = {
    instruction: readString(request.body.instruction),
    campaignLine: readString(request.body.campaignLine),
    allowDestructive: readBoolean(request.body.allowDestructive),
    autoExecuteSafe: readBoolean(request.body.autoExecuteSafe),
  };

  try {
    if (commandState.instruction.length < 12) {
      throw new Error("El comando editorial debe tener al menos 12 caracteres.");
    }

    const context = await buildAiNewsContext(prisma);
    const plan = await planEditorialCommandWithAi(
      {
        instruction: commandState.instruction,
        campaignLine: commandState.campaignLine || null,
        allowDestructive: commandState.allowDestructive,
      },
      context.contextText,
    );

    if (commandState.autoExecuteSafe && !plan.destructive) {
      const executionSummary = await executeEditorialCommandPlan(plan, commandState);
      response.redirect(
        `/backoffice/news/new?studio=command&ok=${encodeURIComponent(`Plan ejecutado automaticamente - ${executionSummary}`)}`,
      );
      return;
    }

    response.send(
      await renderUnifiedEditorialPage({
        activeMode: "command",
        commandState: {
          ...commandState,
          summary: `Plan listo: ${plan.summary}`,
          planJson: encodeEditorialCommandPlan(plan),
          preview: previewEditorialCommandPlan(plan),
        },
      }),
    );
  } catch (error) {
    if (error instanceof Error) {
      response.status(400).send(
        await renderUnifiedEditorialPage({
          activeMode: "command",
          error: error.message,
          commandState,
        }),
      );
      return;
    }
    next(error);
  }
});

app.post("/backoffice/editorial-command/execute", boGuard, async (request, response, next) => {
  const commandState: EditorialCommandFormState = {
    instruction: "",
    campaignLine: readString(request.body.campaignLine),
    allowDestructive: readBoolean(request.body.allowDestructive),
    autoExecuteSafe: false,
  };

  try {
    const planJson = readString(request.body.planJson);
    if (!planJson) {
      throw new Error("No se recibio el plan editorial a ejecutar.");
    }

    const plan = decodeEditorialCommandPlan(planJson);
    const executionSummary = await executeEditorialCommandPlan(plan, commandState);
    response.redirect(
      `/backoffice/news/new?studio=command&ok=${encodeURIComponent(`Comando ejecutado - ${executionSummary}`)}`,
    );
  } catch (error) {
    if (error instanceof Error) {
      response.status(400).send(
        await renderUnifiedEditorialPage({
          activeMode: "command",
          error: error.message,
          commandState: {
            ...commandState,
            summary: "El plan no se pudo ejecutar.",
          },
        }),
      );
      return;
    }
    next(error);
  }
});

app.get("/backoffice/news/new", boGuard, async (request, response, next) => {
  try {
    const studio = readString(request.query.studio).toLowerCase();
    const ok = readString(request.query.ok);
    const template = readString(request.query.template).toLowerCase();
    const aiResearch = await getAiResearchSettings(prisma);
    const pageParams: Parameters<typeof renderUnifiedEditorialPage>[0] = {
      activeMode: "command",
      commandState: resolveEditorialCommandTemplate(template, aiResearch.campaignLine),
    };
    if (studio === "batch" && ok) {
      pageParams.batchState = { summary: ok };
    }
    if (studio === "rewrite" && ok) {
      pageParams.rewriteState = { summary: ok };
    }
    if (ok) {
      pageParams.commandState = {
        ...(pageParams.commandState ?? {}),
        summary: ok,
      };
    }
    response.send(
      await renderUnifiedEditorialPage(pageParams),
    );
  } catch (error) {
    next(error);
  }
});

app.get("/backoffice/news/review", boGuard, async (request, response, next) => {
  try {
    const rows = await prisma.news.findMany({
      where: { aiDecision: "REVIEW" },
      orderBy: [{ updatedAt: "desc" }],
      take: 300,
    });
    const body = `<div class="grid">
      <div class="card">
        <div class="split-title">
          <div>
            <div class="bo-kicker">Revision editorial</div>
            <h3 style="margin-top:10px;">Piezas en review</h3>
          </div>
          <a class="button" href="/backoffice/news/new?template=internalize">Volver a consola IA</a>
        </div>
        <p class="muted">Esta cola concentra notas que el agente fotografo, compliance o la validacion editorial dejaron pendientes. Editalas, completales portada y luego publicalas.</p>
      </div>
      ${renderNewsTable(rows, { frontendBaseUrl: normalizedFrontendBaseUrl() })}
    </div>`;
    response.send(backofficeShell("Revision editorial", body, readString(request.query.ok)));
  } catch (error) {
    next(error);
  }
});

app.get("/backoffice/ia-lab", boGuard, (_request, response) => {
  response.send(renderIaLab());
});

app.get("/backoffice/polls", boGuard, async (request, response, next) => {
  try {
    const rows = await buildBackofficePollRows();
    const body = `<div class="grid">
      ${renderPollTable(rows)}
    </div>`;
    response.send(backofficeShell("Encuestas", body, readString(request.query.ok)));
  } catch (error) {
    next(error);
  }
});

app.get("/backoffice/users", boGuard, async (request, response, next) => {
  try {
    const rows = await buildBackofficeUserRows();
    const total = rows.length;
    const freeCount = rows.filter((user) => user.plan === UserPlan.FREE).length;
    const premiumCount = rows.filter((user) => user.plan === UserPlan.PREMIUM).length;

    const body = `<div class="grid">
      <div class="card">
        <div class="split-title" style="margin-bottom:8px;">
          <h3>Sistema de usuarios</h3>
          <a class="button primary" href="/backoffice/users/new">Nuevo usuario</a>
        </div>
        <p class="muted" style="margin-bottom:10px;">Los registros publicos nuevos entran por defecto en <strong>FREE</strong>. Desde este modulo puedes escalar cuentas a <strong>PREMIUM</strong>.</p>
        <div style="display:grid; gap:10px; grid-template-columns:repeat(3,minmax(0,1fr));">
          <div style="border:1px solid #2d2d2d; border-radius:10px; padding:10px; background:#121212;"><p style="margin:0; font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:#a5a5a5;">Usuarios</p><strong style="font-size:28px; font-family:inherit;">${total}</strong></div>
          <div style="border:1px solid #3b4429; border-radius:10px; padding:10px; background:#13180f;"><p style="margin:0; font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:#d3e0b2;">Plan FREE</p><strong style="font-size:28px; font-family:inherit;">${freeCount}</strong></div>
          <div style="border:1px solid #574823; border-radius:10px; padding:10px; background:#1f1a0f;"><p style="margin:0; font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:#f3dc9f;">Plan PREMIUM</p><strong style="font-size:28px; font-family:inherit;">${premiumCount}</strong></div>
        </div>
      </div>
      ${renderUsersTable(rows)}
    </div>`;

    response.send(backofficeShell("Usuarios", body, readString(request.query.ok)));
  } catch (error) {
    next(error);
  }
});

app.get("/backoffice/users/new", boGuard, (_request, response) => {
  response.send(renderUserForm({ action: "/backoffice/users" }));
});

app.post("/backoffice/users", boGuard, async (request, response, next) => {
  try {
    const email = normalizeUserEmail(request.body.email);
    const password = readString(request.body.password);
    const displayName = normalizeDisplayName(request.body.displayName);
    const selectedPlan = normalizeUserPlanInput(request.body.plan, UserPlan.FREE);

    assertValidUserEmail(email);
    assertValidUserPassword(password);

    const passwordHash = await hashUserPassword(password);
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName,
        plan: selectedPlan,
      },
    });

    response.redirect(`/backoffice/users?ok=${encodeURIComponent(`Usuario creado: ${email} (${selectedPlan})`)}`);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
      response.status(409).send(
        renderUserForm({
          action: "/backoffice/users",
          error: "Ya existe un usuario con ese email.",
          data: {
            email: readString(request.body.email),
            displayName: readString(request.body.displayName),
            plan: normalizeUserPlanInput(request.body.plan, UserPlan.FREE),
          },
        }),
      );
      return;
    }

    if (error instanceof Error) {
      response.status(400).send(
        renderUserForm({
          action: "/backoffice/users",
          error: error.message,
          data: {
            email: readString(request.body.email),
            displayName: readString(request.body.displayName),
            plan: normalizeUserPlanInput(request.body.plan, UserPlan.FREE),
          },
        }),
      );
      return;
    }

    next(error);
  }
});

app.post("/backoffice/users/:id/plan", boGuard, async (request, response, next) => {
  try {
    const id = readString(request.params.id);
    if (!id) {
      response.status(400).send(backofficeShell("Error", `<div class="card">ID invalido.</div>`));
      return;
    }

    const nextPlan = normalizeUserPlanInput(request.body.plan, UserPlan.FREE);
    await prisma.user.update({
      where: { id },
      data: { plan: nextPlan },
    });

    response.redirect(`/backoffice/users?ok=${encodeURIComponent(`Plan actualizado a ${nextPlan}`)}`);
  } catch (error) {
    next(error);
  }
});

app.get("/backoffice/polls/new", boGuard, (_request, response) => {
  response.send(
    renderPollForm({
      mode: "create",
      action: "/backoffice/polls",
      candidates: FIXED_CANDIDATE_OPTIONS,
    }),
  );
});

app.post("/backoffice/polls", boGuard, async (request, response, next) => {
  try {
    const normalized = normalizePollInput(request.body as Record<string, unknown>);
    const uniqueSlug = await ensureUniquePollSlug(prisma, normalized.slug);

    if (normalized.isFeatured) {
      await prisma.poll.updateMany({
        data: { isFeatured: false },
        where: { isFeatured: true },
      });
    }

    await prisma.poll.create({
      data: {
        slug: uniqueSlug,
        title: normalized.title,
        question: normalized.question,
        hookLabel: normalized.hookLabel,
        footerCta: normalized.footerCta,
        description: normalized.description,
        interviewUrl: normalized.interviewUrl,
        coverImageUrl: normalized.coverImageUrl,
        status: normalized.status,
        isFeatured: normalized.isFeatured,
        startsAt: normalized.startsAt,
        endsAt: normalized.endsAt,
        publishedAt: normalized.publishedAt,
        options: {
          create: normalized.options,
        },
      },
    });

    response.redirect(`/backoffice/polls?ok=${encodeURIComponent("Encuesta creada")}`);
  } catch (error) {
    if (error instanceof Error) {
      response.status(400).send(
        renderPollForm({
          mode: "create",
          action: "/backoffice/polls",
          candidates: FIXED_CANDIDATE_OPTIONS,
          error: error.message,
          data: request.body as Partial<Poll>,
        }),
      );
      return;
    }
    next(error);
  }
});

app.get("/backoffice/polls/:id/edit", boGuard, async (request, response, next) => {
  try {
    const id = readString(request.params.id);
    if (!id) {
      response.status(400).send(backofficeShell("Error", `<div class="card">ID invalido.</div>`));
      return;
    }

    const poll = await prisma.poll.findUnique({
      where: { id },
      include: {
        options: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });
    if (!poll) {
      response.status(404).send(backofficeShell("No encontrado", `<div class="card">No se encontro la encuesta solicitada.</div>`));
      return;
    }

    const voteMap = await getPollVoteCountMap(poll.id);
    const snapshot = buildPollSnapshot(poll.options, voteMap);
    response.send(
      renderPollForm({
        mode: "edit",
        action: `/backoffice/polls/${poll.id}`,
        data: poll,
        candidates: FIXED_CANDIDATE_OPTIONS,
        totalVotes: snapshot.totalVotes,
        leaderLabel: snapshot.leader?.label ?? null,
        publicUrl: pollPublicUrl(poll.slug),
      }),
    );
  } catch (error) {
    next(error);
  }
});

app.post("/backoffice/polls/:id", boGuard, async (request, response, next) => {
  try {
    const id = readString(request.params.id);
    if (!id) {
      response.status(400).send(backofficeShell("Error", `<div class="card">ID invalido.</div>`));
      return;
    }

    const normalized = normalizePollInput(request.body as Record<string, unknown>);
    const uniqueSlug = await ensureUniquePollSlug(prisma, normalized.slug, id);

    if (normalized.isFeatured) {
      await prisma.poll.updateMany({
        data: { isFeatured: false },
        where: { isFeatured: true, id: { not: id } },
      });
    }

    await prisma.poll.update({
      where: { id },
      data: {
        slug: uniqueSlug,
        title: normalized.title,
        question: normalized.question,
        hookLabel: normalized.hookLabel,
        footerCta: normalized.footerCta,
        description: normalized.description,
        interviewUrl: normalized.interviewUrl,
        coverImageUrl: normalized.coverImageUrl,
        status: normalized.status,
        isFeatured: normalized.isFeatured,
        startsAt: normalized.startsAt,
        endsAt: normalized.endsAt,
        publishedAt: normalized.publishedAt,
      },
    });

    const existingOptions = await prisma.pollOption.findMany({
      where: { pollId: id },
      orderBy: { sortOrder: "asc" },
    });
    for (const option of normalized.options) {
      const current = existingOptions.find((candidate) => candidate.sortOrder === option.sortOrder);
      if (current) {
        await prisma.pollOption.update({
          where: { id: current.id },
          data: {
            label: option.label,
            colorHex: option.colorHex,
            emoji: option.emoji,
          },
        });
      } else {
        await prisma.pollOption.create({
          data: {
            pollId: id,
            label: option.label,
            sortOrder: option.sortOrder,
            colorHex: option.colorHex,
            emoji: option.emoji,
          },
        });
      }
    }

    response.redirect(`/backoffice/polls?ok=${encodeURIComponent("Encuesta actualizada")}`);
  } catch (error) {
    if (error instanceof Error) {
      const id = readString(request.params.id);
      response.status(400).send(
        renderPollForm({
          mode: "edit",
          action: `/backoffice/polls/${id}`,
          candidates: FIXED_CANDIDATE_OPTIONS,
          data: request.body as Partial<Poll>,
          error: error.message,
        }),
      );
      return;
    }
    next(error);
  }
});

app.post("/backoffice/polls/:id/bootstrap-hardcoded", boGuard, async (request, response, next) => {
  try {
    const id = readString(request.params.id);
    if (!id) {
      response.status(400).send(backofficeShell("Error", `<div class="card">ID invalido.</div>`));
      return;
    }

    const poll = await prisma.poll.findUnique({
      where: { id },
      select: { id: true, question: true },
    });
    if (!poll) {
      response.status(404).send(backofficeShell("No encontrado", `<div class="card">No se encontro la encuesta solicitada.</div>`));
      return;
    }

    const normalizedQuestion = normalizePollQuestionText(poll.question);
    if (normalizedQuestion !== poll.question) {
      await prisma.poll.update({
        where: { id },
        data: { question: normalizedQuestion },
      });
    }

    const applied = await replacePollVotesWithHardcodedBase(id);
    const leader =
      [...applied.perCandidate].sort((a, b) => b.votes - a.votes || a.label.localeCompare(b.label, "es-AR"))[0]?.label ??
      "sin lider";

    response.redirect(
      `/backoffice/polls?ok=${encodeURIComponent(
        `Base hardcodeada aplicada (${applied.totalVotes} votos). Lider actual: ${leader}.`,
      )}`,
    );
  } catch (error) {
    next(error);
  }
});

app.post("/backoffice/polls/:id/delete", boGuard, async (request, response, next) => {
  try {
    const id = readString(request.params.id);
    if (!id) {
      response.status(400).send(backofficeShell("Error", `<div class="card">ID invalido.</div>`));
      return;
    }

    await prisma.poll.delete({ where: { id } });
    response.redirect(`/backoffice/polls?ok=${encodeURIComponent("Encuesta eliminada")}`);
  } catch (error) {
    next(error);
  }
});

app.post("/backoffice/news", boGuard, async (request, response, next) => {
  try {
    const normalized = normalizeNewsInput(request.body as Record<string, unknown>);
    const { safeInput, review } = await validateWithEditorialAi(normalized);
    const uniqueSlug = await ensureUniqueSlug(prisma, safeInput.slug);

    if (safeInput.isHero) {
      await prisma.news.updateMany({
        data: { isHero: false },
        where: { isHero: true },
      });
    }

    await prisma.news.create({
      data: {
        ...safeInput,
        slug: uniqueSlug,
        aiDecision: review.decision,
        aiReason: review.reason,
        aiScore: review.score,
        aiWarnings: review.warnings,
        aiModel: review.model,
        aiEvaluatedAt: new Date(),
      },
    });

    response.redirect(`/backoffice?ok=${encodeURIComponent(`Noticia creada - IA ${review.decision}`)}`);
  } catch (error) {
    if (error instanceof Error) {
      const aiResearch = await getAiResearchSettings(prisma);
      response.status(400).send(
        renderNewsForm({
          mode: "create",
          action: "/backoffice/news",
          error: error.message,
          data: request.body,
          aiResearch,
        }),
      );
      return;
    }
    next(error);
  }
});

app.get("/backoffice/news/:id/edit", boGuard, async (request, response, next) => {
  try {
    const id = readString(request.params.id);
    if (!id) {
      response.status(400).send(backofficeShell("Error", `<div class="card">ID invalido.</div>`));
      return;
    }
    const news = await prisma.news.findUnique({ where: { id } });
    if (!news) {
      response.status(404).send(backofficeShell("No encontrado", `<div class="card">No se encontro la noticia solicitada.</div>`));
      return;
    }

    const aiResearch = await getAiResearchSettings(prisma);
    response.send(
      renderNewsForm({
        mode: "edit",
        action: `/backoffice/news/${news.id}`,
        data: {
          ...news,
          imageUrl:
            resolveManagedFeedImage(news.imageUrl, {
              sourceUrl: news.sourceUrl,
              seed: news.title,
            }) ?? news.imageUrl,
        },
        aiResearch,
      }),
    );
  } catch (error) {
    next(error);
  }
});

app.post("/backoffice/news/:id", boGuard, async (request, response, next) => {
  try {
    const id = readString(request.params.id);
    if (!id) {
      response.status(400).send(backofficeShell("Error", `<div class="card">ID invalido.</div>`));
      return;
    }
    const normalized = normalizeNewsInput(request.body as Record<string, unknown>);
    const { safeInput, review } = await validateWithEditorialAi(normalized);
    const uniqueSlug = await ensureUniqueSlug(prisma, safeInput.slug, id);

    if (safeInput.isHero) {
      await prisma.news.updateMany({
        data: { isHero: false },
        where: { isHero: true, id: { not: id } },
      });
    }

    await prisma.news.update({
      where: { id },
      data: {
        ...safeInput,
        slug: uniqueSlug,
        aiDecision: review.decision,
        aiReason: review.reason,
        aiScore: review.score,
        aiWarnings: review.warnings,
        aiModel: review.model,
        aiEvaluatedAt: new Date(),
      },
    });

    response.redirect(`/backoffice?ok=${encodeURIComponent(`Noticia actualizada - IA ${review.decision}`)}`);
  } catch (error) {
    if (error instanceof Error) {
      const aiResearch = await getAiResearchSettings(prisma);
      response.status(400).send(
        renderNewsForm({
          mode: "edit",
          action: `/backoffice/news/${request.params.id}`,
          error: error.message,
          data: request.body,
          aiResearch,
        }),
      );
      return;
    }
    next(error);
  }
});

app.post("/backoffice/news/:id/delete", boGuard, async (request, response, next) => {
  try {
    const id = readString(request.params.id);
    if (!id) {
      response.status(400).send(backofficeShell("Error", `<div class="card">ID invalido.</div>`));
      return;
    }
    await prisma.news.delete({ where: { id } });
    response.redirect(`/backoffice?ok=${encodeURIComponent("Noticia eliminada")}`);
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: string }).code;
    if (code === "P2025") {
      response.status(404).json({ error: "Registro no encontrado" });
      return;
    }
  }

  if (error instanceof Error) {
    if (error.message.includes("Origen no permitido por CORS")) {
      response.status(403).json({ error: error.message });
      return;
    }
    response.status(400).json({ error: error.message });
    return;
  }
  response.status(500).json({ error: "Error interno" });
});

async function bootstrap(): Promise<void> {
  await prisma.$connect();
  startEditorialAutopilotHeartbeat();
  app.listen(PORT, () => {
    console.log(`Pulso backend escuchando en http://localhost:${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error("No se pudo iniciar el backend", error);
  process.exit(1);
});

const shutdown = async () => {
  if (autopilotHeartbeatTimer) {
    clearInterval(autopilotHeartbeatTimer);
    autopilotHeartbeatTimer = null;
  }
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
