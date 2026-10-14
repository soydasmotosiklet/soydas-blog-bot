# Soydaş Motosiklet – Günlük Blog Botu

Her sabah **08:51**'de (Türkiye saati) otomatik çalışır:

1. `topics.json` listesinden henüz yazılmamış sıradaki konuyu seçer (liste bitince konuyu kendisi belirler).
2. Claude ile 700–900 kelimelik, başlıklı, tablolu, SSS bölümlü bir yazı hazırlar. Mağazadaki **gerçekten var olan** kategori ve ürünlere link verir; geçersiz linkleri otomatik siler.
3. Unsplash'ten konuya uygun gerçek fotoğraf bulur, sitedeki geniş kapak alanına uygun kapak görseli üretir. Mağazadaki ürün fotoğraflarından kolaj yapar.
4. Taslağı bu GitHub deposunda bir **issue** olarak açar. GitHub'dan bildirim gelir, yazının tamamını görsellerle birlikte görürsünüz.
5. Siz issue'ya yorum yazarak karar verirsiniz:

| Yorum | Ne olur |
| --- | --- |
| `/yayinla` | Yazı ikas'a eklenir ve sitede yayınlanır |
| `/yeniden daha kısa olsun, SSS'ye 1 soru ekle` | Aynı konu, isteğinize göre yeniden yazılır, yeni taslak açılır |
| `/iptal` | Taslak silinir; konu ertesi gün tekrar denenmez (listeden çıkarmak için `topics.json`'dan silin) |

Bilgisayarınızın açık olması gerekmez; her şey GitHub'ın sunucularında çalışır.

---

## Kurulum (bir kerelik, ~20 dakika)

### 1) GitHub deposu
1. https://github.com adresinde ücretsiz hesap açın (varsa giriş yapın).
2. Sağ üstte **+ → New repository**. Ad: `soydas-blog-bot`, **Private** seçin → *Create repository*.
3. *uploading an existing file* linkine tıklayın, bu klasördeki **tüm dosya ve klasörleri** sürükleyip bırakın → *Commit changes*.
   > Mac'te `.github` klasörü gizli görünür. Finder'da `Cmd + Shift + .` ile gizli dosyaları gösterip onu da sürükleyin. `node_modules` klasörünü yüklemeyin.

### 2) ikas Özel Uygulama
1. ikas paneli → **Uygulamalar → Uygulamalarım → Özel Uygulamalara Git → Özel Uygulama Ekle**.
2. Uygulama Adı: `Blog Bot`, E-posta: kendi adresiniz, Tip: **Standart Uygulama**.
3. İzinler: **Online Mağaza – Düzenleme** ve **Ürünler – Görüntüleme**.
4. Kaydedin; ekranda çıkan **client_id** ve **client_secret** değerlerini bir yere not edin.
   > Not: Özel uygulama sayfasında bir ücret ibaresi görünüyordu; oluşturmadan önce ikas'tan teyit edin.

### 3) Claude API anahtarı
1. https://console.anthropic.com → hesap açın → **Billing** bölümünden kredi yükleyin (ör. 10 $).
2. **API Keys → Create Key**. Anahtarı kopyalayın.
   > Maliyet: yazı başına yaklaşık 0,10–0,40 $ (web araması dahil).

### 4) Unsplash API anahtarı (ücretsiz)
1. https://unsplash.com/developers → **Your apps → New Application**, kuralları onaylayın.
2. Uygulama adı: `soydas_blog_bot`. Oluşan sayfadaki **Access Key**'i kopyalayın.

### 5) Anahtarları GitHub'a girin
Depo → **Settings → Secrets and variables → Actions → New repository secret**. Şu dört gizli değeri tek tek ekleyin:

| Ad | Değer |
| --- | --- |
| `IKAS_CLIENT_ID` | ikas client_id |
| `IKAS_CLIENT_SECRET` | ikas client_secret |
| `ANTHROPIC_API_KEY` | Claude API anahtarı |
| `UNSPLASH_ACCESS_KEY` | Unsplash Access Key |

Bu değerler şifreli saklanır; kimse (siz dahil) sonradan göremez, sadece bot kullanır.

### 6) ikas bağlantı testi (önemli)
Depo → **Actions** sekmesi → (ilk seferde *I understand… enable* butonuna basın) → **ikas API testi → Run workflow**.
Bittiğinde çıktıyı açın. Şunları görmelisiniz:
- `✓ Token alındı.`
- Blog işlemleri arasında `saveBlog`
- `✓ … blog bulundu`
- `✓ Görsel yükleme destekleniyor.`

Çıktıyı Claude'a gönderin; bir eksik varsa (ör. ikas'ın resmi API'si blog işlemlerini farklı adla sunuyorsa) program buna göre güncellenir.

### 7) İlk taslağı deneyin
**Actions → Günlük blog taslağı → Run workflow**. 2–5 dakika içinde **Issues** sekmesinde taslak açılır.
Telefona bildirim için GitHub mobil uygulamasını kurup giriş yapın.

---

## Sık yapılacaklar
- **Konu eklemek/sırasını değiştirmek:** `topics.json` dosyasını GitHub'da açıp kalem simgesiyle düzenleyin.
- **Belirli bir konuyu hemen yazdırmak:** Actions → Günlük blog taslağı → Run workflow → *topic* alanına başlığı yazın.
- **Saati değiştirmek:** `.github/workflows/gunluk-taslak.yml` içindeki `cron` satırı (UTC saatidir; Türkiye = UTC+3).
- **Modeli sabitlemek (isteğe bağlı):** Settings → Secrets and variables → Actions → *Variables* → `CLAUDE_MODEL`. Boşsa en yeni Claude Sonnet modeli otomatik seçilir.

## Dosyalar
- `src/pipeline.js` – akış (konu → yazı → görseller → taslak → yayın)
- `src/content.js` – Claude ile yazı üretimi ve yazım kuralları
- `src/images.js` – Unsplash arama, kapak/kolaj üretimi
- `src/render.js` – ikas editörünün HTML formatı (mevcut yazılarla birebir aynı)
- `src/ikas.js` – ikas API istemcisi
- `drafts/` – onay bekleyen taslaklar, `state/published.json` – yayınlananlar

Fotoğraflar Unsplash lisansıyla kullanılır; yazının sonuna ve fotoğraf altına fotoğrafçı adı otomatik eklenir (Unsplash API kuralı).
