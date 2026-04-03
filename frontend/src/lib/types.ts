export type NewsSection =
  | "NACION"
  | "PROVINCIAS"
  | "MUNICIPIOS"
  | "OPINION"
  | "ENTREVISTAS"
  | "PUBLINOTAS"
  | "RADAR_ELECTORAL"
  | "ECONOMIA"
  | "INTERNACIONALES"
  | "DISTRITOS";

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
  province: string | null;
  publishedAt: string;
  isSponsored: boolean;
  isFeatured: boolean;
  isExternal: boolean;
};

export type NewsItem = {
  id: string;
  slug: string;
  title: string;
  kicker: string | null;
  excerpt: string | null;
  body: string | null;
  imageUrl: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  authorName: string | null;
  section: NewsSection;
  province: string | null;
  tags: string[];
  status: "DRAFT" | "PUBLISHED";
  isSponsored: boolean;
  isFeatured: boolean;
  isHero: boolean;
  isInterview: boolean;
  isOpinion: boolean;
  isRadar: boolean;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type NewsBySlugResponse = {
  item: NewsItem;
  related: FeedItem[];
};

export type HomePayload = {
  generatedAt: string;
  theme: "premium" | "classic" | "social" | "editorial";
  engagement: {
    commentsEnabled: boolean;
    reactionsEnabled: boolean;
    analysisEnabled: boolean;
  };
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
    id: string;
    province: string;
    headline: string;
    section: string;
    slug: string | null;
    isExternal: boolean;
    imageUrl: string | null;
    excerpt: string | null;
    sourceUrl: string | null;
    publishedAt: string;
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

export type PollStatus = "DRAFT" | "PUBLISHED";

export type PollOptionResult = {
  id: string;
  label: string;
  sortOrder: number;
  colorHex: string;
  emoji: string | null;
  votes: number;
  pct: number;
};

export type PollReasonItem = {
  id: string;
  optionId: string;
  optionLabel: string;
  optionColorHex: string;
  text: string;
  createdAt: string;
};

export type PollItem = {
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
  metrics: {
    totalVotes: number;
    options: PollOptionResult[];
    leader: PollOptionResult | null;
  };
  recentReasons: PollReasonItem[];
};
