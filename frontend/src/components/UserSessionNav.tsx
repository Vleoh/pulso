"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { authLogout, authMe, resolveAuthApiBase, type PublicUser } from "@/lib/userAuthClient";

type Props = {
  compact?: boolean;
};

export function UserSessionNav({ compact = false }: Props) {
  const apiBase = useMemo(resolveAuthApiBase, []);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<PublicUser | null>(null);

  useEffect(() => {
    setLoading(true);
    authMe(apiBase)
      .then((payload) => setUser(payload.item))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [apiBase]);

  async function handleLogout(): Promise<void> {
    try {
      await authLogout(apiBase);
    } finally {
      setUser(null);
    }
  }

  if (loading) {
    return <span className={compact ? "mf-auth-pill" : "auth-pill"}>...</span>;
  }

  if (!user) {
    return (
      <div className={compact ? "mf-auth-stack" : "auth-stack"}>
        <Link href="/ingresar" className={compact ? "mf-auth-pill" : "auth-pill"}>
          Ingresar
        </Link>
        <Link href="/registro" className={compact ? "mf-auth-pill ghost" : "auth-pill ghost"}>
          Crear cuenta
        </Link>
      </div>
    );
  }

  return (
    <div className={compact ? "mf-auth-stack" : "auth-stack"}>
      <Link href="/cuenta" className={compact ? "mf-auth-pill" : "auth-pill"}>
        {user.plan}
      </Link>
      <button type="button" onClick={handleLogout} className={compact ? "mf-auth-pill ghost as-btn" : "auth-pill ghost as-btn"}>
        Salir
      </button>
    </div>
  );
}
