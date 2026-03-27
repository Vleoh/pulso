"use client";

import { useEffect, useMemo, useState } from "react";

type ReactionBase = {
  apoyo: number;
  analisis: number;
  guardados: number;
};

type EngagementBarProps = {
  itemId: string;
  title: string;
  compact?: boolean;
  base?: ReactionBase;
};

type StoredReactionState = ReactionBase & {
  saved: boolean;
  apoyado: boolean;
  analizado: boolean;
};

type ReactionIconName = "apoyo" | "analisis" | "guardar" | "compartir";

function ReactionIcon({ name }: { name: ReactionIconName }) {
  const paths: Record<ReactionIconName, string> = {
    apoyo: "M8 13.5l-1-.9C3.6 9.5 2 8 2 5.9A2.9 2.9 0 0 1 4.9 3c1.1 0 2.1.5 2.7 1.3A3.5 3.5 0 0 1 10.3 3 2.9 2.9 0 0 1 13 5.9c0 2.1-1.6 3.6-5 6.7z",
    analisis: "M2.5 12.5h2.2L9.2 8l2 2 2.3-2.3V12.5",
    guardar: "M4 2.5h8v11l-4-2.2-4 2.2z",
    compartir: "M10.8 4.2 13 6.4l-2.2 2.2M3 8h9.4",
  };

  return (
    <svg viewBox="0 0 16 16" className="engagement-icon" aria-hidden="true">
      <path d={paths[name]} fill={name === "apoyo" || name === "guardar" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function seededBase(itemId: string): ReactionBase {
  const hash = Array.from(itemId).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return {
    apoyo: 20 + (hash % 90),
    analisis: 5 + (hash % 35),
    guardados: 8 + (hash % 45),
  };
}

export function EngagementBar({ itemId, title, compact = false, base }: EngagementBarProps) {
  const storageKey = useMemo(() => `pulso_react_${itemId}`, [itemId]);
  const [state, setState] = useState<StoredReactionState>(() => {
    const start = base ?? seededBase(itemId);
    return { ...start, saved: false, apoyado: false, analizado: false };
  });

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as Partial<StoredReactionState>;
      setState((prev) => ({
        apoyo: typeof parsed.apoyo === "number" ? parsed.apoyo : prev.apoyo,
        analisis: typeof parsed.analisis === "number" ? parsed.analisis : prev.analisis,
        guardados: typeof parsed.guardados === "number" ? parsed.guardados : prev.guardados,
        saved: Boolean(parsed.saved),
        apoyado: Boolean(parsed.apoyado),
        analizado: Boolean(parsed.analizado),
      }));
    } catch {
      // no-op
    }
  }, [storageKey]);

  function persist(next: StoredReactionState) {
    setState(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // no-op
    }
  }

  function react(kind: "apoyo" | "analisis") {
    const stateKey = kind === "apoyo" ? "apoyado" : "analizado";
    const isActive = !state[stateKey];
    const next: StoredReactionState = {
      ...state,
      [kind]: Math.max(0, state[kind] + (isActive ? 1 : -1)),
      [stateKey]: isActive,
    };
    persist(next);
  }

  function toggleSave() {
    const becomingSaved = !state.saved;
    const next: StoredReactionState = {
      ...state,
      saved: becomingSaved,
      guardados: becomingSaved ? state.guardados + 1 : Math.max(0, state.guardados - 1),
    };
    persist(next);
  }

  async function shareItem() {
    const shareUrl = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          url: shareUrl,
        });
        return;
      } catch {
        // no-op
      }
    }
    if (navigator.clipboard && shareUrl) {
      try {
        await navigator.clipboard.writeText(shareUrl);
      } catch {
        // no-op
      }
    }
  }

  return (
    <div className={`engagement-bar ${compact ? "compact" : ""}`}>
      <button
        type="button"
        className={`engagement-btn ${state.apoyado ? "active is-apoyo" : ""}`}
        onClick={() => react("apoyo")}
        aria-label={state.apoyado ? "Apoyado" : "Apoyar"}
      >
        <ReactionIcon name="apoyo" />
        <strong>{state.apoyo}</strong>
      </button>
      <button
        type="button"
        className={`engagement-btn ${state.analizado ? "active is-analisis" : ""}`}
        onClick={() => react("analisis")}
        aria-label={state.analizado ? "Analizado" : "Analizar"}
      >
        <ReactionIcon name="analisis" />
        <strong>{state.analisis}</strong>
      </button>
      <button
        type="button"
        className={`engagement-btn ${state.saved ? "active is-saved" : ""}`}
        onClick={toggleSave}
        aria-label={state.saved ? "Guardado" : "Guardar"}
      >
        <ReactionIcon name="guardar" />
        <strong>{state.guardados}</strong>
      </button>
      <button type="button" className="engagement-btn ghost" onClick={shareItem} aria-label="Compartir">
        <ReactionIcon name="compartir" />
      </button>
    </div>
  );
}
