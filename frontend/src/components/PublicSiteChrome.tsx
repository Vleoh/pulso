import Link from "next/link";
import { UserSessionNav } from "@/components/UserSessionNav";
import type { NewsSection } from "@/lib/types";

const NAV_ITEMS: Array<{ label: string; section?: NewsSection }> = [
  { label: "Nacion", section: "NACION" },
  { label: "Buenos Aires", section: "PROVINCIAS" },
  { label: "Elecciones", section: "RADAR_ELECTORAL" },
  { label: "Economia", section: "ECONOMIA" },
  { label: "Opinion", section: "OPINION" },
  { label: "Mundo", section: "INTERNACIONALES" },
  { label: "Deportes" },
];

const LOGO_SRC = "/logo.png?v=20260403";
const APP_TIMEZONE = "America/Argentina/Buenos_Aires";

function sanitizeDisplayText(input: string): string {
  return input
    .replace(/\uFFFD/g, "")
    .replace(/Ã‚/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatHeaderDate(dateIso: string): string {
  const date = new Date(dateIso);
  const weekday = date.toLocaleDateString("es-AR", { weekday: "short", timeZone: APP_TIMEZONE }).replace(".", "");
  const day = date.toLocaleDateString("es-AR", { day: "2-digit", timeZone: APP_TIMEZONE });
  const month = date.toLocaleDateString("es-AR", { month: "short", timeZone: APP_TIMEZONE }).replace(".", "");
  return `${weekday} ${day} ${month}`.toUpperCase();
}

function UiIcon({ name }: { name: "menu" | "search" }) {
  if (name === "menu") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

export function PublicSiteChrome({
  activeSection,
  ticker,
  weatherLabel,
  markets,
  dateIso,
  backofficeUrl,
}: {
  activeSection?: NewsSection | null;
  ticker: string;
  weatherLabel: string;
  markets: Array<{ label: string; price: number | null; currency: string }>;
  dateIso: string;
  backofficeUrl: string;
}) {
  const primaryMarkets = markets.slice(0, 2);

  return (
    <>
      <section className="cp-ticker-top">
        <div className="cp-shell cp-ticker-row">
          {primaryMarkets.map((market) => (
            <p key={market.label}>
              <strong>{sanitizeDisplayText(market.label)}</strong>
              {market.price === null ? "--" : new Intl.NumberFormat("en-US", { style: "currency", currency: market.currency || "USD", maximumFractionDigits: 2 }).format(market.price)}
            </p>
          ))}
          <span className="cp-breaking-dot" aria-hidden="true" />
          <p>{sanitizeDisplayText(weatherLabel)}</p>
          <span className="cp-breaking-dot" aria-hidden="true" />
          <p>{sanitizeDisplayText(ticker)}</p>
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
          <Link href="/" className="news-brand-link" aria-label="Volver al home de Pulso Pais">
            <img src={LOGO_SRC} alt="Pulso Pais" width={230} height={74} className="cp-brand-logo" />
          </Link>
          <p>El diario de la situacion</p>
        </div>

        <div className="cp-header-actions">
          <span>{formatHeaderDate(dateIso)}</span>
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
            className={!activeSection ? (index === 0 ? "active" : "") : item.section === activeSection ? "active" : ""}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
