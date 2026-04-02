import type { Metadata } from "next";
import Link from "next/link";
import { SmartImage } from "@/components/SmartImage";
import { getNewsList } from "@/lib/api";
import type { FeedItem, NewsSection } from "@/lib/types";

export const dynamic = "force-dynamic";

const NEWS_SECTIONS: Array<{ value: NewsSection; label: string }> = [
  { value: "NACION", label: "Nacion" },
  { value: "PROVINCIAS", label: "Provincias" },
  { value: "MUNICIPIOS", label: "Municipios" },
  { value: "RADAR_ELECTORAL", label: "Radar Electoral" },
  { value: "ECONOMIA", label: "Economia" },
  { value: "OPINION", label: "Opinion" },
  { value: "ENTREVISTAS", label: "Entrevistas" },
  { value: "INTERNACIONALES", label: "Internacionales" },
];

type NewsHubPageProps = {
  searchParams: Promise<{ section?: string }>;
};

export async function generateMetadata({ searchParams }: NewsHubPageProps): Promise<Metadata> {
  const params = await searchParams;
  const sectionRaw = String(params.section ?? "").toUpperCase();
  const section = NEWS_SECTIONS.find((entry) => entry.value === sectionRaw);
  return {
    title: section ? `Noticias ${section.label} | Pulso Pais` : "Noticias | Pulso Pais",
    description: "Cobertura politica nacional y federal de Pulso Pais.",
  };
}

function formatDate(dateIso: string): string {
  return new Date(dateIso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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

function NewsHubCard({ item }: { item: FeedItem }) {
  const link = storyLink(item);
  const content = (
    <>
      <div className="news-hub-card-media">
        <SmartImage
          src={item.imageUrl}
          alt={item.title}
          fill
          sizes="(max-width: 900px) 100vw, 33vw"
          className="news-hub-card-image"
          fallbackClassName="news-hub-card-placeholder"
        />
      </div>
      <div className="news-hub-card-body">
        <p>{item.kicker ?? item.section.replaceAll("_", " ")}</p>
        <h3>{item.title}</h3>
        {item.excerpt ? <span>{item.excerpt}</span> : null}
        <small>
          {item.sourceName ?? "Pulso Pais"} - {formatDate(item.publishedAt)}
        </small>
      </div>
    </>
  );

  if (!link) {
    return <article className="news-hub-card">{content}</article>;
  }

  if (link.external) {
    return (
      <article className="news-hub-card">
        <a href={link.href} target="_blank" rel="noreferrer" className="news-hub-card-link">
          {content}
        </a>
      </article>
    );
  }

  return (
    <article className="news-hub-card">
      <Link href={link.href} className="news-hub-card-link">
        {content}
      </Link>
    </article>
  );
}

export default async function NewsHubPage({ searchParams }: NewsHubPageProps) {
  const params = await searchParams;
  const sectionRaw = String(params.section ?? "").toUpperCase();
  const activeSection = NEWS_SECTIONS.find((entry) => entry.value === sectionRaw);
  const items = await getNewsList({
    section: activeSection?.value,
    limit: 60,
    external: true,
  });

  return (
    <main className="news-hub-screen">
      <div className="news-hub-shell">
        <header className="news-hub-header">
          <div>
            <h1>Gestion de Noticias Publicas</h1>
            <p>Portada de lectura con acceso directo a cada nota y fuente.</p>
          </div>
          <div className="news-hub-actions">
            <Link href="/">Ir al Home</Link>
            <a href={process.env.NEXT_PUBLIC_BACKOFFICE_URL ?? "https://pulso-backend-kgtc.onrender.com/backoffice"} target="_blank" rel="noreferrer">
              Backoffice
            </a>
          </div>
        </header>

        <nav className="news-hub-filters" aria-label="Filtrar por seccion">
          <Link href="/noticias" className={!activeSection ? "active" : ""}>
            Todas
          </Link>
          {NEWS_SECTIONS.map((entry) => (
            <Link key={entry.value} href={`/noticias?section=${entry.value}`} className={activeSection?.value === entry.value ? "active" : ""}>
              {entry.label}
            </Link>
          ))}
        </nav>

        <section className="news-hub-grid">
          {items.map((item) => (
            <NewsHubCard key={item.id} item={item} />
          ))}
        </section>
      </div>
    </main>
  );
}
