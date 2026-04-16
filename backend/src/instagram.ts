import type { News } from "@prisma/client";
import { normalizeHttpUrl, readString } from "./utils";

const META_GRAPH_API_BASE = readString(process.env.META_GRAPH_API_BASE) || "https://graph.facebook.com/v23.0";
const INSTAGRAM_GRAPH_ACCESS_TOKEN = readString(process.env.INSTAGRAM_GRAPH_ACCESS_TOKEN);
const INSTAGRAM_IG_USER_ID = readString(process.env.INSTAGRAM_IG_USER_ID);

export type InstagramEnvConfig = {
  configured: boolean;
  apiBase: string;
  accessToken: string;
};

export type InstagramManagedAccount = {
  pageId: string;
  pageName: string;
  instagramAccountId: string;
  instagramUsername: string | null;
  pageAccessToken: string | null;
};

export type InstagramPublishingPreferences = {
  enabled: boolean;
  accountId: string;
  username: string;
  captionTemplate: string;
  includeSiteUrl: boolean;
  includeSourceCredit: boolean;
  maxPostsPerRun: number;
};

export type InstagramPublishResult = {
  accountId: string;
  containerId: string;
  mediaId: string;
  permalink: string | null;
  caption: string;
};

function getInstagramEnvConfig(): InstagramEnvConfig {
  return {
    configured: Boolean(INSTAGRAM_GRAPH_ACCESS_TOKEN),
    apiBase: META_GRAPH_API_BASE.replace(/\/+$/, ""),
    accessToken: INSTAGRAM_GRAPH_ACCESS_TOKEN,
  };
}

function toUrl(pathname: string): string {
  return `${getInstagramEnvConfig().apiBase}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

async function graphJson<T>(pathname: string, options?: { method?: "GET" | "POST"; params?: Record<string, string> }): Promise<T> {
  const env = getInstagramEnvConfig();
  if (!env.configured) {
    throw new Error("Instagram Graph API no configurada. Falta INSTAGRAM_GRAPH_ACCESS_TOKEN.");
  }

  const method = options?.method ?? "GET";
  const params = new URLSearchParams({
    access_token: env.accessToken,
    ...(options?.params ?? {}),
  });

  const requestInit: RequestInit = {
    method,
  };
  if (method === "POST") {
    requestInit.headers = { "content-type": "application/x-www-form-urlencoded" };
    requestInit.body = params.toString();
  }

  const response = await fetch(method === "GET" ? `${toUrl(pathname)}?${params.toString()}` : toUrl(pathname), requestInit);

  const text = await response.text();
  const parsed = text ? (JSON.parse(text) as T & { error?: { message?: string } }) : ({} as T & { error?: { message?: string } });

  if (!response.ok) {
    const message =
      (parsed as { error?: { message?: string } }).error?.message ?? `Meta Graph respondio ${response.status}.`;
    throw new Error(message);
  }

  return parsed as T;
}

export async function discoverInstagramManagedAccounts(): Promise<InstagramManagedAccount[]> {
  const payload = await graphJson<{
    data?: Array<{
      id?: string;
      name?: string;
      access_token?: string;
      instagram_business_account?: {
        id?: string;
        username?: string;
      };
    }>;
  }>("/me/accounts", {
    params: {
      fields: "id,name,access_token,instagram_business_account{id,username}",
    },
  });

  return (payload.data ?? [])
    .map((item) => {
      const instagramAccountId = readString(item.instagram_business_account?.id);
      if (!instagramAccountId) {
        return null;
      }
      return {
        pageId: readString(item.id),
        pageName: readString(item.name) || "Pagina sin nombre",
        instagramAccountId,
        instagramUsername: readString(item.instagram_business_account?.username) || null,
        pageAccessToken: readString(item.access_token) || null,
      } satisfies InstagramManagedAccount;
    })
    .filter((item): item is InstagramManagedAccount => Boolean(item));
}

function resolvePublishToken(accounts: InstagramManagedAccount[], accountId: string): string {
  const matched = accounts.find((item) => item.instagramAccountId === accountId);
  return readString(matched?.pageAccessToken) || INSTAGRAM_GRAPH_ACCESS_TOKEN;
}

async function fetchInstagramAccountById(accountId: string): Promise<InstagramManagedAccount | null> {
  const normalizedAccountId = readString(accountId);
  if (!normalizedAccountId) {
    return null;
  }

  try {
    const payload = await graphJson<{
      id?: string;
      username?: string;
      media_count?: number;
    }>(`/${normalizedAccountId}`, {
      params: {
        fields: "id,username,media_count",
      },
    });

    const resolvedId = readString(payload.id);
    if (!resolvedId) {
      return null;
    }

    return {
      pageId: "",
      pageName: "Cuenta Instagram configurada manualmente",
      instagramAccountId: resolvedId,
      instagramUsername: readString(payload.username) || null,
      pageAccessToken: null,
    };
  } catch {
    return null;
  }
}

function clampCaption(input: string): string {
  return input.trim().slice(0, 2100);
}

function normalizeHashtagToken(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9\s_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+/g, "");
}

function buildCommunityManagerLead(
  news: Pick<News, "section" | "kicker">,
): { leadEmoji: string; leadLabel: string } {
  const sectionLeadMap: Record<string, { leadEmoji: string; leadLabel: string }> = {
    NACION: { leadEmoji: "\u{1F5F3}\u{FE0F}", leadLabel: "Pulso nacional" },
    PROVINCIAS: { leadEmoji: "\u{1F9F5}", leadLabel: "Pulso federal" },
    MUNICIPIOS: { leadEmoji: "\u{1F3D9}\u{FE0F}", leadLabel: "Pulso territorial" },
    OPINION: { leadEmoji: "\u{1F4CC}", leadLabel: "Claves del dia" },
    ENTREVISTAS: { leadEmoji: "\u{1F399}\u{FE0F}", leadLabel: "Voz directa" },
    PUBLINOTAS: { leadEmoji: "\u{1F4E3}", leadLabel: "Contenido de marca" },
    RADAR_ELECTORAL: { leadEmoji: "\u{1F4E1}", leadLabel: "Radar electoral" },
    ECONOMIA: { leadEmoji: "\u{1F4C8}", leadLabel: "Bolsillo y poder" },
    INTERNACIONALES: { leadEmoji: "\u{1F30E}", leadLabel: "Pulso global" },
    DISTRITOS: { leadEmoji: "\u{1F5FA}\u{FE0F}", leadLabel: "Distrito por distrito" },
  };
  const fallback = sectionLeadMap[readString(news.section).toUpperCase()] ?? {
    leadEmoji: "\u{1F4F0}",
    leadLabel: "Pulso Pais",
  };
  const kicker = readString(news.kicker);
  return kicker ? { leadEmoji: fallback.leadEmoji, leadLabel: kicker } : fallback;
}

function buildCommunityManagerHashtags(
  news: Pick<News, "tags" | "section">,
  maxTags = 6,
): string[] {
  const sectionTags: Record<string, string[]> = {
    NACION: ["PulsoPais", "PoliticaArgentina", "AgendaPublica"],
    RADAR_ELECTORAL: ["PulsoPais", "Elecciones2027", "RadarElectoral"],
    ECONOMIA: ["PulsoPais", "EconomiaArgentina", "Mercados"],
    PROVINCIAS: ["PulsoPais", "ArgentinaFederal", "Provincias"],
    MUNICIPIOS: ["PulsoPais", "PoliticaLocal", "Municipios"],
    OPINION: ["PulsoPais", "AnalisisPolitico", "Opinion"],
    ENTREVISTAS: ["PulsoPais", "Entrevista", "AgendaPublica"],
    INTERNACIONALES: ["PulsoPais", "Mundo", "Geopolitica"],
  };
  const rawTags = [
    ...(sectionTags[readString(news.section).toUpperCase()] ?? ["PulsoPais", "PoliticaArgentina"]),
    ...(news.tags ?? []).map((item) => readString(item)),
  ];
  return Array.from(
    new Set(
      rawTags
        .map((item) => normalizeHashtagToken(item))
        .filter(Boolean)
        .map((item) => `#${item}`),
    ),
  ).slice(0, maxTags);
}

export function buildInstagramCaption(
  news: Pick<News, "title" | "excerpt" | "sourceName" | "tags" | "slug" | "section" | "kicker">,
  preferences: InstagramPublishingPreferences,
  publicUrl: string,
): string {
  const { leadEmoji, leadLabel } = buildCommunityManagerLead(news);
  const tags = buildCommunityManagerHashtags(news);
  const shortExcerpt = readString(news.excerpt).slice(0, 220);
  const kicker = readString(news.kicker);
  const cta = preferences.includeSiteUrl
    ? "Segui la nota completa desde la publicacion."
    : "Nota completa en el link de la bio.";

  const replacements: Record<string, string> = {
    "{title}": readString(news.title),
    "{excerpt}": shortExcerpt,
    "{cta}": cta,
    "{url}": preferences.includeSiteUrl ? publicUrl : "",
    "{source}": preferences.includeSourceCredit ? `Fuente base: ${readString(news.sourceName) || "Pulso Pais"}` : "",
    "{hashtags}": tags.join(" "),
    "{leadEmoji}": leadEmoji,
    "{leadLabel}": leadLabel,
    "{kicker}": kicker || leadLabel,
  };

  let caption =
    preferences.captionTemplate ||
    "{leadEmoji} {leadLabel}\n\n{title}\n\n{excerpt}\n\n{cta}\n\n{hashtags}";
  for (const [needle, value] of Object.entries(replacements)) {
    caption = caption.replaceAll(needle, value);
  }

  return clampCaption(
    caption
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n"),
  );
}

function buildInstagramAssetUrl(baseImageUrl: string, mode: "feed" | "story"): string {
  const safeBase = normalizeHttpUrl(baseImageUrl);
  if (!safeBase) {
    return baseImageUrl;
  }
  const [w, h] = mode === "story" ? [1080, 1920] : [1080, 1350];
  const params = new URLSearchParams({
    url: safeBase,
    w: String(w),
    h: String(h),
    fit: "cover",
    output: "jpg",
    q: "86",
    n: "-1",
  });
  return `https://wsrv.nl/?${params.toString()}`;
}

export async function publishNewsToInstagram(params: {
  news: Pick<News, "id" | "title" | "excerpt" | "imageUrl" | "sourceName" | "tags" | "slug" | "section" | "kicker">;
  preferences: InstagramPublishingPreferences;
  frontendBaseUrl: string;
}): Promise<InstagramPublishResult> {
  const normalizedImage = normalizeHttpUrl(params.news.imageUrl);
  if (!normalizedImage) {
    throw new Error("La noticia no tiene una portada publica valida para Instagram.");
  }
  const instagramFeedImage = buildInstagramAssetUrl(normalizedImage, "feed");
  const effectiveAccountId = readString(params.preferences.accountId) || INSTAGRAM_IG_USER_ID;
  if (!effectiveAccountId) {
    throw new Error("Falta Instagram account id en la configuracion del backoffice.");
  }

  const accounts = await discoverInstagramManagedAccounts();
  const token = resolvePublishToken(accounts, effectiveAccountId);
  const articleUrl = `${params.frontendBaseUrl.replace(/\/+$/, "")}/noticias/${params.news.slug}`;
  const caption = buildInstagramCaption(params.news, params.preferences, articleUrl);

  const containerResponse = await fetch(toUrl(`/${effectiveAccountId}/media`), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      access_token: token,
      image_url: instagramFeedImage,
      caption,
    }).toString(),
  });
  const containerPayload = (await containerResponse.json()) as { id?: string; error?: { message?: string } };
  if (!containerResponse.ok || !readString(containerPayload.id)) {
    throw new Error(containerPayload.error?.message ?? "No se pudo crear el contenedor de Instagram.");
  }

  const publishResponse = await fetch(toUrl(`/${effectiveAccountId}/media_publish`), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      access_token: token,
      creation_id: readString(containerPayload.id),
    }).toString(),
  });
  const publishPayload = (await publishResponse.json()) as { id?: string; error?: { message?: string } };
  if (!publishResponse.ok || !readString(publishPayload.id)) {
    throw new Error(publishPayload.error?.message ?? "Meta rechazo la publicacion del contenedor.");
  }

  let permalink: string | null = null;
  try {
    const permalinkPayload = await fetch(
      `${toUrl(`/${readString(publishPayload.id)}`)}?${new URLSearchParams({
        access_token: token,
        fields: "permalink",
      }).toString()}`,
    );
    if (permalinkPayload.ok) {
      const parsed = (await permalinkPayload.json()) as { permalink?: string };
      permalink = normalizeHttpUrl(parsed.permalink) ?? null;
    }
  } catch {
    permalink = null;
  }

  return {
    accountId: effectiveAccountId,
    containerId: readString(containerPayload.id),
    mediaId: readString(publishPayload.id),
    permalink,
    caption,
  };
}

export async function getInstagramConnectionSummary(preferences: InstagramPublishingPreferences): Promise<{
  configured: boolean;
  accounts: InstagramManagedAccount[];
  selectedAccount: InstagramManagedAccount | null;
}> {
  const env = getInstagramEnvConfig();
  if (!env.configured) {
    return {
      configured: false,
      accounts: [],
      selectedAccount: null,
    };
  }

  const accounts = await discoverInstagramManagedAccounts();
  const effectiveAccountId = readString(preferences.accountId) || INSTAGRAM_IG_USER_ID;
  const matched = accounts.find((item) => item.instagramAccountId === effectiveAccountId) ?? null;
  const manualAccount = !matched && effectiveAccountId ? await fetchInstagramAccountById(effectiveAccountId) : null;
  const nextAccounts = manualAccount
    ? [...accounts.filter((item) => item.instagramAccountId !== manualAccount.instagramAccountId), manualAccount]
    : accounts;
  return {
    configured: true,
    accounts: nextAccounts,
    selectedAccount: matched ?? manualAccount,
  };
}
