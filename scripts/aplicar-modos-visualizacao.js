const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const indexPath = path.join(ROOT, "public", "index.html");

if (!fs.existsSync(indexPath)) {
  console.error("Não encontrei public/index.html. Rode este script na raiz do projeto.");
  process.exit(1);
}

let html = fs.readFileSync(indexPath, "utf8");

const cssTag = '<link rel="stylesheet" href="/view-modes.css?v=20260428-view-modes">';
const jsTag = '<script defer src="/view-modes.js?v=20260428-view-modes"></script>';

if (!html.includes("/view-modes.css")) {
  html = html.replace("</head>", `  ${cssTag}\n</head>`);
}

if (!html.includes("/view-modes.js")) {
  html = html.replace("</body>", `  ${jsTag}\n</body>`);
}

fs.writeFileSync(indexPath, html, "utf8");

console.log("Ajuste aplicado com sucesso:");
console.log("- public/index.html atualizado");
console.log("- Botões de visualização ativados para tablet e PC");
