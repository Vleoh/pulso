import Image from "next/image";
import { EngagementBar } from "@/components/EngagementBar";
import { getFeaturedPoll, getHomeData } from "@/lib/api";
import type { FeedItem, NewsSection, PollItem } from "@/lib/types";

export const dynamic = "force-dynamic";

type IconName =
  | "pulse"
  | "radar"
  | "nation"
  | "province"
  | "economy"
  | "opinion"
  | "interview"
  | "global"
  | "weather"
  | "market"
  | "map"
  | "trend";

const SECTION_LABEL: Record<NewsSection, string> = {
  NACION: "Nacion",
  PROVINCIAS: "Provincias",
  MUNICIPIOS: "Municipios",
  OPINION: "Opinion",
  ENTREVISTAS: "Entrevistas",
  PUBLINOTAS: "Publinotas",
  RADAR_ELECTORAL: "Radar",
  ECONOMIA: "Economia",
  INTERNACIONALES: "Internacionales",
  DISTRITOS: "Distritos",
};

function UiIcon({ name, className = "" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, string> = {
    pulse: "M2 8h3l1.4-3.5 2.2 7 2-4h5.4",
    radar: "M8 2v2M8 12v2M2 8h2M12 8h2M4 4l1.4 1.4M10.6 10.6L12 12M12 4l-1.4 1.4M4 12l1.4-1.4",
    nation: "M2.5 4.5h11v7h-11zM4.2 6.3h7.6M4.2 8h7.6M4.2 9.7h7.6",
    province: "M2.3 8 5.5 2.6 10.5 3l3.2 5-3 5.4-5.3.2z",
    economy: "M2 12V4m4 8V2m4 10V6m4 6V8",
    opinion: "M2.6 8.8c2.1-1.2 2.8-3.6 3-5.3.3 1.2 1.3 3.2 3.5 3.9 1.8.6 3.2 1.6 3.2 3.3 0 1.7-1.4 2.8-3.1 2.8-1.9 0-3-.8-4.1-.8-1 0-2 .8-3.8.8-1.8 0-3.1-1.1-3.1-2.8 0-1 .4-1.5 1.4-1.9z",
    interview: "M2.5 4.2h6v5.6h-6zM8.5 6.1l4-2.2v6.2l-4-2.2",
    global: "M8 2c3.3 0 6 2.7 6 6s-2.7 6-6 6-6-2.7-6-6 2.7-6 6-6zm0 0c1.8 1.6 2.8 3.6 2.8 6S9.8 12.4 8 14c-1.8-1.6-2.8-3.6-2.8-6S6.2 3.6 8 2zM2.5 8h11",
    weather: "M4 10h7a2.5 2.5 0 0 0 .2-5 3.3 3.3 0 0 0-6.2 1.3A2 2 0 0 0 4 10z",
    market: "M2 12V4m4 8V2m4 10V6m4 6V8",
    map: "M2 3l3-1 3 1 3-1 1 1v9l-3 1-3-1-3 1-1-1z",
    trend: "M2 11l3-3 2 2 5-5",
  };

  return (
    <svg viewBox="0 0 16 16" className={`ui-icon ${className}`} aria-hidden="true">
      <path d={paths[name]} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
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
  const matcher = `(?:${Array.from(new Set(labels)).map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`;
  const normalized = input
    .replace(new RegExp(`^\\s*${matcher}\\s*[:\\-|]\\s*`, "i"), "")
    .replace(new RegExp(`^\\s*\\[?${matcher}\\]?\\s+`, "i"), "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || input;
}

function titleForDisplay(item: Pick<FeedItem, "title" | "section">): string {
  return stripCategoryPrefix(item.title, item.section);
}

function shortTitle(title: string, max = 120): string {
  const normalized = title.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max - 1).trimEnd()}…`;
}

function formatHeaderDate(dateIso: string): string {
  const date = new Date(dateIso);
  const weekday = date.toLocaleDateString("es-AR", { weekday: "short" }).replace(".", "");
  const day = date.toLocaleDateString("es-AR", { day: "2-digit" });
  const month = date.toLocaleDateString("es-AR", { month: "short" }).replace(".", "");
  return `${weekday} ${day} ${month}`.toUpperCase();
}

function formatDate(dateIso: string): string {
  return new Date(dateIso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} h`;
  }
  return `${Math.floor(hours / 24)} d`;
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

function isRecent(dateIso: string, maxDays = 10): boolean {
  const timestamp = new Date(dateIso).getTime();
  if (Number.isNaN(timestamp)) {
    return false;
  }
  return Date.now() - timestamp <= maxDays * 24 * 60 * 60 * 1000;
}

function sectionClass(section: NewsSection): string {
  switch (section) {
    case "RADAR_ELECTORAL":
      return "tone-radar";
    case "ECONOMIA":
      return "tone-economy";
    case "PROVINCIAS":
    case "DISTRITOS":
    case "MUNICIPIOS":
      return "tone-federal";
    case "OPINION":
      return "tone-opinion";
    case "ENTREVISTAS":
      return "tone-interview";
    case "INTERNACIONALES":
      return "tone-global";
    default:
      return "tone-main";
  }
}

function iconBySection(section: NewsSection): IconName {
  switch (section) {
    case "RADAR_ELECTORAL":
      return "radar";
    case "ECONOMIA":
      return "economy";
    case "OPINION":
      return "opinion";
    case "ENTREVISTAS":
      return "interview";
    case "INTERNACIONALES":
      return "global";
    case "PROVINCIAS":
    case "MUNICIPIOS":
    case "DISTRITOS":
      return "province";
    default:
      return "nation";
  }
}

function FeedCard({ item }: { item: FeedItem }) {
  const headline = shortTitle(titleForDisplay(item), 110);
  return (
    <article className="mf-feed-card">
      <div className="mf-feed-media">
        {item.imageUrl ? (
          <Image src={item.imageUrl} alt={headline} fill sizes="(max-width: 700px) 36vw, 180px" className="mf-feed-image" />
        ) : (
          <div className="mf-feed-placeholder" />
        )}
      </div>
      <div className="mf-feed-body">
        <p className={`mf-badge ${sectionClass(item.section)}`}>
          <UiIcon name={iconBySection(item.section)} />
          {SECTION_LABEL[item.section]}
        </p>
        <h3>{headline}</h3>
        {item.excerpt && <p className="mf-excerpt">{item.excerpt}</p>}
        <div className="mf-meta">
          <span>{item.sourceName ?? "Pulso Pais"}</span>
          <span>{relativeMinutes(item.publishedAt)}</span>
        </div>
        <EngagementBar itemId={item.id} title={headline} compact />
      </div>
    </article>
  );
}

function countSections(items: FeedItem[]): NewsSection[] {
  const map = new Map<NewsSection, number>();
  items.forEach((item) => {
    map.set(item.section, (map.get(item.section) ?? 0) + 1);
  });
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([section]) => section)
    .slice(0, 5);
}

function DesktopNewsCard({ item, compact = false }: { item: FeedItem; compact?: boolean }) {
  const headline = titleForDisplay(item);
  return (
    <article className={`news-card ${compact ? "compact" : ""}`} data-section={item.section}>
      <div className="news-image-wrap">
        {item.imageUrl ? (
          <Image src={item.imageUrl} alt={headline} fill sizes="(max-width: 700px) 100vw, 33vw" className="news-image" />
        ) : (
          <div className="news-image-placeholder" />
        )}
      </div>
      <div className="news-content">
        <p className="news-kicker">
          <UiIcon name={iconBySection(item.section)} className="kicker-icon" />
          {SECTION_LABEL[item.section]}
        </p>
        <h3>{headline}</h3>
        {item.excerpt && <p className="news-excerpt">{item.excerpt}</p>}
        <div className="news-meta">
          <span>{item.sourceName ?? "Pulso Pais"}</span>
          <span>{formatDate(item.publishedAt)}</span>
        </div>
        <EngagementBar itemId={item.id} title={headline} compact={compact} />
      </div>
    </article>
  );
}

function DesktopHome({
  hero,
  heroTitle,
  stream,
  radar,
  featuredPoll,
  theme,
  tickerItems,
  backofficeUrl,
  weatherLabel,
  markets,
  federal,
}: {
  hero: FeedItem | null;
  heroTitle: string;
  stream: FeedItem[];
  radar: FeedItem[];
  featuredPoll: PollItem | null;
  theme: "premium" | "classic" | "social" | "editorial";
  tickerItems: string[];
  backofficeUrl: string;
  weatherLabel: string;
  markets: Array<{ symbol: string; label: string; price: number | null; changePct: number | null; currency: string; trend: "up" | "down" | "flat" }>;
  federal: Array<{ province: string; headline: string; section: string }>;
}) {
  const sideCards = stream.slice(0, 3);
  const quickRead = stream.slice(3, 9);
  const themeClass = theme === "premium" ? "" : `theme-${theme}`;

  return (
    <main className={`home ${themeClass}`.trim()}>
      <section className="ticker">
        <div className="ticker-label">Urgente</div>
        <div className="ticker-track">
          {[...tickerItems, ...tickerItems].map((item, index) => (
            <p key={`${item}-${index}`}>{stripCategoryPrefix(item)}</p>
          ))}
        </div>
      </section>

      <header className="top-header container">
        <div className="brand">
          <Image src="/logo.png" alt="Pulso Pais" width={240} height={62} priority className="brand-logo" />
          <span>Politica, poder y territorio</span>
        </div>
        <div className="header-center">
          <p className="header-center-tag">Mesa de situacion</p>
          <h2>Radar nacional en vivo</h2>
          <p>{tickerItems[0] ? stripCategoryPrefix(tickerItems[0]) : "Actualizacion permanente de agenda politica."}</p>
        </div>
        <div className="header-right">
          <p>{formatHeaderDate(hero?.publishedAt ?? new Date().toISOString())}</p>
          <a href="/ingresar">Ingresar</a>
          <a href={backofficeUrl} target="_blank" rel="noreferrer">
            Backoffice
          </a>
        </div>
      </header>

      <nav className="main-nav">
        <div className="container nav-scroll">
          <button type="button">
            <UiIcon name="nation" className="nav-icon" />
            Nacion
          </button>
          <button type="button">
            <UiIcon name="province" className="nav-icon" />
            Provincias
          </button>
          <button type="button">
            <UiIcon name="radar" className="nav-icon" />
            Radar Electoral
          </button>
          <button type="button">
            <UiIcon name="opinion" className="nav-icon" />
            Opinion
          </button>
          <button type="button">
            <UiIcon name="economy" className="nav-icon" />
            Economia
          </button>
          {featuredPoll ? (
            <a href={`/encuestas/${featuredPoll.slug}`} className="nav-poll-link" target="_blank" rel="noopener noreferrer">
              <UiIcon name="trend" className="nav-icon" />
              Encuestas
            </a>
          ) : null}
        </div>
      </nav>

      <section className="container hero-grid">
        {hero && (
          <article className="hero-main" data-section={hero.section}>
            <div className="hero-image-wrap">
              {hero.imageUrl ? <Image src={hero.imageUrl} alt={heroTitle} fill priority className="hero-image" /> : <div className="hero-image-placeholder" />}
            </div>
            <div className="hero-content">
              <p className="hero-kicker">
                <UiIcon name={iconBySection(hero.section)} className="kicker-icon" />
                {hero.kicker ?? SECTION_LABEL[hero.section]}
              </p>
              <h1>{heroTitle}</h1>
              {hero.excerpt && <p>{hero.excerpt}</p>}
              <div className="hero-meta">
                <span>{hero.sourceName ?? "Pulso Pais"}</span>
                <span>{formatDate(hero.publishedAt)}</span>
              </div>
              <EngagementBar itemId={hero.id} title={heroTitle} />
            </div>
          </article>
        )}
        <div className="hero-side">
          {sideCards.map((item) => (
            <DesktopNewsCard key={item.id} item={item} compact />
          ))}
        </div>
      </section>

      <section className="container signal-band">
        <article className="weather-gadget">
          <p>
            <UiIcon name="weather" className="inline-icon" />
            Clima
          </p>
          <h3>{weatherLabel}</h3>
        </article>
        <article className="market-gadget">
          <p>
            <UiIcon name="market" className="inline-icon" />
            Mercados
          </p>
          <div className="market-grid">
            {markets.slice(0, 4).map((market) => (
              <div key={market.symbol} className={`market-item ${market.trend}`}>
                <strong>{market.label}</strong>
                <span>{formatMoney(market.price, market.currency)}</span>
                <em>{formatChange(market.changePct)}</em>
              </div>
            ))}
          </div>
        </article>
      </section>

      {featuredPoll ? (
        <section className="container">
          <article className="home-poll-cta">
            <p>Encuesta en vivo</p>
            <h3>{featuredPoll.question}</h3>
            <span>{featuredPoll.metrics.totalVotes} votos acumulados</span>
            <a href={`/encuestas/${featuredPoll.slug}`} target="_blank" rel="noopener noreferrer">
              Abrir encuesta
            </a>
          </article>
        </section>
      ) : null}

      <section className="container split-grid">
        <article className="radar">
          <div className="section-head">
            <h2>
              <UiIcon name="radar" className="head-icon" />
              Radar Electoral
            </h2>
          </div>
          <div className="list-grid">
            {radar.map((item) => (
              <DesktopNewsCard key={item.id} item={item} compact />
            ))}
          </div>
        </article>
        <article className="federal">
          <div className="section-head">
            <h2>
              <UiIcon name="map" className="head-icon" />
              Pulso Federal
            </h2>
          </div>
          <div className="federal-grid">
            {federal.slice(0, 12).map((item) => (
              <article key={item.province} className="federal-item">
                <p>{item.province}</p>
                <h4>{shortTitle(stripCategoryPrefix(item.headline), 75)}</h4>
                <span>{item.section}</span>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="container social-consume-grid">
        <article className="social-feed">
          <div className="section-head">
            <h2>
              <UiIcon name="trend" className="head-icon" />
              Flujo de Lectura
            </h2>
          </div>
          <div className="social-feed-list">
            {quickRead.map((item) => (
              <DesktopNewsCard key={item.id} item={item} compact />
            ))}
          </div>
        </article>
      </section>
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

  const internalItems = dedupe([
    ...(home.hero ? [home.hero] : []),
    ...home.latest,
    ...home.secondary,
    ...home.radarElectoral,
    ...home.interviews,
    ...home.opinion,
  ]);
  const externalRecent = home.externalPulse.filter((item) => isRecent(item.publishedAt, 7)).slice(0, 8);
  const sourceItems = dedupe([...internalItems, ...externalRecent]);

  const hero = home.hero ?? sourceItems[0] ?? null;
  const stream = sourceItems.filter((item) => item.id !== hero?.id).slice(0, 18);
  const radar = dedupe([...home.radarElectoral, ...stream.filter((item) => item.section === "RADAR_ELECTORAL")]).slice(0, 6);
  const quickList = dedupe([...home.latest, ...home.opinion, ...externalRecent]).slice(0, 7);
  const visibleSections = countSections(sourceItems);
  const tickerItems = home.ticker.length > 0 ? home.ticker.slice(0, 6) : internalItems.slice(0, 6).map((item) => item.title);
  const heroTitle = hero ? titleForDisplay(hero) : "Pulso Pais en actualizacion permanente";

  return (
    <>
      <div className="pp-mobile-only">
        <main className="mf-home">
          <section className="mf-ticker">
            <div className="mf-shell mf-ticker-inner">
              <span className="mf-ticker-label">
                <UiIcon name="pulse" />
                En Vivo
              </span>
              <div className="mf-ticker-track">
                {tickerItems.map((item, index) => (
                  <p key={`${item}-${index}`}>{stripCategoryPrefix(item)}</p>
                ))}
              </div>
            </div>
          </section>

          <header className="mf-shell mf-header">
            <a href="/" className="mf-brand" aria-label="Pulso Pais Inicio">
              <Image src="/logo.png" alt="Pulso Pais" width={160} height={52} priority className="mf-logo" />
              <span>Politica, poder y territorio</span>
            </a>
            <div className="mf-header-meta">
              <p>{formatHeaderDate(home.generatedAt)}</p>
              <a href="/ingresar">Ingresar</a>
              <a href={backofficeUrl} target="_blank" rel="noreferrer">
                Backoffice
              </a>
            </div>
          </header>

          <section className="mf-shell mf-topics" aria-label="Secciones principales">
            {visibleSections.map((section) => (
              <span key={section} className={`mf-topic ${sectionClass(section)}`}>
                <UiIcon name={iconBySection(section)} />
                {SECTION_LABEL[section]}
              </span>
            ))}
          </section>

          <div className="mf-shell mf-layout">
            <section className="mf-main">
              <article className="mf-hero-card">
                <div className="mf-hero-media">
                  {hero?.imageUrl ? (
                    <Image src={hero.imageUrl} alt={heroTitle} fill priority sizes="(max-width: 900px) 100vw, 62vw" className="mf-feed-image" />
                  ) : (
                    <div className="mf-feed-placeholder" />
                  )}
                </div>
                <div className="mf-hero-body">
                  <p className={`mf-badge ${hero ? sectionClass(hero.section) : "tone-main"}`}>
                    <UiIcon name={hero ? iconBySection(hero.section) : "nation"} />
                    {hero ? SECTION_LABEL[hero.section] : "Nacion"}
                  </p>
                  <h1>{heroTitle}</h1>
                  {hero?.excerpt && <p className="mf-hero-excerpt">{hero.excerpt}</p>}
                  <div className="mf-meta">
                    <span>{hero?.sourceName ?? "Pulso Pais"}</span>
                    <span>{hero ? formatDate(hero.publishedAt) : formatDate(home.generatedAt)}</span>
                  </div>
                  {hero && <EngagementBar itemId={hero.id} title={heroTitle} />}
                </div>
              </article>

              <section className="mf-block">
                <div className="mf-block-head">
                  <h2>Ultimas Noticias</h2>
                  <span>{stream.length} notas</span>
                </div>
                <div className="mf-card-list">
                  {stream.map((item) => (
                    <FeedCard key={item.id} item={item} />
                  ))}
                </div>
              </section>

              {featuredPoll ? (
                <section className="mf-block">
                  <div className="mf-block-head">
                    <h2>Encuesta en Vivo</h2>
                    <span>{featuredPoll.metrics.totalVotes} votos</span>
                  </div>
                  <article className="mf-poll-card">
                    <p>{featuredPoll.hookLabel || "Encuesta Nacional"}</p>
                    <h3>{featuredPoll.question}</h3>
                    <a href={`/encuestas/${featuredPoll.slug}`} target="_blank" rel="noopener noreferrer">
                      Votar ahora
                    </a>
                  </article>
                </section>
              ) : null}

              {radar.length > 0 && (
                <section className="mf-block">
                  <div className="mf-block-head">
                    <h2>Radar Electoral</h2>
                    <span>seguimiento</span>
                  </div>
                  <div className="mf-mini-list">
                    {radar.map((item) => (
                      <article key={item.id} className="mf-mini-item">
                        <p className={`mf-badge ${sectionClass(item.section)}`}>
                          <UiIcon name="radar" />
                          Radar
                        </p>
                        <h3>{shortTitle(titleForDisplay(item), 105)}</h3>
                        <div className="mf-meta">
                          <span>{item.sourceName ?? "Pulso Pais"}</span>
                          <span>{relativeMinutes(item.publishedAt)}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )}
            </section>

            <aside className="mf-aside">
              <section className="mf-side-card">
                <h3>Agenda Rapida</h3>
                <ol>
                  {quickList.map((item) => (
                    <li key={item.id}>{shortTitle(titleForDisplay(item), 95)}</li>
                  ))}
                </ol>
              </section>

              <section className="mf-side-card">
                <h3>Pulso Federal</h3>
                <div className="mf-federal-grid">
                  {home.federalHighlights.slice(0, 8).map((item) => (
                    <article key={item.province}>
                      <strong>{item.province}</strong>
                      <p>{shortTitle(stripCategoryPrefix(item.headline), 90)}</p>
                    </article>
                  ))}
                </div>
              </section>
            </aside>
          </div>
        </main>
      </div>

      <div className="pp-desktop-only">
        <DesktopHome
          hero={hero}
          heroTitle={heroTitle}
          stream={stream}
          radar={radar}
          featuredPoll={featuredPoll}
          theme={home.theme}
          tickerItems={tickerItems}
          backofficeUrl={backofficeUrl}
          weatherLabel={`${home.social.weather.location} · ${home.social.weather.temperatureC ?? "--"} C`}
          markets={home.social.markets}
          federal={home.federalHighlights}
        />
      </div>
    </>
  );
}
