import { NewsSection, Province } from "@prisma/client";
import { normalizeImageUrl, normalizeHttpUrl, readString } from "./utils";

type CreativeAssetInput = {
  title: string;
  excerpt: string | null;
  section: NewsSection | null;
  province: Province | null;
  sourceName: string | null;
};

const WIKIMEDIA_API = "https://commons.wikimedia.org/w/api.php";

function unique(values: string[], max = 20): string[] {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean))).slice(0, max);
}

function detectPersonCandidate(text: string): string | null {
  const normalized = text.replace(/[|:]/g, " ");
  const pattern = /\b([A-Z][a-zA-Z]{2,}\s+[A-Z][a-zA-Z]{2,})\b/g;
  for (const match of normalized.matchAll(pattern)) {
    const value = readString(match[1]);
    if (!value) {
      continue;
    }
    if (/\b(Pulso|Pais|Argentina|Gobierno|Nacion|Provincia|Ciudad)\b/.test(value)) {
      continue;
    }
    return value;
  }
  return null;
}

function sectionTopicHint(section: NewsSection | null): string {
  const key = section ?? "NACION";
  const map: Record<NewsSection, string> = {
    NACION: "Casa Rosada Buenos Aires",
    PROVINCIAS: "provincias de Argentina paisaje urbano",
    MUNICIPIOS: "municipio argentino centro civico",
    OPINION: "Congreso de la Nacion Argentina",
    ENTREVISTAS: "periodismo entrevista politica argentina",
    PUBLINOTAS: "economia argentina industria",
    RADAR_ELECTORAL: "elecciones en Argentina urna",
    ECONOMIA: "economia argentina mercado financiero",
    INTERNACIONALES: "geopolitica mundo conferencia",
    DISTRITOS: "mapa politico argentina provincias",
  };
  return map[key] ?? "Argentina politica";
}

function provinceHint(province: Province | null): string | null {
  if (!province) {
    return null;
  }
  const text = province.replaceAll("_", " ").toLowerCase();
  return `${text} argentina ciudad`;
}

function buildSearchQueries(input: CreativeAssetInput): string[] {
  const text = [input.title, input.excerpt ?? "", input.sourceName ?? ""].join(" ");
  const person = detectPersonCandidate(text);
  const queries = unique([
    person ? `${person} Argentina` : "",
    input.title,
    `${input.title} argentina`,
    input.excerpt ?? "",
    provinceHint(input.province) ?? "",
    sectionTopicHint(input.section),
    "Casa Rosada Buenos Aires",
    "Congreso de la Nacion Argentina",
    "Obelisco Buenos Aires",
    "Argentina politica",
  ]);
  return queries.slice(0, 8);
}

function isImageTitleAcceptable(title: string): boolean {
  const normalized = title.toLowerCase();
  const blocked = [
    "logo",
    "icon",
    "svg",
    "diagram",
    "mapa",
    "map",
    "flag",
    "escudo",
    "document",
    "pdf",
    "poster",
    "infografia",
    "chart",
    "vector",
  ];
  return !blocked.some((token) => normalized.includes(token));
}

async function searchWikimediaImages(query: string): Promise<string[]> {
  const url = new URL(WIKIMEDIA_API);
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", query);
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrlimit", "8");
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|size|mime");
  url.searchParams.set("iiurlwidth", "1800");

  try {
    const response = await fetch(url.toString(), {
      headers: { "user-agent": "PulsoPaisAssetCreative/1.0", accept: "application/json" },
    });
    if (!response.ok) {
      return [];
    }
    const payload = (await response.json()) as {
      query?: {
        pages?: Record<
          string,
          {
            title?: string;
            imageinfo?: Array<{ thumburl?: string; url?: string; width?: number; height?: number; mime?: string }>;
          }
        >;
      };
    };

    const pages = Object.values(payload.query?.pages ?? {});
    const candidates: string[] = [];
    for (const page of pages) {
      const title = readString(page.title);
      if (title && !isImageTitleAcceptable(title)) {
        continue;
      }
      const info = page.imageinfo?.[0];
      if (!info) {
        continue;
      }
      const mime = readString(info.mime).toLowerCase();
      if (!mime.startsWith("image/")) {
        continue;
      }
      const width = Number(info.width ?? 0);
      const height = Number(info.height ?? 0);
      if (width < 900 || height < 500) {
        continue;
      }
      const imageUrl = normalizeImageUrl(info.thumburl ?? info.url);
      if (!imageUrl) {
        continue;
      }
      candidates.push(imageUrl);
    }
    return unique(candidates, 8);
  } catch {
    return [];
  }
}

export async function resolveCreativeAssetCandidates(input: CreativeAssetInput): Promise<string[]> {
  const queries = buildSearchQueries(input);
  const gathered: string[] = [];
  for (const query of queries) {
    if (gathered.length >= 8) {
      break;
    }
    const results = await searchWikimediaImages(query);
    for (const url of results) {
      const normalized = normalizeHttpUrl(url);
      if (!normalized || gathered.includes(normalized)) {
        continue;
      }
      gathered.push(normalized);
      if (gathered.length >= 8) {
        break;
      }
    }
  }
  return gathered;
}

