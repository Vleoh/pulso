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
import { toFeedItem, dedupeByKey } from "./feed";
import { getExternalNews } from "./externalNews";
import { getMarketData, getWeatherData } from "./signalData";
import { buildManagedImageUrl, buildManagedVideoUrl, proxyManagedMediaRequest } from "./mediaProxy";
import { PROVINCE_OPTIONS, SECTION_OPTIONS } from "./catalog";
import {
  asNullable,
  isNewsSection,
  isNewsStatus,
  isPollStatus,
  isProvince,
  normalizeHttpUrl,
  normalizeImageUrl,
  readString,
  readBoolean,
} from "./utils";
import { prisma } from "./prismaClient";
import {
  applyEditorialSuggestions,
  askEditorialWithAi,
  evaluateEditorialWithAi,
  generateBatchDraftsWithAi,
  generatePollDraftWithAi,
  generateDraftWithAi,
  getEditorialAiHealth,
  type EditorialReview,
} from "./editorialAi";
import { buildAiNewsContext } from "./newsContextWrapper";
import {
  getAiResearchSettings,
  getHomeEngagementSettings,
  getHomeTheme,
  HOME_THEME_OPTIONS,
  normalizeHomeTheme,
  setAiResearchSettings,
  setHomeEngagementSettings,
  setHomeTheme,
} from "./siteSettings";
import { buildCroppedImageUrl, buildNewsResearchContext, sourceFeedToText } from "./newsResearchAgent";
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
const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? "*,http://localhost:3000,http://127.0.0.1:3000,https://*.vercel.app")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const BATCH_NEWS_FALLBACK_IMAGES = [
  "https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1444653389962-8149286c578a?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1504711331083-9c895941bf81?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1464207687429-7505649dae38?auto=format&fit=crop&w=1600&q=80",
];
const GALLERY_BLOCK_START = "[[GALERIA_FOTOS]]";
const GALLERY_BLOCK_END = "[[/GALERIA_FOTOS]]";
const GALLERY_BLOCK_REGEX = /\[\[GALERIA_FOTOS\]\][\s\S]*?\[\[\/GALERIA_FOTOS\]\]/gi;
const VIDEO_BLOCK_START = "[[VIDEO_PRINCIPAL]]";
const VIDEO_BLOCK_END = "[[/VIDEO_PRINCIPAL]]";
const VIDEO_BLOCK_REGEX = /\[\[VIDEO_PRINCIPAL\]\][\s\S]*?\[\[\/VIDEO_PRINCIPAL\]\]/gi;
const IMAGE_PROBE_TIMEOUT_MS = 4500;
const IMAGE_PROBE_CACHE_TTL_MS = 15 * 60 * 1000;
const imageProbeCache = new Map<string, { ok: boolean; expiresAt: number }>();

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
  const source = seedText.trim().toLowerCase() || "pulso-pais";
  let hash = 0;
  for (const char of source) {
    hash = (hash * 31 + char.charCodeAt(0)) % 2147483647;
  }
  return BATCH_NEWS_FALLBACK_IMAGES[Math.abs(hash) % BATCH_NEWS_FALLBACK_IMAGES.length] ?? BATCH_NEWS_FALLBACK_IMAGES[0] ?? "";
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
    if (await probeVideoUrl(url)) {
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
  notes.unshift("Borrador generado con agente periodista (agenda caliente + reescritura propia).");

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
  let finalImage = await pickReachableImage(coverImageCandidates, 6);
  if (!finalImage) {
    const fallbackImage = applyResearchImageTransform(fallbackResearchImage(fallbackSeed), settings);
    finalImage = fallbackImage && (await probeImageUrl(fallbackImage)) ? fallbackImage : null;
  }

  const gallerySourceRaw = sourceImageCandidates
    .filter((url) => !coverImageCandidatesRaw.includes(url))
    .slice(0, 6);
  const galleryCandidates = gallerySourceRaw
    .map((url) => applyResearchImageTransform(url, settings))
    .filter((url): url is string => Boolean(url));
  const galleryImages = (await pickReachableImages(galleryCandidates, 4, 10))
    .filter((url) => url !== finalImage)
    .map((url) => buildManagedImageUrl(url))
    .filter((url): url is string => Boolean(url));

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

  const proxiedCover = buildManagedImageUrl(finalImage);
  let finalBody = appendPrimaryVideoBlockToBody(
    suggestion.body ?? suggestion.excerpt ?? null,
    buildManagedVideoUrl(finalVideo),
    buildManagedImageUrl(finalVideoPoster),
  );
  finalBody = appendGalleryBlockToBody(finalBody, galleryImages);
  if (finalImage) {
    notes.push("Portada visual confirmada por agente periodista.");
  }
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

function fallbackBatchImageByIndex(index: number): string {
  if (BATCH_NEWS_FALLBACK_IMAGES.length === 0) {
    return "";
  }
  return BATCH_NEWS_FALLBACK_IMAGES[Math.abs(index) % BATCH_NEWS_FALLBACK_IMAGES.length] || BATCH_NEWS_FALLBACK_IMAGES[0] || "";
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
  activeMode?: "single" | "batch" | "rewrite";
  error?: string;
  data?: Partial<Prisma.NewsUncheckedCreateInput>;
  batchState?: Partial<BatchNewsFormState>;
  rewriteState?: Partial<ExternalRewriteFormState>;
}): Promise<string> {
  const aiResearch = await getAiResearchSettings(prisma);
  const renderParams: Parameters<typeof renderNewsForm>[0] = {
    mode: "create",
    action: "/backoffice/news",
    aiResearch,
    editorialStudio: {
      activeMode: params?.activeMode ?? "single",
      batch: {
        ...defaultBatchNewsFormState(),
        campaignLine: aiResearch.campaignLine,
        ...(params?.batchState ?? {}),
      },
      rewrite: {
        ...defaultExternalRewriteFormState(aiResearch.campaignLine),
        ...(params?.rewriteState ?? {}),
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

    const [internalRelated, externalRelated] = await Promise.all([
      prisma.news.findMany({
        where: {
          id: { not: item.id },
          status: NewsStatus.PUBLISHED,
          OR: [{ section: item.section }, ...(item.province ? [{ province: item.province }] : [])],
        },
        orderBy: [{ isFeatured: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
        take: 8,
      }),
      getExternalNews(),
    ]);

    response.json({
      item: {
        ...item,
        imageUrl: buildManagedImageUrl(normalizeImageUrl(item.imageUrl)),
        sourceUrl: normalizeHttpUrl(item.sourceUrl),
        publishedAt: (item.publishedAt ?? item.createdAt).toISOString(),
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      },
      related: dedupeByKey([
        ...internalRelated.map(toFeedItem),
        ...externalRelated.filter((entry) => entry.section === item.section),
      ]).slice(0, 6),
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
    response.json({
      suggestion: {
        ...suggestion,
        imageUrl: buildManagedImageUrl(suggestion.imageUrl),
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
    response.json({
      answer: answer?.draft
        ? {
            ...answer,
            draft: {
              ...answer.draft,
              imageUrl: buildManagedImageUrl(answer.draft.imageUrl),
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
    const [news, homeTheme, engagementSettings, aiResearchSettings, pollRows] = await Promise.all([
      prisma.news.findMany({
        orderBy: [{ updatedAt: "desc" }],
        take: 300,
      }),
      getHomeTheme(prisma),
      getHomeEngagementSettings(prisma),
      getAiResearchSettings(prisma),
      buildBackofficePollRows(),
    ]);

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
            <span>${currentErrorSafe(item.section)}${item.province ? ` · ${currentErrorSafe(item.province)}` : ""} · IA ${currentErrorSafe(
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
            <span>${item.totalVotes} votos · lider ${currentErrorSafe(item.leaderLabel ?? "sin definir")}</span>
          </div>
          <a class="button" href="/backoffice/polls/${item.id}/edit">Abrir</a>
        </div>`;
      })
      .join("");
    const body = `<div class="grid">
      <section class="bo-hero">
        <div class="bo-hero-copy">
          <small>Panel de control</small>
          <h2>Backoffice Editorial</h2>
          <p>Centro de comando para contenido, portada, encuestas y operaciones de IA editorial. Monitorea el pulso de la nacion y actua sobre el sitio en tiempo real.</p>
        </div>
        <div class="bo-hero-art" aria-hidden="true"></div>
      </section>

      <section class="bo-stat-grid">
        <article class="bo-stat-card"><span>Total notas</span><strong>${total}</strong></article>
        <article class="bo-stat-card"><span>Publicadas</span><strong>${published}</strong></article>
        <article class="bo-stat-card"><span>Draft</span><strong>${drafts}</strong></article>
        <article class="bo-stat-card emphasis"><span>IA review</span><strong>${aiReview}</strong></article>
        <article class="bo-stat-card"><span>Externas</span><strong>${externalLinked}</strong></article>
        <article class="bo-stat-card"><span>Thin external</span><strong>${thinExternal}</strong></article>
        <article class="bo-stat-card"><span>Encuestas live</span><strong>${pollPublished}</strong></article>
        <article class="bo-stat-card"><span>Votos totales</span><strong>${pollVotes}</strong></article>
      </section>

      <section class="bo-module-grid">
        <div class="grid">
          <article class="card">
            <div class="split-title">
              <div>
                <div class="bo-kicker">Modulo de encuestas</div>
                <h3 style="margin-top:10px;">Monitor Electoral y Conversion</h3>
              </div>
              <a class="button primary" href="/backoffice/polls/new">Nueva encuesta</a>
            </div>
            <p class="muted">Crea encuestas para Instagram y trafico del sitio, monitorea conversion de votos y ranking de candidatos con analiticas en vivo.</p>
            <div class="actions">
              <a class="button" href="/backoffice/polls">Gestionar encuestas</a>
              <a class="button" href="/backoffice/news/new?studio=rewrite">Internalizar externas</a>
            </div>
          </article>

          <article class="card">
            <div class="split-title">
              <div>
                <div class="bo-kicker">Flujo editorial reciente</div>
                <h3 style="margin-top:10px;">Actividad del newsroom</h3>
              </div>
            </div>
            <div class="bo-activity-list">
              ${recentNewsRows || `<div class="bo-note-box"><p>No hay noticias recientes para mostrar.</p></div>`}
              ${recentPollRows}
            </div>
          </article>

          <article class="card">
            <div class="split-title">
              <div>
                <div class="bo-kicker">Operaciones IA</div>
                <h3 style="margin-top:10px;">Acciones rapidas</h3>
              </div>
            </div>
            <div class="bo-action-grid">
              <a class="bo-action-tile" href="/backoffice/news/new"><span>+</span><strong>Crear nota</strong></a>
              <a class="bo-action-tile" href="/backoffice/news/new?studio=batch"><span>◫</span><strong>Generar lote IA</strong></a>
              <a class="bo-action-tile" href="/backoffice/news/new?studio=rewrite"><span>↺</span><strong>Reformular externas</strong></a>
              <a class="bo-action-tile" href="/backoffice/users"><span>◎</span><strong>Ver usuarios</strong></a>
            </div>
          </article>
        </div>

        <aside class="bo-side-panel">
          <div>
            <h3>Control de portada</h3>
            <p>Gestiona layout editorial, interacciones del front y comportamiento del agente periodista sin salir del dashboard.</p>
          </div>

          <form id="theme-control" method="post" action="/backoffice/settings/theme" style="display:grid; gap:12px;">
            <div class="field">
              <label for="homeTheme">Layout de portada</label>
              <select id="homeTheme" name="homeTheme">${themeOptions}</select>
            </div>
            <button class="primary" type="submit">Guardar cambios portada</button>
          </form>

          <form method="post" action="/backoffice/settings/engagement" style="display:grid; gap:10px;">
            <div class="bo-toggle-row">
              <div><strong>Comentarios</strong><span>Control global de discusion</span></div>
              <label><input type="checkbox" name="commentsEnabled" ${engagementSettings.commentsEnabled ? "checked" : ""} /></label>
            </div>
            <div class="bo-toggle-row">
              <div><strong>Reacciones</strong><span>Botones de apoyo y guardado</span></div>
              <label><input type="checkbox" name="reactionsEnabled" ${engagementSettings.reactionsEnabled ? "checked" : ""} /></label>
            </div>
            <div class="bo-toggle-row">
              <div><strong>Analisis en vivo</strong><span>Insights contextuales en tarjetas</span></div>
              <label><input type="checkbox" name="analysisEnabled" ${engagementSettings.analysisEnabled ? "checked" : ""} /></label>
            </div>
            <button class="primary" type="submit">Guardar interacciones</button>
          </form>

          <form method="post" action="/backoffice/settings/ai-research" style="display:grid; gap:12px;">
            <div>
              <h3 style="margin-bottom:8px;">Agente periodista</h3>
              <p>Investiga agenda, toma fuentes, internaliza enlaces externos y consigue media portada.</p>
            </div>
            <div class="bo-toggle-row">
              <div><strong>Activo</strong><span>${aiResearchSettings.enabled ? "Investigando y reescribiendo" : "Desactivado"}</span></div>
              <label><input type="checkbox" name="enabled" ${aiResearchSettings.enabled ? "checked" : ""} /></label>
            </div>
            <div class="bo-toggle-row">
              <div><strong>Leer texto completo</strong><span>Extrae cuerpo desde la fuente</span></div>
              <label><input type="checkbox" name="fetchArticleText" ${aiResearchSettings.fetchArticleText ? "checked" : ""} /></label>
            </div>
            <div class="bo-toggle-row">
              <div><strong>Sin link externo</strong><span>Publica la nota propia como destino principal</span></div>
              <label><input type="checkbox" name="internalizeSourceLinks" ${aiResearchSettings.internalizeSourceLinks ? "checked" : ""} /></label>
            </div>
            <div class="bo-toggle-row">
              <div><strong>Crop automatico</strong><span>${aiResearchSettings.cropWidth}x${aiResearchSettings.cropHeight}</span></div>
              <label><input type="checkbox" name="cropImage" ${aiResearchSettings.cropImage ? "checked" : ""} /></label>
            </div>
            <div class="bo-compact-grid">
              <div class="field">
                <label for="hotNewsLimit">Fuentes max.</label>
                <input id="hotNewsLimit" name="hotNewsLimit" type="number" min="3" max="20" value="${aiResearchSettings.hotNewsLimit}" />
              </div>
              <div class="field">
                <label for="cropWidth">Crop</label>
                <div style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px;">
                  <input id="cropWidth" name="cropWidth" type="number" min="480" max="2400" value="${aiResearchSettings.cropWidth}" />
                  <input id="cropHeight" name="cropHeight" type="number" min="320" max="1800" value="${aiResearchSettings.cropHeight}" />
                </div>
              </div>
            </div>
            <div class="field">
              <label for="campaignLine">Bajada/campana activa</label>
              <textarea id="campaignLine" name="campaignLine" rows="3">${currentErrorSafe(aiResearchSettings.campaignLine)}</textarea>
            </div>
            <button class="primary" type="submit">Guardar agente periodista</button>
            <p>Notas con fuente externa detectadas: <strong>${externalLinked}</strong>. Candidatas a internalizacion inmediata: <strong>${thinExternal}</strong>.</p>
          </form>
        </aside>
      </section>

      ${renderNewsTable(news, { frontendBaseUrl: normalizedFrontendBaseUrl() })}
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
        const reachableGallery = (await pickReachableImages(galleryImages, 3, 8))
          .filter((url) => url !== finalImage)
          .map((url) => buildManagedImageUrl(url))
          .filter((url): url is string => Boolean(url));
        const reachableVideo = await pickReachableVideo(
          uniqueNormalizedVideoUrls(sourceVideoCandidates.map((entry) => entry?.videoUrl ?? null), 3),
          3,
        );
        const videoPoster = buildManagedImageUrl(
          uniqueNormalizedImageUrls(
            [sourceItem?.videoPosterUrl ?? null, researchLead?.videoPosterUrl ?? null, finalImage],
            3,
          )[0] ?? null,
        );

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
          imageUrl: finalImage,
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
      `/backoffice/news/new?studio=batch&ok=${encodeURIComponent(`${detail}${researchDetail} Modelo: ${batch.model}.`)}`,
    );
  } catch (error) {
    if (error instanceof Error) {
      response.status(400).send(
        await renderUnifiedEditorialPage({
          activeMode: "batch",
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
      `/backoffice/news/new?studio=rewrite&ok=${encodeURIComponent(summaryParts.join(" � "))}`,
    );
  } catch (error) {
    if (error instanceof Error) {
      response.status(400).send(
        await renderUnifiedEditorialPage({
          activeMode: "rewrite",
          error: error.message,
          rewriteState,
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
    const pageParams: Parameters<typeof renderUnifiedEditorialPage>[0] = {
      activeMode: studio === "batch" || studio === "rewrite" ? (studio as "batch" | "rewrite") : "single",
    };
    if (studio === "batch" && ok) {
      pageParams.batchState = { summary: ok };
    }
    if (studio === "rewrite" && ok) {
      pageParams.rewriteState = { summary: ok };
    }
    response.send(
      await renderUnifiedEditorialPage(pageParams),
    );
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
          imageUrl: buildManagedImageUrl(news.imageUrl) ?? news.imageUrl,
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
  app.listen(PORT, () => {
    console.log(`Pulso backend escuchando en http://localhost:${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error("No se pudo iniciar el backend", error);
  process.exit(1);
});

const shutdown = async () => {
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);


