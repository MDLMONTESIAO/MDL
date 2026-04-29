const fs = require("fs");
const path = require("path");

const cssPath = path.join(process.cwd(), "public", "artist-view-modes.css");

if (!fs.existsSync(cssPath)) {
  console.error("Arquivo não encontrado: public/artist-view-modes.css");
  process.exit(1);
}

let css = fs.readFileSync(cssPath, "utf8");

const marker = "/* === Correção de contraste do modo lista - MDL === */";

const fix = `
${marker}

/*
  Corrige a leitura dos nomes das músicas no modo Lista.
  Mantém o modo escuro elegante e garante contraste correto no modo claro.
*/

@media (min-width: 700px) {
  html[data-theme="light"] body[data-artist-view-mode="list"] #songList .song-card,
  html[data-theme="light"] body[data-artist-view-mode="list"] .song-list .song-card,
  html[data-theme="light"] .artist-view-mode-list #songList .song-card,
  html[data-theme="light"] .artist-view-mode-list .song-list .song-card {
    background: #fffaf2 !important;
    border-color: rgba(21, 18, 15, .16) !important;
    color: #15120f !important;
    box-shadow: 0 10px 26px rgba(30, 20, 8, .08) !important;
  }

  html[data-theme="light"] body[data-artist-view-mode="list"] #songList .song-title,
  html[data-theme="light"] body[data-artist-view-mode="list"] .song-list .song-title,
  html[data-theme="light"] body[data-artist-view-mode="list"] #songList .song-main,
  html[data-theme="light"] body[data-artist-view-mode="list"] .song-list .song-main,
  html[data-theme="light"] .artist-view-mode-list #songList .song-title,
  html[data-theme="light"] .artist-view-mode-list .song-list .song-title,
  html[data-theme="light"] .artist-view-mode-list #songList .song-main,
  html[data-theme="light"] .artist-view-mode-list .song-list .song-main {
    color: #15120f !important;
    opacity: 1 !important;
    text-shadow: none !important;
  }

  html[data-theme="light"] body[data-artist-view-mode="list"] #songList .song-meta,
  html[data-theme="light"] body[data-artist-view-mode="list"] .song-list .song-meta,
  html[data-theme="light"] .artist-view-mode-list #songList .song-meta,
  html[data-theme="light"] .artist-view-mode-list .song-list .song-meta {
    color: #5f5447 !important;
    opacity: 1 !important;
    text-shadow: none !important;
  }

  html[data-theme="dark"] body[data-artist-view-mode="list"] #songList .song-card,
  html[data-theme="dark"] body[data-artist-view-mode="list"] .song-list .song-card,
  html[data-theme="dark"] .artist-view-mode-list #songList .song-card,
  html[data-theme="dark"] .artist-view-mode-list .song-list .song-card {
    background: #101a2b !important;
    border-color: rgba(255, 255, 255, .09) !important;
    color: #ffffff !important;
  }

  html[data-theme="dark"] body[data-artist-view-mode="list"] #songList .song-title,
  html[data-theme="dark"] body[data-artist-view-mode="list"] .song-list .song-title,
  html[data-theme="dark"] body[data-artist-view-mode="list"] #songList .song-main,
  html[data-theme="dark"] body[data-artist-view-mode="list"] .song-list .song-main,
  html[data-theme="dark"] .artist-view-mode-list #songList .song-title,
  html[data-theme="dark"] .artist-view-mode-list .song-list .song-title,
  html[data-theme="dark"] .artist-view-mode-list #songList .song-main,
  html[data-theme="dark"] .artist-view-mode-list .song-list .song-main {
    color: #ffffff !important;
    opacity: 1 !important;
    text-shadow: none !important;
  }

  html[data-theme="dark"] body[data-artist-view-mode="list"] #songList .song-meta,
  html[data-theme="dark"] body[data-artist-view-mode="list"] .song-list .song-meta,
  html[data-theme="dark"] .artist-view-mode-list #songList .song-meta,
  html[data-theme="dark"] .artist-view-mode-list .song-list .song-meta {
    color: #c7d2e3 !important;
    opacity: 1 !important;
    text-shadow: none !important;
  }

  body[data-artist-view-mode="list"] #songList .song-card::before,
  body[data-artist-view-mode="list"] .song-list .song-card::before,
  .artist-view-mode-list #songList .song-card::before,
  .artist-view-mode-list .song-list .song-card::before {
    opacity: 0 !important;
    display: none !important;
  }

  body[data-artist-view-mode="list"] #songList .song-card *,
  body[data-artist-view-mode="list"] .song-list .song-card *,
  .artist-view-mode-list #songList .song-card *,
  .artist-view-mode-list .song-list .song-card * {
    text-shadow: none !important;
  }
}
`;

if (css.includes(marker)) {
  css = css.replace(new RegExp(`${marker}[\\s\\S]*$`), fix.trimStart());
} else {
  css = css.trimEnd() + "\n\n" + fix.trimStart();
}

fs.writeFileSync(cssPath, css, "utf8");

console.log("OK: contraste do modo Lista corrigido em public/artist-view-modes.css");
