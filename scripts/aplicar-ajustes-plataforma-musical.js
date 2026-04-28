const fs = require('fs');
const path = require('path');

const root = process.cwd();
const indexPath = path.join(root, 'public', 'index.html');
const manifestPath = path.join(root, 'public', 'manifest.webmanifest');
const thumbsJsonPath = path.join(root, 'data', 'artist-thumbs.json');
const oldThumbsDir = path.join(root, 'data', 'artist-thumbs');
const newThumbsDir = path.join(root, 'public', 'assets', 'artists');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function updateIndexHtml() {
  if (!fs.existsSync(indexPath)) {
    console.log('Aviso: public/index.html não encontrado. Pulei esta etapa.');
    return;
  }

  const current = fs.readFileSync(indexPath, 'utf8');
  const next = current
    .replaceAll('Acervo Musical', 'Plataforma Musical')
    .replaceAll('acervo sempre', 'plataforma sempre')
    .replaceAll('Tenha o acervo', 'Tenha a plataforma');

  if (next !== current) {
    fs.writeFileSync(indexPath, next, 'utf8');
    console.log('OK: public/index.html atualizado para Plataforma Musical.');
  } else {
    console.log('OK: public/index.html já estava atualizado.');
  }
}

function updateManifest() {
  const manifest = {
    name: 'Plataforma Musical MDL Inova',
    short_name: 'MDL Inova',
    description: 'Aplicativo de cifras e repertórios do MDL Inova.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    background_color: '#111111',
    theme_color: '#111111',
    orientation: 'portrait-primary',
    lang: 'pt-BR',
    categories: ['music', 'productivity', 'utilities'],
    icons: [
      {
        src: '/assets/logo-inova.jpg',
        sizes: '512x512',
        type: 'image/jpeg',
        purpose: 'any'
      }
    ]
  };

  ensureDir(path.dirname(manifestPath));
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log('OK: public/manifest.webmanifest atualizado.');
}

function copyExistingThumbs() {
  ensureDir(newThumbsDir);
  if (!fs.existsSync(oldThumbsDir)) {
    console.log('Aviso: data/artist-thumbs não existe. Criei public/assets/artists para você colocar as imagens.');
    return;
  }

  const files = fs.readdirSync(oldThumbsDir).filter((file) => /\.(jpg|jpeg|png|webp)$/i.test(file));
  for (const file of files) {
    fs.copyFileSync(path.join(oldThumbsDir, file), path.join(newThumbsDir, file));
  }
  console.log(`OK: ${files.length} miniatura(s) copiadas para public/assets/artists.`);
}

function updateThumbsJson() {
  ensureDir(path.dirname(thumbsJsonPath));
  ensureDir(newThumbsDir);

  let store = { updatedAt: new Date().toISOString(), artistThumbs: {} };
  if (fs.existsSync(thumbsJsonPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(thumbsJsonPath, 'utf8'));
      const source = raw.artistThumbs || raw.thumbs || raw;
      if (source && typeof source === 'object' && !Array.isArray(source)) {
        store.artistThumbs = source;
      }
    } catch (error) {
      console.log('Aviso: data/artist-thumbs.json inválido. Vou recriar com base padrão.');
    }
  }

  const nextThumbs = {};
  for (const [artist, url] of Object.entries(store.artistThumbs)) {
    const cleanUrl = String(url || '').split('?')[0];
    const fileName = path.basename(cleanUrl);
    if (/\.(jpg|jpeg|png|webp)$/i.test(fileName)) {
      nextThumbs[artist] = `/assets/artists/${fileName}`;
    }
  }

  const defaults = {
    'Artista Teste Sync': '/assets/artists/artista-teste-sync.png',
    'Alexsander Lucio': '/assets/artists/alexsander-lucio.jpg',
    'Diante Do Trono': '/assets/artists/diante-do-trono.jpg',
    'Aline Barros': '/assets/artists/aline-barros.jpg',
    'Renascer Praise': '/assets/artists/renascer-praise.jpg',
    'Asaph Borba': '/assets/artists/asaph-borba.webp',
    'Be One Music': '/assets/artists/be-one-music.jpg',
    'Central 3': '/assets/artists/central-3.jpg',
    'Anderson Freire': '/assets/artists/anderson-freire.jpg'
  };

  const finalStore = {
    updatedAt: new Date().toISOString(),
    artistThumbs: { ...defaults, ...nextThumbs }
  };

  fs.writeFileSync(thumbsJsonPath, JSON.stringify(finalStore, null, 2) + '\n', 'utf8');
  console.log('OK: data/artist-thumbs.json agora aponta para public/assets/artists.');
}

updateIndexHtml();
updateManifest();
copyExistingThumbs();
updateThumbsJson();
console.log('\nConcluído. Agora envie para o GitHub:');
console.log('- public/index.html');
console.log('- public/manifest.webmanifest');
console.log('- data/artist-thumbs.json');
console.log('- public/assets/artists/');
