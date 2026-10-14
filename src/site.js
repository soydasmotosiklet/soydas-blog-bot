// Mağaza sitesinden (sitemap) kategori/ürün linklerini ve ürün görsellerini okur.
import { config } from './config.js';

const UA = { 'User-Agent': 'SoydasBlogBot/1.0 (+https://soydasmotosiklet.com)' };

async function sitemapPaths(file) {
  const res = await fetch(`${config.store.siteUrl}/${file}`, { headers: UA });
  if (!res.ok) throw new Error(`${file} okunamadı (HTTP ${res.status})`);
  const xml = await res.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
}

export async function loadSiteIndex() {
  const [collections, products, pages] = await Promise.all([
    sitemapPaths('collections.xml'),
    sitemapPaths('products.xml'),
    sitemapPaths('pages.xml').catch(() => ['/pages/iletisim']),
  ]);
  return { collections, products, pages, all: new Set([...collections, ...products, ...pages]) };
}

export const fold = (s) =>
  String(s)
    .toLocaleLowerCase('tr')
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const STOP = new Set(['ve', 'ile', 'icin', 'nasil', 'ne', 'zaman', 'rehberi', 'rehber', 'secimi', 'motosiklet', 'mi', 'bir', 'en', 'doğru', 'dogru', 'nedir', 'olan']);

export function relevantProducts(products, topic, extraKeywords = [], limit = 180) {
  const stem = (w) => w.replace(/(lari|leri|lar|ler|si|su|i|u)$/, (m) => (w.length - m.length >= 3 ? '' : m));
  const words = [...fold(topic).split('-'), ...extraKeywords.flatMap((k) => fold(k).split('-'))]
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map(stem);
  const scored = products
    .map((p) => ({ p, score: words.reduce((s, w) => s + (p.includes(w) ? 1 : 0), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.p);
}

export async function productImageUrl(path) {
  const res = await fetch(config.store.siteUrl + path, { headers: UA });
  if (!res.ok) return null;
  const html = await res.text();
  const m = html.match(/property="og:image" content="([^"]+)"/);
  return m ? m[1] : null;
}

export async function urlOk(path) {
  try {
    const res = await fetch(config.store.siteUrl + path, { headers: UA, redirect: 'follow' });
    return res.ok;
  } catch {
    return false;
  }
}
