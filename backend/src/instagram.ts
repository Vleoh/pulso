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

export function buildInstagramCaption(
  news: Pick<News, "title" | "excerpt" | "sourceName" | "tags" | "slug">,
  preferences: InstagramPublishingPreferences,
  publicUrl: string,
): string {
  const tags = (news.tags ?? [])
    .map((item) => item.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((item) => `#${item.replace(/\s+/g, "")}`);

  const replacements: Record<string, string> = {
    "{title}": readString(news.title),
    "{excerpt}": readString(news.excerpt),
    "{cta}": "Lee la nota completa en Pulso Pais.",
    "{url}": preferences.includeSiteUrl ? publicUrl : "",
    "{source}": preferences.includeSourceCredit ? `Fuente base: ${readString(news.sourceName) || "Pulso Pais"}` : "",
    "{hashtags}": tags.join(" "),
  };

  let caption = preferences.captionTemplate;
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

export async function publishNewsToInstagram(params: {
  news: Pick<News, "id" | "title" | "excerpt" | "imageUrl" | "sourceName" | "tags" | "slug">;
  preferences: InstagramPublishingPreferences;
  frontendBaseUrl: string;
}): Promise<InstagramPublishResult> {
  const normalizedImage = normalizeHttpUrl(params.news.imageUrl);
  if (!normalizedImage) {
    throw new Error("La noticia no tiene una portada publica valida para Instagram.");
  }
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
      image_url: normalizedImage,
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
