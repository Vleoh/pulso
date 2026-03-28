import { NewsSection, NewsStatus, PollStatus, Province } from "@prisma/client";
import { prisma } from "../src/prismaClient";
import { FIXED_CANDIDATE_OPTIONS } from "../src/polls";

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

  const poll = await prisma.poll.upsert({
    where: { slug: "confiarias-pais-2027" },
    update: {
      title: "Encuesta Nacional 2027",
      question: "¿A quien le confiarias el pais en 2027?",
      hookLabel: "Resultados en vivo",
      footerCta: "Vota y explica por que",
      description: "Encuesta digital de Pulso Pais para medir confianza politica de la comunidad.",
      status: PollStatus.PUBLISHED,
      isFeatured: true,
      publishedAt: new Date(),
      interviewUrl: "https://www.instagram.com/",
    },
    create: {
      slug: "confiarias-pais-2027",
      title: "Encuesta Nacional 2027",
      question: "¿A quien le confiarias el pais en 2027?",
      hookLabel: "Resultados en vivo",
      footerCta: "Vota y explica por que",
      description: "Encuesta digital de Pulso Pais para medir confianza politica de la comunidad.",
      status: PollStatus.PUBLISHED,
      isFeatured: true,
      publishedAt: new Date(),
      interviewUrl: "https://www.instagram.com/",
    },
  });

  await prisma.pollOption.deleteMany({ where: { pollId: poll.id } });
  await prisma.pollOption.createMany({
    data: FIXED_CANDIDATE_OPTIONS.map((candidate, index) => ({
      pollId: poll.id,
      label: candidate.label,
      sortOrder: index + 1,
      colorHex: candidate.colorHex,
      emoji: candidate.emoji,
    })),
  });

  const options = await prisma.pollOption.findMany({
    where: { pollId: poll.id },
    orderBy: { sortOrder: "asc" },
  });

  const seedVotesPerOption = [7, 0, 12, 0, 3, 1, 0, 0, 0, 8];
  await prisma.pollVote.deleteMany({ where: { pollId: poll.id } });
  for (const option of options) {
    const total = seedVotesPerOption[option.sortOrder - 1] ?? 1;
    const payload = Array.from({ length: total }, (_unused, voteIndex) => ({
      pollId: poll.id,
      optionId: option.id,
      voterHash: `seed-${option.sortOrder}-${voteIndex + 1}`,
      sourceRef: "seed",
    }));
    await prisma.pollVote.createMany({
      data: payload,
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

