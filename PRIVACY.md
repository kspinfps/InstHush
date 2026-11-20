# InstHush Privacy Policy

[Türkçe](#insthush-gizlilik-politikası)

Effective date: 2026-11-19

InstHush is a browser extension for Instagram on the web. It has no account, no server of its own and no analytics. The developer does not receive any of your data.

InstHush is not affiliated with, endorsed by or sponsored by Instagram or Meta.

## Short version

- Nothing is collected, sold, or sent to the developer or to any third party.
- Settings and small counters are stored in your browser, on your device.
- The extension talks only to Instagram itself (its web pages, API and image/video CDN), and only when you use a feature that needs it or when Instagram's own page does.
- Removing the extension deletes everything it stored.

## What is stored on your device

The extension keeps data in `chrome.storage.local` (browser extension storage on this device). It is never synced and never uploaded.

| Key | Content |
|---|---|
| `cfg` | Main switches: video tools, ad filter, ghost mode for stories and for DMs. |
| `ui` | Your settings: theme, switches, focus options, default playback speed, sound choices, break reminder, keyboard shortcuts, and your local mute lists (words, hashtags, account names). |
| `speed` | Last playback speed, remembered between videos. |
| `stats` | Counters of matched or blocked signals and ads, with the time of the latest activity. |
| `usage` | Daily totals, in seconds, of time spent on Instagram for the last 14 days. |
| `favorites` | Account names you starred as favorites. |
| `seenPosts` | Short post identifiers (up to 3000) used to dim posts you have already seen. Only filled when the **seen posts** option is on. |

Not stored: photos, videos, comments, messages, your Instagram login or password, or any personal profile data. Downloaded files go to your normal downloads folder and are not tracked by the extension.

## Network requests

InstHush has no server and sends nothing to the developer. Network activity is limited to Instagram's own domains:

- **Instagram's page traffic.** Ghost mode, the ad filter, local mute and focus options inspect or suppress requests and responses that the Instagram page already makes. They run on your device. The extension does not copy or keep that content.
- **Downloads.** When you ask for a download, the extension requests that media's address from Instagram's media-info endpoint on `www.instagram.com`, using your existing browser session. Your browser then fetches the file from Instagram's CDN (`*.cdninstagram.com`, `*.fbcdn.net`).
- **Profile photo and grid preview.** Saving a profile photo and the optional hover preview load images from Instagram's CDN through your browser, like any image on the page.
- **Links you click.** Favorites open the account's Instagram page in a new tab. The author link opens the author's GitHub profile only when you click it.

Because of this, InstHush does not claim "zero network requests". It sends no data to any party other than Instagram, and the requests to Instagram are the same kind your browser makes when you use the site. Instagram may see those requests under its own privacy policy.

No remote code is loaded. No blocklist or other data is downloaded.

## Permissions and why

| Permission | Why |
|---|---|
| `storage` | Save your settings, counters and lists on this device. |
| `downloads` | Save the photos, videos and PNG frames you ask to download. |
| Access to `https://www.instagram.com/*` (content scripts) | The features run inside Instagram pages. No other site is accessed. |

## Your control and deleting data

- Switch any feature off in the popup or the in-page dock.
- Use **Export** in the popup footer to save your settings as a file, and **Import** to restore them.
- Use the popup's clear button for the seen-posts list.
- Remove the extension from your browser to delete all stored data. You can also clear its site data from the browser's extension settings.

## Children

InstHush is a general-purpose tool and does not knowingly collect data from anyone, including children.

## Changes

If this policy changes, the new text and date will appear in this file in the repository.
## Contact

Open an issue on the project's GitHub repository.

---

# InstHush Gizlilik Politikası

Yürürlük tarihi: 2026-11-19

InstHush, web üzerindeki Instagram için bir tarayıcı eklentisidir. Hesabı, kendi sunucusu ve analitiği yoktur. Geliştirici verilerinizden hiçbirini almaz.

InstHush, Instagram veya Meta ile bağlantılı değildir; onlar tarafından onaylanmamış veya desteklenmemiştir.

## Kısaca

- Hiçbir şey toplanmaz, satılmaz; geliştiriciye veya üçüncü bir tarafa gönderilmez.
- Ayarlar ve küçük sayaçlar tarayıcınızda, cihazınızda saklanır.
- Eklenti yalnızca Instagram'ın kendisiyle (web sayfaları, API'si ve görsel/video CDN'i) konuşur; bunu da yalnızca bir özelliği kullandığınızda veya Instagram'ın kendi sayfası istek yaptığında yapar.
- Eklentiyi kaldırmak sakladığı her şeyi siler.

## Cihazınızda neler saklanır

Eklenti verileri `chrome.storage.local` içinde (bu cihazdaki tarayıcı eklenti deposu) tutar. Hiçbir zaman eşitlenmez, yüklenmez.

| Anahtar | İçerik |
|---|---|
| `cfg` | Ana anahtarlar: video araçları, reklam filtresi, hikâyeler ve DM için gizli mod. |
| `ui` | Ayarlarınız: tema, anahtarlar, odak seçenekleri, varsayılan oynatma hızı, ses tercihleri, mola hatırlatıcısı, klavye kısayolları ve yerel sessize alma listeleriniz (kelimeler, hashtag'ler, hesap adları). |
| `speed` | Son oynatma hızı; videolar arasında hatırlanır. |
| `stats` | Eşleşen veya engellenen sinyal ve reklam sayaçları ile son etkinlik zamanı. |
| `usage` | Son 14 günün Instagram'da geçen süresinin günlük toplamları (saniye). |
| `favorites` | Favori olarak yıldızladığınız hesap adları. |
| `seenPosts` | Gördüğünüz gönderileri soluklaştırmak için kullanılan kısa gönderi kimlikleri (en çok 3000). Yalnızca **görülen gönderiler** seçeneği açıkken dolar. |

Saklanmayanlar: fotoğraflar, videolar, yorumlar, mesajlar, Instagram giriş bilgileriniz veya şifreniz, kişisel profil verileri. İndirilen dosyalar normal indirme klasörünüze gider; eklenti onları izlemez.

## Ağ istekleri

InstHush'ın sunucusu yoktur ve geliştiriciye hiçbir şey göndermez. Ağ etkinliği Instagram'ın kendi alan adlarıyla sınırlıdır:

- **Instagram sayfa trafiği.** Gizli mod, reklam filtresi, yerel sessize alma ve odak seçenekleri, Instagram sayfasının zaten yaptığı istekleri ve yanıtları cihazınızda inceler veya engeller. Eklenti bu içeriği kopyalamaz, saklamaz.
- **İndirmeler.** İndirme istediğinizde eklenti, mevcut tarayıcı oturumunuzla `www.instagram.com` üzerindeki medya bilgisi uç noktasından o medyanın adresini alır. Ardından tarayıcınız dosyayı Instagram'ın CDN'inden (`*.cdninstagram.com`, `*.fbcdn.net`) indirir.
- **Profil fotoğrafı ve ızgara önizlemesi.** Profil fotoğrafını kaydetme ve isteğe bağlı üzerine gelince önizleme, görselleri sayfadaki herhangi bir görsel gibi tarayıcınız aracılığıyla Instagram'ın CDN'inden yükler.
- **Tıkladığınız bağlantılar.** Favoriler, hesabın Instagram sayfasını yeni sekmede açar. Yazar bağlantısı, yalnızca tıkladığınızda yazarın GitHub profilini açar.

Bu yüzden InstHush “sıfır ağ isteği” iddiasında bulunmaz. Instagram dışında hiçbir tarafa veri göndermez; Instagram'a giden istekler, siteyi kullandığınızda tarayıcınızın zaten yaptığı türdendir. Instagram bu istekleri kendi gizlilik politikası kapsamında görebilir.

Uzaktan kod yüklenmez. Engel listesi veya başka bir veri indirilmez.

## İzinler ve gerekçeleri

| İzin | Gerekçe |
|---|---|
| `storage` | Ayarlarınızı, sayaçlarınızı ve listelerinizi bu cihazda saklar. |
| `downloads` | İndirmesini istediğiniz fotoğraf, video ve PNG kareleri kaydeder. |
| `https://www.instagram.com/*` erişimi (içerik betikleri) | Özellikler Instagram sayfalarının içinde çalışır. Başka bir siteye erişilmez. |

## Denetim ve verileri silme

- Herhangi bir özelliği açılır pencereden veya sayfa içindeki panelden kapatın.
- Açılır pencerenin alt kısmındaki **Dışa aktar** ile ayarlarınızı dosyaya kaydedin, **İçe aktar** ile geri yükleyin.
- Görülen gönderi listesini açılır penceredeki temizle düğmesiyle silin.
- Saklanan tüm verileri silmek için eklentiyi tarayıcınızdan kaldırın. Tarayıcının eklenti ayarlarından site verilerini de temizleyebilirsiniz.

## Çocuklar

InstHush genel amaçlı bir araçtır ve çocuklar dahil kimseden bilerek veri toplamaz.

## Değişiklikler

Bu politika değişirse yeni metin ve tarih bu dosyada, depoda yer alır.
## İletişim

Projenin GitHub deposunda bir konu (issue) açın.
