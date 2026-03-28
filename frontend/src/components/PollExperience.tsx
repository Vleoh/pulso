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
  reasonSaved?: boolean;
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
  const AudioContextClass =
    window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
    .replace(/\bconfiarias\b/gi, "confiar\u00edas")
    .replace(/\bpais\b/gi, "pa\u00eds")
    .replace(/\bpor que\b/gi, "por qu\u00e9")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeQuestion(value: string): string {
  let text = normalizeCopy(value);
  text = text.replace(/^A quien\b/i, "\u00bfA qui\u00e9n");
  text = text.replace(/^A qui\u00e9n\b/i, "\u00bfA qui\u00e9n");
  text = text.replace(/^\u00bf+/, "\u00bf");
  text = text.replace(/\?+$/, "?");

  if (text.startsWith("\u00bf") && !text.endsWith("?")) {
    text = `${text}?`;
  }
  return text;
}

function normalizeReasonInput(value: string): string | null {
  const normalized = value.replace(/\uFFFD/g, "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }
  return normalized;
}

function ensurePollShape(item: PollItem): PollItem {
  return {
    ...item,
    recentReasons: Array.isArray(item.recentReasons) ? item.recentReasons : [],
  };
}

export function PollExperience({ initialPoll, initialSelectedOptionId, apiBaseUrl }: PollExperienceProps) {
  const [poll, setPoll] = useState<PollItem>(ensurePollShape(initialPoll));
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(initialSelectedOptionId);
  const [busyOptionId, setBusyOptionId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Resultados en vivo actualizados.");
  const [statusLevel, setStatusLevel] = useState<"ok" | "warn" | "error">("ok");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [reasonDraft, setReasonDraft] = useState<string>("");
  const [savingReason, setSavingReason] = useState<boolean>(false);
  const lastUpdateRef = useRef<number>(Date.now());
  const toastTimerRef = useRef<number | null>(null);
  const baseUrl = useMemo(() => normalizeBaseUrl(apiBaseUrl), [apiBaseUrl]);
  const readableQuestion = useMemo(() => normalizeQuestion(poll.question), [poll.question]);
  const readableDescription = useMemo(() => (poll.description ? normalizeCopy(poll.description) : null), [poll.description]);
  const readableFooterCta = useMemo(() => normalizeCopy(poll.footerCta || "Vota y explica por que"), [poll.footerCta]);
  const normalizedReason = useMemo(() => normalizeReasonInput(reasonDraft), [reasonDraft]);
  const reasonLength = normalizedReason?.length ?? 0;

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
        setPoll(ensurePollShape(payload.item));
      }
      if (typeof payload.selectedOptionId === "string" || payload.selectedOptionId === null) {
        setSelectedOptionId(payload.selectedOptionId);
      }
      lastUpdateRef.current = Date.now();
    } catch {
      // no-op: mantenemos el ultimo estado valido.
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
      setStatus("Tu voto ya estaba registrado. Puedes sumar tu argumento debajo.");
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
          reasonText: normalizedReason,
        }),
      });

      const payload = (await response.json()) as VoteResponse;
      if (!response.ok) {
        throw new Error(payload.error || "No se pudo registrar el voto.");
      }

      if (!payload.item) {
        throw new Error("Respuesta incompleta del servidor.");
      }

      setPoll(ensurePollShape(payload.item));
      setSelectedOptionId(payload.selectedOptionId ?? optionId);
      lastUpdateRef.current = Date.now();

      if (!payload.alreadyVoted) {
        playVoteSound();
      }

      if (payload.reasonSaved) {
        showToast("Tu voto y tu explicacion quedaron registrados.");
      } else if (!payload.alreadyVoted) {
        showToast("Tu voto quedo registrado.");
      } else {
        showToast("Ya tenias un voto registrado en esta encuesta.");
      }

      setStatus(
        payload.alreadyVoted
          ? "Ya tenias un voto registrado. Puedes actualizar tu explicacion."
          : payload.reasonSaved
            ? "Voto + explicacion guardados. Resultado actualizado en vivo."
            : "Voto registrado. Si quieres, agrega tu explicacion debajo.",
      );
      setStatusLevel(payload.alreadyVoted ? "warn" : "ok");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Error al votar.");
      setStatusLevel("error");
    } finally {
      setBusyOptionId(null);
    }
  }

  async function saveReason(): Promise<void> {
    if (!selectedOptionId || !normalizedReason || normalizedReason.length < 8 || normalizedReason.length > 360 || savingReason) {
      return;
    }

    setSavingReason(true);
    setStatus("Guardando tu explicacion...");
    setStatusLevel("warn");

    try {
      const response = await fetch(`${baseUrl}/api/polls/${encodeURIComponent(poll.slug)}/reason`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          reasonText: normalizedReason,
        }),
      });

      const payload = (await response.json()) as VoteResponse;
      if (!response.ok) {
        throw new Error(payload.error || "No se pudo guardar tu explicacion.");
      }

      if (payload.item) {
        setPoll(ensurePollShape(payload.item));
      }
      if (typeof payload.selectedOptionId === "string" || payload.selectedOptionId === null) {
        setSelectedOptionId(payload.selectedOptionId);
      }
      lastUpdateRef.current = Date.now();

      setStatus("Explicacion registrada correctamente.");
      setStatusLevel("ok");
      showToast("Tu explicacion ya esta publicada.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Error al guardar la explicacion.");
      setStatusLevel("error");
    } finally {
      setSavingReason(false);
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
            <p className="poll-vote-hint">Toca un candidato para votar. Un voto por dispositivo/navegador.</p>
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
                    title={selected ? "Ya votaste esta opcion" : `Votar por ${option.label}`}
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

            <div className="poll-reason-box">
              <label htmlFor="pollReasonInput">Explica por que votaste asi (se publica en la encuesta)</label>
              <textarea
                id="pollReasonInput"
                value={reasonDraft}
                onChange={(event) => setReasonDraft(event.target.value)}
                rows={3}
                maxLength={360}
                placeholder="Ej: Porque tiene mejor equipo para gobernar y mas capacidad de gestion federal."
              />
              <div className="poll-reason-actions">
                <small>{reasonLength}/360</small>
                {selectedOptionId ? (
                  <button
                    type="button"
                    onClick={() => void saveReason()}
                    disabled={savingReason || !normalizedReason || reasonLength < 8 || reasonLength > 360}
                  >
                    {savingReason ? "Guardando..." : "Guardar explicacion"}
                  </button>
                ) : (
                  <span>Si ya escribiste, se enviara junto a tu voto.</span>
                )}
              </div>
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

        <section className="poll-reasons-card">
          <div className="poll-card-head">
            <h2>Por que votan asi</h2>
            <span>{poll.recentReasons.length} argumentos</span>
          </div>
          {poll.recentReasons.length > 0 ? (
            <div className="poll-reasons-list">
              {poll.recentReasons.map((reason) => (
                <article key={reason.id} className="poll-reason-item">
                  <strong style={{ color: reason.optionColorHex }}>{reason.optionLabel}</strong>
                  <p>{reason.text}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="poll-reasons-empty">Todavia no hay explicaciones publicadas. Se el primero en dejar la tuya.</p>
          )}
        </section>

        <section className="poll-guide-grid">
          <article className="poll-guide-card">
            <h3>Como funciona</h3>
            <p>Encuesta digital de opinion de la comunidad. Se actualiza en tiempo real con cada voto.</p>
            <ul>
              <li>Ranking en vivo por candidato.</li>
              <li>Seguimiento continuo para compartir en redes.</li>
              <li>Un voto por dispositivo/navegador.</li>
            </ul>
          </article>
          <article className="poll-guide-card">
            <h3>Transparencia editorial</h3>
            <p>Este modulo refleja participacion digital y no reemplaza una encuesta estadistica representativa.</p>
            <ul>
              <li>Etiqueta publica: "Encuesta digital / opinion de la comunidad".</li>
              <li>Resultados abiertos para lectura y debate.</li>
              <li>CTA de participacion: "Vota y explica por que".</li>
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
