import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { SmartImage } from "@/components/SmartImage";
import { UserSessionNav } from "@/components/UserSessionNav";
import { getNewsBySlug, getNewsList } from "@/lib/api";
import type { FeedItem, NewsSection } from "@/lib/types";

export const dynamic = "force-dynamic";

const LOGO_SRC = "/logo.png?v=20260403";

const SECTION_LABEL: Record<NewsSection, string> = {
  NACION: "Nacion",
  PROVINCIAS: "Provincias",
  MUNICIPIOS: "Municipios",
  OPINION: "Opinion",
  ENTREVISTAS: "Entrevistas",
  PUBLINOTAS: "Publinotas",
  RADAR_ELECTORAL: "Radar Electoral",
  ECONOMIA: "Economia",
  INTERNACIONALES: "Mundo",
  DISTRITOS: "Distritos",
};

const NAV_ITEMS: Array<{ label: string; section?: NewsSection }> = [
  { label: "Nacion", section: "NACION" },
  { label: "Provincias", section: "PROVINCIAS" },
  { label: "Elecciones", section: "RADAR_ELECTORAL" },
  { label: "Economia", section: "ECONOMIA" },
  { label: "Opinion", section: "OPINION" },
  { label: "Mundo", section: "INTERNACIONALES" },
];

const GALLERY_BLOCK_REGEX = /\[\[GALERIA_FOTOS\]\]([\s\S]*?)\[\[\/GALERIA_FOTOS\]\]/i;
const VIDEO_BLOCK_REGEX = /\[\[VIDEO_PRINCIPAL\]\]([\s\S]*?)\[\[\/VIDEO_PRINCIPAL\]\]/i;

type NewsDetailPageProps = {
  params: Promise<{ slug: string }>;
};

function sanitizeDisplayText(input: string): string {
  return input
    .replace(/\uFFFD/g, "")
    .replace(/Ã‚/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripCategoryPrefix(input: string, section?: NewsSection | string): string {
  const labels = [
    "opinion",
    "entrevista",
    "reportaje",
    "analisis",
    "analisis politico",
    "contenido patrocinado",
    "patrocinado",
    "electoral",
    "radar electoral",
    "nacion",
    "provincias",
    "municipios",
    "economia",
    "internacionales",
    "distritos",
    "exclusivo",
  ];
  if (section) {
    labels.push(String(section).replaceAll("_", " ").toLowerCase());
  }
  const escapedLabels = Array.from(new Set(labels)).map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const matcher = `(?:${escapedLabels.join("|")})`;

  return input
    .replace(new RegExp(`^\\s*${matcher}\\s*[:\\-|]\\s*`, "i"), "")
    .replace(new RegExp(`^\\s*\\[?${matcher}\\]?\\s+`, "i"), "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTitle(item: { title: string; section?: NewsSection | string }): string {
  const cleaned = stripCategoryPrefix(sanitizeDisplayText(item.title), item.section);
  return cleaned || sanitizeDisplayText(item.title);
}

function shortText(input: string, max = 120): string {
  const normalized = sanitizeDisplayText(input);
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max - 3).trimEnd()}...`;
}

function cleanText(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\uFFFD/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractGalleryFromBody(body: string | null): { bodyWithoutGallery: string | null; galleryUrls: string[] } {
  if (!body || body.trim().length === 0) {
    return { bodyWithoutGallery: null, galleryUrls: [] };
  }

  const match = body.match(GALLERY_BLOCK_REGEX);
  if (!match) {
    return { bodyWithoutGallery: body, galleryUrls: [] };
  }

  const galleryUrls = Array.from(
    new Set(
      match[1]
        .split(/\r?\n/)
        .map((line) => line.replace(/^-\s*/, "").trim())
        .filter((line) => /^https?:\/\//i.test(line)),
    ),
  ).slice(0, 6);

  const bodyWithoutGallery = body.replace(GALLERY_BLOCK_REGEX, "").replace(/\n{3,}/g, "\n\n").trim();
  return {
    bodyWithoutGallery: bodyWithoutGallery.length > 0 ? bodyWithoutGallery : null,
    galleryUrls,
  };
}

function extractPrimaryVideoFromBody(body: string | null): {
  bodyWithoutVideo: string | null;
  videoUrl: string | null;
  posterUrl: string | null;
} {
  if (!body || body.trim().length === 0) {
    return { bodyWithoutVideo: null, videoUrl: null, posterUrl: null };
  }

  const match = body.match(VIDEO_BLOCK_REGEX);
  if (!match) {
    return { bodyWithoutVideo: body, videoUrl: null, posterUrl: null };
  }

  let videoUrl: string | null = null;
  let posterUrl: string | null = null;
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^url:\s*/i.test(trimmed)) {
      videoUrl = trimmed.replace(/^url:\s*/i, "").trim() || null;
    }
    if (/^poster:\s*/i.test(trimmed)) {
      posterUrl = trimmed.replace(/^poster:\s*/i, "").trim() || null;
    }
  }

  const bodyWithoutVideo = body.replace(VIDEO_BLOCK_REGEX, "").replace(/\n{3,}/g, "\n\n").trim();
  return {
    bodyWithoutVideo: bodyWithoutVideo.length > 0 ? bodyWithoutVideo : null,
    videoUrl,
    posterUrl,
  };
}

function storyLink(item: { slug: string | null; sourceUrl: string | null; isExternal?: boolean }): { href: string; external: boolean } | null {
  if (item.slug && !item.isExternal) {
    return { href: `/noticias/${item.slug}`, external: false };
  }
  if (item.sourceUrl) {
    return { href: item.sourceUrl, external: true };
  }
  return null;
}

function StoryAnchor({
  item,
  className,
  children,
}: {
  item: { slug: string | null; sourceUrl: string | null; isExternal?: boolean };
  className?: string;
  children: ReactNode;
}) {
  const link = storyLink(item);
  if (!link) {
    return <span className={className}>{children}</span>;
  }
  if (link.external) {
    return (
      <a href={link.href} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={link.href} className={className}>
      {children}
    </Link>
  );
}

function formatDate(dateIso: string): string {
  return new Date(dateIso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatHeaderDate(dateIso: string): string {
  const date = new Date(dateIso);
  const weekday = date.toLocaleDateString("es-AR", { weekday: "short" }).replace(".", "");
  const day = date.toLocaleDateString("es-AR", { day: "2-digit" });
  const month = date.toLocaleDateString("es-AR", { month: "short" }).replace(".", "");
  return `${weekday} ${day} ${month}`.toUpperCase();
}

function detailParagraphs(body: string | null, excerpt: string | null): string[] {
  const source = cleanText(body ?? excerpt ?? "");
  if (!source) {
    return [];
  }
  return source
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

function dedupeById(items: FeedItem[]): FeedItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

export async function generateMetadata({ params }: NewsDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const payload = await getNewsBySlug(slug);
  if (!payload?.item) {
    return {
      title: "Noticia | Pulso Pais",
      description: "Cobertura politica de Pulso Pais.",
    };
  }
  return {
    title: `${payload.item.title} | Pulso Pais`,
    description: payload.item.excerpt ?? payload.item.title,
    openGraph: {
      title: payload.item.title,
      description: payload.item.excerpt ?? payload.item.title,
      images: payload.item.imageUrl ? [{ url: payload.item.imageUrl }] : undefined,
    },
  };
}

export default async function NewsDetailPage({ params }: NewsDetailPageProps) {
  const { slug } = await params;
  const payload = await getNewsBySlug(slug);

  if (!payload?.item) {
    notFound();
  }

  const stream = (await getNewsList({ limit: 16, external: true })).filter((entry) => entry.id !== payload.item.id);
  const mostRead = dedupeById([...payload.related, ...stream]).slice(0, 6);
  const sideStream = stream.slice(0, 3);
  const related = dedupeById(payload.related).slice(0, 6);
  const { bodyWithoutVideo, videoUrl, posterUrl } = extractPrimaryVideoFromBody(payload.item.body);
  const { bodyWithoutGallery, galleryUrls } = extractGalleryFromBody(bodyWithoutVideo);
  const paragraphs = detailParagraphs(bodyWithoutGallery, payload.item.excerpt);

  return (
    <main className="news-detail-screen">
      <header className="cp-shell cp-header news-detail-site-header">
        <div className="cp-header-icons">
          <Link href="/" aria-label="Volver al inicio" className="news-inline-icon">
            Inicio
          </Link>
          <Link href="/noticias" aria-label="Ver noticias" className="news-inline-icon">
            Noticias
          </Link>
        </div>

        <div className="cp-brand">
          <Link href="/" className="news-brand-link">
            <img src={LOGO_SRC} alt="Pulso Pais" width={230} height={74} className="cp-brand-logo" />
          </Link>
          <p>El diario de la situacion</p>
        </div>

        <div className="cp-header-actions">
          <span>{formatHeaderDate(payload.item.publishedAt)}</span>
          <Link href="/noticias">Seguir leyendo</Link>
          <UserSessionNav />
        </div>
      </header>

      <nav className="cp-shell cp-nav news-detail-site-nav">
        {NAV_ITEMS.map((item) => (
          <Link key={item.label} href={item.section ? `/noticias?section=${item.section}` : "/noticias"} className={item.section === payload.item.section ? "active" : ""}>
            {item.label}
          </Link>
        ))}
      </nav>

      <section className="cp-shell news-detail-layout">
        <article className="news-detail-shell">
          <header className="news-detail-header">
            <div className="news-detail-nav">
              <Link href="/">Home</Link>
              <Link href="/noticias">Noticias</Link>
              <span>{SECTION_LABEL[payload.item.section]}</span>
            </div>
            <p>{sanitizeDisplayText(payload.item.kicker ?? SECTION_LABEL[payload.item.section])}</p>
            <h1>{cleanTitle({ title: payload.item.title, section: payload.item.section })}</h1>
            {payload.item.excerpt ? <h2>{sanitizeDisplayText(payload.item.excerpt)}</h2> : null}
            <div className="news-detail-meta">
              <span>{sanitizeDisplayText(payload.item.authorName ?? "Redaccion Pulso Pais")}</span>
              <span>{formatDate(payload.item.publishedAt)}</span>
            </div>
          </header>

          <figure className="news-detail-cover">
            <SmartImage
              src={payload.item.imageUrl}
              alt={cleanTitle({ title: payload.item.title, section: payload.item.section })}
              fill
              priority
              sizes="(max-width: 1100px) 100vw, 960px"
              className="news-detail-cover-image"
              fallbackClassName="news-related-placeholder"
            />
          </figure>

          {videoUrl ? (
            <section className="news-detail-video">
              <video controls preload="metadata" poster={posterUrl ?? undefined}>
                <source src={videoUrl} />
              </video>
            </section>
          ) : null}

          {galleryUrls.length > 0 ? (
            <section className="news-detail-gallery" aria-label="Galeria de imagenes de la nota">
              {galleryUrls.map((url, index) => (
                <figure key={`${url}-${index}`} className="news-detail-gallery-item">
                  <SmartImage
                    src={url}
                    alt={`Galeria ${index + 1}: ${cleanTitle({ title: payload.item.title, section: payload.item.section })}`}
                    fill
                    sizes="(max-width: 900px) 100vw, 46vw"
                    className="news-related-image"
                    fallbackClassName="news-related-placeholder"
                  />
                </figure>
              ))}
            </section>
          ) : null}

          <section className="news-detail-body">
            {paragraphs.length > 0 ? (
              paragraphs.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 20)}`}>{paragraph}</p>)
            ) : (
              <p>Esta nota no tiene cuerpo cargado todavia. Completa el contenido desde backoffice para publicarla con desarrollo completo.</p>
            )}
          </section>

          <footer className="news-detail-footer">
            {payload.item.sourceUrl ? (
              <a href={payload.item.sourceUrl} target="_blank" rel="noreferrer">
                Ver fuente original
              </a>
            ) : null}
            <div className="news-detail-tags">
              {payload.item.tags.map((tag) => (
                <span key={tag}>{sanitizeDisplayText(tag)}</span>
              ))}
            </div>
          </footer>
        </article>

        <aside className="news-detail-sidebar">
          <section className="news-side-card news-most-read">
            <h3>Lo mas leido</h3>
            <div className="news-most-read-list">
              {mostRead.map((entry, index) => (
                <article key={entry.id} className="news-most-read-item">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div className="news-most-read-thumb">
                    <SmartImage
                      src={entry.imageUrl}
                      alt={cleanTitle({ title: entry.title, section: entry.section })}
                      fill
                      sizes="92px"
                      className="news-related-image"
                      fallbackClassName="news-related-placeholder"
                    />
                  </div>
                  <div className="news-most-read-copy">
                    <small>{sanitizeDisplayText(SECTION_LABEL[entry.section])}</small>
                    <h4>
                      <StoryAnchor item={entry} className="news-story-link">
                        {shortText(cleanTitle({ title: entry.title, section: entry.section }), 72)}
                      </StoryAnchor>
                    </h4>
                    <p>{formatDate(entry.publishedAt)}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="news-side-card news-side-stream">
            <h3>Segui leyendo</h3>
            {sideStream.map((entry) => (
              <article key={entry.id} className="news-side-stream-item">
                <div className="news-side-stream-media">
                  <SmartImage
                    src={entry.imageUrl}
                    alt={cleanTitle({ title: entry.title, section: entry.section })}
                    fill
                    sizes="190px"
                    className="news-related-image"
                    fallbackClassName="news-related-placeholder"
                  />
                </div>
                <div className="news-side-stream-copy">
                  <small>{sanitizeDisplayText(SECTION_LABEL[entry.section])}</small>
                  <h4>
                    <StoryAnchor item={entry} className="news-story-link">
                      {shortText(cleanTitle({ title: entry.title, section: entry.section }), 70)}
                    </StoryAnchor>
                  </h4>
                </div>
              </article>
            ))}
          </section>
        </aside>
      </section>

      {related.length > 0 ? (
        <section className="cp-shell news-related-shell">
          <h3>Relacionadas</h3>
          <div className="news-related-grid">
            {related.map((entry) => {
              const card = (
                <>
                  <div className="news-related-media">
                    <SmartImage
                      src={entry.imageUrl}
                      alt={cleanTitle({ title: entry.title, section: entry.section })}
                      fill
                      sizes="(max-width: 920px) 100vw, 30vw"
                      className="news-related-image"
                      fallbackClassName="news-related-placeholder"
                    />
                  </div>
                  <div className="news-related-copy">
                    <p>{sanitizeDisplayText(SECTION_LABEL[entry.section])}</p>
                    <h4>{shortText(cleanTitle({ title: entry.title, section: entry.section }), 88)}</h4>
                  </div>
                </>
              );
              return (
                <article key={entry.id} className="news-related-card">
                  <StoryAnchor item={entry} className="news-related-link">
                    {card}
                  </StoryAnchor>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </main>
  );
}
