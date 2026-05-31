const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const WATCH_DIR = process.env.ACERVO_WATCH_DIR
  ? path.resolve(process.env.ACERVO_WATCH_DIR)
  : path.join(ROOT, "acervo", "cifras_multi");
const DEBOUNCE_MS = Number(process.env.ACERVO_WATCH_DEBOUNCE_MS || 5000);

let timer = null;
let running = false;
let rerunRequested = false;

function main() {
  if (!fs.existsSync(WATCH_DIR)) {
    throw new Error(`Pasta de cifras nao encontrada: ${WATCH_DIR}`);
  }

  console.log(`Monitorando cifras em: ${WATCH_DIR}`);
  console.log("Quando um arquivo mudar, o acervo sera importado, commitado e enviado ao GitHub.");
  console.log("Pressione Ctrl+C para parar.");

  fs.watch(WATCH_DIR, { recursive: true }, (_eventType, fileName) => {
    if (!isSupportedFile(fileName)) return;
    scheduleUpdate(fileName);
  });
}

function scheduleUpdate(fileName) {
  clearTimeout(timer);
  console.log(`Mudanca detectada: ${fileName || "arquivo de cifra"}`);
  timer = setTimeout(runUpdate, DEBOUNCE_MS);
}

function runUpdate() {
  if (running) {
    rerunRequested = true;
    return;
  }

  running = true;
  const child = spawn("node", ["scripts/auto-atualizar-github.js"], {
    cwd: ROOT,
    shell: false,
    stdio: "inherit"
  });

  child.on("exit", (code) => {
    running = false;
    if (code !== 0) {
      console.error(`Atualizacao encerrada com erro. Codigo: ${code}`);
    }
    if (rerunRequested) {
      rerunRequested = false;
      scheduleUpdate("mudancas pendentes");
    }
  });
}

function isSupportedFile(fileName) {
  if (!fileName) return true;
  return /\.(html?|txt)$/i.test(String(fileName));
}

main();
