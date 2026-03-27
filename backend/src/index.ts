import "dotenv/config";

import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import morgan from "morgan";
import { type Prisma, NewsStatus } from "@prisma/client";
import { adminApiGuard, backofficeGuard, extractAdminToken, signAdminToken, verifyAdminToken } from "./auth";
import { backofficeShell, renderIaLab, renderLogin, renderNewsForm, renderNewsTable } from "./backofficeViews";
import { buildHomePayload } from "./homePayload";
import { ensureUniqueSlug, normalizeNewsInput } from "./newsInput";
import { toFeedItem, dedupeByKey } from "./feed";
import { getExternalNews } from "./externalNews";
import { isNewsSection, isNewsStatus, isProvince, readString, readBoolean } from "./utils";
import { prisma } from "./prismaClient";
import {
  applyEditorialSuggestions,
  askEditorialWithAi,
  evaluateEditorialWithAi,
  generateDraftWithAi,
  getEditorialAiHealth,
  type EditorialReview,
} from "./editorialAi";
import { buildAiNewsContext } from "./newsContextWrapper";
import { getHomeTheme, HOME_THEME_OPTIONS, normalizeHomeTheme, setHomeTheme } from "./siteSettings";
const app = express();

const PORT = Number(process.env.PORT ?? 8080);
const NODE_ENV = process.env.NODE_ENV ?? "development";
const IS_PRODUCTION = NODE_ENV === "production";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@pulsopais.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "cambiar-este-password";
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET ?? "pulso-pais-admin-secret";
const ADMIN_COOKIE_NAME = process.env.ADMIN_COOKIE_NAME ?? "pulso_admin_session";
const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? "*,http://localhost:3000,http://127.0.0.1:3000,https://*.vercel.app")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function isOriginAllowed(origin: string): boolean {
  if (CORS_ORIGINS.includes("*")) {
    return true;
  }
  return CORS_ORIGINS.some((allowedOrigin) => {
    if (allowedOrigin === origin) {
      return true;
    }
    if (allowedOrigin.includes("*")) {
      return wildcardToRegExp(allowedOrigin).test(origin);
    }
    return false;
  });
}

async function validateWithEditorialAi(
  normalized: ReturnType<typeof normalizeNewsInput>,
): Promise<{
  safeInput: ReturnType<typeof normalizeNewsInput>;
  review: EditorialReview;
  contextMeta: {
    generatedAt: string;
    internalCount: number;
    externalCount: number;
    linesUsed: number;
  };
}> {
  const context = await buildAiNewsContext(prisma);
  const review = await evaluateEditorialWithAi(normalized, context.contextText);
  if (review.decision === "REJECT") {
    throw new Error(`Bloqueado por IA editorial: ${review.reason}`);
  }
  const safeInput = applyEditorialSuggestions(normalized, review);
  return { safeInput, review, contextMeta: context.meta };
}

function buildEditorialAssistInput(raw: Record<string, unknown>) {
  const brief = readString(raw.brief);
  if (brief.length < 12) {
    throw new Error("El brief para IA debe tener al menos 12 caracteres.");
  }

  const sectionHintRaw = readString(raw.sectionHint).toUpperCase();
  const provinceHintRaw = readString(raw.provinceHint).toUpperCase();

  const tagsRaw = Array.isArray(raw.currentTags) ? raw.currentTags.join(",") : readString(raw.currentTags);
  const currentTags = tagsRaw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);

  return {
    brief,
    sectionHint: isNewsSection(sectionHintRaw) ? sectionHintRaw : null,
    provinceHint: isProvince(provinceHintRaw) ? provinceHintRaw : null,
    isSponsored: readBoolean(raw.isSponsored),
    currentTitle: readString(raw.currentTitle) || null,
    currentKicker: readString(raw.currentKicker) || null,
    currentExcerpt: readString(raw.currentExcerpt) || null,
    currentBody: readString(raw.currentBody) || null,
    currentImageUrl: readString(raw.currentImageUrl) || null,
    currentSourceName: readString(raw.currentSourceName) || null,
    currentSourceUrl: readString(raw.currentSourceUrl) || null,
    currentAuthorName: readString(raw.currentAuthorName) || null,
    currentStatus: isNewsStatus(readString(raw.currentStatus).toUpperCase()) ? readString(raw.currentStatus).toUpperCase() : null,
    currentPublishedAt: readString(raw.currentPublishedAt) || null,
    currentSection: isNewsSection(readString(raw.currentSection).toUpperCase()) ? readString(raw.currentSection).toUpperCase() : null,
    currentProvince: isProvince(readString(raw.currentProvince).toUpperCase()) ? readString(raw.currentProvince).toUpperCase() : null,
    currentFlags: {
      isHero: readBoolean(raw.isHero),
      isFeatured: readBoolean(raw.isFeatured),
      isSponsored: readBoolean(raw.isSponsored),
      isInterview: readBoolean(raw.isInterview),
      isOpinion: readBoolean(raw.isOpinion),
      isRadar: readBoolean(raw.isRadar),
    },
    currentTags,
  };
}

app.set("trust proxy", 1);
const apiCors = cors({
  origin(origin, callback) {
    if (!origin || isOriginAllowed(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Origen no permitido por CORS"));
  },
  credentials: true,
});

app.use("/api", apiCors);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(morgan(IS_PRODUCTION ? "combined" : "dev"));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(cookieParser());

app.get("/health", (_request, response) => {
  response.json({
    status: "ok",
    service: "pulso-backend",
    now: new Date().toISOString(),
  });
});

app.get("/api/home", async (_request, response, next) => {
  try {
    const payload = await buildHomePayload(prisma);
    response.json(payload);
  } catch (error) {
    next(error);
  }
});

app.get("/api/news", async (request, response, next) => {
  try {
    const sectionQuery = readString(request.query.section).toUpperCase();
    const provinceQuery = readString(request.query.province).toUpperCase();
    const statusQuery = readString(request.query.status).toUpperCase();
    const limitQuery = Number(request.query.limit ?? 30);
    const includeExternal = readBoolean(request.query.external);

    const where: Prisma.NewsWhereInput = {};
    if (sectionQuery && isNewsSection(sectionQuery)) {
      where.section = sectionQuery;
    }
    if (provinceQuery && isProvince(provinceQuery)) {
      where.province = provinceQuery;
    }
    if (statusQuery && isNewsStatus(statusQuery)) {
      where.status = statusQuery;
    } else {
      where.status = NewsStatus.PUBLISHED;
    }

    const limit = Number.isFinite(limitQuery) ? Math.max(1, Math.min(100, limitQuery)) : 30;

    const internalNews = await prisma.news.findMany({
      where,
      orderBy: [{ isHero: "desc" }, { isFeatured: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
    });

    const internal = internalNews.map(toFeedItem);
    if (!includeExternal) {
      response.json({ items: internal });
      return;
    }

    const external = await getExternalNews();
    response.json({
      items: dedupeByKey([...internal, ...external]).slice(0, limit),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/login", (request, response) => {
  const email = readString(request.body.email).toLowerCase();
  const password = readString(request.body.password);

  if (email !== ADMIN_EMAIL.toLowerCase() || password !== ADMIN_PASSWORD) {
    response.status(401).json({ error: "Credenciales invalidas" });
    return;
  }

  const token = signAdminToken(email, ADMIN_JWT_SECRET);
  response.cookie(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PRODUCTION,
    maxAge: 12 * 60 * 60 * 1000,
  });

  response.json({
    token,
    expiresIn: "12h",
  });
});

const apiGuard = adminApiGuard(ADMIN_JWT_SECRET, ADMIN_COOKIE_NAME);

app.get("/api/admin/settings/theme", apiGuard, async (_request, response, next) => {
  try {
    const theme = await getHomeTheme(prisma);
    response.json({ theme, options: HOME_THEME_OPTIONS });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/settings/theme", apiGuard, async (request, response, next) => {
  try {
    const nextTheme = normalizeHomeTheme(readString(request.body.theme));
    const theme = await setHomeTheme(prisma, nextTheme);
    response.json({ theme });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/ai/assist", apiGuard, async (request, response, next) => {
  try {
    const assistInput = buildEditorialAssistInput(request.body as Record<string, unknown>);
    const context = await buildAiNewsContext(prisma);
    const suggestion = await generateDraftWithAi(assistInput, context.contextText);
    response.json({ suggestion, context: context.meta });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/ai/ask", apiGuard, async (request, response, next) => {
  try {
    const assistInput = buildEditorialAssistInput(request.body as Record<string, unknown>);
    const context = await buildAiNewsContext(prisma);
    const answer = await askEditorialWithAi(assistInput, context.contextText);
    response.json({ answer, context: context.meta });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/ai/review", apiGuard, async (request, response, next) => {
  try {
    const normalized = normalizeNewsInput(request.body as Record<string, unknown>);
    const { safeInput, review, contextMeta } = await validateWithEditorialAi(normalized);
    response.json({
      review,
      context: contextMeta,
      suggestions: {
        title: safeInput.title,
        kicker: safeInput.kicker,
        excerpt: safeInput.excerpt,
        body: safeInput.body,
        imageUrl: safeInput.imageUrl,
        sourceName: safeInput.sourceName,
        sourceUrl: safeInput.sourceUrl,
        authorName: safeInput.authorName,
        section: safeInput.section,
        province: safeInput.province,
        tags: safeInput.tags,
        status: safeInput.status,
        publishedAt: safeInput.publishedAt ? safeInput.publishedAt.toISOString() : null,
        flags: {
          isHero: safeInput.isHero,
          isFeatured: safeInput.isFeatured,
          isSponsored: safeInput.isSponsored,
          isInterview: safeInput.isInterview,
          isOpinion: safeInput.isOpinion,
          isRadar: safeInput.isRadar,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/ai/context", apiGuard, async (_request, response, next) => {
  try {
    const context = await buildAiNewsContext(prisma);
    response.json(context);
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/ai/health", apiGuard, async (_request, response, next) => {
  try {
    const health = await getEditorialAiHealth();
    response.json({ health });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/news", apiGuard, async (request, response, next) => {
  try {
    const normalized = normalizeNewsInput(request.body as Record<string, unknown>);
    const { safeInput, review } = await validateWithEditorialAi(normalized);
    const uniqueSlug = await ensureUniqueSlug(prisma, safeInput.slug);

    if (safeInput.isHero) {
      await prisma.news.updateMany({
        data: { isHero: false },
        where: { isHero: true },
      });
    }

    const created = await prisma.news.create({
      data: {
        ...safeInput,
        slug: uniqueSlug,
        aiDecision: review.decision,
        aiReason: review.reason,
        aiScore: review.score,
        aiWarnings: review.warnings,
        aiModel: review.model,
        aiEvaluatedAt: new Date(),
      },
    });

    response.status(201).json({ item: toFeedItem(created), review });
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/news/:id", apiGuard, async (request, response, next) => {
  try {
    const id = readString(request.params.id);
    if (!id) {
      response.status(400).json({ error: "ID invalido" });
      return;
    }
    const normalized = normalizeNewsInput(request.body as Record<string, unknown>);
    const { safeInput, review } = await validateWithEditorialAi(normalized);
    const uniqueSlug = await ensureUniqueSlug(prisma, safeInput.slug, id);

    if (safeInput.isHero) {
      await prisma.news.updateMany({
        data: { isHero: false },
        where: { isHero: true, id: { not: id } },
      });
    }

    const updated = await prisma.news.update({
      where: { id },
      data: {
        ...safeInput,
        slug: uniqueSlug,
        aiDecision: review.decision,
        aiReason: review.reason,
        aiScore: review.score,
        aiWarnings: review.warnings,
        aiModel: review.model,
        aiEvaluatedAt: new Date(),
      },
    });

    response.json({ item: toFeedItem(updated), review });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/news/:id", apiGuard, async (request, response, next) => {
  try {
    const id = readString(request.params.id);
    if (!id) {
      response.status(400).json({ error: "ID invalido" });
      return;
    }
    await prisma.news.delete({ where: { id } });
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.get("/backoffice/login", (request, response) => {
  const token = extractAdminToken(request, ADMIN_COOKIE_NAME);
  if (token) {
    try {
      verifyAdminToken(token, ADMIN_JWT_SECRET);
      response.redirect("/backoffice");
      return;
    } catch {
      response.clearCookie(ADMIN_COOKIE_NAME);
    }
  }

  response.status(200).send(renderLogin(readString(request.query.error)));
});

app.post("/backoffice/login", (request, response) => {
  const email = readString(request.body.email).toLowerCase();
  const password = readString(request.body.password);

  if (email !== ADMIN_EMAIL.toLowerCase() || password !== ADMIN_PASSWORD) {
    response.status(401).send(renderLogin("Credenciales invalidas."));
    return;
  }

  const token = signAdminToken(email, ADMIN_JWT_SECRET);
  response.cookie(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PRODUCTION,
    maxAge: 12 * 60 * 60 * 1000,
  });

  response.redirect("/backoffice");
});

app.get("/backoffice/logout", (_request, response) => {
  response.clearCookie(ADMIN_COOKIE_NAME);
  response.redirect("/backoffice/login");
});

const boGuard = backofficeGuard(ADMIN_JWT_SECRET, ADMIN_COOKIE_NAME);

app.post("/backoffice/ai/assist", boGuard, async (request, response, next) => {
  try {
    const assistInput = buildEditorialAssistInput(request.body as Record<string, unknown>);
    const context = await buildAiNewsContext(prisma);
    const suggestion = await generateDraftWithAi(assistInput, context.contextText);
    response.json({ suggestion, context: context.meta });
  } catch (error) {
    next(error);
  }
});

app.post("/backoffice/ai/ask", boGuard, async (request, response, next) => {
  try {
    const assistInput = buildEditorialAssistInput(request.body as Record<string, unknown>);
    const context = await buildAiNewsContext(prisma);
    const answer = await askEditorialWithAi(assistInput, context.contextText);
    response.json({ answer, context: context.meta });
  } catch (error) {
    next(error);
  }
});

app.post("/backoffice/ai/review", boGuard, async (request, response, next) => {
  try {
    const normalized = normalizeNewsInput(request.body as Record<string, unknown>);
    const { safeInput, review, contextMeta } = await validateWithEditorialAi(normalized);
    response.json({
      review,
      context: contextMeta,
      suggestions: {
        title: safeInput.title,
        kicker: safeInput.kicker,
        excerpt: safeInput.excerpt,
        body: safeInput.body,
        imageUrl: safeInput.imageUrl,
        sourceName: safeInput.sourceName,
        sourceUrl: safeInput.sourceUrl,
        authorName: safeInput.authorName,
        section: safeInput.section,
        province: safeInput.province,
        tags: safeInput.tags,
        status: safeInput.status,
        publishedAt: safeInput.publishedAt ? safeInput.publishedAt.toISOString() : null,
        flags: {
          isHero: safeInput.isHero,
          isFeatured: safeInput.isFeatured,
          isSponsored: safeInput.isSponsored,
          isInterview: safeInput.isInterview,
          isOpinion: safeInput.isOpinion,
          isRadar: safeInput.isRadar,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get("/backoffice/ai/context", boGuard, async (_request, response, next) => {
  try {
    const context = await buildAiNewsContext(prisma);
    response.json(context);
  } catch (error) {
    next(error);
  }
});

app.get("/backoffice/ai/health", boGuard, async (_request, response, next) => {
  try {
    const health = await getEditorialAiHealth();
    response.json({ health });
  } catch (error) {
    next(error);
  }
});

app.get("/backoffice", boGuard, async (request, response, next) => {
  try {
    const [news, homeTheme] = await Promise.all([
      prisma.news.findMany({
        orderBy: [{ updatedAt: "desc" }],
        take: 300,
      }),
      getHomeTheme(prisma),
    ]);

    const themeOptions = HOME_THEME_OPTIONS.map(
      (option) =>
        `<option value="${option.value}" ${homeTheme === option.value ? "selected" : ""}>${option.label}</option>`,
    ).join("");

    const total = news.length;
    const published = news.filter((item) => item.status === NewsStatus.PUBLISHED).length;
    const drafts = news.filter((item) => item.status === NewsStatus.DRAFT).length;
    const aiReject = news.filter((item) => item.aiDecision === "REJECT").length;
    const aiReview = news.filter((item) => item.aiDecision === "REVIEW").length;

    const body = `<div class="grid">
      <div class="card">
        <h2 style="margin:0 0 12px; font-size:22px;">Modos y Estado Editorial</h2>
        <div style="display:grid; gap:10px; grid-template-columns:repeat(5,minmax(0,1fr));">
          <div style="border:1px solid #2d2d2d; border-radius:10px; padding:10px; background:#121212;"><p style="margin:0; font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:#a5a5a5;">Total</p><strong style="font-size:28px; font-family:inherit;">${total}</strong></div>
          <div style="border:1px solid #27513a; border-radius:10px; padding:10px; background:#102017;"><p style="margin:0; font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:#9ddcb7;">Publicadas</p><strong style="font-size:28px; font-family:inherit;">${published}</strong></div>
          <div style="border:1px solid #4a4a4a; border-radius:10px; padding:10px; background:#181818;"><p style="margin:0; font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:#cfcfcf;">Draft</p><strong style="font-size:28px; font-family:inherit;">${drafts}</strong></div>
          <div style="border:1px solid #6a5524; border-radius:10px; padding:10px; background:#211a0f;"><p style="margin:0; font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:#f3dc9f;">IA Review</p><strong style="font-size:28px; font-family:inherit;">${aiReview}</strong></div>
          <div style="border:1px solid #773232; border-radius:10px; padding:10px; background:#2b1515;"><p style="margin:0; font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:#f2b3b3;">IA Reject</p><strong style="font-size:28px; font-family:inherit;">${aiReject}</strong></div>
        </div>
      </div>
      <div class="card">
        <h2 style="margin:0 0 8px; font-size:22px;">Control de Portada</h2>
        <p style="margin:0 0 14px; color:#a9a9a9; line-height:1.5;">Gestiona titulares, radar electoral, publinotas y cobertura federal. El front de Vercel consume la API publica <code>/api/home</code> en tiempo real. En <strong>Nueva Nota</strong> y <strong>Editar</strong> tenes el Asistente IA (generar borrador + evaluar + aplicar sugerencias).</p>
        <form id="theme-control" method="post" action="/backoffice/settings/theme" style="display:grid; gap:10px; max-width:620px;">
          <label for="homeTheme" style="color:#cfcfcf; text-transform:uppercase; letter-spacing:.08em; font-size:12px; font-weight:600;">Tema visual del home</label>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <select id="homeTheme" name="homeTheme" style="max-width:360px;">${themeOptions}</select>
            <button class="primary" type="submit">Guardar tema</button>
          </div>
          <p style="margin:0; color:#8e8e8e; font-size:12px; line-height:1.4;">El tema <strong>Clasico Editorial</strong> replica una estetica tradicional. El tema <strong>Social Newsroom</strong> prioriza tarjetas consumibles, gadgets e interaccion de lectura constante.</p>
        </form>
      </div>
      ${renderNewsTable(news)}
    </div>`;

    response.send(backofficeShell("Panel editorial", body, readString(request.query.ok)));
  } catch (error) {
    next(error);
  }
});

app.post("/backoffice/settings/theme", boGuard, async (request, response, next) => {
  try {
    const nextTheme = normalizeHomeTheme(readString(request.body.homeTheme));
    await setHomeTheme(prisma, nextTheme);
    response.redirect(`/backoffice?ok=${encodeURIComponent(`Tema de home actualizado: ${nextTheme}`)}`);
  } catch (error) {
    next(error);
  }
});

app.get("/backoffice/news/new", boGuard, (_request, response) => {
  response.send(
    renderNewsForm({
      mode: "create",
      action: "/backoffice/news",
    }),
  );
});

app.get("/backoffice/ia-lab", boGuard, (_request, response) => {
  response.send(renderIaLab());
});

app.post("/backoffice/news", boGuard, async (request, response, next) => {
  try {
    const normalized = normalizeNewsInput(request.body as Record<string, unknown>);
    const { safeInput, review } = await validateWithEditorialAi(normalized);
    const uniqueSlug = await ensureUniqueSlug(prisma, safeInput.slug);

    if (safeInput.isHero) {
      await prisma.news.updateMany({
        data: { isHero: false },
        where: { isHero: true },
      });
    }

    await prisma.news.create({
      data: {
        ...safeInput,
        slug: uniqueSlug,
        aiDecision: review.decision,
        aiReason: review.reason,
        aiScore: review.score,
        aiWarnings: review.warnings,
        aiModel: review.model,
        aiEvaluatedAt: new Date(),
      },
    });

    response.redirect(`/backoffice?ok=${encodeURIComponent(`Noticia creada - IA ${review.decision}`)}`);
  } catch (error) {
    if (error instanceof Error) {
      response.status(400).send(
        renderNewsForm({
          mode: "create",
          action: "/backoffice/news",
          error: error.message,
          data: request.body,
        }),
      );
      return;
    }
    next(error);
  }
});

app.get("/backoffice/news/:id/edit", boGuard, async (request, response, next) => {
  try {
    const id = readString(request.params.id);
    if (!id) {
      response.status(400).send(backofficeShell("Error", `<div class="card">ID invalido.</div>`));
      return;
    }
    const news = await prisma.news.findUnique({ where: { id } });
    if (!news) {
      response.status(404).send(backofficeShell("No encontrado", `<div class="card">No se encontro la noticia solicitada.</div>`));
      return;
    }

    response.send(
      renderNewsForm({
        mode: "edit",
        action: `/backoffice/news/${news.id}`,
        data: news,
      }),
    );
  } catch (error) {
    next(error);
  }
});

app.post("/backoffice/news/:id", boGuard, async (request, response, next) => {
  try {
    const id = readString(request.params.id);
    if (!id) {
      response.status(400).send(backofficeShell("Error", `<div class="card">ID invalido.</div>`));
      return;
    }
    const normalized = normalizeNewsInput(request.body as Record<string, unknown>);
    const { safeInput, review } = await validateWithEditorialAi(normalized);
    const uniqueSlug = await ensureUniqueSlug(prisma, safeInput.slug, id);

    if (safeInput.isHero) {
      await prisma.news.updateMany({
        data: { isHero: false },
        where: { isHero: true, id: { not: id } },
      });
    }

    await prisma.news.update({
      where: { id },
      data: {
        ...safeInput,
        slug: uniqueSlug,
        aiDecision: review.decision,
        aiReason: review.reason,
        aiScore: review.score,
        aiWarnings: review.warnings,
        aiModel: review.model,
        aiEvaluatedAt: new Date(),
      },
    });

    response.redirect(`/backoffice?ok=${encodeURIComponent(`Noticia actualizada - IA ${review.decision}`)}`);
  } catch (error) {
    if (error instanceof Error) {
      response.status(400).send(
        renderNewsForm({
          mode: "edit",
          action: `/backoffice/news/${request.params.id}`,
          error: error.message,
          data: request.body,
        }),
      );
      return;
    }
    next(error);
  }
});

app.post("/backoffice/news/:id/delete", boGuard, async (request, response, next) => {
  try {
    const id = readString(request.params.id);
    if (!id) {
      response.status(400).send(backofficeShell("Error", `<div class="card">ID invalido.</div>`));
      return;
    }
    await prisma.news.delete({ where: { id } });
    response.redirect(`/backoffice?ok=${encodeURIComponent("Noticia eliminada")}`);
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: string }).code;
    if (code === "P2025") {
      response.status(404).json({ error: "Registro no encontrado" });
      return;
    }
  }

  if (error instanceof Error) {
    if (error.message.includes("Origen no permitido por CORS")) {
      response.status(403).json({ error: error.message });
      return;
    }
    response.status(400).json({ error: error.message });
    return;
  }
  response.status(500).json({ error: "Error interno" });
});

async function bootstrap(): Promise<void> {
  await prisma.$connect();
  app.listen(PORT, () => {
    console.log(`Pulso backend escuchando en http://localhost:${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error("No se pudo iniciar el backend", error);
  process.exit(1);
});

const shutdown = async () => {
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
