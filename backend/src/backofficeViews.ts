import { type News, NewsStatus, type Poll, PollStatus, type Province, UserPlan } from "@prisma/client";
import { PROVINCE_OPTIONS, SECTION_OPTIONS, provinceLabel, sectionLabel } from "./catalog";
import { escapeHtml } from "./utils";

export function backofficeShell(title: string, body: string, flashMessage?: string): string {
  const flash = flashMessage ? `<div class="flash">${escapeHtml(flashMessage)}</div>` : "";
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} | Pulso Pais Backoffice</title>
  <style>
    :root { --bg:#090909; --card:#131313; --line:#262626; --muted:#9d9d9d; --text:#f8f8f8; --gold:#c6a24a; --gold-soft:#e5c46f; }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; background:radial-gradient(circle at top right,#141414 0%,var(--bg) 55%); color:var(--text); font-family:Segoe UI,Arial,sans-serif; }
    .layout { min-height:100vh; display:grid; grid-template-columns:260px minmax(0,1fr); }
    .sidebar { border-right:1px solid var(--line); background:linear-gradient(180deg,#0f0f0f,#0b0b0b); padding:20px 14px; display:grid; align-content:start; gap:14px; position:sticky; top:0; height:100vh; }
    .side-brand { border:1px solid #2d2d2d; border-radius:12px; padding:12px; display:grid; gap:4px; background:#121212; }
    .side-brand strong { letter-spacing:.14em; font-size:20px; text-transform:uppercase; }
    .side-brand span { color:var(--gold); font-size:11px; letter-spacing:.2em; text-transform:uppercase; }
    .side-nav { display:grid; gap:6px; }
    .side-nav a { border:1px solid #272727; border-radius:10px; background:#121212; color:#d9d9d9; text-decoration:none; font-size:12px; text-transform:uppercase; letter-spacing:.07em; padding:10px 11px; font-weight:600; }
    .side-nav a:hover { border-color:#5e4c25; color:var(--gold-soft); }
    .mode-card { border:1px solid #2d2d2d; border-radius:12px; background:#111111; padding:11px; display:grid; gap:8px; }
    .mode-card p { margin:0; font-size:11px; color:#9f9f9f; text-transform:uppercase; letter-spacing:.09em; }
    .mode-actions { display:flex; gap:6px; flex-wrap:wrap; }
    .mode-actions button { flex:1; min-width:70px; font-size:11px; padding:7px 8px; text-transform:uppercase; letter-spacing:.06em; }
    .mode-actions button.is-active { border-color:#7f672d; background:#2b2110; color:#f7dda1; box-shadow:0 0 0 1px rgba(198,162,74,.25) inset; }
    .main { min-width:0; }
    .wrap { width:min(1220px,94vw); margin:0 auto; padding:24px 0 64px; }
    .top { display:flex; align-items:center; justify-content:space-between; margin-bottom:26px; border-bottom:1px solid var(--line); padding-bottom:18px; gap:12px; flex-wrap:wrap; }
    .brand { display:grid; gap:2px; }
    .brand strong { letter-spacing:.14em; font-size:24px; text-transform:uppercase; }
    .brand span { color:var(--gold); font-size:12px; letter-spacing:.24em; text-transform:uppercase; }
    .actions { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
    .button, button { display:inline-flex; align-items:center; justify-content:center; gap:8px; border-radius:10px; border:1px solid var(--line); background:#1a1a1a; color:var(--text); text-decoration:none; font-weight:600; font-size:13px; padding:10px 14px; cursor:pointer; transition:border-color .18s,color .18s,opacity .18s,transform .18s; }
    .button.primary, button.primary { background:linear-gradient(120deg,#b58f3f,var(--gold-soft)); color:#0b0b0b; border-color:transparent; }
    .button:hover, button:hover { border-color:var(--gold); color:var(--gold-soft); }
    .button.primary:hover, button.primary:hover { color:#0b0b0b; filter:brightness(1.05); }
    .button[disabled], button[disabled] { opacity:.56; cursor:not-allowed; transform:none; }
    button.is-running { border-color:#7b6127; background:#231c0f; color:#f7dda1; box-shadow:0 0 0 1px rgba(198,162,74,.22) inset; }
    .grid { display:grid; gap:18px; }
    .card { background:linear-gradient(180deg,#141414,#101010); border:1px solid var(--line); border-radius:16px; padding:18px; }
    .flash { margin:0 0 16px; border:1px solid #3e3520; background:#1f1a0d; color:var(--gold-soft); padding:12px 14px; border-radius:10px; font-size:14px; }
    .error { margin:0 0 12px; border:1px solid #633030; background:#2a1414; color:#ef9f9f; padding:10px 12px; border-radius:10px; font-size:13px; }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    thead th { color:var(--muted); font-weight:600; text-transform:uppercase; font-size:11px; letter-spacing:.08em; border-bottom:1px solid var(--line); padding:10px 8px; text-align:left; }
    tbody td { border-bottom:1px solid #1e1e1e; padding:12px 8px; vertical-align:top; }
    .pill { display:inline-flex; align-items:center; border-radius:999px; font-size:10px; letter-spacing:.06em; text-transform:uppercase; border:1px solid var(--line); padding:4px 8px; }
    .pill.live { color:#9ae0b9; border-color:#2d5f45; background:#102318; } .pill.draft { color:#d4d4d4; border-color:#3a3a3a; background:#181818; } .pill.gold { color:var(--gold-soft); border-color:#574823; background:#1f1a0f; }
    .pill.ai-allow { color:#b6f3ca; border-color:#226840; background:#132b1d; }
    .pill.ai-review { color:#f5dd96; border-color:#70591f; background:#221b0d; }
    .pill.ai-reject { color:#ffc4c4; border-color:#7b2f2f; background:#2c1313; }
    .meta { display:flex; gap:8px; flex-wrap:wrap; margin-top:7px; } .title { font-size:14px; font-weight:700; line-height:1.35; }
    form { display:grid; gap:14px; } .field { display:grid; gap:6px; }
    .field label { color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.07em; font-weight:600; }
    input, textarea, select { width:100%; border-radius:10px; border:1px solid var(--line); background:#121212; color:var(--text); padding:11px 12px; font-size:14px; }
    textarea { min-height:130px; resize:vertical; } input:focus, textarea:focus, select:focus { outline:2px solid #9b7b2d; outline-offset:1px; border-color:#9b7b2d; }
    .cols-2 { display:grid; gap:14px; grid-template-columns:repeat(2,minmax(0,1fr)); }
    .checks { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
    .checks label { border:1px solid var(--line); border-radius:10px; background:#111111; padding:10px 12px; display:flex; gap:8px; align-items:center; cursor:pointer; color:#efefef; font-size:13px; text-transform:none; letter-spacing:normal; font-weight:500; }
    .inline-actions { display:flex; gap:6px; flex-wrap:wrap; } .danger { border-color:#4f2222; color:#f2b0b0; background:#1f1111; }
    .ai-box { border:1px solid #3f341d; background:linear-gradient(160deg,#1b1710,#111111); border-radius:12px; padding:14px; margin-bottom:14px; display:grid; gap:10px; }
    .ai-head { display:flex; gap:10px; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; }
    .ai-title { margin:0; font-size:17px; letter-spacing:.04em; text-transform:uppercase; }
    .ai-sub { margin:0; font-size:13px; color:#cfcfcf; line-height:1.45; }
    .ai-badge { display:inline-flex; align-items:center; border:1px solid #5f4e27; background:#201a0f; color:var(--gold-soft); border-radius:999px; font-size:10px; padding:4px 8px; text-transform:uppercase; letter-spacing:.08em; }
    .ai-actions { display:flex; gap:8px; flex-wrap:wrap; }
    .ai-actions button { position:relative; }
    .ai-main-action { font-size:14px; padding:11px 16px; letter-spacing:.02em; }
    .ai-advanced { border:1px solid #2b2b2b; border-radius:10px; background:#101010; padding:8px 10px; display:grid; gap:8px; }
    .ai-advanced summary { cursor:pointer; user-select:none; color:#d7d7d7; font-size:12px; text-transform:uppercase; letter-spacing:.08em; }
    .ai-advanced .ai-actions { margin-top:8px; }
    .ai-actions button.is-running::after { content:""; width:11px; height:11px; border:2px solid #9b7c36; border-top-color:transparent; border-radius:999px; margin-left:8px; animation:spin .7s linear infinite; }
    .ai-status { border:1px solid #2b2b2b; background:#121212; color:#d4d4d4; border-radius:10px; padding:10px 12px; font-size:13px; line-height:1.45; }
    .ai-status.ok { border-color:#27543a; background:#102016; color:#c8f0d6; }
    .ai-status.warn { border-color:#654f1f; background:#221b0d; color:#f5dd9b; }
    .ai-status.error { border-color:#6e2f2f; background:#281414; color:#f2bbbb; }
    .ai-review { border:1px solid #2f2f2f; background:#111111; border-radius:10px; padding:11px 12px; display:grid; gap:6px; }
    .ai-review strong { font-size:12px; text-transform:uppercase; letter-spacing:.08em; color:#d6d6d6; }
    .ai-review p { margin:0; font-size:13px; line-height:1.45; color:#f0f0f0; }
    .muted { color:var(--muted); font-size:12px; line-height:1.4; margin:0; }
    .table-tools { display:grid; grid-template-columns:minmax(220px,1fr) repeat(2,minmax(140px,200px)) auto; gap:8px; margin-bottom:12px; align-items:center; }
    .table-tools input, .table-tools select { width:100%; }
    .table-count { font-size:12px; color:#b5b5b5; text-align:right; }
    .cms-layout { display:grid; gap:16px; grid-template-columns:minmax(0,1.6fr) minmax(320px,0.8fr); align-items:start; }
    .editor-stack { display:grid; gap:12px; }
    .editor-card { border:1px solid #2a2a2a; border-radius:12px; background:#111111; padding:12px; display:grid; gap:10px; }
    .editor-toolbar { display:flex; gap:6px; flex-wrap:wrap; border:1px solid #262626; border-radius:10px; padding:7px; background:#0f0f0f; }
    .editor-toolbar button { padding:6px 9px; font-size:12px; min-width:auto; border-radius:8px; }
    .editor-surface { border:1px solid #2b2b2b; border-radius:10px; background:#101010; min-height:260px; padding:12px; font-size:15px; line-height:1.55; overflow:auto; }
    .editor-surface:focus { outline:2px solid #9b7b2d; outline-offset:1px; border-color:#9b7b2d; }
    .editor-surface pre { background:#0a0a0a; border:1px solid #272727; border-radius:8px; padding:10px; overflow:auto; }
    .editor-surface blockquote { border-left:3px solid #7a6029; margin:8px 0; padding:4px 0 4px 10px; color:#ccc; }
    .editor-hidden { display:none; }
    .editor-metrics { display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px; font-size:12px; color:#a5a5a5; }
    .editor-preview { border:1px dashed #383838; border-radius:10px; min-height:140px; padding:12px; color:#9f9f9f; font-size:13px; display:grid; place-items:center; text-align:center; background:#0f0f0f; }
    .editor-preview img { max-width:100%; border-radius:8px; object-fit:cover; }
    .editor-preview.has-image { padding:0; overflow:hidden; border-style:solid; }
    .field .hint { margin-top:4px; font-size:12px; color:#8f8f8f; line-height:1.35; }
    .ai-chat-answer { border:1px solid #2d2d2d; background:#101010; border-radius:10px; padding:10px 12px; font-size:13px; line-height:1.5; color:#e0e0e0; white-space:pre-wrap; }
    .ai-inline { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
    .ai-inline input[type="checkbox"] { width:16px; height:16px; margin:0; accent-color:#d1b462; }
    .toast-stack { position:fixed; right:16px; bottom:16px; z-index:9999; display:grid; gap:8px; width:min(360px,calc(100vw - 24px)); pointer-events:none; }
    .toast { border:1px solid #2f2f2f; background:#111111; color:#e7e7e7; border-radius:12px; padding:10px 12px; box-shadow:0 6px 24px rgba(0,0,0,.35); font-size:13px; line-height:1.4; opacity:0; transform:translateY(8px); animation:toast-in .18s ease forwards; }
    .toast.ok { border-color:#2d5f45; background:#102318; color:#c9f0d7; }
    .toast.warn { border-color:#70591f; background:#221b0d; color:#f5dd9b; }
    .toast.error { border-color:#7b2f2f; background:#2c1313; color:#ffc4c4; }
    @keyframes toast-in { to { opacity:1; transform:translateY(0); } }
    @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
    .split-title { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
    .split-title h3 { margin:0; font-size:16px; text-transform:uppercase; letter-spacing:.05em; }
    .mini-tag { display:inline-flex; align-items:center; border:1px solid #423518; border-radius:999px; padding:4px 8px; color:#e0c779; font-size:10px; letter-spacing:.08em; text-transform:uppercase; background:#1a160d; }
    body[data-mode="compact"] .card { padding:12px; }
    body[data-mode="compact"] .button, body[data-mode="compact"] button { padding:8px 10px; font-size:12px; }
    body[data-mode="compact"] .news-table tbody td { padding:8px 6px; }
    body[data-mode="compact"] .editor-surface { min-height:190px; font-size:14px; }
    body[data-mode="compact"] .cms-layout { grid-template-columns:minmax(0,1.4fr) minmax(300px,0.6fr); }
    body[data-mode="focus"] .sidebar { width:72px; padding:14px 8px; }
    body[data-mode="focus"] .sidebar .side-brand span,
    body[data-mode="focus"] .sidebar .side-brand strong,
    body[data-mode="focus"] .sidebar .mode-card,
    body[data-mode="focus"] .sidebar .side-nav a span { display:none; }
    body[data-mode="focus"] .layout { grid-template-columns:82px minmax(0,1fr); }
    @media (max-width:1100px) {
      .layout { grid-template-columns:1fr; }
      .sidebar { position:static; height:auto; border-right:0; border-bottom:1px solid var(--line); grid-template-columns:1fr; }
      .side-nav { grid-template-columns:repeat(2,minmax(0,1fr)); }
      .mode-actions { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); }
    }
    @media (max-width:900px) {
      .cols-2, .checks, .table-tools, .cms-layout { grid-template-columns:1fr; }
      .table-count { text-align:left; }
      table, thead, tbody, th, td, tr { display:block; }
      thead { display:none; }
      tbody tr { border:1px solid var(--line); border-radius:12px; margin-bottom:10px; padding:10px; }
      tbody td { border:0; padding:6px 0; }
    }
  </style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <div class="side-brand"><strong>PULSO</strong><span>Backoffice</span></div>
      <nav class="side-nav">
        <a href="/backoffice"><span>Panel</span></a>
        <a href="/backoffice/news/new"><span>Nueva Nota</span></a>
        <a href="/backoffice/polls"><span>Encuestas</span></a>
        <a href="/backoffice/users"><span>Usuarios</span></a>
        <a href="/backoffice#theme-control"><span>Temas</span></a>
        <a href="/backoffice/ia-lab"><span>IA Lab</span></a>
        <a href="/backoffice/ai/context" target="_blank" rel="noreferrer"><span>Wrapper IA</span></a>
      </nav>
      <div class="mode-card">
        <p>Modo de trabajo</p>
        <div class="mode-actions">
          <button type="button" data-mode="default">Default</button>
          <button type="button" data-mode="focus">Focus</button>
          <button type="button" data-mode="compact">Compact</button>
        </div>
      </div>
    </aside>
    <main class="main">
      <div class="wrap">
        <header class="top">
          <div class="brand"><strong>PULSO PAIS</strong><span>Backoffice Editorial</span></div>
          <div class="actions">
            <a class="button" href="/backoffice">Panel</a>
            <a class="button" href="/backoffice/news/new">Nueva Nota</a>
            <a class="button" href="/backoffice/polls">Encuestas</a>
            <a class="button" href="/backoffice/users">Usuarios</a>
            <a class="button" href="/backoffice/logout">Cerrar Sesion</a>
          </div>
        </header>
        ${flash}
        ${body}
      </div>
    </main>
  </div>
  <div id="boToastStack" class="toast-stack" aria-live="polite" aria-atomic="true"></div>
  <script>
    (function () {
      const modeButtons = Array.from(document.querySelectorAll("[data-mode]"));
      const toastStack = document.getElementById("boToastStack");

      function toast(message, level) {
        if (!toastStack || !message) {
          return;
        }
        const item = document.createElement("div");
        item.className = "toast " + (level || "");
        item.textContent = String(message);
        toastStack.appendChild(item);
        window.setTimeout(function () {
          item.style.opacity = "0";
          item.style.transform = "translateY(8px)";
          window.setTimeout(function () {
            item.remove();
          }, 220);
        }, 2600);
      }

      window.pulsoToast = toast;

      if (!modeButtons.length) {
        return;
      }

      const storageKey = "pulso_bo_mode";
      const savedMode = localStorage.getItem(storageKey) || "default";
      document.body.dataset.mode = savedMode;

      function paintActive(mode) {
        modeButtons.forEach(function (entry) {
          const active = (entry.getAttribute("data-mode") || "") === mode;
          entry.classList.toggle("is-active", active);
        });
      }
      paintActive(savedMode);

      modeButtons.forEach(function (button) {
        button.addEventListener("click", function () {
          const nextMode = button.getAttribute("data-mode") || "default";
          document.body.dataset.mode = nextMode;
          localStorage.setItem(storageKey, nextMode);
          paintActive(nextMode);
          toast("Modo " + nextMode + " activado.", "ok");
        });
      });
    })();
  </script>
</body>
</html>`;
}

export function renderLogin(errorMessage?: string): string {
  const errorHtml = errorMessage ? `<div class="error">${escapeHtml(errorMessage)}</div>` : "";
  return `<!doctype html>
<html lang="es"><head>
  <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Login | Pulso Pais Backoffice</title>
  <style>
    body { margin:0; min-height:100vh; background:radial-gradient(circle at top,#1a1a1a,#090909 65%); display:grid; place-items:center; color:#f3f3f3; font-family:Segoe UI,Arial,sans-serif; }
    .card { width:min(440px,92vw); border:1px solid #292929; background:linear-gradient(180deg,#141414,#101010); border-radius:16px; padding:24px; box-sizing:border-box; }
    h1 { margin:0 0 4px; letter-spacing:.08em; font-size:24px; text-transform:uppercase; } p { margin:0 0 18px; color:#b3b3b3; font-size:14px; line-height:1.45; }
    form { display:grid; gap:12px; } input { width:100%; border:1px solid #323232; background:#0f0f0f; color:#f5f5f5; border-radius:10px; padding:12px; font-size:14px; box-sizing:border-box; }
    button { border:0; border-radius:10px; background:linear-gradient(120deg,#b58f3f,#dec26f); color:#101010; font-weight:700; letter-spacing:.06em; text-transform:uppercase; font-size:12px; padding:12px; cursor:pointer; }
    .error { background:#2b1414; border:1px solid #613030; color:#ef9f9f; border-radius:10px; padding:10px 12px; font-size:13px; margin-bottom:8px; }
    .hint { margin-top:12px; font-size:12px; color:#8c8c8c; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Pulso Pais</h1>
    <p>Acceso al panel editorial para gestionar portada, radar electoral y contenido federal.</p>
    ${errorHtml}
    <form method="post" action="/backoffice/login">
      <input type="email" name="email" placeholder="Email de administrador" required />
      <input type="password" name="password" placeholder="Contrasena" required />
      <button type="submit">Ingresar</button>
    </form>
    <div class="hint">Defini ADMIN_EMAIL y ADMIN_PASSWORD en entorno antes de produccion.</div>
  </div>
</body></html>`;
}

export function renderNewsTable(news: News[]): string {
  if (news.length === 0) {
    return `<div class="card"><p>No hay noticias creadas. Usa "Nueva Nota" para cargar la primera portada.</p></div>`;
  }

  const rows = news
    .map((item) => {
      const searchIndex = escapeHtml(
        `${item.title} ${item.slug} ${sectionLabel(item.section)} ${provinceLabel(item.province) ?? ""} ${item.status} ${item.aiDecision}`.toLowerCase(),
      );
      const aiBadgeClass =
        item.aiDecision === "ALLOW" ? "ai-allow" : item.aiDecision === "REJECT" ? "ai-reject" : "ai-review";
      const badges = [
        `<span class="pill ${item.status === NewsStatus.PUBLISHED ? "live" : "draft"}">${item.status}</span>`,
        item.isHero ? `<span class="pill gold">Hero</span>` : "",
        item.isFeatured ? `<span class="pill gold">Destacada</span>` : "",
        item.isSponsored ? `<span class="pill gold">Patrocinada</span>` : "",
        `<span class="pill ${aiBadgeClass}">IA ${item.aiDecision}</span>`,
      ]
        .filter(Boolean)
        .join(" ");

      const published = item.publishedAt
        ? new Date(item.publishedAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
        : "-";

      return `<tr data-news-row data-status="${item.status}" data-ai="${item.aiDecision}" data-search="${searchIndex}">
        <td>
          <div class="title">${escapeHtml(item.title)}</div>
          <div class="meta">
            <span class="pill">${escapeHtml(sectionLabel(item.section))}</span>
            ${item.province ? `<span class="pill">${escapeHtml(provinceLabel(item.province) ?? item.province)}</span>` : ""}
            ${badges}
          </div>
        </td>
        <td>${escapeHtml(item.slug)}</td>
        <td>${escapeHtml(published)}</td>
        <td>
          <div class="inline-actions">
            <a class="button" href="/backoffice/news/${item.id}/edit">Editar</a>
            <form method="post" action="/backoffice/news/${item.id}/delete" onsubmit="return confirm('Eliminar noticia? Esta accion no se puede deshacer.');">
              <button class="danger" type="submit">Eliminar</button>
            </form>
          </div>
        </td>
      </tr>`;
    })
    .join("\n");

  return `<div class="card">
    <div class="table-tools">
      <input id="newsFilterInput" placeholder="Buscar por titulo, seccion, slug o distrito..." />
      <select id="newsStatusFilter">
        <option value="">Todos los estados</option>
        <option value="PUBLISHED">Solo publicadas</option>
        <option value="DRAFT">Solo draft</option>
      </select>
      <select id="newsAiFilter">
        <option value="">Toda IA</option>
        <option value="ALLOW">IA Allow</option>
        <option value="REVIEW">IA Review</option>
        <option value="REJECT">IA Reject</option>
      </select>
      <span class="table-count" id="newsRowCount">${news.length} items</span>
    </div>
    <table class="news-table"><thead><tr><th>Titulo</th><th>Slug</th><th>Publicacion</th><th>Acciones</th></tr></thead><tbody>${rows}</tbody></table>
    <script>
      (function () {
        const rows = Array.from(document.querySelectorAll("[data-news-row]"));
        const input = document.getElementById("newsFilterInput");
        const statusFilter = document.getElementById("newsStatusFilter");
        const aiFilter = document.getElementById("newsAiFilter");
        const count = document.getElementById("newsRowCount");
        if (!rows.length || !input || !statusFilter || !aiFilter || !count) {
          return;
        }
        function refresh() {
          const query = (input.value || "").toLowerCase().trim();
          const status = statusFilter.value || "";
          const ai = aiFilter.value || "";
          let visible = 0;
          rows.forEach(function (row) {
            const rowQuery = (row.getAttribute("data-search") || "").toLowerCase();
            const rowStatus = row.getAttribute("data-status") || "";
            const rowAi = row.getAttribute("data-ai") || "";
            const matchQuery = !query || rowQuery.includes(query);
            const matchStatus = !status || status === rowStatus;
            const matchAi = !ai || ai === rowAi;
            const show = matchQuery && matchStatus && matchAi;
            row.style.display = show ? "" : "none";
            if (show) {
              visible += 1;
            }
          });
          count.textContent = visible + " items visibles";
        }
        input.addEventListener("input", refresh);
        statusFilter.addEventListener("change", refresh);
        aiFilter.addEventListener("change", refresh);
      })();
    </script>
  </div>`;
}

function isoLocalDate(value: Date | null): string {
  if (!value) {
    return "";
  }
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  const hours = `${value.getHours()}`.padStart(2, "0");
  const minutes = `${value.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function renderNewsForm(params: {
  mode: "create" | "edit";
  action: string;
  data?: Partial<News>;
  error?: string;
}): string {
  const { mode, action, data, error } = params;

  const getValue = (value: unknown): string => {
    if (value === null || value === undefined) {
      return "";
    }
    return escapeHtml(String(value));
  };

  const bool = (value: unknown): string => (value ? "checked" : "");
  const section = data?.section ?? "NACION";
  const status = data?.status ?? "DRAFT";
  const tags = (data?.tags ?? []).join(", ");

  const sectionOptions = SECTION_OPTIONS.map(
    (option) => `<option value="${option.value}" ${section === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`,
  ).join("");

  const provinceOptions = [
    `<option value="">Sin distrito especifico</option>`,
    ...PROVINCE_OPTIONS.map(
      (option) =>
        `<option value="${option.value}" ${(data?.province as Province | null) === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`,
    ),
  ].join("");

  const statusOptions = [NewsStatus.DRAFT, NewsStatus.PUBLISHED]
    .map((option) => `<option value="${option}" ${status === option ? "selected" : ""}>${option}</option>`)
    .join("");

  return backofficeShell(
    mode === "create" ? "Nueva noticia" : "Editar noticia",
    `<div class="grid">
      <div class="card">
        ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
        ${
          data?.aiReason
            ? `<div class="flash"><strong>Ultima evaluacion IA:</strong> ${escapeHtml(data.aiDecision ?? "REVIEW")} - ${escapeHtml(
                data.aiReason,
              )}</div>`
            : ""
        }
        <div id="ia" class="ai-box">
          <div class="ai-head">
            <div>
              <h3 class="ai-title">Generacion IA de Noticia</h3>
              <p class="ai-sub">Escribe el brief y usa <strong>Genera con IA</strong>. Se autocompleta titulo, volanta, bajada, cuerpo, tags, seccion y metadatos para que luego solo revises y publiques.</p>
            </div>
            <span class="ai-badge" id="aiConnBadge">Chequeando IA...</span>
          </div>
          <div class="field">
            <label for="aiBrief">Brief para IA</label>
            <textarea id="aiBrief" rows="3" placeholder="Ej: cierre de alianzas en PBA, impacto en intendentes del conurbano y lectura nacional para 2026."></textarea>
          </div>
          <div class="ai-actions">
            <button type="button" id="aiGenerateBtn" class="primary ai-main-action">⚡ Genera con IA</button>
          </div>
          <details class="ai-advanced">
            <summary>Herramientas IA avanzadas</summary>
            <div class="ai-actions">
              <button type="button" id="aiAskBtn">💬 Preguntar IA</button>
              <button type="button" id="aiReviewBtn">🛡️ Validar borrador</button>
              <button type="button" id="aiApplyBtn">✅ Aplicar sugerencias</button>
            </div>
            <label class="ai-inline" style="font-size:12px; color:#bfbfbf;">
              <input type="checkbox" id="aiAskAutoApply" />
              Si la respuesta incluye draft, autocompletar formulario.
            </label>
          </details>
          <div id="aiStatus" class="ai-status">Completa un brief y usa "Genera con IA".</div>
          <div id="aiAnswer" class="ai-chat-answer" style="display:none;"></div>
          <div id="aiReview" class="ai-review" style="display:none;"></div>
          <p class="muted">La validacion final sigue siendo obligatoria al guardar. Si la IA marca REJECT, el guardado se bloquea.</p>
        </div>
        <form id="news-form" method="post" action="${action}">
          <div class="cms-layout">
            <section class="editor-stack">
              <div class="editor-card">
                <div class="field"><label for="title">Titulo</label><input id="title" name="title" required minlength="8" value="${getValue(data?.title)}" /></div>
                <div class="cols-2">
                  <div class="field"><label for="slug">Slug</label><input id="slug" name="slug" placeholder="auto-si-vacio" value="${getValue(data?.slug)}" /></div>
                  <div class="field"><label for="kicker">Volanta</label><input id="kicker" name="kicker" value="${getValue(data?.kicker)}" /></div>
                </div>
                <div class="field"><label for="excerpt">Bajada</label><textarea id="excerpt" name="excerpt" rows="3">${getValue(data?.excerpt)}</textarea></div>
              </div>

              <div class="editor-card">
                <div class="split-title"><h3>Editor de Cuerpo</h3><span class="mini-tag">WYSIWYG</span></div>
                <div class="editor-toolbar" id="editorToolbar">
                  <button type="button" data-editor-cmd="bold"><strong>B</strong></button>
                  <button type="button" data-editor-cmd="italic"><em>I</em></button>
                  <button type="button" data-editor-cmd="formatBlock" data-editor-value="h2">H2</button>
                  <button type="button" data-editor-cmd="formatBlock" data-editor-value="h3">H3</button>
                  <button type="button" data-editor-cmd="insertUnorderedList">Lista</button>
                  <button type="button" data-editor-cmd="insertOrderedList">Nro</button>
                  <button type="button" data-editor-cmd="formatBlock" data-editor-value="blockquote">Cita</button>
                  <button type="button" data-editor-wrap="code">Codigo</button>
                  <button type="button" data-editor-wrap="pre">Bloque</button>
                  <button type="button" id="editorLinkBtn">Link</button>
                  <button type="button" id="editorImageBtn">Imagen</button>
                  <button type="button" data-editor-cmd="removeFormat">Limpiar</button>
                </div>
                <div id="bodyEditor" class="editor-surface" contenteditable="true" spellcheck="true"></div>
                <textarea id="body" name="body" class="editor-hidden">${getValue(data?.body)}</textarea>
                <div class="editor-metrics">
                  <span id="bodyWords">0 palabras</span>
                  <span id="bodyRead">0 min lectura</span>
                </div>
              </div>
            </section>

            <aside class="editor-stack">
              <div class="editor-card">
                <div class="cols-2">
                  <div class="field"><label for="section">Seccion</label><select id="section" name="section">${sectionOptions}</select></div>
                  <div class="field"><label for="province">Distrito</label><select id="province" name="province">${provinceOptions}</select></div>
                </div>
                <div class="cols-2">
                  <div class="field"><label for="status">Estado</label><select id="status" name="status">${statusOptions}</select></div>
                  <div class="field"><label for="publishedAt">Publicar en</label><input id="publishedAt" type="datetime-local" name="publishedAt" value="${getValue(isoLocalDate(data?.publishedAt ? new Date(data.publishedAt) : null))}" /></div>
                </div>
                <div class="field"><label for="tags">Tags (separados por coma)</label><input id="tags" name="tags" value="${getValue(tags)}" /></div>
              </div>

              <div class="editor-card">
                <div class="field"><label for="imageUrl">URL de imagen</label><input id="imageUrl" name="imageUrl" type="url" value="${getValue(data?.imageUrl)}" /></div>
                <div id="imagePreview" class="editor-preview">Sin imagen cargada</div>
                <div class="field"><label for="authorName">Autor</label><input id="authorName" name="authorName" value="${getValue(data?.authorName)}" /></div>
                <div class="field"><label for="sourceName">Fuente</label><input id="sourceName" name="sourceName" value="${getValue(data?.sourceName)}" /></div>
                <div class="field"><label for="sourceUrl">URL fuente</label><input id="sourceUrl" name="sourceUrl" type="url" value="${getValue(data?.sourceUrl)}" /></div>
              </div>

              <div class="editor-card">
                <div class="checks">
                  <label><input type="checkbox" name="isHero" ${bool(data?.isHero)} /> En hero principal</label>
                  <label><input type="checkbox" name="isFeatured" ${bool(data?.isFeatured)} /> Nota destacada</label>
                  <label><input type="checkbox" name="isSponsored" ${bool(data?.isSponsored)} /> Patrocinada</label>
                  <label><input type="checkbox" name="isInterview" ${bool(data?.isInterview)} /> Entrevistas</label>
                  <label><input type="checkbox" name="isOpinion" ${bool(data?.isOpinion)} /> Opinion</label>
                  <label><input type="checkbox" name="isRadar" ${bool(data?.isRadar)} /> Radar Electoral</label>
                </div>
                <div class="actions">
                  <button class="primary" type="submit">${mode === "create" ? "Crear noticia" : "Guardar cambios"}</button>
                  <a class="button" href="/backoffice">Volver</a>
                </div>
              </div>
            </aside>
          </div>
        </form>
        <script>
          (function () {
            const form = document.getElementById("news-form");
            const briefEl = document.getElementById("aiBrief");
            const generateBtn = document.getElementById("aiGenerateBtn");
            const askBtn = document.getElementById("aiAskBtn");
            const reviewBtn = document.getElementById("aiReviewBtn");
            const applyBtn = document.getElementById("aiApplyBtn");
            const askAutoApply = document.getElementById("aiAskAutoApply");
            const statusEl = document.getElementById("aiStatus");
            const connBadge = document.getElementById("aiConnBadge");
            const answerEl = document.getElementById("aiAnswer");
            const reviewEl = document.getElementById("aiReview");
            const bodyEditor = document.getElementById("bodyEditor");
            const toolbar = document.getElementById("editorToolbar");
            const imagePreview = document.getElementById("imagePreview");
            let lastSuggestions = null;
            let canApply = false;

            if (!form || !briefEl || !generateBtn || !askBtn || !reviewBtn || !applyBtn || !statusEl || !answerEl || !reviewEl || !bodyEditor || !toolbar || !imagePreview || !connBadge) {
              return;
            }

            const buttons = {
              generate: generateBtn,
              ask: askBtn,
              review: reviewBtn,
              apply: applyBtn,
            };

            function notify(message, level) {
              if (typeof window.pulsoToast === "function") {
                window.pulsoToast(message, level || "");
              }
            }

            function setStatus(message, level) {
              statusEl.textContent = message;
              statusEl.className = "ai-status " + level;
            }

            function field(name) {
              return form.querySelector('[name="' + name + '"]');
            }

            function decodeHtml(input) {
              const area = document.createElement("textarea");
              area.innerHTML = String(input || "");
              return area.value;
            }

            function syncBody() {
              const bodyInput = field("body");
              if (!bodyInput || typeof bodyInput.value !== "string") {
                return;
              }
              bodyInput.value = bodyEditor.innerHTML.trim();
              updateMetrics();
            }

            function value(name) {
              const el = field(name);
              if (!el || typeof el.value !== "string") {
                return "";
              }
              return el.value.trim();
            }

            function checked(name) {
              const el = field(name);
              return Boolean(el && "checked" in el && el.checked);
            }

            function setFieldValue(name, nextValue) {
              const el = field(name);
              if (!el || typeof el.value !== "string") {
                return;
              }
              el.value = nextValue ?? "";
            }

            function setSelectValue(name, nextValue) {
              if (!nextValue) {
                return;
              }
              const el = field(name);
              if (!el || el.tagName !== "SELECT") {
                return;
              }
              const option = el.querySelector('option[value="' + nextValue + '"]');
              if (option) {
                el.value = nextValue;
              }
            }

            function setCheckboxValue(name, nextValue) {
              const el = field(name);
              if (!el || !("checked" in el)) {
                return;
              }
              el.checked = Boolean(nextValue);
            }

            function toLocalDatetime(input) {
              if (!input) return "";
              const parsed = new Date(input);
              if (Number.isNaN(parsed.getTime())) return "";
              const offset = parsed.getTimezoneOffset();
              const local = new Date(parsed.getTime() - offset * 60000);
              return local.toISOString().slice(0, 16);
            }

            function updateImagePreview() {
              const imageUrl = value("imageUrl");
              if (!imageUrl) {
                imagePreview.classList.remove("has-image");
                imagePreview.innerHTML = "Sin imagen cargada";
                return;
              }
              imagePreview.classList.add("has-image");
              const imageEl = document.createElement("img");
              imageEl.alt = "Preview";
              imageEl.loading = "lazy";
              imageEl.src = imageUrl;
              imageEl.addEventListener("error", function () {
                imagePreview.classList.remove("has-image");
                imagePreview.textContent = "No se pudo cargar la imagen.";
              });
              imagePreview.innerHTML = "";
              imagePreview.appendChild(imageEl);
            }

            function updateMetrics() {
              const wordsEl = document.getElementById("bodyWords");
              const readEl = document.getElementById("bodyRead");
              if (!wordsEl || !readEl) {
                return;
              }
              const text = (bodyEditor.textContent || "").trim();
              const words = text.length === 0 ? 0 : text.split(/\\s+/).length;
              const reading = words === 0 ? 0 : Math.max(1, Math.round(words / 220));
              wordsEl.textContent = words + " palabras";
              readEl.textContent = reading + " min lectura";
            }

            function applySuggestion(suggestion) {
              if (!suggestion || typeof suggestion !== "object") {
                return;
              }
              if (suggestion.title) setFieldValue("title", suggestion.title);
              if (suggestion.kicker) setFieldValue("kicker", suggestion.kicker);
              if (suggestion.excerpt) setFieldValue("excerpt", suggestion.excerpt);
              if (suggestion.body) {
                bodyEditor.innerHTML = String(suggestion.body);
                setFieldValue("body", String(suggestion.body));
              }
              if (suggestion.imageUrl) setFieldValue("imageUrl", suggestion.imageUrl);
              if (suggestion.sourceName) setFieldValue("sourceName", suggestion.sourceName);
              if (suggestion.sourceUrl) setFieldValue("sourceUrl", suggestion.sourceUrl);
              if (suggestion.authorName) setFieldValue("authorName", suggestion.authorName);
              if (Array.isArray(suggestion.tags) && suggestion.tags.length > 0) {
                setFieldValue("tags", suggestion.tags.join(", "));
              }
              if (suggestion.section) setSelectValue("section", suggestion.section);
              if (suggestion.province) setSelectValue("province", suggestion.province);
              if (suggestion.status) setSelectValue("status", suggestion.status);
              if (suggestion.publishedAt) setFieldValue("publishedAt", toLocalDatetime(suggestion.publishedAt));
              if (suggestion.flags && typeof suggestion.flags === "object") {
                setCheckboxValue("isHero", suggestion.flags.isHero);
                setCheckboxValue("isFeatured", suggestion.flags.isFeatured);
                setCheckboxValue("isSponsored", suggestion.flags.isSponsored);
                setCheckboxValue("isInterview", suggestion.flags.isInterview);
                setCheckboxValue("isOpinion", suggestion.flags.isOpinion);
                setCheckboxValue("isRadar", suggestion.flags.isRadar);
              }
              if (suggestion.publishNowRecommended) {
                setSelectValue("status", "PUBLISHED");
              }
              updateImagePreview();
              updateMetrics();
            }

            function escapeHtml(text) {
              return String(text)
                .replaceAll("&", "&amp;")
                .replaceAll("<", "&lt;")
                .replaceAll(">", "&gt;")
                .replaceAll('"', "&quot;")
                .replaceAll("'", "&#039;");
            }

            function setCanApply(enabled) {
              canApply = Boolean(enabled);
              applyBtn.disabled = !canApply;
              if (!enabled) {
                applyBtn.classList.remove("is-running");
              }
            }

            function setBusy(isBusy, label, actionKey) {
              Object.keys(buttons).forEach(function (key) {
                const button = buttons[key];
                const shouldDisable = isBusy ? key !== actionKey : (key === "apply" ? !canApply : false);
                button.disabled = shouldDisable;
                button.classList.toggle("is-running", Boolean(isBusy && key === actionKey));
              });
              if (isBusy && label) {
                setStatus(label, "warn");
                notify(label, "warn");
              }
            }

            function plainTextFromHtml(input) {
              const holder = document.createElement("div");
              holder.innerHTML = String(input || "");
              return (holder.textContent || holder.innerText || "").replace(/\s+/g, " ").trim();
            }

            function ensureDraftCompleteness(brief) {
              const safeBrief = String(brief || "").trim();
              if (!value("title")) {
                const fallbackTitle = safeBrief.slice(0, 110) || "Actualizacion politica en desarrollo";
                setFieldValue("title", fallbackTitle);
              }
              if (!value("slug")) {
                setFieldValue("slug", slugify(value("title")));
              }
              if (!value("body")) {
                const fallbackBody = "<p>" + escapeHtml(safeBrief || "Completar desarrollo editorial.") + "</p>";
                bodyEditor.innerHTML = fallbackBody;
                setFieldValue("body", fallbackBody);
              }
              if (!value("excerpt")) {
                const bodyText = plainTextFromHtml(value("body"));
                setFieldValue("excerpt", bodyText.slice(0, 220));
              }
              if (!value("authorName")) {
                setFieldValue("authorName", "Redaccion Pulso Pais");
              }
              updateMetrics();
            }

            function slugify(value) {
              return String(value || "")
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "")
                .slice(0, 120);
            }

            async function readJson(response) {
              const contentType = response.headers.get("content-type") || "";
              if (contentType.includes("application/json")) {
                return response.json();
              }
              const rawText = await response.text();
              return { error: rawText || "Respuesta invalida del servidor." };
            }

            function contextHint(context) {
              if (!context || typeof context !== "object") {
                return "";
              }
              const internal = Number(context.internalCount ?? 0);
              const external = Number(context.externalCount ?? 0);
              const lines = Number(context.linesUsed ?? 0);
              if (!internal && !external && !lines) {
                return "";
              }
              return " | Wrapper: " + internal + " internas + " + external + " externas (" + lines + " lineas)";
            }

            async function checkAiHealth() {
              try {
                const response = await fetch("/backoffice/ai/health", {
                  headers: {
                    accept: "application/json",
                  },
                });
                const payload = await readJson(response);
                if (!response.ok) {
                  throw new Error(payload.error || "No se pudo consultar estado de IA.");
                }
                const health = payload.health || {};
                const connected = Boolean(health.enabled && health.aiReachable && health.guidelinesLoaded);
                const provider = health.primaryProvider ? String(health.primaryProvider).toUpperCase() : "IA";
                if (connected) {
                  connBadge.textContent = provider + " activa";
                  connBadge.style.borderColor = "#2d5f45";
                  connBadge.style.color = "#b6f3ca";
                  connBadge.style.background = "#122318";
                  const fallbackNote =
                    health.primaryProvider === "gemini" && health.geminiReachable === false && health.ollamaReachable
                      ? " Fallback: Ollama."
                      : "";
                  setStatus("IA lista (" + (health.model || "modelo") + ")." + fallbackNote, "ok");
                } else {
                  connBadge.textContent = "IA con alertas";
                  connBadge.style.borderColor = "#70591f";
                  connBadge.style.color = "#f5dd96";
                  connBadge.style.background = "#221b0d";
                  const reason = health.error ? " Detalle: " + health.error : "";
                  setStatus("IA no esta plenamente operativa." + reason, "warn");
                }
              } catch (error) {
                connBadge.textContent = "IA sin conexion";
                connBadge.style.borderColor = "#7b2f2f";
                connBadge.style.color = "#ffc4c4";
                connBadge.style.background = "#2c1313";
                setStatus(error instanceof Error ? error.message : "No se pudo verificar la conexion IA.", "error");
              }
            }

            function buildAssistPayload(brief) {
              syncBody();
              return {
                brief: brief,
                sectionHint: value("section"),
                provinceHint: value("province"),
                isSponsored: checked("isSponsored"),
                currentTitle: value("title"),
                currentKicker: value("kicker"),
                currentExcerpt: value("excerpt"),
                currentBody: value("body"),
                currentImageUrl: value("imageUrl"),
                currentSourceName: value("sourceName"),
                currentSourceUrl: value("sourceUrl"),
                currentAuthorName: value("authorName"),
                currentStatus: value("status"),
                currentPublishedAt: value("publishedAt"),
                currentSection: value("section"),
                currentProvince: value("province"),
                currentTags: value("tags"),
                isHero: checked("isHero"),
                isFeatured: checked("isFeatured"),
                isInterview: checked("isInterview"),
                isOpinion: checked("isOpinion"),
                isRadar: checked("isRadar"),
              };
            }

            function wrapSelection(type) {
              const selection = window.getSelection();
              if (!selection) {
                return;
              }
              const selectedText = selection.toString().trim();
              const safeText = escapeHtml(selectedText || (type === "pre" ? "Bloque de codigo" : "codigo"));
              if (type === "code") {
                document.execCommand("insertHTML", false, "<code>" + safeText + "</code>");
                return;
              }
              if (type === "pre") {
                document.execCommand("insertHTML", false, "<pre><code>" + safeText + "</code></pre><p></p>");
              }
            }

            toolbar.addEventListener("click", function (event) {
              const target = event.target && event.target.closest ? event.target.closest("button") : null;
              if (!target) {
                return;
              }
              bodyEditor.focus();
              const cmd = target.getAttribute("data-editor-cmd");
              const cmdValue = target.getAttribute("data-editor-value");
              const wrap = target.getAttribute("data-editor-wrap");
              if (cmd) {
                document.execCommand(cmd, false, cmdValue || undefined);
                syncBody();
                return;
              }
              if (wrap) {
                wrapSelection(wrap);
                syncBody();
              }
            });

            const linkBtn = document.getElementById("editorLinkBtn");
            if (linkBtn) {
              linkBtn.addEventListener("click", function () {
                bodyEditor.focus();
                const url = window.prompt("URL del enlace:");
                if (!url) {
                  return;
                }
                const trimmed = url.trim();
                if (!trimmed) {
                  return;
                }
                const selection = window.getSelection();
                if (selection && selection.toString().trim()) {
                  document.execCommand("createLink", false, trimmed);
                } else {
                  const safe = escapeHtml(trimmed);
                  document.execCommand("insertHTML", false, '<a href="' + safe + '" target="_blank" rel="noopener noreferrer">' + safe + "</a>");
                }
                syncBody();
              });
            }

            const editorImageBtn = document.getElementById("editorImageBtn");
            if (editorImageBtn) {
              editorImageBtn.addEventListener("click", function () {
                bodyEditor.focus();
                const url = window.prompt("URL de la imagen:");
                if (!url) {
                  return;
                }
                const trimmed = url.trim();
                if (!trimmed) {
                  return;
                }
                const safeUrl = escapeHtml(trimmed);
                document.execCommand(
                  "insertHTML",
                  false,
                  '<figure><img src="' + safeUrl + '" alt="Imagen de la nota" loading="lazy" /></figure><p></p>',
                );
                if (!value("imageUrl")) {
                  setFieldValue("imageUrl", trimmed);
                  updateImagePreview();
                }
                syncBody();
              });
            }

            const titleInput = field("title");
            const slugInput = field("slug");
            let slugManuallyEdited = value("slug").length > 0;
            if (slugInput) {
              slugInput.addEventListener("input", function () {
                slugManuallyEdited = slugInput.value.trim().length > 0;
              });
            }
            if (titleInput) {
              titleInput.addEventListener("input", function () {
                if (slugManuallyEdited) {
                  return;
                }
                setFieldValue("slug", slugify(titleInput.value));
              });
            }

            generateBtn.addEventListener("click", async function () {
              const brief = briefEl.value.trim();
              if (brief.length < 12) {
                setStatus("El brief debe tener al menos 12 caracteres.", "error");
                notify("Escribe un brief mas completo para generar con IA.", "error");
                return;
              }

              try {
                setBusy(true, "Solicitud recibida: generando borrador con IA...", "generate");
                const payload = buildAssistPayload(brief);
                const response = await fetch("/backoffice/ai/assist", {
                  method: "POST",
                  headers: {
                    "content-type": "application/json",
                    accept: "application/json",
                  },
                  body: JSON.stringify(payload),
                });
                const result = await readJson(response);
                if (!response.ok) {
                  throw new Error(result.error || "No se pudo generar el borrador.");
                }

                const suggestion = result.suggestion || {};
                lastSuggestions = suggestion;
                applySuggestion(suggestion);
                ensureDraftCompleteness(brief);
                setCanApply(Boolean(suggestion && typeof suggestion === "object"));

                const noteText = Array.isArray(suggestion.notes) && suggestion.notes.length > 0
                  ? " | " + suggestion.notes[0]
                  : "";
                answerEl.style.display = "none";
                setStatus(
                  "Borrador IA aplicado (" + (suggestion.model || "modelo desconocido") + ")" + noteText + contextHint(result.context),
                  "ok",
                );
                notify("Formulario autocompletado por IA.", "ok");
              } catch (error) {
                setStatus(error instanceof Error ? error.message : "Error al generar borrador IA.", "error");
                notify("Fallo la generacion IA. Revisa estado y reintenta.", "error");
              } finally {
                setBusy(false);
              }
            });

            askBtn.addEventListener("click", async function () {
              const brief = briefEl.value.trim();
              if (brief.length < 12) {
                setStatus("Escribe una consulta de al menos 12 caracteres para la IA.", "error");
                notify("La consulta es demasiado corta.", "error");
                return;
              }

              try {
                setBusy(true, "Consultando IA editorial...", "ask");
                const payload = buildAssistPayload(brief);
                const response = await fetch("/backoffice/ai/ask", {
                  method: "POST",
                  headers: {
                    "content-type": "application/json",
                    accept: "application/json",
                  },
                  body: JSON.stringify(payload),
                });
                const result = await readJson(response);
                if (!response.ok) {
                  throw new Error(result.error || "No se pudo completar la consulta IA.");
                }

                const answerPayload = result.answer || {};
                const answerText =
                  answerPayload && typeof answerPayload.answer === "string" && answerPayload.answer.trim().length > 0
                    ? answerPayload.answer.trim()
                    : "Sin respuesta textual del asistente.";

                answerEl.textContent = answerText;
                answerEl.style.display = "block";

                const draft = answerPayload && answerPayload.draft && typeof answerPayload.draft === "object"
                  ? answerPayload.draft
                  : null;
                if (draft) {
                  lastSuggestions = draft;
                  setCanApply(true);
                  const autoApply = Boolean(askAutoApply && "checked" in askAutoApply && askAutoApply.checked);
                  if (autoApply || Boolean(answerPayload.shouldApplyDraft)) {
                    applySuggestion(draft);
                    ensureDraftCompleteness(brief);
                    setStatus("Consulta resuelta y draft aplicado automaticamente." + contextHint(result.context), "ok");
                    notify("Respuesta IA aplicada al formulario.", "ok");
                  } else {
                    setStatus("Consulta resuelta. Hay un draft disponible para aplicar." + contextHint(result.context), "ok");
                    notify("La IA devolvio un draft listo para aplicar.", "ok");
                  }
                } else {
                  setCanApply(Boolean(lastSuggestions));
                  setStatus("Consulta resuelta por IA." + contextHint(result.context), "ok");
                  notify("Consulta IA respondida.", "ok");
                }
              } catch (error) {
                setStatus(error instanceof Error ? error.message : "Error al consultar la IA.", "error");
                notify("No se pudo completar la consulta IA.", "error");
              } finally {
                setBusy(false);
              }
            });

            reviewBtn.addEventListener("click", async function () {
              try {
                syncBody();
                const payload = Object.fromEntries(new FormData(form).entries());
                payload.isHero = checked("isHero");
                payload.isFeatured = checked("isFeatured");
                payload.isSponsored = checked("isSponsored");
                payload.isInterview = checked("isInterview");
                payload.isOpinion = checked("isOpinion");
                payload.isRadar = checked("isRadar");
                setBusy(true, "Validando borrador contra la linea editorial...", "review");
                const response = await fetch("/backoffice/ai/review", {
                  method: "POST",
                  headers: {
                    "content-type": "application/json",
                    accept: "application/json",
                  },
                  body: JSON.stringify(payload),
                });
                const result = await readJson(response);
                if (!response.ok) {
                  throw new Error(result.error || "No se pudo evaluar el borrador.");
                }

                const review = result.review || {};
                lastSuggestions = result.suggestions || null;
                setCanApply(Boolean(lastSuggestions));

                const warnings = Array.isArray(review.warnings) && review.warnings.length > 0
                  ? review.warnings.map(function (item) { return "<li>" + escapeHtml(item) + "</li>"; }).join("")
                  : "<li>Sin alertas</li>";

                reviewEl.innerHTML = ""
                  + "<strong>Decision IA: " + escapeHtml(review.decision || "REVIEW") + "</strong>"
                  + "<p>" + escapeHtml(review.reason || "Sin razon informada.") + "</p>"
                  + "<p>Puntaje: " + escapeHtml(String(review.score ?? "-")) + " | Modelo: " + escapeHtml(review.model || "-") + "</p>"
                  + "<ul style='margin:0 0 0 18px; padding:0; display:grid; gap:4px;'>" + warnings + "</ul>";
                reviewEl.style.display = "grid";

                const level = (review.decision || "REVIEW") === "ALLOW" ? "ok" : (review.decision === "REJECT" ? "error" : "warn");
                setStatus("Evaluacion completada: " + (review.decision || "REVIEW") + contextHint(result.context), level);
                notify("Revision IA completada: " + (review.decision || "REVIEW"), level);
              } catch (error) {
                setStatus(error instanceof Error ? error.message : "Error en evaluacion IA.", "error");
                notify("No se pudo evaluar el borrador.", "error");
              } finally {
                setBusy(false);
              }
            });

            applyBtn.addEventListener("click", function () {
              if (!lastSuggestions) {
                setStatus("Primero ejecuta 'Evaluar borrador actual' para recibir sugerencias.", "warn");
                notify("No hay sugerencias para aplicar todavia.", "warn");
                return;
              }
              applyBtn.classList.add("is-running");
              applySuggestion(lastSuggestions);
              ensureDraftCompleteness(briefEl.value.trim());
              window.setTimeout(function () {
                applyBtn.classList.remove("is-running");
              }, 350);
              setStatus("Sugerencias de evaluacion aplicadas al formulario.", "ok");
              notify("Sugerencias aplicadas al formulario.", "ok");
            });

            form.addEventListener("submit", function () {
              syncBody();
              notify("Solicitud recibida. Guardando noticia...", "warn");
            });
            form.addEventListener("invalid", function () {
              notify("Faltan campos obligatorios antes de guardar.", "error");
            }, true);
            bodyEditor.addEventListener("input", syncBody);
            bodyEditor.addEventListener("blur", syncBody);

            const imageInput = field("imageUrl");
            if (imageInput) {
              imageInput.addEventListener("input", updateImagePreview);
            }

            const initialBody = value("body");
            if (initialBody) {
              bodyEditor.innerHTML = decodeHtml(initialBody);
            } else {
              bodyEditor.innerHTML = "<p></p>";
            }
            updateImagePreview();
            syncBody();
            setCanApply(false);
            checkAiHealth();
          })();
        </script>
      </div>
    </div>`,
  );
}

export type BackofficePollListItem = {
  id: string;
  title: string;
  slug: string;
  publicUrl: string;
  question: string;
  status: PollStatus;
  isFeatured: boolean;
  publishedAt: Date | null;
  updatedAt: Date;
  totalVotes: number;
  leaderLabel: string | null;
};

export type BackofficeUserListItem = {
  id: string;
  email: string;
  displayName: string | null;
  plan: UserPlan;
  isActive: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
  activeSessions: number;
};

export function renderUsersTable(items: BackofficeUserListItem[]): string {
  const rows = items
    .map((item) => {
      const createdAt = new Date(item.createdAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
      const lastLoginAt = item.lastLoginAt
        ? new Date(item.lastLoginAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
        : "-";
      const searchIndex = escapeHtml(`${item.email} ${item.displayName ?? ""} ${item.plan}`.toLowerCase());

      return `<tr data-user-row data-plan="${item.plan}" data-search="${searchIndex}">
        <td>
          <div class="title">${escapeHtml(item.email)}</div>
          <div class="meta">
            ${item.displayName ? `<span class="pill">${escapeHtml(item.displayName)}</span>` : ""}
            <span class="pill ${item.isActive ? "live" : "draft"}">${item.isActive ? "Activo" : "Inactivo"}</span>
          </div>
        </td>
        <td>${escapeHtml(item.plan)}</td>
        <td>${escapeHtml(String(item.activeSessions))}</td>
        <td>${escapeHtml(createdAt)}</td>
        <td>${escapeHtml(lastLoginAt)}</td>
        <td>
          <form method="post" action="/backoffice/users/${item.id}/plan" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <select name="plan" style="max-width:130px;">
              <option value="FREE" ${item.plan === UserPlan.FREE ? "selected" : ""}>FREE</option>
              <option value="PREMIUM" ${item.plan === UserPlan.PREMIUM ? "selected" : ""}>PREMIUM</option>
            </select>
            <button type="submit">Actualizar plan</button>
          </form>
        </td>
      </tr>`;
    })
    .join("\n");

  return `<div class="card">
    <div class="split-title" style="margin-bottom:10px;">
      <h3>Usuarios registrados</h3>
      <a class="button primary" href="/backoffice/users/new">Nuevo usuario</a>
    </div>
    <div class="table-tools">
      <input id="userFilterInput" placeholder="Buscar por email o nombre..." />
      <select id="userPlanFilter">
        <option value="">Todos los planes</option>
        <option value="FREE">FREE</option>
        <option value="PREMIUM">PREMIUM</option>
      </select>
      <span class="table-count" id="userRowCount">${items.length} items</span>
    </div>
    <table class="news-table">
      <thead>
        <tr>
          <th>Usuario</th>
          <th>Plan</th>
          <th>Sesiones</th>
          <th>Alta</th>
          <th>Ultimo login</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="6"><div class="muted">No hay usuarios registrados todavia.</div></td></tr>`}</tbody>
    </table>
    <script>
      (function () {
        const rows = Array.from(document.querySelectorAll("[data-user-row]"));
        const input = document.getElementById("userFilterInput");
        const planFilter = document.getElementById("userPlanFilter");
        const count = document.getElementById("userRowCount");
        if (!rows.length || !input || !planFilter || !count) {
          return;
        }

        function refresh() {
          const query = (input.value || "").toLowerCase().trim();
          const plan = planFilter.value || "";
          let visible = 0;
          rows.forEach(function (row) {
            const rowQuery = (row.getAttribute("data-search") || "").toLowerCase();
            const rowPlan = row.getAttribute("data-plan") || "";
            const matchQuery = !query || rowQuery.includes(query);
            const matchPlan = !plan || plan === rowPlan;
            const show = matchQuery && matchPlan;
            row.style.display = show ? "" : "none";
            if (show) {
              visible += 1;
            }
          });
          count.textContent = visible + " items visibles";
        }

        input.addEventListener("input", refresh);
        planFilter.addEventListener("change", refresh);
      })();
    </script>
  </div>`;
}

export function renderUserForm(params: { action: string; error?: string; data?: Partial<{ email: string; displayName: string; plan: UserPlan }> }): string {
  const { action, error, data } = params;
  const selectedPlan = data?.plan ?? UserPlan.FREE;
  const emailValue = data?.email ? escapeHtml(data.email) : "";
  const displayNameValue = data?.displayName ? escapeHtml(data.displayName) : "";

  return backofficeShell(
    "Nuevo usuario",
    `<div class="grid">
      <div class="card">
        <div class="split-title" style="margin-bottom:8px;">
          <h3>Alta de usuario</h3>
          <span class="mini-tag">Planes FREE / PREMIUM</span>
        </div>
        <p class="muted" style="margin-bottom:14px;">Todo usuario nuevo se crea por defecto como <strong>FREE</strong>. Luego puedes cambiar a <strong>PREMIUM</strong> desde el listado.</p>
        ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
        <form method="post" action="${escapeHtml(action)}">
          <div class="cols-2">
            <div class="field">
              <label>Email</label>
              <input type="email" name="email" required value="${emailValue}" placeholder="usuario@dominio.com" />
            </div>
            <div class="field">
              <label>Nombre visible</label>
              <input type="text" name="displayName" value="${displayNameValue}" placeholder="Nombre opcional" />
            </div>
          </div>
          <div class="cols-2">
            <div class="field">
              <label>Password inicial</label>
              <input type="password" name="password" required minlength="8" maxlength="120" placeholder="Minimo 8 caracteres" />
            </div>
            <div class="field">
              <label>Plan inicial</label>
              <select name="plan">
                <option value="FREE" ${selectedPlan === UserPlan.FREE ? "selected" : ""}>FREE (default)</option>
                <option value="PREMIUM" ${selectedPlan === UserPlan.PREMIUM ? "selected" : ""}>PREMIUM</option>
              </select>
            </div>
          </div>
          <div class="actions">
            <button class="primary" type="submit">Crear usuario</button>
            <a class="button" href="/backoffice/users">Volver</a>
          </div>
        </form>
      </div>
    </div>`,
  );
}

export function renderPollTable(items: BackofficePollListItem[]): string {
  if (items.length === 0) {
    return `<div class="card"><p>No hay encuestas creadas. Usa "Nueva Encuesta" para publicar la primera.</p></div>`;
  }

  const rows = items
    .map((item) => {
      const published = item.publishedAt
        ? new Date(item.publishedAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
        : "-";
      const updated = new Date(item.updatedAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
      const searchIndex = escapeHtml(`${item.title} ${item.slug} ${item.question} ${item.status}`.toLowerCase());
      const statusClass = item.status === PollStatus.PUBLISHED ? "live" : "draft";
      const leader = item.leaderLabel ? escapeHtml(item.leaderLabel) : "-";

      return `<tr data-poll-row data-status="${item.status}" data-search="${searchIndex}">
        <td>
          <div class="title">${escapeHtml(item.title)}</div>
          <div class="meta">
            <span class="pill ${statusClass}">${item.status}</span>
            ${item.isFeatured ? `<span class="pill gold">Destacada</span>` : ""}
          </div>
        </td>
        <td>${escapeHtml(item.slug)}</td>
        <td>${escapeHtml(String(item.totalVotes))}</td>
        <td>${leader}</td>
        <td>${escapeHtml(published)}</td>
        <td>${escapeHtml(updated)}</td>
        <td>
          <div class="inline-actions">
            <a class="button" href="/backoffice/polls/${item.id}/edit">Editar</a>
            <a class="button" target="_blank" rel="noreferrer" href="${escapeHtml(item.publicUrl)}">Abrir</a>
            <form method="post" action="/backoffice/polls/${item.id}/bootstrap-hardcoded" onsubmit="return confirm('Esto reemplaza los votos actuales por la base hardcodeada. Continuar?');">
              <button type="submit">Cargar base</button>
            </form>
            <form method="post" action="/backoffice/polls/${item.id}/delete" onsubmit="return confirm('Eliminar encuesta? Esta accion no se puede deshacer.');">
              <button class="danger" type="submit">Eliminar</button>
            </form>
          </div>
        </td>
      </tr>`;
    })
    .join("\n");

  return `<div class="card">
    <div class="split-title" style="margin-bottom:10px;">
      <h3>Encuestas y metricas</h3>
      <a class="button primary" href="/backoffice/polls/new">Nueva Encuesta</a>
    </div>
    <div class="table-tools">
      <input id="pollFilterInput" placeholder="Buscar por titulo, slug o pregunta..." />
      <select id="pollStatusFilter">
        <option value="">Todos los estados</option>
        <option value="PUBLISHED">Publicadas</option>
        <option value="DRAFT">Draft</option>
      </select>
      <span class="table-count" id="pollRowCount">${items.length} items</span>
    </div>
    <table class="news-table">
      <thead>
        <tr>
          <th>Titulo</th>
          <th>Slug</th>
          <th>Votos</th>
          <th>Lider</th>
          <th>Publicada</th>
          <th>Actualizada</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <script>
      (function () {
        const rows = Array.from(document.querySelectorAll("[data-poll-row]"));
        const input = document.getElementById("pollFilterInput");
        const statusFilter = document.getElementById("pollStatusFilter");
        const count = document.getElementById("pollRowCount");
        if (!rows.length || !input || !statusFilter || !count) {
          return;
        }

        function refresh() {
          const query = (input.value || "").toLowerCase().trim();
          const status = statusFilter.value || "";
          let visible = 0;
          rows.forEach(function (row) {
            const rowQuery = (row.getAttribute("data-search") || "").toLowerCase();
            const rowStatus = row.getAttribute("data-status") || "";
            const matchQuery = !query || rowQuery.includes(query);
            const matchStatus = !status || status === rowStatus;
            const show = matchQuery && matchStatus;
            row.style.display = show ? "" : "none";
            if (show) {
              visible += 1;
            }
          });
          count.textContent = visible + " items visibles";
        }

        input.addEventListener("input", refresh);
        statusFilter.addEventListener("change", refresh);
      })();
    </script>
  </div>`;
}

export function renderPollForm(params: {
  mode: "create" | "edit";
  action: string;
  data?: Partial<Poll>;
  candidates: ReadonlyArray<{ label: string; colorHex: string; emoji: string }>;
  publicUrl?: string | null;
  totalVotes?: number;
  leaderLabel?: string | null;
  error?: string;
}): string {
  const { mode, action, data, candidates, publicUrl, totalVotes = 0, leaderLabel = null, error } = params;
  const getValue = (value: unknown): string => {
    if (value === null || value === undefined) {
      return "";
    }
    return escapeHtml(String(value));
  };

  const status = data?.status ?? PollStatus.DRAFT;
  const statusOptions = [PollStatus.DRAFT, PollStatus.PUBLISHED]
    .map((option) => `<option value="${option}" ${status === option ? "selected" : ""}>${option}</option>`)
    .join("");

  const candidateRows = candidates
    .map(
      (candidate, index) => `<article style="border:1px solid #2a2a2a; border-radius:10px; background:#111111; padding:10px; display:flex; align-items:center; gap:10px;">
        <span style="display:inline-grid; place-items:center; width:24px; height:24px; border-radius:999px; background:${escapeHtml(candidate.colorHex)}; color:#111; font-weight:700; font-size:11px;">${index + 1}</span>
        <span style="display:inline-grid; place-items:center; width:28px; height:28px; border-radius:8px; border:1px solid #2f2f2f; background:#161616; font-size:13px;">${escapeHtml(candidate.emoji)}</span>
        <div style="display:grid; gap:2px;">
          <strong style="font-size:14px; line-height:1.2;">${escapeHtml(candidate.label)}</strong>
          <span style="font-size:11px; color:${escapeHtml(candidate.colorHex)}; letter-spacing:.04em; text-transform:uppercase;">Color editorial ${escapeHtml(candidate.colorHex)}</span>
        </div>
      </article>`,
    )
    .join("");

  return backofficeShell(
    mode === "create" ? "Nueva encuesta" : "Editar encuesta",
    `<div class="grid">
      <div class="card">
        ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
        <div class="split-title" style="margin-bottom:8px;">
          <h3>${mode === "create" ? "Nueva encuesta digital" : "Editar encuesta digital"}</h3>
          <span class="mini-tag">Opinion de la comunidad</span>
        </div>
        <p class="muted" style="margin-bottom:14px;">Modulo pensado para links de Instagram, entrevistas y seguimiento de conversion a voto. Las 10 opciones se mantienen en orden fijo para consistencia historica.</p>
        <div class="ai-box">
          <div class="ai-head">
            <div>
              <h3 class="ai-title">Generacion IA de Encuesta</h3>
              <p class="ai-sub">Describe la encuesta que necesitas y usa <strong>Genera con IA encuesta</strong>. Se autocompletan titulo, pregunta, CTA, contexto, fechas y estado.</p>
            </div>
            <span class="ai-badge" id="pollAiConnBadge">Chequeando IA...</span>
          </div>
          <div class="field">
            <label for="pollAiBrief">Brief para IA</label>
            <textarea id="pollAiBrief" rows="3" placeholder="Ej: encuesta nacional para entrevista en Instagram sobre confianza presidencial 2027, tono firme y neutral."></textarea>
          </div>
          <div class="ai-actions">
            <button type="button" id="pollAiGenerateBtn" class="primary ai-main-action">⚡ Genera con IA encuesta</button>
          </div>
          <div id="pollAiStatus" class="ai-status">Completa un brief y genera la encuesta con IA.</div>
        </div>
        <form id="poll-form" method="post" action="${action}">
          <div class="cms-layout">
            <section class="editor-stack">
              <div class="editor-card">
                <div class="field"><label for="title">Titulo interno</label><input id="title" name="title" required minlength="8" value="${getValue(data?.title)}" /></div>
                <div class="field"><label for="slug">Slug publico</label><input id="slug" name="slug" placeholder="confiarias-pais-2027" value="${getValue(data?.slug)}" /></div>
                <div class="field"><label for="question">Pregunta principal</label><input id="question" name="question" required minlength="12" value="${getValue(data?.question)}" /></div>
                <div class="cols-2">
                  <div class="field"><label for="hookLabel">Etiqueta superior</label><input id="hookLabel" name="hookLabel" value="${getValue(data?.hookLabel ?? "Encuesta Nacional")}" /></div>
                  <div class="field"><label for="footerCta">CTA inferior</label><input id="footerCta" name="footerCta" value="${getValue(data?.footerCta ?? "Vota y explica por que")}" /></div>
                </div>
                <div class="field"><label for="description">Contexto corto</label><textarea id="description" name="description" rows="3">${getValue(data?.description)}</textarea></div>
                <div class="field">
                  <label for="customSheetCode">Hoja personalizada (codigo opcional)</label>
                  <textarea id="customSheetCode" name="customSheetCode" rows="7" placeholder="La IA puede generar HTML/CSS/JS para una hoja embebible de encuesta.">${getValue(data?.customSheetCode)}</textarea>
                  <p class="hint">Este bloque no altera la encuesta guardada. Es para copiar y pegar en una hoja personalizada.</p>
                </div>
              </div>

              <div class="editor-card">
                <div class="split-title"><h3>Opciones fijas</h3><span class="mini-tag">orden bloqueado</span></div>
                <div style="display:grid; gap:8px;">${candidateRows}</div>
              </div>
            </section>

            <aside class="editor-stack">
              <div class="editor-card">
                <div class="field"><label for="interviewUrl">Link entrevista (Instagram o similar)</label><input id="interviewUrl" name="interviewUrl" type="url" value="${getValue(data?.interviewUrl)}" /></div>
                <div class="field"><label for="coverImageUrl">Imagen portada (opcional)</label><input id="coverImageUrl" name="coverImageUrl" type="url" value="${getValue(data?.coverImageUrl)}" /></div>
              </div>

              <div class="editor-card">
                <div class="cols-2">
                  <div class="field"><label for="status">Estado</label><select id="status" name="status">${statusOptions}</select></div>
                  <div class="field"><label for="publishedAt">Publicar en</label><input id="publishedAt" type="datetime-local" name="publishedAt" value="${getValue(isoLocalDate(data?.publishedAt ? new Date(data.publishedAt) : null))}" /></div>
                </div>
                <div class="cols-2">
                  <div class="field"><label for="startsAt">Inicio</label><input id="startsAt" type="datetime-local" name="startsAt" value="${getValue(isoLocalDate(data?.startsAt ? new Date(data.startsAt) : null))}" /></div>
                  <div class="field"><label for="endsAt">Cierre</label><input id="endsAt" type="datetime-local" name="endsAt" value="${getValue(isoLocalDate(data?.endsAt ? new Date(data.endsAt) : null))}" /></div>
                </div>
                <label style="display:flex; align-items:center; gap:8px; font-size:13px; color:#f0f0f0;"><input type="checkbox" name="isFeatured" ${data?.isFeatured ? "checked" : ""} /> Destacar en portada de encuestas</label>
              </div>

              <div class="editor-card">
                <p style="margin:0; color:#d8d8d8; font-size:13px; line-height:1.5;">Metricas actuales: <strong>${escapeHtml(String(totalVotes))}</strong> votos${leaderLabel ? ` | Lider: <strong>${escapeHtml(leaderLabel)}</strong>` : ""}</p>
                ${
                  publicUrl
                    ? `<a class="button" href="${escapeHtml(publicUrl)}" target="_blank" rel="noreferrer">Abrir encuesta publica</a>`
                    : `<p class="muted">Se habilita URL publica despues de crear.</p>`
                }
                <div class="actions">
                  <button class="primary" type="submit">${mode === "create" ? "Crear encuesta" : "Guardar cambios"}</button>
                  <a class="button" href="/backoffice/polls">Volver</a>
                </div>
              </div>
            </aside>
          </div>
        </form>
        <script>
          (function () {
            const form = document.getElementById("poll-form");
            const briefEl = document.getElementById("pollAiBrief");
            const generateBtn = document.getElementById("pollAiGenerateBtn");
            const statusEl = document.getElementById("pollAiStatus");
            const connBadge = document.getElementById("pollAiConnBadge");
            if (!form || !briefEl || !generateBtn || !statusEl || !connBadge) {
              return;
            }

            function notify(message, level) {
              if (typeof window.pulsoToast === "function") {
                window.pulsoToast(message, level || "");
              }
            }

            function field(name) {
              return form.querySelector('[name="' + name + '"]');
            }

            function value(name) {
              const el = field(name);
              if (!el || typeof el.value !== "string") {
                return "";
              }
              return el.value.trim();
            }

            function checked(name) {
              const el = field(name);
              return Boolean(el && "checked" in el && el.checked);
            }

            function setFieldValue(name, nextValue) {
              const el = field(name);
              if (!el || typeof el.value !== "string") {
                return;
              }
              el.value = nextValue ?? "";
            }

            function setSelectValue(name, nextValue) {
              const el = field(name);
              if (!el || el.tagName !== "SELECT" || !nextValue) {
                return;
              }
              const option = el.querySelector('option[value="' + nextValue + '"]');
              if (option) {
                el.value = nextValue;
              }
            }

            function setCheckboxValue(name, nextValue) {
              const el = field(name);
              if (!el || !("checked" in el)) {
                return;
              }
              el.checked = Boolean(nextValue);
            }

            function slugify(value) {
              return String(value || "")
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "")
                .slice(0, 120);
            }

            function setStatus(message, level) {
              statusEl.textContent = message;
              statusEl.className = "ai-status " + level;
            }

            function toLocalDatetime(input) {
              if (!input) return "";
              const parsed = new Date(input);
              if (Number.isNaN(parsed.getTime())) return "";
              const offset = parsed.getTimezoneOffset();
              const local = new Date(parsed.getTime() - offset * 60000);
              return local.toISOString().slice(0, 16);
            }

            async function readJson(response) {
              const contentType = response.headers.get("content-type") || "";
              if (contentType.includes("application/json")) {
                return response.json();
              }
              const rawText = await response.text();
              return { error: rawText || "Respuesta invalida del servidor." };
            }

            function contextHint(context) {
              if (!context || typeof context !== "object") {
                return "";
              }
              const internal = Number(context.internalCount ?? 0);
              const external = Number(context.externalCount ?? 0);
              if (!internal && !external) {
                return "";
              }
              return " | Wrapper: " + internal + " internas + " + external + " externas";
            }

            function applySuggestion(suggestion, brief) {
              if (!suggestion || typeof suggestion !== "object") {
                return;
              }
              if (suggestion.title) setFieldValue("title", suggestion.title);
              if (suggestion.slug) setFieldValue("slug", suggestion.slug);
              if (!value("slug")) {
                setFieldValue("slug", slugify(value("title")));
              }
              if (suggestion.question) setFieldValue("question", suggestion.question);
              if (suggestion.hookLabel) setFieldValue("hookLabel", suggestion.hookLabel);
              if (suggestion.footerCta) setFieldValue("footerCta", suggestion.footerCta);
              if (suggestion.description !== undefined && suggestion.description !== null) setFieldValue("description", suggestion.description);
              if (suggestion.interviewUrl !== undefined && suggestion.interviewUrl !== null) setFieldValue("interviewUrl", suggestion.interviewUrl);
              if (suggestion.coverImageUrl !== undefined && suggestion.coverImageUrl !== null) setFieldValue("coverImageUrl", suggestion.coverImageUrl);
              if (suggestion.customSheetCode !== undefined && suggestion.customSheetCode !== null) setFieldValue("customSheetCode", suggestion.customSheetCode);
              if (suggestion.status) setSelectValue("status", suggestion.status);
              if (suggestion.startsAt) setFieldValue("startsAt", toLocalDatetime(suggestion.startsAt));
              if (suggestion.endsAt) setFieldValue("endsAt", toLocalDatetime(suggestion.endsAt));
              if (suggestion.publishedAt) setFieldValue("publishedAt", toLocalDatetime(suggestion.publishedAt));
              if (Object.prototype.hasOwnProperty.call(suggestion, "isFeatured")) {
                setCheckboxValue("isFeatured", suggestion.isFeatured);
              }
              if (!value("title")) {
                setFieldValue("title", String(brief || "").slice(0, 110) || "Encuesta digital Pulso Pais");
              }
              if (!value("question")) {
                setFieldValue("question", "¿A quien le confiarias el pais en 2027?");
              }
              if (!value("hookLabel")) {
                setFieldValue("hookLabel", "Encuesta Nacional");
              }
              if (!value("footerCta")) {
                setFieldValue("footerCta", "Vota y explica por que");
              }
              if (!value("slug")) {
                setFieldValue("slug", slugify(value("title")));
              }
            }

            async function checkAiHealth() {
              try {
                const response = await fetch("/backoffice/ai/health", { headers: { accept: "application/json" } });
                const payload = await readJson(response);
                if (!response.ok) {
                  throw new Error(payload.error || "No se pudo consultar estado de IA.");
                }
                const health = payload.health || {};
                const connected = Boolean(health.enabled && health.aiReachable && health.guidelinesLoaded);
                const provider = health.primaryProvider ? String(health.primaryProvider).toUpperCase() : "IA";
                if (connected) {
                  connBadge.textContent = provider + " activa";
                  connBadge.style.borderColor = "#2d5f45";
                  connBadge.style.color = "#b6f3ca";
                  connBadge.style.background = "#122318";
                  setStatus("IA lista para generar encuesta (" + (health.model || "modelo") + ").", "ok");
                } else {
                  connBadge.textContent = "IA con alertas";
                  connBadge.style.borderColor = "#70591f";
                  connBadge.style.color = "#f5dd96";
                  connBadge.style.background = "#221b0d";
                  setStatus("La IA no esta totalmente operativa.", "warn");
                }
              } catch (error) {
                connBadge.textContent = "IA sin conexion";
                connBadge.style.borderColor = "#7b2f2f";
                connBadge.style.color = "#ffc4c4";
                connBadge.style.background = "#2c1313";
                setStatus(error instanceof Error ? error.message : "No se pudo verificar IA.", "error");
              }
            }

            generateBtn.addEventListener("click", async function () {
              const brief = briefEl.value.trim();
              if (brief.length < 12) {
                setStatus("El brief debe tener al menos 12 caracteres.", "error");
                notify("Escribe un brief mas claro para generar la encuesta.", "error");
                return;
              }
              generateBtn.disabled = true;
              generateBtn.classList.add("is-running");
              setStatus("Solicitud recibida: generando encuesta con IA...", "warn");
              notify("Generando encuesta con IA...", "warn");
              try {
                const response = await fetch("/backoffice/ai/polls/generate", {
                  method: "POST",
                  headers: {
                    "content-type": "application/json",
                    accept: "application/json",
                  },
                  body: JSON.stringify({
                    brief: brief,
                    currentTitle: value("title"),
                    currentSlug: value("slug"),
                    currentQuestion: value("question"),
                    currentHookLabel: value("hookLabel"),
                    currentFooterCta: value("footerCta"),
                    currentDescription: value("description"),
                    currentInterviewUrl: value("interviewUrl"),
                    currentCoverImageUrl: value("coverImageUrl"),
                    currentStatus: value("status"),
                    currentPublishedAt: value("publishedAt"),
                    currentStartsAt: value("startsAt"),
                    currentEndsAt: value("endsAt"),
                    currentIsFeatured: checked("isFeatured"),
                  }),
                });
                const result = await readJson(response);
                if (!response.ok) {
                  throw new Error(result.error || "No se pudo generar la encuesta.");
                }
                const suggestion = result.suggestion || {};
                applySuggestion(suggestion, brief);
                const noteText = Array.isArray(suggestion.notes) && suggestion.notes.length > 0
                  ? " | " + suggestion.notes[0]
                  : "";
                setStatus("Encuesta autocompletada con IA (" + (suggestion.model || "modelo") + ")" + noteText + contextHint(result.context), "ok");
                notify("Borrador de encuesta aplicado al formulario.", "ok");
              } catch (error) {
                setStatus(error instanceof Error ? error.message : "Error al generar encuesta con IA.", "error");
                notify("No se pudo generar la encuesta con IA.", "error");
              } finally {
                generateBtn.disabled = false;
                generateBtn.classList.remove("is-running");
              }
            });

            const titleInput = field("title");
            const slugInput = field("slug");
            let slugManuallyEdited = value("slug").length > 0;
            if (slugInput) {
              slugInput.addEventListener("input", function () {
                slugManuallyEdited = slugInput.value.trim().length > 0;
              });
            }
            if (titleInput) {
              titleInput.addEventListener("input", function () {
                if (slugManuallyEdited) {
                  return;
                }
                setFieldValue("slug", slugify(titleInput.value));
              });
            }

            form.addEventListener("submit", function () {
              notify("Solicitud recibida. Guardando encuesta...", "warn");
            });
            form.addEventListener("invalid", function () {
              notify("Faltan campos obligatorios antes de guardar la encuesta.", "error");
            }, true);

            checkAiHealth();
          })();
        </script>
      </div>
    </div>`,
  );
}

export function renderIaLab(): string {
  return backofficeShell(
    "IA Lab",
    `<div class="grid">
      <div class="card">
        <h2 style="margin:0 0 10px; font-size:24px;">IA Lab</h2>
        <p style="margin:0 0 12px; color:#b6b6b6; line-height:1.45;">
          Espacio tecnico para verificar conexion con Gemini (primario), fallback Ollama local, modelo activo y wrapper de contexto editorial.
          <strong> Nueva Nota </strong> es para produccion; <strong>IA Lab</strong> es para diagnostico rapido.
        </p>
        <div class="actions" style="margin-bottom:10px;">
          <a class="button" href="/backoffice/news/new#ia">Abrir Nueva Nota + IA</a>
          <button type="button" id="iaRefreshBtn">Actualizar estado</button>
        </div>
        <div id="iaLabStatus" class="ai-status">Cargando estado de IA...</div>
        <div class="cols-2" style="margin-top:10px;">
          <div class="editor-card">
            <div class="split-title"><h3>Salud IA</h3><span class="mini-tag">OLLAMA</span></div>
            <pre id="iaLabHealth" style="margin:0; font-size:12px; white-space:pre-wrap; color:#e2e2e2;"></pre>
          </div>
          <div class="editor-card">
            <div class="split-title"><h3>Wrapper Context</h3><span class="mini-tag">AGENDA</span></div>
            <pre id="iaLabContext" style="margin:0; font-size:12px; white-space:pre-wrap; color:#e2e2e2;"></pre>
          </div>
        </div>
      </div>
      <script>
        (function () {
          const refreshBtn = document.getElementById("iaRefreshBtn");
          const statusEl = document.getElementById("iaLabStatus");
          const healthEl = document.getElementById("iaLabHealth");
          const contextEl = document.getElementById("iaLabContext");
          if (!refreshBtn || !statusEl || !healthEl || !contextEl) {
            return;
          }

          async function readJson(response) {
            const contentType = response.headers.get("content-type") || "";
            if (contentType.includes("application/json")) {
              return response.json();
            }
            const rawText = await response.text();
            return { error: rawText || "Respuesta invalida del servidor." };
          }

          function setStatus(text, level) {
            statusEl.textContent = text;
            statusEl.className = "ai-status " + level;
          }

          async function refresh() {
            refreshBtn.disabled = true;
            refreshBtn.classList.add("is-running");
            setStatus("Consultando estado de IA...", "warn");
            try {
              const [healthResponse, contextResponse] = await Promise.all([
                fetch("/backoffice/ai/health", { headers: { accept: "application/json" } }),
                fetch("/backoffice/ai/context", { headers: { accept: "application/json" } }),
              ]);
              const healthData = await readJson(healthResponse);
              const contextData = await readJson(contextResponse);
              if (!healthResponse.ok) {
                throw new Error(healthData.error || "No se pudo leer salud IA.");
              }
              if (!contextResponse.ok) {
                throw new Error(contextData.error || "No se pudo leer wrapper.");
              }

              const health = healthData.health || {};
              const connected = Boolean(health.enabled && health.aiReachable && health.guidelinesLoaded);
              const provider = health.primaryProvider ? String(health.primaryProvider).toUpperCase() : "IA";
              const base = connected ? "IA operativa (" + provider + ")." : "IA con advertencias.";
              setStatus(base, connected ? "ok" : "warn");
              healthEl.textContent = JSON.stringify(health, null, 2);
              contextEl.textContent = JSON.stringify(contextData.meta || contextData, null, 2);
            } catch (error) {
              setStatus(error instanceof Error ? error.message : "Error al consultar IA Lab.", "error");
            } finally {
              refreshBtn.disabled = false;
              refreshBtn.classList.remove("is-running");
            }
          }

          refreshBtn.addEventListener("click", refresh);
          refresh();
        })();
      </script>
    </div>`,
  );
}
