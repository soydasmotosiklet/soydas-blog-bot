// Unsplash'ten gerçek fotoğraf bulma ve kapak / içerik / ürün kolajı görsellerini üretme.
import sharp from 'sharp';
import { config } from './config.js';

const COVER_W = 1920, COVER_H = 1080;

export async function searchUnsplash(query, { orientation = 'landscape', exclude = [] } = {}) {
  const key = config.unsplash.accessKey;
  if (!key) throw new Error('UNSPLASH_ACCESS_KEY tanımlı değil.');
  const u = new URL('https://api.unsplash.com/search/photos');
  u.search = new URLSearchParams({ query, orientation, per_page: '15', content_filter: 'high' });
  const res = await fetch(u, { headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' } });
  if (!res.ok) throw new Error(`Unsplash araması başarısız (HTTP ${res.status})`);
  const json = await res.json();
  return (json.results || []).filter((p) => p.width >= 1600 && !exclude.includes(p.id));
}

export async function downloadUnsplash(photo, params) {
  // Unsplash API kuralı: kullanılan fotoğraf için download endpoint'i tetiklenmeli.
  fetch(`${photo.links.download_location}&client_id=${config.unsplash.accessKey}`).catch(() => {});
  const url = `${photo.urls.raw}&${new URLSearchParams(params)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fotoğraf indirilemedi (HTTP ${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

export const credit = (photo, label = 'Fotoğraf') => {
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
    return sharp(buffer).resize(COVER_W, COVER_H, { fit: 'cover', position: sharp.strategy.attention }).jpeg({ quality: 88 }).toBuffer();
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
