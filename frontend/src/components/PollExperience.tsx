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

type CandidateMeta = {
  imagePath: string;
  party: string;
  tag: string;
  partyColor: string;
};

const CANDIDATE_META_MAP: Record<string, CandidateMeta> = {
  "javier milei": {
    imagePath: "/caras/Javier_Milei.jpg",
    party: "La Libertad Avanza",
    tag: "LLA",
    partyColor: "#d5ad45",
  },
  "axel kicillof": {
    imagePath: "/caras/Axel_Kicillof.jpg",
    party: "Union por la Patria",
    tag: "UxP",
    partyColor: "#de4a4a",
  },
  "victoria villarruel": {
    imagePath: "/caras/Victoria_Villarruel.jpg",
    party: "La Libertad Avanza",
    tag: "LLA",
    partyColor: "#d5ad45",
  },
  "sergio massa": {
    imagePath: "/caras/Sergio_Massa.jpg",
    party: "Frente Renovador",
    tag: "FR",
    partyColor: "#28a8ff",
  },
  "patricia bullrich": {
    imagePath: "/caras/Patricia_Bullrich.jpg",
    party: "PRO",
    tag: "PRO",
    partyColor: "#2d79ff",
  },
  "mauricio macri": {
    imagePath: "/caras/Mauricio_Macri.jpg",
    party: "PRO",
    tag: "PRO",
    partyColor: "#2d79ff",
  },
  "cristina kirchner": {
    imagePath: "/caras/Cristina_Kirchner.jpg",
    party: "Union por la Patria",
    tag: "UxP",
    partyColor: "#de4a4a",
  },
  "myriam bregman": {
    imagePath: "/caras/Myriam_Bregman.jpg",
    party: "FIT-U",
    tag: "FIT-U",
    partyColor: "#d14a66",
  },
  "juan grabois": {
    imagePath: "/caras/Juan_Grabois.jpg",
    party: "Patria Grande",
    tag: "PG",
    partyColor: "#58bc70",
  },
  "dante gebel": {
    imagePath: "/caras/Dante_Gebel.jpg",
    party: "Independiente",
    tag: "IND",
    partyColor: "#8f55dd",
  },
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

function rankOptions(options: PollItem["metrics"]["options"]): PollItem["metrics"]["options"] {
  return [...options].sort((a, b) => b.votes - a.votes || a.sortOrder - b.sortOrder);
}

function pieGradient(poll: PollItem): string {
  const options = rankOptions(poll.metrics.options);
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
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeQuestion(value: string): string {
  let text = normalizeCopy(value);
  text = text.replace(/^Â¿/, "¿");
  text = text.replace(/^�+/, "");
  if (/^A quien\b/i.test(text)) {
    text = `¿${text}`;
  }
  text = text.replace(/^¿+/, "¿");
  text = text.replace(/\?+$/, "?");

  if (text.startsWith("¿") && !text.endsWith("?")) {
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

function getCandidateMeta(label: string, fallbackColor: string): CandidateMeta {
  const key = label.toLowerCase().trim();
  return (
    CANDIDATE_META_MAP[key] ?? {
      imagePath: "/caras/candidatos_square_preview.jpg",
      party: "Comunidad",
      tag: "PP",
      partyColor: fallbackColor,
    }
  );
}

export function PollExperience({ initialPoll, initialSelectedOptionId, apiBaseUrl }: PollExperienceProps) {
  const [poll, setPoll] = useState<PollItem>(ensurePollShape(initialPoll));
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(initialSelectedOptionId);
  const [busyOptionId, setBusyOptionId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Resultados en vivo actualizados.");
  const [statusLevel, setStatusLevel] = useState<"ok" | "warn" | "error">("ok");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [modalOptionId, setModalOptionId] = useState<string | null>(null);
  const [modalReason, setModalReason] = useState<string>("");
  const [modalError, setModalError] = useState<string | null>(null);

  const lastUpdateRef = useRef<number>(Date.now());
  const toastTimerRef = useRef<number | null>(null);

  const baseUrl = useMemo(() => normalizeBaseUrl(apiBaseUrl), [apiBaseUrl]);
  const readableQuestion = useMemo(() => normalizeQuestion(poll.question), [poll.question]);
  const readableDescription = useMemo(() => (poll.description ? normalizeCopy(poll.description) : null), [poll.description]);
  const readableFooterCta = useMemo(() => normalizeCopy(poll.footerCta || "Vota y explica por que"), [poll.footerCta]);
  const sortedOptions = useMemo(() => rankOptions(poll.metrics.options), [poll.metrics.options]);
  const modalOption = useMemo(() => sortedOptions.find((option) => option.id === modalOptionId) ?? null, [sortedOptions, modalOptionId]);
  const modalReasonNormalized = useMemo(() => normalizeReasonInput(modalReason), [modalReason]);
  const gradient = useMemo(() => pieGradient(poll), [poll]);
  const secondsAgo = Math.max(0, Math.round((Date.now() - lastUpdateRef.current) / 1000));

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
      // keep last good state
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
      setStatus("Tu voto ya estaba registrado.");
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

  const closeVoteModal = useCallback(() => {
    if (busyOptionId) {
      return;
    }
    setModalOptionId(null);
    setModalReason("");
    setModalError(null);
  }, [busyOptionId]);

  useEffect(() => {
    if (!modalOptionId) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeVoteModal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOptionId, closeVoteModal]);

  async function vote(optionId: string, reasonText: string | null): Promise<void> {
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
          reasonText,
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

      setPoll(ensurePollShape(payload.item));
      setSelectedOptionId(payload.selectedOptionId ?? optionId);
      lastUpdateRef.current = Date.now();
      setModalOptionId(null);
      setModalReason("");
      setModalError(null);

      if (!payload.alreadyVoted) {
        playVoteSound();
      }

      if (payload.reasonSaved) {
        showToast("Voto y explicacion registrados.");
      } else if (!payload.alreadyVoted) {
        showToast("Voto registrado.");
      } else {
        showToast("Ya tenias un voto registrado.");
      }

      setStatus(payload.alreadyVoted ? "Ya tenias un voto registrado." : "Voto registrado. Resultado actualizado en vivo.");
      setStatusLevel(payload.alreadyVoted ? "warn" : "ok");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Error al votar.");
      setStatusLevel("error");
      setModalError(error instanceof Error ? error.message : "Error al votar.");
    } finally {
      setBusyOptionId(null);
    }
  }

  function openVoteModal(optionId: string): void {
    if (selectedOptionId || busyOptionId) {
      return;
    }
    setModalOptionId(optionId);
    setModalReason("");
    setModalError(null);
  }

  async function confirmVoteFromModal(): Promise<void> {
    if (!modalOption) {
      return;
    }
    if (modalReasonNormalized && modalReasonNormalized.length < 8) {
      setModalError("Si agregas explicacion, usa al menos 8 caracteres.");
      return;
    }
    if (modalReasonNormalized && modalReasonNormalized.length > 360) {
      setModalError("La explicacion no puede superar 360 caracteres.");
      return;
    }
    await vote(modalOption.id, modalReasonNormalized);
  }

  return (
    <main className="poll-screen">
      <section className="poll-shell">
        <header className="poll-header-card">
          <p className="poll-hook">{poll.hookLabel || "Encuesta Nacional"}</p>
          <h1>{readableQuestion}</h1>
          {readableDescription && <p className="poll-description">{readableDescription}</p>}
          <div className="poll-head-actions">
            <a className="poll-link-btn poll-home-link" href="/">
              Volver al sitio
            </a>
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
            <p className="poll-vote-hint">Pulsa un candidato para abrir el modal de voto.</p>
            <div className="poll-option-list">
              {sortedOptions.map((option, index) => {
                const selected = selectedOptionId === option.id;
                const meta = getCandidateMeta(option.label, option.colorHex);
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
                    onClick={() => openVoteModal(option.id)}
                    disabled={Boolean(selectedOptionId) || busyOptionId !== null}
                    aria-pressed={selected}
                    title={selected ? "Ya votaste esta opcion" : `Votar por ${option.label}`}
                    style={optionStyle}
                  >
                    <span className="poll-option-index" style={{ backgroundColor: meta.partyColor }}>
                      {index + 1}
                    </span>
                    <span className="poll-candidate-avatar">
                      <img src={meta.imagePath} alt={option.label} loading="lazy" />
                    </span>
                    <span className="poll-candidate-main">
                      <strong>{option.label}</strong>
                      <small style={{ color: meta.partyColor }}>{meta.party}</small>
                      <em style={{ color: meta.partyColor }}>{meta.tag}</em>
                    </span>
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

      {modalOption ? (
        <div className="poll-modal-backdrop" onClick={closeVoteModal}>
          <div className="poll-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="poll-modal-close" onClick={closeVoteModal} aria-label="Cerrar modal">
              ×
            </button>
            <p className="poll-modal-kicker">Confirmar voto</p>
            <h3>¿Vas a votar por este candidato?</h3>
            <div className="poll-modal-candidate">
              <img src={getCandidateMeta(modalOption.label, modalOption.colorHex).imagePath} alt={modalOption.label} />
              <div>
                <strong>{modalOption.label}</strong>
                <span style={{ color: getCandidateMeta(modalOption.label, modalOption.colorHex).partyColor }}>
                  {getCandidateMeta(modalOption.label, modalOption.colorHex).party}
                </span>
              </div>
            </div>
            <label htmlFor="pollModalReason">Opcional: explica por que</label>
            <textarea
              id="pollModalReason"
              rows={3}
              maxLength={360}
              placeholder="Tu explicacion (opcional)..."
              value={modalReason}
              onChange={(event) => {
                setModalReason(event.target.value);
                if (modalError) {
                  setModalError(null);
                }
              }}
            />
            <div className="poll-modal-meta">
              <small>{modalReasonNormalized?.length ?? 0}/360</small>
              <span>Opcional para no friccionar el voto.</span>
            </div>
            {modalError ? <p className="poll-modal-error">{modalError}</p> : null}
            <div className="poll-modal-actions">
              <button type="button" className="ghost" onClick={closeVoteModal} disabled={Boolean(busyOptionId)}>
                Cancelar
              </button>
              <button type="button" onClick={() => void confirmVoteFromModal()} disabled={Boolean(busyOptionId)}>
                {busyOptionId === modalOption.id ? "Enviando..." : "Enviar voto"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toastMessage ? (
        <div className="poll-toast" role="status" aria-live="polite">
          {toastMessage}
        </div>
      ) : null}
    </main>
  );
}

