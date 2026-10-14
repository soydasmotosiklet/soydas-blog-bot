# Soydaş Motosiklet – Günlük Blog Botu

## Nasıl çalışır?

1. **Her sabah 08:51** (Türkiye saati) GitHub'ın sunucularında otomatik çalışır; bilgisayarınızın açık olması gerekmez.
   - `topics.json` listesinden sıradaki konuyu seçer (liste bitince konuyu kendisi belirler).
   - Claude ile 700–900 kelimelik, başlıklı, tablolu, SSS bölümlü bir yazı hazırlar; mağazada **gerçekten var olan** kategori ve ürünlere link verir, geçersiz linkleri siler.
   - Kapak ve içerik görsellerini hazırlar (Pixabay/Pexels anahtarı varsa gerçek fotoğraf, yoksa mağazanın ürün fotoğrafları).
2. Taslak bu depoda bir **issue** olarak açılır, telefonunuza bildirim gelir. Yorum yazarak karar verirsiniz:

| Yorum | Ne olur |
| --- | --- |
| `/yayinla` | Taslak **onaylanır** |
| `/yeniden daha kısa olsun` | Aynı konu isteğinize göre yeniden yazılır |
| `/iptal` | Taslak silinir |

3. Onaylı taslakları ikas'a eklemek için ikas panelindeyken **Blog Yayınla** yer imine tıklayın (ya da bilgisayarınızda Claude'a "onaylı blogları yayınla" deyin). Birden fazla onaylı taslak varsa hepsi birlikte eklenir.
4. Yazı sitede yayına girince issue saat başı otomatik kapanır.

> **Neden son adım tarayıcıda?** ikas'ın resmi API'si (Özel Uygulama) blog ve görsel işlemlerine izin vermiyor; bunlar yalnızca panele giriş yapmış kullanıcı ile yapılabiliyor. Yer imi sizin açık oturumunuzu kullanır, hiçbir şifre saklamaz. ikas blog iznini açarsa son adım da tamamen otomatik hale getirilebilir.

## Blog Yayınla yer imini kurma (bir kerelik)
1. Chrome'da yer imleri çubuğunu açın (`Ctrl+Shift+B`).
2. Çubuğa sağ tıklayın → **Sayfa ekle**. Ad: `Blog Yayınla`.
3. URL alanına `browser/yer-imi.txt` dosyasındaki satırın tamamını yapıştırın → Kaydet.
4. Kullanım: ikas yönetim paneli açıkken yer imine tıklayın; sağ altta ilerleme kutusu çıkar.

## Ayarlar (GitHub → Settings → Secrets and variables → Actions)

| Secret | Gerekli mi | Açıklama |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Evet | Claude API anahtarı (yazı başına ~0,10–0,40 $) |
| `PIXABAY_API_KEY` | İsteğe bağlı | https://pixabay.com/api/docs/ (giriş yapınca görünür) – gerçek fotoğraflı kapaklar |
| `PEXELS_API_KEY` | İsteğe bağlı | Pexels yeni anahtar vermeyi geçici durdurdu |
| `IKAS_CLIENT_ID` / `IKAS_CLIENT_SECRET` | Hayır | Şu an kullanılmıyor (ikas blog API'si açılırsa gerekecek) |

Depo **herkese açık (public)** olmalı: yer imi taslakları ve görselleri GitHub'dan anahtarsız okur. Gizli anahtarlar (Secrets) herkese açık depoda da gizli kalır.

## Sık yapılacaklar
- **Konu eklemek/sırasını değiştirmek:** `topics.json` dosyasını GitHub'da kalem simgesiyle düzenleyin.
- **Belirli bir konuyu hemen yazdırmak:** Actions → Günlük blog taslağı → Run workflow → *topic* alanına başlığı yazın.
- **Saati değiştirmek:** `.github/workflows/gunluk-taslak.yml` içindeki `cron` satırı (UTC; Türkiye = UTC+3).
- **Modeli sabitlemek:** Settings → Secrets and variables → Actions → *Variables* → `CLAUDE_MODEL` (boşsa en yeni Claude Sonnet).

## Dosyalar
- `src/pipeline.js` – akış (konu → yazı → görseller → taslak → onay → senkron)
- `src/content.js` – Claude ile yazı üretimi ve yazım kuralları
- `src/images.js` – fotoğraf arama, kapak/kolaj üretimi
- `src/render.js` – ikas editörünün HTML formatı (mevcut yazılarla birebir aynı)
- `browser/ikas-yayinla.js` – ikas panelinde onaylı taslakları ekleyen betik; `browser/yer-imi.txt` – yer imi
- `drafts/<slug>/` – onay bekleyen taslaklar (draft.json + görseller), `state/published.json` – yayınlananlar
- `test/` – `npm test` (HTML formatı), `npm run test:e2e` (tüm akışın taklit servislerle testi)

Stok fotoğrafların altına ve yazının sonuna fotoğrafçı adı ve kaynak sitesi linki otomatik eklenir.
