import { type Poll, type PollOption, PollStatus, type PrismaClient } from "@prisma/client";
import { asNullable, isPollStatus, readBoolean, readString, slugifyText } from "./utils";

export type CandidateTemplate = {
  label: string;
  colorHex: string;
  emoji: string;
};

export const FIXED_CANDIDATE_OPTIONS: readonly CandidateTemplate[] = [
  { label: "Javier Milei", colorHex: "#cfa437", emoji: "JM" },
  { label: "Axel Kicillof", colorHex: "#d24b3d", emoji: "AK" },
  { label: "Victoria Villarruel", colorHex: "#7a4de2", emoji: "VV" },
  { label: "Sergio Massa", colorHex: "#22a2ff", emoji: "SM" },
  { label: "Patricia Bullrich", colorHex: "#1f6cf0", emoji: "PB" },
  { label: "Mauricio Macri", colorHex: "#f58a2e", emoji: "MM" },
  { label: "Cristina Kirchner", colorHex: "#3ea2ff", emoji: "CK" },
  { label: "Myriam Bregman", colorHex: "#d63f4d", emoji: "MB" },
  { label: "Juan Grabois", colorHex: "#52b66d", emoji: "JG" },
  { label: "Dante Gebel", colorHex: "#8f55dd", emoji: "DG" },
] as const;

export const HARDCODED_POLL_VOTE_BASE: readonly { label: string; votes: number }[] = [
  { label: "Javier Milei", votes: 7 },
  { label: "Axel Kicillof", votes: 0 },
  { label: "Victoria Villarruel", votes: 12 },
  { label: "Sergio Massa", votes: 0 },
  { label: "Patricia Bullrich", votes: 3 },
  { label: "Mauricio Macri", votes: 1 },
  { label: "Cristina Kirchner", votes: 0 },
  { label: "Myriam Bregman", votes: 0 },
  { label: "Juan Grabois", votes: 0 },
  { label: "Dante Gebel", votes: 8 },
] as const;

export type PollOptionInput = {
  label: string;
  sortOrder: number;
  colorHex: string;
  emoji: string;
};

export type NormalizedPollInput = {
  slug: string;
  title: string;
  question: string;
  hookLabel: string;
  footerCta: string;
  description: string | null;
  customSheetCode: string | null;
  interviewUrl: string | null;
  coverImageUrl: string | null;
  status: PollStatus;
  isFeatured: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  publishedAt: Date | null;
  options: PollOptionInput[];
};

export type PollSnapshotOption = {
  id: string;
  label: string;
  sortOrder: number;
  colorHex: string;
  emoji: string | null;
  votes: number;
  pct: number;
};

export type PollSnapshot = {
  totalVotes: number;
  options: PollSnapshotOption[];
  leader: PollSnapshotOption | null;
};

export type PollReasonPublic = {
  id: string;
  optionId: string;
  optionLabel: string;
  optionColorHex: string;
  text: string;
  createdAt: string;
};

function parseDateTime(value: string): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Fecha de encuesta invalida.");
  }
  return parsed;
}

function normalizeCandidateLabel(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const HARDCODED_POLL_VOTE_BASE_MAP = new Map<string, number>(
  HARDCODED_POLL_VOTE_BASE.map((entry) => [normalizeCandidateLabel(entry.label), entry.votes]),
);

export function hardcodedVoteCountForLabel(label: string): number {
  return HARDCODED_POLL_VOTE_BASE_MAP.get(normalizeCandidateLabel(label)) ?? 0;
}

export function normalizePollQuestionText(value: string): string {
  let text = String(value ?? "")
    .replace(/\uFFFD/g, "")
    .replace(/\s+/g, " ")
    .trim();

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

export function normalizePollInput(raw: Record<string, unknown>): NormalizedPollInput {
  const title = readString(raw.title);
  if (title.length < 8) {
    throw new Error("El titulo de la encuesta debe tener al menos 8 caracteres.");
  }

  const question = normalizePollQuestionText(readString(raw.question));
  if (question.length < 12) {
    throw new Error("La pregunta principal debe tener al menos 12 caracteres.");
  }

  const statusRaw = readString(raw.status).toUpperCase() || PollStatus.DRAFT;
  if (!isPollStatus(statusRaw)) {
    throw new Error("Estado de encuesta invalido.");
  }

  const startsAt = parseDateTime(readString(raw.startsAt));
  const endsAt = parseDateTime(readString(raw.endsAt));
  let publishedAt = parseDateTime(readString(raw.publishedAt));

  if (startsAt && endsAt && endsAt <= startsAt) {
    throw new Error("La fecha de cierre debe ser posterior al inicio.");
  }

  if (statusRaw === PollStatus.PUBLISHED && !publishedAt) {
    publishedAt = new Date();
  }

  const options: PollOptionInput[] = FIXED_CANDIDATE_OPTIONS.map((candidate, index) => ({
    label: candidate.label,
    sortOrder: index + 1,
    colorHex: candidate.colorHex,
    emoji: candidate.emoji,
  }));

  return {
    slug: slugifyText(readString(raw.slug) || title),
    title,
    question,
    hookLabel: readString(raw.hookLabel) || "Encuesta Nacional",
    footerCta: readString(raw.footerCta) || "Vota y explica por que",
    description: asNullable(readString(raw.description)),
    customSheetCode: asNullable(readString(raw.customSheetCode)),
    interviewUrl: asNullable(readString(raw.interviewUrl)),
    coverImageUrl: asNullable(readString(raw.coverImageUrl)),
    status: statusRaw,
    isFeatured: readBoolean(raw.isFeatured),
    startsAt,
    endsAt,
    publishedAt,
    options,
  };
}

export async function ensureUniquePollSlug(prisma: PrismaClient, baseSlug: string, excludeId?: string): Promise<string> {
  const root = baseSlug.length > 0 ? baseSlug : `encuesta-${Date.now()}`;
  let candidate = root;
  let counter = 1;

  while (true) {
    const existing = await prisma.poll.findFirst({
      where: {
        slug: candidate,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (!existing) {
      return candidate;
    }

    counter += 1;
    candidate = `${root}-${counter}`;
  }
}

export function buildPollSnapshot(options: PollOption[], voteCountByOptionId: Map<string, number>): PollSnapshot {
  const sorted = [...options].sort((a, b) => a.sortOrder - b.sortOrder);
  const totalVotes = sorted.reduce((acc, option) => acc + (voteCountByOptionId.get(option.id) ?? 0), 0);

  const snapshotOptions: PollSnapshotOption[] = sorted.map((option) => {
    const votes = voteCountByOptionId.get(option.id) ?? 0;
    const pct = totalVotes > 0 ? Number(((votes / totalVotes) * 100).toFixed(2)) : 0;
    return {
      id: option.id,
      label: option.label,
      sortOrder: option.sortOrder,
      colorHex: option.colorHex ?? "#c8a64f",
      emoji: option.emoji,
      votes,
      pct,
    };
  });

  const rankedOptions = [...snapshotOptions].sort((a, b) => b.votes - a.votes || a.sortOrder - b.sortOrder);
  const leader = rankedOptions[0] ?? null;

  return {
    totalVotes,
    options: rankedOptions,
    leader,
  };
}

export type PollPublicView = {
  id: string;
  slug: string;
  title: string;
  question: string;
  hookLabel: string;
  footerCta: string;
  description: string | null;
  customSheetCode: string | null;
  interviewUrl: string | null;
  coverImageUrl: string | null;
  startsAt: string | null;
  endsAt: string | null;
  publishedAt: string | null;
  status: PollStatus;
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
  metrics: PollSnapshot;
  recentReasons: PollReasonPublic[];
};

export function toPollPublicView(
  poll: Poll & { options: PollOption[] },
  snapshot: PollSnapshot,
  recentReasons: PollReasonPublic[] = [],
): PollPublicView {
  return {
    id: poll.id,
    slug: poll.slug,
    title: poll.title,
    question: normalizePollQuestionText(poll.question),
    hookLabel: poll.hookLabel,
    footerCta: poll.footerCta,
    description: poll.description,
    customSheetCode: poll.customSheetCode,
    interviewUrl: poll.interviewUrl,
    coverImageUrl: poll.coverImageUrl,
    startsAt: poll.startsAt ? poll.startsAt.toISOString() : null,
    endsAt: poll.endsAt ? poll.endsAt.toISOString() : null,
    publishedAt: poll.publishedAt ? poll.publishedAt.toISOString() : null,
    status: poll.status,
    isFeatured: poll.isFeatured,
    createdAt: poll.createdAt.toISOString(),
    updatedAt: poll.updatedAt.toISOString(),
    metrics: snapshot,
    recentReasons,
  };
}
