// Tüm dış servisleri taklit ederek uçtan uca kuru çalıştırma: taslak → issue metni → yayın.
import sharp from 'sharp';
import fs from 'node:fs';
process.env.IKAS_CLIENT_ID = 'x'; process.env.IKAS_CLIENT_SECRET = 'y';
process.env.ANTHROPIC_API_KEY = 'k'; const MP = process.env.MOCK_PROVIDER || 'pexels';
process.env.PEXELS_API_KEY = MP === 'pexels' ? 'p' : ''; process.env.PIXABAY_API_KEY = MP === 'pixabay' ? 'x' : ''; process.env.UNSPLASH_ACCESS_KEY = MP === 'unsplash' ? 'u' : '';

const img = (w, h, c) => sharp({ create: { width: w, height: h, channels: 3, background: c } })
  .composite([{ input: Buffer.from(`<svg width="${w}" height="${h}"><circle cx="${w/2}" cy="${h/2}" r="${Math.min(w,h)/3}" fill="#c33"/></svg>`) }]).jpeg().toBuffer();
const photo = (id) => ({ id, width: 4000, height: 2600, urls: { raw: `https://images.unsplash.com/${id}?ixid=1` }, links: { download_location: `https://api.unsplash.com/photos/${id}/download?ixid=1`, html: `https://unsplash.com/photos/${id}` }, user: { name: 'Test Foto', links: { html: 'https://unsplash.com/@test' } } });
const saved = [];
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
const R = (body, status = 200, headers = {}) => new Response(typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body), { status, headers });
globalThis.fetch = async (input, init = {}) => {
  const u = String(input);
  const body = init.body && typeof init.body === 'string' ? init.body : '';
  if (u.endsWith('/collections.xml')) return R('<loc>https://soydasmotosiklet.com/yaglar</loc><loc>https://soydasmotosiklet.com/bakim-urunleri</loc>');
  if (u.endsWith('/products.xml')) return R('<loc>https://soydasmotosiklet.com/motul-a</loc><loc>https://soydasmotosiklet.com/motul-b</loc><loc>https://soydasmotosiklet.com/yag-filtresi-x</loc>');
  if (u.endsWith('/pages.xml')) return R('<loc>https://soydasmotosiklet.com/pages/iletisim</loc>');
  if (/soydasmotosiklet\.com\/(motul-a|motul-b)$/.test(u)) return R(`<meta property="og:image" content="https://cdn.myikas.com/images/m/${u.split('/').pop()}/image_1080.jpg">`);
  if (u.startsWith('https://soydasmotosiklet.com/')) return R('ok');
  if (u.includes('cdn.myikas.com/images/m/')) return R(new Uint8Array(await img(800, 800, '#fff')));
  if (u.includes('/v1/models')) return R({ data: [{ id: 'claude-sonnet-test' }] });
  if (u.includes('/v1/messages')) { const b = JSON.parse(body); if (!b.tools.find(t => t.name === 'kaydet_yazi')) throw new Error('tool yok'); return R({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'kaydet_yazi', input: post }] }); }
  if (u.startsWith('https://pixabay.com/api/')) return R({ hits: [1, 2].map(id => ({ id, imageWidth: 4000, imageHeight: 2600, user: 'pixuser', user_id: 9, pageURL: `https://pixabay.com/photos/x-${id}/`, largeImageURL: `https://pixabay.com/get/${id}_1280.jpg` })) });
  if (u.startsWith('https://pixabay.com/get/')) return R(new Uint8Array(await img(1280, 832, '#264')));
  if (u.includes('api.pexels.com/v1/search')) return R({ photos: ['111', '222'].map(id => ({ id: +id, width: 4000, height: 2600, url: `https://www.pexels.com/photo/${id}/`, photographer: 'Pex Foto', photographer_url: 'https://www.pexels.com/@pex', src: { original: `https://images.pexels.com/photos/${id}/x.jpeg` } })) });
  if (u.startsWith('https://images.pexels.com/')) return R(new Uint8Array(await img(2400, 1560, '#543')));
  if (u.includes('api.unsplash.com/search')) return R({ results: [photo('cover1'), photo('inline1')] });
  if (u.includes('/download?')) return R({});
  if (u.startsWith('https://images.unsplash.com/')) return R(new Uint8Array(await img(2400, 1560, '#345')));
  if (u.includes('oauth/token')) return R({ access_token: 'T', expires_in: 14400 });
  if (u.includes('graphql')) {
    const q = JSON.parse(body);
    if (q.query.includes('listBlog')) return R({ data: { listBlog: { data: [{ id: '1', title: 'Motosiklet Kask Seçimi Rehberi 2026', metadata: { slug: 'motosiklet-kask-secimi-rehberi-2026' } }] } } });
    if (q.query.includes('getImageUploadUrl')) return R({ data: { getImageUploadUrl: 'https://upload.example/put/' + q.variables.imageId } });
    if (q.query.includes('checkBlogMetaDataSlug')) return R({ data: { checkBlogMetaDataSlug: null } });
    if (q.query.includes('saveBlog')) { saved.push(q.variables.input); return R({ data: { saveBlog: { id: 'new-id' } } }); }
  }
  if (u.startsWith('https://upload.example/')) return R('', 200);
  if (u.includes('cdn.myikas.com/images/35cfc9ba')) return R('', 200);
  throw new Error('Beklenmeyen istek: ' + u);
};

const { createDraft, draftIssueBody, publishDraft } = await import('../src/pipeline.js');
const draft = await createDraft({});
const issue = draftIssueBody(draft);
fs.mkdirSync('out', { recursive: true });
fs.writeFileSync('out/issue-mock.md', issue);
console.log('KONU:', draft.topic, '| SLUG:', draft.slug, '| kaldırılan linkler:', draft.removedLinks);
const r = await publishDraft(draft.slug);
const inp = saved[0];
console.log('YAYIN:', r.url, '| input keys:', Object.keys(inp).join(','));
console.log('HTML:', inp.blogContent.content.split('<div class="ikas-editor-v1">')[1].slice(0, 1600));
console.log('contentData blocks:', JSON.parse(inp.blogContent.contentData).blocks.map(b => b.type).join(','));
// state temizliği
fs.writeFileSync('state/published.json', '[]\n');
