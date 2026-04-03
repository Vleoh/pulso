import crypto from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import type { Request, Response } from "express";
import { normalizeHttpUrl, normalizeImageUrl, readString } from "./utils";

export type ManagedMediaKind = "image" | "video";

const MEDIA_PROXY_SECRET = process.env.MEDIA_PROXY_SECRET ?? process.env.ADMIN_JWT_SECRET ?? "pulso-pais-media-proxy";
const HOST_CACHE_TTL_MS = 60 * 60 * 1000;
const hostSafetyCache = new Map<string, { allowed: boolean; expiresAt: number }>();

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

  await ensurePublicRemoteUrl(payload.url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), expectedKind === "video" ? 20_000 : 10_000);

  try {
    const upstream = await fetch(payload.url, {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      signal: controller.signal,
      headers: {
        accept: expectedKind === "image" ? "image/*,*/*;q=0.8" : "video/*,*/*;q=0.8",
        "user-agent": "PulsoPaisMediaProxy/1.0",
        ...(typeof request.headers.range === "string" ? { range: request.headers.range } : {}),
      },
    });

    if (!upstream.ok && upstream.status !== 206) {
      response.status(404).json({ error: `Media no disponible (${upstream.status}).` });
      return;
    }

    const contentType = upstream.headers.get("content-type") ?? "";
    const looksValid =
      contentType.length === 0 ||
      contentType.startsWith(`${expectedKind}/`) ||
      contentType === "application/octet-stream";

    if (!looksValid) {
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
