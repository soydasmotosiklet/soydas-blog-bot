// Tüm dış servisleri taklit ederek uçtan uca kuru çalıştırma:
// taslak → issue metni → onay → tarayıcı yayınlayıcısı (ikas) → senkron.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
const MP = process.env.MOCK_PROVIDER || 'pixabay';
process.env.ANTHROPIC_API_KEY = 'k';
process.env.PEXELS_API_KEY = MP === 'pexels' ? 'p' : '';
process.env.PIXABAY_API_KEY = MP === 'pixabay' ? 'x' : '';
process.env.UNSPLASH_ACCESS_KEY = MP === 'unsplash' ? 'u' : '';

const img = (w, h, c) => sharp({ create: { width: w, height: h, channels: 3, background: c } })
  .composite([{ input: Buffer.from(`<svg width="${w}" height="${h}"><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 3}" fill="#c33"/></svg>`) }]).jpeg().toBuffer();
const photo = (id) => ({ id, width: 4000, height: 2600, urls: { raw: `https://images.unsplash.com/${id}?ixid=1` }, links: { download_location: `https://api.unsplash.com/photos/${id}/download?ixid=1`, html: `https://unsplash.com/photos/${id}` }, user: { name: 'Test Foto', links: { html: 'https://unsplash.com/@test' } } });
const post = {
  title: 'Motosiklet Yağı Seçimi', slug: 'motosiklet-yagi-secimi', shortDescription: 'Kısa', seoTitle: 'Yağ | Soydaş Motosiklet', seoDescription: 'Açıklama',
  coverQuery: 'motorcycle oil', inlineQuery: 'engine oil', collageProducts: ['/motul-a', '/motul-b', '/uydurma-urun'],
  blocks: [
    { type: 'paragraph', text: 'Giriş <a href="/yaglar">yağlar</a> & <a href="/olmayan">uydurma</a> <a href="https://rakip.com/x">rakip</a>' },
    { type: 'header', text: 'Bölüm', level: 2 },
    { type: 'image_slot', slot: 'collage', caption: 'Ürünler – Soydaş Motosiklet' },
    { type: 'list', style: 'unordered', items: ['bir <b>iki</b>', '<a href="/motul-a">Motul A</a>'] },
    { type: 'table', rows: [['Tip', 'Kullanım'], ['MA', 'Islak debriyaj']] },
    { type: 'image_slot', slot: 'photo', caption: 'Yağ değişimi' },
    { type: 'header', text: 'SSS', level: 2 }, { type: 'header', text: 'Soru?', level: 3 }, { type: 'paragraph', text: 'Cevap. <a href="/pages/iletisim">bize ulaşın</a>' },
  ],
};
let liveBlogs = ['motosiklet-kask-secimi-rehberi-2026'];
const saved = [];
const R = (body, status = 200) => new Response(typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body), { status });
const repoFile = (p) => path.join(process.cwd(), p);
globalThis.fetch = async (input, init = {}) => {
  const u = String(input);
  const body = init.body && typeof init.body === 'string' ? init.body : '';
  if (u.endsWith('/collections.xml')) return R('<loc>https://soydasmotosiklet.com/yaglar</loc><loc>https://soydasmotosiklet.com/bakim-urunleri</loc>');
  if (u.endsWith('/products.xml')) return R('<loc>https://soydasmotosiklet.com/motul-a</loc><loc>https://soydasmotosiklet.com/motul-b</loc><loc>https://soydasmotosiklet.com/yag-filtresi-x</loc>');
  if (u.endsWith('/pages.xml')) return R('<loc>https://soydasmotosiklet.com/pages/iletisim</loc>');
  if (u.endsWith('/blogs.xml')) return R(liveBlogs.map((s) => `<loc>https://soydasmotosiklet.com/blog/${s}</loc>`).join(''));
  if (/soydasmotosiklet\.com\/(motul-a|motul-b)$/.test(u)) return R(`<meta property="og:image" content="https://cdn.myikas.com/images/m/${u.split('/').pop()}/image_1080.jpg">`);
  if (u.startsWith('https://soydasmotosiklet.com/')) return R('ok');
  if (u.includes('cdn.myikas.com/images/m/')) return R(new Uint8Array(await img(800, 800, '#fff')));
  if (u.includes('/v1/models')) return R({ data: [{ id: 'claude-sonnet-test' }] });
  if (u.includes('/v1/messages')) return R({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'kaydet_yazi', input: post }] });
  if (u.startsWith('https://pixabay.com/api/')) return R({ hits: [1, 2].map((id) => ({ id, imageWidth: 4000, imageHeight: 2600, user: 'pixuser', user_id: 9, pageURL: `https://pixabay.com/photos/x-${id}/`, largeImageURL: `https://pixabay.com/get/${id}_1280.jpg` })) });
  if (u.startsWith('https://pixabay.com/get/')) return R(new Uint8Array(await img(1280, 832, '#264')));
  if (u.includes('api.pexels.com/v1/search')) return R({ photos: ['111', '222'].map((id) => ({ id: +id, width: 4000, height: 2600, url: `https://www.pexels.com/photo/${id}/`, photographer: 'Pex Foto', photographer_url: 'https://www.pexels.com/@pex', src: { original: `https://images.pexels.com/photos/${id}/x.jpeg` } })) });
  if (u.startsWith('https://images.pexels.com/')) return R(new Uint8Array(await img(2400, 1560, '#543')));
  if (u.includes('api.unsplash.com/search')) return R({ results: [photo('cover1'), photo('inline1')] });
  if (u.includes('/download?')) return R({});
  if (u.startsWith('https://images.unsplash.com/')) return R(new Uint8Array(await img(2400, 1560, '#345')));
  // GitHub contents API (tarayıcı yayınlayıcısı) → yerel dosyalardan
  const gh = u.match(/api\.github\.com\/repos\/[^/]+\/[^/]+\/contents\/([^?]+)/);
  if (gh) {
    const p = repoFile(gh[1]);
    if (!fs.existsSync(p)) return R('{}', 404);
    if (fs.statSync(p).isDirectory()) return R(fs.readdirSync(p).map((n) => ({ name: n, type: fs.statSync(path.join(p, n)).isDirectory() ? 'dir' : 'file' })));
    return R(new Uint8Array(fs.readFileSync(p)));
  }
  if (u.startsWith('https://api.myikas.com/api/admin/graphql')) {
    if (init.headers.authorization !== 'Bearer TOKEN') return R({ errors: [{ message: 'LOGIN_REQUIRED' }] });
    const q = JSON.parse(body);
    if (q.query.includes('listBlog')) return R({ data: { listBlog: { data: liveBlogs.map((slug, i) => ({ id: String(i), metadata: { slug } })) } } });
    if (q.query.includes('getImageUploadUrl')) return R({ data: { getImageUploadUrl: 'https://upload.example/put/' + q.variables.imageId } });
    if (q.query.includes('checkBlogMetaDataSlug')) return R({ data: { checkBlogMetaDataSlug: null } });
    if (q.query.includes('saveBlog')) { saved.push(q.variables.input); liveBlogs.push(q.variables.input.metadata.slug); return R({ data: { saveBlog: { id: 'new-id' } } }); }
  }
  if (u.startsWith('https://upload.example/')) return R('', 200);
  if (u.includes('cdn.myikas.com/images/35cfc9ba')) return R('', 200);
  throw new Error('Beklenmeyen istek: ' + u);
};

for (const d of fs.readdirSync('drafts')) if (d.startsWith('motosiklet-yagi')) fs.rmSync('drafts/' + d, { recursive: true });
const ok = (c, m) => { if (!c) { console.error('✗', m); process.exit(1); } console.log('✓', m); };
const { createDraft, draftIssueBody, approveDraft, syncPublished, getDraft } = await import('../src/pipeline.js');

const draft = await createDraft({});
const dir = `drafts/${draft.slug}`;
ok(fs.existsSync(`${dir}/draft.json`) && fs.existsSync(`${dir}/cover.jpg`), 'taslak klasörü ve kapak oluştu');
ok(draft.contentHtml.includes('__IMG_collage__') && (MP === 'none' || draft.contentHtml.includes('__IMG_inline__')), 'içerikte görsel yer tutucuları var');
ok(draft.removedLinks.includes('/olmayan') && !draft.contentHtml.includes('rakip.com'), 'geçersiz/dış linkler temizlendi');
const issue = draftIssueBody(draft);
ok(issue.includes(`raw.githubusercontent.com/soydasmotosiklet/soydas-blog-bot/main/${dir}/cover.jpg`) && !issue.includes('__IMG_'), 'issue görselleri GitHub adresinden');

// Onaysız taslak yayınlanmamalı
const runBrowser = async () => {
  const el = () => ({ style: {}, append() {}, appendChild() {}, remove() {}, set textContent(v) { this._t = v; }, get textContent() { return this._t; } });
  globalThis.window = globalThis; globalThis.location = { hostname: 'soydasmotosiklet.myikas.com' };
  globalThis.localStorage = { getItem: (k) => (k === 'token' ? 'TOKEN' : null) };
  globalThis.document = { createElement: el, body: el() };
  const code = fs.readFileSync('browser/ikas-yayinla.js', 'utf8');
  await eval(code.replace(/\}\)\(\);\s*$/, '})()'));
  return window.__blogResult;
};
let res = await runBrowser();
ok(saved.length === 0 && res.skipped.some((s) => s.includes('onay bekliyor')), 'onaysız taslak atlandı');

approveDraft(draft.slug);
ok(getDraft(draft.slug).approved === true, 'onay işaretlendi');
res = await runBrowser();
ok(saved.length === 1 && res.published.length === 1, 'tarayıcı yayınlayıcısı yazıyı ikas\'a ekledi');
const inp = saved[0];
ok(!inp.blogContent.content.includes('__IMG_') && !inp.blogContent.contentData.includes('__IMG_'), 'yer tutucular ikas CDN adresleriyle değişti');
ok(inp.imageId && inp.metadata.slug === draft.slug && inp.categoryId && inp.writer.firstName === 'Soydaş', 'blog alanları dolu');
ok(JSON.parse(inp.blogContent.contentData).blocks.length === draft.blocks.length, 'Editor.js verisi geçerli');

res = await runBrowser();
ok(saved.length === 1 && res.skipped.some((s) => s.includes("zaten ikas'ta")), 'ikinci çalıştırmada tekrar eklemedi');

const synced = await syncPublished();
ok(synced.length === 1 && !fs.existsSync(dir), 'senkron: yayına giren taslak temizlendi');
const state = JSON.parse(fs.readFileSync('state/published.json', 'utf8'));
ok(state.some((s) => s.slug === draft.slug), 'yayın kaydı tutuldu');
fs.writeFileSync('state/published.json', '[]\n');
console.log('Tümü başarılı (' + MP + ').');
