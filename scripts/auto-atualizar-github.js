const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_BRANCH = process.env.AUTO_GIT_BRANCH || "main";
const COMMIT_PREFIX = process.env.AUTO_GIT_COMMIT_PREFIX || "Atualiza acervo de cifras";
const TRACKED_PATHS = [
  "acervo",
  "data/acervo-db.json",
  "data/artist-thumbs",
  "data/artist-thumbs.json",
  "data/index.json",
  "data/songs"
];

loadLocalEnv();

async function main() {
  run("node", ["scripts/preparar-artist-thumbs.js"]);
  run("node", ["scripts/importar-acervo.js"]);

  const status = git(["status", "--porcelain", "--", ...TRACKED_PATHS], { capture: true }).trim();
  if (!status) {
    console.log("Nenhuma mudanca de acervo para enviar ao GitHub.");
    return;
  }

  git(["add", "-A", "--", ...TRACKED_PATHS]);

  const stagedAcervo = git(["diff", "--cached", "--name-only", "--", ...TRACKED_PATHS], { capture: true }).trim();
  if (!stagedAcervo) {
    console.log("Nenhuma mudanca de acervo ficou preparada para commit.");
    return;
  }

  const message = `${COMMIT_PREFIX} - ${formatTimestamp(new Date())}`;
  git(["commit", "-m", message, "--", ...TRACKED_PATHS]);

  git(["fetch", "origin", DEFAULT_BRANCH]);
  const aheadBehind = git(["rev-list", "--left-right", "--count", `HEAD...origin/${DEFAULT_BRANCH}`], { capture: true }).trim();
  const [_ahead, behind] = aheadBehind.split(/\s+/).map((value) => Number(value || 0));
  if (behind > 0) {
    console.log(`Atualizando branch local com origin/${DEFAULT_BRANCH} antes do push...`);
    git(["pull", "--rebase", "--autostash", "origin", DEFAULT_BRANCH]);
  }

  git(["push", "origin", DEFAULT_BRANCH]);
  await triggerRenderDeploy();

  console.log("Acervo atualizado e enviado ao GitHub com sucesso.");
}

function loadLocalEnv() {
  const envPath = path.join(ROOT, "config-local.env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function triggerRenderDeploy() {
  const deployHookUrl = (process.env.RENDER_DEPLOY_HOOK_URL || "").trim();
  if (!deployHookUrl) {
    console.log("Deploy Render nao configurado. Defina RENDER_DEPLOY_HOOK_URL para disparar automaticamente.");
    return;
  }

  console.log("Disparando deploy automatico no Render...");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(deployHookUrl, {
      method: "POST",
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Render respondeu ${response.status}${body ? `: ${body}` : ""}`);
    }

    console.log("Deploy Render disparado com sucesso.");
  } finally {
    clearTimeout(timeout);
  }
}

function git(args, options = {}) {
  return run("git", args, options);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    shell: false,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit"
  });

  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`Falha ao executar: ${command} ${args.join(" ")}${details ? `\n${details}` : ""}`);
  }

  return result.stdout || "";
}

function formatTimestamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + " " + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("-");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
