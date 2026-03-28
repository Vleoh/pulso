"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type PublicUser = {
  id: string;
  email: string;
  displayName: string | null;
  plan: "FREE" | "PREMIUM";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
};

const TOKEN_STORAGE_KEY = "pulso_user_token";

function resolveApiBase(): string {
  const envBase = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (envBase) {
    return envBase.replace(/\/+$/, "");
  }
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return "http://localhost:8080";
  }
  return "https://pulso-backend-kgtc.onrender.com";
}

export default function CuentaPage() {
  const apiBase = useMemo(resolveApiBase, []);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [token, setToken] = useState<string>("");
  const [user, setUser] = useState<PublicUser | null>(null);

  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerName, setRegisterName] = useState("");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  async function fetchMe(currentToken: string): Promise<void> {
    const response = await fetch(`${apiBase}/api/auth/me`, {
      method: "GET",
      credentials: "include",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${currentToken}`,
      },
    });

    if (!response.ok) {
      throw new Error("Sesion expirada o invalida.");
    }
    const payload = (await response.json()) as { item: PublicUser };
    setUser(payload.item);
  }

  useEffect(() => {
    const savedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!savedToken) {
      return;
    }
    setToken(savedToken);
    setLoading(true);
    fetchMe(savedToken)
      .then(() => {
        setMessage("Sesion restaurada.");
      })
      .catch(() => {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
        setToken("");
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [apiBase]);

  async function handleRegister(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${apiBase}/api/auth/register`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          email: registerEmail,
          password: registerPassword,
          displayName: registerName,
        }),
      });
      const payload = (await response.json()) as { item?: PublicUser; token?: string; error?: string };
      if (!response.ok || !payload.item || !payload.token) {
        throw new Error(payload.error || "No se pudo registrar el usuario.");
      }
      setUser(payload.item);
      setToken(payload.token);
      window.localStorage.setItem(TOKEN_STORAGE_KEY, payload.token);
      setMessage("Registro completo. Plan asignado: FREE.");
      setRegisterPassword("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Error inesperado en registro.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${apiBase}/api/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
        }),
      });
      const payload = (await response.json()) as { item?: PublicUser; token?: string; error?: string };
      if (!response.ok || !payload.item || !payload.token) {
        throw new Error(payload.error || "No se pudo iniciar sesion.");
      }
      setUser(payload.item);
      setToken(payload.token);
      window.localStorage.setItem(TOKEN_STORAGE_KEY, payload.token);
      setMessage(`Sesion iniciada. Plan actual: ${payload.item.plan}.`);
      setLoginPassword("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Error inesperado en login.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout(): Promise<void> {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      if (token) {
        await fetch(`${apiBase}/api/auth/logout`, {
          method: "POST",
          credentials: "include",
          headers: {
            accept: "application/json",
            authorization: `Bearer ${token}`,
          },
        });
      }
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      setToken("");
      setUser(null);
      setMessage("Sesion cerrada.");
    } catch {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      setToken("");
      setUser(null);
      setMessage("Sesion cerrada.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#0a0a0a", color: "#f4f4f4", fontFamily: "var(--font-body)" }}>
      <div style={{ width: "min(980px, 92vw)", margin: "0 auto", padding: "34px 0 56px", display: "grid", gap: 18 }}>
        <header style={{ border: "1px solid #252525", borderRadius: 14, background: "#111111", padding: 18 }}>
          <p style={{ margin: 0, color: "#d3af53", fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", fontSize: 12 }}>Sistema de usuarios</p>
          <h1 style={{ margin: "8px 0", fontFamily: "var(--font-headline)", fontSize: 44, letterSpacing: ".02em" }}>Pulso Cuenta</h1>
          <p style={{ margin: 0, color: "#bcbcbc", lineHeight: 1.5 }}>
            Registro y login de lectores con planes <strong>FREE</strong> / <strong>PREMIUM</strong>. Todo registro nuevo se crea por defecto en FREE.
          </p>
          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/" style={{ color: "#d3af53" }}>
              Volver al home
            </Link>
            <a href="https://pulso-backend-kgtc.onrender.com/backoffice/users" target="_blank" rel="noreferrer" style={{ color: "#d3af53" }}>
              Gestionar usuarios en backoffice
            </a>
          </div>
        </header>

        {error ? <div style={{ border: "1px solid #703131", background: "#251414", color: "#f6b9b9", borderRadius: 10, padding: "10px 12px" }}>{error}</div> : null}
        {message ? <div style={{ border: "1px solid #58501f", background: "#221b0d", color: "#f2d98f", borderRadius: 10, padding: "10px 12px" }}>{message}</div> : null}

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(290px,1fr))", gap: 14 }}>
          <article style={{ border: "1px solid #252525", borderRadius: 14, background: "#111111", padding: 16 }}>
            <h2 style={{ margin: "0 0 10px", fontSize: 20 }}>Registro</h2>
            <form onSubmit={handleRegister} style={{ display: "grid", gap: 10 }}>
              <input type="text" placeholder="Nombre (opcional)" value={registerName} onChange={(event) => setRegisterName(event.target.value)} style={{ borderRadius: 10, border: "1px solid #2f2f2f", background: "#0f0f0f", color: "#f4f4f4", padding: "10px 12px" }} />
              <input type="email" placeholder="Email" value={registerEmail} onChange={(event) => setRegisterEmail(event.target.value)} required style={{ borderRadius: 10, border: "1px solid #2f2f2f", background: "#0f0f0f", color: "#f4f4f4", padding: "10px 12px" }} />
              <input type="password" placeholder="Password (min 8)" value={registerPassword} onChange={(event) => setRegisterPassword(event.target.value)} required minLength={8} style={{ borderRadius: 10, border: "1px solid #2f2f2f", background: "#0f0f0f", color: "#f4f4f4", padding: "10px 12px" }} />
              <button type="submit" disabled={loading} style={{ borderRadius: 10, border: "0", background: "#d3af53", color: "#131313", fontWeight: 700, padding: "10px 12px", cursor: "pointer" }}>
                {loading ? "Procesando..." : "Crear cuenta"}
              </button>
            </form>
          </article>

          <article style={{ border: "1px solid #252525", borderRadius: 14, background: "#111111", padding: 16 }}>
            <h2 style={{ margin: "0 0 10px", fontSize: 20 }}>Login</h2>
            <form onSubmit={handleLogin} style={{ display: "grid", gap: 10 }}>
              <input type="email" placeholder="Email" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} required style={{ borderRadius: 10, border: "1px solid #2f2f2f", background: "#0f0f0f", color: "#f4f4f4", padding: "10px 12px" }} />
              <input type="password" placeholder="Password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} required style={{ borderRadius: 10, border: "1px solid #2f2f2f", background: "#0f0f0f", color: "#f4f4f4", padding: "10px 12px" }} />
              <button type="submit" disabled={loading} style={{ borderRadius: 10, border: "0", background: "#d3af53", color: "#131313", fontWeight: 700, padding: "10px 12px", cursor: "pointer" }}>
                {loading ? "Ingresando..." : "Ingresar"}
              </button>
            </form>
          </article>
        </section>

        <section style={{ border: "1px solid #252525", borderRadius: 14, background: "#111111", padding: 16 }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 20 }}>Sesion actual</h2>
          {user ? (
            <div style={{ display: "grid", gap: 6 }}>
              <p style={{ margin: 0 }}>
                <strong>Email:</strong> {user.email}
              </p>
              <p style={{ margin: 0 }}>
                <strong>Nombre:</strong> {user.displayName ?? "-"}
              </p>
              <p style={{ margin: 0 }}>
                <strong>Plan:</strong> {user.plan}
              </p>
              <p style={{ margin: 0 }}>
                <strong>Ultimo login:</strong> {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("es-AR") : "-"}
              </p>
              <div style={{ marginTop: 8 }}>
                <button type="button" onClick={handleLogout} disabled={loading} style={{ borderRadius: 10, border: "1px solid #4b2424", background: "#1d1111", color: "#f2b3b3", padding: "9px 12px", cursor: "pointer" }}>
                  Cerrar sesion
                </button>
              </div>
            </div>
          ) : (
            <p style={{ margin: 0, color: "#bcbcbc" }}>No hay sesion activa.</p>
          )}
        </section>
      </div>
    </main>
  );
}
