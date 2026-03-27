export const HOME_THEME_KEY = "home_theme";

export const HOME_THEME_OPTIONS = [
  { value: "premium", label: "Pulso Premium (actual)" },
  { value: "classic", label: "Clasico Editorial (referencia)" },
  { value: "social", label: "Social Newsroom (cards + interaccion)" },
  { value: "editorial", label: "Editorial Negro/Oro (modelo Pulso)" },
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

export function normalizeHomeTheme(value: string): HomeTheme {
  const normalized = value.trim().toLowerCase();
  if (normalized === "editorial") {
    return "editorial";
  }
  if (normalized === "social") {
    return "social";
  }
  if (normalized === "classic") {
    return "classic";
  }
  return "premium";
}

function siteSettingDelegate(prisma: PrismaLike) {
  const delegate = prisma.siteSetting;
  if (!delegate) {
    throw new Error("Modelo SiteSetting no disponible. Ejecuta prisma generate y aplica migraciones.");
  }
  return delegate;
}

export async function getHomeTheme(prisma: PrismaLike): Promise<HomeTheme> {
  const setting = await siteSettingDelegate(prisma).findUnique({
    where: { key: HOME_THEME_KEY },
    select: { value: true },
  });
  return normalizeHomeTheme(setting?.value ?? "premium");
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
