# Milestone 1 — Foundation & Security

**Kapsam:** master plan madde141. Bu çalışma ürünün tamamını yeniden tasarlamaz ve production yayın onayı vermez. Yeni görsel tasarım, BullMQ, Dodo, Graph, R2, screenshot servisi ve haftalık yarışma sonraki milestone'lardadır.

## Değişiklikler

| Alan | Değişen dosyalar / davranış |
|---|---|
| Sürümler | package.json/lock, .node-version: Node24, güncel Next/React, kararlı next-auth, uyumlu TS/ESLint; belgeli geliştirme aracı istisnaları |
| Runtime | Dockerfile, compose.yaml, runtime/*, next.config.ts: standalone artifact, non-root Linux Chromium, kontrollü startup/shutdown |
| Config ve gözlemlenebilirlik | src/config/*, instrumentation, proxy, lib/http, infrastructure/logging: typed ENV, correlation ID, standart hata kodları, redaction, health/readiness |
| Ağ güvenliği | lib/security ve infrastructure/browser: public IP/DNS politikası, pinned fetch, her redirect/subresource kontrolü, sandbox/time/size/concurrency limitleri |
| Kimlik ve başvuru | auth.ts, modules/auth, modules/sites, api/speed-test/submit: verified Google email, UUID koruma, kullanıcı/URL/strategy/TTL bağlı tek kullanımlık sunucu sonucu |
| DB | db/index/schema/migrations, scripts/db: tek pool, gerçek snapshot baseline, guarded migration, least-privilege role ve atomik yazmalar |
| Retest | api/cron/retest: secret yoksa kapalı, UTC, tek site/çağrı, advisory lock, başarısız site için bir saat bekleme, başarılı geçmişi değiştirmeyen hata kaydı |
| Veri doğruluğu | History API gerçek DB verisi döndürür; eksik TTI NULL, legacy metodoloji etiketi; sentetik seed/history kaldırıldı |
| Public yüzey | JSON-LD ve SVG escape; private profil/history erişim kontrolü, public badge kısıtı; eski gizli backlink/analytics doğrulama kimlikleri kaldırıldı |
| Entegrasyon geçişi | Legacy ödeme yazmaları503; mevcut Pro/payment/ad verisi korunur. Email varsayılan kapalı, senkron welcome/trend gönderimi yok |
| UI uyumluluğu | Test-ID aktarımı, gerçek ölçüm bekleme durumu, eksik/eski testte yeniden test, lint düzeltmeleri; kapsamlı yeniden tasarım yapılmadı |
| Kalite | Vitest unit/DB regressions, Node24 GitHub Actions, tüm bağımlılık audit, Docker smoke |

## Migration ve veri güvenliği

Eski eksik migration doğrudan restore üzerinde çalıştırılmıyor. Yeni runner katalog fingerprint'iyle baseline'ı doğruluyor; advisory lock ve transaction altında ilave değişiklikleri uyguluyor. Uygulama açılışında migration yok.

Yeni `verified_speed_tests` ve `request_rate_limits` tabloları; sites.normalized_url, speed_tests.methodology_version ve sorgu indeksleri eklendi. Eski RLS-policiesiz yapı, uygulama authorization'ı ve ayrı sınırlı DB rolüyle değiştirildi. Migration owner uygulamada kullanılmıyor.

Gerçek özel snapshot restore/migration denemesinde **444 kullanıcı,187 site,17.595 test** ve diğer beş tablonun tüm eski sütun değerleri/sequence karşılaştırıldı; değişmedi. Sondaki slash yüzünden aynı normalize adrese gelen iki tarihi site ayrı UUID'lerle korundu. Yeni duplicate'ler transaction/advisory lock ile engelleniyor. Geçmiş score/raw data yeniden üretilmedi.

## ENV

- Production zorunlu: DATABASE_URL, AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, AUTH_TRUST_HOST=true; SITE_URL ve AUTH_URL aynı HTTPS origin.
- Operasyon: MIGRATION_DATABASE_URL yalnız maintenance, POSTGRES_ADMIN_PASSWORD yalnız DB bootstrap.
- Test entegrasyonları: GOOGLE_PSI_API_KEY, GOOGLE_PSI_API_KEY_BACKUP; eski HTTP cron emekliye ayrıldı (410), günlük işler BullMQ scheduler üzerinden çalışır; UNAVATAR_API_KEY yoksa avatar unavailable.
- Runtime: DB_MAX_CONNECTIONS, DB_CONNECT_TIMEOUT_SECONDS, DB_IDLE_TIMEOUT_SECONDS, DB_STATEMENT_TIMEOUT_MS, LOG_LEVEL, CHROMIUM_EXECUTABLE_PATH. Docker port/host/TZ/sandbox yolunu sağlar.
- Geçici email: ENABLE_LEGACY_RESEND=false, RESEND_API_KEY. Compose email'i kapalı tutar.
- POLAR_* ve NEXT_PUBLIC_SITE_URL uygulama bağımlılığı kaldırıldı. Eski sağlayıcı secret'ları yeniden kullanılmadı.

Değerler için yalnız [.env.example](../.env.example) kullanılır; yeni gerçek secret'lar Coolify'a runtime olarak girilir. Secret rotation sağlayıcı hesaplarında hâlâ yapılmalıdır.

## Kontrol kanıtları

19 Eylül 2026 tarihli son doğrulama:

| Kontrol | Sonuç |
|---|---|
| Node 24 typecheck | Başarılı |
| ESLint --max-warnings=0 | Hata/uyarı yok |
| Vitest unit | 19 dosya, 154 test başarılı |
| PostgreSQL uygulama entegrasyonu | 27 test başarılı |
| Migration regression | 7 senaryo grubu başarılı |
| Gerçek dump restore/migration | Tüm eski alanlar, UUID/sahiplik/history ve sequence korundu |
| npm audit (dev dahil) | 0 vulnerability |
| Drizzle kit proposal generation | 10 tablo; yalnız ignore edilen dizine çıktı |
| Docker production build | Node 24, build secret olmadan başarılı |
| Paketlenmiş imaj smoke | Source/dependency mount yok; ana sayfa/blog/static/auth-session/sitemap/health200 |
| Startup/readiness | Eksik ENV port açılmadan exit1; app role200 → schema CREATE izni503 → revoke200 |
| Cron/payment | Secret'sız cron401; emekli ödeme uçları503 |
| Chromium | UID1001, sandbox açık, güvenli proxy üzerinden gerçek public render başarılı |
| Shutdown | SIGTERM stopping/stopped, exit0; HTTP drain sırası ayrıca unit testli |
| Secret kontrolü | Bilinen 9 eski secret ve yaygın key/private-key kalıpları için taranan 207 dosyada eşleşme yok; imaj ENV'sinde application secret yok |

Doğrulanan yerel production imajı:
`sha256:470836f9d3dd0542474f1798a84ce7b8782daf92547f1ac890be5797483854ca`.
Geçici app/PostgreSQL container'ları kaldırıldı. Gerçek sağlayıcı OAuth/ödeme/mail credential'ları kullanılmadı.

GitHub Actions aynı lint/typecheck/unit/integration/audit/build kontrollerini Node 24 ve disposable PostgreSQL üzerinde çalıştırır. Son uzak koşunun durumu PR Checks bölümündedir.

Drizzle kit'in sınırlı esbuild override'ı ayrıca `drizzle-kit generate` ile doğrulandı:10 tablo için yalnız ignore edilen proposal dizinine SQL üretildi; hiçbir DB'ye push edilmedi.

## Açık yayın koşulları ve sonraki adım

- Yeni Coolify host/domain/secrets, gerçek eski kullanıcının Google sign-in'i ve gerçek PSI credential/quota testi gerekiyor.
- Snapshot sahipliği/UUID testi gerçek OAuth erişiminin kanıtı değildir.
- ESLint9 parser/plugin uyumluluğu nedeniyle geçici ve destek dışı bir tooling istisnasıdır; plugin desteğiyle ESLint10'a taşınmalıdır.
- Chrome amd64 hedefli; gerçek Coolify host'unda sandbox/egress tekrar doğrulanmalıdır.
- M1 cron/DB rate limiter geçiş çözümüdür. M2 queue/worker/scheduler ve outbox uygulayacaktır.
- Billing writes paused; Dodo idempotent ledger ve eski entitlement migration olmadan yeniden açılmaz.
- Backup/restore planının gerçek off-host uygulanması, monitoring ve master plan136'nın sonraki milestone gate'leri tamamlanmadan tam ürün yayına çıkmaz.

M1 regression geçtikten sonra sıradaki aşama **Milestone2 — Redis/BullMQ ve worker/scheduler**'dır. Bu dalda M2 başlatılmadı.
