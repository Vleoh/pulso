import { type News, NewsStatus, type Poll, PollStatus, type Province, UserPlan } from "@prisma/client";
import { PROVINCE_OPTIONS, SECTION_OPTIONS, provinceLabel, sectionLabel } from "./catalog";
import type { EditorialCommandChatMessage, EditorialCommandLogEntry } from "./siteSettings";
import { escapeHtml } from "./utils";

function resolveBackofficeNav(title: string): "panel" | "editorial" | "polls" | "users" {
  const normalized = title.trim().toLowerCase();
  if (normalized.includes("encuesta")) {
    return "polls";
  }
  if (normalized.includes("usuario")) {
    return "users";
  }
  if (
    normalized.includes("noticia") ||
    normalized.includes("nota") ||
    normalized.includes("ia") ||
    normalized.includes("editorial")
  ) {
    return "editorial";
  }
  return "panel";
}

function backofficeNavLink(params: {
  href: string;
  label: string;
  icon: string;
  isActive: boolean;
  target?: string;
  rel?: string;
}): string {
  return `<a class="bo-nav-link ${params.isActive ? "is-active" : ""}" href="${params.href}"${
    params.target ? ` target="${params.target}"` : ""
  }${params.rel ? ` rel="${params.rel}"` : ""}>
    <span class="bo-nav-icon">${params.icon}</span>
    <span>${escapeHtml(params.label)}</span>
  </a>`;
}

function backofficeIcon(name: string): string {
  switch (name) {
    case "panel":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="2"></rect><rect x="13" y="3" width="8" height="5" rx="2"></rect><rect x="13" y="10" width="8" height="11" rx="2"></rect><rect x="3" y="13" width="8" height="8" rx="2"></rect></svg>`;
    case "editorial":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6.5A2.5 2.5 0 0 1 7.5 4H19v14H7.5A2.5 2.5 0 0 0 5 20.5v-14Z"></path><path d="M5 6.5A2.5 2.5 0 0 1 7.5 4H19v14H7.5A2.5 2.5 0 0 0 5 20.5"></path><path d="M9 8h6"></path><path d="M9 12h6"></path><path d="M9 16h4"></path></svg>`;
    case "polls":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16"></path><rect x="5" y="11" width="3" height="6" rx="1"></rect><rect x="10.5" y="7" width="3" height="10" rx="1"></rect><rect x="16" y="4" width="3" height="13" rx="1"></rect></svg>`;
    case "users":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-1.5A3.5 3.5 0 0 0 12.5 16H8a4 4 0 0 0-4 4V21"></path><circle cx="9.5" cy="8" r="3.5"></circle><path d="M20 21v-1a3 3 0 0 0-2.4-2.94"></path><path d="M15.5 4.2a3.5 3.5 0 0 1 0 6.6"></path></svg>`;
    case "layout":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M3 9h18"></path><path d="M9 9v11"></path></svg>`;
    case "lab":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3v4l-4.5 8.2A3 3 0 0 0 8.1 20h7.8a3 3 0 0 0 2.6-4.8L14 7V3"></path><path d="M8.5 13h7"></path></svg>`;
    case "logout":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5"></path><path d="M15 12H4"></path><path d="M20 20V4"></path></svg>`;
    case "search":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="m20 20-3.5-3.5"></path></svg>`;
    case "user":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"></circle><path d="M5 20a7 7 0 0 1 14 0"></path></svg>`;
    case "pulse":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h4l2-5 4 10 2-5h4"></path><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"></circle><circle cx="20" cy="12" r="1.5" fill="currentColor" stroke="none"></circle></svg>`;
    case "autopilot":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M12 2v3"></path><path d="M12 19v3"></path><path d="M4.22 4.22l2.12 2.12"></path><path d="M17.66 17.66l2.12 2.12"></path><path d="M2 12h3"></path><path d="M19 12h3"></path><path d="M4.22 19.78l2.12-2.12"></path><path d="M17.66 6.34l2.12-2.12"></path></svg>`;
    case "journalist":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 22V4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v18l-7-3.5L4 22z"></path><path d="M8 7h8"></path><path d="M8 11h8"></path><path d="M8 15h5"></path></svg>`;
    case "photographer":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path><circle cx="12" cy="13" r="3"></circle></svg>`;
    case "cm":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path><path d="M8 10h8"></path><path d="M8 14h5"></path></svg>`;
    case "editor":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path></svg>`;
    case "social":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>`;
    case "pipeline":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>`;
    case "instagram":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>`;
    case "play":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg>`;
    case "settings":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;
    case "news":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"></path><path d="M18 14h-8"></path><path d="M15 18h-5"></path><path d="M10 6h8v4h-8V6Z"></path></svg>`;
    default:
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"></circle></svg>`;
  }
}

export function backofficeShell(title: string, body: string, flashMessage?: string): string {
  const flash = flashMessage ? `<div class="flash">${escapeHtml(flashMessage)}</div>` : "";
  const activeNav = resolveBackofficeNav(title);
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} | Pulso Pais Backoffice</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,500;6..72,700;6..72,800&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg:#f3f1ec;
      --surface:#ffffff;
      --surface-soft:#fbfaf7;
      --surface-strong:#191714;
      --line:#dfd9cf;
      --text:#171717;
      --muted:#6f6b63;
      --gold:#f2b705;
      --gold-soft:#8c6910;
      --shadow:0 16px 36px rgba(26,24,20,.06);
      --radius:18px;
    }
    * { box-sizing:border-box; }
    [hidden] { display:none !important; }
    html { background:var(--bg); }
    body {
      margin:0;
      min-height:100vh;
      background:radial-gradient(circle at top left, rgba(242,183,5,.08), transparent 24%), linear-gradient(180deg,#f8f6f1 0%, var(--bg) 22%, #efede7 100%);
      color:var(--text);
      font-family:Inter, "Segoe UI", Arial, sans-serif;
    }
    a { color:inherit; }
    .layout { min-height:100vh; display:grid; grid-template-columns:260px minmax(0,1fr); }
    .sidebar {
      position:sticky;
      top:0;
      height:100vh;
      padding:26px 20px;
      border-right:1px solid #e2ddd5;
      background:rgba(248,247,243,.82);
      backdrop-filter:blur(18px);
      display:grid;
      grid-template-rows:auto auto 1fr auto;
      gap:22px;
    }
    .side-brand {
      display:grid;
      gap:8px;
      padding:18px;
      border:1px solid #dfd9cf;
      border-radius:22px;
      background:linear-gradient(180deg,#ffffff,#f8f6f1);
      box-shadow:var(--shadow);
    }
    .side-brand-mark {
      display:inline-flex;
      align-items:center;
      justify-content:center;
      width:38px;
      height:38px;
      border-radius:10px;
      background:#171717;
      color:#f2b705;
      border:1px solid rgba(242,183,5,.18);
    }
    .side-brand-mark svg { width:20px; height:20px; stroke:currentColor; fill:none; stroke-width:1.85; stroke-linecap:round; stroke-linejoin:round; }
    .side-brand strong { font-family:Newsreader, Georgia, serif; font-size:20px; line-height:1; font-weight:700; }
    .side-brand span { color:var(--muted); font-size:11px; letter-spacing:.24em; text-transform:uppercase; }
    .side-section-label { color:#8b857b; font-size:11px; letter-spacing:.18em; text-transform:uppercase; font-weight:700; padding:0 8px; }
    .side-nav { display:grid; gap:8px; }
    .bo-nav-link {
      display:flex;
      align-items:center;
      gap:12px;
      padding:13px 14px;
      border-radius:14px;
      text-decoration:none;
      color:#49453f;
      border:1px solid transparent;
      font-size:13px;
      font-weight:600;
      letter-spacing:.04em;
      transition:all .18s ease;
    }
    .bo-nav-link:hover { background:#ffffff; border-color:#d9d2c6; color:#1c1b18; transform:translateX(1px); }
    .bo-nav-link.is-active { background:#ffffff; border-color:#e1c981; color:#8a6200; box-shadow:var(--shadow); }
    .bo-nav-icon {
      width:18px;
      height:18px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      color:inherit;
      opacity:.9;
      flex:0 0 18px;
    }
    .bo-nav-icon svg { width:18px; height:18px; stroke:currentColor; fill:none; stroke-width:1.85; stroke-linecap:round; stroke-linejoin:round; }
    .side-footer { display:grid; gap:10px; align-content:end; }
    .side-footer a {
      display:flex;
      align-items:center;
      gap:10px;
      text-decoration:none;
      color:#726c63;
      font-size:12px;
      padding:10px 12px;
      border-radius:12px;
    }
    .side-footer a:hover { background:#fff; color:#1f1e1a; }
    .main { min-width:0; }
    .wrap { width:min(1380px,94vw); margin:0 auto; padding:22px 0 72px; }
    .top {
      display:grid;
      grid-template-columns:minmax(0,1fr) auto;
      align-items:center;
      gap:20px;
      margin-bottom:22px;
      padding-bottom:18px;
      border-bottom:1px solid #dfd9cf;
    }
    .brand { display:grid; gap:6px; }
    .brand small { color:var(--gold-soft); font-size:11px; letter-spacing:.16em; text-transform:uppercase; font-weight:700; }
    .brand strong { margin:0; font-family:Newsreader, Georgia, serif; font-size:52px; line-height:.9; font-weight:700; letter-spacing:-.03em; }
    .brand span { color:#5b5750; font-size:18px; line-height:1.45; max-width:760px; }
    .actions { display:flex; gap:10px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
    .bo-search {
      display:flex;
      align-items:center;
      gap:10px;
      min-width:280px;
      padding:0 14px;
      height:48px;
      border:1px solid #ddd6ca;
      border-radius:14px;
      background:#fff;
    }
    .bo-search input {
      border:0;
      background:transparent;
      padding:0;
      height:auto;
      min-height:auto;
      outline:none;
      box-shadow:none;
      font-size:13px;
      color:#272522;
    }
    .bo-user-chip {
      display:flex;
      align-items:center;
      gap:12px;
      min-height:52px;
      padding:10px 14px;
      border-radius:16px;
      border:1px solid #ddd6ca;
      background:#fff;
      box-shadow:var(--shadow);
    }
    .bo-user-avatar {
      display:inline-flex;
      align-items:center;
      justify-content:center;
      width:36px;
      height:36px;
      border-radius:12px;
      background:#191714;
      color:#f2b705;
      border:1px solid rgba(242,183,5,.18);
    }
    .bo-user-avatar svg { width:18px; height:18px; stroke:currentColor; fill:none; stroke-width:1.85; stroke-linecap:round; stroke-linejoin:round; }
    .bo-user-copy { display:grid; gap:2px; }
    .bo-user-copy strong { font-size:13px; line-height:1.1; }
    .bo-user-copy span { color:#7a746c; font-size:11px; letter-spacing:.08em; text-transform:uppercase; }
    .button, button {
      display:inline-flex;
      align-items:center;
      justify-content:center;
      gap:8px;
      min-height:42px;
      border-radius:12px;
      border:1px solid #d8d1c5;
      background:#fff;
      color:#26231f;
      text-decoration:none;
      font-weight:700;
      font-size:13px;
      padding:10px 14px;
      cursor:pointer;
      transition:border-color .18s ease,color .18s ease,transform .18s ease, background .18s ease;
    }
    .button:hover, button:hover { border-color:#d0a72f; color:#7b5f00; transform:translateY(-1px); }
    .button.primary, button.primary { background:#f2b705; color:#151311; border-color:#d1a32d; box-shadow:0 8px 22px rgba(242,183,5,.22); }
    .button.primary:hover, button.primary:hover { color:#151311; }
    .button[disabled], button[disabled] { opacity:.56; cursor:not-allowed; transform:none; }
    button.is-running { border-color:#d1a32d; background:#fff4cf; color:#7b5f00; }
    .grid { display:grid; gap:20px; }
    .card { background:var(--surface); border:1px solid var(--line); border-radius:var(--radius); padding:22px; box-shadow:var(--shadow); }
    .flash, .error { margin:0 0 16px; padding:12px 14px; border-radius:14px; font-size:13px; line-height:1.45; border:1px solid transparent; }
    .flash { background:#fff7df; border-color:#dfc06b; color:#735600; }
    .error { background:#ffe8e8; border-color:#cf8a8a; color:#922828; }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    thead th { color:#7b766e; font-weight:700; text-transform:uppercase; font-size:10px; letter-spacing:.14em; border-bottom:1px solid #e6e1d8; padding:12px 8px; text-align:left; }
    tbody td { border-bottom:1px solid #efebe3; padding:14px 8px; vertical-align:top; }
    .pill { display:inline-flex; align-items:center; border-radius:999px; font-size:10px; letter-spacing:.08em; text-transform:uppercase; border:1px solid #d8d1c5; padding:4px 8px; background:#fff; }
    .pill.live, .pill.ai-allow { color:#19613b; border-color:#aed2bb; background:#edf8f0; }
    .pill.draft { color:#565049; border-color:#d6d0c4; background:#f8f5ef; }
    .pill.gold, .pill.ai-review { color:#825f00; border-color:#dfc06b; background:#fff4d0; }
    .pill.ai-reject { color:#922828; border-color:#d4a0a0; background:#ffecec; }
    .meta { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }
    .title { font-size:15px; font-weight:700; line-height:1.35; }
    form { display:grid; gap:14px; }
    .field { display:grid; gap:7px; }
    .field label { color:#666159; font-size:11px; text-transform:uppercase; letter-spacing:.14em; font-weight:700; }
    input, textarea, select { width:100%; border-radius:12px; border:1px solid #d8d1c5; background:#ffffff; color:#1f1d1a; padding:12px 13px; font-size:14px; min-height:46px; }
    textarea { min-height:132px; resize:vertical; }
    input:focus, textarea:focus, select:focus { outline:2px solid rgba(242,183,5,.18); outline-offset:1px; border-color:#d0a72f; }
    .cols-2 { display:grid; gap:14px; grid-template-columns:repeat(2,minmax(0,1fr)); }
    .checks { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
    .checks label { border:1px solid #dbd4c9; border-radius:14px; background:#fff; padding:11px 12px; display:flex; gap:8px; align-items:center; cursor:pointer; color:#2f2b27; font-size:13px; text-transform:none; letter-spacing:normal; font-weight:500; }
    .inline-actions { display:flex; gap:6px; flex-wrap:wrap; }
    .danger { border-color:#cf8a8a; color:#922828; background:#ffe8e8; }
    .ai-box { border:1px solid #e1cd91; background:linear-gradient(180deg,#fff8e6,#fffdf8); border-radius:18px; padding:18px; margin-bottom:16px; display:grid; gap:12px; }
    .ai-head { display:flex; gap:12px; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; }
    .ai-title { margin:0; font-size:18px; letter-spacing:.06em; text-transform:uppercase; }
    .ai-sub { margin:0; font-size:13px; color:#544f48; line-height:1.5; }
    .ai-badge { display:inline-flex; align-items:center; border:1px solid #e1c981; background:#fff3c6; color:#775a00; border-radius:999px; font-size:10px; padding:5px 8px; text-transform:uppercase; letter-spacing:.1em; font-weight:700; }
    .ai-actions { display:flex; gap:8px; flex-wrap:wrap; }
    .ai-actions button { position:relative; }
    .ai-main-action { font-size:14px; padding:12px 16px; }
    .ai-advanced { border:1px solid #e2ddd5; border-radius:14px; background:#faf8f3; padding:10px 12px; display:grid; gap:8px; }
    .ai-advanced summary { cursor:pointer; user-select:none; color:#3d3934; font-size:12px; text-transform:uppercase; letter-spacing:.12em; font-weight:700; }
    .ai-advanced .ai-actions { margin-top:8px; }
    .ai-actions button.is-running::after { content:""; width:11px; height:11px; border:2px solid #9b7c36; border-top-color:transparent; border-radius:999px; margin-left:8px; animation:spin .7s linear infinite; }
    .ai-status, .ai-review, .ai-chat-answer { border:1px solid #ddd7cc; background:#fff; border-radius:14px; padding:10px 12px; font-size:13px; line-height:1.5; }
    .ai-status { color:#4d4a44; }
    .ai-status.ok { border-color:#aed2bb; background:#edf8f0; color:#1f603b; }
    .ai-status.warn { border-color:#dfc06b; background:#fff7df; color:#775a00; }
    .ai-status.error { border-color:#d4a0a0; background:#ffecec; color:#922828; }
    .ai-review { display:grid; gap:6px; }
    .ai-review strong { font-size:12px; text-transform:uppercase; letter-spacing:.1em; color:#514d46; }
    .ai-review p { margin:0; color:#23211d; }
    .muted { color:var(--muted); font-size:12px; line-height:1.45; margin:0; }
    .table-tools { display:grid; grid-template-columns:minmax(220px,1fr) repeat(2,minmax(140px,200px)) auto; gap:10px; margin-bottom:12px; align-items:center; }
    .table-tools input, .table-tools select { width:100%; }
    .table-count { font-size:12px; color:#757066; text-align:right; }
    .cms-layout { display:grid; gap:18px; grid-template-columns:minmax(0,1.7fr) minmax(320px,0.82fr); align-items:start; }
    .editor-stack { display:grid; gap:14px; }
    .editor-card { border:1px solid #e2ddd5; border-radius:16px; background:var(--surface-soft); padding:14px; display:grid; gap:10px; }
    .editor-toolbar { display:flex; gap:6px; flex-wrap:wrap; border:1px solid #ddd7cc; border-radius:12px; padding:8px; background:#f5f3ee; }
    .editor-toolbar button { padding:7px 10px; font-size:12px; min-width:auto; border-radius:10px; min-height:auto; }
    .editor-surface { border:1px solid #ddd7cc; border-radius:14px; background:#fff; min-height:260px; padding:14px; font-size:15px; line-height:1.6; overflow:auto; }
    .editor-surface:focus { outline:2px solid rgba(242,183,5,.18); outline-offset:1px; border-color:#d0a72f; }
    .editor-surface pre { background:#f5f3ee; border:1px solid #ddd7cc; border-radius:10px; padding:10px; overflow:auto; }
    .editor-surface blockquote { border-left:3px solid #cfa73a; margin:8px 0; padding:4px 0 4px 12px; color:#4c4841; }
    .editor-hidden { display:none; }
    .editor-metrics { display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px; font-size:12px; color:#7b766e; }
    .editor-preview { border:1px dashed #d7d0c4; border-radius:14px; min-height:148px; padding:12px; color:#7d786f; font-size:13px; display:grid; place-items:center; text-align:center; background:#fff; }
    .editor-preview img { width:100%; height:100%; min-height:148px; border-radius:14px; object-fit:cover; }
    .editor-preview.has-image { padding:0; overflow:hidden; border-style:solid; }
    .field .hint { margin-top:4px; font-size:12px; color:#7b766e; line-height:1.38; }
    .ai-chat-answer { white-space:pre-wrap; color:#2b2925; }
    .ai-inline { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
    .ai-inline input[type="checkbox"] { width:16px; height:16px; margin:0; accent-color:#d1b462; min-height:auto; }
    .toast-stack { position:fixed; right:18px; bottom:18px; z-index:9999; display:grid; gap:8px; width:min(360px,calc(100vw - 24px)); pointer-events:none; }
    .toast { border:1px solid #ddd7cc; background:#fff; color:#2b2a26; border-radius:14px; padding:10px 12px; box-shadow:0 12px 28px rgba(31,27,19,.12); font-size:13px; line-height:1.42; opacity:0; transform:translateY(8px); animation:toast-in .18s ease forwards; }
    .toast.ok { border-color:#aed2bb; background:#edf8f0; color:#1f603b; }
    .toast.warn { border-color:#dfc06b; background:#fff7df; color:#775a00; }
    .toast.error { border-color:#d4a0a0; background:#ffecec; color:#922828; }
    .split-title { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
    .split-title h3 { margin:0; font-size:16px; text-transform:uppercase; letter-spacing:.08em; }
    .mini-tag { display:inline-flex; align-items:center; border:1px solid #dfc06b; border-radius:999px; padding:4px 8px; color:#7c5f00; font-size:10px; letter-spacing:.08em; text-transform:uppercase; background:#fff4d0; font-weight:700; }
    .bo-hero { display:grid; grid-template-columns:minmax(0,1.35fr) 220px; gap:18px; align-items:stretch; padding:28px; border-radius:24px; background:linear-gradient(135deg,#ffffff,#faf7ef); border:1px solid #e5ddce; box-shadow:var(--shadow); }
    .bo-hero-copy { display:grid; gap:10px; align-content:start; }
    .bo-hero-copy small { color:#8f6900; font-size:11px; letter-spacing:.18em; text-transform:uppercase; font-weight:700; }
    .bo-hero-copy h2 { margin:0; font-family:Newsreader, Georgia, serif; font-size:58px; line-height:.94; letter-spacing:-.04em; }
    .bo-hero-copy p { margin:0; color:#4e4942; font-size:18px; line-height:1.6; max-width:740px; }
    .bo-hero-art { border-radius:20px; background:linear-gradient(180deg,rgba(242,183,5,.22),transparent 48%), linear-gradient(180deg,#f5f2ea,#efebe1); border:1px solid #eadcbc; position:relative; overflow:hidden; }
    .bo-hero-art::before, .bo-hero-art::after { content:""; position:absolute; right:22px; bottom:22px; width:26px; background:#fff; opacity:.8; border-radius:4px; }
    .bo-hero-art::before { height:76px; box-shadow:-44px -32px 0 0 rgba(255,255,255,.84), -88px -12px 0 0 rgba(255,255,255,.6); }
    .bo-hero-art::after { height:118px; box-shadow:-44px -12px 0 0 rgba(255,255,255,.58); }
    .bo-stat-grid { display:grid; gap:14px; grid-template-columns:repeat(auto-fit,minmax(148px,1fr)); }
    .bo-stat-card { padding:18px; border-radius:18px; background:#fff; border:1px solid #e4ddd2; box-shadow:var(--shadow); display:grid; gap:8px; }
    .bo-stat-card strong { font-family:Newsreader, Georgia, serif; font-size:30px; line-height:1; }
    .bo-stat-card span { color:#7b766e; font-size:11px; letter-spacing:.14em; text-transform:uppercase; font-weight:700; }
    .bo-stat-card.emphasis { border-color:#dfc06b; box-shadow:0 12px 26px rgba(242,183,5,.14); }
    .bo-module-grid { display:grid; gap:20px; grid-template-columns:minmax(0,1.6fr) 340px; align-items:start; }
    .bo-editorial-grid { display:grid; gap:16px; grid-template-columns:minmax(0,1.45fr) minmax(280px,.9fr); align-items:start; }
    .bo-support-stack { display:grid; gap:12px; }
    .bo-soft-card { padding:16px; border-radius:18px; border:1px solid #e3dccf; background:linear-gradient(180deg,#fff,#fbf9f4); display:grid; gap:10px; }
    .bo-soft-card h4 { margin:0; font-size:13px; text-transform:uppercase; letter-spacing:.1em; color:#2d2924; }
    .bo-soft-card p { margin:0; color:#625d55; font-size:13px; line-height:1.5; }
    .bo-soft-line { display:grid; gap:4px; padding:10px 12px; border-radius:12px; border:1px solid #e5ded3; background:#fff; }
    .bo-soft-line strong { font-size:13px; }
    .bo-soft-line span { color:#6b665e; font-size:12px; line-height:1.45; }
    .bo-kpi-row { display:grid; gap:10px; grid-template-columns:repeat(2,minmax(0,1fr)); }
    .bo-kpi { padding:12px; border-radius:14px; background:#faf7ef; border:1px solid #e4ddd2; display:grid; gap:4px; }
    .bo-kpi strong { font-family:Newsreader, Georgia, serif; font-size:24px; line-height:1; }
    .bo-kpi span { color:#7b766e; font-size:11px; letter-spacing:.12em; text-transform:uppercase; font-weight:700; }
    .bo-chat-layout { display:grid; gap:16px; grid-template-columns:minmax(0,1.45fr) minmax(280px,.86fr); align-items:start; }
    .bo-chat-main, .bo-chat-side { display:grid; gap:14px; }
    .bo-chat-feed, .bo-log-list { display:grid; gap:10px; }
    .bo-chat-feed.is-empty, .bo-log-list.is-empty { min-height:120px; }
    .bo-chat-message, .bo-log-item { padding:14px 16px; border-radius:16px; border:1px solid #e5ddd1; background:#fff; display:grid; gap:8px; }
    .bo-chat-message.is-user { background:#fff7df; border-color:#e5c56a; }
    .bo-chat-message.is-assistant { background:#fcfbf7; }
    .bo-chat-message.is-system { background:#f4f0e8; }
    .bo-log-item.is-success { border-color:#b9d8c2; background:#f0f8f3; }
    .bo-log-item.is-warn { border-color:#e2c06a; background:#fff7df; }
    .bo-log-item.is-error { border-color:#d9aaaa; background:#fff0f0; }
    .bo-chat-meta { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
    .bo-chat-meta strong { font-size:13px; }
    .bo-chat-meta span { color:#7a756d; font-size:11px; letter-spacing:.08em; text-transform:uppercase; }
    .bo-chat-body { color:#27241f; font-size:14px; line-height:1.6; }
    .bo-chat-form { display:grid; gap:12px; padding:16px; border-radius:18px; border:1px solid #e5ded3; background:linear-gradient(180deg,#fff,#fbf9f4); }
    .bo-note-box-warn { border-color:#e0bd61; background:#fff7df; }
    .bo-side-panel { padding:22px; border-radius:24px; background:#191714; color:#fff; border:1px solid #2a2723; display:grid; gap:16px; position:sticky; top:24px; box-shadow:0 24px 54px rgba(17,17,17,.16); }
    .bo-side-panel h3 { margin:0; font-size:15px; letter-spacing:.12em; text-transform:uppercase; color:#f2b705; }
    .bo-side-panel p { margin:0; color:#d0cbc2; font-size:13px; line-height:1.55; }
    .bo-side-panel .field label { color:#ddd3bd; }
    .bo-side-panel input, .bo-side-panel textarea, .bo-side-panel select { background:#24211d; border-color:#3a3630; color:#f6f4ee; }
    .bo-side-card { padding:14px; border-radius:18px; border:1px solid rgba(255,255,255,.08); background:rgba(255,255,255,.03); display:grid; gap:10px; }
    .bo-side-card .muted { color:#c2baae; }
    .bo-toggle-row { display:flex; align-items:center; justify-content:space-between; gap:14px; padding:10px 0; border-bottom:1px solid rgba(255,255,255,.08); }
    .bo-toggle-row:last-child { border-bottom:0; }
    .bo-toggle-row strong { font-size:13px; }
    .bo-toggle-row span { color:#b9b2a7; font-size:11px; }
    .bo-pill-switch { position:relative; width:46px; height:26px; border-radius:999px; background:#44403a; display:inline-block; }
    .bo-pill-switch::after { content:""; position:absolute; top:3px; left:3px; width:20px; height:20px; border-radius:999px; background:#f7f5f1; transition:transform .18s ease; }
    .bo-pill-switch.is-on { background:#f2b705; }
    .bo-pill-switch.is-on::after { transform:translateX(20px); background:#151311; }
    .bo-action-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
    .bo-action-tile { display:grid; gap:8px; min-height:138px; padding:16px; text-decoration:none; text-align:left; border:1px solid #e0d8cb; border-radius:18px; background:linear-gradient(180deg,#fff,#fbf9f4); box-shadow:0 14px 30px rgba(17,17,17,.05); transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease; }
    .bo-action-tile:hover { transform:translateY(-2px); border-color:#d5bb7a; box-shadow:0 18px 36px rgba(17,17,17,.08); }
    .bo-action-tile strong { font-size:13px; letter-spacing:.06em; text-transform:uppercase; }
    .bo-action-tile small { color:#746f66; font-size:12px; line-height:1.45; }
    .bo-action-icon { display:inline-grid; place-items:center; width:38px; height:38px; border-radius:12px; background:#191714; color:#f2b705; font-size:11px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; }
    .bo-action-icon svg { width:18px; height:18px; stroke:currentColor; fill:none; stroke-width:1.85; stroke-linecap:round; stroke-linejoin:round; }
    .bo-activity-list { display:grid; gap:0; }
    .bo-activity-row { display:grid; grid-template-columns:100px minmax(0,1fr) auto; gap:16px; align-items:center; padding:14px 0; border-top:1px solid #eee7dc; }
    .bo-activity-row:first-child { border-top:0; }
    .bo-activity-time { color:#8a847a; font-size:11px; letter-spacing:.1em; text-transform:uppercase; }
    .bo-activity-copy { display:grid; gap:5px; }
    .bo-activity-copy strong { font-size:14px; }
    .bo-activity-copy span { color:#777169; font-size:12px; }
    .bo-kicker { display:inline-flex; align-items:center; gap:8px; color:#8d6907; font-size:11px; letter-spacing:.16em; text-transform:uppercase; font-weight:700; }
    .bo-kicker::before { content:""; width:4px; height:18px; background:#f2b705; border-radius:999px; }
    .bo-tabs { display:flex; gap:10px; flex-wrap:wrap; }
    .bo-tab-btn { display:inline-flex; align-items:center; gap:8px; padding:11px 14px; border-radius:999px; border:1px solid #d8d1c5; background:#fff; color:#38342f; font-size:12px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; cursor:pointer; }
    .bo-tab-btn.is-active { background:#191714; border-color:#191714; color:#fff; }
    .bo-tab-panel { display:none; }
    .bo-tab-panel.is-active { display:grid; gap:14px; }
    .bo-compact-grid { display:grid; gap:14px; grid-template-columns:repeat(2,minmax(0,1fr)); }
    .bo-subgrid-3 { display:grid; gap:12px; grid-template-columns:repeat(3,minmax(0,1fr)); }
    .bo-note-box { padding:14px; border-radius:16px; border:1px solid #e3dccf; background:#faf8f3; }
    .bo-note-box strong { display:block; margin-bottom:6px; font-size:13px; }
    .bo-note-box p { margin:0; color:#645f57; font-size:13px; line-height:1.5; }
    .bo-form-actions { display:flex; gap:10px; flex-wrap:wrap; }
    .bo-inline-stat { display:flex; gap:10px; flex-wrap:wrap; }
    .bo-inline-stat span { display:inline-flex; align-items:center; gap:8px; padding:8px 10px; border-radius:999px; background:#faf7ef; border:1px solid #e2ddd5; font-size:12px; }
    .bo-deploy-status { display:inline-flex; align-items:center; gap:8px; padding:6px 10px; border-radius:999px; font-size:10px; letter-spacing:.12em; text-transform:uppercase; font-weight:700; }
    .bo-deploy-status.is-synced { background:#edf8f0; color:#1f603b; border:1px solid #aed2bb; }
    .bo-deploy-status.is-drift { background:#fff4d0; color:#775a00; border:1px solid #dfc06b; }
    .bo-deploy-status.is-unknown { background:#f3efe7; color:#645f57; border:1px solid #d8d1c5; }
    .bo-deploy-grid { display:grid; gap:10px; }
    .bo-deploy-row { display:grid; gap:4px; padding:10px 12px; border-radius:14px; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08); }
    .bo-deploy-row strong { font-size:12px; letter-spacing:.1em; text-transform:uppercase; color:#f3ede0; }
    .bo-deploy-row span { color:#c8c0b4; font-size:12px; line-height:1.45; }

    /* ── AUTOPILOT COMMAND BAR ── */
    .ap-command-bar {
      display:grid;
      grid-template-columns:auto 1fr auto auto;
      align-items:center;
      gap:16px;
      padding:18px 24px;
      border-radius:20px;
      background:linear-gradient(135deg,#191714 0%,#2a2520 100%);
      border:1px solid rgba(242,183,5,.22);
      box-shadow:0 8px 32px rgba(17,15,11,.22),inset 0 1px 0 rgba(255,255,255,.06);
      margin-bottom:4px;
    }
    .ap-status-group { display:flex; align-items:center; gap:12px; }
    .ap-status-dot {
      width:10px; height:10px; border-radius:999px;
      background:#4caf50;
      box-shadow:0 0 0 3px rgba(76,175,80,.22);
      flex:0 0 10px;
    }
    .ap-status-dot.is-off { background:#5a5550; box-shadow:none; }
    .ap-status-dot.is-warning { background:#f2b705; box-shadow:0 0 0 3px rgba(242,183,5,.22); }
    .ap-status-label { color:#f2b705; font-size:11px; letter-spacing:.22em; text-transform:uppercase; font-weight:800; }
    .ap-meta { display:flex; align-items:center; gap:20px; flex-wrap:wrap; }
    .ap-meta-item { display:flex; flex-direction:column; gap:2px; }
    .ap-meta-item label { color:#8a837a; font-size:10px; letter-spacing:.18em; text-transform:uppercase; font-weight:700; }
    .ap-meta-item span { color:#f0ece4; font-size:13px; font-weight:600; }
    .ap-actions { display:flex; gap:10px; }
    .ap-btn {
      display:inline-flex; align-items:center; gap:8px;
      padding:10px 16px; border-radius:12px;
      border:1px solid rgba(255,255,255,.12);
      background:rgba(255,255,255,.06);
      color:#d8d2c8; font-size:12px; font-weight:700;
      text-decoration:none; cursor:pointer;
      letter-spacing:.08em; text-transform:uppercase;
      transition:all .18s ease;
    }
    .ap-btn:hover { background:rgba(255,255,255,.12); border-color:rgba(255,255,255,.22); color:#fff; }
    .ap-btn.primary {
      background:#f2b705; border-color:#d1a32d; color:#151311;
      box-shadow:0 6px 18px rgba(242,183,5,.28);
    }
    .ap-btn.primary:hover { background:#ffc82b; }
    .ap-btn svg { width:14px; height:14px; stroke:currentColor; fill:none; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; flex:0 0 14px; }

    /* ── AGENT PIPELINE ── */
    .agent-pipeline {
      display:grid;
      grid-template-columns:repeat(6,1fr);
      gap:0;
      padding:0;
    }
    .agent-card {
      display:grid;
      gap:10px;
      padding:18px 16px;
      background:#fff;
      border:1px solid #e4ddd2;
      border-right-width:0;
      position:relative;
      transition:all .18s ease;
    }
    .agent-card:first-child { border-radius:18px 0 0 18px; }
    .agent-card:last-child { border-radius:0 18px 18px 0; border-right-width:1px; }
    .agent-card:hover { background:#fdfbf7; z-index:1; box-shadow:0 8px 24px rgba(17,15,11,.08); }
    .agent-card.is-active { background:linear-gradient(180deg,#fff8e6,#fffdf8); border-color:#dfc06b; }
    .agent-card.is-active .agent-status-dot { background:#f2b705; box-shadow:0 0 0 3px rgba(242,183,5,.22); animation:agent-pulse 2s ease-in-out infinite; }
    .agent-card.is-ready .agent-status-dot { background:#4caf50; box-shadow:0 0 0 3px rgba(76,175,80,.22); }
    .agent-card.is-standby .agent-status-dot { background:#9e9e9e; box-shadow:none; }
    .agent-card.is-error .agent-status-dot { background:#e53935; box-shadow:0 0 0 3px rgba(229,57,53,.22); }
    .agent-card-top { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; }
    .agent-icon {
      display:inline-flex; align-items:center; justify-content:center;
      width:36px; height:36px; border-radius:10px;
      background:#191714; color:#f2b705;
      flex:0 0 36px;
    }
    .agent-icon svg { width:16px; height:16px; stroke:currentColor; fill:none; stroke-width:1.85; stroke-linecap:round; stroke-linejoin:round; }
    .agent-status-dot { width:8px; height:8px; border-radius:999px; background:#9e9e9e; flex:0 0 8px; margin-top:4px; }
    .agent-name { font-size:11px; letter-spacing:.14em; text-transform:uppercase; font-weight:700; color:#2b2723; line-height:1.2; }
    .agent-role { font-size:11px; color:#9a9189; line-height:1.4; }
    .agent-stat { font-size:11px; color:#6b6660; }
    .agent-stat strong { color:#2b2723; font-size:13px; font-family:'Newsreader', Georgia, serif; }
    .agent-connector {
      position:absolute;
      right:-1px;
      top:50%;
      transform:translateY(-50%);
      width:2px;
      height:28px;
      background:linear-gradient(180deg,transparent,#d8d1c4,transparent);
      z-index:2;
    }

    /* ── METRICS RIBBON ── */
    .metrics-ribbon {
      display:grid;
      grid-template-columns:repeat(auto-fit,minmax(120px,1fr));
      gap:1px;
      background:#e4ddd2;
      border:1px solid #e4ddd2;
      border-radius:16px;
      overflow:hidden;
    }
    .metric-cell {
      display:grid;
      gap:4px;
      padding:16px 18px;
      background:#fff;
      transition:background .18s ease;
    }
    .metric-cell:hover { background:#fdfbf7; }
    .metric-cell.accent { background:linear-gradient(180deg,#fff8e6,#fffdf8); }
    .metric-cell label { color:#9a9189; font-size:10px; letter-spacing:.16em; text-transform:uppercase; font-weight:700; }
    .metric-cell strong { font-family:'Newsreader',Georgia,serif; font-size:28px; line-height:1; color:#1a1816; }
    .metric-cell span { color:#7b766e; font-size:11px; }

    /* ── CONTENT GRID 3-COL ── */
    .content-grid-3 { display:grid; gap:18px; grid-template-columns:1fr 1fr 340px; align-items:start; }
    .content-grid-2 { display:grid; gap:18px; grid-template-columns:1fr 1fr; align-items:start; }

    /* ── ACTIVITY FEED ENHANCED ── */
    .activity-feed { display:grid; gap:0; }
    .activity-item {
      display:grid;
      grid-template-columns:auto minmax(0,1fr) auto;
      gap:14px;
      align-items:start;
      padding:14px 0;
      border-top:1px solid #f0ebe2;
    }
    .activity-item:first-child { border-top:0; padding-top:0; }
    .activity-avatar {
      width:36px; height:36px; border-radius:10px;
      background:#191714; color:#f2b705;
      display:inline-flex; align-items:center; justify-content:center;
      flex:0 0 36px;
    }
    .activity-avatar svg { width:14px; height:14px; stroke:currentColor; fill:none; stroke-width:1.85; stroke-linecap:round; stroke-linejoin:round; }
    .activity-body { display:grid; gap:3px; min-width:0; }
    .activity-body strong { font-size:13px; line-height:1.35; }
    .activity-body span { color:#8a847a; font-size:11px; }
    .activity-time { color:#a09990; font-size:11px; white-space:nowrap; padding-top:2px; }

    /* ── AUTOPILOT CONFIG CARD ── */
    .autopilot-card {
      border:1px solid #e1c981;
      background:linear-gradient(180deg,#fffdf8,#fff9ed);
      border-radius:20px;
      padding:22px;
      display:grid;
      gap:18px;
    }
    .autopilot-header { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
    .autopilot-title { display:grid; gap:4px; }
    .autopilot-title h3 { margin:0; font-size:16px; letter-spacing:.08em; text-transform:uppercase; }
    .autopilot-badges { display:flex; gap:8px; flex-wrap:wrap; }
    .ap-badge {
      display:inline-flex; align-items:center; gap:6px;
      padding:5px 10px; border-radius:999px;
      font-size:10px; letter-spacing:.1em; text-transform:uppercase; font-weight:700;
    }
    .ap-badge.on { background:#edf8f0; border:1px solid #aed2bb; color:#1f603b; }
    .ap-badge.off { background:#f5f0e8; border:1px solid #d8d1c5; color:#6b665e; }
    .ap-badge.social { background:#e8f0fe; border:1px solid #a8c4f0; color:#1a4fa0; }

    /* ── LOG FEED ── */
    .log-feed { display:grid; gap:8px; }
    .log-entry {
      display:grid;
      grid-template-columns:auto minmax(0,1fr);
      gap:12px;
      align-items:start;
      padding:12px 14px;
      border-radius:14px;
      border:1px solid #e5ded3;
      background:#fff;
    }
    .log-entry.success { border-color:#b9d8c2; background:#f0f8f3; }
    .log-entry.warning { border-color:#e2c06a; background:#fff7df; }
    .log-entry.error { border-color:#d9aaaa; background:#fff0f0; }
    .log-icon { width:28px; height:28px; border-radius:8px; display:inline-flex; align-items:center; justify-content:center; font-size:12px; flex:0 0 28px; }
    .log-icon.success { background:#d4edda; color:#1f603b; }
    .log-icon.warning { background:#fff3cd; color:#775a00; }
    .log-icon.error { background:#f8d7da; color:#922828; }
    .log-body { display:grid; gap:3px; }
    .log-body strong { font-size:12px; }
    .log-body span { color:#7b766e; font-size:11px; }

    /* ── SOCIAL PANEL ── */
    .social-panel { display:grid; gap:14px; }
    .social-account-card {
      display:grid;
      grid-template-columns:auto 1fr auto;
      gap:12px;
      align-items:center;
      padding:14px;
      border-radius:16px;
      border:1px solid #e3dccf;
      background:#fff;
    }
    .social-platform-icon {
      width:38px; height:38px; border-radius:10px;
      display:inline-flex; align-items:center; justify-content:center;
      background:linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045);
      color:#fff;
    }
    .social-platform-icon svg { width:18px; height:18px; stroke:currentColor; fill:none; stroke-width:1.85; stroke-linecap:round; stroke-linejoin:round; }
    .social-account-info { display:grid; gap:2px; }
    .social-account-info strong { font-size:13px; }
    .social-account-info span { font-size:11px; color:#8a847a; }
    .social-stat { text-align:right; }
    .social-stat strong { font-family:'Newsreader',Georgia,serif; font-size:20px; display:block; }
    .social-stat span { font-size:10px; color:#8a847a; letter-spacing:.1em; text-transform:uppercase; }

    /* ── QUICK ACTIONS GRID ── */
    .quick-actions { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
    .quick-action {
      display:grid;
      gap:10px;
      padding:16px;
      border-radius:16px;
      border:1px solid #e0d8cb;
      background:linear-gradient(180deg,#fff,#fbf9f4);
      text-decoration:none;
      cursor:pointer;
      transition:all .18s ease;
      text-align:left;
    }
    .quick-action:hover { border-color:#d5bb7a; transform:translateY(-1px); box-shadow:0 8px 22px rgba(17,15,11,.07); }
    .quick-action-icon {
      width:34px; height:34px; border-radius:10px;
      background:#191714; color:#f2b705;
      display:inline-flex; align-items:center; justify-content:center;
    }
    .quick-action-icon svg { width:15px; height:15px; stroke:currentColor; fill:none; stroke-width:1.85; stroke-linecap:round; stroke-linejoin:round; }
    .quick-action strong { font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:#2b2723; }
    .quick-action small { font-size:11px; color:#746f66; line-height:1.45; }

    /* ── SECTION HEADER ── */
    .section-header { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:14px; }
    .section-header h3 { margin:0; font-size:13px; letter-spacing:.14em; text-transform:uppercase; color:#2b2723; }
    .section-header-actions { display:flex; gap:8px; }

    /* ── PIPELINE ARROW ── */
    @keyframes agent-pulse { 0%,100% { opacity:1; } 50% { opacity:.5; } }
    @keyframes toast-in { to { opacity:1; transform:translateY(0); } }
    @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
    @media (max-width:1180px) {
      .layout { grid-template-columns:1fr; }
      .sidebar { position:static; height:auto; border-right:0; border-bottom:1px solid var(--line); grid-template-rows:auto auto auto auto; }
      .side-nav { grid-template-columns:repeat(2,minmax(0,1fr)); }
      .wrap { width:min(1220px,94vw); }
      .top { grid-template-columns:1fr; }
      .actions { justify-content:flex-start; }
      .bo-module-grid, .bo-hero { grid-template-columns:1fr; }
      .bo-side-panel { position:static; }
      .agent-pipeline { grid-template-columns:repeat(3,1fr); }
      .agent-card:nth-child(3) { border-radius:0 18px 0 0; border-right-width:1px; }
      .agent-card:nth-child(4) { border-radius:0 0 0 18px; border-top-width:0; }
      .agent-card:nth-child(6) { border-radius:0 0 18px 0; border-right-width:1px; }
      .content-grid-3 { grid-template-columns:1fr; }
      .content-grid-2 { grid-template-columns:1fr; }
      .ap-command-bar { grid-template-columns:1fr; }
      .metrics-ribbon { grid-template-columns:repeat(3,1fr); }
    }
    @media (max-width:900px) {
      .cols-2, .checks, .table-tools, .cms-layout, .bo-compact-grid, .bo-subgrid-3, .bo-editorial-grid, .bo-kpi-row, .bo-chat-layout { grid-template-columns:1fr; }
      .agent-pipeline { grid-template-columns:repeat(2,1fr); }
      .quick-actions { grid-template-columns:repeat(2,1fr); }
      .metrics-ribbon { grid-template-columns:repeat(2,1fr); }
      .table-count { text-align:left; }
      table, thead, tbody, th, td, tr { display:block; }
      thead { display:none; }
      tbody tr { border:1px solid var(--line); border-radius:14px; margin-bottom:10px; padding:10px; background:#fff; }
      tbody td { border:0; padding:6px 0; }
      .bo-search { min-width:0; width:100%; }
      .bo-activity-row { grid-template-columns:1fr; gap:8px; }
      .brand strong { font-size:42px; }
      .bo-hero-copy h2 { font-size:44px; }
    }
  </style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <div class="side-brand">
        <span class="side-brand-mark">${backofficeIcon("pulse")}</span>
        <strong>Pulso Pais</strong>
        <span>Situation Room</span>
      </div>
      <div class="side-section-label">Principal</div>
      <nav class="side-nav">
        ${backofficeNavLink({ href: "/backoffice", label: "Dashboard", icon: backofficeIcon("panel"), isActive: activeNav === "panel" })}
        ${backofficeNavLink({ href: "/backoffice/news/new", label: "Sala IA", icon: backofficeIcon("editorial"), isActive: activeNav === "editorial" })}
      </nav>
      <div class="side-section-label">Contenido</div>
      <nav class="side-nav">
        ${backofficeNavLink({ href: "/backoffice/polls", label: "Encuestas", icon: backofficeIcon("polls"), isActive: activeNav === "polls" })}
        ${backofficeNavLink({ href: "/backoffice/news/review", label: "Cola revision", icon: backofficeIcon("editor"), isActive: false })}
        ${backofficeNavLink({ href: "/backoffice/users", label: "Usuarios", icon: backofficeIcon("users"), isActive: activeNav === "users" })}
      </nav>
      <div class="side-section-label">Sistema</div>
      <nav class="side-nav">
        ${backofficeNavLink({ href: "/backoffice#autopilot-section", label: "Autopiloto", icon: backofficeIcon("autopilot"), isActive: false })}
        ${backofficeNavLink({ href: "/backoffice#social-section", label: "Social", icon: backofficeIcon("social"), isActive: false })}
        ${backofficeNavLink({ href: "/backoffice#theme-control", label: "Portada", icon: backofficeIcon("layout"), isActive: false })}
      </nav>
      <div class="side-footer">
        <a href="/backoffice/ia-lab"><span class="bo-nav-icon">${backofficeIcon("lab")}</span><span>Diagnostico IA</span></a>
        <a href="/backoffice/logout"><span class="bo-nav-icon">${backofficeIcon("logout")}</span><span>Cerrar sesion</span></a>
      </div>
    </aside>
    <main class="main">
      <div class="wrap">
        <header class="top">
          <div class="brand">
            <small>Dashboard editorial</small>
            <strong>${escapeHtml(title)}</strong>
            <span>Centro de comando para contenido, portada, encuestas y operaciones IA editoriales.</span>
          </div>
          <div class="actions">
            <label class="bo-search" aria-label="Buscar contenido">
              <span class="bo-nav-icon">${backofficeIcon("search")}</span>
              <input type="text" placeholder="Buscar contenido..." />
            </label>
            <div class="bo-user-chip">
              <span class="bo-user-avatar">${backofficeIcon("user")}</span>
              <div class="bo-user-copy">
                <strong>Editor Principal</strong>
                <span>Turno manana</span>
              </div>
            </div>
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
      function syncSidebarActiveState() {
        const links = Array.from(document.querySelectorAll(".bo-nav-link"));
        if (!links.length) {
          return;
        }
        const path = window.location.pathname || "";
        const hash = window.location.hash || "";
        links.forEach((link) => link.classList.remove("is-active"));
        const match = (href) => links.find((link) => link.getAttribute("href") === href) || null;

        if (path.startsWith("/backoffice/news/new")) {
          const target = match("/backoffice/news/new");
          if (target) {
            target.classList.add("is-active");
          }
          return;
        }
        if (path.startsWith("/backoffice/polls")) {
          const target = match("/backoffice/polls");
          if (target) {
            target.classList.add("is-active");
          }
          return;
        }
        if (path.startsWith("/backoffice/news/review")) {
          const target = match("/backoffice/news/review");
          if (target) {
            target.classList.add("is-active");
          }
          return;
        }
        if (path.startsWith("/backoffice/users")) {
          const target = match("/backoffice/users");
          if (target) {
            target.classList.add("is-active");
          }
          return;
        }
        if (path === "/backoffice" && hash) {
          const target = match("/backoffice" + hash);
          if (target) {
            target.classList.add("is-active");
            return;
          }
        }
        const dashboard = match("/backoffice");
        if (dashboard) {
          dashboard.classList.add("is-active");
        }
      }

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
      syncSidebarActiveState();
      window.addEventListener("hashchange", syncSidebarActiveState);
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
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,500;6..72,700;6..72,800&display=swap" rel="stylesheet" />
  <style>
    body { margin:0; min-height:100vh; background:#efefec; display:grid; place-items:center; color:#161616; font-family:Inter, "Segoe UI", Arial, sans-serif; }
    .card { width:min(460px,92vw); border:1px solid #d9d9d5; background:#ffffff; border-radius:16px; padding:24px; box-sizing:border-box; }
    h1 { margin:0 0 4px; letter-spacing:0; font-size:44px; line-height:.95; font-family:Newsreader, Georgia, serif; }
    p { margin:0 0 18px; color:#666; font-size:14px; line-height:1.45; }
    form { display:grid; gap:12px; }
    input { width:100%; border:1px solid #d8d8d4; background:#fff; color:#151515; border-radius:10px; padding:12px; font-size:14px; box-sizing:border-box; }
    input:focus { outline:2px solid rgba(198,162,74,.3); border-color:#d0a72f; }
    button { border:1px solid #d0a72f; border-radius:10px; background:#f2b705; color:#101010; font-weight:700; letter-spacing:.06em; text-transform:uppercase; font-size:12px; padding:12px; cursor:pointer; }
    .error { background:#ffe9e9; border:1px solid #c56a6a; color:#8f2424; border-radius:10px; padding:10px 12px; font-size:13px; margin-bottom:8px; }
    .hint { margin-top:12px; font-size:12px; color:#747474; }
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

export function renderNewsTable(news: News[], options?: { frontendBaseUrl?: string }): string {
  if (news.length === 0) {
    return `<div class="card"><p>No hay noticias creadas. Usa "Nueva Nota" para cargar la primera portada.</p></div>`;
  }
  const frontendBaseUrl = (options?.frontendBaseUrl ?? "").replace(/\/+$/, "");

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
      const openUrl = item.slug
        ? `${frontendBaseUrl}/noticias/${item.slug}`
        : item.sourceUrl && item.sourceUrl.length > 0
          ? item.sourceUrl
          : "";
      const openAction = openUrl
        ? `<a class="button" href="${escapeHtml(openUrl)}" target="_blank" rel="noreferrer">Abrir</a>`
        : `<button type="button" disabled>Abrir</button>`;

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
            ${openAction}
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

type EditorialBatchStudioState = {
  totalItems: number;
  campaignPercent: number;
  campaignTopic: string;
  generalBrief: string;
  useResearchAgent: boolean;
  includeCampaignLine: boolean;
  campaignLine: string;
  publishStatus: string;
  sectionHint: string;
  provinceHint: string;
  requireImageUrl: boolean;
  defaultSourceName: string;
  defaultAuthorName: string;
  defaultSourceUrl: string;
  summary?: string | null;
};

type EditorialRewriteStudioState = {
  instruction: string;
  limit: number;
  scope: string;
  publishStatus: string;
  sectionHint: string;
  provinceHint: string;
  includeCampaignLine: boolean;
  campaignLine: string;
  deleteDuplicates: boolean;
  summary?: string | null;
};

type EditorialCommandPreview = {
  summary: string;
  notes: string[];
  destructive: boolean;
  requiresConfirmation: boolean;
  operations: Array<{
    kind: string;
    title: string;
    detail: string;
  }>;
  model: string;
};

type EditorialCommandStudioState = {
  instruction: string;
  campaignLine: string;
  allowDestructive: boolean;
  autoExecuteSafe: boolean;
  quantityHint?: number | null;
  summary?: string | null;
  planJson?: string | null;
  preview?: EditorialCommandPreview | null;
  history?: EditorialCommandChatMessage[];
  logs?: EditorialCommandLogEntry[];
  pendingPlan?: {
    summary: string;
    planJson: string;
    destructive: boolean;
    requiresConfirmation: boolean;
  } | null;
};

function renderEditorialStudio(params: {
  batch?: Partial<EditorialBatchStudioState>;
  rewrite?: Partial<EditorialRewriteStudioState>;
  command?: Partial<EditorialCommandStudioState>;
  activeMode?: string;
}): string {
  const command: EditorialCommandStudioState = {
    instruction:
      "Revisa las notas externas del sitio, internalizalas como notas propias de Pulso Pais y deja listas las piezas mas relevantes para publicar.",
    campaignLine: "",
    allowDestructive: false,
    autoExecuteSafe: true,
    quantityHint: null,
    summary: "",
    planJson: "",
    preview: null,
    history: [],
    logs: [],
    pendingPlan: null,
    ...(params.command ?? {}),
  };

  const historyItems = (command.history ?? []).map((item) => {
    const roleLabel = item.role === "user" ? "Editor" : item.role === "assistant" ? "IA periodista" : "Sistema";
    const kindLabel = item.kind === "plan" ? "Plan" : item.kind === "execution" ? "Ejecucion" : item.kind === "warning" ? "Alerta" : "Conversacion";
    return `<article class="bo-chat-message ${item.role === "user" ? "is-user" : item.role === "assistant" ? "is-assistant" : "is-system"}">
      <div class="bo-chat-meta">
        <strong>${escapeHtml(roleLabel)}</strong>
        <span>${escapeHtml(kindLabel)} &middot; ${escapeHtml(new Date(item.createdAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }))}</span>
      </div>
      <div class="bo-chat-body">${escapeHtml(item.text).replace(/\r?\n/g, "<br />")}</div>
    </article>`;
  }).join("");

  const logItems = (command.logs ?? []).map((item) => {
    return `<article class="bo-log-item is-${escapeHtml(item.level)}">
      <div class="bo-chat-meta">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(new Date(item.createdAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }))}</span>
      </div>
      <div class="bo-chat-body">${escapeHtml(item.detail).replace(/\r?\n/g, "<br />")}</div>
    </article>`;
  }).join("");

  const previewBlock = command.preview
    ? `<div class="bo-note-box">
        <strong>Plan propuesto por la IA</strong>
        <p>${escapeHtml(command.preview.summary)}</p>
        <div class="bo-inline-stat">
          <span>${command.preview.operations.length} operacion${command.preview.operations.length === 1 ? "" : "es"}</span>
          <span>${command.preview.destructive ? "Plan destructivo" : "Sin borrados"}</span>
          <span>${command.preview.requiresConfirmation ? "Requiere confirmacion" : "Apto para autoejecucion"}</span>
        </div>
        <div class="grid" style="gap:10px; margin-top:10px;">
          ${command.preview.operations
            .map((operation, index) => `<div class="bo-soft-line"><strong>${String(index + 1).padStart(2, "0")} | ${escapeHtml(operation.title)}</strong><span>${escapeHtml(operation.detail)}</span></div>`)
            .join("")}
        </div>
      </div>`
    : "";

  const pendingBlock = command.pendingPlan
    ? `<div class="bo-note-box bo-note-box-warn">
        <strong>Confirmacion pendiente</strong>
        <p>${escapeHtml(command.pendingPlan.summary)}</p>
        <div class="bo-inline-stat">
          <span>${command.pendingPlan.destructive ? "Incluye borrados" : "Sin borrados"}</span>
          <span>${command.pendingPlan.requiresConfirmation ? "Confirmacion obligatoria" : "Listo para correr"}</span>
        </div>
        <form method="post" action="/backoffice/editorial-command/confirm" style="display:grid; gap:10px; margin-top:12px;">
          <textarea name="planJson" class="editor-hidden">${escapeHtml(command.pendingPlan.planJson)}</textarea>
          <input type="hidden" name="campaignLine" value="${escapeHtml(command.campaignLine)}" />
          <label class="ai-inline">
            <input type="checkbox" name="allowDestructive" ${command.allowDestructive ? "checked" : ""} />
            Confirmo la ejecucion del plan y acepto el nivel de riesgo informado.
          </label>
          <div class="bo-form-actions">
            <button type="submit" class="primary">Confirmar y ejecutar</button>
            <button type="submit" class="button" formaction="/backoffice/editorial-command/history/clear-pending">Descartar plan pendiente</button>
          </div>
        </form>
      </div>`
    : "";

  return `<div class="editor-card" id="studio">
    <div class="split-title">
      <div>
        <div class="bo-kicker">IA periodista</div>
        <h3 style="margin-top:8px;">Consola editorial conversacional</h3>
      </div>
      <span class="mini-tag">chat + plan + ejecucion + memoria</span>
    </div>
    <p class="muted">Habla con la IA como si fuera tu mesa editorial. Puede investigar, explicar que esta haciendo, crear una nota o varias, internalizar externas, editar metadatos y preparar borrados con confirmacion. Todo lo conversado queda en contexto y el sistema guarda logs operativos.</p>

    ${command.summary ? `<div class="flash">${escapeHtml(command.summary)}</div>` : ""}

    <div class="bo-chat-layout">
      <section class="bo-chat-main">
        <div class="bo-chat-feed ${historyItems ? '' : 'is-empty'}">
          ${historyItems || `<div class="bo-note-box"><strong>Sin historial todavia</strong><p>La consola empieza a construir memoria cuando le das la primera instruccion. Puedes pedir estado, investigar agenda, crear varias notas o limpiar pruebas.</p></div>`}
        </div>

        ${previewBlock}
        ${pendingBlock}

        <form method="post" action="/backoffice/editorial-command/chat" class="bo-chat-form">
          <div class="field">
            <label for="commandInstruction">Habla con la IA periodista</label>
            <textarea id="commandInstruction" name="instruction" rows="5" placeholder="Ej: elimina todas las noticias de prueba y luego investiga agenda caliente para publicar 4 notas propias con foto valida.">${escapeHtml(command.instruction)}</textarea>
            <p class="hint">Puedes pedir crear una nota o varias, reescribir externas, limpiar pruebas, explicar que esta haciendo o consultar logs. Si el pedido es destructivo, el sistema obligara confirmacion antes de ejecutar.</p>
          </div>
          <div class="bo-compact-grid">
            <div class="field">
              <label for="commandQuantityHint">Cantidad objetivo (opcional)</label>
              <input id="commandQuantityHint" name="quantityHint" type="number" min="1" max="40" value="${typeof command.quantityHint === "number" && Number.isFinite(command.quantityHint) ? command.quantityHint : ""}" />
            </div>
            <div class="field">
              <label for="commandCampaignLine">Bajada editorial / foco temporal</label>
              <textarea id="commandCampaignLine" name="campaignLine" rows="2">${escapeHtml(command.campaignLine)}</textarea>
            </div>
          </div>
          <div class="checks">
            <label><input type="checkbox" name="allowDestructive" ${command.allowDestructive ? "checked" : ""} /> Permitir que la IA proponga borrados si el pedido lo exige</label>
            <label><input type="checkbox" name="autoExecuteSafe" ${command.autoExecuteSafe ? "checked" : ""} /> Autoejecutar si el plan no incluye riesgo destructivo</label>
          </div>
          <div class="bo-form-actions">
            <button type="submit" class="primary" data-submit-label="Consultando a la IA periodista...">Enviar a IA editorial</button>
            <button type="submit" class="button" formaction="/backoffice/editorial-command/history/clear">Limpiar historial</button>
          </div>
        </form>
      </section>

      <aside class="bo-chat-side">
        <div class="bo-soft-card">
          <h4>Que puede hacer</h4>
          <p>Crear 1 nota o varias en un mismo pedido, internalizar noticias externas, reescribir existentes, actualizar flags y preparar limpieza total o parcial del CMS con confirmacion.</p>
        </div>
        <div class="bo-soft-card">
          <h4>Bitacora operativa</h4>
          <div class="bo-log-list ${logItems ? '' : 'is-empty'}">
            ${logItems || `<p class="muted">Todavia no hay logs. Cada plan, ejecucion o error importante queda registrado aca.</p>`}
          </div>
        </div>
        <div class="bo-soft-card">
          <h4>Metodo editorial</h4>
          <p>La IA trabaja como radar, reportero, editor y estilista de marca, con compliance encima. No se le asigna ideologia: se le imponen reglas de interes publico, verificacion minima, foco en consecuencias reales y veto a propaganda obvia.</p>
        </div>
      </aside>
    </div>
  </div>`;
}

export function renderNewsForm(params: {
  mode: "create" | "edit";
  action: string;
  data?: Partial<News>;
  error?: string;
  aiResearch?: {
    enabled: boolean;
    hotNewsLimit: number;
    fetchArticleText: boolean;
    cropImage: boolean;
    cropWidth: number;
    cropHeight: number;
    internalizeSourceLinks: boolean;
    campaignLine: string;
  };
  editorialStudio?: {
    activeMode?: string;
    batch?: Partial<EditorialBatchStudioState>;
    rewrite?: Partial<EditorialRewriteStudioState>;
    command?: Partial<EditorialCommandStudioState>;
  };
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
  const aiResearch = {
    enabled: params.aiResearch?.enabled ?? true,
    hotNewsLimit: params.aiResearch?.hotNewsLimit ?? 12,
    fetchArticleText: params.aiResearch?.fetchArticleText ?? true,
    cropImage: params.aiResearch?.cropImage ?? true,
    cropWidth: params.aiResearch?.cropWidth ?? 1200,
    cropHeight: params.aiResearch?.cropHeight ?? 675,
    internalizeSourceLinks: params.aiResearch?.internalizeSourceLinks ?? true,
    campaignLine: params.aiResearch?.campaignLine ?? "",
  };

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

  const studioParams: {
    activeMode?: string;
    batch?: Partial<EditorialBatchStudioState>;
    rewrite?: Partial<EditorialRewriteStudioState>;
    command?: Partial<EditorialCommandStudioState>;
  } = {};

  if (params.editorialStudio?.activeMode) {
    studioParams.activeMode = params.editorialStudio.activeMode;
  }
  if (params.editorialStudio?.batch) {
    studioParams.batch = params.editorialStudio.batch;
  }
  if (params.editorialStudio?.rewrite) {
    studioParams.rewrite = params.editorialStudio.rewrite;
  }
  if (params.editorialStudio?.command) {
    studioParams.command = params.editorialStudio.command;
  }

  const studioBlock =
    mode === "create"
      ? renderEditorialStudio(studioParams)
      : "";

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
        ${studioBlock}
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
            const campaignLineEl = document.getElementById("aiCampaignLine");
            const generateBtn = document.getElementById("aiGenerateBtn");
            const researchBtn = document.getElementById("aiResearchBtn");
            const askBtn = document.getElementById("aiAskBtn");
            const reviewBtn = document.getElementById("aiReviewBtn");
            const applyBtn = document.getElementById("aiApplyBtn");
            const askAutoApply = document.getElementById("aiAskAutoApply");
            const includeCampaignEl = document.getElementById("aiResearchIncludeCampaign");
            const statusEl = document.getElementById("aiStatus");
            const connBadge = document.getElementById("aiConnBadge");
            const answerEl = document.getElementById("aiAnswer");
            const reviewEl = document.getElementById("aiReview");
            const bodyEditor = document.getElementById("bodyEditor");
            const toolbar = document.getElementById("editorToolbar");
            const imagePreview = document.getElementById("imagePreview");
            let lastSuggestions = null;
            let canApply = false;

            if (!form || !briefEl || !generateBtn || !researchBtn || !askBtn || !reviewBtn || !applyBtn || !statusEl || !answerEl || !reviewEl || !bodyEditor || !toolbar || !imagePreview || !connBadge || !campaignLineEl || !includeCampaignEl) {
              return;
            }

            const buttons = {
              generate: generateBtn,
              research: researchBtn,
              ask: askBtn,
              review: reviewBtn,
              apply: applyBtn,
            };
            const studioTabs = Array.from(document.querySelectorAll("[data-studio-tab]"));
            const studioPanels = Array.from(document.querySelectorAll("[data-studio-panel]"));
            const studioForms = Array.from(document.querySelectorAll("[data-studio-submit]"));

            function notify(message, level) {
              if (typeof window.pulsoToast === "function") {
                window.pulsoToast(message, level || "");
              }
            }

            function activateStudioTab(mode) {
              if (!studioTabs.length || !studioPanels.length) {
                return;
              }
              studioTabs.forEach(function (button) {
                button.classList.toggle("is-active", button.getAttribute("data-studio-tab") === mode);
              });
              studioPanels.forEach(function (panel) {
                panel.classList.toggle("is-active", panel.getAttribute("data-studio-panel") === mode);
              });
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
              const sourceUrl = value("sourceUrl");

              function normalizePreviewUrl(raw) {
                if (!raw) {
                  return "";
                }
                try {
                  const parsed = new URL(String(raw).trim());
                  const host = parsed.hostname.toLowerCase();
                  if ((host.includes("weserv.nl") || host === "wsrv.nl") && parsed.searchParams.has("url")) {
                    return decodeURIComponent(parsed.searchParams.get("url") || "");
                  }
                  return parsed.toString();
                } catch (_error) {
                  return String(raw).trim();
                }
              }

              const previewUrl = normalizePreviewUrl(imageUrl);

              if (!previewUrl) {
                imagePreview.classList.remove("has-image");
                imagePreview.innerHTML = "Sin imagen cargada";
                return;
              }
              imagePreview.classList.add("has-image");
              const imageEl = document.createElement("img");
              imageEl.alt = "Preview";
              imageEl.loading = "lazy";
              imageEl.src = previewUrl;
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

            if (studioTabs.length && studioPanels.length) {
              studioTabs.forEach(function (button) {
                button.addEventListener("click", function () {
                  activateStudioTab(button.getAttribute("data-studio-tab") || "single");
                });
              });
              activateStudioTab(
                studioTabs.find(function (button) { return button.classList.contains("is-active"); })?.getAttribute("data-studio-tab") || "single",
              );
            }

            if (studioForms.length) {
              studioForms.forEach(function (studioForm) {
                studioForm.addEventListener("submit", function (event) {
                  const submitter = event.submitter;
                  const label = submitter && submitter.getAttribute ? submitter.getAttribute("data-submit-label") : "";
                  const message = label || "Operacion editorial recibida. Procesando IA...";
                  if (submitter) {
                    submitter.disabled = true;
                    submitter.classList.add("is-running");
                  }
                  setStatus(message, "warn");
                  notify(message, "warn");
                });
              });
            }

            function buildAssistPayload(brief) {
              syncBody();
              const includeCampaign = Boolean(includeCampaignEl && "checked" in includeCampaignEl && includeCampaignEl.checked);
              const campaignLine = includeCampaign ? String(campaignLineEl.value || "").trim() : "";
              return {
                brief: brief,
                campaignLine: campaignLine,
                includeCampaignLine: includeCampaign,
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

            researchBtn.addEventListener("click", async function () {
              const brief = briefEl.value.trim();
              if (brief.length < 12) {
                setStatus("El brief debe tener al menos 12 caracteres.", "error");
                notify("Escribe un brief mas completo para investigar y generar.", "error");
                return;
              }
              if (researchBtn.disabled) {
                setStatus("El agente periodista esta desactivado en panel de backoffice.", "warn");
                notify("Activa el agente periodista en el panel para usar esta funcion.", "warn");
                return;
              }

              try {
                setBusy(true, "Solicitud recibida: investigando agenda caliente...", "research");
                const payload = buildAssistPayload(brief);
                const response = await fetch("/backoffice/ai/research-assist", {
                  method: "POST",
                  headers: {
                    "content-type": "application/json",
                    accept: "application/json",
                  },
                  body: JSON.stringify(payload),
                });
                const result = await readJson(response);
                if (!response.ok) {
                  throw new Error(result.error || "No se pudo investigar y generar la nota.");
                }

                const suggestion = result.suggestion || {};
                lastSuggestions = suggestion;
                applySuggestion(suggestion);
                ensureDraftCompleteness(brief);
                setCanApply(Boolean(suggestion && typeof suggestion === "object"));

                const firstSource = Array.isArray(result.sources) && result.sources.length > 0 ? result.sources[0] : null;
                const sourceHint = firstSource && firstSource.sourceName
                  ? " | Fuente caliente: " + firstSource.sourceName
                  : "";
                answerEl.style.display = "none";
                setStatus(
                  "Nota propia generada tras investigacion IA (" +
                    (suggestion.model || "modelo desconocido") +
                    ")" +
                    sourceHint +
                    contextHint(result.context),
                  "ok",
                );
                notify("Investigacion completada y noticia propia autocompletada.", "ok");
              } catch (error) {
                setStatus(error instanceof Error ? error.message : "Error al investigar y generar noticia.", "error");
                notify("No se pudo completar la investigacion periodistica IA.", "error");
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
              <input type="password" name="password" required minlength="10" maxlength="120" placeholder="Minimo 10 chars + mayuscula, minuscula, numero y simbolo" />
              <p class="hint">Regla de seguridad: 10+ caracteres con mayuscula, minuscula, numero y simbolo.</p>
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
            <button type="button" id="pollAiGenerateBtn" class="primary ai-main-action">&#9889; Genera con IA encuesta</button>
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
                setFieldValue("question", "A quien le confiarias el pais en 2027?");
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



