// Soydaş Blog – yayındaki yazıların görsellerini fixes/<slug>/ klasöründeki yeni görsellerle değiştirir.
// ikas yönetim panelinde çalışır (oturum açık olmalı). Kapak + yazı içi fotoğraf yenilenir, eski
// stok fotoğraf künyeleri kaldırılır. Tekrar çalıştırılırsa aynı görseli ikinci kez yüklemez.
(async () => {
  const REPO = 'soydasmotosiklet/soydas-blog-bot';
  const MERCHANT_ID = '35cfc9ba-3ff2-4634-9513-0419bc8d77fb';
  const DONE_KEY = 'soydas_gorsel_uygulandi';
  const result = { updated: [], skipped: [], errors: [] };
  window.__gorselResult = result;
  const log = (...a) => console.log('%c[Soydaş görsel]', 'color:#c00;font-weight:bold', ...a);
  try {
    if (!/myikas\.com$/.test(location.hostname)) throw new Error('ikas yönetim panelinde çalıştırın.');
    const token = localStorage.getItem('token');
    if (!token) throw new Error('ikas oturumu bulunamadı.');
    const gql = async (op, query, variables) => {
      const r = await fetch(`https://api.myikas.com/api/admin/graphql?op=${op}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ query, variables }),
      });
      const j = await r.json();
      if (j.errors) throw new Error(op + ': ' + JSON.stringify(j.errors).slice(0, 300));
      return j.data;
    };
    const gh = (p, accept = 'application/vnd.github.raw') =>
      fetch(`https://api.github.com/repos/${REPO}/contents/${p}?ref=main&t=${Date.now()}`, { headers: { Accept: accept }, cache: 'no-store' });
    const upload = async (blob) => {
      const imageId = crypto.randomUUID();
      const d = await gql('getImageUploadUrl', 'query getImageUploadUrl($imageDir: String, $imageId: String!){ getImageUploadUrl(imageDir:$imageDir, imageId:$imageId) }', { imageId });
      const put = await fetch(d.getImageUploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: blob });
      if (!put.ok) throw new Error(`Görsel yüklenemedi (HTTP ${put.status})`);
      const url = `https://cdn.myikas.com/images/${MERCHANT_ID}/${imageId}/image_1080.webp`;
      for (let i = 0; i < 20; i++) {
        const h = await fetch(url, { method: 'HEAD', cache: 'no-store' }).catch(() => null);
        if (h && h.ok) break;
        await new Promise((r) => setTimeout(r, 1500));
      }
      return { imageId, url };
    };

  // ikas editörünün HTML biçimi (mevcut yazılarla birebir aynı olduğu doğrulandı)
  const A = '<div class="ikas-editor-v1">\n          ', Z = '\n          </div>';
  const norm = (s) => String(s ?? '').replace(/&(?!(amp|lt|gt|quot|#\d+|#x[0-9a-f]+);)/gi, '&amp;');
  const escA = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const strip = (s) => String(s ?? '').replace(/<[^>]*>/g, '');
  const render = (blocks, sizes) => blocks.map((b) => {
    const d = b.data || {};
    switch (b.type) {
      case 'paragraph': return `<p class="editor-paragraph"> ${norm(d.text)} </p>`;
      case 'header': return `<h${d.level}>${norm(d.text)}</h${d.level}>`;
      case 'list': { const t = d.style === 'ordered' ? 'ol' : 'ul'; return `<${t}>${(d.items || []).map((i) => `<li>${norm(i)}</li>`).join('')}</${t}>`; }
      case 'table': return `<table><tbody>${(d.content || []).map((r) => `<tr>${r.map((c) => `<td>${norm(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      case 'image': {
        const url = d.file?.url, cap = d.caption || '', sz = sizes[url];
        const dims = sz ? ` width="${sz.width}" height="${sz.height}" style="max-width: 100%; aspect-ratio: ${sz.width} / ${sz.height};"` : '';
        return `<figure class="editor-fig-img"><img class="editor-img   " src="${escA(url)}" alt="${escA(strip(cap))}"${dims}><figcaption class="editor-fig-cap">${norm(cap)}</figcaption></figure>`;
      }
      default: throw new Error('Bilinmeyen blok tipi: ' + b.type);
    }
  }).join('');
  const sizesOf = (html) => { const s = {}; for (const m of html.matchAll(/<img[^>]*src="([^"]+)"[^>]*width="(\d+)" height="(\d+)"/g)) s[m[1].replace(/&amp;/g, '&')] = { width: +m[2], height: +m[3] }; return s; };
  const rid = () => Math.random().toString(36).slice(2, 12).padEnd(10, 'x');
    const CREDIT = /\s*\((?:Fotoğraf|Kapak fotoğrafı):[^()]*(?:\([^()]*\)[^()]*)*\)\s*$/;
    const isStockCaption = (c) => /Pixabay|Pexels|Unsplash|Fotoğraf:/.test(c || '');
    const done = JSON.parse(localStorage.getItem(DONE_KEY) || '{}');

    const listRes = await gh('fixes', 'application/vnd.github+json');
    if (!listRes.ok) throw new Error(`GitHub fixes klasörü okunamadı (HTTP ${listRes.status})`);
    const slugs = (await listRes.json()).filter((x) => x.type === 'dir').map((x) => x.name);
    const only = window.__gorselOnly;
    const list = (await gql('listBlog', 'query listBlog($pagination: PaginationInput){ listBlog(pagination:$pagination){ data { id title shortDescription imageId categoryId isPublished storefrontId tagIds publishedAt locale writer { firstName lastName } metadata { id slug pageTitle description canonicals disableIndex targetType } blogContent { id content contentData contentSource } } } }', { pagination: { page: 1, limit: 200 } })).listBlog.data;
    try { localStorage.setItem('soydas_gorsel_yedek_' + new Date().toISOString().slice(0, 10), JSON.stringify(list.map((b) => ({ id: b.id, imageId: b.imageId, content: b.blogContent.content, contentData: b.blogContent.contentData })))); } catch {}

    for (const slug of slugs) {
      if (only && slug !== only) continue;
      const b = list.find((x) => x.metadata?.slug === slug);
      if (!b) { result.skipped.push(`${slug}: ikas'ta yok`); continue; }
      try {
        const fix = await (await gh(`fixes/${slug}/fix.json`)).json();
        if (done[slug] === fix.createdAt && !window.__gorselForce) { result.skipped.push(`${b.title}: zaten uygulandı`); continue; }
        const cover = await upload(await (await gh(`fixes/${slug}/${fix.images.cover}`)).blob());
        let blogContent = b.blogContent, note = 'kapak';
        const html = b.blogContent.content;
        const i = html.indexOf(A), j = html.lastIndexOf(Z);
        const cd = JSON.parse(b.blogContent.contentData);
        const sizes = sizesOf(html);
        if (i >= 0 && j >= 0 && render(cd.blocks, sizes) === html.slice(i + A.length, j)) {
          let blocks = cd.blocks.filter((x) => !(x.type === 'paragraph' && /^<i>Kapak fotoğrafı/.test(x.data?.text || '')));
          const photo = blocks.find((x) => x.type === 'image' && isStockCaption(x.data?.caption));
          if (photo && fix.images.inline) {
            const inl = await upload(await (await gh(`fixes/${slug}/${fix.images.inline}`)).blob());
            sizes[inl.url] = fix.inlineSize || { width: 1080, height: 675 };
            const cap = String(photo.data.caption || '').replace(CREDIT, '');
            blocks = blocks.map((x) => (x === photo ? { ...x, data: { ...x.data, file: { ...x.data.file, url: inl.url }, caption: fix.inlineCredit ? `${cap} (${fix.inlineCredit})`.trim() : cap } } : x));
            note += ' + yazı içi';
          }
          const content = html.slice(0, i + A.length) + render(blocks, sizes) + html.slice(j);
          blogContent = { ...b.blogContent, content, contentData: JSON.stringify({ ...cd, time: Date.now(), blocks }) };
        } else {
          note += ' (içerik biçimi farklı: yalnızca kapak değişti)';
        }
        const input = {
          id: b.id, title: b.title, shortDescription: b.shortDescription, imageId: cover.imageId, categoryId: b.categoryId,
          isPublished: b.isPublished, locale: b.locale, storefrontId: b.storefrontId, tagIds: b.tagIds, publishedAt: b.publishedAt,
          writer: b.writer, metadata: b.metadata, blogContent,
        };
        await gql('saveBlog', 'mutation saveBlog($input: BlogInput!){ saveBlog(input:$input){ id } }', { input });
        done[slug] = fix.createdAt;
        localStorage.setItem(DONE_KEY, JSON.stringify(done));
        result.updated.push(`${b.title}: ${note}`);
        log('✅', b.title, note);
      } catch (e) {
        result.errors.push(`${b.title}: ${e.message}`);
        log('❌', b.title, e.message);
      }
    }
  } catch (e) {
    result.errors.push(e.message);
    log('✗', e.message);
  } finally {
    result.done = true;
  }
})();
