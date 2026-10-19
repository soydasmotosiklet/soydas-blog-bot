// Blog Kılavuzu (18 Ekim 2026) – yazı başına minimum kalite eşiği.
// Otomatik kontrol edilebilen maddeler; geçmeyen taslak yayına alınmaz.

export const RULES = {
  minWords: 800,
  minProductLinks: 3,
  minCategoryLinks: 2,
  minBlogLinks: 1,
  maxBlogLinks: 2,
  maxTitle: 60,
  titleSuffix: '| Soydaş Motosiklet',
  descMin: 140,
  descMax: 160,
  maxSlug: 60,
};

const FORBIDDEN = [
  /teknisyen gözüyle/i,
  /ustamız|uzmanımız|teknisyenimiz/i,
  /\bstokta\b|en ucuz|en uygun fiyat/i,
];

const strip = (s) => String(s ?? '').replace(/<[^>]+>/g, ' ');

export function postTexts(blocks) {
  const out = [];
  for (const b of blocks || []) {
    if (b.text) out.push(b.text);
    if (b.items) out.push(...b.items);
    if (b.rows) out.push(...b.rows.flat());
    if (b.caption) out.push(b.caption);
  }
  return out;
}

export const wordCount = (blocks) =>
  postTexts(blocks).map(strip).join(' ').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

export function linkPaths(blocks) {
  const set = new Set();
  for (const t of postTexts(blocks)) for (const m of String(t).matchAll(/href="([^"]+)"/g)) set.add(m[1]);
  return [...set];
}

/**
 * post: kaydet_yazi çıktısı; ctx: { inStock:Set, collections:Set, blogPosts:Set, topic }
 * Dönüş: Türkçe sorun listesi (boşsa geçti).
 */
export function checkPost(post, ctx) {
  const issues = [];
  const words = wordCount(post.blocks);
  if (words < RULES.minWords) issues.push(`Yazı ${words} kelime; en az ${RULES.minWords} olmalı (doldurma cümle olmadan).`);

  const links = linkPaths(post.blocks);
  const prods = links.filter((l) => ctx.inStock.has(l));
  const cats = links.filter((l) => ctx.collections.has(l));
  const blogs = links.filter((l) => ctx.blogPosts.has(l));
  // Sitede olan ama stokta olmayan / listede verilmeyen ürünler (sitede hiç olmayan linkler zaten otomatik silinir)
  const unknownProducts = links.filter((l) => ctx.allProducts?.has(l) && !ctx.inStock.has(l));
  if (prods.length < RULES.minProductLinks) issues.push(`Stokta olan ürün linki ${prods.length}; en az ${RULES.minProductLinks} olmalı (sadece verilen ürün listesinden).`);
  if (cats.length < RULES.minCategoryLinks) issues.push(`Kategori linki ${cats.length}; en az ${RULES.minCategoryLinks} olmalı.`);
  if (ctx.blogPosts.size && (blogs.length < RULES.minBlogLinks || blogs.length > RULES.maxBlogLinks))
    issues.push(`İlgili blog yazısı linki ${blogs.length}; ${RULES.minBlogLinks}–${RULES.maxBlogLinks} olmalı (sadece verilen blog yollarından).`);
  if (unknownProducts.length) issues.push(`Stokta olmayan veya listede verilmeyen ürün linki: ${unknownProducts.join(', ')} — bunları kaldır ya da listedekilerle değiştir.`);

  const st = String(post.seoTitle || '');
  if (st.length > RULES.maxTitle || !st.endsWith(RULES.titleSuffix))
    issues.push(`SEO başlığı ${st.length} karakter; "${RULES.titleSuffix}" ile bitmeli ve toplam en fazla ${RULES.maxTitle} karakter olmalı.`);
  const sd = String(post.seoDescription || '');
  if (sd.length < RULES.descMin || sd.length > RULES.descMax) issues.push(`Meta açıklama ${sd.length} karakter; ${RULES.descMin}–${RULES.descMax} olmalı.`);

  const slug = String(post.slug || '');
  if (!/^[a-z0-9-]+$/.test(slug) || slug.length > RULES.maxSlug) issues.push(`Adres (slug) kısa, küçük harf, Türkçe karaktersiz olmalı (en fazla ${RULES.maxSlug} karakter).`);
  if (/(19|20)\d\d/.test(slug) || /(19|20)\d\d/.test(ctx.topic || '') || /\b(19|20)\d\d\b/.test(st)) issues.push('Başlıkta, SEO başlığında veya adreste yıl olmamalı.');

  const all = postTexts(post.blocks).join(' ') + ' ' + sd + ' ' + (post.shortDescription || '');
  for (const re of FORBIDDEN) if (re.test(all)) issues.push(`Yasak ifade: ${re.source} (yazar/uzmanlık ya da stok/fiyat iddiası yazılmaz).`);
  return issues;
}

// Fazla blog linkini (ilk `max` farklı yazıdan sonrakileri) düz metne çevirir; kalite kontrolünden önce uygulanır.
export function trimBlogLinks(post, blogPosts, max = RULES.maxBlogLinks) {
  const keep = [];
  const fix = (t) =>
    String(t).replace(/<a href="([^"]+)">([^<]*)<\/a>/g, (m, href, text) => {
      if (!blogPosts.has(href)) return m;
      if (keep.includes(href) || keep.length < max) { if (!keep.includes(href)) keep.push(href); return m; }
      return text;
    });
  for (const b of post.blocks || []) {
    if (b.text) b.text = fix(b.text);
    if (b.items) b.items = b.items.map(fix);
    if (b.rows) b.rows = b.rows.map((r) => r.map(fix));
  }
  return post;
}

// Kalite kontrolünden önce otomatik düzeltilebilen küçük sorunlar (yayın aksamasın diye):
// stokta olmayan/listede olmayan ürün linkleri düz metne çevrilir, uzun SEO başlığı kısaltılır,
// uzun meta açıklama kelime sınırında 160 karaktere indirilir.
export function autoFix(post, ctx) {
  const fix = (t) =>
    String(t).replace(/<a href="([^"]+)">([^<]*)<\/a>/g, (m, href, text) =>
      ctx.allProducts?.has(href) && !ctx.inStock.has(href) ? text : m);
  for (const b of post.blocks || []) {
    if (b.text) b.text = fix(b.text);
    if (b.items) b.items = b.items.map(fix);
    if (b.rows) b.rows = b.rows.map((r) => r.map(fix));
  }
  trimBlogLinks(post, ctx.blogPosts);
  const suffix = ' ' + RULES.titleSuffix;
  let st = String(post.seoTitle || post.title || '').replace(/\s*\|\s*Soydaş Motosiklet\s*$/, '').trim();
  st = st.replace(/\b(19|20)\d\d\b/g, '').replace(/\s{2,}/g, ' ').trim();
  while (st.length + suffix.length > RULES.maxTitle && st.includes(' ')) st = st.slice(0, st.lastIndexOf(' ')).replace(/[,:;–-]+$/, '').trim();
  post.seoTitle = st + suffix;
  let sd = String(post.seoDescription || '').trim();
  if (sd.length > RULES.descMax) {
    sd = sd.slice(0, RULES.descMax - 1);
    sd = sd.slice(0, sd.lastIndexOf(' ')).replace(/[,:;–-]+$/, '') + '.';
  }
  post.seoDescription = sd;
  post.slug = String(post.slug || '').replace(/-?(19|20)\d\d/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return post;
}
