# Soydaş Motosiklet – Günlük Blog Botu

## Nasıl çalışır?

1. **Pazartesi ve Perşembe sabahları ~07:17** (o günün yazısı çıkamazsa ertesi gün — Salı/Cuma — aynı konu otomatik yeniden yazılır) GitHub'ın sunucularında yazı ve görseller hazırlanır (`topics.json`'dan sıradaki konu), bu depoda "📰 Bugünün yazısı" başlıklı bir issue açılır ve telefonunuza bildirim gelir.
2. **09:00'da** (Türkiye saati) 7/24 açık bulut sunucudaki (AWS Lightsail `soydas-blog`, Frankfurt) Chrome'da kurulu **Soydaş Blog Otomatik Yayın** eklentisi ikas panelini arka planda açar ve yazıyı sizin oturumunuzla ikas'a ekler. Sizden onay/tıklama beklemez.
   - Yazı henüz hazır değilse gün içinde saatlik tekrar dener.
   - ikas oturumu kapanırsa (veya sunucu yeniden başlarsa) yazı eklenemez; saat 10:00'u geçince bu depodaki issue'ya "⚠️" yorumu düşer ve GitHub size e-posta atar. Lightsail → soydas-blog → **RDP kullanarak bağlan** ile sunucuya girip ikas'a tekrar giriş yapmanız yeterli; yazı sonraki saatlik denemede eklenir.
   - Sunucuya girip çıkarken pencereyi sadece kapatın, Windows'ta **oturumu kapatmayın** (Sign out yapılırsa Chrome da kapanır).
   - Ücret: Lightsail Windows 2 GB planı ≈ 22 $/ay, AWS kredisinden düşülür. Kredi bitince (veya istemezseniz) Lightsail'den sunucuyu silin.
3. Yazı sitede yayına girince issue saat başı otomatik kapanır.

İstemediğiniz bir yazıyı **09:00'dan önce** issue'ya `/iptal` yazarak durdurabilir, `/yeniden <isteğiniz>` ile yeniden yazdırabilirsiniz.
Onaylı (elle) moda dönmek için: Settings → Secrets and variables → Actions → *Variables* → `AUTO_APPROVE` = `false` (bu durumda `/yayinla` ile onay verilir).

> **Neden eklenti?** ikas'ın resmi API'si (Özel Uygulama) blog ve görsel işlemlerine izin vermiyor; bunlar yalnızca panele giriş yapmış bir tarayıcıdan yapılabiliyor. Eklenti şifre ya da anahtar saklamaz, sadece sizin Chrome'unuzdaki açık ikas oturumunu kullanır. ikas blog API'sini açarsa bilgisayar gerekmeden tamamen bulutta çalıştırılabilir.

## Blog Kılavuzu kuralları (18 Ekim 2026)
Bot her taslağı yayından önce otomatik kontrol eder (`src/quality.js`). Küçük sorunları (fazla blog linki, stok dışı ürün linki, uzun başlık/açıklama, adreste yıl) kendisi düzeltir; kelime ve link sayısı gibi esaslı sorunlarda yazıyı 3 kez yeniden yazdırır, yine geçemezse o gün yayınlamaz ve ertesi gün tekrar dener:
- En az 800 kelime · en az 3 **stokta olan** ürün linki · en az 2 kategori linki · 1–2 ilgili blog linki
- SEO başlığı "| Soydaş Motosiklet" dahil en fazla 60 karakter · meta açıklama 140–160 karakter
- Adres kısa, Türkçe karaktersiz, **yılsız**; başlıkta yıl yok
- Ölçü, parça no, model yılı, km aralığı yalnızca ürün adı veya üretici kılavuzu/tedarikçi kataloğundan; kaynağı olmayan bilgi yazılmaz
- "Teknisyen gözüyle" gibi yazar/uzmanlık iddiası, stok/fiyat iddiası yok
- Konular yalnızca `topics.json`'dan (model rehberleri). Liste bitince bot yeni konu uydurmaz, "Konu listesi bitti" issue'su açar.

Otomatik kontrol edilemeyenler (kılavuzdaki "kendi fotoğrafımız", "mağazadan bir ipucu", "Hamit bir kez okudu") için yayından sonra yazıyı ikas panelinden düzenleyebilirsiniz.

## Chrome eklentisini kurma (bir kerelik)
1. `chrome-extension` klasörünü bilgisayarınıza indirin (zip'i açın).
2. Chrome'da adres çubuğuna `chrome://extensions` yazın → sağ üstten **Geliştirici modu**nu açın.
3. **Paketlenmemiş öğe yükle** → `chrome-extension` klasörünü seçin.
4. Araç çubuğundaki **S** simgesine tıklayıp "Şimdi yayınla" ile deneyebilirsiniz.

Elle yayınlamak için yer imi de kullanılabilir: `browser/yer-imi.txt` satırını yeni bir yer iminin URL'sine yapıştırın.

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
- **Günleri/saati değiştirmek:** `.github/workflows/gunluk-taslak.yml` içindeki `cron` satırı (UTC; Türkiye = UTC+3).
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
