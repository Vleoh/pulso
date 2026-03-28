"use client";

import { useEffect, useMemo, useState } from "react";

type ReactionBase = {
  comentarios: number;
  apoyo: number;
  analisis: number;
  guardados: number;
};

type EngagementControls = {
  commentsEnabled: boolean;
  reactionsEnabled: boolean;
  analysisEnabled: boolean;
};

type EngagementBarProps = {
  itemId: string;
  title: string;
  compact?: boolean;
  base?: ReactionBase;
  controls?: EngagementControls;
};

type StoredReactionState = ReactionBase & {
  saved: boolean;
  comentado: boolean;
  apoyado: boolean;
  analizado: boolean;
};

type ReactionIconName = "comentarios" | "apoyo" | "analisis" | "guardar" | "compartir";

function ReactionIcon({ name }: { name: ReactionIconName }) {
  const paths: Record<ReactionIconName, string> = {
    comentarios: "M2.5 3.5h11v7.2h-6.1l-3.3 2.4v-2.4H2.5z",
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
    comentarios: 3 + (hash % 22),
    apoyo: 20 + (hash % 90),
    analisis: 5 + (hash % 35),
    guardados: 8 + (hash % 45),
  };
}

const DEFAULT_CONTROLS: EngagementControls = {
  commentsEnabled: true,
  reactionsEnabled: true,
  analysisEnabled: true,
};

export function EngagementBar({ itemId, title, compact = false, base, controls }: EngagementBarProps) {
  const storageKey = useMemo(() => `pulso_react_${itemId}`, [itemId]);
  const resolvedControls = controls ?? DEFAULT_CONTROLS;
  const [state, setState] = useState<StoredReactionState>(() => {
    const start = base ?? seededBase(itemId);
    return { ...start, saved: false, comentado: false, apoyado: false, analizado: false };
  });

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as Partial<StoredReactionState>;
      setState((prev) => ({
        comentarios: typeof parsed.comentarios === "number" ? parsed.comentarios : prev.comentarios,
        apoyo: typeof parsed.apoyo === "number" ? parsed.apoyo : prev.apoyo,
        analisis: typeof parsed.analisis === "number" ? parsed.analisis : prev.analisis,
        guardados: typeof parsed.guardados === "number" ? parsed.guardados : prev.guardados,
        saved: Boolean(parsed.saved),
        comentado: Boolean(parsed.comentado),
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

  function toggleComment() {
    const nextActive = !state.comentado;
    const next: StoredReactionState = {
      ...state,
      comentado: nextActive,
      comentarios: Math.max(0, state.comentarios + (nextActive ? 1 : -1)),
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

  const showComments = resolvedControls.commentsEnabled;
  const showReactions = resolvedControls.reactionsEnabled;
  const showAnalysis = resolvedControls.analysisEnabled;
  const showAny = showComments || showReactions || showAnalysis;

  if (!showAny) {
    return null;
  }

  return (
    <div className={`engagement-bar ${compact ? "compact" : ""}`}>
      {showComments ? (
        <button
          type="button"
          className={`engagement-btn ${state.comentado ? "active is-comments" : ""}`}
          onClick={toggleComment}
          aria-label={state.comentado ? "Comentario marcado" : "Comentar"}
        >
          <ReactionIcon name="comentarios" />
          <strong>{state.comentarios}</strong>
        </button>
      ) : null}

      {showReactions ? (
        <>
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
        </>
      ) : null}

      {showAnalysis ? (
        <button
          type="button"
          className={`engagement-btn ${state.analizado ? "active is-analisis" : ""}`}
          onClick={() => react("analisis")}
          aria-label={state.analizado ? "Analizado" : "Analizar"}
        >
          <ReactionIcon name="analisis" />
          <strong>{state.analisis}</strong>
        </button>
      ) : null}
    </div>
  );
}
