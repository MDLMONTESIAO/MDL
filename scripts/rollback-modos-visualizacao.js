const fs = require("fs");
const path = require("path");

const root = process.cwd();
const indexPath = path.join(root, "public", "index.html");
const stylesPath = path.join(root, "public", "styles.css");

function read(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function write(file, content) {
  fs.writeFileSync(file, content, "utf8");
}

function removeModeReferencesFromIndex() {
  if (!fs.existsSync(indexPath)) {
    console.error("Arquivo não encontrado: public/index.html");
    process.exit(1);
  }

  let html = read(indexPath);
  const before = html;

  // Remove CSS/JS dos modos de visualização.
  html = html
    .replace(/^\s*<link[^>]+href=["'][^"']*(?:artist-view-modes|view-modes)\.css(?:\?[^"']*)?["'][^>]*>\s*$/gmi, "")
    .replace(/^\s*<script[^>]+src=["'][^"']*(?:artist-view-modes|view-modes)\.js(?:\?[^"']*)?["'][^>]*>\s*<\/script>\s*$/gmi, "");

  // Remove toolbars estáticas.
  html = html
    .replace(/<div[^>]*class=["'][^"']*(?:artist-view-mode-toolbar|artist-view-modes|view-mode-toolbar|view-modes-toolbar|library-view-mode-toolbar)[^"']*["'][\s\S]*?<\/div>/gi, "")
    .replace(/<section[^>]*class=["'][^"']*(?:artist-view-mode-toolbar|artist-view-modes|view-mode-toolbar|view-modes-toolbar|library-view-mode-toolbar)[^"']*["'][\s\S]*?<\/section>/gi, "");

  // Remove textos soltos.
  html = html
    .replace(/\s*Lista\s*Ícones pequenos\s*Ícones grandes\s*/gi, "")
    .replace(/\s*Lista\s*Icones pequenos\s*Icones grandes\s*/gi, "");

  if (html !== before) {
    write(indexPath, html);
    console.log("OK: referências dos modos removidas de public/index.html");
  } else {
    console.log("INFO: nenhuma referência dos modos encontrada no index.html");
  }
}

function addSafeCssReset() {
  if (!fs.existsSync(stylesPath)) {
    console.error("Arquivo não encontrado: public/styles.css");
    process.exit(1);
  }

  let css = read(stylesPath);
  const marker = "/* === ROLLBACK MDL: restaura cards originais === */";

  const resetCss = `
${marker}

/*
  Desfaz os efeitos visuais dos modos Lista / Ícones pequenos / Ícones grandes.
  Mantém o sistema estável e remove a bolinha do tom nos cards/thumbs.
*/

.artist-view-mode-toolbar,
.artist-view-modes,
.view-mode-toolbar,
.view-modes-toolbar,
.library-view-mode-toolbar,
#artistViewModeToolbar,
#viewModeToolbar {
  display: none !important;
}

body[data-artist-view-mode],
body[data-library-view-mode],
body[data-view-mode] {
  --mdl-view-mode-reset: 1;
}

.song-list {
  display: grid !important;
  gap: 9px !important;
}

.song-card,
.artist-card {
  min-height: 70px !important;
  border-radius: 8px !important;
  background: var(--paper-2) !important;
  border: 1px solid var(--line) !important;
  color: var(--text) !important;
  display: grid !important;
  grid-template-columns: 1fr auto !important;
  gap: 8px !important;
  align-items: center !important;
  padding: 10px !important;
  overflow: visible !important;
  box-shadow: none !important;
  background-image: none !important;
}

.song-card::before,
.song-card::after,
.artist-card::before,
.artist-card::after {
  display: none !important;
  content: none !important;
}

.song-main,
.artist-main {
  min-width: 0 !important;
  display: grid !important;
  gap: 4px !important;
  padding: 0 !important;
  border: 0 !important;
  background: transparent !important;
  color: inherit !important;
  text-align: left !important;
  justify-items: start !important;
  align-items: center !important;
}

.song-title,
.artist-title {
  min-width: 0 !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
  font-size: 15px !important;
  line-height: 1.18 !important;
  font-weight: 950 !important;
  color: var(--text) !important;
  opacity: 1 !important;
  text-shadow: none !important;
}

.song-meta,
.artist-meta {
  color: var(--muted) !important;
  font-size: 12px !important;
  line-height: 1.25 !important;
  font-weight: 750 !important;
  opacity: 1 !important;
  text-shadow: none !important;
}

.song-actions,
.artist-actions {
  display: flex !important;
  align-items: center !important;
  gap: 6px !important;
  position: static !important;
  transform: none !important;
}

/* Remove bolinha/letra do tom nas thumbs/cards, mantendo o tom no leitor da cifra */
.song-card > b,
.song-card > strong:first-child,
.song-card > span:first-child,
.song-card .song-key,
.song-card .key-badge,
.song-card .tone-badge,
.song-card .tom-badge,
.song-card .song-tone,
.song-card .music-key,
.song-card [data-key],
.song-card [data-tone],
.song-card [data-tom],
.artist-song-card > b,
.artist-song-card > strong:first-child,
.artist-song-card > span:first-child,
.artist-song-card .song-key,
.artist-song-card .key-badge,
.artist-song-card .tone-badge,
.artist-song-card .tom-badge,
.artist-song-card .song-tone,
.artist-song-card .music-key,
.artist-song-card [data-key],
.artist-song-card [data-tone],
.artist-song-card [data-tom] {
  display: none !important;
}

@media (min-width: 700px) {
  .song-list {
    grid-template-columns: 1fr !important;
  }

  .song-card,
  .artist-card {
    min-height: 72px !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
  }
}
`;

  if (css.includes(marker)) {
    css = css.replace(new RegExp(`${marker}[\\s\\S]*$`), resetCss.trimStart());
  } else {
    css = css.trimEnd() + "\n\n" + resetCss.trimStart();
  }

  write(stylesPath, css);
  console.log("OK: CSS de restauração aplicado em public/styles.css");
}

function neutralizeModeFiles() {
  const files = [
    path.join(root, "public", "artist-view-modes.css"),
    path.join(root, "public", "artist-view-modes.js"),
    path.join(root, "public", "view-modes.css"),
    path.join(root, "public", "view-modes.js")
  ];

  for (const file of files) {
    if (fs.existsSync(file)) {
      const ext = path.extname(file);
      const content = ext === ".js"
        ? "// Arquivo neutralizado pelo rollback dos modos de visualização.\n"
        : "/* Arquivo neutralizado pelo rollback dos modos de visualização. */\n";
      write(file, content);
      console.log("OK: neutralizado", path.relative(root, file));
    }
  }
}

removeModeReferencesFromIndex();
addSafeCssReset();
neutralizeModeFiles();

console.log("");
console.log("Rollback concluído.");
