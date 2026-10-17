// Pexels/Unsplash'ten gerçek fotoğraf bulma ve kapak / içerik / ürün kolajı görsellerini üretme.
import sharp from 'sharp';
import { config } from './config.js';

const COVER_W = 1920, COVER_H = 1080;

// Fotoğraf sağlayıcısı (öncelik sırası): Pexels → Pixabay → Unsplash → yok.
// Hiçbir anahtar yoksa kapak, mağazanın kendi ürün fotoğraflarından üretilir.
export const provider = () =>
  config.pexels.apiKey ? 'pexels' : config.pixabay.apiKey ? 'pixabay' : config.unsplash.accessKey ? 'unsplash' : 'none';

export async function searchPhotos(query, { orientation = 'landscape', exclude = [] } = {}) {
  if (provider() === 'none') return [];
  if (provider() === 'pixabay') {
    // Önce editörlerin seçtiği (profesyonel) fotoğraflar, yetmezse tümü; popülerliğe göre.
    const run = async (extra) => {
      const u = new URL('https://pixabay.com/api/');
      u.search = new URLSearchParams({ key: config.pixabay.apiKey, q: query.slice(0, 100), image_type: 'photo', orientation: orientation === 'landscape' ? 'horizontal' : 'all', min_width: '1920', safesearch: 'true', order: 'popular', per_page: '30', ...extra });
      const res = await fetch(u);
      if (!res.ok) throw new Error(`Pixabay araması başarısız (HTTP ${res.status})`);
      return (await res.json()).hits || [];
    };
    const seen = new Set();
    const hits = [...(await run({ editors_choice: 'true' })), ...(await run({}))].filter((p) => !seen.has(p.id) && seen.add(p.id));
    return hits
      .filter((p) => !exclude.includes(String(p.id)))
      .map((p) => ({
        provider: 'pixabay',
        id: String(p.id),
        width: p.imageWidth,
        height: p.imageHeight,
        tags: p.tags,
        editorsChoice: false,
        user: { name: p.user, links: { html: `https://pixabay.com/users/${p.user}-${p.user_id}/` } },
        links: { html: p.pageURL },
        urls: { raw: p.largeImageURL, preview: p.webformatURL },
      }));
  }
  if (provider() === 'pexels') {
    const u = new URL('https://api.pexels.com/v1/search');
    u.search = new URLSearchParams({ query, orientation, per_page: '15' });
    const res = await fetch(u, { headers: { Authorization: config.pexels.apiKey } });
    if (!res.ok) throw new Error(`Pexels araması başarısız (HTTP ${res.status})`);
    const json = await res.json();
    return (json.photos || [])
      .filter((p) => p.width >= 1600 && !exclude.includes(String(p.id)))
      .map((p) => ({
        provider: 'pexels',
        id: String(p.id),
        width: p.width,
        height: p.height,
        user: { name: p.photographer, links: { html: p.photographer_url } },
        links: { html: p.url },
        urls: { raw: `${p.src.original}?auto=compress&cs=tinysrgb`, preview: p.src.medium },
      }));
  }
  const key = config.unsplash.accessKey;
  if (!key) throw new Error('PEXELS_API_KEY veya UNSPLASH_ACCESS_KEY tanımlı değil.');
  const u = new URL('https://api.unsplash.com/search/photos');
  u.search = new URLSearchParams({ query, orientation, per_page: '15', content_filter: 'high' });
  const res = await fetch(u, { headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' } });
  if (!res.ok) throw new Error(`Unsplash araması başarısız (HTTP ${res.status})`);
  const json = await res.json();
  return (json.results || [])
    .filter((p) => p.width >= 1600 && !exclude.includes(p.id))
    .map((p) => ({ ...p, provider: 'unsplash' }));
}

/**
 * Aday fotoğraflar arasından en uygun ve en profesyonel görüneni Claude'a (görsel olarak) seçtirir.
 * Uygun aday yoksa null döner (konu dışı / amatör / yazı-logo içeren fotoğraflar elenir).
 */
export async function pickBestPhoto(candidates, { topic, purpose = 'kapak', max = 8 } = {}) {
  const list = candidates.filter((c) => c.urls?.preview).slice(0, max);
  if (!list.length || !config.claude.apiKey) return candidates[0] || null;
  const imgs = [];
  for (const c of list) {
    try {
      const r = await fetch(c.urls.preview);
      if (!r.ok) continue;
      const b = await sharp(Buffer.from(await r.arrayBuffer())).resize(640, 400, { fit: 'inside' }).jpeg({ quality: 75 }).toBuffer();
      imgs.push({ c, b64: b.toString('base64') });
    } catch {}
  }
  if (!imgs.length) return candidates[0] || null;
  const content = [];
  imgs.forEach((x, i) => {
    content.push({ type: 'text', text: `Fotoğraf ${i + 1}:` });
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: x.b64 } });
  });
  content.push({
    type: 'text',
    text: `Bir motosiklet yedek parça mağazasının "${topic}" başlıklı blog yazısı için ${purpose} fotoğrafı seçiyoruz.
Ölçütler: (1) konuyla doğrudan ilgili olmalı (motosiklet/scooter ve konudaki parça; otomobil, bisiklet, alakasız nesne olmamalı),
(2) profesyonel, net, iyi ışıklı, dergi kalitesinde olmalı, (3) üzerinde yazı, logo, filigran, kolaj veya çizim olmamalı,
(4) kapak ise yatay kırpıldığında ana obje ortada kalmalı.
En iyi fotoğrafın numarasını ver; hiçbiri ölçütleri karşılamıyorsa 0 yaz. Sadece sayı yaz.`,
  });
  try {
    const { pickModel } = await import('./content.js');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': config.claude.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: await pickModel(), max_tokens: 10, messages: [{ role: 'user', content }] }),
    });
    const j = await res.json();
    const n = parseInt(String(j.content?.[0]?.text || '').match(/\d+/)?.[0] ?? '-1', 10);
    if (n === 0) return null;
    if (n >= 1 && n <= imgs.length) return imgs[n - 1].c;
  } catch {}
  return imgs[0].c;
}

export async function downloadPhoto(photo, params) {
  if (photo.provider === 'unsplash' && photo.links.download_location) {
    // Unsplash API kuralı: kullanılan fotoğraf için download endpoint'i tetiklenmeli.
    fetch(`${photo.links.download_location}&client_id=${config.unsplash.accessKey}`).catch(() => {});
  }
  const url = photo.provider === 'pixabay' ? photo.urls.raw : `${photo.urls.raw}&${new URLSearchParams(params)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fotoğraf indirilemedi (HTTP ${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

export const credit = (photo, label = 'Fotoğraf') => {
  if (photo.provider === 'pixabay') {
    return `${label}: <a href="${photo.user.links.html}">${escapeHtml(photo.user.name)}</a> / <a href="https://pixabay.com/">Pixabay</a>`;
  }
  if (photo.provider === 'pexels') {
    return `${label}: <a href="${photo.user.links.html}">${escapeHtml(photo.user.name)}</a> / <a href="https://www.pexels.com">Pexels</a>`;
  }
  const utm = `utm_source=${config.unsplash.appName}&utm_medium=referral`;
  return `${label}: <a href="${photo.user.links.html}?${utm}">${escapeHtml(photo.user.name)}</a> / <a href="https://unsplash.com/?${utm}">Unsplash</a>`;
};

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Kapak: sitede kapak ~3.4:1 geniş şerit olarak ortadan kırpılıyor.
 * 'framed': koyu degrade zemin + kenarları yumuşatılmış, ortalanmış fotoğraf (ana obje her ekranda görünür).
 * 'full'  : fotoğraf tam kaplar (ilgi alanına göre kırpılır).
 */
export async function makeCover(buffer, style = config.coverStyle) {
  if (style === 'full') {
    // Fotoğraf tam kaplar; sitede başlık ortada beyaz yazıyla çıktığı için hafif, sinematik bir karartma.
    const shade = Buffer.from(
      `<svg width="${COVER_W}" height="${COVER_H}" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="v" cx="50%" cy="50%" r="75%"><stop offset="0" stop-color="#000" stop-opacity="0.28"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#v)"/></svg>`,
    );
    return sharp(buffer)
      .resize(COVER_W, COVER_H, { fit: 'cover', position: sharp.strategy.attention })
      .modulate({ saturation: 1.05 })
      .composite([{ input: shade }])
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
  }
  const FW = 1000, FH = 540, FE = 90; // fotoğraf alanı ve yumuşatma
  const photo = await sharp(buffer).resize(FW, FH, { fit: 'cover', position: sharp.strategy.attention }).toBuffer();
  // ortalama renkten koyu, sıcak bir zemin üret
  const { dominant } = await sharp(photo).stats();
  const mix = (c, f) => Math.round(c * f);
  const c1 = `rgb(${mix(dominant.r, 0.35)},${mix(dominant.g, 0.3)},${mix(dominant.b, 0.28)})`;
  const bg = Buffer.from(
    `<svg width="${COVER_W}" height="${COVER_H}" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="g" cx="50%" cy="48%" r="65%"><stop offset="0" stop-color="${c1}"/><stop offset="0.55" stop-color="#15110e"/><stop offset="1" stop-color="#050505"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`,
  );
  const mask = Buffer.from(
    `<svg width="${FW}" height="${FH}" xmlns="http://www.w3.org/2000/svg"><defs><filter id="b"><feGaussianBlur stdDeviation="${FE / 2.2}"/></filter></defs><rect x="${FE * 0.7}" y="${FE * 0.6}" width="${FW - FE * 1.4}" height="${FH - FE * 1.2}" fill="#fff" filter="url(#b)"/></svg>`,
  );
  const feathered = await sharp(photo)
    .ensureAlpha()
    .composite([{ input: await sharp(mask).resize(FW, FH).toBuffer(), blend: 'dest-in' }])
    .png()
    .toBuffer();
  return sharp(bg)
    .composite([{ input: feathered, left: Math.round((COVER_W - FW) / 2), top: Math.round((COVER_H - FH) / 2) }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

// Fotoğraf sağlayıcısı yoksa: koyu zemin üzerinde beyaz panelde mağaza ürünleri.
export async function makeProductCover(buffers) {
  const bg = Buffer.from(
    `<svg width="${COVER_W}" height="${COVER_H}" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="g" cx="50%" cy="48%" r="65%"><stop offset="0" stop-color="#3a2a1e"/><stop offset="0.55" stop-color="#15110e"/><stop offset="1" stop-color="#050505"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`,
  );
  if (!buffers?.length) return sharp(bg).jpeg({ quality: 90 }).toBuffer();
  const panel = await makeCollage(buffers.slice(0, 4), 1100, 480);
  const rounded = await sharp(panel)
    .composite([{ input: Buffer.from('<svg width="1100" height="480"><rect width="1100" height="480" rx="28" ry="28"/></svg>'), blend: 'dest-in' }])
    .png()
    .toBuffer();
  // Sitede başlık kapağın ortasına beyaz yazıyla geliyor: okunabilsin diye karart.
  const shade = Buffer.from(`<svg width="${COVER_W}" height="${COVER_H}"><rect width="100%" height="100%" fill="#000" fill-opacity="0.5"/></svg>`);
  return sharp(bg)
    .composite([{ input: rounded, left: (COVER_W - 1100) / 2, top: (COVER_H - 480) / 2 }, { input: shade }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

export async function makeInline(buffer) {
  return sharp(buffer).resize(1200, 750, { fit: 'cover', position: sharp.strategy.attention }).jpeg({ quality: 86 }).toBuffer();
}

export async function makeCollage(buffers, W = 1200, H = 400) {
  const n = buffers.length, pad = 24;
  const cw = Math.floor((W - pad * (n + 1)) / n), ch = H - pad * 2;
  const tiles = await Promise.all(
    buffers.map((b) => sharp(b).flatten({ background: '#ffffff' }).resize(cw, ch, { fit: 'contain', background: '#ffffff' }).toBuffer()),
  );
  return sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } })
    .composite(tiles.map((t, i) => ({ input: t, left: pad + i * (cw + pad), top: pad })))
    .jpeg({ quality: 90 })
    .toBuffer();
}

// ikas görselleri 1080px genişlikte sunuyor; içerikteki <img> boyutları buna göre.
export const servedSize = (w, h) => ({ width: 1080, height: Math.round((1080 * h) / w) });
