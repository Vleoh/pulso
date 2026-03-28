"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import styles from "../auth-styles.module.css";
import { authRegister, resolveAuthApiBase } from "@/lib/userAuthClient";

export default function RegistroPage() {
  const apiBase = useMemo(resolveAuthApiBase, []);
  const [displayName, setDisplayName] = useState("");
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
      const payload = await authRegister(apiBase, { email, password, displayName });
      setMessage(`Cuenta creada. Plan asignado: ${payload.item.plan}.`);
      setPassword("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo crear la cuenta.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.wrap}>
        <section className={styles.shell}>
          <span className={styles.tag}>Registro usuarios</span>
          <h1 className={styles.title}>Crear cuenta</h1>
          <p className={styles.subtitle}>Registro para usuarios lectores. Todas las cuentas nuevas comienzan en plan FREE.</p>

          <div className={styles.card}>
            <h2>Alta de usuario</h2>
            {error ? <div className={styles.error}>{error}</div> : null}
            {message ? <div className={styles.ok}>{message}</div> : null}
            <form className={styles.form} onSubmit={handleSubmit}>
              <input className={styles.input} type="text" placeholder="Nombre (opcional)" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
              <input className={styles.input} type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              <input className={styles.input} type="password" placeholder="Password fuerte (10+ y simbolos)" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} />
              <button className={styles.submit} type="submit" disabled={loading}>
                {loading ? "Creando..." : "Crear cuenta"}
              </button>
            </form>
            <p className={styles.muted}>Requisitos de password: 10+ caracteres, mayúscula, minúscula, número y símbolo.</p>
            <div className={styles.links}>
              <Link className={styles.link} href="/ingresar">
                Ya tengo cuenta
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
