// Claude API ile blog yazısı üretimi.
import { config } from './config.js';

const API = 'https://api.anthropic.com/v1';
const headers = () => ({
  'x-api-key': config.claude.apiKey,
  'anthropic-version': '2023-06-01',
  'content-type': 'application/json',
});

export async function pickModel() {
  if (config.claude.model) return config.claude.model;
  const res = await fetch(`${API}/models?limit=50`, { headers: headers() });
  const json = await res.json().catch(() => ({}));
  const ids = (json.data || []).map((m) => m.id);
  const sonnet = ids.find((id) => /sonnet/i.test(id));
  if (!sonnet && !ids.length) throw new Error('Claude model listesi alınamadı: ' + JSON.stringify(json).slice(0, 300));
  return sonnet || ids[0];
}

const POST_TOOL = {
  name: 'kaydet_yazi',
  description: 'Tamamlanan blog yazısını yapılandırılmış olarak kaydeder.',
  input_schema: {
    type: 'object',
    required: ['title', 'slug', 'shortDescription', 'seoTitle', 'seoDescription', 'coverQuery', 'inlineQuery', 'collageProducts', 'blocks'],
    properties: {
      title: { type: 'string', description: 'Yazı başlığı (verilen konu başlığı)' },
      slug: { type: 'string', description: 'Kısa (≤60), Türkçe karaktersiz, küçük harf, tireli, yılsız URL' },
      shortDescription: { type: 'string', description: '~150 karakter özet' },
      seoTitle: { type: 'string', description: '"<Kısa başlık> | Soydaş Motosiklet" — toplam en fazla 60 karakter' },
      seoDescription: { type: 'string', description: '140–160 karakter meta açıklama' },
      coverQuery: { type: 'string', description: 'Kapak için İNGİLİZCE stok fotoğraf arama ifadesi (2-4 kelime, somut nesne, ör. "motorcycle brake disc")' },
      coverQueryAlt: { type: 'string', description: 'Yedek İngilizce kapak araması (daha genel)' },
      inlineQuery: { type: 'string', description: 'İçerik fotoğrafı için İNGİLİZCE stok fotoğraf araması (kapaktan farklı)' },
      collageProducts: {
        type: 'array', items: { type: 'string' },
        description: 'Ürün kolajı için verilen ürün listesinden 3-4 ürün yolu (ör. "/motul-c2-..."). Uygun ürün yoksa boş dizi.',
      },
      blocks: {
        type: 'array',
        description: 'Yazının blokları, sırasıyla.',
        items: {
          type: 'object',
          required: ['type'],
          properties: {
            type: { type: 'string', enum: ['paragraph', 'header', 'list', 'table', 'image_slot'] },
            text: { type: 'string', description: 'paragraph/header metni; inline sadece <b>, <i>, <a href="/...">' },
            level: { type: 'integer', enum: [2, 3] },
            style: { type: 'string', enum: ['unordered', 'ordered'] },
            items: { type: 'array', items: { type: 'string' } },
            rows: { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'İlk satır başlık satırı' },
            slot: { type: 'string', enum: ['collage', 'photo'], description: 'image_slot için: collage=ürün kolajı, photo=konu fotoğrafı' },
            caption: { type: 'string', description: 'image_slot alt yazısı' },
          },
        },
      },
    },
  },
};

const SYSTEM = `Sen Soydaş Motosiklet (soydasmotosiklet.com) için Türkçe blog yazıları hazırlayan bir içerik editörüsün. Mağaza motosiklet ve scooter yedek parça, bakım ürünleri, koruma ekipmanı ve aksesuar satıyor. Yazılar Soydaş Motosiklet'in "Blog Kılavuzu"na uymak zorunda.

UZUNLUK VE YAPI
- 900–1.200 kelime (en az 800). Doldurma cümle, tekrar ve abartı yok. Akıcı, profesyonel Türkçe; "siz" hitabı.
- Yapı: giriş paragrafı → 4–6 adet H2 bölüm (gerekirse H3) → "Sık Sorulan Sorular" H2 + 2–3 H3 soru/paragraf cevap → kapanış paragrafı.
- En az 2 madde listesi ve en az 1 tablo (rows; ilk satır başlıklar). Kalın vurgu için <b>.
- 2 image_slot: bir "collage" (ürünlerin anlatıldığı bölümün başına; collageProducts boşsa koyma) ve bir "photo" (yazının ortalarına). Alt yazılar kısa ve açıklayıcı; kolaj alt yazısı "... – Soydaş Motosiklet" ile bitsin.

BİLGİ DOĞRULUĞU (en önemli kural)
- Ölçü, parça numarası, model yılı uyumu, kapasite, basınç, tork, km/bakım aralığı gibi kesin bilgileri YALNIZCA şu kaynaklardan yaz: (a) sana verilen ürün yollarının/adlarının içinde açıkça geçen bilgi, (b) web aramasıyla bulduğun üreticinin kullanım kılavuzu veya tedarikçi kataloğu. Kılavuzdan aldığın değerde kaynağı belirt (ör. "Honda kullanım kılavuzuna göre").
- Kaynağını doğrulayamadığın bilgiyi YAZMA; tahmini aralık uydurma. Gerekirse "kesin değer için aracınızın kullanım kılavuzuna bakın" de.
- Yazar, uzman veya deneyim iddiası yazma ("teknisyen gözüyle", "ustamız", "yıllardır" vb. yok). Stok, fiyat, kargo, garanti iddiası yazma. Rakip marka/mağaza adı verme.
- Model rehberinde parça önerilerini o modele uyumlu olduğu ürün adında yazan ürünlerden seç; uyumu ürün adı dışında iddia etme.

LİNKLER (hepsi <a href="/yol">anlamlı metin</a>)
- En az 3, tercihen 4–6 ÜRÜN linki: sadece verilen "STOKTA OLAN ÜRÜNLER" listesinden, konuya ve modele uygun olanlar.
- En az 2 KATEGORİ linki: sadece verilen kategori yollarından.
- 1–2 adet ilgili BLOG yazısı linki: sadece verilen blog yollarından (konusu gerçekten ilgili olanlar).
- Yol uydurma. Kapanışta <a href="/pages/iletisim">...</a> ile iletişime davet et.

SEO
- seoTitle: "<kısa başlık> | Soydaş Motosiklet", toplam EN FAZLA 60 karakter.
- seoDescription: 140–160 karakter, yazıya özgü.
- slug: kısa (en fazla 60 karakter), küçük harf, Türkçe karaktersiz, tireli, YIL İÇERMEZ.
- Başlıkta ve metin başlıklarında yıl kullanma.
- Başlık seviyeleri dışında HTML kullanma; markdown kullanma.

Yazı bitince sonucu MUTLAKA kaydet_yazi aracıyla gönder.`;

export async function generatePost({ topic, existingTitles, collections, products, feedback }) {
  if (!config.claude.apiKey) throw new Error('ANTHROPIC_API_KEY tanımlı değil.');
  const model = await pickModel();
  const user = `Konu (başlık olarak aynen kullan): ${topic}

BLOG YAZISI YOLLARI (konuyu tekrar etme; 1–2 ilgili olana link ver): ${existingTitles.join(' ') || '-'}

KULLANABİLECEĞİN KATEGORİ YOLLARI:
${collections.join(' ')}

STOKTA OLAN ÜRÜNLER (ürün linki ve collageProducts için sadece bunlar; en az 3 tanesine link ver):
${products.join(' ') || '(uygun ürün bulunamadı — sadece kategorilere link ver, collageProducts boş olsun)'}

SAYFALAR: /pages/iletisim /pages/sss /pages/hakkimizda
${feedback ? `\nDÜZELTME İSTEĞİ / KALİTE KONTROLÜ GERİ BİLDİRİMİ: ${feedback}\n` : ''}`;

  const tools = [POST_TOOL];
  if (config.claude.webSearch) tools.push({ type: 'web_search_20250305', name: 'web_search', max_uses: 8 });

  let messages = [{ role: 'user', content: user }];
  for (let attempt = 0; attempt < 4; attempt++) {
    const body = { model, max_tokens: 16000, system: SYSTEM, messages, tools };
    if (attempt >= 2) {
      body.tools = [POST_TOOL];
      body.tool_choice = { type: 'tool', name: 'kaydet_yazi' };
    }
    const res = await fetch(`${API}/messages`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
    const json = await res.json();
    if (!res.ok) {
      if (attempt === 0 && /web_search/i.test(JSON.stringify(json))) {
        tools.pop(); // web araması desteklenmiyorsa onsuz devam
        continue;
      }
      throw new Error(`Claude API hatası (HTTP ${res.status}): ${JSON.stringify(json).slice(0, 500)}`);
    }
    const call = (json.content || []).find((c) => c.type === 'tool_use' && c.name === 'kaydet_yazi');
    if (call) return { ...call.input, model };
    // araç çağrılmadıysa: yanıtı ekle ve kaydetmesini iste
    messages = [...messages, { role: 'assistant', content: json.content }, { role: 'user', content: 'Lütfen yazıyı şimdi kaydet_yazi aracıyla gönder.' }];
    if (json.stop_reason === 'pause_turn') messages.pop();
  }
  throw new Error('Claude yazıyı yapılandırılmış biçimde döndürmedi.');
}
