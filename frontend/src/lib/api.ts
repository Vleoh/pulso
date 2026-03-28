import { fallbackHomeData } from "./fallback";
import type { FeedItem, HomePayload, NewsBySlugResponse, PollItem } from "./types";

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

type NewsListQuery = {
  section?: string;
  province?: string;
  status?: "DRAFT" | "PUBLISHED";
  limit?: number;
  external?: boolean;
};

export async function getNewsList(query: NewsListQuery = {}): Promise<FeedItem[]> {
  try {
    const params = new URLSearchParams();
    if (query.section) {
      params.set("section", query.section);
    }
    if (query.province) {
      params.set("province", query.province);
    }
    if (query.status) {
      params.set("status", query.status);
    }
    if (typeof query.limit === "number" && Number.isFinite(query.limit)) {
      params.set("limit", String(query.limit));
    }
    if (query.external) {
      params.set("external", "1");
    }
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    const response = await fetch(`${API_URL}/api/news${suffix}`, {
      cache: "no-store",
      headers: {
        accept: "application/json",
      },
    });
    if (!response.ok) {
      return [];
    }
    const payload = (await response.json()) as { items?: FeedItem[] };
    return Array.isArray(payload.items) ? payload.items : [];
  } catch {
    return [];
  }
}

export async function getNewsBySlug(slug: string): Promise<NewsBySlugResponse | null> {
  try {
    const response = await fetch(`${API_URL}/api/news/${encodeURIComponent(slug)}`, {
      cache: "no-store",
      headers: {
        accept: "application/json",
      },
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as NewsBySlugResponse;
  } catch {
    return null;
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
