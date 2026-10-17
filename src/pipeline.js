// Taslak oluşturma, onay ve yayın takibi.
//
// ikas'ın resmi API'si blog işlemlerine izin vermediği için akış şöyle:
//   1) Bulut (GitHub Actions): yazı + görseller hazırlanır → drafts/<slug>/ klasörüne kaydedilir → onay issue'su açılır.
//   2) Siz issue'ya /yayinla yazarsınız → taslak "onaylı" işaretlenir.
//   3) ikas panelinde "Blog Yayınla" yer imine tıklarsınız (ya da Claude'a söylersiniz) →
//      browser/ikas-yayinla.js onaylı taslakları sizin oturumunuzla ikas'a ekler.
//   4) Saatlik senkron: yayına giren taslaklar temizlenir, issue kapatılır.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { loadSiteIndex, relevantProducts, productImageUrl, urlOk, fold, publishedBlogSlugs } from './site.js';
import { generatePost, pickModel } from './content.js';
import { searchPhotos, downloadPhoto, pickBestPhoto, makeCover, makeProductCover, makeInline, makeCollage, credit, servedSize } from './images.js';
import { renderBlocksHtml, wrapContent, toContentData, blocksToMarkdown, blockId } from './render.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DRAFTS = path.join(ROOT, 'drafts');
const STATE = path.join(ROOT, 'state', 'published.json');
const REPO = process.env.GITHUB_REPOSITORY || 'soydasmotosiklet/soydas-blog-bot';
const RAW = `https://raw.githubusercontent.com/${REPO}/main`;

export const IMG = (key) => `__IMG_${key}__`; // tarayıcıda ikas CDN adresiyle değiştirilir

const readJson = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n'); };
const log = (...a) => console.error('•', ...a);

export function listDrafts() {
  if (!fs.existsSync(DRAFTS)) return [];
  return fs.readdirSync(DRAFTS)
    .filter((d) => fs.existsSync(path.join(DRAFTS, d, 'draft.json')))
    .map((d) => readJson(path.join(DRAFTS, d, 'draft.json')));
}

export function pickTopic(takenKeys) {
  const topics = readJson(path.join(ROOT, 'topics.json'), []);
  const published = readJson(STATE, []).map((p) => fold(p.title));
  const pending = listDrafts().map((d) => fold(d.topic));
  const taken = new Set([...takenKeys, ...published, ...pending]);
  return topics.find((t) => !taken.has(fold(t))) || null;
}

async function chooseTopicWithClaude(existing, collections) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': config.claude.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: await pickModel(),
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Motosiklet yedek parça/ekipman mağazası blogu için, mevcut yazılarla çakışmayan, Türkiye'de aranan, mağaza kategorileriyle ilgili TEK bir blog başlığı öner. Sadece başlığı yaz.\nMevcut yazılar: ${existing.join(' | ')}\nKategoriler: ${collections.slice(0, 250).join(' ')}`,
      }],
    }),
  });
  const json = await res.json();
  return (json.content?.[0]?.text || '').trim().replace(/^["']|["']$/g, '');
}

function sanitizeLinks(html, allowed, broken) {
  return String(html).replace(/<a href="([^"]*)">(.*?)<\/a>/g, (m, href, text) => {
    if (/^https:\/\/(www\.)?(unsplash|pexels|pixabay)\.com(\/|$)/.test(href)) return m;
    const p = href.replace(/^https?:\/\/(www\.)?soydasmotosiklet\.com/, '');
    if (!p.startsWith('/') || !allowed.has(p) || broken.has(p)) return text;
    return `<a href="${p}">${text}</a>`;
  });
}

const collectLinks = (blocks) => {
  const s = new Set();
  const scan = (t) => [...String(t || '').matchAll(/<a href="(\/[^"]*)">/g)].forEach((m) => s.add(m[1]));
  for (const b of blocks) { scan(b.text); (b.items || []).forEach(scan); (b.rows || []).flat().forEach(scan); }
  return s;
};

// Kapak + içerik fotoğrafı: birkaç aramadan aday toplar, en iyisini görsel olarak seçtirir.
export async function makePhotos(post, productBufs = [], log = console.log) {
  const gather = async (queries, exclude = []) => {
    const out = [];
    for (const q of queries.filter(Boolean)) {
      for (const p of await searchPhotos(q, { exclude })) if (!out.some((x) => x.id === p.id)) out.push(p);
      if (out.length >= 12) break;
    }
    return out;
  };
  const topic = post.title;
  const coverPhoto = await pickBestPhoto(await gather([post.coverQuery, post.coverQueryAlt, 'motorcycle workshop', 'motorcycle']), { topic, purpose: 'kapak (geniş, yatay)' });
  let coverBuf;
  if (coverPhoto) {
    coverBuf = await makeCover(await downloadPhoto(coverPhoto, { w: '2400', q: '85', fm: 'jpg' }));
  } else {
    log('Uygun fotoğraf bulunamadı (sağlayıcı anahtarı yok olabilir): kapak ürün fotoğraflarından üretiliyor.');
    coverBuf = await makeProductCover(productBufs);
  }
  const inlinePhoto = coverPhoto
    ? await pickBestPhoto(await gather([post.inlineQuery, post.coverQueryAlt, 'motorcycle maintenance'], [coverPhoto.id]), { topic, purpose: 'yazı içi' })
    : null;
  const inlineBuf = inlinePhoto ? await makeInline(await downloadPhoto(inlinePhoto, { w: '1600', q: '85', fm: 'jpg' })) : null;
  return { coverPhoto, coverBuf, inlinePhoto, inlineBuf };
}

export async function createDraft({ topic: forcedTopic, feedback } = {}) {
  log('Site haritası okunuyor…');
  const site = await loadSiteIndex();
  const liveSlugs = site.blogs.filter((p) => p.startsWith('/blog/')).map((p) => p.slice(6));
  const existingLabels = liveSlugs.map((s) => `/blog/${s}`);

  let topic = forcedTopic || pickTopic(liveSlugs);
  if (!topic) topic = await chooseTopicWithClaude(existingLabels, site.collections);
  log('Konu:', topic);

  const products = relevantProducts(site.products, topic);
  log(`Claude ile yazı üretiliyor (${products.length} ilgili ürün)…`);
  const post = await generatePost({ topic, existingTitles: existingLabels, collections: site.collections, products, feedback });

  // Linkleri doğrula
  const linkSet = collectLinks(post.blocks);
  const broken = new Set();
  await Promise.all([...linkSet].map(async (l) => { if (!site.all.has(l) || !(await urlOk(l))) broken.add(l); }));
  if (broken.size) log('Kaldırılan geçersiz linkler:', [...broken].join(', '));
  const clean = (t) => sanitizeLinks(t, site.all, broken);

  // Görseller
  log('Görseller hazırlanıyor…');
  const productBufs = [];
  for (const p of (post.collageProducts || []).filter((x) => site.all.has(x)).slice(0, 4)) {
    const u = await productImageUrl(p);
    if (!u) continue;
    const r = await fetch(u);
    if (r.ok) productBufs.push(Buffer.from(await r.arrayBuffer()));
  }
  const collageBuf = productBufs.length >= 2 ? await makeCollage(productBufs) : null;

  const { coverPhoto, coverBuf, inlinePhoto, inlineBuf } = await makePhotos(post, productBufs, log);

  // Blokları Editor.js formatına çevir (görsel adresleri yer tutucu)
  const imageSizes = {};
  const blocks = [];
  for (const b of post.blocks) {
    if (b.type === 'paragraph' && b.text) blocks.push({ id: blockId(), type: 'paragraph', data: { text: clean(b.text) } });
    else if (b.type === 'header' && b.text) blocks.push({ id: blockId(), type: 'header', data: { text: clean(b.text), level: b.level === 3 ? 3 : 2 } });
    else if (b.type === 'list' && b.items?.length) blocks.push({ id: blockId(), type: 'list', data: { style: b.style === 'ordered' ? 'ordered' : 'unordered', items: b.items.map(clean) } });
    else if (b.type === 'table' && b.rows?.length) {
      const rows = b.rows.map((r, i) => r.map((c) => (i === 0 ? `<b>${clean(c).replace(/<\/?b>/g, '')}</b>` : clean(c))));
      blocks.push({ id: blockId(), type: 'table', data: { withHeadings: true, content: rows } });
    } else if (b.type === 'image_slot') {
      if (b.slot === 'collage' && collageBuf && !imageSizes[IMG('collage')]) {
        imageSizes[IMG('collage')] = servedSize(1200, 400);
        blocks.push({ id: blockId(), type: 'image', data: { file: { url: IMG('collage') }, caption: b.caption || '', withBorder: false, stretched: false, withBackground: false } });
      } else if (b.slot === 'photo' && inlineBuf && !imageSizes[IMG('inline')]) {
        imageSizes[IMG('inline')] = servedSize(1200, 750);
        const cap = `${b.caption ? b.caption + ' ' : ''}(${credit(inlinePhoto)})`;
        blocks.push({ id: blockId(), type: 'image', data: { file: { url: IMG('inline') }, caption: cap, withBorder: false, stretched: false, withBackground: false } });
      }
    }
  }
  if (coverPhoto) blocks.push({ id: blockId(), type: 'paragraph', data: { text: `<i>${credit(coverPhoto, 'Kapak fotoğrafı')}</i>` } });

  let slug = fold(post.slug || topic);
  if (liveSlugs.includes(slug) || listDrafts().some((d) => d.slug === slug)) slug = `${slug}-${new Date().getFullYear()}`;

  const dir = path.join(DRAFTS, slug);
  fs.mkdirSync(dir, { recursive: true });
  const images = { cover: 'cover.jpg' };
  fs.writeFileSync(path.join(dir, 'cover.jpg'), coverBuf);
  if (inlineBuf && imageSizes[IMG('inline')]) { fs.writeFileSync(path.join(dir, 'inline.jpg'), inlineBuf); images.inline = 'inline.jpg'; }
  if (collageBuf && imageSizes[IMG('collage')]) { fs.writeFileSync(path.join(dir, 'collage.jpg'), collageBuf); images.collage = 'collage.jpg'; }

  const draft = {
    topic,
    approved: process.env.AUTO_APPROVE !== 'false', // otomatik modda doğrudan yayına hazır
    createdAt: new Date().toISOString(),
    model: post.model,
    title: topic,
    slug,
    shortDescription: post.shortDescription,
    seoTitle: post.seoTitle,
    seoDescription: String(post.seoDescription).slice(0, 160),
    images,
    coverPhoto: coverPhoto ? { provider: coverPhoto.provider, id: coverPhoto.id, user: coverPhoto.user.name, link: coverPhoto.links.html } : null,
    blocks,
    contentHtml: wrapContent(renderBlocksHtml(blocks, imageSizes)),
    contentData: toContentData(blocks),
    removedLinks: [...broken],
  };
  writeJson(path.join(dir, 'draft.json'), draft);
  return draft;
}

export function draftIssueBody(draft) {
  const c = (v) => String(v ?? '').replace(/\|/g, '\\|');
  const words = draft.blocks.map((b) => JSON.stringify(b.data)).join(' ').replace(/<[^>]+>/g, ' ').split(/\s+/).length;
  const base = `${RAW}/drafts/${draft.slug}`;
  const md = blocksToMarkdown(draft.blocks).replace(/__IMG_(\w+)__/g, (m, k) => `${base}/${draft.images[k]}`);
  const src = draft.coverPhoto
    ? `[${draft.coverPhoto.user} / ${{ pexels: 'Pexels', pixabay: 'Pixabay', unsplash: 'Unsplash' }[draft.coverPhoto.provider]}](${draft.coverPhoto.link})`
    : 'Mağaza ürün fotoğraflarından üretildi';
  return `<!-- draft:${draft.slug} -->
![Kapak](${base}/cover.jpg)

| Alan | Değer |
| --- | --- |
| Başlık | ${c(draft.title)} |
| URL | ${config.store.siteUrl}/blog/${draft.slug} |
| Kısa açıklama | ${c(draft.shortDescription)} |
| SEO başlığı | ${c(draft.seoTitle)} |
| SEO açıklaması | ${c(draft.seoDescription)} |
| Yaklaşık kelime | ${words} |
| Kapak görseli | ${src} |
${draft.removedLinks.length ? `| Kaldırılan geçersiz linkler | ${draft.removedLinks.join(', ')} |\n` : ''}
${draft.approved
  ? '⏰ **Bu yazı saat 09:00\'da otomatik olarak ikas\'a eklenecek** (bilgisayarınızda Chrome açıkken Soydaş Blog eklentisi yapar).\n**Yayınlanmasın istiyorsanız** 09:00\'dan önce \`/iptal\` yazın. **Değiştirmek için** \`/yeniden\` ve isteğinizi yazın.'
  : '**Onaylamak için** bu sayfaya \`/yayinla\` yazın. **Yeniden yazdırmak için** \`/yeniden\` ve isteğinizi yazın. **Vazgeçmek için** \`/iptal\` yazın.'}

---

# ${draft.title}

${md}
`;
}

export function approveDraft(slug) {
  const f = path.join(DRAFTS, slug, 'draft.json');
  if (!fs.existsSync(f)) throw new Error(`Taslak bulunamadı: ${slug}`);
  const d = readJson(f);
  d.approved = true;
  d.approvedAt = new Date().toISOString();
  writeJson(f, d);
  return d;
}

export function discardDraft(slug) {
  fs.rmSync(path.join(DRAFTS, slug), { recursive: true, force: true });
}

export function getDraft(slug) {
  return readJson(path.join(DRAFTS, slug, 'draft.json'), null);
}

// Saat 10:00'u (TR) geçmesine rağmen yayına girmemiş onaylı taslaklar (uyarı için)
export function overdueDrafts(now = new Date()) {
  const trHour = (now.getUTCHours() + 3) % 24;
  if (trHour < 10) return [];
  const todayTR = new Date(now.getTime() + 3 * 3600e3).toISOString().slice(0, 10);
  return listDrafts().filter((d) => d.approved && !d.alerted && new Date(new Date(d.createdAt).getTime() + 3 * 3600e3).toISOString().slice(0, 10) <= todayTR);
}

export function markAlerted(slug) {
  const f = path.join(DRAFTS, slug, 'draft.json');
  const d = readJson(f);
  d.alerted = true;
  writeJson(f, d);
}

// Sitede yayına girmiş taslakları bul, kayda geçir ve klasörlerini sil.
export async function syncPublished() {
  const live = await publishedBlogSlugs();
  const done = [];
  for (const d of listDrafts()) {
    if (live.has(d.slug)) {
      const state = readJson(STATE, []);
      state.push({ title: d.title, slug: d.slug, publishedAt: new Date().toISOString() });
      writeJson(STATE, state);
      discardDraft(d.slug);
      done.push({ slug: d.slug, title: d.title, url: `${config.store.siteUrl}/blog/${d.slug}` });
    }
  }
  return done;
}
