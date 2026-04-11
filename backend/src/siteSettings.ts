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
export const EDITORIAL_AUTOPILOT_ENABLED_KEY = "editorial_autopilot_enabled";
export const EDITORIAL_AUTOPILOT_MODE_KEY = "editorial_autopilot_mode";
export const EDITORIAL_AUTOPILOT_INSTRUCTION_KEY = "editorial_autopilot_instruction";
export const EDITORIAL_AUTOPILOT_MAX_STORIES_KEY = "editorial_autopilot_max_stories";
export const EDITORIAL_AUTOPILOT_INTERNALIZE_LIMIT_KEY = "editorial_autopilot_internalize_limit";
export const EDITORIAL_AUTOPILOT_AUTO_PUBLISH_KEY = "editorial_autopilot_auto_publish";
export const EDITORIAL_AUTOPILOT_ALLOW_DELETE_KEY = "editorial_autopilot_allow_delete";
export const EDITORIAL_AUTOPILOT_SOCIAL_ENABLED_KEY = "editorial_autopilot_social_enabled";
export const EDITORIAL_AUTOPILOT_MIN_DAILY_KEY = "editorial_autopilot_min_daily";
export const EDITORIAL_AUTOPILOT_MAX_DAILY_KEY = "editorial_autopilot_max_daily";
export const EDITORIAL_AUTOPILOT_WINDOW_START_KEY = "editorial_autopilot_window_start";
export const EDITORIAL_AUTOPILOT_WINDOW_END_KEY = "editorial_autopilot_window_end";
export const EDITORIAL_AUTOPILOT_TEMPORAL_PROMPT_KEY = "editorial_autopilot_temporal_prompt";
export const EDITORIAL_AUTOPILOT_TODAY_DATE_KEY = "editorial_autopilot_today_date";
export const EDITORIAL_AUTOPILOT_TODAY_TARGET_KEY = "editorial_autopilot_today_target";
export const EDITORIAL_AUTOPILOT_LAST_RUN_AT_KEY = "editorial_autopilot_last_run_at";
export const EDITORIAL_AUTOPILOT_LAST_RUN_SUMMARY_KEY = "editorial_autopilot_last_run_summary";
export const INSTAGRAM_PUBLISHING_ENABLED_KEY = "instagram_publishing_enabled";
export const INSTAGRAM_ACCOUNT_ID_KEY = "instagram_account_id";
export const INSTAGRAM_USERNAME_KEY = "instagram_username";
export const INSTAGRAM_CAPTION_TEMPLATE_KEY = "instagram_caption_template";
export const INSTAGRAM_INCLUDE_SITE_URL_KEY = "instagram_include_site_url";
export const INSTAGRAM_INCLUDE_SOURCE_CREDIT_KEY = "instagram_include_source_credit";
export const INSTAGRAM_MAX_POSTS_PER_RUN_KEY = "instagram_max_posts_per_run";
export const EDITORIAL_COMMAND_CHAT_HISTORY_KEY = "editorial_command_chat_history";
export const EDITORIAL_COMMAND_CHAT_LOGS_KEY = "editorial_command_chat_logs";
export const EDITORIAL_COMMAND_PENDING_PLAN_KEY = "editorial_command_pending_plan";

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

export const EDITORIAL_AUTOPILOT_MODE_OPTIONS = [
  { value: "MANUAL", label: "Manual" },
  { value: "HYBRID", label: "Hibrido" },
  { value: "AUTO", label: "Autonomo" },
] as const;

export type EditorialAutopilotMode = (typeof EDITORIAL_AUTOPILOT_MODE_OPTIONS)[number]["value"];

export type EditorialAutopilotSettings = {
  enabled: boolean;
  mode: EditorialAutopilotMode;
  instruction: string;
  temporalPrompt: string;
  maxStoriesPerRun: number;
  internalizeLimit: number;
  minDailyStories: number;
  maxDailyStories: number;
  windowStartHour: number;
  windowEndHour: number;
  autoPublishSite: boolean;
  allowDelete: boolean;
  socialEnabled: boolean;
  todayDate: string;
  todayTarget: number;
  lastRunAt: string | null;
  lastRunSummary: string;
};

export type InstagramPublishingSettings = {
  enabled: boolean;
  accountId: string;
  username: string;
  captionTemplate: string;
  includeSiteUrl: boolean;
  includeSourceCredit: boolean;
  maxPostsPerRun: number;
};

export type EditorialCommandChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  kind: "message" | "plan" | "execution" | "warning";
  text: string;
  createdAt: string;
  meta?: {
    destructive?: boolean;
    requiresConfirmation?: boolean;
    model?: string;
  };
};

export type EditorialCommandLogEntry = {
  id: string;
  level: "info" | "success" | "warn" | "error";
  title: string;
  detail: string;
  createdAt: string;
};

export type EditorialCommandChatState = {
  history: EditorialCommandChatMessage[];
  logs: EditorialCommandLogEntry[];
  pendingPlanJson: string;
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

const DEFAULT_EDITORIAL_AUTOPILOT_SETTINGS: EditorialAutopilotSettings = {
  enabled: false,
  mode: "HYBRID",
  instruction:
    "Actua como radar, reportero, editor y estilista de marca de Pulso Pais. Investiga agenda politica argentina con foco en interes publico, evidencia primero, consecuencias reales, claridad editorial y criterio federal. Internaliza externas relevantes como notas propias, evita propaganda partidaria y no autopubliques si la evidencia o la portada no son suficientes.",
  temporalPrompt: "",
  maxStoriesPerRun: 4,
  internalizeLimit: 4,
  minDailyStories: 4,
  maxDailyStories: 10,
  windowStartHour: 8,
  windowEndHour: 23,
  autoPublishSite: false,
  allowDelete: false,
  socialEnabled: false,
  todayDate: "",
  todayTarget: 0,
  lastRunAt: null,
  lastRunSummary: "",
};

const DEFAULT_INSTAGRAM_PUBLISHING_SETTINGS: InstagramPublishingSettings = {
  enabled: false,
  accountId: "",
  username: "",
  captionTemplate:
    "{leadEmoji} {title}\n\n{kicker}\n{excerpt}\n\n{cta}\n\n{hashtags}",
  includeSiteUrl: false,
  includeSourceCredit: false,
  maxPostsPerRun: 4,
};

const DEFAULT_EDITORIAL_COMMAND_CHAT_STATE: EditorialCommandChatState = {
  history: [],
  logs: [],
  pendingPlanJson: "",
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

function normalizeShortText(value: string | null | undefined, fallback = "", maxLength = 2000): string {
  if (!value) {
    return fallback;
  }
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function safeParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeChatMessage(raw: unknown): EditorialCommandChatMessage | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const entry = raw as Record<string, unknown>;
  const role =
    entry.role === "user" || entry.role === "assistant" || entry.role === "system" ? entry.role : null;
  const kind =
    entry.kind === "message" || entry.kind === "plan" || entry.kind === "execution" || entry.kind === "warning"
      ? entry.kind
      : "message";
  const text = normalizeShortText(typeof entry.text === "string" ? entry.text : "", "", 4000);
  const createdAt = normalizeShortText(typeof entry.createdAt === "string" ? entry.createdAt : "", "", 120);
  if (!role || !text) {
    return null;
  }
  const metaRaw = entry.meta && typeof entry.meta === "object" ? (entry.meta as Record<string, unknown>) : null;
  const model = metaRaw ? normalizeShortText(typeof metaRaw.model === "string" ? metaRaw.model : "", "", 120) : "";
  const metaValue = metaRaw
    ? {
        destructive: normalizeBooleanSetting(typeof metaRaw.destructive === "string" ? metaRaw.destructive : String(metaRaw.destructive ?? ""), false),
        requiresConfirmation: normalizeBooleanSetting(
          typeof metaRaw.requiresConfirmation === "string" ? metaRaw.requiresConfirmation : String(metaRaw.requiresConfirmation ?? ""),
          false,
        ),
        ...(model ? { model } : {}),
      }
    : null;
  return {
    id: normalizeShortText(typeof entry.id === "string" ? entry.id : "", "", 120) || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    kind,
    text,
    createdAt: createdAt || new Date().toISOString(),
    ...(metaValue ? { meta: metaValue } : {}),
  };
}

function normalizeLogEntry(raw: unknown): EditorialCommandLogEntry | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const entry = raw as Record<string, unknown>;
  const level =
    entry.level === "info" || entry.level === "success" || entry.level === "warn" || entry.level === "error"
      ? entry.level
      : "info";
  const title = normalizeShortText(typeof entry.title === "string" ? entry.title : "", "", 220);
  const detail = normalizeShortText(typeof entry.detail === "string" ? entry.detail : "", "", 2000);
  if (!title) {
    return null;
  }
  return {
    id: normalizeShortText(typeof entry.id === "string" ? entry.id : "", "", 120) || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    level,
    title,
    detail,
    createdAt: normalizeShortText(typeof entry.createdAt === "string" ? entry.createdAt : "", "", 120) || new Date().toISOString(),
  };
}

function normalizeEditorialCommandChatState(raw: string | null | undefined): EditorialCommandChatState {
  const parsed = safeParseJson<Partial<EditorialCommandChatState>>(raw, {});
  const history = Array.isArray(parsed.history)
    ? parsed.history.map((item) => normalizeChatMessage(item)).filter((item): item is EditorialCommandChatMessage => Boolean(item)).slice(-24)
    : [];
  const logs = Array.isArray(parsed.logs)
    ? parsed.logs.map((item) => normalizeLogEntry(item)).filter((item): item is EditorialCommandLogEntry => Boolean(item)).slice(-40)
    : [];
  return {
    history,
    logs,
    pendingPlanJson: normalizeShortText(parsed.pendingPlanJson, "", 32000),
  };
}

function normalizeAutopilotMode(value: string | null | undefined, fallback: EditorialAutopilotMode): EditorialAutopilotMode {
  const normalized = (value ?? "").trim().toUpperCase();
  if (normalized === "MANUAL" || normalized === "HYBRID" || normalized === "AUTO") {
    return normalized;
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

export async function getEditorialAutopilotSettings(prisma: PrismaLike): Promise<EditorialAutopilotSettings> {
  const delegate = siteSettingDelegate(prisma);
  const [
    enabled,
    mode,
    instruction,
    temporalPrompt,
    maxStories,
    internalizeLimit,
    minDailyStories,
    maxDailyStories,
    windowStartHour,
    windowEndHour,
    autoPublish,
    allowDelete,
    socialEnabled,
    todayDate,
    todayTarget,
    lastRunAt,
    lastRunSummary,
  ] = await Promise.all([
    delegate.findUnique({ where: { key: EDITORIAL_AUTOPILOT_ENABLED_KEY }, select: { value: true } }),
    delegate.findUnique({ where: { key: EDITORIAL_AUTOPILOT_MODE_KEY }, select: { value: true } }),
    delegate.findUnique({ where: { key: EDITORIAL_AUTOPILOT_INSTRUCTION_KEY }, select: { value: true } }),
    delegate.findUnique({ where: { key: EDITORIAL_AUTOPILOT_TEMPORAL_PROMPT_KEY }, select: { value: true } }),
    delegate.findUnique({ where: { key: EDITORIAL_AUTOPILOT_MAX_STORIES_KEY }, select: { value: true } }),
    delegate.findUnique({ where: { key: EDITORIAL_AUTOPILOT_INTERNALIZE_LIMIT_KEY }, select: { value: true } }),
    delegate.findUnique({ where: { key: EDITORIAL_AUTOPILOT_MIN_DAILY_KEY }, select: { value: true } }),
    delegate.findUnique({ where: { key: EDITORIAL_AUTOPILOT_MAX_DAILY_KEY }, select: { value: true } }),
    delegate.findUnique({ where: { key: EDITORIAL_AUTOPILOT_WINDOW_START_KEY }, select: { value: true } }),
    delegate.findUnique({ where: { key: EDITORIAL_AUTOPILOT_WINDOW_END_KEY }, select: { value: true } }),
    delegate.findUnique({ where: { key: EDITORIAL_AUTOPILOT_AUTO_PUBLISH_KEY }, select: { value: true } }),
    delegate.findUnique({ where: { key: EDITORIAL_AUTOPILOT_ALLOW_DELETE_KEY }, select: { value: true } }),
    delegate.findUnique({ where: { key: EDITORIAL_AUTOPILOT_SOCIAL_ENABLED_KEY }, select: { value: true } }),
    delegate.findUnique({ where: { key: EDITORIAL_AUTOPILOT_TODAY_DATE_KEY }, select: { value: true } }),
    delegate.findUnique({ where: { key: EDITORIAL_AUTOPILOT_TODAY_TARGET_KEY }, select: { value: true } }),
    delegate.findUnique({ where: { key: EDITORIAL_AUTOPILOT_LAST_RUN_AT_KEY }, select: { value: true } }),
    delegate.findUnique({ where: { key: EDITORIAL_AUTOPILOT_LAST_RUN_SUMMARY_KEY }, select: { value: true } }),
  ]);

  return {
    enabled: normalizeBooleanSetting(enabled?.value, DEFAULT_EDITORIAL_AUTOPILOT_SETTINGS.enabled),
    mode: normalizeAutopilotMode(mode?.value, DEFAULT_EDITORIAL_AUTOPILOT_SETTINGS.mode),
    instruction: normalizeShortText(
      instruction?.value,
      DEFAULT_EDITORIAL_AUTOPILOT_SETTINGS.instruction,
      2400,
    ),
    temporalPrompt: normalizeShortText(temporalPrompt?.value, "", 1000),
    maxStoriesPerRun: normalizeNumberSetting(
      maxStories?.value,
      DEFAULT_EDITORIAL_AUTOPILOT_SETTINGS.maxStoriesPerRun,
      1,
      20,
    ),
    internalizeLimit: normalizeNumberSetting(
      internalizeLimit?.value,
      DEFAULT_EDITORIAL_AUTOPILOT_SETTINGS.internalizeLimit,
      0,
      20,
    ),
    minDailyStories: normalizeNumberSetting(
      minDailyStories?.value,
      DEFAULT_EDITORIAL_AUTOPILOT_SETTINGS.minDailyStories,
      1,
      30,
    ),
    maxDailyStories: normalizeNumberSetting(
      maxDailyStories?.value,
      DEFAULT_EDITORIAL_AUTOPILOT_SETTINGS.maxDailyStories,
      1,
      30,
    ),
    windowStartHour: normalizeNumberSetting(
      windowStartHour?.value,
      DEFAULT_EDITORIAL_AUTOPILOT_SETTINGS.windowStartHour,
      0,
      23,
    ),
    windowEndHour: normalizeNumberSetting(
      windowEndHour?.value,
      DEFAULT_EDITORIAL_AUTOPILOT_SETTINGS.windowEndHour,
      1,
      23,
    ),
    autoPublishSite: normalizeBooleanSetting(autoPublish?.value, DEFAULT_EDITORIAL_AUTOPILOT_SETTINGS.autoPublishSite),
    allowDelete: normalizeBooleanSetting(allowDelete?.value, DEFAULT_EDITORIAL_AUTOPILOT_SETTINGS.allowDelete),
    socialEnabled: normalizeBooleanSetting(socialEnabled?.value, DEFAULT_EDITORIAL_AUTOPILOT_SETTINGS.socialEnabled),
    todayDate: normalizeShortText(todayDate?.value, "", 40),
    todayTarget: normalizeNumberSetting(todayTarget?.value, DEFAULT_EDITORIAL_AUTOPILOT_SETTINGS.todayTarget, 0, 30),
    lastRunAt: normalizeShortText(lastRunAt?.value, "", 120) || null,
    lastRunSummary: normalizeShortText(lastRunSummary?.value, "", 1000),
  };
}

export async function setEditorialAutopilotSettings(
  prisma: PrismaLike,
  value: Partial<EditorialAutopilotSettings>,
): Promise<EditorialAutopilotSettings> {
  const current = await getEditorialAutopilotSettings(prisma);
  const next: EditorialAutopilotSettings = {
    enabled: value.enabled ?? current.enabled,
    mode: value.mode ? normalizeAutopilotMode(value.mode, current.mode) : current.mode,
    instruction:
      value.instruction === undefined
        ? current.instruction
        : normalizeShortText(value.instruction, current.instruction, 2400),
    temporalPrompt:
      value.temporalPrompt === undefined ? current.temporalPrompt : normalizeShortText(value.temporalPrompt, "", 1000),
    maxStoriesPerRun:
      value.maxStoriesPerRun === undefined
        ? current.maxStoriesPerRun
        : Math.max(1, Math.min(20, Math.round(value.maxStoriesPerRun))),
    internalizeLimit:
      value.internalizeLimit === undefined
        ? current.internalizeLimit
        : Math.max(0, Math.min(20, Math.round(value.internalizeLimit))),
    minDailyStories:
      value.minDailyStories === undefined ? current.minDailyStories : Math.max(1, Math.min(30, Math.round(value.minDailyStories))),
    maxDailyStories:
      value.maxDailyStories === undefined ? current.maxDailyStories : Math.max(1, Math.min(30, Math.round(value.maxDailyStories))),
    windowStartHour:
      value.windowStartHour === undefined ? current.windowStartHour : Math.max(0, Math.min(23, Math.round(value.windowStartHour))),
    windowEndHour:
      value.windowEndHour === undefined ? current.windowEndHour : Math.max(1, Math.min(23, Math.round(value.windowEndHour))),
    autoPublishSite: value.autoPublishSite ?? current.autoPublishSite,
    allowDelete: value.allowDelete ?? current.allowDelete,
    socialEnabled: value.socialEnabled ?? current.socialEnabled,
    todayDate: value.todayDate === undefined ? current.todayDate : normalizeShortText(value.todayDate, "", 40),
    todayTarget:
      value.todayTarget === undefined ? current.todayTarget : Math.max(0, Math.min(30, Math.round(value.todayTarget))),
    lastRunAt: value.lastRunAt === undefined ? current.lastRunAt : normalizeShortText(value.lastRunAt, "", 120) || null,
    lastRunSummary:
      value.lastRunSummary === undefined
        ? current.lastRunSummary
        : normalizeShortText(value.lastRunSummary, "", 1000),
  };

  const delegate = siteSettingDelegate(prisma);
  await Promise.all([
    delegate.upsert({
      where: { key: EDITORIAL_AUTOPILOT_ENABLED_KEY },
      update: { value: next.enabled ? "true" : "false" },
      create: { key: EDITORIAL_AUTOPILOT_ENABLED_KEY, value: next.enabled ? "true" : "false" },
    }),
    delegate.upsert({
      where: { key: EDITORIAL_AUTOPILOT_MODE_KEY },
      update: { value: next.mode },
      create: { key: EDITORIAL_AUTOPILOT_MODE_KEY, value: next.mode },
    }),
    delegate.upsert({
      where: { key: EDITORIAL_AUTOPILOT_INSTRUCTION_KEY },
      update: { value: next.instruction },
      create: { key: EDITORIAL_AUTOPILOT_INSTRUCTION_KEY, value: next.instruction },
    }),
    delegate.upsert({
      where: { key: EDITORIAL_AUTOPILOT_TEMPORAL_PROMPT_KEY },
      update: { value: next.temporalPrompt },
      create: { key: EDITORIAL_AUTOPILOT_TEMPORAL_PROMPT_KEY, value: next.temporalPrompt },
    }),
    delegate.upsert({
      where: { key: EDITORIAL_AUTOPILOT_MAX_STORIES_KEY },
      update: { value: String(next.maxStoriesPerRun) },
      create: { key: EDITORIAL_AUTOPILOT_MAX_STORIES_KEY, value: String(next.maxStoriesPerRun) },
    }),
    delegate.upsert({
      where: { key: EDITORIAL_AUTOPILOT_INTERNALIZE_LIMIT_KEY },
      update: { value: String(next.internalizeLimit) },
      create: { key: EDITORIAL_AUTOPILOT_INTERNALIZE_LIMIT_KEY, value: String(next.internalizeLimit) },
    }),
    delegate.upsert({
      where: { key: EDITORIAL_AUTOPILOT_MIN_DAILY_KEY },
      update: { value: String(next.minDailyStories) },
      create: { key: EDITORIAL_AUTOPILOT_MIN_DAILY_KEY, value: String(next.minDailyStories) },
    }),
    delegate.upsert({
      where: { key: EDITORIAL_AUTOPILOT_MAX_DAILY_KEY },
      update: { value: String(next.maxDailyStories) },
      create: { key: EDITORIAL_AUTOPILOT_MAX_DAILY_KEY, value: String(next.maxDailyStories) },
    }),
    delegate.upsert({
      where: { key: EDITORIAL_AUTOPILOT_WINDOW_START_KEY },
      update: { value: String(next.windowStartHour) },
      create: { key: EDITORIAL_AUTOPILOT_WINDOW_START_KEY, value: String(next.windowStartHour) },
    }),
    delegate.upsert({
      where: { key: EDITORIAL_AUTOPILOT_WINDOW_END_KEY },
      update: { value: String(next.windowEndHour) },
      create: { key: EDITORIAL_AUTOPILOT_WINDOW_END_KEY, value: String(next.windowEndHour) },
    }),
    delegate.upsert({
      where: { key: EDITORIAL_AUTOPILOT_AUTO_PUBLISH_KEY },
      update: { value: next.autoPublishSite ? "true" : "false" },
      create: { key: EDITORIAL_AUTOPILOT_AUTO_PUBLISH_KEY, value: next.autoPublishSite ? "true" : "false" },
    }),
    delegate.upsert({
      where: { key: EDITORIAL_AUTOPILOT_ALLOW_DELETE_KEY },
      update: { value: next.allowDelete ? "true" : "false" },
      create: { key: EDITORIAL_AUTOPILOT_ALLOW_DELETE_KEY, value: next.allowDelete ? "true" : "false" },
    }),
    delegate.upsert({
      where: { key: EDITORIAL_AUTOPILOT_SOCIAL_ENABLED_KEY },
      update: { value: next.socialEnabled ? "true" : "false" },
      create: { key: EDITORIAL_AUTOPILOT_SOCIAL_ENABLED_KEY, value: next.socialEnabled ? "true" : "false" },
    }),
    delegate.upsert({
      where: { key: EDITORIAL_AUTOPILOT_TODAY_DATE_KEY },
      update: { value: next.todayDate },
      create: { key: EDITORIAL_AUTOPILOT_TODAY_DATE_KEY, value: next.todayDate },
    }),
    delegate.upsert({
      where: { key: EDITORIAL_AUTOPILOT_TODAY_TARGET_KEY },
      update: { value: String(next.todayTarget) },
      create: { key: EDITORIAL_AUTOPILOT_TODAY_TARGET_KEY, value: String(next.todayTarget) },
    }),
    delegate.upsert({
      where: { key: EDITORIAL_AUTOPILOT_LAST_RUN_AT_KEY },
      update: { value: next.lastRunAt ?? "" },
      create: { key: EDITORIAL_AUTOPILOT_LAST_RUN_AT_KEY, value: next.lastRunAt ?? "" },
    }),
    delegate.upsert({
      where: { key: EDITORIAL_AUTOPILOT_LAST_RUN_SUMMARY_KEY },
      update: { value: next.lastRunSummary },
      create: { key: EDITORIAL_AUTOPILOT_LAST_RUN_SUMMARY_KEY, value: next.lastRunSummary },
    }),
  ]);

  return next;
}

export async function getInstagramPublishingSettings(prisma: PrismaLike): Promise<InstagramPublishingSettings> {
  const delegate = siteSettingDelegate(prisma);
  const [
    enabled,
    accountId,
    username,
    captionTemplate,
    includeSiteUrl,
    includeSourceCredit,
    maxPostsPerRun,
  ] = await Promise.all([
    delegate.findUnique({ where: { key: INSTAGRAM_PUBLISHING_ENABLED_KEY }, select: { value: true } }),
    delegate.findUnique({ where: { key: INSTAGRAM_ACCOUNT_ID_KEY }, select: { value: true } }),
    delegate.findUnique({ where: { key: INSTAGRAM_USERNAME_KEY }, select: { value: true } }),
    delegate.findUnique({ where: { key: INSTAGRAM_CAPTION_TEMPLATE_KEY }, select: { value: true } }),
    delegate.findUnique({ where: { key: INSTAGRAM_INCLUDE_SITE_URL_KEY }, select: { value: true } }),
    delegate.findUnique({ where: { key: INSTAGRAM_INCLUDE_SOURCE_CREDIT_KEY }, select: { value: true } }),
    delegate.findUnique({ where: { key: INSTAGRAM_MAX_POSTS_PER_RUN_KEY }, select: { value: true } }),
  ]);

  return {
    enabled: normalizeBooleanSetting(enabled?.value, DEFAULT_INSTAGRAM_PUBLISHING_SETTINGS.enabled),
    accountId: normalizeShortText(accountId?.value, "", 120),
    username: normalizeShortText(username?.value, "", 120),
    captionTemplate: normalizeShortText(
      captionTemplate?.value,
      DEFAULT_INSTAGRAM_PUBLISHING_SETTINGS.captionTemplate,
      1200,
    ),
    includeSiteUrl: normalizeBooleanSetting(includeSiteUrl?.value, DEFAULT_INSTAGRAM_PUBLISHING_SETTINGS.includeSiteUrl),
    includeSourceCredit: normalizeBooleanSetting(
      includeSourceCredit?.value,
      DEFAULT_INSTAGRAM_PUBLISHING_SETTINGS.includeSourceCredit,
    ),
    maxPostsPerRun: normalizeNumberSetting(
      maxPostsPerRun?.value,
      DEFAULT_INSTAGRAM_PUBLISHING_SETTINGS.maxPostsPerRun,
      1,
      5,
    ),
  };
}

export async function setInstagramPublishingSettings(
  prisma: PrismaLike,
  value: Partial<InstagramPublishingSettings>,
): Promise<InstagramPublishingSettings> {
  const current = await getInstagramPublishingSettings(prisma);
  const next: InstagramPublishingSettings = {
    enabled: value.enabled ?? current.enabled,
    accountId: value.accountId === undefined ? current.accountId : normalizeShortText(value.accountId, "", 120),
    username: value.username === undefined ? current.username : normalizeShortText(value.username, "", 120),
    captionTemplate:
      value.captionTemplate === undefined
        ? current.captionTemplate
        : normalizeShortText(value.captionTemplate, current.captionTemplate, 1200),
    includeSiteUrl: value.includeSiteUrl ?? current.includeSiteUrl,
    includeSourceCredit: value.includeSourceCredit ?? current.includeSourceCredit,
    maxPostsPerRun:
      value.maxPostsPerRun === undefined
        ? current.maxPostsPerRun
        : Math.max(1, Math.min(5, Math.round(value.maxPostsPerRun))),
  };

  const delegate = siteSettingDelegate(prisma);
  await Promise.all([
    delegate.upsert({
      where: { key: INSTAGRAM_PUBLISHING_ENABLED_KEY },
      update: { value: next.enabled ? "true" : "false" },
      create: { key: INSTAGRAM_PUBLISHING_ENABLED_KEY, value: next.enabled ? "true" : "false" },
    }),
    delegate.upsert({
      where: { key: INSTAGRAM_ACCOUNT_ID_KEY },
      update: { value: next.accountId },
      create: { key: INSTAGRAM_ACCOUNT_ID_KEY, value: next.accountId },
    }),
    delegate.upsert({
      where: { key: INSTAGRAM_USERNAME_KEY },
      update: { value: next.username },
      create: { key: INSTAGRAM_USERNAME_KEY, value: next.username },
    }),
    delegate.upsert({
      where: { key: INSTAGRAM_CAPTION_TEMPLATE_KEY },
      update: { value: next.captionTemplate },
      create: { key: INSTAGRAM_CAPTION_TEMPLATE_KEY, value: next.captionTemplate },
    }),
    delegate.upsert({
      where: { key: INSTAGRAM_INCLUDE_SITE_URL_KEY },
      update: { value: next.includeSiteUrl ? "true" : "false" },
      create: { key: INSTAGRAM_INCLUDE_SITE_URL_KEY, value: next.includeSiteUrl ? "true" : "false" },
    }),
    delegate.upsert({
      where: { key: INSTAGRAM_INCLUDE_SOURCE_CREDIT_KEY },
      update: { value: next.includeSourceCredit ? "true" : "false" },
      create: { key: INSTAGRAM_INCLUDE_SOURCE_CREDIT_KEY, value: next.includeSourceCredit ? "true" : "false" },
    }),
    delegate.upsert({
      where: { key: INSTAGRAM_MAX_POSTS_PER_RUN_KEY },
      update: { value: String(next.maxPostsPerRun) },
      create: { key: INSTAGRAM_MAX_POSTS_PER_RUN_KEY, value: String(next.maxPostsPerRun) },
    }),
  ]);

  return next;
}

export async function getEditorialCommandChatState(prisma: PrismaLike): Promise<EditorialCommandChatState> {
  const delegate = siteSettingDelegate(prisma);
  const [history, logs, pendingPlan] = await Promise.all([
    delegate.findUnique({ where: { key: EDITORIAL_COMMAND_CHAT_HISTORY_KEY }, select: { value: true } }),
    delegate.findUnique({ where: { key: EDITORIAL_COMMAND_CHAT_LOGS_KEY }, select: { value: true } }),
    delegate.findUnique({ where: { key: EDITORIAL_COMMAND_PENDING_PLAN_KEY }, select: { value: true } }),
  ]);

  const parsed = normalizeEditorialCommandChatState(
    JSON.stringify({
      history: safeParseJson(history?.value, DEFAULT_EDITORIAL_COMMAND_CHAT_STATE.history),
      logs: safeParseJson(logs?.value, DEFAULT_EDITORIAL_COMMAND_CHAT_STATE.logs),
      pendingPlanJson: normalizeShortText(pendingPlan?.value, "", 32000),
    }),
  );

  return parsed;
}

export async function setEditorialCommandChatState(
  prisma: PrismaLike,
  value: Partial<EditorialCommandChatState>,
): Promise<EditorialCommandChatState> {
  const current = await getEditorialCommandChatState(prisma);
  const next: EditorialCommandChatState = {
    history: (value.history ?? current.history).slice(-24),
    logs: (value.logs ?? current.logs).slice(-40),
    pendingPlanJson:
      value.pendingPlanJson === undefined ? current.pendingPlanJson : normalizeShortText(value.pendingPlanJson, "", 32000),
  };
  const delegate = siteSettingDelegate(prisma);
  await Promise.all([
    delegate.upsert({
      where: { key: EDITORIAL_COMMAND_CHAT_HISTORY_KEY },
      update: { value: JSON.stringify(next.history) },
      create: { key: EDITORIAL_COMMAND_CHAT_HISTORY_KEY, value: JSON.stringify(next.history) },
    }),
    delegate.upsert({
      where: { key: EDITORIAL_COMMAND_CHAT_LOGS_KEY },
      update: { value: JSON.stringify(next.logs) },
      create: { key: EDITORIAL_COMMAND_CHAT_LOGS_KEY, value: JSON.stringify(next.logs) },
    }),
    delegate.upsert({
      where: { key: EDITORIAL_COMMAND_PENDING_PLAN_KEY },
      update: { value: next.pendingPlanJson },
      create: { key: EDITORIAL_COMMAND_PENDING_PLAN_KEY, value: next.pendingPlanJson },
    }),
  ]);
  return next;
}
