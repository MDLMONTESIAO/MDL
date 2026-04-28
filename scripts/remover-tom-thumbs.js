const fs = require('fs');
const path = require('path');

const root = process.cwd();
const stylesPath = path.join(root, 'public', 'styles.css');

if (!fs.existsSync(stylesPath)) {
  console.error('Não encontrei public/styles.css. Rode este script na raiz do projeto.');
  process.exit(1);
}

const markerStart = '/* === MDL: remover indicação de tom nas thumbs - início === */';
const markerEnd = '/* === MDL: remover indicação de tom nas thumbs - fim === */';

const cssBlock = `${markerStart}
/*
  Remove a bolinha/letra do tom que aparece sobre as capas/thumbs.
  Não remove o tom da cifra, nem do leitor; apenas esconde nos cards visuais.
*/
.song-card > b,
.song-card > .song-key,
.song-card > .key-badge,
.song-card > .tone-badge,
.song-card > [data-key],
.song-card > [data-tone],
.artist-song-card > b,
.artist-song-card > .song-key,
.artist-song-card > .key-badge,
.artist-song-card > .tone-badge,
.artist-song-card > [data-key],
.artist-song-card > [data-tone],
.library-song-card > b,
.library-song-card > .song-key,
.library-song-card > .key-badge,
.library-song-card > .tone-badge,
.library-song-card > [data-key],
.library-song-card > [data-tone],
.song-cover-badge,
.song-tone,
.song-key-badge,
.tone-chip,
.key-chip {
  display: none !important;
}

/* Caso a indicação do tom seja o primeiro elemento absoluto dentro do card */
.song-card > :is(span, strong, em):first-child,
.artist-song-card > :is(span, strong, em):first-child,
.library-song-card > :is(span, strong, em):first-child {
  display: none !important;
}
${markerEnd}`;

let css = fs.readFileSync(stylesPath, 'utf8');
const start = css.indexOf(markerStart);
const end = css.indexOf(markerEnd);

if (start !== -1 && end !== -1 && end > start) {
  css = css.slice(0, start).trimEnd() + '\n\n' + cssBlock + css.slice(end + markerEnd.length);
} else {
  css = css.trimEnd() + '\n\n' + cssBlock + '\n';
}

fs.writeFileSync(stylesPath, css, 'utf8');
console.log('OK: indicação do tom nas thumbs removida em public/styles.css');
