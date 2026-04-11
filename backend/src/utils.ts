import { NewsSection, NewsStatus, PollStatus, Province } from "@prisma/client";

export function slugifyText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

export function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

export function readString(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number") {
    return String(value);
  }
  return "";
}

export function asNullable(input: string): string | null {
  return input.length > 0 ? input : null;
}

export function decodeRepeatedURIComponent(input: string, max = 4): string {
  let value = String(input ?? "");
  for (let step = 0; step < max; step += 1) {
    if (!/%[0-9A-Fa-f]{2}/.test(value)) {
      break;
    }
    try {
      const decoded = decodeURIComponent(value);
      if (decoded === value) {
        break;
      }
      value = decoded;
    } catch {
      break;
    }
  }
  return value;
}

export function normalizeHttpUrl(value: unknown): string | null {
  const raw = readString(value);
  if (!raw) {
    return null;
  }

  const decoded = decodeRepeatedURIComponent(raw, 2).replace(/\s+/g, "").trim();
  const base = /^https?:\/\//i.test(decoded) ? decoded : `https://${decoded.replace(/^\/+/, "")}`;

  try {
    const parsed = new URL(base);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function normalizeImageUrl(value: unknown): string | null {
  const raw = readString(value);
  if (!raw) {
    return null;
  }

  const decoded = decodeRepeatedURIComponent(raw, 3);
  const direct = normalizeHttpUrl(decoded);
  if (!direct) {
    return null;
  }

  try {
    const parsed = new URL(direct);
    const host = parsed.hostname.toLowerCase();
    const isTransformProxy = host.includes("weserv.nl") || host === "wsrv.nl";
    if (isTransformProxy && parsed.searchParams.has("url")) {
      const nestedRaw = decodeRepeatedURIComponent(parsed.searchParams.get("url") ?? "", 6);
      const nested = normalizeHttpUrl(nestedRaw);
      if (nested) {
        return nested;
      }
    }
    return parsed.toString();
  } catch {
    return direct;
  }
}

export function getUrlHostname(value: unknown): string | null {
  const normalized = normalizeHttpUrl(value);
  if (!normalized) {
    return null;
  }
  try {
    return new URL(normalized).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isGoogleNewsUrl(value: unknown): boolean {
  const hostname = getUrlHostname(value);
  return hostname === "news.google.com" || hostname === "google.com" || hostname?.endsWith(".google.com") === true;
}

export function readBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value === 1;
  }
  if (typeof value === "string") {
    const lowered = value.toLowerCase();
    return lowered === "true" || lowered === "1" || lowered === "on" || lowered === "yes";
  }
  return false;
}

export function isNewsSection(value: string): value is NewsSection {
  return (Object.values(NewsSection) as string[]).includes(value);
}

export function isProvince(value: string): value is Province {
  return (Object.values(Province) as string[]).includes(value);
}

export function isNewsStatus(value: string): value is NewsStatus {
  return (Object.values(NewsStatus) as string[]).includes(value);
}

export function isPollStatus(value: string): value is PollStatus {
  return (Object.values(PollStatus) as string[]).includes(value);
}

export function parseGdeltDate(raw: string | undefined): string {
  if (!raw || raw.length < 8) {
    return new Date().toISOString();
  }
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(4, 6)) - 1;
  const day = Number(raw.slice(6, 8));
  const hour = Number(raw.slice(8, 10) || "0");
  const minute = Number(raw.slice(10, 12) || "0");
  const second = Number(raw.slice(12, 14) || "0");
  return new Date(Date.UTC(year, month, day, hour, minute, second)).toISOString();
}
