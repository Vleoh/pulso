"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "../auth-styles.module.css";
import { authLogout, authMe, type PublicUser, resolveAuthApiBase } from "@/lib/userAuthClient";

export default function CuentaPage() {
  const apiBase = useMemo(resolveAuthApiBase, []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [user, setUser] = useState<PublicUser | null>(null);

  useEffect(() => {
    setLoading(true);
    authMe(apiBase)
      .then((payload) => {
        setUser(payload.item);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [apiBase]);

  async function handleLogout(): Promise<void> {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await authLogout(apiBase);
      setUser(null);
      setMessage("Sesion cerrada.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo cerrar sesion.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.wrap}>
        <section className={styles.shell}>
          <span className={styles.tag}>Cuenta Pulso</span>
          <h1 className={styles.title}>Mi cuenta</h1>
          <p className={styles.subtitle}>Este acceso es para usuarios lectores. El backoffice editorial usa autenticacion de administrador separada.</p>

          {error ? <div className={styles.error}>{error}</div> : null}
          {message ? <div className={styles.ok}>{message}</div> : null}

          {loading ? (
            <div className={styles.card}>
              <p className={styles.muted}>Cargando sesion...</p>
            </div>
          ) : user ? (
            <div className={styles.card}>
              <h2>Datos de usuario</h2>
              <p className={styles.muted}>
                <strong>Email:</strong> {user.email}
              </p>
              <p className={styles.muted}>
                <strong>Nombre:</strong> {user.displayName ?? "-"}
              </p>
              <p className={styles.muted}>
                <strong>Plan:</strong> {user.plan}
              </p>
              <p className={styles.muted}>
                <strong>Ultimo login:</strong> {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("es-AR") : "-"}
              </p>
              <button className={styles.submit} type="button" onClick={handleLogout} disabled={loading}>
                Cerrar sesion
              </button>
            </div>
          ) : (
            <div className={styles.card}>
              <h2>Sesion no iniciada</h2>
              <p className={styles.muted}>Inicia sesion o crea una cuenta para que tus interacciones queden asociadas a tu perfil.</p>
              <div className={styles.links}>
                <Link className={styles.link} href="/ingresar">
                  Ir a ingresar
                </Link>
                <Link className={styles.link} href="/registro">
                  Crear cuenta
                </Link>
              </div>
            </div>
          )}

          <div className={styles.links}>
            <Link className={styles.link} href="/">
              Volver al home
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
