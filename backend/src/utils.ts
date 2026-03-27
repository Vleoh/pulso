import { NewsSection, NewsStatus, Province } from "@prisma/client";

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
