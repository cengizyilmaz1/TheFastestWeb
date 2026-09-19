# Master plan karşılaştırması ve uygulama sırası

Bu dosya kullanıcı master planındaki **0–141 maddelerinin tamamını** başlangıç codebase'iyle karşılaştırır. Durumlar başlangıç fark analizidir; tamamlanma iddiası değildir. M1 uygulama kanıtları [Milestone 1](MILESTONE-1.md), migration kanıtları [DATABASE](DATABASE.md) ve [MIGRATION](MIGRATION.md) içindedir. M1 tamamlandıktan sonra kullanıcı devam talebiyle M2 altyapısı uygulandı; güncel kanıtlar [Milestone 2](MILESTONE-2.md) içindedir. Aşağıdaki başlangıç tablosu tarihsel fark analizidir.

- **Already exists:** kaynak/veri veya ilke mevcut; tüm gelecek ürün özelliklerinin hazır olduğu anlamına gelmez.
- **Needs modification:** mevcut işlevin bir kısmı korunarak değişecek.
- **Needs replacement:** mevcut yaklaşım kaldırılıp doğru uygulamayla değişecek.
- **New feature:** kalıcı uygulaması henüz yok.
- **Blocked:** harici erişim veya başka projenin kaynakları gerekir; bağımsız temel çalışmalar sürer.

| # | Başlık | Başlangıç durumu | Milestone | Karar / eksik |
|---|---|---|---|---|
| 0 | Genel hedef | Already exists | 0 / tümü | Kaynak, veri kopyası ve çalışma ilkeleri belirlendi; ürün hedefi sonraki milestone kabul ölçütüdür. |
| 1 | Çalışma prensipleri | Already exists | 0 / tümü | Kaynak, veri kopyası ve çalışma ilkeleri belirlendi; ürün hedefi sonraki milestone kabul ölçütüdür. |
| 2 | Mevcut repository durumu | Already exists | 0 / tümü | Kaynak, veri kopyası ve çalışma ilkeleri belirlendi; ürün hedefi sonraki milestone kabul ölçütüdür. |
| 3 | Mevcut teknoloji stack'i | Needs modification | 1 | M1 temeli: güvenlik ve üretim altyapısı; uygulama, test ve operasyon dokümantasyonu birlikte doğrulanır. |
| 4 | Deployment hedefi | Needs modification | 1 | M1 temeli: güvenlik ve üretim altyapısı; uygulama, test ve operasyon dokümantasyonu birlikte doğrulanır. |
| 5 | Docker / Coolify standardı | Needs modification | 1 | M1 temeli: güvenlik ve üretim altyapısı; uygulama, test ve operasyon dokümantasyonu birlikte doğrulanır. |
| 6 | Database | Needs modification | 1 | M1 temeli: güvenlik ve üretim altyapısı; uygulama, test ve operasyon dokümantasyonu birlikte doğrulanır. |
| 7 | Database migration baseline | Needs modification | 1 | M1 temeli: güvenlik ve üretim altyapısı; uygulama, test ve operasyon dokümantasyonu birlikte doğrulanır. |
| 8 | Database role modeli | Needs modification | 1 | M1 temeli: güvenlik ve üretim altyapısı; uygulama, test ve operasyon dokümantasyonu birlikte doğrulanır. |
| 9 | Database indexes | Needs modification | 1 | M1 temeli: güvenlik ve üretim altyapısı; uygulama, test ve operasyon dokümantasyonu birlikte doğrulanır. |
| 10 | Auth sistemi | Needs modification | 1 | M1 temeli: güvenlik ve üretim altyapısı; uygulama, test ve operasyon dokümantasyonu birlikte doğrulanır. |
| 11 | ENV sistemi | Needs modification | 1 | M1 temeli: güvenlik ve üretim altyapısı; uygulama, test ve operasyon dokümantasyonu birlikte doğrulanır. |
| 12 | Secret rotation | Blocked | 1 / 13 | Eski sağlayıcı hesaplarında anahtar iptali/yenilemesi ve yeni production secret provisioning gerekir; gerçek değerler repoya girmez. |
| 13 | Security — production blocker | Needs modification | 1 | M1 temeli: güvenlik ve üretim altyapısı; uygulama, test ve operasyon dokümantasyonu birlikte doğrulanır. |
| 14 | Persistent XSS | Needs modification | 1 | M1 temeli: güvenlik ve üretim altyapısı; uygulama, test ve operasyon dokümantasyonu birlikte doğrulanır. |
| 15 | Fake score / score tampering | Needs modification | 1 | M1 temeli: güvenlik ve üretim altyapısı; uygulama, test ve operasyon dokümantasyonu birlikte doğrulanır. |
| 16 | Cron security | Needs modification | 1 | M1 temeli: güvenlik ve üretim altyapısı; uygulama, test ve operasyon dokümantasyonu birlikte doğrulanır. |
| 17 | Rate limiting | Needs modification | 1 | M1 temeli: güvenlik ve üretim altyapısı; uygulama, test ve operasyon dokümantasyonu birlikte doğrulanır. |
| 18 | URL canonicalization & tracking | Needs modification | 1 | M1 temeli: güvenlik ve üretim altyapısı; uygulama, test ve operasyon dokümantasyonu birlikte doğrulanır. |
| 19 | URL lifecycle | New feature | 5 / 6 | Mevcut user/site/Pro/reklam kayıtlarını koruyacak ilave domain tabloları ve kontrollü backfill gerekir. |
| 20 | Claim system | New feature | 5 / 6 | Mevcut user/site/Pro/reklam kayıtlarını koruyacak ilave domain tabloları ve kontrollü backfill gerekir. |
| 21 | Auto-fill submission | Needs replacement | 6 | Mevcut metadata otomatik doldurma sınırlıdır; güvenli fetch M1, zenginleştirme ve yeni submit akışı M6. |
| 22 | Site submission fields | New feature | 5 / 6 | Mevcut user/site/Pro/reklam kayıtlarını koruyacak ilave domain tabloları ve kontrollü backfill gerekir. |
| 23 | Category system | New feature | 5 / 6 | Mevcut user/site/Pro/reklam kayıtlarını koruyacak ilave domain tabloları ve kontrollü backfill gerekir. |
| 24 | Technology detection | Needs replacement | 6 | Mevcut metadata otomatik doldurma sınırlıdır; güvenli fetch M1, zenginleştirme ve yeni submit akışı M6. |
| 25 | Founder system | New feature | 5 / 6 | Mevcut user/site/Pro/reklam kayıtlarını koruyacak ilave domain tabloları ve kontrollü backfill gerekir. |
| 26 | Founder public pages | New feature | 5 / 6 | Mevcut user/site/Pro/reklam kayıtlarını koruyacak ilave domain tabloları ve kontrollü backfill gerekir. |
| 27 | Site public profile | Needs modification | 7 / 8 / 10 | Mevcut site profili, SVG badge ve speed history kullanılır; metodoloji, durumlar ve ürün tasarımı geliştirilecek. |
| 28 | Weekly speed competition | New feature | 7 | Haftalık rekabet, deterministik sıralama, immutable snapshot ve metodoloji sürümleri henüz yok. |
| 29 | Hall of Fame | New feature | 7 | Haftalık rekabet, deterministik sıralama, immutable snapshot ve metodoloji sürümleri henüz yok. |
| 30 | Weekly archive | New feature | 7 | Haftalık rekabet, deterministik sıralama, immutable snapshot ve metodoloji sürümleri henüz yok. |
| 31 | Ranking methodology | New feature | 7 | Haftalık rekabet, deterministik sıralama, immutable snapshot ve metodoloji sürümleri henüz yok. |
| 32 | Performance test standardization | Needs replacement | 4 / 7 | M1 tek PSI ölçümünü açıkça sürümler; ortak worker ve çoklu ölçüm standardı sonraki aşamada. |
| 33 | BullMQ + Redis | New feature | 2 | Redis/BullMQ, worker, scheduler, idempotent jobs ve outbox henüz uygulanmadı. M1 yalnız sınırlı cron uyumluluk yolu sağlar. |
| 34 | Queue idempotency | New feature | 2 | Redis/BullMQ, worker, scheduler, idempotent jobs ve outbox henüz uygulanmadı. M1 yalnız sınırlı cron uyumluluk yolu sağlar. |
| 35 | Queue observability | New feature | 2 | Redis/BullMQ, worker, scheduler, idempotent jobs ve outbox henüz uygulanmadı. M1 yalnız sınırlı cron uyumluluk yolu sağlar. |
| 36 | Retest worker | New feature | 2 | Redis/BullMQ, worker, scheduler, idempotent jobs ve outbox henüz uygulanmadı. M1 yalnız sınırlı cron uyumluluk yolu sağlar. |
| 37 | Central Screenshot Service | Blocked | 4 | Paylaşılan Screenshot Service için IndieTools kaynak ve servis erişimi eksik; M1 Chromium badge kontrolü bu servisin yerine geçmez. |
| 38 | Screenshot Service architecture | Blocked | 4 | Paylaşılan Screenshot Service için IndieTools kaynak ve servis erişimi eksik; M1 Chromium badge kontrolü bu servisin yerine geçmez. |
| 39 | Screenshot Service security | Blocked | 4 | Paylaşılan Screenshot Service için IndieTools kaynak ve servis erişimi eksik; M1 Chromium badge kontrolü bu servisin yerine geçmez. |
| 40 | Screenshot caching | Blocked | 4 | Paylaşılan Screenshot Service için IndieTools kaynak ve servis erişimi eksik; M1 Chromium badge kontrolü bu servisin yerine geçmez. |
| 41 | Cloudflare R2 | New feature | 3 / 4 | R2 adapter, bucket erişimi, lifecycle ve optimize medya iş akışı gerekiyor. |
| 42 | Image optimization | New feature | 3 / 4 | R2 adapter, bucket erişimi, lifecycle ve optimize medya iş akışı gerekiyor. |
| 43 | Historical screenshots | Blocked | 4 | Paylaşılan Screenshot Service için IndieTools kaynak ve servis erişimi eksik; M1 Chromium badge kontrolü bu servisin yerine geçmez. |
| 44 | Badge system | Needs modification | 7 / 8 / 10 | Mevcut site profili, SVG badge ve speed history kullanılır; metodoloji, durumlar ve ürün tasarımı geliştirilecek. |
| 45 | Badge embed | Needs modification | 7 / 8 / 10 | Mevcut site profili, SVG badge ve speed history kullanılır; metodoloji, durumlar ve ürün tasarımı geliştirilecek. |
| 46 | Badge verification | Needs modification | 1 | M1 temeli: güvenlik ve üretim altyapısı; uygulama, test ve operasyon dokümantasyonu birlikte doğrulanır. |
| 47 | Share cards | New feature | 8 / 10 | Paylaşım kartları ve karşılaştırma sayfaları mevcut değil. |
| 48 | Compare pages | New feature | 8 / 10 | Paylaşım kartları ve karşılaştırma sayfaları mevcut değil. |
| 49 | Blog redesign | Needs modification | 11 | Temel blog/metadata mevcut; runtime sitemap güvenilirliği ve JSON-LD güvenliği M1; kapsamlı SEO/GEO M11. |
| 50 | SEO architecture | Needs modification | 11 | Temel blog/metadata mevcut; runtime sitemap güvenilirliği ve JSON-LD güvenliği M1; kapsamlı SEO/GEO M11. |
| 51 | Dynamic sitemap | Needs modification | 11 | Temel blog/metadata mevcut; runtime sitemap güvenilirliği ve JSON-LD güvenliği M1; kapsamlı SEO/GEO M11. |
| 52 | SEO public pages | Needs modification | 11 | Temel blog/metadata mevcut; runtime sitemap güvenilirliği ve JSON-LD güvenliği M1; kapsamlı SEO/GEO M11. |
| 53 | Structured data | Needs modification | 11 | Temel blog/metadata mevcut; runtime sitemap güvenilirliği ve JSON-LD güvenliği M1; kapsamlı SEO/GEO M11. |
| 54 | GEO / AI discoverability | Needs modification | 11 | Temel blog/metadata mevcut; runtime sitemap güvenilirliği ve JSON-LD güvenliği M1; kapsamlı SEO/GEO M11. |
| 55 | Search Console / Bing | Needs modification | 11 | Temel blog/metadata mevcut; runtime sitemap güvenilirliği ve JSON-LD güvenliği M1; kapsamlı SEO/GEO M11. |
| 56 | Microsoft Graph mail | Needs replacement | 3 / 5 | Graph ve Dodo adapter/queue/ledger/entitlements gerekiyor. M1 güvenli olmayan ödeme yazmalarını durdurur; eski Pro/veri korunur. |
| 57 | M365 mail configuration | Needs replacement | 3 / 5 | Graph ve Dodo adapter/queue/ledger/entitlements gerekiyor. M1 güvenli olmayan ödeme yazmalarını durdurur; eski Pro/veri korunur. |
| 58 | Mail queue | New feature | 2 | Redis/BullMQ, worker, scheduler, idempotent jobs ve outbox henüz uygulanmadı. M1 yalnız sınırlı cron uyumluluk yolu sağlar. |
| 59 | Mail events | Needs replacement | 3 / 5 | Graph ve Dodo adapter/queue/ledger/entitlements gerekiyor. M1 güvenli olmayan ödeme yazmalarını durdurur; eski Pro/veri korunur. |
| 60 | Payment — Polar kaldırılacak | Needs replacement | 3 / 5 | Graph ve Dodo adapter/queue/ledger/entitlements gerekiyor. M1 güvenli olmayan ödeme yazmalarını durdurur; eski Pro/veri korunur. |
| 61 | Dodo Payments | Needs replacement | 3 / 5 | Graph ve Dodo adapter/queue/ledger/entitlements gerekiyor. M1 güvenli olmayan ödeme yazmalarını durdurur; eski Pro/veri korunur. |
| 62 | Payment model | Needs replacement | 3 / 5 | Graph ve Dodo adapter/queue/ledger/entitlements gerekiyor. M1 güvenli olmayan ödeme yazmalarını durdurur; eski Pro/veri korunur. |
| 63 | Products / monetization | Needs replacement | 3 / 5 | Graph ve Dodo adapter/queue/ledger/entitlements gerekiyor. M1 güvenli olmayan ödeme yazmalarını durdurur; eski Pro/veri korunur. |
| 64 | Sidebar ads | Needs replacement | 3 / 5 | Graph ve Dodo adapter/queue/ledger/entitlements gerekiyor. M1 güvenli olmayan ödeme yazmalarını durdurur; eski Pro/veri korunur. |
| 65 | Ad lifecycle | Needs replacement | 3 / 5 | Graph ve Dodo adapter/queue/ledger/entitlements gerekiyor. M1 güvenli olmayan ödeme yazmalarını durdurur; eski Pro/veri korunur. |
| 66 | Google Analytics | Needs replacement | 3 / 12 | Eski analytics sahiplik kimlikleri kaldırılır. Yeni GA/DataFast ve gerçek event modeli ayrı aşamadadır. |
| 67 | DataFast | Needs replacement | 3 / 12 | Eski analytics sahiplik kimlikleri kaldırılır. Yeni GA/DataFast ve gerçek event modeli ayrı aşamadadır. |
| 68 | Internal analytics | Needs replacement | 3 / 12 | Eski analytics sahiplik kimlikleri kaldırılır. Yeni GA/DataFast ve gerçek event modeli ayrı aşamadadır. |
| 69 | Bot analytics | Needs replacement | 3 / 12 | Eski analytics sahiplik kimlikleri kaldırılır. Yeni GA/DataFast ve gerçek event modeli ayrı aşamadadır. |
| 70 | UI modernization | Needs modification | 10 / 11 | Mevcut Next/React sayfaları korunarak tasarım sistemi, erişilebilirlik, gerçek veri ve sorgu performansı geliştirilecek. |
| 71 | Design system | Needs modification | 10 / 11 | Mevcut Next/React sayfaları korunarak tasarım sistemi, erişilebilirlik, gerçek veri ve sorgu performansı geliştirilecek. |
| 72 | Homepage | Needs modification | 10 / 11 | Mevcut Next/React sayfaları korunarak tasarım sistemi, erişilebilirlik, gerçek veri ve sorgu performansı geliştirilecek. |
| 73 | Leaderboard UI | Needs modification | 10 / 11 | Mevcut Next/React sayfaları korunarak tasarım sistemi, erişilebilirlik, gerçek veri ve sorgu performansı geliştirilecek. |
| 74 | Search/filter | Needs modification | 10 / 11 | Mevcut Next/React sayfaları korunarak tasarım sistemi, erişilebilirlik, gerçek veri ve sorgu performansı geliştirilecek. |
| 75 | Dashboard | Needs modification | 10 / 11 | Mevcut Next/React sayfaları korunarak tasarım sistemi, erişilebilirlik, gerçek veri ve sorgu performansı geliştirilecek. |
| 76 | Admin panel | New feature | 5 / 8 / 9 / 12 | Admin yetkilendirme/audit, achievement, bildirim tercihleri ve ilgili domain modülleri henüz yok. |
| 77 | Admin queue operations | New feature | 2 | Redis/BullMQ, worker, scheduler, idempotent jobs ve outbox henüz uygulanmadı. M1 yalnız sınırlı cron uyumluluk yolu sağlar. |
| 78 | Correlation ID | Needs modification | 1 | M1 temeli: güvenlik ve üretim altyapısı; uygulama, test ve operasyon dokümantasyonu birlikte doğrulanır. |
| 79 | Error codes | Needs modification | 1 | M1 temeli: güvenlik ve üretim altyapısı; uygulama, test ve operasyon dokümantasyonu birlikte doğrulanır. |
| 80 | Logging | Needs modification | 1 | M1 temeli: güvenlik ve üretim altyapısı; uygulama, test ve operasyon dokümantasyonu birlikte doğrulanır. |
| 81 | Health checks | Needs modification | 1 | M1 temeli: güvenlik ve üretim altyapısı; uygulama, test ve operasyon dokümantasyonu birlikte doğrulanır. |
| 82 | Observability | Needs modification | 1 / 13 | Temel log/health eklenir; gerçek monitoring, backup, privacy ve tüm release gate'leri production ortamında doğrulanır. |
| 83 | Real vs synthetic data | Needs replacement | 1 | Sentetik history ve sahte ölçüm kabulü kaldırılır; eksik ölçüm hiçbir zaman başarılı veya sıfır değer olarak uydurulmaz. |
| 84 | Performance history | Needs modification | 7 / 8 / 10 | Mevcut site profili, SVG badge ve speed history kullanılır; metodoloji, durumlar ve ürün tasarımı geliştirilecek. |
| 85 | Regression detection | Needs modification | 7 / 8 / 10 | Mevcut site profili, SVG badge ve speed history kullanılır; metodoloji, durumlar ve ürün tasarımı geliştirilecek. |
| 86 | Achievement engine | New feature | 5 / 8 / 9 / 12 | Admin yetkilendirme/audit, achievement, bildirim tercihleri ve ilgili domain modülleri henüz yok. |
| 87 | Notification center | New feature | 5 / 8 / 9 / 12 | Admin yetkilendirme/audit, achievement, bildirim tercihleri ve ilgili domain modülleri henüz yok. |
| 88 | Email preferences | New feature | 5 / 8 / 9 / 12 | Admin yetkilendirme/audit, achievement, bildirim tercihleri ve ilgili domain modülleri henüz yok. |
| 89 | API-ready architecture | New feature | 5 / 8 / 9 / 12 | Admin yetkilendirme/audit, achievement, bildirim tercihleri ve ilgili domain modülleri henüz yok. |
| 90 | IndieTools cross-promotion | New feature | 5 / 8 / 9 / 12 | Admin yetkilendirme/audit, achievement, bildirim tercihleri ve ilgili domain modülleri henüz yok. |
| 91 | Data integrity | Needs modification | 1 | M1 temeli: güvenlik ve üretim altyapısı; uygulama, test ve operasyon dokümantasyonu birlikte doğrulanır. |
| 92 | Fake history endpoint | Needs replacement | 1 | Sentetik history ve sahte ölçüm kabulü kaldırılır; eksik ölçüm hiçbir zaman başarılı veya sıfır değer olarak uydurulmaz. |
| 93 | Existing analytics cleanup | Needs replacement | 3 / 12 | Eski analytics sahiplik kimlikleri kaldırılır. Yeni GA/DataFast ve gerçek event modeli ayrı aşamadadır. |
| 94 | Existing email cleanup | Needs replacement | 3 / 5 | Graph ve Dodo adapter/queue/ledger/entitlements gerekiyor. M1 güvenli olmayan ödeme yazmalarını durdurur; eski Pro/veri korunur. |
| 95 | Canonical site config | Needs modification | 1 | M1 temeli: güvenlik ve üretim altyapısı; uygulama, test ve operasyon dokümantasyonu birlikte doğrulanır. |
| 96 | Dependency cleanup | Needs modification | 1 | M1 temeli: güvenlik ve üretim altyapısı; uygulama, test ve operasyon dokümantasyonu birlikte doğrulanır. |
| 97 | Lint cleanup | Needs modification | 1 | M1 temeli: güvenlik ve üretim altyapısı; uygulama, test ve operasyon dokümantasyonu birlikte doğrulanır. |
| 98 | Testing | Needs modification | 1 | M1 temeli: güvenlik ve üretim altyapısı; uygulama, test ve operasyon dokümantasyonu birlikte doğrulanır. |
| 99 | Security tests | Needs modification | 1 | M1 temeli: güvenlik ve üretim altyapısı; uygulama, test ve operasyon dokümantasyonu birlikte doğrulanır. |
| 100 | CI | Needs modification | 1 | M1 temeli: güvenlik ve üretim altyapısı; uygulama, test ve operasyon dokümantasyonu birlikte doğrulanır. |
| 101 | Backup strategy | Needs modification | 1 / 13 | Temel log/health eklenir; gerçek monitoring, backup, privacy ve tüm release gate'leri production ortamında doğrulanır. |
| 102 | R2 lifecycle | New feature | 3 / 4 | R2 adapter, bucket erişimi, lifecycle ve optimize medya iş akışı gerekiyor. |
| 103 | Redis persistence | New feature | 2 | Redis/BullMQ, worker, scheduler, idempotent jobs ve outbox henüz uygulanmadı. M1 yalnız sınırlı cron uyumluluk yolu sağlar. |
| 104 | Outbox pattern | New feature | 2 | Redis/BullMQ, worker, scheduler, idempotent jobs ve outbox henüz uygulanmadı. M1 yalnız sınırlı cron uyumluluk yolu sağlar. |
| 105 | Audit logs | New feature | 5 / 8 / 9 / 12 | Admin yetkilendirme/audit, achievement, bildirim tercihleri ve ilgili domain modülleri henüz yok. |
| 106 | Privacy | Needs modification | 1 / 13 | Temel log/health eklenir; gerçek monitoring, backup, privacy ve tüm release gate'leri production ortamında doğrulanır. |
| 107 | Terms / Privacy / About | Needs modification | 10 / 11 | Mevcut Next/React sayfaları korunarak tasarım sistemi, erişilebilirlik, gerçek veri ve sorgu performansı geliştirilecek. |
| 108 | Performance optimization | Needs modification | 10 / 11 | Mevcut Next/React sayfaları korunarak tasarım sistemi, erişilebilirlik, gerçek veri ve sorgu performansı geliştirilecek. |
| 109 | Cache strategy | Needs modification | 10 / 11 | Mevcut Next/React sayfaları korunarak tasarım sistemi, erişilebilirlik, gerçek veri ve sorgu performansı geliştirilecek. |
| 110 | Search engine quality | Needs modification | 11 | Temel blog/metadata mevcut; runtime sitemap güvenilirliği ve JSON-LD güvenliği M1; kapsamlı SEO/GEO M11. |
| 111 | Accessibility | Needs modification | 10 / 11 | Mevcut Next/React sayfaları korunarak tasarım sistemi, erişilebilirlik, gerçek veri ve sorgu performansı geliştirilecek. |
| 112 | Mobile | Needs modification | 10 / 11 | Mevcut Next/React sayfaları korunarak tasarım sistemi, erişilebilirlik, gerçek veri ve sorgu performansı geliştirilecek. |
| 113 | Product performance | Needs modification | 10 / 11 | Mevcut Next/React sayfaları korunarak tasarım sistemi, erişilebilirlik, gerçek veri ve sorgu performansı geliştirilecek. |
| 114 | No fake metrics | Needs replacement | 1 | Sentetik history ve sahte ölçüm kabulü kaldırılır; eksik ölçüm hiçbir zaman başarılı veya sıfır değer olarak uydurulmaz. |
| 115 | Naming conventions | Already exists | 0 / tümü | Kaynak, veri kopyası ve çalışma ilkeleri belirlendi; ürün hedefi sonraki milestone kabul ölçütüdür. |
| 116 | Folder structure | Needs modification | 1 | M1 temeli: güvenlik ve üretim altyapısı; uygulama, test ve operasyon dokümantasyonu birlikte doğrulanır. |
| 117 | Milestone sırası | Already exists | 0 / tümü | Kaynak, veri kopyası ve çalışma ilkeleri belirlendi; ürün hedefi sonraki milestone kabul ölçütüdür. |
| 118 | Migration requirements | Needs modification | 1 | M1 temeli: güvenlik ve üretim altyapısı; uygulama, test ve operasyon dokümantasyonu birlikte doğrulanır. |
| 119 | Existing historical data | Needs modification | 1 | M1 temeli: güvenlik ve üretim altyapısı; uygulama, test ve operasyon dokümantasyonu birlikte doğrulanır. |
| 120 | Ranking versioning | New feature | 7 | Haftalık rekabet, deterministik sıralama, immutable snapshot ve metodoloji sürümleri henüz yok. |
| 121 | Weekly snapshot immutability | New feature | 7 | Haftalık rekabet, deterministik sıralama, immutable snapshot ve metodoloji sürümleri henüz yok. |
| 122 | Time standard | Needs modification | 1 / 7 | Depolama ve günlük seçim UTC; haftalık rekabet takvimi ayrıca sürümlenecek. |
| 123 | Country handling | New feature | 5 / 6 | Mevcut user/site/Pro/reklam kayıtlarını koruyacak ilave domain tabloları ve kontrollü backfill gerekir. |
| 124 | URL/domain ownership | New feature | 5 / 6 | Mevcut user/site/Pro/reklam kayıtlarını koruyacak ilave domain tabloları ve kontrollü backfill gerekir. |
| 125 | Site deletion | New feature | 5 / 6 | Mevcut user/site/Pro/reklam kayıtlarını koruyacak ilave domain tabloları ve kontrollü backfill gerekir. |
| 126 | Payment entitlements | New feature | 5 / 6 | Mevcut user/site/Pro/reklam kayıtlarını koruyacak ilave domain tabloları ve kontrollü backfill gerekir. |
| 127 | Existing Pro users | New feature | 5 / 6 | Mevcut user/site/Pro/reklam kayıtlarını koruyacak ilave domain tabloları ve kontrollü backfill gerekir. |
| 128 | Existing ads | New feature | 5 / 6 | Mevcut user/site/Pro/reklam kayıtlarını koruyacak ilave domain tabloları ve kontrollü backfill gerekir. |
| 129 | Search/filter indexing | Needs modification | 10 / 11 | Mevcut Next/React sayfaları korunarak tasarım sistemi, erişilebilirlik, gerçek veri ve sorgu performansı geliştirilecek. |
| 130 | Pagination | Needs modification | 10 / 11 | Mevcut Next/React sayfaları korunarak tasarım sistemi, erişilebilirlik, gerçek veri ve sorgu performansı geliştirilecek. |
| 131 | Admin safety | New feature | 5 / 8 / 9 / 12 | Admin yetkilendirme/audit, achievement, bildirim tercihleri ve ilgili domain modülleri henüz yok. |
| 132 | Documentation | Needs modification | 1 | M1 temeli: güvenlik ve üretim altyapısı; uygulama, test ve operasyon dokümantasyonu birlikte doğrulanır. |
| 133 | Migration guide | Needs modification | 1 | M1 temeli: güvenlik ve üretim altyapısı; uygulama, test ve operasyon dokümantasyonu birlikte doğrulanır. |
| 134 | Coolify runbook | Needs modification | 1 | M1 temeli: güvenlik ve üretim altyapısı; uygulama, test ve operasyon dokümantasyonu birlikte doğrulanır. |
| 135 | Screenshot service runbook | Blocked | 4 | Paylaşılan Screenshot Service için IndieTools kaynak ve servis erişimi eksik; M1 Chromium badge kontrolü bu servisin yerine geçmez. |
| 136 | Production release gate | Needs modification | 1 / 13 | Temel log/health eklenir; gerçek monitoring, backup, privacy ve tüm release gate'leri production ortamında doğrulanır. |
| 137 | Codex çalışma biçimi | Already exists | 0 / tümü | Kaynak, veri kopyası ve çalışma ilkeleri belirlendi; ürün hedefi sonraki milestone kabul ölçütüdür. |
| 138 | Çok önemli yasaklar | Already exists | 0 / tümü | Kaynak, veri kopyası ve çalışma ilkeleri belirlendi; ürün hedefi sonraki milestone kabul ölçütüdür. |
| 139 | Ürün hedefinin kısa özeti | Already exists | 0 / tümü | Kaynak, veri kopyası ve çalışma ilkeleri belirlendi; ürün hedefi sonraki milestone kabul ölçütüdür. |
| 140 | Final positioning | Already exists | 0 / tümü | Kaynak, veri kopyası ve çalışma ilkeleri belirlendi; ürün hedefi sonraki milestone kabul ölçütüdür. |
| 141 | İlk uygulanacak milestone | Already exists | 0 / tümü | Kaynak, veri kopyası ve çalışma ilkeleri belirlendi; ürün hedefi sonraki milestone kabul ölçütüdür. |

## Güncel uygulama durumu

Başlangıç tablosu tarihsel fark analizidir. Güncel teslimler:

| Aşama | Uygulanan kapsam | Kanıt / kalan dış bağımlılık |
|---|---|---|
| 0–2 | Güvenli temel, restore, Docker, kalıcı kuyruk ve provider bütçeleri | MILESTONE-1.md, MILESTONE-2.md |
| 3 | Dodo, Graph, R2, consent analytics ve entitlement modeli | PROVIDERS.md, PAYMENTS.md, EMAIL.md; gerçek hesap yapılandırması son alan adında |
| 4 | Ayrı screenshot servisi, mobil/desktop/full-page, özel/public medya | services/screenshot/README.md; sandbox/SSRF Docker testleri geçti |
| 5 | Taxonomy, ISO ülkeler, founder, claim, lifecycle, immutable yarışmalar | DATABASE.md, MIGRATION.md; eski kolon/değer/kimlik/sahiplik hashleri korundu |
| 6 | URL → otomatik hazırlık → inceleme → yayın; iki cihaz ölçümleri | Kimlik, duplicate, tek kullanımlık kanıt ve transaction entegrasyon testleri |
| 7 | Haftalık/aylık/all-time, ülke/kategori/teknoloji, Hall of Fame | METHODOLOGY.md; deterministik sıralama, UTC ve immutable snapshot testleri |
| 8 | Evidence tabanlı awards, SVG/PNG paylaşım, güvenli badge grace | AWARDS-AND-BADGES.md; tekrar işleme, privacy ve ağ hata testleri |
| 9 | Opt-in public kurucu profilleri, sahiplik, sosyal bağlantılar | Public privacy ve founder/claim entegrasyon testleri |
| 10 | Yeni tasarım sistemi, public ekranlar, dashboard/admin/submit/pricing | DESIGN.md; masaüstü/mobil/light/dark 40 public tarayıcı kontrolü geçti |
| 11 | Metadata, canonical, runtime sitemap, robots, llms ve IndexNow değerlendirmesi | SEO.md; demo noindex, final domain doğrulamaları yayın öncesi |
| 12 | Bildirim tercihleri, audited RBAC admin, consent/revenue, reklam rezervasyonları | ADMIN.md, PROVIDERS.md; domain analytics ve olay tetikleyici son kontrolleri sürüyor |
| 13 | Demo Coolify kaynağı, restore/release/backup/rollback hazırlığı | RUNBOOK.md, DEPLOYMENT.md; dağıtım ve final provider hesapları ayrı doğrulanır |

Demo için kullanıcı kararı: geçici alan adı, ödeme/e-posta/analytics/zamanlanmış ölçüm kapalı. Gerçek provider gönderimleri, son alan adı OAuth ayarları, bağımsız monitoring ve off-host backup doğrulanmadan ücretli production yayını tamamlandı sayılmaz. Mevcut Pro ve reklam hakları korunur; süresi dolan yeni haklar eski kalıcı alanlara dönüştürülmez.
