const fs = require("fs");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const net = require("net");
const tls = require("tls");
const { spawn } = require("child_process");

const PORT = Number(process.env.PORT || 3030);
const PUBLIC_DIR = path.join(__dirname, "public");
const APP_DATA_DIR = path.join(__dirname, "data");
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : APP_DATA_DIR;
const CONFIG_PATH = path.join(APP_DATA_DIR, "pastas.json");
const DB_PATH = path.join(DATA_DIR, "acervo-db.json");
const FALLBACK_DB_PATH = path.join(APP_DATA_DIR, "acervo-db.json");
const INDEX_PATH = path.join(DATA_DIR, "index.json");
const FALLBACK_INDEX_PATH = path.join(APP_DATA_DIR, "index.json");
const SONGS_DIR = path.join(DATA_DIR, "songs");
const FALLBACK_SONGS_DIR = path.join(APP_DATA_DIR, "songs");
const ARTIST_THUMBS_PATH = path.join(DATA_DIR, "artist-thumbs.json");
const FALLBACK_ARTIST_THUMBS_PATH = path.join(APP_DATA_DIR, "artist-thumbs.json");
const ARTIST_THUMBS_DIR = path.join(DATA_DIR, "artist-thumbs");
const FALLBACK_ARTIST_THUMBS_DIR = path.join(APP_DATA_DIR, "artist-thumbs");
const IMPORT_SCRIPT = path.join(__dirname, "scripts", "importar-acervo.js");
const AUTH_PATH = path.join(DATA_DIR, "auth.json");
const DEVICE_HEADER = "x-device-id";
const TOKEN_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;
const RESET_CODE_TTL_MS = 1000 * 60 * 15;
const RESET_RESEND_INTERVAL_MS = 1000 * 60;
const ARTIST_THUMB_MAX_BYTES = 4 * 1024 * 1024;
const LOCAL_RESET_PREVIEW = !process.env.RENDER && !process.env.RENDER_SERVICE_ID && process.env.NODE_ENV !== "production";
const SMTP_SECURE = /^(1|true|yes)$/i.test(String(process.env.SMTP_SECURE || ""));
const SMTP_HOST = String(process.env.SMTP_HOST || "").trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || (SMTP_SECURE ? 465 : 587));
const SMTP_USER = String(process.env.SMTP_USER || "").trim();
const SMTP_PASS = String(process.env.SMTP_PASS || "");
const SMTP_FROM = String(process.env.SMTP_FROM || SMTP_USER || "").trim();
const SMTP_HELO = String(process.env.SMTP_HELO || "mdl-inova.local").trim();
const AUTH_USERS = {
  lider: { label: "Lider", role: "leader", defaultPassword: "1234" },
  musico: { label: "Musico", role: "musician", defaultPassword: "1234" }
};

let importRunning = false;
let importQueued = false;
let importTimer = null;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function readCatalogDb() {
  const dbPath = fs.existsSync(DB_PATH) ? DB_PATH : FALLBACK_DB_PATH;
  if (!fs.existsSync(dbPath)) return null;
  return JSON.parse(fs.readFileSync(dbPath, "utf8"));
}

function readSongRecord(id) {
  const safeId = String(id || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeId) return null;
  const primarySongPath = path.join(SONGS_DIR, `${safeId}.json`);
  const fallbackSongPath = path.join(FALLBACK_SONGS_DIR, `${safeId}.json`);
  const songPath = fs.existsSync(primarySongPath) ? primarySongPath : fallbackSongPath;
  if (!fs.existsSync(songPath)) return null;
  return JSON.parse(fs.readFileSync(songPath, "utf8"));
}

function readArtistThumbs() {
  return {
    ...readArtistThumbFile(FALLBACK_ARTIST_THUMBS_PATH),
    ...readArtistThumbFile(ARTIST_THUMBS_PATH)
  };
}

function readArtistThumbFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const raw = safeJsonParse(fs.readFileSync(filePath, "utf8"), {});
  const source = raw?.artistThumbs && typeof raw.artistThumbs === "object"
    ? raw.artistThumbs
    : raw?.thumbs && typeof raw.thumbs === "object"
      ? raw.thumbs
      : raw;
  return normalizeArtistThumbs(source);
}

function normalizeArtistThumbs(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};

  const thumbs = {};
  for (const [rawArtist, rawUrl] of Object.entries(source)) {
    const artist = normalizeArtistName(rawArtist);
    const url = sanitizeArtistThumbUrl(rawUrl);
    if (artist && url) thumbs[artist] = url;
  }
  return thumbs;
}

function writeArtistThumbs(artistThumbs) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(ARTIST_THUMBS_PATH, JSON.stringify({
    updatedAt: new Date().toISOString(),
    artistThumbs
  }, null, 2), "utf8");
}

function getArtistThumbFor(artist, artistThumbs) {
  const name = normalizeArtistName(artist);
  if (!name) return "";
  if (artistThumbs[name]) return artistThumbs[name];

  const key = normalizeText(name);
  const match = Object.entries(artistThumbs).find(([candidate]) => normalizeText(candidate) === key);
  return match?.[1] || "";
}

function attachArtistThumbsToSongs(songs, artistThumbs) {
  return songs.map((song) => {
    const artistThumb = getArtistThumbFor(song.artist, artistThumbs);
    return artistThumb ? { ...song, artistThumb } : song;
  });
}

function parseArtistThumbDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=\r\n]+)$/i);
  if (!match) {
    const error = new Error("invalid-image");
    error.code = "invalid-image";
    throw error;
  }

  const mime = match[1].toLowerCase();
  const buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  if (!buffer.length || buffer.length > ARTIST_THUMB_MAX_BYTES || !isValidImageBuffer(mime, buffer)) {
    const error = new Error("invalid-image");
    error.code = buffer.length > ARTIST_THUMB_MAX_BYTES ? "image-too-large" : "invalid-image";
    throw error;
  }

  return {
    buffer,
    mime,
    ext: mime === "image/jpeg" ? "jpg" : mime.replace("image/", "")
  };
}

function isValidImageBuffer(mime, buffer) {
  if (mime === "image/jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mime === "image/png") {
    return buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mime === "image/webp") {
    return buffer.slice(0, 4).toString("ascii") === "RIFF" && buffer.slice(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}

function normalizeArtistName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 120);
}

function slugifyArtist(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "artista";
}

function sanitizeArtistThumbUrl(value) {
  const url = String(value || "").trim();
  if (/^\/artist-thumbs\/[a-z0-9_-]+\.(?:jpg|jpeg|png|webp)(?:\?v=\d+)?$/i.test(url)) return url;
  if (/^\/assets\/artists\/[a-z0-9_./-]+\.(?:jpg|jpeg|png|webp|svg)(?:\?v=\d+)?$/i.test(url)) return url;
  return "";
}

function safeArtistThumbPath(urlPath) {
  const fileName = decodeURIComponent(String(urlPath || "").replace(/^\/artist-thumbs\//, ""));
  if (!/^[a-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/i.test(fileName)) return null;

  const primary = path.join(ARTIST_THUMBS_DIR, fileName);
  if (fs.existsSync(primary)) return primary;

  const fallback = path.join(FALLBACK_ARTIST_THUMBS_DIR, fileName);
  if (fs.existsSync(fallback)) return fallback;

  return null;
}

function ensureAuthStore() {
  fs.mkdirSync(path.dirname(AUTH_PATH), { recursive: true });
  const rawStore = fs.existsSync(AUTH_PATH)
    ? safeJsonParse(fs.readFileSync(AUTH_PATH, "utf8"), {})
    : {};
  const store = normalizeAuthStore(rawStore);
  if (JSON.stringify(rawStore) !== JSON.stringify(store)) {
    writeAuthStore(store);
  }
  return store;
}

function normalizeAuthStore(input) {
  const store = input && typeof input === "object" ? input : {};
  const normalized = {
    secret: typeof store.secret === "string" && store.secret.trim()
      ? store.secret.trim()
      : crypto.randomBytes(32).toString("hex"),
    devices: {}
  };

  if (store.devices && typeof store.devices === "object" && !Array.isArray(store.devices)) {
    for (const [rawId, device] of Object.entries(store.devices)) {
      const deviceId = normalizeDeviceId(rawId);
      if (!deviceId) continue;
      normalized.devices[deviceId] = normalizeDeviceStore(device);
    }
  }

  if (!Object.keys(normalized.devices).length && store.users && typeof store.users === "object") {
    normalized.devices["legacy-device"] = normalizeDeviceStore({
      label: "Aparelho migrado",
      users: store.users,
      resetRequests: store.resetRequests
    });
  }

  return normalized;
}

function normalizeDeviceStore(input) {
  const device = input && typeof input === "object" ? input : {};
  const normalized = {
    label: normalizeDeviceLabel(device.label),
    createdAt: typeof device.createdAt === "string" && device.createdAt ? device.createdAt : new Date().toISOString(),
    users: {},
    resetRequests: {}
  };

  const rawUsers = device.users && typeof device.users === "object" ? device.users : {};
  for (const [userId, config] of Object.entries(AUTH_USERS)) {
    normalized.users[userId] = normalizeUserRecord(rawUsers[userId], config);
  }

  const rawResetRequests = device.resetRequests && typeof device.resetRequests === "object"
    ? device.resetRequests
    : {};
  for (const [userId, request] of Object.entries(rawResetRequests)) {
    if (!AUTH_USERS[userId]) continue;
    normalized.resetRequests[userId] = normalizeResetRequest(request);
  }

  return normalized;
}

function normalizeUserRecord(input, config) {
  const user = input && typeof input === "object" ? input : {};
  const email = normalizeEmail(user.email);
  if (!user.passwordHash || !user.salt || !user.iterations) {
    return createPasswordRecord(config.defaultPassword, config, { email });
  }

  return {
    label: typeof user.label === "string" && user.label.trim() ? user.label.trim() : config.label,
    role: typeof user.role === "string" && user.role.trim() ? user.role.trim() : config.role,
    email,
    salt: String(user.salt),
    iterations: Math.max(1000, Number(user.iterations) || 120000),
    passwordHash: String(user.passwordHash),
    updatedAt: typeof user.updatedAt === "string" && user.updatedAt ? user.updatedAt : new Date().toISOString()
  };
}

function normalizeResetRequest(input) {
  const request = input && typeof input === "object" ? input : {};
  return {
    email: normalizeEmail(request.email),
    codeHash: typeof request.codeHash === "string" ? request.codeHash : "",
    requestedAt: typeof request.requestedAt === "string" ? request.requestedAt : "",
    expiresAt: typeof request.expiresAt === "string" ? request.expiresAt : ""
  };
}

function writeAuthStore(store) {
  fs.writeFileSync(AUTH_PATH, JSON.stringify(store, null, 2), "utf8");
}

function createPasswordRecord(password, config, options = {}) {
  const salt = crypto.randomBytes(16).toString("hex");
  const iterations = 120000;
  return {
    label: config.label,
    role: config.role,
    email: normalizeEmail(options.email),
    salt,
    iterations,
    passwordHash: hashPassword(password, salt, iterations),
    updatedAt: new Date().toISOString()
  };
}

function hashPassword(password, salt, iterations) {
  return crypto.pbkdf2Sync(String(password || ""), salt, iterations, 32, "sha256").toString("hex");
}

function verifyPassword(password, user) {
  if (!user?.passwordHash || !user?.salt || !user?.iterations) return false;
  const hash = hashPassword(password, user.salt, user.iterations);
  return safeEqual(hash, user.passwordHash);
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "hex");
  const rightBuffer = Buffer.from(String(right || ""), "hex");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function publicUser(id, user) {
  return {
    id,
    label: user.label,
    role: user.role,
    email: user.email || ""
  };
}

function signToken(userId, user, secret, deviceId) {
  const payload = {
    sub: userId,
    did: deviceId,
    role: user.role,
    label: user.label,
    exp: Date.now() + TOKEN_MAX_AGE_MS
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function verifyToken(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const store = ensureAuthStore();
  const expected = crypto.createHmac("sha256", store.secret).update(encodedPayload).digest("base64url");
  if (!safeTokenEqual(signature, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    const tokenDeviceId = normalizeDeviceId(payload.did);
    const requestDeviceId = getRequestDeviceId(req);
    if (!tokenDeviceId || (requestDeviceId && requestDeviceId !== tokenDeviceId)) return null;
    const device = store.devices?.[tokenDeviceId];
    const user = device?.users?.[payload.sub];
    if (!device || !user || payload.exp < Date.now()) return null;
    return { userId: payload.sub, user, store, deviceId: tokenDeviceId, device };
  } catch {
    return null;
  }
}

function safeTokenEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function base64UrlEncode(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function parseJsonBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        reject(new Error("request-too-large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function safeStaticPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const publicPath = decoded.replace(/^\/+/, "");
  if (/^data(?:\/.*)?\/auth\.json$/i.test(publicPath)) return null;
  const relativePath = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const fullPath = path.normalize(path.join(PUBLIC_DIR, relativePath));
  return fullPath.startsWith(PUBLIC_DIR) ? fullPath : null;
}

function getRequestDeviceId(req, body = null) {
  return normalizeDeviceId(req.headers[DEVICE_HEADER] || body?.deviceId);
}

function getOrCreateDeviceContext(req, body = null) {
  const store = ensureAuthStore();
  const deviceId = getRequestDeviceId(req, body);
  if (!deviceId) return null;

  const nextDevice = store.devices[deviceId]
    ? normalizeDeviceStore({
        ...store.devices[deviceId],
        label: normalizeDeviceLabel(body?.deviceLabel) || store.devices[deviceId].label
      })
    : normalizeDeviceStore({ label: body?.deviceLabel });

  if (JSON.stringify(store.devices[deviceId]) !== JSON.stringify(nextDevice)) {
    store.devices[deviceId] = nextDevice;
    writeAuthStore(store);
  }

  return { store, deviceId, device: store.devices[deviceId] };
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeUserId(value) {
  const normalized = normalizeText(value).replace(/[^a-z0-9_-]/g, "");
  return normalized === "musico" ? "musico" : normalized === "lider" ? "lider" : "";
}

function normalizeDeviceId(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return normalized.length >= 12 && normalized.length <= 80 ? normalized : "";
}

function normalizeDeviceLabel(value) {
  const label = String(value || "").trim().replace(/\s+/g, " ");
  return label ? label.slice(0, 120) : "";
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function createResetCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashResetCode(code, secret, deviceId, userId, email) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${deviceId}:${userId}:${normalizeEmail(email)}:${String(code)}`)
    .digest("hex");
}

function isEmailDeliveryConfigured() {
  return Boolean(SMTP_HOST && SMTP_PORT && SMTP_FROM);
}

function makeResponseError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

async function sendResetCodeEmail(email, userLabel, code) {
  const subject = "Recuperacao de senha - MDL Inova";
  const text = [
    "Acervo Musical MDL Inova",
    "",
    `Perfil: ${userLabel}`,
    `Codigo de recuperacao: ${code}`,
    "Validade: 15 minutos neste aparelho.",
    "",
    "A senha antiga nao pode ser enviada por e-mail.",
    "Se voce nao solicitou a troca, ignore esta mensagem."
  ].join("\n");

  if (!isEmailDeliveryConfigured()) {
    throw makeResponseError("email-not-configured", "email-not-configured");
  }

  await sendSmtpMail({ to: email, subject, text });
}

async function sendSmtpMail({ to, subject, text }) {
  const connection = await openSmtpConnection();
  try {
    const greeting = await connection.readResponse();
    if (greeting.code !== 220) {
      throw new Error(`smtp-greeting-${greeting.code || "unknown"}`);
    }

    let ehloResponse = await connection.command(`EHLO ${SMTP_HELO}`, [250]);
    if (!SMTP_SECURE && ehloResponse.lines.some((line) => /STARTTLS/i.test(line))) {
      await connection.command("STARTTLS", [220]);
      connection.detach();
      const secureSocket = await startTls(connection.socket);
      connection.replaceSocket(secureSocket);
      ehloResponse = await connection.command(`EHLO ${SMTP_HELO}`, [250]);
    }

    if (SMTP_USER) {
      await connection.command("AUTH LOGIN", [334]);
      await connection.command(Buffer.from(SMTP_USER, "utf8").toString("base64"), [334]);
      await connection.command(Buffer.from(SMTP_PASS, "utf8").toString("base64"), [235]);
    }

    await connection.command(`MAIL FROM:<${extractEmailAddress(SMTP_FROM)}>`, [250]);
    await connection.command(`RCPT TO:<${extractEmailAddress(to)}>`, [250, 251]);
    await connection.command("DATA", [354]);

    const message = [
      `From: ${SMTP_FROM}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset="utf-8"',
      "MIME-Version: 1.0",
      "Content-Transfer-Encoding: 8bit",
      "",
      dotStuff(String(text || "")).replace(/\r?\n/g, "\r\n")
    ].join("\r\n");

    await connection.sendData(`${message}\r\n.\r\n`, [250]);
    await connection.command("QUIT", [221]);
  } finally {
    connection.close();
  }
}

function extractEmailAddress(value) {
  const email = String(value || "").match(/<([^>]+)>/);
  return normalizeEmail(email ? email[1] : value);
}

function dotStuff(text) {
  return String(text || "").replace(/(^|\n)\./g, "$1..");
}

function openSmtpConnection() {
  return new Promise((resolve, reject) => {
    const handleError = (error) => reject(error);
    const socket = SMTP_SECURE
      ? tls.connect({ host: SMTP_HOST, port: SMTP_PORT, servername: SMTP_HOST }, () => resolve(new SmtpConnection(socket)))
      : net.connect({ host: SMTP_HOST, port: SMTP_PORT }, () => resolve(new SmtpConnection(socket)));

    socket.setEncoding("utf8");
    socket.setTimeout(15000, () => socket.destroy(new Error("smtp-timeout")));
    socket.once("error", handleError);
  });
}

function startTls(socket) {
  return new Promise((resolve, reject) => {
    const secureSocket = tls.connect({ socket, servername: SMTP_HOST }, () => resolve(secureSocket));
    secureSocket.setEncoding("utf8");
    secureSocket.setTimeout(15000, () => secureSocket.destroy(new Error("smtp-timeout")));
    secureSocket.once("error", reject);
  });
}

class SmtpConnection {
  constructor(socket) {
    this.socket = socket;
    this.buffer = "";
    this.pendingResponse = [];
    this.responses = [];
    this.waiters = [];
    this.closed = false;
    this.attach(socket);
  }

  attach(socket) {
    socket.on("data", (chunk) => this.handleData(chunk));
    socket.on("error", (error) => this.fail(error));
    socket.on("close", () => this.fail(new Error("smtp-closed")));
  }

  detach() {
    this.socket.removeAllListeners("data");
    this.socket.removeAllListeners("error");
    this.socket.removeAllListeners("close");
  }

  replaceSocket(socket) {
    this.socket = socket;
    this.buffer = "";
    this.pendingResponse = [];
    this.responses = [];
    this.waiters = [];
    this.closed = false;
    this.attach(socket);
  }

  handleData(chunk) {
    this.buffer += chunk;
    let newlineIndex = this.buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex).replace(/\r$/, "");
      this.buffer = this.buffer.slice(newlineIndex + 1);
      this.pendingResponse.push(line);
      if (/^\d{3} /.test(line)) {
        this.enqueue({
          code: Number(line.slice(0, 3)),
          lines: this.pendingResponse.splice(0)
        });
      }
      newlineIndex = this.buffer.indexOf("\n");
    }
  }

  enqueue(response) {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve(response);
      return;
    }
    this.responses.push(response);
  }

  readResponse() {
    if (this.responses.length) {
      return Promise.resolve(this.responses.shift());
    }
    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  async command(command, expectedCodes) {
    this.socket.write(`${command}\r\n`);
    const response = await this.readResponse();
    if (expectedCodes && !expectedCodes.includes(response.code)) {
      throw new Error(`smtp-${command.split(" ")[0].toLowerCase()}-${response.code}`);
    }
    return response;
  }

  async sendData(payload, expectedCodes) {
    this.socket.write(payload);
    const response = await this.readResponse();
    if (expectedCodes && !expectedCodes.includes(response.code)) {
      throw new Error(`smtp-data-${response.code}`);
    }
    return response;
  }

  fail(error) {
    if (this.closed) return;
    this.closed = true;
    while (this.waiters.length) {
      this.waiters.shift().reject(error);
    }
  }

  close() {
    this.closed = true;
    try {
      this.socket.end();
    } catch {}
    try {
      this.socket.destroy();
    } catch {}
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/api/auth/session" && req.method === "GET") {
    const session = verifyToken(req);
    if (!session) return sendJson(res, 401, { ok: false, error: "unauthorized" });
    return sendJson(res, 200, { ok: true, user: publicUser(session.userId, session.user) });
  }

  if (url.pathname === "/api/auth/login" && req.method === "POST") {
    try {
      const body = await parseJsonBody(req);
      const userId = normalizeUserId(body.userId);
      const deviceContext = getOrCreateDeviceContext(req, body);
      if (!userId || !deviceContext) {
        return sendJson(res, 400, { ok: false, error: "invalid-device" });
      }

      const user = deviceContext.device.users?.[userId];
      if (!user || !verifyPassword(body.password, user)) {
        return sendJson(res, 401, { ok: false, error: "invalid-login" });
      }

      return sendJson(res, 200, {
        ok: true,
        user: publicUser(userId, user),
        token: signToken(userId, user, deviceContext.store.secret, deviceContext.deviceId)
      });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: error.code || error.message });
    }
  }

  if (url.pathname === "/api/auth/update-email" && req.method === "POST") {
    const session = verifyToken(req);
    if (!session) return sendJson(res, 401, { ok: false, error: "unauthorized" });

    try {
      const body = await parseJsonBody(req);
      const email = normalizeEmail(body.email);
      if (email && !isValidEmail(email)) {
        return sendJson(res, 400, { ok: false, error: "invalid-email" });
      }

      session.device.users[session.userId].email = email;
      session.device.users[session.userId].updatedAt = new Date().toISOString();
      writeAuthStore(session.store);
      return sendJson(res, 200, { ok: true, user: publicUser(session.userId, session.device.users[session.userId]) });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: error.code || error.message });
    }
  }

  if (url.pathname === "/api/auth/change-password" && req.method === "POST") {
    const session = verifyToken(req);
    if (!session) return sendJson(res, 401, { ok: false, error: "unauthorized" });

    try {
      const body = await parseJsonBody(req);
      const newPassword = String(body.newPassword || "");
      if (newPassword.length < 4) {
        return sendJson(res, 400, { ok: false, error: "password-too-short" });
      }
      if (!verifyPassword(body.currentPassword, session.user)) {
        return sendJson(res, 403, { ok: false, error: "invalid-current-password" });
      }

      session.device.users[session.userId] = createPasswordRecord(
        newPassword,
        AUTH_USERS[session.userId] || session.user,
        { email: session.user.email }
      );
      delete session.device.resetRequests[session.userId];
      writeAuthStore(session.store);
      return sendJson(res, 200, { ok: true, user: publicUser(session.userId, session.device.users[session.userId]) });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: error.code || error.message });
    }
  }

  if (url.pathname === "/api/auth/request-reset" && req.method === "POST") {
    try {
      const body = await parseJsonBody(req);
      const userId = normalizeUserId(body.userId);
      const email = normalizeEmail(body.email);
      const deviceContext = getOrCreateDeviceContext(req, body);
      if (!userId || !deviceContext) {
        return sendJson(res, 400, { ok: false, error: "invalid-device" });
      }
      if (!isValidEmail(email)) {
        return sendJson(res, 400, { ok: false, error: "invalid-email" });
      }

      const user = deviceContext.device.users?.[userId];
      if (!user?.email) {
        return sendJson(res, 404, { ok: false, error: "email-not-registered" });
      }
      if (normalizeEmail(user.email) !== email) {
        return sendJson(res, 403, { ok: false, error: "email-mismatch" });
      }

      const activeRequest = deviceContext.device.resetRequests?.[userId];
      if (activeRequest?.requestedAt && (Date.now() - Date.parse(activeRequest.requestedAt)) < RESET_RESEND_INTERVAL_MS) {
        return sendJson(res, 429, { ok: false, error: "reset-wait" });
      }

      const code = createResetCode();
      const requestRecord = {
        email,
        codeHash: hashResetCode(code, deviceContext.store.secret, deviceContext.deviceId, userId, email),
        requestedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + RESET_CODE_TTL_MS).toISOString()
      };

      if (isEmailDeliveryConfigured()) {
        await sendResetCodeEmail(email, user.label, code);
      } else if (!LOCAL_RESET_PREVIEW) {
        return sendJson(res, 503, { ok: false, error: "email-not-configured" });
      }

      deviceContext.device.resetRequests[userId] = requestRecord;
      writeAuthStore(deviceContext.store);

      return sendJson(res, 200, {
        ok: true,
        preview: LOCAL_RESET_PREVIEW && !isEmailDeliveryConfigured(),
        previewCode: LOCAL_RESET_PREVIEW && !isEmailDeliveryConfigured() ? code : null
      });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: error.code || error.message });
    }
  }

  if (url.pathname === "/api/auth/reset-password" && req.method === "POST") {
    try {
      const body = await parseJsonBody(req);
      const userId = normalizeUserId(body.userId);
      const email = normalizeEmail(body.email);
      const code = String(body.code || "").trim();
      const newPassword = String(body.newPassword || "");
      const deviceContext = getOrCreateDeviceContext(req, body);
      if (!userId || !deviceContext) {
        return sendJson(res, 400, { ok: false, error: "invalid-device" });
      }
      if (!isValidEmail(email)) {
        return sendJson(res, 400, { ok: false, error: "invalid-email" });
      }
      if (!code) {
        return sendJson(res, 400, { ok: false, error: "invalid-reset-code" });
      }
      if (newPassword.length < 4) {
        return sendJson(res, 400, { ok: false, error: "password-too-short" });
      }

      const user = deviceContext.device.users?.[userId];
      const requestRecord = deviceContext.device.resetRequests?.[userId];
      if (!user || !requestRecord?.codeHash) {
        return sendJson(res, 400, { ok: false, error: "reset-not-requested" });
      }
      if (normalizeEmail(user.email) !== email || normalizeEmail(requestRecord.email) !== email) {
        return sendJson(res, 403, { ok: false, error: "email-mismatch" });
      }
      if (!requestRecord.expiresAt || Date.parse(requestRecord.expiresAt) < Date.now()) {
        delete deviceContext.device.resetRequests[userId];
        writeAuthStore(deviceContext.store);
        return sendJson(res, 410, { ok: false, error: "reset-expired" });
      }

      const expectedHash = hashResetCode(code, deviceContext.store.secret, deviceContext.deviceId, userId, email);
      if (!safeEqual(expectedHash, requestRecord.codeHash)) {
        return sendJson(res, 403, { ok: false, error: "invalid-reset-code" });
      }

      deviceContext.device.users[userId] = createPasswordRecord(
        newPassword,
        AUTH_USERS[userId] || user,
        { email: user.email }
      );
      delete deviceContext.device.resetRequests[userId];
      writeAuthStore(deviceContext.store);
      return sendJson(res, 200, { ok: true });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: error.code || error.message });
    }
  }

  if (url.pathname === "/api/artist-thumbs" && req.method === "POST") {
    const session = verifyToken(req);
    if (!session) return sendJson(res, 401, { ok: false, error: "unauthorized" });
    if (session.user.role !== "leader") return sendJson(res, 403, { ok: false, error: "leader-only" });

    try {
      const body = await parseJsonBody(req, ARTIST_THUMB_MAX_BYTES * 2);
      const artist = normalizeArtistName(body.artist);
      if (!artist) return sendJson(res, 400, { ok: false, error: "invalid-artist" });

      const image = parseArtistThumbDataUrl(body.dataUrl);
      const fileName = `${slugifyArtist(artist)}.${image.ext}`;
      fs.mkdirSync(ARTIST_THUMBS_DIR, { recursive: true });
      fs.writeFileSync(path.join(ARTIST_THUMBS_DIR, fileName), image.buffer);

      const artistThumbs = readArtistThumbs();
      const urlPath = `/artist-thumbs/${fileName}?v=${Date.now()}`;
      artistThumbs[artist] = urlPath;
      writeArtistThumbs(artistThumbs);

      return sendJson(res, 200, {
        ok: true,
        artist,
        url: urlPath,
        artistThumbs
      });
    } catch (error) {
      const status = error.code === "image-too-large" ? 413 : 400;
      return sendJson(res, status, { ok: false, error: error.code || error.message });
    }
  }

  if (req.url === "/api/status") {
    const statusPath = fs.existsSync(INDEX_PATH) ? INDEX_PATH : FALLBACK_INDEX_PATH;
    if (!fs.existsSync(statusPath)) {
      return sendJson(res, 200, { ready: false, songs: 0, message: "index-not-found" });
    }

    try {
      const index = JSON.parse(fs.readFileSync(statusPath, "utf8"));
      return sendJson(res, 200, {
        ready: true,
        songs: Array.isArray(index.songs) ? index.songs.length : 0,
        generatedAt: index.generatedAt || null
      });
    } catch (error) {
      return sendJson(res, 500, { ready: false, error: error.message });
    }
  }

  if (req.url === "/api/import" && req.method === "POST") {
    scheduleImport("painel-admin");
    return sendJson(res, 202, { ok: true, message: "import-scheduled" });
  }

  if (url.pathname === "/api/catalog" && req.method === "GET") {
    try {
      const db = readCatalogDb();
      if (!db) return sendJson(res, 200, { ready: false, songs: [], artists: [] });

      const query = normalizeText(url.searchParams.get("q") || "");
      const limit = Math.max(1, Math.min(5000, Number(url.searchParams.get("limit") || 5000)));
      const artistThumbs = {
        ...normalizeArtistThumbs(db.artistThumbs),
        ...readArtistThumbs()
      };
      const songs = query
        ? db.songs.filter((song) => normalizeText(`${song.title} ${song.artist} ${song.collection || ""}`).includes(query)).slice(0, limit)
        : db.songs.slice(0, limit);

      return sendJson(res, 200, {
        ready: true,
        name: db.name,
        generatedAt: db.generatedAt,
        totalSongs: db.totalSongs,
        totalArtists: db.totalArtists,
        artists: db.artists || [],
        artistThumbs,
        songs: attachArtistThumbsToSongs(songs, artistThumbs)
      });
    } catch (error) {
      return sendJson(res, 500, { ready: false, error: error.message });
    }
  }

  if (url.pathname.startsWith("/api/songs/") && req.method === "GET") {
    try {
      const id = decodeURIComponent(url.pathname.replace("/api/songs/", ""));
      const song = readSongRecord(id);
      if (!song) return sendJson(res, 404, { error: "song-not-found" });
      return sendJson(res, 200, song);
    } catch (error) {
      return sendJson(res, 500, { error: error.message });
    }
  }

  if (url.pathname === "/api/offline-bundle" && req.method === "POST") {
    try {
      const body = await parseJsonBody(req);
      const ids = Array.isArray(body.ids) ? body.ids.slice(0, 80) : [];
      const songs = ids.map(readSongRecord).filter(Boolean);
      return sendJson(res, 200, {
        generatedAt: new Date().toISOString(),
        count: songs.length,
        songs
      });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (url.pathname.startsWith("/artist-thumbs/") && req.method === "GET") {
    const thumbPath = safeArtistThumbPath(url.pathname);
    if (!thumbPath) {
      res.writeHead(404);
      return res.end("Arquivo nao encontrado");
    }

    fs.readFile(thumbPath, (error, data) => {
      if (error) {
        res.writeHead(404);
        return res.end("Arquivo nao encontrado");
      }

      const ext = path.extname(thumbPath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": mimeTypes[ext] || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable"
      });
      res.end(data);
    });
    return;
  }

  const filePath = safeStaticPath(req.url || "/");
  if (!filePath) {
    res.writeHead(403);
    return res.end("Acesso negado");
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      if (path.extname(filePath)) {
        res.writeHead(404);
        return res.end("Arquivo nao encontrado");
      }

      fs.readFile(path.join(PUBLIC_DIR, "index.html"), (fallbackError, fallbackData) => {
        if (fallbackError) {
          res.writeHead(500);
          return res.end("Aplicativo indisponivel");
        }
        res.writeHead(200, { "Content-Type": mimeTypes[".html"] });
        res.end(fallbackData);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=300"
    });
    res.end(data);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Acervo Musical MDL Inova em http://localhost:${PORT}`);
  scheduleImport("inicio");
  watchCatalogFolders();
});

function scheduleImport(reason) {
  clearTimeout(importTimer);
  importTimer = setTimeout(() => runImport(reason), 900);
}

function runImport(reason) {
  if (importRunning) {
    importQueued = true;
    return;
  }

  importRunning = true;
  const child = spawn(process.execPath, [IMPORT_SCRIPT], {
    cwd: __dirname,
    stdio: "inherit"
  });

  child.on("exit", (code) => {
    importRunning = false;
    console.log(code === 0
      ? `Acervo atualizado (${reason}).`
      : `Falha ao atualizar acervo (${reason}). Codigo: ${code}`);

    if (importQueued) {
      importQueued = false;
      scheduleImport("alteracoes-acumuladas");
    }
  });
}

function watchCatalogFolders() {
  let sources = [];
  try {
    sources = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch (error) {
    console.warn(`Nao foi possivel ler ${CONFIG_PATH}: ${error.message}`);
    return;
  }

  for (const source of sources) {
    const folder = path.isAbsolute(source.path) ? source.path : path.join(__dirname, source.path);
    if (!fs.existsSync(folder)) {
      console.warn(`Pasta monitorada nao existe: ${folder}`);
      continue;
    }

    try {
      fs.watch(folder, { recursive: true }, () => scheduleImport("mudanca-no-acervo"));
      console.log(`Monitorando acervo: ${folder}`);
    } catch (error) {
      console.warn(`Nao foi possivel monitorar ${folder}: ${error.message}`);
    }
  }
}
