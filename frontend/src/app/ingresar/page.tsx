"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import styles from "../auth-styles.module.css";
import { authLogin, resolveAuthApiBase } from "@/lib/userAuthClient";

export default function IngresarPage() {
  const apiBase = useMemo(resolveAuthApiBase, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const payload = await authLogin(apiBase, { email, password });
      setMessage(`Sesion iniciada. Plan: ${payload.item.plan}.`);
      setPassword("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo iniciar sesion.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.wrap}>
        <section className={styles.shell}>
          <span className={styles.tag}>Acceso usuarios</span>
          <h1 className={styles.title}>Ingresar</h1>
          <p className={styles.subtitle}>Accede con tu cuenta de lector. El panel de administracion editorial es independiente.</p>

          <div className={styles.card}>
            <h2>Login</h2>
            {error ? <div className={styles.error}>{error}</div> : null}
            {message ? <div className={styles.ok}>{message}</div> : null}
            <form className={styles.form} onSubmit={handleSubmit}>
              <input className={styles.input} type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              <input className={styles.input} type="password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} required />
              <button className={styles.submit} type="submit" disabled={loading}>
                {loading ? "Ingresando..." : "Ingresar"}
              </button>
            </form>
            <p className={styles.muted}>Si no tienes cuenta, primero regístrate.</p>
            <div className={styles.links}>
              <Link className={styles.link} href="/registro">
                Crear cuenta
              </Link>
              <Link className={styles.link} href="/cuenta">
                Ver mi cuenta
              </Link>
            </div>
          </div>

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
