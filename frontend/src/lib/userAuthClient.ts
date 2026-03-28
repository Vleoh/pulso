export type PublicUser = {
  id: string;
  email: string;
  displayName: string | null;
  plan: "FREE" | "PREMIUM";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
};

function defaultApiBase(): string {
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return "http://localhost:8080";
  }
  return "https://pulso-backend-kgtc.onrender.com";
}

export function resolveAuthApiBase(): string {
  return (process.env.NEXT_PUBLIC_API_URL?.trim() || defaultApiBase()).replace(/\/+$/, "");
}

async function parseOrThrow<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "No se pudo completar la operacion.");
  }
  return payload;
}

export async function authRegister(apiBase: string, input: { email: string; password: string; displayName?: string }): Promise<{ item: PublicUser }> {
  const response = await fetch(`${apiBase}/api/auth/register`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(input),
  });
  return parseOrThrow<{ item: PublicUser }>(response);
}

export async function authLogin(apiBase: string, input: { email: string; password: string }): Promise<{ item: PublicUser }> {
  const response = await fetch(`${apiBase}/api/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(input),
  });
  return parseOrThrow<{ item: PublicUser }>(response);
}

export async function authMe(apiBase: string): Promise<{ item: PublicUser }> {
  const response = await fetch(`${apiBase}/api/auth/me`, {
    method: "GET",
    credentials: "include",
    headers: {
      accept: "application/json",
    },
  });
  return parseOrThrow<{ item: PublicUser }>(response);
}

export async function authLogout(apiBase: string): Promise<void> {
  const response = await fetch(`${apiBase}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
    headers: {
      accept: "application/json",
    },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({ error: "No se pudo cerrar sesion." }))) as { error?: string };
    throw new Error(payload.error || "No se pudo cerrar sesion.");
  }
}
