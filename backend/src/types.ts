import { NewsSection, NewsStatus, Province } from "@prisma/client";

export type FeedItem = {
  id: string;
  slug: string | null;
  title: string;
  kicker: string | null;
  excerpt: string | null;
  imageUrl: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  section: NewsSection;
  province: Province | null;
  publishedAt: string;
  isSponsored: boolean;
  isFeatured: boolean;
  isExternal: boolean;
};

export type HomePayload = {
  generatedAt: string;
  theme: "premium" | "classic" | "social" | "editorial";
  ticker: string[];
  hero: FeedItem | null;
  secondary: FeedItem[];
  latest: FeedItem[];
  radarElectoral: FeedItem[];
  interviews: FeedItem[];
  opinion: FeedItem[];
  sponsored: FeedItem[];
  externalPulse: FeedItem[];
  federalHighlights: Array<{
    province: string;
    headline: string;
    section: string;
    sourceUrl: string | null;
  }>;
  adSlots: Array<{
    id: string;
    title: string;
    detail: string;
  }>;
  social: {
    trendTopics: string[];
    weather: {
      location: string;
      temperatureC: number | null;
      feelsLikeC: number | null;
      condition: string;
      windKmh: number | null;
      updatedAt: string;
    };
    markets: Array<{
      symbol: string;
      label: string;
      price: number | null;
      changePct: number | null;
      currency: string;
      trend: "up" | "down" | "flat";
    }>;
    gadgets: Array<{
      id: string;
      label: string;
      value: string;
      detail: string;
    }>;
    microCards: Array<{
      id: string;
      title: string;
      section: string;
      province: string | null;
      sourceName: string | null;
      publishedAt: string;
      imageUrl: string | null;
      excerpt: string | null;
      reactions: {
        apoyo: number;
        analisis: number;
        guardados: number;
      };
    }>;
    suggestedSections: Array<{
      id: string;
      label: string;
      detail: string;
    }>;
    internationalLive: Array<{
      id: string;
      title: string;
      sourceName: string | null;
      sourceUrl: string | null;
      publishedAt: string;
      section: string;
    }>;
  };
};

export type NormalizedNewsInput = {
  title: string;
  slug: string;
  kicker: string | null;
  excerpt: string | null;
  body: string | null;
  imageUrl: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  authorName: string | null;
  section: NewsSection;
  province: Province | null;
  tags: string[];
  status: NewsStatus;
  publishedAt: Date | null;
  isSponsored: boolean;
  isFeatured: boolean;
  isHero: boolean;
  isInterview: boolean;
  isOpinion: boolean;
  isRadar: boolean;
};

export type AdminTokenPayload = {
  email: string;
  role: "admin";
};
