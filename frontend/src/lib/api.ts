import { fallbackHomeData } from "./fallback";
import type { HomePayload, PollItem } from "./types";

const API_URL =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.API_URL ??
  (process.env.NODE_ENV === "production" ? "https://pulso-backend-kgtc.onrender.com" : "http://localhost:8080");

export async function getHomeData(): Promise<HomePayload> {
  try {
    const response = await fetch(`${API_URL}/api/home`, {
      cache: "no-store",
      headers: {
        accept: "application/json",
      },
    });

    if (!response.ok) {
      return fallbackHomeData;
    }

    const payload = (await response.json()) as HomePayload;
    return payload;
  } catch {
    return fallbackHomeData;
  }
}

type PollBySlugResponse = {
  item: PollItem;
  selectedOptionId: string | null;
};

export async function getFeaturedPoll(): Promise<PollItem | null> {
  try {
    const response = await fetch(`${API_URL}/api/polls?featured=true&limit=1`, {
      cache: "no-store",
      headers: {
        accept: "application/json",
      },
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { items?: PollItem[] };
    return Array.isArray(payload.items) && payload.items.length > 0 ? payload.items[0] : null;
  } catch {
    return null;
  }
}

export async function getPollBySlug(slug: string): Promise<PollBySlugResponse | null> {
  try {
    const response = await fetch(`${API_URL}/api/polls/${encodeURIComponent(slug)}`, {
      cache: "no-store",
      headers: {
        accept: "application/json",
      },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as PollBySlugResponse;
  } catch {
    return null;
  }
}
