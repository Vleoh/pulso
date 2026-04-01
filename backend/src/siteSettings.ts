export const HOME_THEME_KEY = "home_theme";
export const HOME_ENGAGEMENT_COMMENTS_KEY = "home_engagement_comments_enabled";
export const HOME_ENGAGEMENT_REACTIONS_KEY = "home_engagement_reactions_enabled";
export const HOME_ENGAGEMENT_ANALYSIS_KEY = "home_engagement_analysis_enabled";
export const AI_RESEARCH_ENABLED_KEY = "ai_research_enabled";
export const AI_RESEARCH_LIMIT_KEY = "ai_research_limit";
export const AI_RESEARCH_FETCH_TEXT_KEY = "ai_research_fetch_text";
export const AI_RESEARCH_CROP_ENABLED_KEY = "ai_research_crop_enabled";
export const AI_RESEARCH_CROP_WIDTH_KEY = "ai_research_crop_width";
export const AI_RESEARCH_CROP_HEIGHT_KEY = "ai_research_crop_height";
export const AI_RESEARCH_INTERNALIZE_KEY = "ai_research_internalize";
export const AI_RESEARCH_CAMPAIGN_LINE_KEY = "ai_research_campaign_line";

export const HOME_THEME_OPTIONS = [
  { value: "editorial", label: "Cronista Dorado (default)" },
  { value: "classic", label: "Clasico Editorial" },
  { value: "social", label: "Social Newsroom" },
  { value: "premium", label: "Pulso Premium" },
] as const;

export type HomeTheme = (typeof HOME_THEME_OPTIONS)[number]["value"];

type PrismaLike = {
  siteSetting?: {
    findUnique(args: { where: { key: string }; select: { value: true } }): Promise<{ value: string } | null>;
    upsert(args: {
      where: { key: string };
      update: { value: string };
      create: { key: string; value: string };
    }): Promise<unknown>;
  };
};

export type HomeEngagementSettings = {
  commentsEnabled: boolean;
  reactionsEnabled: boolean;
  analysisEnabled: boolean;
};

export type AiResearchSettings = {
  enabled: boolean;
  hotNewsLimit: number;
  fetchArticleText: boolean;
  cropImage: boolean;
  cropWidth: number;
  cropHeight: number;
  internalizeSourceLinks: boolean;
  campaignLine: string;
};

const DEFAULT_HOME_ENGAGEMENT_SETTINGS: HomeEngagementSettings = {
  commentsEnabled: true,
  reactionsEnabled: true,
  analysisEnabled: true,
};

const DEFAULT_AI_RESEARCH_SETTINGS: AiResearchSettings = {
  enabled: true,
  hotNewsLimit: 12,
  fetchArticleText: true,
  cropImage: true,
  cropWidth: 1200,
  cropHeight: 675,
  internalizeSourceLinks: true,
  campaignLine: "",
};

export function normalizeHomeTheme(value: string): HomeTheme {
  const normalized = value.trim().toLowerCase();
  if (normalized === "premium") {
    return "premium";
  }
  if (normalized === "editorial") {
    return "editorial";
  }
  if (normalized === "social") {
    return "social";
  }
  if (normalized === "classic") {
    return "classic";
  }
  return "editorial";
}

function siteSettingDelegate(prisma: PrismaLike) {
  const delegate = prisma.siteSetting;
  if (!delegate) {
    throw new Error("Modelo SiteSetting no disponible. Ejecuta prisma generate y aplica migraciones.");
  }
  return delegate;
}

function normalizeBooleanSetting(value: string | null | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on", "si"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function normalizeNumberSetting(value: string | null | undefined, fallback: number, min: number, max: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function normalizeCampaignLine(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  return value.replace(/\s+/g, " ").trim().slice(0, 260);
}

export async function getHomeTheme(prisma: PrismaLike): Promise<HomeTheme> {
  const setting = await siteSettingDelegate(prisma).findUnique({
    where: { key: HOME_THEME_KEY },
    select: { value: true },
  });
  return normalizeHomeTheme(setting?.value ?? "editorial");
}

export async function setHomeTheme(prisma: PrismaLike, value: HomeTheme): Promise<HomeTheme> {
  const theme = normalizeHomeTheme(value);
  await siteSettingDelegate(prisma).upsert({
    where: { key: HOME_THEME_KEY },
    update: { value: theme },
    create: {
      key: HOME_THEME_KEY,
      value: theme,
    },
  });
  return theme;
}

export async function getHomeEngagementSettings(prisma: PrismaLike): Promise<HomeEngagementSettings> {
  const delegate = siteSettingDelegate(prisma);
  const [comments, reactions, analysis] = await Promise.all([
    delegate.findUnique({
      where: { key: HOME_ENGAGEMENT_COMMENTS_KEY },
      select: { value: true },
    }),
    delegate.findUnique({
      where: { key: HOME_ENGAGEMENT_REACTIONS_KEY },
      select: { value: true },
    }),
    delegate.findUnique({
      where: { key: HOME_ENGAGEMENT_ANALYSIS_KEY },
      select: { value: true },
    }),
  ]);

  return {
    commentsEnabled: normalizeBooleanSetting(comments?.value, DEFAULT_HOME_ENGAGEMENT_SETTINGS.commentsEnabled),
    reactionsEnabled: normalizeBooleanSetting(reactions?.value, DEFAULT_HOME_ENGAGEMENT_SETTINGS.reactionsEnabled),
    analysisEnabled: normalizeBooleanSetting(analysis?.value, DEFAULT_HOME_ENGAGEMENT_SETTINGS.analysisEnabled),
  };
}

export async function setHomeEngagementSettings(
  prisma: PrismaLike,
  value: Partial<HomeEngagementSettings>,
): Promise<HomeEngagementSettings> {
  const current = await getHomeEngagementSettings(prisma);
  const next: HomeEngagementSettings = {
    commentsEnabled: value.commentsEnabled ?? current.commentsEnabled,
    reactionsEnabled: value.reactionsEnabled ?? current.reactionsEnabled,
    analysisEnabled: value.analysisEnabled ?? current.analysisEnabled,
  };
  const delegate = siteSettingDelegate(prisma);

  await Promise.all([
    delegate.upsert({
      where: { key: HOME_ENGAGEMENT_COMMENTS_KEY },
      update: { value: next.commentsEnabled ? "true" : "false" },
      create: { key: HOME_ENGAGEMENT_COMMENTS_KEY, value: next.commentsEnabled ? "true" : "false" },
    }),
    delegate.upsert({
      where: { key: HOME_ENGAGEMENT_REACTIONS_KEY },
      update: { value: next.reactionsEnabled ? "true" : "false" },
      create: { key: HOME_ENGAGEMENT_REACTIONS_KEY, value: next.reactionsEnabled ? "true" : "false" },
    }),
    delegate.upsert({
      where: { key: HOME_ENGAGEMENT_ANALYSIS_KEY },
      update: { value: next.analysisEnabled ? "true" : "false" },
      create: { key: HOME_ENGAGEMENT_ANALYSIS_KEY, value: next.analysisEnabled ? "true" : "false" },
    }),
  ]);

  return next;
}

export async function getAiResearchSettings(prisma: PrismaLike): Promise<AiResearchSettings> {
  const delegate = siteSettingDelegate(prisma);
  const [
    enabled,
    limit,
    fetchText,
    cropEnabled,
    cropWidth,
    cropHeight,
    internalize,
    campaignLine,
  ] = await Promise.all([
    delegate.findUnique({ where: { key: AI_RESEARCH_ENABLED_KEY }, select: { value: true } }),
    delegate.findUnique({ where: { key: AI_RESEARCH_LIMIT_KEY }, select: { value: true } }),
    delegate.findUnique({ where: { key: AI_RESEARCH_FETCH_TEXT_KEY }, select: { value: true } }),
    delegate.findUnique({ where: { key: AI_RESEARCH_CROP_ENABLED_KEY }, select: { value: true } }),
    delegate.findUnique({ where: { key: AI_RESEARCH_CROP_WIDTH_KEY }, select: { value: true } }),
    delegate.findUnique({ where: { key: AI_RESEARCH_CROP_HEIGHT_KEY }, select: { value: true } }),
    delegate.findUnique({ where: { key: AI_RESEARCH_INTERNALIZE_KEY }, select: { value: true } }),
    delegate.findUnique({ where: { key: AI_RESEARCH_CAMPAIGN_LINE_KEY }, select: { value: true } }),
  ]);

  return {
    enabled: normalizeBooleanSetting(enabled?.value, DEFAULT_AI_RESEARCH_SETTINGS.enabled),
    hotNewsLimit: normalizeNumberSetting(limit?.value, DEFAULT_AI_RESEARCH_SETTINGS.hotNewsLimit, 3, 20),
    fetchArticleText: normalizeBooleanSetting(fetchText?.value, DEFAULT_AI_RESEARCH_SETTINGS.fetchArticleText),
    cropImage: normalizeBooleanSetting(cropEnabled?.value, DEFAULT_AI_RESEARCH_SETTINGS.cropImage),
    cropWidth: normalizeNumberSetting(cropWidth?.value, DEFAULT_AI_RESEARCH_SETTINGS.cropWidth, 480, 2400),
    cropHeight: normalizeNumberSetting(cropHeight?.value, DEFAULT_AI_RESEARCH_SETTINGS.cropHeight, 320, 1800),
    internalizeSourceLinks: normalizeBooleanSetting(
      internalize?.value,
      DEFAULT_AI_RESEARCH_SETTINGS.internalizeSourceLinks,
    ),
    campaignLine: normalizeCampaignLine(campaignLine?.value),
  };
}

export async function setAiResearchSettings(
  prisma: PrismaLike,
  value: Partial<AiResearchSettings>,
): Promise<AiResearchSettings> {
  const current = await getAiResearchSettings(prisma);
  const next: AiResearchSettings = {
    enabled: value.enabled ?? current.enabled,
    hotNewsLimit:
      value.hotNewsLimit === undefined
        ? current.hotNewsLimit
        : Math.max(3, Math.min(20, Math.round(value.hotNewsLimit))),
    fetchArticleText: value.fetchArticleText ?? current.fetchArticleText,
    cropImage: value.cropImage ?? current.cropImage,
    cropWidth:
      value.cropWidth === undefined ? current.cropWidth : Math.max(480, Math.min(2400, Math.round(value.cropWidth))),
    cropHeight:
      value.cropHeight === undefined ? current.cropHeight : Math.max(320, Math.min(1800, Math.round(value.cropHeight))),
    internalizeSourceLinks: value.internalizeSourceLinks ?? current.internalizeSourceLinks,
    campaignLine: value.campaignLine === undefined ? current.campaignLine : normalizeCampaignLine(value.campaignLine),
  };

  const delegate = siteSettingDelegate(prisma);
  await Promise.all([
    delegate.upsert({
      where: { key: AI_RESEARCH_ENABLED_KEY },
      update: { value: next.enabled ? "true" : "false" },
      create: { key: AI_RESEARCH_ENABLED_KEY, value: next.enabled ? "true" : "false" },
    }),
    delegate.upsert({
      where: { key: AI_RESEARCH_LIMIT_KEY },
      update: { value: String(next.hotNewsLimit) },
      create: { key: AI_RESEARCH_LIMIT_KEY, value: String(next.hotNewsLimit) },
    }),
    delegate.upsert({
      where: { key: AI_RESEARCH_FETCH_TEXT_KEY },
      update: { value: next.fetchArticleText ? "true" : "false" },
      create: { key: AI_RESEARCH_FETCH_TEXT_KEY, value: next.fetchArticleText ? "true" : "false" },
    }),
    delegate.upsert({
      where: { key: AI_RESEARCH_CROP_ENABLED_KEY },
      update: { value: next.cropImage ? "true" : "false" },
      create: { key: AI_RESEARCH_CROP_ENABLED_KEY, value: next.cropImage ? "true" : "false" },
    }),
    delegate.upsert({
      where: { key: AI_RESEARCH_CROP_WIDTH_KEY },
      update: { value: String(next.cropWidth) },
      create: { key: AI_RESEARCH_CROP_WIDTH_KEY, value: String(next.cropWidth) },
    }),
    delegate.upsert({
      where: { key: AI_RESEARCH_CROP_HEIGHT_KEY },
      update: { value: String(next.cropHeight) },
      create: { key: AI_RESEARCH_CROP_HEIGHT_KEY, value: String(next.cropHeight) },
    }),
    delegate.upsert({
      where: { key: AI_RESEARCH_INTERNALIZE_KEY },
      update: { value: next.internalizeSourceLinks ? "true" : "false" },
      create: { key: AI_RESEARCH_INTERNALIZE_KEY, value: next.internalizeSourceLinks ? "true" : "false" },
    }),
    delegate.upsert({
      where: { key: AI_RESEARCH_CAMPAIGN_LINE_KEY },
      update: { value: next.campaignLine },
      create: { key: AI_RESEARCH_CAMPAIGN_LINE_KEY, value: next.campaignLine },
    }),
  ]);

  return next;
}
