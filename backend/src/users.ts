import crypto from "node:crypto";
import { promisify } from "node:util";
import { UserPlan, type User } from "@prisma/client";
import { readString } from "./utils";

const scryptAsync = promisify(crypto.scrypt);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export type PublicUser = {
  id: string;
  email: string;
  displayName: string | null;
  plan: UserPlan;
  emailVerifiedAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
};

export function normalizeUserEmail(raw: unknown): string {
  return readString(raw).toLowerCase();
}

export function normalizeDisplayName(raw: unknown): string | null {
  const normalized = readString(raw).replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }
  return normalized.slice(0, 80);
}

export function assertValidUserEmail(email: string): void {
  if (!EMAIL_REGEX.test(email)) {
    throw new Error("Email invalido.");
  }
}

export function assertValidUserPassword(password: string): void {
  if (password.length < 10) {
    throw new Error("La clave debe tener al menos 10 caracteres.");
  }
  if (password.length > 120) {
    throw new Error("La clave no puede superar 120 caracteres.");
  }
  if (!/[a-z]/.test(password)) {
    throw new Error("La clave debe incluir al menos una letra minuscula.");
  }
  if (!/[A-Z]/.test(password)) {
    throw new Error("La clave debe incluir al menos una letra mayuscula.");
  }
  if (!/\d/.test(password)) {
    throw new Error("La clave debe incluir al menos un numero.");
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    throw new Error("La clave debe incluir al menos un simbolo.");
  }
}

export function normalizeUserPlanInput(raw: unknown, fallback: UserPlan = UserPlan.FREE): UserPlan {
  const candidate = readString(raw).toUpperCase();
  return (Object.values(UserPlan) as string[]).includes(candidate) ? (candidate as UserPlan) : fallback;
}

export function normalizeEmailCode(raw: unknown): string {
  return readString(raw).replace(/\s+/g, "").replace(/[^0-9]/g, "").slice(0, 6);
}

export async function hashUserPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `s1$${salt}$${derived.toString("hex")}`;
}

export async function verifyUserPassword(password: string, storedHash: string): Promise<boolean> {
  const [version, salt, hashHex] = storedHash.split("$");
  if (version !== "s1" || !salt || !hashHex) {
    return false;
  }

  const stored = Buffer.from(hashHex, "hex");
  const derived = (await scryptAsync(password, salt, stored.length)) as Buffer;
  if (stored.length !== derived.length) {
    return false;
  }
  return crypto.timingSafeEqual(stored, derived);
}

export function createUserSessionToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashUserSessionToken(token: string, secret: string): string {
  return crypto.createHash("sha256").update(`${token}:${secret}`).digest("hex");
}

export function createEmailCode(): string {
  const code = crypto.randomInt(0, 1_000_000);
  return code.toString().padStart(6, "0");
}

export function hashEmailCode(code: string, secret: string): string {
  return crypto.createHash("sha256").update(`${code}:${secret}`).digest("hex");
}

export function toPublicUser(
  user: Pick<User, "id" | "email" | "displayName" | "plan" | "emailVerifiedAt" | "isActive" | "createdAt" | "updatedAt" | "lastLoginAt">,
): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    plan: user.plan,
    emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
  };
}
