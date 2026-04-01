export const HOME_THEME_KEY = "home_theme";
export const HOME_ENGAGEMENT_COMMENTS_KEY = "home_engagement_comments_enabled";
export const HOME_ENGAGEMENT_REACTIONS_KEY = "home_engagement_reactions_enabled";
export const HOME_ENGAGEMENT_ANALYSIS_KEY = "home_engagement_analysis_enabled";

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

const DEFAULT_HOME_ENGAGEMENT_SETTINGS: HomeEngagementSettings = {
  commentsEnabled: true,
  reactionsEnabled: true,
  analysisEnabled: true,
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
