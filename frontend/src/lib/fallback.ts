import type { HomePayload } from "./types";

const now = new Date().toISOString();

export const fallbackHomeData: HomePayload = {
  generatedAt: now,
  theme: "premium",
  engagement: {
    commentsEnabled: true,
    reactionsEnabled: true,
    analysisEnabled: true,
  },
  ticker: [
    "Pulso Pais se prepara para cubrir el calendario electoral distrito por distrito.",
    "Radar Electoral: alianzas y estrategias en cada provincia.",
    "La portada federal integra agenda nacional, provincial y municipal.",
  ],
  hero: {
    id: "fallback-hero",
    slug: null,
    title: "Pulso Pais ordena la agenda politica nacional con foco federal y mirada editorial",
    kicker: "Portada en construccion",
    excerpt:
      "Conecta el backend para cargar noticias en vivo y administrar titulares desde el backoffice editorial.",
    imageUrl: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1600&q=80",
    sourceName: "Pulso Pais",
    sourceUrl: null,
    section: "NACION",
    province: "CABA",
    publishedAt: now,
    isSponsored: false,
    isFeatured: true,
    isExternal: false,
  },
  secondary: [],
  latest: [],
  radarElectoral: [],
  interviews: [],
  opinion: [],
  sponsored: [],
  externalPulse: [],
  federalHighlights: [
    { province: "Buenos Aires", headline: "Cobertura en vivo en desarrollo", section: "Pulso Federal", sourceUrl: null },
    { province: "Cordoba", headline: "Cobertura en vivo en desarrollo", section: "Pulso Federal", sourceUrl: null },
    { province: "Santa Fe", headline: "Cobertura en vivo en desarrollo", section: "Pulso Federal", sourceUrl: null },
    { province: "Mendoza", headline: "Cobertura en vivo en desarrollo", section: "Pulso Federal", sourceUrl: null },
  ],
  adSlots: [
    {
      id: "top-leaderboard",
      title: "Top Banner Institucional",
      detail: "Espacio premium para pauta politica y comercial.",
    },
    {
      id: "middle-sponsor",
      title: "Modulo Patrocinado",
      detail: "Integracion comercial dentro de la narrativa editorial.",
    },
    {
      id: "district-pack",
      title: "Paquete Distrital",
      detail: "Cobertura y visibilidad por provincia.",
    },
  ],
  social: {
    trendTopics: ["Elecciones", "Radar Federal", "Economia", "Legislativas", "Municipios"],
    weather: {
      location: "Buenos Aires",
      temperatureC: 23,
      feelsLikeC: 24,
      condition: "Parcialmente nublado",
      windKmh: 14,
      updatedAt: now,
    },
    markets: [
      { symbol: "^GSPC", label: "S&P 500", price: 5342.5, changePct: 0.24, currency: "USD", trend: "up" },
      { symbol: "^IXIC", label: "Nasdaq", price: 17640.3, changePct: -0.11, currency: "USD", trend: "down" },
      { symbol: "^DJI", label: "Dow Jones", price: 39220.2, changePct: 0.09, currency: "USD", trend: "up" },
      { symbol: "AAPL", label: "Apple", price: 212.8, changePct: 0.41, currency: "USD", trend: "up" },
      { symbol: "MSFT", label: "Microsoft", price: 438.5, changePct: 0.16, currency: "USD", trend: "up" },
    ],
    gadgets: [
      { id: "g1", label: "En vivo", value: "12", detail: "Actualizaciones del dia" },
      { id: "g2", label: "Notas hoy", value: "26", detail: "Publicadas en 24h" },
      { id: "g3", label: "Distritos activos", value: "18", detail: "Con cobertura propia" },
    ],
    microCards: [
      {
        id: "sm-1",
        title: "Cierre de listas: movimientos en el conurbano",
        section: "RADAR_ELECTORAL",
        province: "BUENOS_AIRES",
        sourceName: "Pulso Pais",
        publishedAt: now,
        imageUrl: "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=900&q=80",
        excerpt: "Intendentes ajustan estrategia territorial y acuerdos de ultimo momento.",
        reactions: { apoyo: 54, analisis: 18, guardados: 31 },
      },
    ],
    suggestedSections: [
      { id: "sec-live", label: "Pulso Live", detail: "Seguimiento minuto a minuto de agenda politica." },
      { id: "sec-fact", label: "Fact-check", detail: "Verificacion de declaraciones y datos de campana." },
      { id: "sec-com", label: "Comunidad", detail: "Conversaciones, preguntas y termometro ciudadano." },
    ],
    internationalLive: [
      {
        id: "int-1",
        title: "Wall Street abre con foco en tasas y tecnológicas",
        sourceName: "Pulso Global",
        sourceUrl: null,
        publishedAt: now,
        section: "INTERNACIONALES",
      },
      {
        id: "int-2",
        title: "Brasil define nuevo paquete fiscal con impacto regional",
        sourceName: "Pulso Regional",
        sourceUrl: null,
        publishedAt: now,
        section: "INTERNACIONALES",
      },
    ],
  },
};
