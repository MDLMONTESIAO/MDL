const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const THUMBS_DIR = path.join(DATA_DIR, "artist-thumbs");
const THUMBS_JSON = path.join(DATA_DIR, "artist-thumbs.json");
const CATALOG_PATHS = [
  path.join(DATA_DIR, "index.json"),
  path.join(DATA_DIR, "acervo-db.json")
];

function main() {
  if (!fs.existsSync(THUMBS_DIR)) {
    return;
  }

  const artists = readArtists();
  const artistByKey = new Map(artists.map((artist) => [normalizeKey(artist), artist]));
  const store = readThumbStore();
  const thumbs = normalizeThumbMap(store.artistThumbs || store.thumbs || store);
  const candidatesByArtist = new Map();
  let changed = false;

  for (const fileName of fs.readdirSync(THUMBS_DIR)) {
    if (!/\.(?:jpg|jpeg|png|webp)$/i.test(fileName)) {
      continue;
    }

    const parsed = path.parse(fileName);
    const artist = artistByKey.get(normalizeKey(parsed.name)) || toTitle(parsed.name);
    const safeName = `${slugify(artist)}${parsed.ext.toLowerCase() === ".jpeg" ? ".jpg" : parsed.ext.toLowerCase()}`;
    const sourcePath = path.join(THUMBS_DIR, fileName);
    const safePath = path.join(THUMBS_DIR, safeName);

    if (fileName !== safeName && !fs.existsSync(safePath)) {
      fs.copyFileSync(sourcePath, safePath);
      changed = true;
      console.log(`Thumb preparada: ${fileName} -> ${safeName}`);
    }

    const currentPath = fs.existsSync(safePath) ? safePath : sourcePath;
    candidatesByArtist.set(artist, {
      safeName,
      version: getFileVersion(currentPath)
    });
  }

  for (const [artist, candidate] of candidatesByArtist) {
    const currentUrl = String(thumbs[artist] || "");
    if (hasLocalArtistThumb(currentUrl)) {
      continue;
    }

    const nextUrl = `/artist-thumbs/${candidate.safeName}`;
    if (!currentUrl || currentUrl.startsWith("/assets/artists/") || currentUrl.replace(/\?v=\d+$/, "") !== nextUrl) {
      thumbs[artist] = `${nextUrl}?v=${candidate.version}`;
      changed = true;
    }
  }

  if (!changed) {
    console.log("Thumbs de artistas ja estavam preparadas.");
    return;
  }

  const nextContent = JSON.stringify({
    updatedAt: new Date().toISOString(),
    artistThumbs: sortObject(thumbs)
  }, null, 2);

  const currentContent = fs.existsSync(THUMBS_JSON) ? fs.readFileSync(THUMBS_JSON, "utf8") : "";
  if (currentContent === nextContent) {
    console.log("Thumbs de artistas ja estavam preparadas.");
    return;
  }

  fs.writeFileSync(THUMBS_JSON, nextContent, "utf8");
  console.log("data/artist-thumbs.json atualizado.");
}

function readArtists() {
  const artists = new Set();
  for (const catalogPath of CATALOG_PATHS) {
    if (!fs.existsSync(catalogPath)) continue;
    const catalog = safeJson(catalogPath);
    if (Array.isArray(catalog.artists)) {
      catalog.artists.forEach((artist) => {
        const name = normalizeArtistName(artist);
        if (name) artists.add(name);
      });
    }
    if (Array.isArray(catalog.songs)) {
      catalog.songs.forEach((song) => {
        const name = normalizeArtistName(song?.artist);
        if (name) artists.add(name);
      });
    }
  }
  return Array.from(artists);
}

function readThumbStore() {
  if (!fs.existsSync(THUMBS_JSON)) {
    return {};
  }
  return safeJson(THUMBS_JSON);
}

function normalizeThumbMap(source) {
  const thumbs = {};
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return thumbs;
  }

  for (const [artist, url] of Object.entries(source)) {
    const artistName = normalizeArtistName(artist);
    const thumbUrl = String(url || "").trim();
    if (artistName && thumbUrl) {
      thumbs[artistName] = thumbUrl;
    }
  }
  return thumbs;
}

function safeJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

function normalizeArtistName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 120);
}

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "artista";
}

function toTitle(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getFileVersion(filePath) {
  try {
    return Math.floor(fs.statSync(filePath).mtimeMs);
  } catch {
    return Date.now();
  }
}

function hasLocalArtistThumb(url) {
  const cleanUrl = String(url || "").replace(/\?v=\d+$/, "");
  if (!cleanUrl.startsWith("/artist-thumbs/")) {
    return false;
  }

  const fileName = cleanUrl.replace("/artist-thumbs/", "");
  return /^[a-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/i.test(fileName)
    && fs.existsSync(path.join(THUMBS_DIR, fileName));
}

function sortObject(input) {
  return Object.fromEntries(
    Object.entries(input).sort(([left], [right]) => left.localeCompare(right, "pt-BR"))
  );
}

main();
