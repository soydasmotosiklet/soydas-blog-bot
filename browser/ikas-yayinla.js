// Soydaş Blog Botu – ikas yayınlayıcı (tarayıcıda, ikas yönetim panelinde çalışır).
// Onaylı taslakları GitHub deposundan okur, görselleri ikas'a yükler ve blog yazısını oluşturur.
// Sizin açık ikas oturumunuzu kullanır; hiçbir şifre/anahtar saklamaz.
(async () => {
  const REPO = 'soydasmotosiklet/soydas-blog-bot';
  const STOREFRONT_ID = '87bfcc82-f6a1-4bf3-b16a-8afeee39e122';
  const CATEGORY_ID = 'a620b2b5-801d-4582-ac06-f7800565ac76'; // Motosiklet Rehberleri
  const MERCHANT_ID = '35cfc9ba-3ff2-4634-9513-0419bc8d77fb';
  const WRITER = { firstName: 'Soydaş', lastName: 'Motosiklet' };
  const SITE = 'https://soydasmotosiklet.com';
  const DRY = !!window.__blogDry;

  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:420px;background:#111;color:#fff;font:14px/1.45 system-ui,sans-serif;padding:14px 16px;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.35);white-space:pre-wrap';
  const close = document.createElement('button');
  close.textContent = '✕';
  close.style.cssText = 'position:absolute;top:6px;right:8px;background:none;border:0;color:#aaa;font-size:16px;cursor:pointer';
  close.onclick = () => box.remove();
  const text = document.createElement('div');
  box.append(close, text);
  document.body.appendChild(box);
  const lines = [];
  const say = (s) => { lines.push(s); text.textContent = 'Blog Yayınla\n' + lines.join('\n'); };
  const result = { published: [], skipped: [], errors: [] };
  window.__blogResult = result;

  try {
    if (!/myikas\.com$/.test(location.hostname)) throw new Error('Bu yer imini ikas yönetim panelindeyken açın.');
    const token = localStorage.getItem('token');
    if (!token) { result.loginRequired = true; throw new Error('ikas oturumu bulunamadı. Panele giriş yapıp tekrar deneyin.'); }

    const gql = async (op, query, variables) => {
      const r = await fetch(`https://api.myikas.com/api/admin/graphql?op=${op}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ query, variables }),
      });
      const j = await r.json();
      if (j.errors) {
        if (JSON.stringify(j.errors).includes('LOGIN_REQUIRED')) result.loginRequired = true;
        throw new Error(`${op}: ${JSON.stringify(j.errors).slice(0, 300)}`);
      }
      return j.data;
    };
    const gh = (p, accept = 'application/vnd.github.raw') =>
      fetch(`https://api.github.com/repos/${REPO}/contents/${p}?ref=main&t=${Date.now()}`, { headers: { Accept: accept }, cache: 'no-store' });

    say('Onaylı taslaklar aranıyor…');
    const listRes = await gh('drafts', 'application/vnd.github+json');
    if (!listRes.ok) throw new Error(`GitHub'a erişilemedi (HTTP ${listRes.status}). Depo herkese açık olmalı.`);
    const dirs = (await listRes.json()).filter((x) => x.type === 'dir').map((x) => x.name);

    const existing = await gql('listBlog', 'query listBlog($pagination: PaginationInput){ listBlog(pagination:$pagination){ data { id metadata { slug } } } }', { pagination: { page: 1, limit: 200 } });
    const existingSlugs = new Set(existing.listBlog.data.map((b) => b.metadata?.slug));

    const drafts = [];
    for (const d of dirs) {
      const r = await gh(`drafts/${d}/draft.json`);
      if (!r.ok) continue;
      const draft = await r.json();
      if (!draft.approved) { result.skipped.push(`${draft.title} (onay bekliyor)`); continue; }
      if (existingSlugs.has(draft.slug)) { result.skipped.push(`${draft.title} (zaten ikas'ta)`); continue; }
      drafts.push(draft);
    }
    if (!drafts.length) {
      say(result.skipped.length ? `Yayınlanacak onaylı taslak yok.\n${result.skipped.map((s) => '• ' + s).join('\n')}` : 'Yayınlanacak onaylı taslak yok.');
      return;
    }
    say(`${drafts.length} onaylı taslak bulundu.`);
    if (DRY) { say(drafts.map((d) => '• ' + d.title).join('\n') + '\n(deneme modu: yayınlanmadı)'); return; }

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

    for (const draft of drafts) {
      try {
        say(`→ ${draft.title}\n   görseller yükleniyor…`);
        const ids = {};
        for (const [key, file] of Object.entries(draft.images || {})) {
          const r = await gh(`drafts/${draft.slug}/${file}`);
          if (!r.ok) throw new Error(`${file} indirilemedi`);
          ids[key] = await upload(await r.blob());
        }
        if (!ids.cover) throw new Error('Kapak görseli yok');
        const fill = (s) => String(s).replace(/__IMG_(\w+)__/g, (m, k) => (ids[k] ? ids[k].url : m));

        const slugTaken = await gql('checkBlogMetaDataSlug', 'query checkBlogMetaDataSlug($slug: String!){ checkBlogMetaDataSlug(slug:$slug){ id } }', { slug: draft.slug }).then((d) => d.checkBlogMetaDataSlug).catch(() => null);
        if (slugTaken) throw new Error(`"${draft.slug}" adresi zaten kullanılıyor`);

        const input = {
          title: draft.title,
          shortDescription: draft.shortDescription,
          imageId: ids.cover.imageId,
          categoryId: CATEGORY_ID,
          isPublished: false, // ikas paneli de bu değeri gönderiyor; yazılar sitede görünüyor
          locale: 'tr',
          storefrontId: STOREFRONT_ID,
          tagIds: null,
          publishedAt: null,
          writer: WRITER,
          blogContent: { content: fill(draft.contentHtml), contentData: fill(draft.contentData), contentSource: null },
          metadata: { slug: draft.slug, pageTitle: draft.seoTitle, description: draft.seoDescription, canonicals: null, disableIndex: null, targetType: 'BLOG' },
        };
        const saved = await gql('saveBlog', 'mutation saveBlog($input: BlogInput!){ saveBlog(input:$input){ id } }', { input });
        result.published.push({ title: draft.title, id: saved.saveBlog.id, url: `${SITE}/blog/${draft.slug}` });
        say(`   ✓ eklendi: ${SITE}/blog/${draft.slug}`);
      } catch (e) {
        result.errors.push(`${draft.title}: ${e.message}`);
        say(`   ✗ ${e.message}`);
      }
    }
    say('\nBitti. Site önbelleği nedeniyle yazılar birkaç dakika içinde görünür. GitHub\'daki taslak saat başı otomatik kapanır.');
  } catch (e) {
    result.errors.push(e.message);
    say('✗ ' + e.message);
  } finally {
    result.done = true;
  }
})();
