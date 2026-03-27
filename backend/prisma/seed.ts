import { NewsSection, NewsStatus, Province } from "@prisma/client";
import { prisma } from "../src/prismaClient";

const now = new Date();

const seedNews = [
  {
    slug: "acuerdo-fiscal-gobernadores-2026",
    title: "Gobernadores y Casa Rosada negocian un nuevo esquema fiscal para 2026",
    kicker: "Pulseada federal",
    excerpt: "El Gobierno abre una ronda intensiva con provincias para redefinir coparticipacion y obra publica.",
    body: "La negociacion incluye metas de equilibrio, fondo compensador y agenda de infraestructura en distritos clave.",
    imageUrl:
      "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1600&q=80",
    section: NewsSection.NACION,
    province: Province.CABA,
    tags: ["nacion", "fiscal", "gobernadores"],
    status: NewsStatus.PUBLISHED,
    publishedAt: new Date(now.getTime() - 1000 * 60 * 20),
    isHero: true,
    isFeatured: true,
  },
  {
    slug: "radar-buenos-aires-armados-seccionales",
    title: "Radar Electoral: se aceleran los armados seccionales en Buenos Aires",
    kicker: "Escenario electoral",
    excerpt: "Intendentes, legisladores y equipos tecnicos afinan listas y alianzas de cara al calendario 2026.",
    imageUrl:
      "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=1600&q=80",
    section: NewsSection.RADAR_ELECTORAL,
    province: Province.BUENOS_AIRES,
    tags: ["radar", "provincia", "elecciones"],
    status: NewsStatus.PUBLISHED,
    publishedAt: new Date(now.getTime() - 1000 * 60 * 45),
    isFeatured: true,
    isRadar: true,
  },
  {
    slug: "cordoba-entrevista-jefe-campana",
    title: "Entrevista: el jefe de campana que reordena la estrategia territorial en Cordoba",
    kicker: "Reportaje",
    excerpt: "Analisis de segmentos, narrativa y despliegue de equipos en el interior provincial.",
    imageUrl:
      "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1600&q=80",
    section: NewsSection.ENTREVISTAS,
    province: Province.CORDOBA,
    tags: ["entrevista", "cordoba"],
    status: NewsStatus.PUBLISHED,
    publishedAt: new Date(now.getTime() - 1000 * 60 * 90),
    isInterview: true,
  },
  {
    slug: "santa-fe-columna-frentes",
    title: "Opinion: la disputa por los frentes redefine la competencia en Santa Fe",
    kicker: "Analisis politico",
    excerpt: "Los nuevos incentivos electorales alteran acuerdos historicos y tensionan liderazgos locales.",
    section: NewsSection.OPINION,
    province: Province.SANTA_FE,
    tags: ["opinion", "santa fe"],
    status: NewsStatus.PUBLISHED,
    publishedAt: new Date(now.getTime() - 1000 * 60 * 120),
    isOpinion: true,
  },
  {
    slug: "mendoza-publinota-energia",
    title: "Mendoza impulsa un plan de inversion energetica con foco en empleo regional",
    kicker: "Contenido patrocinado",
    excerpt: "Proyecto productivo con impacto federal y articulacion publico-privada.",
    section: NewsSection.PUBLINOTAS,
    province: Province.MENDOZA,
    tags: ["patrocinado", "energia"],
    status: NewsStatus.PUBLISHED,
    publishedAt: new Date(now.getTime() - 1000 * 60 * 140),
    isSponsored: true,
  },
  {
    slug: "neuquen-municipios-obras",
    title: "Municipios patagonicos coordinan agenda de obras para el segundo semestre",
    kicker: "Territorio",
    excerpt: "Intendencias y provincias alinean prioridades de infraestructura y movilidad.",
    section: NewsSection.MUNICIPIOS,
    province: Province.NEUQUEN,
    tags: ["municipios", "patagonia"],
    status: NewsStatus.PUBLISHED,
    publishedAt: new Date(now.getTime() - 1000 * 60 * 180),
  },
  {
    slug: "economia-federal-dolar-productivo",
    title: "Economia federal: el dolar productivo tensiona precios e inversion en distritos exportadores",
    kicker: "Mercados y politica",
    section: NewsSection.ECONOMIA,
    province: Province.ENTRE_RIOS,
    tags: ["economia", "dolar"],
    status: NewsStatus.PUBLISHED,
    publishedAt: new Date(now.getTime() - 1000 * 60 * 210),
  },
  {
    slug: "internacionales-impacto-regional",
    title: "Internacionales: cambios en Brasil y EE.UU. reordenan la agenda local",
    kicker: "Contexto global",
    section: NewsSection.INTERNACIONALES,
    province: Province.CABA,
    tags: ["internacionales", "geopolitica"],
    status: NewsStatus.PUBLISHED,
    publishedAt: new Date(now.getTime() - 1000 * 60 * 240),
  },
  {
    slug: "distritos-norte-gran-acuerdo",
    title: "Distritos del NOA negocian una agenda comun para transporte y competitividad",
    kicker: "Pulso Federal",
    section: NewsSection.DISTRITOS,
    province: Province.TUCUMAN,
    tags: ["distritos", "noa"],
    status: NewsStatus.PUBLISHED,
    publishedAt: new Date(now.getTime() - 1000 * 60 * 270),
  },
];

async function main(): Promise<void> {
  for (const news of seedNews) {
    await prisma.news.upsert({
      where: { slug: news.slug },
      update: news,
      create: news,
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("Seed completado.");
  })
  .catch(async (error) => {
    console.error("Error en seed", error);
    await prisma.$disconnect();
    process.exit(1);
  });
