// Taslak oluşturma ve yayınlama akışı.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import * as ikas from './ikas.js';
import { loadSiteIndex, relevantProducts, productImageUrl, urlOk, fold } from './site.js';
import { generatePost, pickModel } from './content.js';
import { searchPhotos, downloadPhoto, makeCover, makeProductCover, makeInline, makeCollage, credit, servedSize } from './images.js';
import { renderBlocksHtml, wrapContent, toContentData, blocksToMarkdown, blockId } from './render.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DRAFTS = path.join(ROOT, 'drafts');
const STATE = path.join(ROOT, 'state', 'published.json');

const readJson = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n'); };
const log = (...a) => console.error('•', ...a);

export function pickTopic(existingTitles) {
  const topics = readJson(path.join(ROOT, 'topics.json'), []);
  const published = readJson(STATE, []).map((p) => fold(p.title));
  const pending = fs.existsSync(DRAFTS) ? fs.readdirSync(DRAFTS).filter((f) => f.endsWith('.json')).map((f) => readJson(path.join(DRAFTS, f), {}).topic).filter(Boolean).map(fold) : [];
  const taken = new Set([...existingTitles.map(fold), ...published, ...pending]);
  return topics.find((t) => !taken.has(fold(t))) || null;
}

async function chooseTopicWithClaude(existingTitles, collections) {
  // Liste bittiğinde: Claude'a mevcut yazılara ve kategorilere göre yeni konu seçtir.
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': config.claude.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: await pickModel(),
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Motosiklet yedek parça/ekipman mağazası blogu için, mevcut yazılarla çakışmayan, Türkiye'de aranan, mağaza kategorileriyle ilgili TEK bir blog başlığı öner. Sadece başlığı yaz.\nMevcut yazılar: ${existingTitles.join(' | ')}\nKategoriler: ${collections.slice(0, 250).join(' ')}`,
      }],
    }),
  });
  const json = await res.json();
  return (json.content?.[0]?.text || '').trim().replace(/^["']|["']$/g, '');
}

function sanitizeLinks(html, allowed, broken) {
  return String(html).replace(/<a href="([^"]*)">(.*?)<\/a>/g, (m, href, text) => {
    if (/^https:\/\/(www\.)?(unsplash|pexels|pixabay)\.com(\/|$)/.test(href)) return m;
    let p = href.replace(/^https?:\/\/(www\.)?soydasmotosiklet\.com/, '');
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

export async function createDraft({ topic: forcedTopic, feedback, skipIkas = false } = {}) {
  log('Site haritası okunuyor…');
  const site = await loadSiteIndex();

  let existing = [];
  if (!skipIkas) {
    try { existing = await ikas.listBlogs(); } catch (e) { log('Uyarı: ikas blog listesi alınamadı:', e.message); }
  }
  const existingTitles = existing.map((b) => b.title);
  const existingSlugs = new Set(existing.map((b) => b.metadata?.slug));

  let topic = forcedTopic || pickTopic(existingTitles);
  if (!topic) topic = await chooseTopicWithClaude(existingTitles, site.collections);
  log('Konu:', topic);

  const products = relevantProducts(site.products, topic);
  log(`Claude ile yazı üretiliyor (${products.length} ilgili ürün)…`);
  const post = await generatePost({ topic, existingTitles, collections: site.collections, products, feedback });

  // Linkleri doğrula
  const linkSet = collectLinks(post.blocks);
  const broken = new Set();
  await Promise.all([...linkSet].map(async (l) => { if (!site.all.has(l) || !(await urlOk(l))) broken.add(l); }));
  if (broken.size) log('Kaldırılan geçersiz linkler:', [...broken].join(', '));
  const clean = (t) => sanitizeLinks(t, site.all, broken);

  // Görseller
  log('Görseller hazırlanıyor…');
  const usedPhotoIds = [];
  // Ürün fotoğrafları (kolaj ve gerekirse kapak için)
  const productBufs = [];
  const collagePaths = (post.collageProducts || []).filter((p) => site.all.has(p)).slice(0, 4);
  for (const p of collagePaths) {
    const u = await productImageUrl(p);
    if (!u) continue;
    const r = await fetch(u);
    if (r.ok) productBufs.push(Buffer.from(await r.arrayBuffer()));
  }
  const collageBuf = productBufs.length >= 2 ? await makeCollage(productBufs) : null;

  let coverPhoto = (await searchPhotos(post.coverQuery))[0];
  if (!coverPhoto && post.coverQueryAlt) coverPhoto = (await searchPhotos(post.coverQueryAlt))[0];
  if (!coverPhoto) coverPhoto = (await searchPhotos('motorcycle'))[0];
  let coverBuf;
  if (coverPhoto) {
    usedPhotoIds.push(coverPhoto.id);
    coverBuf = await makeCover(await downloadPhoto(coverPhoto, { w: '2400', q: '85', fm: 'jpg' }));
  } else {
    log('Fotoğraf sağlayıcısı yok/sonuç yok: kapak ürün fotoğraflarından üretiliyor.');
    coverBuf = await makeProductCover(productBufs);
  }

  let inlinePhoto = (await searchPhotos(post.inlineQuery, { exclude: usedPhotoIds }))[0];
  if (!inlinePhoto && coverPhoto) inlinePhoto = (await searchPhotos(post.coverQueryAlt || 'motorcycle maintenance', { exclude: usedPhotoIds }))[0];
  const inlineBuf = inlinePhoto ? await makeInline(await downloadPhoto(inlinePhoto, { w: '1600', q: '85', fm: 'jpg' })) : null;

  // ikas'a yükle (yüklemek yayınlamak değildir; görseller sadece CDN'de durur)
  const upload = async (buf) => (skipIkas ? null : ikas.uploadImage(buf));
  const coverImageId = await upload(coverBuf);
  const inlineId = inlineBuf ? await upload(inlineBuf) : null;
  const collageId = collageBuf ? await upload(collageBuf) : null;
  const urlOf = (id, localName) => (id ? ikas.cdnUrl(id) : `local:${localName}`);

  // Blokları Editor.js formatına çevir
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
      if (b.slot === 'collage' && collageBuf) {
        const url = urlOf(collageId, 'collage.jpg');
        imageSizes[url] = servedSize(1200, 400);
        blocks.push({ id: blockId(), type: 'image', data: { file: { url }, caption: b.caption || '', withBorder: false, stretched: false, withBackground: false } });
      } else if (b.slot === 'photo' && inlineBuf) {
        const url = urlOf(inlineId, 'inline.jpg');
        imageSizes[url] = servedSize(1200, 750);
        const cap = `${b.caption ? b.caption + ' ' : ''}(${credit(inlinePhoto)})`;
        blocks.push({ id: blockId(), type: 'image', data: { file: { url }, caption: cap, withBorder: false, stretched: false, withBackground: false } });
      }
    }
  }
  if (coverPhoto) blocks.push({ id: blockId(), type: 'paragraph', data: { text: `<i>${credit(coverPhoto, 'Kapak fotoğrafı')}</i>` } });

  let slug = fold(post.slug || topic);
  if (existingSlugs.has(slug) || (!skipIkas && (await ikas.checkSlug(slug)))) slug = `${slug}-${new Date().getFullYear()}`;

  const draft = {
    topic,
    createdAt: new Date().toISOString(),
    model: post.model,
    title: topic,
    slug,
    shortDescription: post.shortDescription,
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription.slice(0, 160),
    coverImageId,
    coverPhoto: coverPhoto ? { provider: coverPhoto.provider, id: coverPhoto.id, user: coverPhoto.user.name, link: coverPhoto.links.html } : null,
    inlinePhoto: inlinePhoto ? { id: inlinePhoto.id, user: inlinePhoto.user.name, link: inlinePhoto.links.html } : null,
    blocks,
    contentHtml: wrapContent(renderBlocksHtml(blocks, imageSizes)),
    contentData: toContentData(blocks),
    removedLinks: [...broken],
  };
  writeJson(path.join(DRAFTS, `${slug}.json`), draft);
  if (skipIkas) {
    fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'out', 'cover.jpg'), coverBuf);
    if (inlineBuf) fs.writeFileSync(path.join(ROOT, 'out', 'inline.jpg'), inlineBuf);
    if (collageBuf) fs.writeFileSync(path.join(ROOT, 'out', 'collage.jpg'), collageBuf);
  }
  return draft;
}

export function draftIssueBody(draft) {
  const c = (v) => String(v ?? '').replace(/\|/g, '\\|');
  const words = draft.blocks.map((b) => JSON.stringify(b.data)).join(' ').replace(/<[^>]+>/g, ' ').split(/\s+/).length;
  const cover = draft.coverImageId ? `![Kapak](${ikas.cdnUrl(draft.coverImageId)})` : '_(kapak yerelde üretildi)_';
  return `<!-- draft:${draft.slug} -->
${cover}

| Alan | Değer |
| --- | --- |
| Başlık | ${c(draft.title)} |
| URL | ${config.store.siteUrl}/blog/${draft.slug} |
| Kısa açıklama | ${c(draft.shortDescription)} |
| SEO başlığı | ${c(draft.seoTitle)} |
| SEO açıklaması | ${c(draft.seoDescription)} |
| Yaklaşık kelime | ${words} |
| Kapak fotoğrafı | ${draft.coverPhoto ? `[${draft.coverPhoto.user} / ${{ pexels: 'Pexels', pixabay: 'Pixabay', unsplash: 'Unsplash' }[draft.coverPhoto.provider]}](${draft.coverPhoto.link})` : 'Mağaza ürün fotoğraflarından üretildi'} |
${draft.removedLinks.length ? `| Kaldırılan geçersiz linkler | ${draft.removedLinks.join(', ')} |\n` : ''}
**Yayınlamak için** bu sayfaya \`/yayinla\` yazın.
**Yeniden yazdırmak için** \`/yeniden\` ve isteğinizi yazın (ör. \`/yeniden daha kısa olsun, tabloya fiyat aralığı ekleme\`).
**Vazgeçmek için** \`/iptal\` yazın.

---

# ${draft.title}

${blocksToMarkdown(draft.blocks)}
`;
}

export async function publishDraft(slug) {
  const file = path.join(DRAFTS, `${slug}.json`);
  if (!fs.existsSync(file)) throw new Error(`Taslak bulunamadı: ${slug}`);
  const draft = readJson(file);
  if (!draft.coverImageId) throw new Error('Taslakta kapak görseli yok (ikas\'a yüklenmemiş).');
  const id = await ikas.saveBlog(ikas.buildBlogInput(draft));
  const state = readJson(STATE, []);
  state.push({ id, title: draft.title, slug: draft.slug, publishedAt: new Date().toISOString() });
  writeJson(STATE, state);
  fs.unlinkSync(file);
  return { id, url: `${config.store.siteUrl}/blog/${draft.slug}` };
}

export function discardDraft(slug) {
  const file = path.join(DRAFTS, `${slug}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

export function getDraft(slug) {
  return readJson(path.join(DRAFTS, `${slug}.json`), null);
}
