import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { EngagementBar } from "@/components/EngagementBar";
import { SmartImage } from "@/components/SmartImage";
import { UserSessionNav } from "@/components/UserSessionNav";
import { getFeaturedPoll, getHomeData } from "@/lib/api";
import type { FeedItem, NewsSection, PollItem } from "@/lib/types";

export const dynamic = "force-dynamic";

type EngagementControls = {
  commentsEnabled: boolean;
  reactionsEnabled: boolean;
  analysisEnabled: boolean;
};

const SECTION_LABEL: Record<NewsSection, string> = {
  NACION: "Nacion",
  PROVINCIAS: "Buenos Aires",
  MUNICIPIOS: "Municipios",
  OPINION: "Opinion",
  ENTREVISTAS: "Entrevistas",
  PUBLINOTAS: "Patrocinado",
  RADAR_ELECTORAL: "Elecciones",
  ECONOMIA: "Economia",
  INTERNACIONALES: "Mundo",
  DISTRITOS: "Regionales",
};

const NAV_ITEMS: Array<{ label: string; section?: NewsSection }> = [
  { label: "Nacion", section: "NACION" },
  { label: "Buenos Aires", section: "PROVINCIAS" },
  { label: "Elecciones", section: "RADAR_ELECTORAL" },
  { label: "Economia", section: "ECONOMIA" },
  { label: "Opinion", section: "OPINION" },
  { label: "Mundo", section: "INTERNACIONALES" },
  { label: "Deportes" },
];

const LOGO_SRC = "/logo-home-20260401.png";

function sanitizeDisplayText(input: string): string {
  return input
    .replace(/\uFFFD/g, "")
    .replace(/Â/g, "")
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

function cleanTitle(item: Pick<FeedItem, "title" | "section">): string {
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

function excerptFor(item: FeedItem): string {
  if (item.excerpt && item.excerpt.trim().length > 0) {
    return sanitizeDisplayText(item.excerpt);
  }
  return "Cobertura en desarrollo desde la mesa de situacion de Pulso Pais.";
}

function authorFor(item: FeedItem): string | null {
  const candidate = (item as { authorName?: string | null }).authorName;
  if (candidate && candidate.trim().length > 0) {
    return sanitizeDisplayText(candidate);
  }
  return null;
}

function formatDate(dateIso: string): string {
  return new Date(dateIso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
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

function formatMoney(value: number | null, currency: string): string {
  if (value === null) {
    return "--";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatChange(changePct: number | null): string {
  if (changePct === null) {
    return "--";
  }
  const sign = changePct > 0 ? "+" : "";
  return `${sign}${changePct.toFixed(2)}%`;
}

function relativeMinutes(dateIso: string): string {
  const diff = Date.now() - new Date(dateIso).getTime();
  const minutes = Math.max(1, Math.floor(diff / (1000 * 60)));
  if (minutes < 60) {
    return `Hace ${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `Hace ${hours} h`;
  }
  return `Hace ${Math.floor(hours / 24)} d`;
}

function dedupe(items: FeedItem[]): FeedItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

function fillList(primary: FeedItem[], fallback: FeedItem[], max: number): FeedItem[] {
  return dedupe([...primary, ...fallback]).slice(0, max);
}

function findSports(items: FeedItem[]): FeedItem | null {
  return items.find((item) => /deporte|futbol|liga|seleccion|partido|torneo|ascenso/i.test(item.title)) ?? null;
}

type StoryLinkData = { href: string; external: boolean } | null;

function storyLink(item: Pick<FeedItem, "slug" | "sourceUrl" | "isExternal">): StoryLinkData {
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
  item: Pick<FeedItem, "slug" | "sourceUrl" | "isExternal">;
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

function UiIcon({ name }: { name: "menu" | "search" | "user" | "arrow-right" | "home" | "bookmark" | "money" }) {
  if (name === "menu") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    );
  }
  if (name === "search") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
    );
  }
  if (name === "user") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20a8 8 0 0 1 16 0" />
      </svg>
    );
  }
  if (name === "arrow-right") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12h14" />
        <path d="M13 5l7 7-7 7" />
      </svg>
    );
  }
  if (name === "bookmark") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 4h12v16l-6-4-6 4z" />
      </svg>
    );
  }
  if (name === "home") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 11l9-7 9 7" />
        <path d="M6 10v10h12V10" />
      </svg>
    );
  }
  if (name === "money") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v18" />
        <path d="M16 7c0-1.7-1.8-3-4-3s-4 1.3-4 3 1.8 3 4 3 4 1.3 4 3-1.8 3-4 3-4-1.3-4-3" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12h16" />
      <path d="M12 4v16" />
    </svg>
  );
}

function DesktopArticleCard({
  item,
  controls,
  compact = false,
}: {
  item: FeedItem;
  controls: EngagementControls;
  compact?: boolean;
}) {
  const title = cleanTitle(item);
  return (
    <article className={`cp-article-card ${compact ? "compact" : ""}`}>
      <StoryAnchor item={item} className="cp-article-media">
        <SmartImage
          src={item.imageUrl}
          alt={title}
          fill
          sizes="(max-width: 1100px) 100vw, 30vw"
          className="cp-image"
          fallbackClassName="cp-image-fallback"
        />
      </StoryAnchor>
      <div className="cp-article-body">
        <p className="cp-kicker">{sanitizeDisplayText(item.kicker ?? SECTION_LABEL[item.section])}</p>
        <h3>
          <StoryAnchor item={item} className="cp-story-link">
            {shortText(title, compact ? 86 : 104)}
          </StoryAnchor>
        </h3>
        <p>{shortText(excerptFor(item), compact ? 130 : 170)}</p>
        <div className="cp-meta-line">
          <span>{sanitizeDisplayText(item.sourceName ?? authorFor(item) ?? "Pulso Pais")}</span>
          <span>{formatDate(item.publishedAt)}</span>
        </div>
        <EngagementBar itemId={item.id} title={title} compact controls={controls} />
      </div>
    </article>
  );
}

function OpinionCard({ item, controls }: { item: FeedItem; controls: EngagementControls }) {
  const title = cleanTitle(item);
  return (
    <article className="cp-opinion-card">
      <div className="cp-opinion-top">
        <div className="cp-opinion-avatar" />
        <div>
          <span>{sanitizeDisplayText(authorFor(item) ?? "Redaccion Pulso Pais")}</span>
          <small>{sanitizeDisplayText(item.kicker ?? "Analisis politico")}</small>
        </div>
      </div>
      <h4>
        <StoryAnchor item={item} className="cp-story-link">
          {shortText(title, 94)}
        </StoryAnchor>
      </h4>
      <p>{shortText(excerptFor(item), 150)}</p>
      <EngagementBar itemId={item.id} title={title} compact controls={controls} />
    </article>
  );
}

function MobileStoryCard({ item, controls }: { item: FeedItem; controls: EngagementControls }) {
  const title = cleanTitle(item);
  return (
    <article className="cp-m-story">
      <StoryAnchor item={item} className="cp-m-story-media">
        <SmartImage src={item.imageUrl} alt={title} fill sizes="100vw" className="cp-image" fallbackClassName="cp-image-fallback" />
      </StoryAnchor>
      <div className="cp-m-story-body">
        <p>{sanitizeDisplayText(item.kicker ?? SECTION_LABEL[item.section])}</p>
        <h3>
          <StoryAnchor item={item} className="cp-story-link">
            {shortText(title, 88)}
          </StoryAnchor>
        </h3>
        <span>{relativeMinutes(item.publishedAt)}</span>
        <EngagementBar itemId={item.id} title={title} compact controls={controls} />
      </div>
    </article>
  );
}

function DesktopEdition({
  hero,
  topStories,
  opinionStories,
  buenosAiresStories,
  interviewStory,
  electionStory,
  sportsStory,
  provinces,
  poll,
  markets,
  weatherLabel,
  ticker,
  controls,
  backofficeUrl,
}: {
  hero: FeedItem | null;
  topStories: FeedItem[];
  opinionStories: FeedItem[];
  buenosAiresStories: FeedItem[];
  interviewStory: FeedItem | null;
  electionStory: FeedItem | null;
  sportsStory: FeedItem | null;
  provinces: Array<{ province: string; headline: string; section: string; sourceUrl: string | null }>;
  poll: PollItem | null;
  markets: Array<{ symbol: string; label: string; price: number | null; changePct: number | null; currency: string }>;
  weatherLabel: string;
  ticker: string;
  controls: EngagementControls;
  backofficeUrl: string;
}) {
  return (
    <main className="cp-home">
      <section className="cp-ticker-top">
        <div className="cp-shell cp-ticker-row">
          {markets.slice(0, 2).map((market) => (
            <p key={market.symbol}>
              <strong>{sanitizeDisplayText(market.label)}</strong> {formatMoney(market.price, market.currency)}
            </p>
          ))}
          <p>{sanitizeDisplayText(weatherLabel)}</p>
          <span className="cp-breaking-dot" aria-hidden="true" />
          <p>{shortText(stripCategoryPrefix(sanitizeDisplayText(ticker)), 84)}</p>
        </div>
      </section>

      <header className="cp-shell cp-header">
        <div className="cp-header-icons">
          <button type="button" aria-label="Menu">
            <UiIcon name="menu" />
          </button>
          <button type="button" aria-label="Buscar">
            <UiIcon name="search" />
          </button>
        </div>

        <div className="cp-brand">
          <Image src={LOGO_SRC} alt="Pulso Pais" width={230} height={74} priority className="cp-brand-logo" />
          <p>El diario de la situacion</p>
        </div>

        <div className="cp-header-actions">
          <span>{formatHeaderDate(hero?.publishedAt ?? new Date().toISOString())}</span>
          <button type="button">Newsletter</button>
          <button type="button" className="primary">
            Suscribirse
          </button>
          <a href={backofficeUrl} target="_blank" rel="noreferrer">
            Backoffice
          </a>
          <UserSessionNav />
        </div>
      </header>

      <nav className="cp-shell cp-nav">
        {NAV_ITEMS.map((item, index) => (
          <Link
            key={item.label}
            href={item.section ? `/noticias?section=${item.section}` : "/noticias"}
            className={index === 0 ? "active" : ""}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <section className="cp-shell cp-hero-grid">
        {hero ? (
          <article className="cp-hero-main">
            <StoryAnchor item={hero} className="cp-hero-image">
              <SmartImage
                src={hero.imageUrl}
                alt={cleanTitle(hero)}
                fill
                sizes="(max-width: 1200px) 100vw, 66vw"
                className="cp-image"
                fallbackClassName="cp-image-fallback"
              />
            </StoryAnchor>
            <div className="cp-hero-body">
              <p>{sanitizeDisplayText(hero.kicker ?? "Nacion")}</p>
              <h1>
                <StoryAnchor item={hero} className="cp-story-link">
                  {cleanTitle(hero)}
                </StoryAnchor>
              </h1>
              <h2>{excerptFor(hero)}</h2>
              <div className="cp-meta-line">
                <span>{sanitizeDisplayText(authorFor(hero) ?? hero.sourceName ?? "Redaccion Pulso Pais")}</span>
                <span>{formatDate(hero.publishedAt)}</span>
              </div>
              <EngagementBar itemId={hero.id} title={cleanTitle(hero)} controls={controls} />
            </div>
          </article>
        ) : null}

        <aside className="cp-hero-side">
          <div className="cp-most-read">
            <h3>Lo mas leido</h3>
            {topStories.map((story, index) => (
              <article key={story.id} className="cp-most-read-item">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h4>
                  <StoryAnchor item={story} className="cp-story-link">
                    {shortText(cleanTitle(story), 78)}
                  </StoryAnchor>
                </h4>
              </article>
            ))}
          </div>
          <div className="cp-ad-tile">
            <small>Espacio publicitario</small>
            <h4>Tu futuro comienza aqui.</h4>
            <p>Inverti en el mercado local con una plataforma lider para inversores argentinos.</p>
            <button type="button">Saber mas</button>
          </div>
        </aside>
      </section>

      {interviewStory ? (
        <section className="cp-shell cp-interview">
          <div className="cp-interview-copy">
            <p>La entrevista del dia</p>
            <h3>
              "La crisis actual no es solo economica, es de representacion politica profunda."
            </h3>
            <span>{sanitizeDisplayText(authorFor(interviewStory) ?? "Elena Martinez de Hoz")}</span>
            <StoryAnchor item={interviewStory} className="cp-read-btn">
              Leer entrevista completa
            </StoryAnchor>
          </div>
          <div className="cp-interview-image">
            <SmartImage
              src={interviewStory.imageUrl}
              alt={cleanTitle(interviewStory)}
              fill
              sizes="(max-width: 1200px) 50vw, 35vw"
              className="cp-image"
              fallbackClassName="cp-image-fallback"
            />
          </div>
        </section>
      ) : null}

      <section className="cp-shell cp-opinion">
        <div className="cp-section-head">
          <h3>Opinion & Analisis</h3>
          <Link href="/noticias?section=OPINION">Ver todas</Link>
        </div>
        <div className="cp-opinion-grid">
          {opinionStories.map((item) => (
            <OpinionCard key={item.id} item={item} controls={controls} />
          ))}
        </div>
      </section>

      <section className="cp-shell cp-feed-grid">
        <div className="cp-main-feed">
          <div className="cp-section-head">
            <h3>Buenos Aires</h3>
            <Link href="/noticias?section=PROVINCIAS">Ver mas</Link>
          </div>

          <div className="cp-two-col">
            {buenosAiresStories.map((item) => (
              <DesktopArticleCard key={item.id} item={item} controls={controls} compact />
            ))}
          </div>

          <article className="cp-sponsored">
            <small>Patrocinado</small>
            <h4>Descubri una nueva forma de invertir en real estate desde $10.000</h4>
            <p>Propuesta comercial integrada en portada sin romper la lectura editorial.</p>
            <button type="button">Ver oportunidades</button>
          </article>

          {electionStory ? (
            <article className="cp-election-feature">
              <div className="cp-election-media">
                <SmartImage
                  src={electionStory.imageUrl}
                  alt={cleanTitle(electionStory)}
                  fill
                  sizes="(max-width: 1200px) 100vw, 24vw"
                  className="cp-image"
                  fallbackClassName="cp-image-fallback"
                />
              </div>
              <div className="cp-election-copy">
                <p>Elecciones</p>
                <h4>
                  <StoryAnchor item={electionStory} className="cp-story-link">
                    {shortText(cleanTitle(electionStory), 88)}
                  </StoryAnchor>
                </h4>
                <span>{formatDate(electionStory.publishedAt)}</span>
              </div>
            </article>
          ) : null}
        </div>

        <aside className="cp-side-feed">
          <div className="cp-market-panel">
            <h4>Mercado & Finanzas</h4>
            {markets.slice(0, 4).map((market) => (
              <div key={market.symbol} className="cp-market-row">
                <span>{sanitizeDisplayText(market.label)}</span>
                <div>
                  <strong>{formatMoney(market.price, market.currency)}</strong>
                  <small>{formatChange(market.changePct)}</small>
                </div>
              </div>
            ))}
          </div>

          <div className="cp-newsletter">
            <p>Recibi las noticias que importan en tu correo.</p>
            <input type="email" placeholder="Tu email" />
            <button type="button">Suscribirme gratis</button>
          </div>

          {sportsStory ? <DesktopArticleCard item={sportsStory} controls={controls} compact /> : null}

          {poll ? (
            <article className="cp-poll-box">
              <small>Encuesta en vivo</small>
              <h4>{shortText(sanitizeDisplayText(poll.question), 74)}</h4>
              <span>{poll.metrics.totalVotes} votos acumulados</span>
              <a href={`/encuestas/${poll.slug}`} target="_blank" rel="noreferrer">
                Abrir encuesta
              </a>
            </article>
          ) : null}
        </aside>
      </section>

      <section className="cp-shell cp-province-strip">
        <div className="cp-section-head">
          <h3>Provincia por Provincia</h3>
          <Link href="/noticias?section=DISTRITOS">Explorar</Link>
        </div>
        <div className="cp-province-grid">
          {provinces.map((entry) => (
            <article key={entry.province}>
              <span>{sanitizeDisplayText(entry.province)}</span>
              <h4>{shortText(stripCategoryPrefix(sanitizeDisplayText(entry.headline)), 74)}</h4>
            </article>
          ))}
        </div>
      </section>

      <footer className="cp-footer">
        <div className="cp-shell cp-footer-inner">
          <div>
            <h3>Pulso Pais</h3>
            <p>Informacion rigurosa para tiempos complejos. Independencia editorial y cobertura federal real.</p>
          </div>
          <div>
            <h4>Editorial</h4>
            <a href="#">Staff</a>
            <a href="#">Codigo de etica</a>
            <a href="#">Archivo</a>
          </div>
          <div>
            <h4>Soporte</h4>
            <a href="#">Contacto</a>
            <a href="#">Anunciantes</a>
            <a href="#">Ayuda</a>
          </div>
          <div>
            <h4>Legal</h4>
            <a href="#">Terminos</a>
            <a href="#">Privacidad</a>
            <a href="#">Cookies</a>
          </div>
        </div>
        <div className="cp-shell cp-footer-bottom">
          <p>© 2026 Pulso Pais Argentina. Todos los derechos reservados.</p>
          <p>Disenado para la situation room.</p>
        </div>
      </footer>
    </main>
  );
}

function MobileEdition({
  hero,
  stream,
  provinces,
  interviewStory,
  opinionStories,
  sportsStory,
  poll,
  markets,
  weatherLabel,
  controls,
}: {
  hero: FeedItem | null;
  stream: FeedItem[];
  provinces: Array<{ province: string; headline: string; section: string; sourceUrl: string | null }>;
  interviewStory: FeedItem | null;
  opinionStories: FeedItem[];
  sportsStory: FeedItem | null;
  poll: PollItem | null;
  markets: Array<{ symbol: string; label: string; price: number | null; changePct: number | null; currency: string }>;
  weatherLabel: string;
  controls: EngagementControls;
}) {
  const firstMarket = markets[0];

  return (
    <main className="cp-mobile">
      <header className="cp-m-header">
        <div className="cp-m-top">
          <button type="button" aria-label="Menu">
            <UiIcon name="menu" />
          </button>
          <Image src={LOGO_SRC} alt="Pulso Pais" width={126} height={42} className="cp-m-logo" priority />
          <div>
            <button type="button" aria-label="Buscar">
              <UiIcon name="search" />
            </button>
            <button type="button" aria-label="Cuenta">
              <UiIcon name="user" />
            </button>
          </div>
        </div>
        <nav className="cp-m-nav">
          {NAV_ITEMS.slice(0, 5).map((item) => (
            <Link key={item.label} href={item.section ? `/noticias?section=${item.section}` : "/noticias"}>
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <section className="cp-m-urgent">
        <span>Urgente</span>
        <p>{hero ? shortText(cleanTitle(hero), 66) : "Cobertura federal en vivo."}</p>
      </section>

      <section className="cp-m-chip-row">
        {firstMarket ? (
          <article>
            <small>{sanitizeDisplayText(firstMarket.label)}</small>
            <strong>{formatMoney(firstMarket.price, firstMarket.currency)}</strong>
          </article>
        ) : null}
        <article>
          <small>Clima CABA</small>
          <strong>{sanitizeDisplayText(weatherLabel)}</strong>
        </article>
      </section>

      <section className="cp-m-feed">
        {hero ? <MobileStoryCard item={hero} controls={controls} /> : null}
        {stream.slice(0, 2).map((item) => (
          <MobileStoryCard key={item.id} item={item} controls={controls} />
        ))}
      </section>

      <section className="cp-m-ad">
        <small>Publicidad</small>
        <h3>Inverti en el futuro con Banco Nacion</h3>
        <button type="button">Conocer mas</button>
      </section>

      {sportsStory ? (
        <section className="cp-m-sports">
          <StoryAnchor item={sportsStory} className="cp-m-sports-media">
            <SmartImage
              src={sportsStory.imageUrl}
              alt={cleanTitle(sportsStory)}
              fill
              sizes="100vw"
              className="cp-image"
              fallbackClassName="cp-image-fallback"
            />
          </StoryAnchor>
          <h3>
            <StoryAnchor item={sportsStory} className="cp-story-link">
              {shortText(cleanTitle(sportsStory), 80)}
            </StoryAnchor>
          </h3>
        </section>
      ) : null}

      <section className="cp-m-provinces">
        <div className="cp-section-head">
          <h3>Provincia por Provincia</h3>
          <span>
            <UiIcon name="arrow-right" />
          </span>
        </div>
        <div className="cp-m-province-row">
          {provinces.map((entry) => (
            <article key={entry.province}>
              <small>{sanitizeDisplayText(entry.province)}</small>
              <p>{shortText(stripCategoryPrefix(sanitizeDisplayText(entry.headline)), 54)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="cp-m-dark-zone">
        {interviewStory ? (
          <article className="cp-m-interview">
            <small>Exclusivo</small>
            <h3>Entrevistas</h3>
            <div className="cp-m-interview-card">
              <StoryAnchor item={interviewStory} className="cp-m-interview-media">
                <SmartImage
                  src={interviewStory.imageUrl}
                  alt={cleanTitle(interviewStory)}
                  fill
                  sizes="100vw"
                  className="cp-image"
                  fallbackClassName="cp-image-fallback"
                />
              </StoryAnchor>
              <h4>
                <StoryAnchor item={interviewStory} className="cp-story-link">
                  {shortText(cleanTitle(interviewStory), 78)}
                </StoryAnchor>
              </h4>
            </div>
          </article>
        ) : null}

        <article className="cp-m-opinion">
          <h3>Opinion</h3>
          {opinionStories.slice(0, 2).map((item) => (
            <div key={item.id} className="cp-m-opinion-item">
              <div className="cp-opinion-avatar" />
              <div>
                <small>{sanitizeDisplayText(authorFor(item) ?? "Redaccion")}</small>
                <h4>
                  <StoryAnchor item={item} className="cp-story-link">
                    {shortText(cleanTitle(item), 64)}
                  </StoryAnchor>
                </h4>
              </div>
            </div>
          ))}
        </article>

        {poll ? (
          <article className="cp-m-poll">
            <small>Encuesta en vivo</small>
            <h4>{shortText(sanitizeDisplayText(poll.question), 70)}</h4>
            <a href={`/encuestas/${poll.slug}`} target="_blank" rel="noreferrer">
              Votar ahora
            </a>
          </article>
        ) : null}
      </section>

      <footer className="cp-m-footer">
        <h3>Pulso Pais</h3>
        <div>
          <a href="#">Editorial</a>
          <a href="#">Staff</a>
          <a href="#">Anunciantes</a>
          <a href="#">Contacto</a>
          <a href="#">Terminos</a>
          <a href="#">Privacidad</a>
        </div>
        <p>© 2026 Pulso Pais Argentina.</p>
      </footer>

      <nav className="cp-m-bottom-nav">
        <Link href="/">
          <UiIcon name="home" />
          Inicio
        </Link>
        <Link href="/noticias">
          <UiIcon name="menu" />
          Secciones
        </Link>
        <Link href="/noticias?section=ECONOMIA">
          <UiIcon name="money" />
          Dolar
        </Link>
        <Link href="/cuenta">
          <UiIcon name="bookmark" />
          Guardados
        </Link>
        <Link href="/cuenta">
          <UiIcon name="user" />
          Perfil
        </Link>
      </nav>
    </main>
  );
}

export default async function Home() {
  const [home, featuredPoll] = await Promise.all([getHomeData(), getFeaturedPoll()]);

  const backofficeUrl =
    process.env.NEXT_PUBLIC_BACKOFFICE_URL ??
    (process.env.NODE_ENV === "production"
      ? "https://pulso-backend-kgtc.onrender.com/backoffice"
      : "http://localhost:8080/backoffice");

  const allItems = dedupe([
    ...(home.hero ? [home.hero] : []),
    ...home.secondary,
    ...home.latest,
    ...home.radarElectoral,
    ...home.opinion,
    ...home.interviews,
    ...home.sponsored,
    ...home.externalPulse,
  ]);

  const hero = home.hero ?? allItems[0] ?? null;
  const rest = allItems.filter((item) => item.id !== hero?.id);

  const mostRead = fillList(dedupe([...home.latest, ...home.externalPulse]), rest, 3);
  const opinionStories = fillList(dedupe([...home.opinion, ...rest.filter((item) => item.section === "OPINION")]), rest, 3);
  const buenosAiresStories = fillList(rest.filter((item) => item.province === "BUENOS_AIRES" || item.province === "CABA"), rest, 2);
  const interviewStory = home.interviews[0] ?? rest.find((item) => item.section === "ENTREVISTAS") ?? rest[0] ?? null;
  const electionStory = home.radarElectoral[0] ?? rest.find((item) => item.section === "RADAR_ELECTORAL") ?? rest[1] ?? null;
  const sportsStory = findSports(rest);

  const controls: EngagementControls = {
    commentsEnabled: home.engagement.commentsEnabled,
    reactionsEnabled: home.engagement.reactionsEnabled,
    analysisEnabled: home.engagement.analysisEnabled,
  };

  const ticker = sanitizeDisplayText(home.ticker[0] ?? (hero ? cleanTitle(hero) : "Pulso Pais en vivo."));
  const weatherLabel = `${sanitizeDisplayText(home.social.weather.location)} ${home.social.weather.temperatureC ?? "--"}C`;
  const mobileStream = fillList(dedupe([...home.latest, ...home.radarElectoral, ...home.externalPulse]), rest, 5);

  return (
    <>
      <div className="cp-desktop-only">
        <DesktopEdition
          hero={hero}
          topStories={mostRead}
          opinionStories={opinionStories}
          buenosAiresStories={buenosAiresStories}
          interviewStory={interviewStory}
          electionStory={electionStory}
          sportsStory={sportsStory}
          provinces={home.federalHighlights.slice(0, 8)}
          poll={featuredPoll}
          markets={home.social.markets}
          weatherLabel={weatherLabel}
          ticker={ticker}
          controls={controls}
          backofficeUrl={backofficeUrl}
        />
      </div>
      <div className="cp-mobile-only">
        <MobileEdition
          hero={hero}
          stream={mobileStream}
          provinces={home.federalHighlights.slice(0, 6)}
          interviewStory={interviewStory}
          opinionStories={opinionStories}
          sportsStory={sportsStory}
          poll={featuredPoll}
          markets={home.social.markets}
          weatherLabel={weatherLabel}
          controls={controls}
        />
      </div>
    </>
  );
}
