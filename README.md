# QanunHub

Dövlət qulluğu test imtahanının **«Qanunvericilik»** fənninə (AC, BA, BB kateqoriyaları; **AB tezliklə**) Duolingo modelində hazırlıq: alt mövzulara (bölmələrə) bölünmüş qısa dərslər, aralıqlı təkrar (SRS), canlar, XP, ardıcıl günlər, həftəlik/aylıq reytinq, bölmə testləri, mövzu final testləri və real formatda sınaq imtahanı. Abunə modeli: pulsuz plan (Konstitusiya mövzusu) + Premium.

Bu repozitoriya işlək MVP-dir: istifadəçi tətbiqi, redaktor/admin paneli, server API, Postgres sxemi və PDF materiallardan məzmun yaradan pipeline. **Onlayn ödəniş hələ qoşulmayıb** (növbəti mərhələ, aşağıya bax).

## Tərkib

```
packages/core      Domen mühərriki (TypeScript): SRS, canlar, XP, ardıcıllıq, rütbələr, reytinq, imtahan formatı,
                   dərs/təkrar/final/sınaq sessiyaları. Server və brauzer demosu eyni kodu işlədir.
apps/server        Hono + Postgres API: qeydiyyat/giriş, email təsdiqi, şifrə bərpası, öyrənmə API-si, admin API-si,
                   məzmun idxalı, miqrasiyalar. İstehsalda veb tətbiqi də bu server verir.
apps/web           React PWA (mobil-birinci). İki rejim: server (HTTP API) və demo (bütün məntiq brauzerdə).
tools/content      Python pipeline: PDF → qanun maddələri, testlər, sual-cavab → mövzu/dərs/kart/sual.
content/build      Hazır məzmun paketi (content.json) və keyfiyyət hesabatı (report.md).
scripts/dev-db.sh  Docker-siz lokal Postgres 16 (inkişaf və testlər üçün).
```

## Tez başla (Docker)

```bash
docker compose up --build
```

Tətbiq: http://localhost:8080. İlk açılışda miqrasiyalar tətbiq olunur, `content/build/content.json` bazaya yüklənir və admin hesabı yaradılır (`ADMIN_EMAIL` / `ADMIN_PASSWORD`, standart: `admin@example.com` / `change-me-please`; ilk girişdən sonra dəyişin).

Qeydiyyatdan keçən istifadəçinin təsdiq məktubu **Admin paneli → Poçt** bölməsində görünür (email provayderi hələ qoşulmayıb). Yoxlama mərhələsində təsdiqi keçmək üçün: `AUTO_VERIFY_EMAIL=true docker compose up`.

## Lokal inkişaf

Tələblər: Node.js 20+, Postgres 16 (və ya `scripts/dev-db.sh`), məzmun pipeline-ı üçün Python 3 və `pdftotext` (poppler-utils).

```bash
npm install
```

```bash
scripts/dev-db.sh start          # postgres://postgres@localhost:55432/qanunhub
```

```bash
cp .env.example .env             # DATABASE_URL-i yuxarıdakı ünvana dəyişin
set -a; . ./.env; set +a
npm run db:migrate
npm run content:import           # content/build/content.json → baza
```

```bash
npm run dev:server               # API: http://localhost:8080
```

```bash
npm run dev:web                  # Veb: http://localhost:5173 (/api serverə proksilənir)
```

İstehsal quruluşu: `npm run build`, sonra `WEB_DIST=apps/web/dist npm start`.

### Brauzer demosu

```bash
npm run build:demo               # apps/web/dist-demo/index.html
```

Tək HTML fayl, serversiz işləyir: bütün məzmun içindədir, hesablar və irəliləyiş brauzerin `localStorage`-ında saxlanılır, ödəniş simulyasiya olunur. Giriş səhifəsində «Demo hesabla bax (Premium)» bir kliklə hazır Premium hesaba daxil edir. Profil səhifəsində «admin hüququ ver» ilə redaktor panelini də yoxlamaq olar.

### Testlər

```bash
scripts/dev-db.sh start && npm test      # core: 24 test, server API: 14 inteqrasiya testi (qanunhub_test bazası)
```

```bash
npm run typecheck
```

## Mühit dəyişənləri

| Dəyişən | Təyinat | Standart |
|---|---|---|
| `DATABASE_URL` | Postgres bağlantısı | `postgres://qanunhub:qanunhub@localhost:5432/qanunhub` |
| `PORT` | Server portu | `8080` |
| `APP_ORIGIN` | Tətbiqin ictimai ünvanı (email linkləri, CSRF yoxlaması) | `http://localhost:5173` |
| `COOKIE_SECURE` | Sessiya cookie-si yalnız HTTPS ilə | istehsalda `true` |
| `TRUST_PROXY` | Reverse proxy arxasında (`X-Forwarded-For`) | `false` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | İlk administrator (yoxdursa yaradılır) | — |
| `AUTO_VERIFY_EMAIL` | Email təsdiqini keçmək (yalnız sınaq mühiti) | `false` |
| `CATEGORY_CHANGE_LIMIT` | Kateqoriyanı 30 gündə bir dəfə dəyişmək | `true` |
| `MAIL_MODE` | `outbox` (bazada) və ya `console` (həm də loqda, yalnız lokal) | `outbox` |
| `WEB_DIST` | Serverin verəcəyi veb quruluşu | boş |
| `CONTENT_SEED` | Baza boşdursa, başlanğıcda idxal olunan content.json | boş |
| `MIGRATIONS_DIR` | Miqrasiya qovluğu | `apps/server/migrations` |

## Əsas qaydalar (kodda)

- **İmtahan formatı** (`packages/core/src/exam.ts`): 100 tapşırıqdan 40-ı qanunvericilik. AB/BA: 32 qapalı + 8 açıq (2 bal), maks. 48 bal; AC/BB: 40 qapalı, maks. 40 bal. Alt qrupların keçid faizləri və vəzifələri DİM cədvəlindən (AB1 85% … BB4 65%).
- **Təkrar (SRS)**: SM-2 hibridi. Yeni sual 10 dəq → 1 gün → 3 gün → 7 gün; səhv cavab 10 dəqiqəyə qaytarır. İmtahan tarixi bilinirsə interval qalan günlərin yarısından uzun olmur. 4 dəfə səhv edilən sual «inadkar» sayılır.
- **Canlar** (pulsuz plan): gündə 3; bitəndə yeni dərslər 4 saat bağlanır; təkrarlar can xərcləmir; 10 sualdan 8 düz → +1 can (gündə ən çox 2).
- **XP**: dərs 10 + ilk cəhddə hər düz cavab 1 (ən çox 8) + səhvsiz dərsə 5; 7 gün ərzində ikinci dəfə keçilən dərs yarım, üçüncü dəfə 0 XP (dərsdə ən azı 3 yeni sual varsa, tam XP); təkrar 5 + hər düz cavab 1. Reytinqə gündə ən çox 600 XP; çox sürətli cavablar (botvari) reytinqə sayılmır.
- **Reytinq**: həftəlik və aylıq, ümumi və kateqoriya üzrə, Bakı vaxtı ilə. İştirak Premium + təsdiqlənmiş email ilə; pulsuz istifadəçi «Premium ilə neçənci olardın» görür.
- **Rütbələr**: dövlət qulluğunun ixtisas dərəcələri (7-ci dərəcəli … Ali dərəcəli), final testi keçilmiş mövzuların faizi və XP ilə.
- **İki sual hovuzu**: *formativ* suallar (`content/authored/`, redaksiyanın yazdığı) yalnız dərslərdə — hər dərsdə 2–4 qısa yoxlama, izahı qanundan sitatla. *Mənbə* sualları (test kitablarından) bölmə testlərində, final testində və sınaq imtahanında; formativ suallar yalnız mənbə sualı çatmadıqda boşluğu doldurur. Gündəlik təkrar hər ikisini əhatə edir.
- **Bölmə testi**: bölmənin (alt mövzunun) bütün dərsləri bitəndə açılır, 10 sual, keçid 80%, nəticə yolda göstərilir (`topic_finals` cədvəlində `sec:<bölmə>` açarı ilə).
- **Final testi**: 20 sual, keçid 80%, pulsuz planda 24 saatda bir cəhd. **Sınaq imtahanı**: kateqoriyanın formatında 40 tapşırıq, 50 dəqiqə.
- **Kateqoriyalar**: AC, BA, BB seçilə bilər; AB onboardinqdə və profildə «Tezliklə» kimi görünür və server tərəfindən qəbul edilmir (`AVAILABLE_CATEGORIES`, `packages/core/src/types.ts`). AB materialı hazır olanda onu siyahıya əlavə etmək kifayətdir.

## Təhlükəsizlik

- Düzgün cavablar klientə göndərilmir: hər cavab serverdə yoxlanılır, nəticə və XP serverdə hesablanır (istifadəçi üzrə `pg_advisory_xact_lock`, təkrar `complete` idempotentdir).
- Şifrələr scrypt ilə; sessiya tokenləri bazada sha256 ilə saxlanılır, `HttpOnly` + `SameSite=Lax` cookie.
- Bütün yazma sorğularında CSRF başlığı (`X-Requested-With`), sərt CSP, `X-Frame-Options: DENY`.
- Giriş, qeydiyyat və bərpa üçün sorğu limiti (yaddaşda: bir server nüsxəsi üçün; bir neçə nüsxədə Redis-ə keçirilməlidir).
- Admin əməliyyatları audit jurnalına yazılır (əvvəlki və sonrakı dəyərlərlə).

## Məzmun pipeline-ı

```bash
python3 tools/content/build.py <mənbə-qovluğu> content/build/content.json
```

Mənbə qovluğu: `files.tsv` (`fayl-id<TAB>ölçü<TAB>başlıq`) və `pdf/<fayl-id>.pdf`. Pipeline:

1. PDF-i mətnə çevirir (iki sütunlu səhifələri ayrıca tanıyır), brend/reklam səhifələrini və şrift xətalarını («dö vlət», «olacağ ını») təmizləyir.
2. Konspektlərdən qanun maddələrini, «Test və cavablar» fayllarından sualları və cavab açarlarını, sual-cavab fayllarından kartları çıxarır.
3. Proqramın 21 mövzusu üzrə dərslər qurur (≤5 maddə, ~2200 simvol), sualları maddə istinadı və mətn oxşarlığı ilə dərslərə bağlayır, eyni suala aid variantları bir «vahid»də birləşdirir.
4. Keyfiyyət bayraqları qoyur. `no_key`, `key_conflict`, `dup_options`, `garbled` və s. olan suallar **qaralama** kimi qalır və hüquqşünas təsdiqləyənə qədər istifadəçiyə göstərilmir.

5. `content/authored/*.json` fayllarındakı formativ sualları və bölmələri birləşdirir (`tools/content/authored.py`): hər sual dərsə bağlanır, variantlar sabit qaydada qarışdırılır, ID sualın mətnindən hesablanır.

Formativ sual faylının formatı (düzgün variant `a` indeksi ilə; adətən 0 yazılır, qarışdırma pipeline-dadır):

```json
{"sections": [{"from": 1, "title": "Ümumi müddəalar"}, {"from": 6, "title": "..."}],
 "questions": [{"l": 3, "q": "Sual", "o": ["düzgün", "səhv 1", "səhv 2", "səhv 3"], "a": 0, "r": "m. 5.2", "e": "Qanun: «…»"}]}
```

Yoxlama və baxış: `python3 tools/content/authored.py status` (hər mövzuda neçə dərsin ən azı 2 sualı var, xətalar), `python3 tools/content/authored.py show <mövzu> 1 10` (dərslərin qanun mətni).

Nəticə: `content/build/report.md`. Sual və dərs ID-ləri sabitdir (fayl + sual nömrəsi), ona görə yenidən idxal istifadəçilərin təkrar tarixçəsini pozmur; redaktorların admin panelində etdiyi düzəlişlər idxalda saxlanılır (`--overwrite-edited` ilə üstünə yazılır).

**Hüquqşünaslar üçün iş axını**: Admin paneli → Məzmun → «Bayraq» filtri. Hər sualda düzgün cavabı, izahı, istinadı redaktə edib statusu «Dərc olunub» etmək olar. İstifadəçi şikayətləri «Şikayətlər» bölməsinə düşür; təsdiqlənən şikayətə görə istifadəçi +20 XP alır.

### Hazırkı məzmun (2026-10-29)

21 mövzu, 71 bölmə, 384 dərs, 1873 izah kartı, 3812 sual:
- **1078 formativ sual** — AC/BA/BB proqramına düşən 368 dərsin hər birində ən azı 2 sual (Konstitusiya 150, Dövlət qulluğu 116, Əmək Məcəlləsi 107, İnzibati icraat 104, Kargüzarlıq 91, Dövlət sirri 75, Elektron imza 69, Mülki Məcəllə 51, Müraciətlər 47, Korrupsiya 44, İnformasiya 38, Rəmzlər 37, Etik davranış 32, Ombudsman 32, NHA 30, Dövlət dili 27, Məlumat azadlığı 15, Məhkəmələr 13). **Hüquqşünasların yoxlaması tövsiyə olunur** — hər sualda maddə istinadı və qanundan sitat var.
- **2734 mənbə sualı** (2682 dərc olunub, 52 qaralama).

Diqqət tələb edənlər:

- **Material yoxdur**: Təsnifat, Dövlət satınalmaları, Büdcə sistemi. Bu mövzular yolda «Tezliklə» kimi görünür.
- **Mənbə sualı azdır**: Mülki Məcəllə (30), Əmək Məcəlləsi (29), Dövlət sirri (25). Bu mövzuların bölmə testlərində formativ suallar da istifadə olunur; İnzibati icraat 4-cü, Əmək Məcəlləsi 4–5-ci bölmələrində mənbə sualı ümumiyyətlə yoxdur.
- **Qaralamalar**: 33 sualın cavab açarı tapılmayıb (o cümlədən Kargüzarlıq «Test 2» faylı tam), 10 sualda fərqli fayllarda fərqli açar var.

## Növbəti mərhələ: ödəniş

Hazır olanlar: planlar (`monthly` 12.99 AZN, `exam3` 29.99 AZN / 3 ay), `subscriptions` və `payments` cədvəlləri, Premium-un verilməsi/uzadılması (`grantPremium`), admin panelində əl ilə Premium. `POST /api/billing/checkout` hazırda `501 NOT_IMPLEMENTED` qaytarır və istifadəçiyə «tezliklə» bildirişi göstərilir.

Qoşulma üçün lazım olanlar:

1. Hüquqi şəxs və bank/ödəniş provayderi ilə müqavilə (yerli kart ödənişləri və təkrarlanan ödəniş dəstəyi).
2. `checkout`: provayderdə ödəniş sessiyası yaratmaq, `payments`-ə `pending` yazmaq, istifadəçini ödəniş səhifəsinə yönləndirmək.
3. Webhook: imzanı yoxlamaq, idempotent emal (provayderin əməliyyat ID-si unikal), uğurlu ödənişdə `grantPremium`, abunəlik yenilənməsi və ləğvi.
4. İstifadə şərtləri, məxfilik siyasəti, pulun qaytarılması qaydaları və vergi (ƏDV) statusu.
5. Email provayderi (təsdiq və bərpa məktubları hazırda `mail_outbox`-a yazılır).

## Hüquqi qeyd

Məzmun tədris məqsədlidir, hüquqi məsləhət deyil. Qanunların rəsmi mətni: e-qanun.az. Qanunvericilik dəyişdikcə suallar hüquqşünaslar tərəfindən yenilənməlidir (admin panelində «Köhnəlmiş» şikayətləri və bayraqları).
