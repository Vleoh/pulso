"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { PollItem } from "@/lib/types";

type PollExperienceProps = {
  initialPoll: PollItem;
  initialSelectedOptionId: string | null;
  apiBaseUrl: string;
};

type VoteResponse = {
  item?: PollItem;
  selectedOptionId?: string | null;
  alreadyVoted?: boolean;
  error?: string;
};

function normalizeBaseUrl(value: string): string {
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value.replace(/\/+$/, "");
  }
  return `https://${value}`.replace(/\/+$/, "");
}

function formatPct(value: number): string {
  if (!Number.isFinite(value)) {
    return "0.00%";
  }
  return `${value.toFixed(2)}%`;
}

function pieGradient(poll: PollItem): string {
  const options = [...poll.metrics.options].sort((a, b) => a.sortOrder - b.sortOrder);
  if (poll.metrics.totalVotes <= 0) {
    const fallbackStops = options
      .map((option, index) => {
        const from = (index / Math.max(1, options.length)) * 100;
        const to = ((index + 1) / Math.max(1, options.length)) * 100;
        return `${option.colorHex} ${from.toFixed(4)}% ${to.toFixed(4)}%`;
      })
      .join(", ");
    return `conic-gradient(${fallbackStops})`;
  }

  let cursor = 0;
  const stops: string[] = [];
  for (const option of options) {
    const from = cursor;
    const to = cursor + option.pct;
    stops.push(`${option.colorHex} ${from.toFixed(4)}% ${to.toFixed(4)}%`);
    cursor = to;
  }
  if (cursor < 100) {
    const lastColor = options[options.length - 1]?.colorHex ?? "#c8a64f";
    stops.push(`${lastColor} ${cursor.toFixed(4)}% 100%`);
  }
  return `conic-gradient(${stops.join(", ")})`;
}

function playVoteSound(): void {
  if (typeof window === "undefined") {
    return;
  }
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) {
    return;
  }
  const context = new AudioContextClass();
  const now = context.currentTime;

  const oscA = context.createOscillator();
  oscA.type = "triangle";
  oscA.frequency.setValueAtTime(420, now);
  oscA.frequency.exponentialRampToValueAtTime(610, now + 0.08);

  const gainA = context.createGain();
  gainA.gain.setValueAtTime(0.0001, now);
  gainA.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
  gainA.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

  oscA.connect(gainA);
  gainA.connect(context.destination);
  oscA.start(now);
  oscA.stop(now + 0.12);

  window.setTimeout(() => {
    void context.close();
  }, 260);
}

function normalizeCopy(value: string): string {
  return value
    .replace(/\uFFFD/g, "")
    .replace(/\bconfiarias\b/gi, "confiarías")
    .replace(/\bpais\b/gi, "país")
    .replace(/\bpor que\b/gi, "por qué")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeQuestion(value: string): string {
  let text = normalizeCopy(value);
  text = text.replace(/^A quien\b/i, "¿A quién");
  text = text.replace(/^A quién\b/i, "¿A quién");
  text = text.replace(/^¿+/, "¿");
  text = text.replace(/\?+$/, "?");

  if (text.startsWith("¿") && !text.endsWith("?")) {
    text = `${text}?`;
  }
  return text;
}

export function PollExperience({ initialPoll, initialSelectedOptionId, apiBaseUrl }: PollExperienceProps) {
  const [poll, setPoll] = useState<PollItem>(initialPoll);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(initialSelectedOptionId);
  const [busyOptionId, setBusyOptionId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Resultados en vivo actualizados.");
  const [statusLevel, setStatusLevel] = useState<"ok" | "warn" | "error">("ok");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const lastUpdateRef = useRef<number>(Date.now());
  const toastTimerRef = useRef<number | null>(null);
  const baseUrl = useMemo(() => normalizeBaseUrl(apiBaseUrl), [apiBaseUrl]);
  const readableQuestion = useMemo(() => normalizeQuestion(poll.question), [poll.question]);
  const readableDescription = useMemo(() => (poll.description ? normalizeCopy(poll.description) : null), [poll.description]);
  const readableFooterCta = useMemo(() => normalizeCopy(poll.footerCta || "Votá y explicá por qué"), [poll.footerCta]);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 3600);
  }, []);

  const refreshPoll = useCallback(async () => {
    try {
      const response = await fetch(`${baseUrl}/api/polls/${encodeURIComponent(poll.slug)}`, {
        method: "GET",
        credentials: "include",
        headers: {
          accept: "application/json",
        },
      });
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as { item?: PollItem; selectedOptionId?: string | null };
      if (payload.item) {
        setPoll(payload.item);
      }
      if (typeof payload.selectedOptionId === "string" || payload.selectedOptionId === null) {
        setSelectedOptionId(payload.selectedOptionId);
      }
      lastUpdateRef.current = Date.now();
    } catch {
      // no-op: si falla un refresh puntual mantenemos ultimo estado valido.
    }
  }, [baseUrl, poll.slug]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshPoll();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [refreshPoll]);

  useEffect(() => {
    if (initialSelectedOptionId) {
      setStatus("Tu voto ya estaba registrado. Mostramos el resultado en vivo.");
      setStatusLevel("warn");
    }
  }, [initialSelectedOptionId]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  async function vote(optionId: string): Promise<void> {
    if (busyOptionId || selectedOptionId) {
      return;
    }

    setBusyOptionId(optionId);
    setStatus("Registrando tu voto...");
    setStatusLevel("warn");

    try {
      const response = await fetch(`${baseUrl}/api/polls/${encodeURIComponent(poll.slug)}/vote`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          optionId,
          sourceRef: typeof document !== "undefined" ? document.referrer : "",
        }),
      });

      const payload = (await response.json()) as VoteResponse;
      if (!response.ok) {
        throw new Error(payload.error || "No se pudo registrar el voto.");
      }

      if (!payload.item) {
        throw new Error("Respuesta incompleta del servidor.");
      }

      setPoll(payload.item);
      setSelectedOptionId(payload.selectedOptionId ?? optionId);
      lastUpdateRef.current = Date.now();

      if (!payload.alreadyVoted) {
        playVoteSound();
        showToast("Tu voto quedó registrado.");
      } else {
        showToast("Ya tenías un voto registrado en esta encuesta.");
      }

      setStatus(payload.alreadyVoted ? "Ya tenias un voto registrado. Mostrando resultado actual." : "Voto registrado. Resultado actualizado en vivo.");
      setStatusLevel(payload.alreadyVoted ? "warn" : "ok");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Error al votar.");
      setStatusLevel("error");
    } finally {
      setBusyOptionId(null);
    }
  }

  const sortedOptions = useMemo(
    () => [...poll.metrics.options].sort((a, b) => a.sortOrder - b.sortOrder),
    [poll.metrics.options],
  );

  const gradient = useMemo(() => pieGradient(poll), [poll]);
  const secondsAgo = Math.max(0, Math.round((Date.now() - lastUpdateRef.current) / 1000));

  return (
    <main className="poll-screen">
      <section className="poll-shell">
        <header className="poll-header-card">
          <p className="poll-hook">{poll.hookLabel || "Encuesta Nacional"}</p>
          <h1>{readableQuestion}</h1>
          {readableDescription && <p className="poll-description">{readableDescription}</p>}
          <div className="poll-head-actions">
            {poll.interviewUrl ? (
              <a className="poll-link-btn" href={poll.interviewUrl} target="_blank" rel="noreferrer">
                Ver entrevista
              </a>
            ) : null}
            <span className={`poll-status ${statusLevel}`}>{status}</span>
          </div>
        </header>

        <section className="poll-grid">
          <article className="poll-options-card">
            <div className="poll-card-head">
              <h2>Candidatos</h2>
              <span>{poll.metrics.totalVotes} votos</span>
            </div>
            <p className="poll-vote-hint">Tocá un candidato para votar. Un voto por dispositivo/navegador.</p>
            <div className="poll-option-list">
              {sortedOptions.map((option) => {
                const selected = selectedOptionId === option.id;
                const optionStyle = {
                  borderColor: selected ? option.colorHex : undefined,
                  boxShadow: selected ? `0 0 0 1px ${option.colorHex} inset` : undefined,
                  ["--vote-pct" as string]: `${Math.max(0, Math.min(100, option.pct)).toFixed(2)}%`,
                } as CSSProperties;
                return (
                  <button
                    type="button"
                    key={option.id}
                    className={`poll-option ${selected ? "is-selected" : ""}`}
                    onClick={() => vote(option.id)}
                    disabled={Boolean(selectedOptionId) || busyOptionId !== null}
                    aria-pressed={selected}
                    title={selected ? "Ya votaste esta opción" : `Votar por ${option.label}`}
                    style={optionStyle}
                  >
                    <span className="poll-option-index" style={{ backgroundColor: option.colorHex }}>
                      {option.sortOrder}
                    </span>
                    <span className="poll-option-label">{option.label}</span>
                    <span className="poll-option-emoji">{option.emoji}</span>
                    <span className="poll-option-right">
                      <strong>{formatPct(option.pct)}</strong>
                      <small>{option.votes} votos</small>
                      {selected ? <em>Tu voto</em> : null}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="poll-footer-cta">{readableFooterCta}</p>
          </article>

          <article className="poll-chart-card">
            <div className="poll-card-head">
              <h2>Resultados en vivo</h2>
              <span>actualizado hace {secondsAgo}s</span>
            </div>
            <div className="poll-chart-wrap">
              <div className="poll-pie-3d" style={{ backgroundImage: gradient }}>
                <div className="poll-pie-core">
                  <strong>{poll.metrics.totalVotes}</strong>
                  <span>votos</span>
                </div>
              </div>
            </div>
            <div className="poll-legend">
              {sortedOptions.map((option) => (
                <div key={option.id}>
                  <i style={{ backgroundColor: option.colorHex }} />
                  <span>{option.label}</span>
                  <strong>{formatPct(option.pct)}</strong>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="poll-guide-grid">
          <article className="poll-guide-card">
            <h3>Cómo funciona</h3>
            <p>Encuesta digital de opinión de la comunidad. Se actualiza en tiempo real con cada voto.</p>
            <ul>
              <li>Ranking en vivo por candidato.</li>
              <li>Seguimiento continuo para compartir en redes.</li>
              <li>Un voto por dispositivo/navegador.</li>
            </ul>
          </article>
          <article className="poll-guide-card">
            <h3>Transparencia editorial</h3>
            <p>
              Este módulo refleja participación digital, no reemplaza una encuesta estadística con muestra representativa.
            </p>
            <ul>
              <li>Etiqueta pública: “Encuesta digital / opinión de la comunidad”.</li>
              <li>Resultados abiertos para lectura y debate.</li>
              <li>CTA sugerida: “Votá y explicá por qué”.</li>
            </ul>
          </article>
        </section>
      </section>

      {toastMessage ? (
        <div className="poll-toast" role="status" aria-live="polite">
          {toastMessage}
        </div>
      ) : null}
    </main>
  );
}
