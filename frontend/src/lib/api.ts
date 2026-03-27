import { fallbackHomeData } from "./fallback";
import type { HomePayload } from "./types";

const API_URL =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.API_URL ??
  "http://localhost:8080";

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
