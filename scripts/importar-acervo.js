const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const APP_DATA_DIR = path.join(ROOT, "data");
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : APP_DATA_DIR;
const CONFIG_PATH = path.join(APP_DATA_DIR, "pastas.json");
const DB_PATH = path.join(DATA_DIR, "acervo-db.json");
const SONGS_DIR = path.join(DATA_DIR, "songs");
const INDEX_PATH = path.join(DATA_DIR, "index.json");
const ARTIST_THUMBS_PATH = path.join(DATA_DIR, "artist-thumbs.json");
const FALLBACK_ARTIST_THUMBS_PATH = path.join(APP_DATA_DIR, "artist-thumbs.json");

const supportedExtensions = new Set([".html", ".htm", ".txt"]);
const CHORD_SUFFIX_PATTERN = "[0-9A-Za-z\\u00BA\\u00B0+\\-#b()]";
const CHORD_TOKEN_RE = new RegExp(`^[A-G](?:#|b)?(?:${CHORD_SUFFIX_PATTERN})*(?:\\/[A-G](?:#|b)?)?$`);
const KEY_RE = new RegExp(`\\b([A-G](?:#|b)?)(?:${CHORD_SUFFIX_PATTERN})*(?:\\/[A-G](?:#|b)?)?\\b`);

function main() {
  const sources = readSources();
  const validSources = sources.filter((source) => source.path && fs.existsSync(source.path));

  if (!validSources.length) {
    console.warn("Nenhuma fonte local válida encontrada. Mantendo o acervo publicado atual.");
    return;
  }

  resetOutput();

  const songs = [];
  for (const source of validSources) {
    const files = listFiles(source.path);
    for (const filePath of files) {
      const ext = path.extname(filePath).toLowerCase();
      if (!supportedExtensions.has(ext)) continue;

      const html = repairPossibleMojibake(readSongHtml(filePath, ext));
      const song = normalizeSong(buildSong(source, filePath, ext, html));
      const record = { ...song, html };
      fs.writeFileSync(path.join(SONGS_DIR, `${song.id}.json`), JSON.stringify(record, null, 2), "utf8");
      songs.push(song);
    }
  }

  songs.sort((a, b) => {
    const artistCompare = a.artist.localeCompare(b.artist, "pt-BR");
    return artistCompare || a.title.localeCompare(b.title, "pt-BR");
  });

  const artists = Array.from(new Set(songs.map((song) => song.artist))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const artistThumbs = readArtistThumbs();
  const database = {
    name: "Acervo Musical MDL Monte Sião",
    generatedAt: new Date().toISOString(),
    totalSongs: songs.length,
    totalArtists: artists.length,
    artists,
    artistThumbs,
    songs: songs.map((song) => ({
      ...song,
      ...(getArtistThumbFor(song.artist, artistThumbs) ? { artistThumb: getArtistThumbFor(song.artist, artistThumbs) } : {}),
      apiUrl: `/api/songs/${song.id}`,
      offlineKey: `mdl-song-${song.id}`
    }))
  };

  fs.writeFileSync(DB_PATH, JSON.stringify(database, null, 2), "utf8");
  fs.writeFileSync(INDEX_PATH, JSON.stringify(database, null, 2), "utf8");

  console.log(`Importação concluída: ${songs.length} músicas, ${artists.length} artistas.`);
}

function readSources() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Arquivo não encontrado: ${CONFIG_PATH}`);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")).map((source) => ({
    ...source,
    path: path.isAbsolute(source.path) ? source.path : path.join(ROOT, source.path)
  }));
}

function resetOutput() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(SONGS_DIR)) {
    fs.rmSync(SONGS_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(SONGS_DIR, { recursive: true });
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
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};

  const thumbs = {};
  for (const [rawArtist, rawUrl] of Object.entries(source)) {
    const artist = normalizeArtistName(rawArtist);
    const url = sanitizeArtistThumbUrl(rawUrl);
    if (artist && url) thumbs[artist] = url;
  }
  return thumbs;
}

function getArtistThumbFor(artist, artistThumbs) {
  const name = normalizeArtistName(artist);
  if (!name) return "";
  if (artistThumbs[name]) return artistThumbs[name];

  const key = slugify(name);
  const match = Object.entries(artistThumbs).find(([candidate]) => slugify(candidate) === key);
  return match?.[1] || "";
}

function normalizeArtistName(value) {
  return repairPossibleMojibake(String(value || "")).trim().replace(/\s+/g, " ").slice(0, 120);
}

function sanitizeArtistThumbUrl(value) {
  const url = String(value || "").trim();
  if (/^\/artist-thumbs\/[a-z0-9_-]+\.(?:jpg|jpeg|png|webp)(?:\?v=\d+)?$/i.test(url)) return url;
  if (/^\/assets\/artists\/[a-z0-9_./-]+\.(?:jpg|jpeg|png|webp|svg)(?:\?v=\d+)?$/i.test(url)) return url;
  return "";
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function listFiles(folder) {
  const result = [];
  const stack = [folder];

  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        result.push(fullPath);
      }
    }
  }

  return result;
}

function buildSong(source, filePath, ext, html) {
  const artist = normalizeArtistName(source.artist || artistFromPath(source.path, filePath));
  const title = cleanTitle(path.basename(filePath, ext));
  const hash = crypto.createHash("sha1").update(filePath).digest("hex").slice(0, 10);
  const id = `${slugify(`${artist}-${title}`).slice(0, 58)}-${hash}`;
  const stats = fs.statSync(filePath);

  return {
    id,
    title,
    artist,
    collection: repairPossibleMojibake(source.name || path.basename(source.path)),
    fileType: ext.replace(".", ""),
    key: inferKeyFromHtml(html),
    updatedAt: stats.mtime.toISOString()
  };
}

function artistFromPath(rootPath, filePath) {
  const relative = path.relative(rootPath, filePath);
  const firstPart = relative.split(path.sep)[0];
  if (!firstPart || firstPart === path.basename(filePath)) {
    return formatName(path.basename(rootPath));
  }
  return formatName(firstPart);
}

function cleanTitle(name) {
  return repairPossibleMojibake(name)
    .replace(/^\s*\d+\s*[-\u2013]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatName(name) {
  const preserved = repairPossibleMojibake(name).replace(/_/g, "-").split("-").filter(Boolean);
  return preserved
    .map((part) => {
      if (/^[A-Z]{2,}$/.test(part)) return part;
      return part.charAt(0).toLocaleUpperCase("pt-BR") + part.slice(1);
    })
    .join(" ");
}

function readSongHtml(filePath, ext) {
  const raw = repairPossibleMojibake(fs.readFileSync(filePath, "utf8"));
  if (ext === ".txt") {
    return convertBracketChords(escapeHtml(raw));
  }

  const preMatch = raw.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  const cifraContainerMatch = raw.match(/<div[^>]*class=["'][^"']*\bcifra-container\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  const content = preMatch?.[1] || cifraContainerMatch?.[1] || escapeHtml(stripTags(raw));
  return convertBracketChords(sanitizePre(content));
}

function sanitizePre(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .trim();
}

function stripTags(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "");
}

function inferKeyFromHtml(html) {
  const chordTag = String(html || "").match(/<i[^>]*>([\s\S]*?)<\/i>/i);
  const text = chordTag ? stripTags(chordTag[1]) : stripTags(html);
  const match = text.match(KEY_RE);
  return match ? match[1] : null;
}

function convertBracketChords(html) {
  return String(html || "").replace(/\[([^\]\r\n]+)\]/g, (match, content) => {
    const normalized = content.trim();
    if (!normalized || !isChordGroup(normalized)) return match;
    return `<i>${escapeHtml(normalized)}</i>`;
  });
}

function isChordGroup(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => CHORD_TOKEN_RE.test(token));
}

function slugify(value) {
  return repairPossibleMojibake(String(value || ""))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "musica";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeSong(song) {
  return {
    ...song,
    title: repairPossibleMojibake(song.title),
    artist: normalizeArtistName(song.artist),
    collection: repairPossibleMojibake(song.collection),
    key: song.key == null ? null : repairPossibleMojibake(song.key)
  };
}

function repairPossibleMojibake(value) {
  const input = typeof value === "string" ? value : String(value || "");
  if (!input) return "";

  const candidates = [input];
  let current = input;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const next = Buffer.from(current, "latin1").toString("utf8");
    if (!next || next === current) break;
    candidates.push(next);
    current = next;
  }

  return candidates.reduce((best, candidate) => {
    return scoreTextQuality(candidate) < scoreTextQuality(best) ? candidate : best;
  }, input);
}

function scoreTextQuality(text) {
  let score = 0;
  for (const char of String(text || "")) {
    const code = char.charCodeAt(0);
    if (code === 0xfffd) score += 12;
    else if (code >= 0x80 && code <= 0x9f) score += 8;
    else if (code === 0x00c2 || code === 0x00c3 || code === 0x00c5 || code === 0x00d0 || code === 0x00cc) score += 6;
  }
  return score;
}

main();
