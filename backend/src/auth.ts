import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { AdminTokenPayload } from "./types";

export function signAdminToken(email: string, secret: string): string {
  return jwt.sign({ email, role: "admin" } satisfies AdminTokenPayload, secret, {
    expiresIn: "12h",
  });
}

export function verifyAdminToken(token: string, secret: string): AdminTokenPayload {
  const payload = jwt.verify(token, secret);
  if (typeof payload !== "object" || payload === null || payload.role !== "admin") {
    throw new Error("Token invalido");
  }
  return payload as AdminTokenPayload;
}

export function extractAdminToken(request: Request, cookieName: string): string | null {
  const authorizationHeader = request.headers.authorization;
  if (authorizationHeader && authorizationHeader.startsWith("Bearer ")) {
    return authorizationHeader.slice("Bearer ".length);
  }

  const cookieToken = request.cookies[cookieName];
  if (typeof cookieToken === "string" && cookieToken.length > 0) {
    return cookieToken;
  }

  return null;
}

export function adminApiGuard(secret: string, cookieName: string) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const token = extractAdminToken(request, cookieName);
    if (!token) {
      response.status(401).json({ error: "No autenticado" });
      return;
    }

    try {
      verifyAdminToken(token, secret);
      next();
    } catch {
      response.status(401).json({ error: "Sesion invalida" });
    }
  };
}

export function backofficeGuard(secret: string, cookieName: string) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const token = extractAdminToken(request, cookieName);
    if (!token) {
      response.redirect("/backoffice/login");
      return;
    }

    try {
      verifyAdminToken(token, secret);
      next();
    } catch {
      response.redirect("/backoffice/login");
    }
  };
}
