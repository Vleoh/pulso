import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import { lookup } from "node:dns/promises";
import fs from "node:fs/promises";
import { isIP } from "node:net";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import type { Request, Response } from "express";
import { normalizeHttpUrl, normalizeImageUrl, readString } from "./utils";

export type ManagedMediaKind = "image" | "video";

const MEDIA_PROXY_SECRET = process.env.MEDIA_PROXY_SECRET ?? process.env.ADMIN_JWT_SECRET ?? "pulso-pais-media-proxy";
const HOST_CACHE_TTL_MS = 60 * 60 * 1000;
const IMAGE_CAPTURE_TIMEOUT_MS = 12_000;
const MEDIA_CACHE_DIR = path.join(os.tmpdir(), "pulso-pais-media-cache");
const hostSafetyCache = new Map<string, { allowed: boolean; expiresAt: number }>();
const mediaCaptureCache = new Map<string, Promise<CachedMediaRecord | null>>();
let mediaCacheReady: Promise<void> | null = null;

type CachedMediaRecord = {
  filePath: string;
  metaPath: string;
  contentType: string;
  size: number | null;
};

type CaptureImageOptions = {
  referer?: string | null;
};

function resolveBackendPublicUrl(): string {
  const fallback =
    process.env.NODE_ENV === "production" || process.env.RENDER
      ? "https://pulso-backend-kgtc.onrender.com"
      : "http://localhost:8080";

  const raw =
    readString(process.env.BACKEND_PUBLIC_URL) ||
    readString(process.env.RENDER_EXTERNAL_URL) ||
    readString(process.env.RENDER_EXTERNAL_HOSTNAME) ||
    fallback;

  const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(normalized).toString().replace(/\/+$/, "");
  } catch {
    return fallback;
  }
}

const BACKEND_PUBLIC_URL = resolveBackendPublicUrl();
const BACKEND_PUBLIC_ORIGIN = new URL(BACKEND_PUBLIC_URL).origin;

function signPayload(payload: string): string {
  return crypto.createHmac("sha256", MEDIA_PROXY_SECRET).update(payload).digest("hex");
}

function mediaCacheKey(kind: ManagedMediaKind, url: string): string {
  return crypto.createHash("sha256").update(`${kind}:${url}`).digest("hex");
}

async function ensureMediaCacheDir(): Promise<void> {
  if (!mediaCacheReady) {
    mediaCacheReady = fs.mkdir(MEDIA_CACHE_DIR, { recursive: true }).then(() => undefined);
  }
  await mediaCacheReady;
}

function cachePaths(kind: ManagedMediaKind, url: string): { filePath: string; metaPath: string } {
  const cacheKey = mediaCacheKey(kind, url);
  return {
    filePath: path.join(MEDIA_CACHE_DIR, `${cacheKey}.${kind === "image" ? "img" : "bin"}`),
    metaPath: path.join(MEDIA_CACHE_DIR, `${cacheKey}.json`),
  };
}

async function readCachedMediaRecord(kind: ManagedMediaKind, url: string): Promise<CachedMediaRecord | null> {
  await ensureMediaCacheDir();
  const { filePath, metaPath } = cachePaths(kind, url);
  try {
    const [metaRaw, stat] = await Promise.all([fs.readFile(metaPath, "utf8"), fs.stat(filePath)]);
    const parsed = JSON.parse(metaRaw) as { contentType?: string; size?: number | null };
    const contentType = readString(parsed.contentType) || `${kind}/*`;
    return {
      filePath,
      metaPath,
      contentType,
      size: typeof parsed.size === "number" && Number.isFinite(parsed.size) ? parsed.size : stat.size,
    };
  } catch {
    return null;
  }
}

async function persistCapturedMedia(
  kind: ManagedMediaKind,
  url: string,
  buffer: Buffer,
  contentType: string,
): Promise<CachedMediaRecord> {
  await ensureMediaCacheDir();
  const { filePath, metaPath } = cachePaths(kind, url);
  await Promise.all([
    fs.writeFile(filePath, buffer),
    fs.writeFile(metaPath, JSON.stringify({ contentType, size: buffer.length, cachedAt: new Date().toISOString() }), "utf8"),
  ]);
  return {
    filePath,
    metaPath,
    contentType,
    size: buffer.length,
  };
}

function safeTimingEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function isManagedProxyUrl(input: string): boolean {
  try {
    const parsed = new URL(input);
    return parsed.origin === BACKEND_PUBLIC_ORIGIN && parsed.pathname.startsWith("/api/media/proxy/");
  } catch {
    return false;
  }
}

function isValidMediaContentType(contentType: string, expectedKind: ManagedMediaKind): boolean {
  return (
    contentType.length === 0 ||
    contentType.startsWith(`${expectedKind}/`) ||
    contentType === "application/octet-stream"
  );
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const a = parts[0] ?? -1;
  const b = parts[1] ?? -1;
  if (a === 10 || a === 127) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
}

function isPrivateIpAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    return isPrivateIpv4(ip);
  }
  if (version === 6) {
    return isPrivateIpv6(ip);
  }
  return false;
}

async function ensurePublicRemoteUrl(url: string): Promise<void> {
  const parsed = new URL(url);
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local")) {
    throw new Error("Host no permitido para proxy.");
  }

  const cached = hostSafetyCache.get(hostname);
  if (cached && cached.expiresAt > Date.now()) {
    if (!cached.allowed) {
      throw new Error("Host no permitido para proxy.");
    }
    return;
  }

  const directIpVersion = isIP(hostname);
  if (directIpVersion > 0) {
    const allowed = !isPrivateIpAddress(hostname);
    hostSafetyCache.set(hostname, { allowed, expiresAt: Date.now() + HOST_CACHE_TTL_MS });
    if (!allowed) {
      throw new Error("IP privada no permitida para proxy.");
    }
    return;
  }

  const records = await lookup(hostname, { all: true, verbatim: true });
  const allowed = records.length > 0 && records.every((record) => !isPrivateIpAddress(record.address));
  hostSafetyCache.set(hostname, { allowed, expiresAt: Date.now() + HOST_CACHE_TTL_MS });
  if (!allowed) {
    throw new Error("Host no permitido para proxy.");
  }
}

type MediaPayload = {
  kind: ManagedMediaKind;
  url: string;
};

function encodePayload(payload: MediaPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload(payload: string): MediaPayload | null {
  try {
    const decoded = Buffer.from(payload, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as Partial<MediaPayload>;
    const kind = parsed.kind === "video" ? "video" : parsed.kind === "image" ? "image" : null;
    const url = normalizeHttpUrl(parsed.url);
    if (!kind || !url) {
      return null;
    }
    return { kind, url };
  } catch {
    return null;
  }
}

export function buildManagedMediaUrl(rawValue: string | null | undefined, kind: ManagedMediaKind): string | null {
  const normalized = kind === "image" ? normalizeImageUrl(rawValue) : normalizeHttpUrl(rawValue);
  if (!normalized) {
    return null;
  }
  if (isManagedProxyUrl(normalized)) {
    return normalized;
  }
  const payload = encodePayload({ kind, url: normalized });
  const signature = signPayload(payload);
  return `${BACKEND_PUBLIC_URL}/api/media/proxy/${kind}/${payload}?sig=${signature}`;
}

export function buildManagedImageUrl(rawValue: string | null | undefined): string | null {
  return buildManagedMediaUrl(rawValue, "image");
}

export function buildManagedVideoUrl(rawValue: string | null | undefined): string | null {
  return buildManagedMediaUrl(rawValue, "video");
}

function buildMediaFetchHeaders(
  purpose: "capture" | "proxy",
  expectedKind: ManagedMediaKind,
  options?: CaptureImageOptions,
  rangeHeader?: string,
): Record<string, string> {
  const referer = normalizeHttpUrl(options?.referer);
  let origin = "";
  if (referer) {
    try {
      origin = new URL(referer).origin;
    } catch {
      origin = "";
    }
  }

  return {
    accept: expectedKind === "image" ? "image/*,*/*;q=0.8" : "video/*,*/*;q=0.8",
    "user-agent": purpose === "capture" ? "PulsoPaisMediaCapture/2.0" : "PulsoPaisMediaProxy/2.0",
    ...(referer ? { referer } : {}),
    ...(origin ? { origin } : {}),
    ...(rangeHeader ? { range: rangeHeader } : {}),
  };
}

async function fetchAndCaptureImage(url: string, options?: CaptureImageOptions): Promise<CachedMediaRecord | null> {
  const normalized = normalizeImageUrl(url);
  if (!normalized) {
    return null;
  }

  const existing = await readCachedMediaRecord("image", normalized);
  if (existing) {
    return existing;
  }

  const inFlight = mediaCaptureCache.get(normalized);
  if (inFlight) {
    return inFlight;
  }

  const capturePromise = (async () => {
    await ensurePublicRemoteUrl(normalized);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IMAGE_CAPTURE_TIMEOUT_MS);
    try {
      const upstream = await fetch(normalized, {
        method: "GET",
        signal: controller.signal,
        headers: buildMediaFetchHeaders("capture", "image", options),
      });

      if (!upstream.ok || !upstream.body) {
        return null;
      }

      const contentType = upstream.headers.get("content-type") ?? "";
      if (!isValidMediaContentType(contentType, "image")) {
        return null;
      }

      const arrayBuffer = await upstream.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      if (buffer.byteLength === 0) {
        return null;
      }
      if (buffer.byteLength > 20 * 1024 * 1024) {
        return null;
      }

      return persistCapturedMedia("image", normalized, buffer, contentType || "image/jpeg");
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
      mediaCaptureCache.delete(normalized);
    }
  })();

  mediaCaptureCache.set(normalized, capturePromise);
  return capturePromise;
}

export async function ensureManagedImageCaptured(
  rawValue: string | null | undefined,
  options?: CaptureImageOptions,
): Promise<string | null> {
  const normalized = normalizeImageUrl(rawValue);
  if (!normalized) {
    return null;
  }
  if (isManagedProxyUrl(normalized)) {
    return normalized;
  }

  const captured = await fetchAndCaptureImage(normalized, options);
  if (!captured) {
    return null;
  }

  return buildManagedImageUrl(normalized);
}

async function sendCachedMedia(response: Response, record: CachedMediaRecord, method: string): Promise<void> {
  response.status(200);
  response.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800");
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("content-type", record.contentType);
  if (record.size && Number.isFinite(record.size)) {
    response.setHeader("content-length", String(record.size));
  }
  response.setHeader("Content-Disposition", "inline");

  if (method === "HEAD") {
    response.end();
    return;
  }

  const stream = createReadStream(record.filePath);
  stream.on("error", () => {
    if (!response.headersSent) {
      response.status(502).end();
    } else {
      response.destroy();
    }
  });
  stream.pipe(response);
}

export async function proxyManagedMediaRequest(
  request: Request,
  response: Response,
  expectedKind: ManagedMediaKind,
): Promise<void> {
  const payloadToken = readString(request.params.payload);
  const signature = readString(request.query.sig);

  if (!payloadToken || !signature) {
    response.status(400).json({ error: "Proxy media invalido." });
    return;
  }

  if (!safeTimingEqual(signPayload(payloadToken), signature)) {
    response.status(403).json({ error: "Firma de media invalida." });
    return;
  }

  const payload = decodePayload(payloadToken);
  if (!payload || payload.kind !== expectedKind) {
    response.status(400).json({ error: "Payload de media invalido." });
    return;
  }

  if (expectedKind === "image") {
    const cached = await readCachedMediaRecord(expectedKind, payload.url);
    if (cached) {
      await sendCachedMedia(response, cached, request.method);
      return;
    }

    const captured = await fetchAndCaptureImage(payload.url);
    if (captured) {
      await sendCachedMedia(response, captured, request.method);
      return;
    }
  }

  await ensurePublicRemoteUrl(payload.url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), expectedKind === "video" ? 20_000 : 10_000);

  try {
    const upstream = await fetch(payload.url, {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      signal: controller.signal,
      headers: buildMediaFetchHeaders(
        "proxy",
        expectedKind,
        { referer: typeof request.headers.referer === "string" ? request.headers.referer : null },
        typeof request.headers.range === "string" ? request.headers.range : undefined,
      ),
    });

    if (!upstream.ok && upstream.status !== 206) {
      response.status(404).json({ error: `Media no disponible (${upstream.status}).` });
      return;
    }

    const contentType = upstream.headers.get("content-type") ?? "";
    if (!isValidMediaContentType(contentType, expectedKind)) {
      response.status(415).json({ error: "El origen no devolvio un media valido." });
      return;
    }

    response.status(upstream.status === 206 ? 206 : 200);
    response.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800");
    response.setHeader("Access-Control-Allow-Origin", "*");

    for (const headerName of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
      const headerValue = upstream.headers.get(headerName);
      if (headerValue) {
        response.setHeader(headerName, headerValue);
      }
    }

    if (!response.getHeader("content-disposition")) {
      response.setHeader("Content-Disposition", "inline");
    }

    if (request.method === "HEAD" || !upstream.body) {
      response.end();
      return;
    }

    const body = Readable.fromWeb(upstream.body as never);
    body.on("error", () => {
      if (!response.headersSent) {
        response.status(502).end();
      } else {
        response.destroy();
      }
    });
    body.pipe(response);
  } finally {
    clearTimeout(timeout);
  }
}
