import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getNewsBySlug } from "@/lib/api";
import type { FeedItem } from "@/lib/types";

export const dynamic = "force-dynamic";

type NewsDetailPageProps = {
  params: Promise<{ slug: string }>;
};

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

function storyLink(item: Pick<FeedItem, "slug" | "sourceUrl" | "isExternal">): { href: string; external: boolean } | null {
  if (item.slug && !item.isExternal) {
    return { href: `/noticias/${item.slug}`, external: false };
  }
  if (item.sourceUrl) {
    return { href: item.sourceUrl, external: true };
  }
  return null;
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

  const paragraphs = detailParagraphs(payload.item.body, payload.item.excerpt);

  return (
    <main className="news-detail-screen">
      <article className="news-detail-shell">
        <header className="news-detail-header">
          <div className="news-detail-nav">
            <Link href="/">Home</Link>
            <Link href="/noticias">Noticias</Link>
            <span>{payload.item.section.replaceAll("_", " ")}</span>
          </div>
          <p>{payload.item.kicker ?? payload.item.section.replaceAll("_", " ")}</p>
          <h1>{payload.item.title}</h1>
          {payload.item.excerpt ? <h2>{payload.item.excerpt}</h2> : null}
          <div className="news-detail-meta">
            <span>{payload.item.authorName ?? "Redaccion Pulso Pais"}</span>
            <span>{formatDate(payload.item.publishedAt)}</span>
          </div>
        </header>

        {payload.item.imageUrl ? (
          <figure className="news-detail-cover">
            <Image src={payload.item.imageUrl} alt={payload.item.title} fill priority sizes="(max-width: 1100px) 100vw, 960px" className="news-detail-cover-image" />
          </figure>
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
              <span key={tag}>{tag}</span>
            ))}
          </div>
        </footer>
      </article>

      {payload.related.length > 0 ? (
        <section className="news-related-shell">
          <h3>Relacionadas</h3>
          <div className="news-related-grid">
            {payload.related.map((entry) => {
              const link = storyLink(entry);
              const card = (
                <>
                  <div className="news-related-media">
                    {entry.imageUrl ? (
                      <Image src={entry.imageUrl} alt={entry.title} fill sizes="(max-width: 920px) 100vw, 30vw" className="news-related-image" />
                    ) : (
                      <div className="news-related-placeholder" />
                    )}
                  </div>
                  <div className="news-related-copy">
                    <p>{entry.section.replaceAll("_", " ")}</p>
                    <h4>{entry.title}</h4>
                  </div>
                </>
              );

              if (!link) {
                return (
                  <article key={entry.id} className="news-related-card">
                    {card}
                  </article>
                );
              }
              if (link.external) {
                return (
                  <article key={entry.id} className="news-related-card">
                    <a href={link.href} target="_blank" rel="noreferrer" className="news-related-link">
                      {card}
                    </a>
                  </article>
                );
              }
              return (
                <article key={entry.id} className="news-related-card">
                  <Link href={link.href} className="news-related-link">
                    {card}
                  </Link>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </main>
  );
}
