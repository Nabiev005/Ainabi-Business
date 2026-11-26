# Ainabi Business — CLAUDE.md

Кыргызстандагы чакан жана орто бизнес үчүн веб-система. Анда товар, склад,
POS-касса, кардарлар, карыздар, отчеттор жана команданы башкаруу бар.
Архитектурасы multi-tenant: ар бир аккаунт өзүнчө «бизнес», бардык маалымат
`businessId` менен бөлүнгөн.

Прод: Vercel (frontend + backend бир долбоордо, бир домен), Postgres — Neon.
Репо: https://github.com/Nabiev005/Ainabi-Business

> README.md эскирип калган: андагы ролдор жана «кийинки кадамдар» азыркы абалга дал келбейт.
> Ушул файл менен кодго ишениңиз.

## Түзүлүшү

```text
Ainabi-Business/
├── backend/            Node.js + Express + TypeScript + Prisma + PostgreSQL
│   ├── prisma/         schema.prisma, migrations/, seed.ts
│   ├── scripts/        backup-db.sh, create-platform-admin.ts, disable-demo-account.ts
│   └── src/
│       ├── config/     permissions.ts (ролдор), plans.ts (тарифтер), businessTemplates.ts, env.ts
│       ├── routes/     ар бир модулдун маршруту (index.ts — баары /api астында)
│       ├── controllers/ → services/ → validators/ (Zod)
│       ├── middleware/ auth, requireRole (requirePermission), subscription (requireFeature), rate limit
│       ├── i18n/       backend ката билдирүүлөрү (ky/ru)
│       └── utils/      money, dateRange, stockLedger, barcode, jwt ...
├── frontend/           React 18 + TypeScript + Vite, Recharts, lucide-react, i18next
│   └── src/
│       ├── pages/      ар бир бөлүм өз папкасында (компонент + өз .css)
│       ├── components/ui/  KpiCard, Modal, Drawer, Badge, Skeleton, EmptyState ...
│       ├── services/   API чакыруулар (axios, `api.ts`)
│       ├── hooks/      useAuth, usePermissions, useLabels, useToast ...
│       ├── i18n/locales/  ky.json, ru.json
│       └── styles/     tokens.css (дизайн токендери), components.css, global.css
├── .github/workflows/db-backup.yml  түнкү шифрленген бэкап (секреттер керек)
├── vercel.json         /api/* → backend, калганы → frontend; build'де `prisma migrate deploy`
├── DEPLOYMENT.md       деплой гиди
└── README.md
```

## Командалар

```bash
# backend (http://localhost:4000)
cd backend && npm install && npx prisma migrate dev && npm run prisma:seed && npm run dev
npx tsc --noEmit            # типтерди текшерүү
npm test                    # unit тесттер (node:test + tsx), backend/tests/*.test.ts
npm run test:db             # база менен тесттер (tests/db/): убактылуу PostgreSQL ачып, иштетип, өчүрөт

# frontend (http://localhost:5173, /api → backend proxy)
cd frontend && npm install && npm run dev
npx tsc --noEmit            # типтерди текшерүү
npm run build               # tsc -b && vite build
```

Демо кирүү (seed'ден кийин): `owner@ainabi.kg` / `password123`.
Ар бир өзгөрүүдөн кийин: backend'де `npx tsc --noEmit` + `npm test`, frontend'де `npx tsc --noEmit` + `npm run build`.
Склад, сатуу, карыз, оптом же баага тийсеңиз — `npm run test:db` да (компьютерде PostgreSQL керек; чыныгы базага туташпайт).
`npm test` базасыз иштейт — ошон үчүн эсептөөлөр таза функцияларда турат (`services/pnl.ts`, `services/forecast.ts`, `utils/dateRange.ts`).

## Эрежелер (код жазганда)

- **Катмарлар:** `routes → controllers → services → validators`. Бизнес логика `services/`'те, денени Zod текшерет.
- **Изоляция:** ар бир Prisma сурамы `req.auth!.businessId` менен чектелет. Мындан эч качан четтебеңиз.
- **Укуктар:** `backend/src/config/permissions.ts` жалгыз булак. Маршрут `requirePermission("...")` менен корголот, frontend ошол эле тизмени `usePermissions().can(...)` аркылуу колдонот. Жаңы permission кошсоңуз, `frontend/src/types` ичиндеги `Permission` түрүн да жаңыртыңыз.
- **Ролдор:** OWNER (ээси), ADMIN (менеджер), ACCOUNTANT (бухгалтер), CASHIER (сатуучу — өздүк нарк менен пайданы көрбөйт), REGISTRAR (товар кабыл алуу). Оптом бааны каалаган кардарга берүү жана кардарды «оптом» деп белгилөө — `prices.wholesale` (ээси/менеджер гана).
- **Тарифтер:** `config/plans.ts` — BASIC / PRO / MAX. Модулдар `requireFeature("analytics")` сыяктуу жабылат, frontend'де `RequireFeature`.
- **Убакыт:** сервер `Asia/Bishkek` менен иштейт (`config/timezone.ts`, `server.ts`/`app.ts`'тин эң биринчи импорту; `APP_TIMEZONE` менен өзгөрөт). Күндүн ачкычы үчүн `utils/dateRange.ts` ичиндеги `dayKey()` колдонулат, `toISOString().slice(0, 10)` эмес (ал UTC күнүн берет).
- **Коопсуздук:** платформа админи = `PLATFORM_ADMIN_EMAILS` + Google'га байланышкан аккаунт (`isPlatformAdminUser`). Туура эмес пароль базада саналат (10 жолу → 15 мүн бөгөт). Жаңы текст талаасына `validators/common.ts` ичиндеги `LIMITS` менен чек коюңуз. CSV `utils/csv.ts` аркылуу гана (формула инъекциясынан коргойт).
- **Акча:** базада `Decimal(12,2)` (Float эмес), эсептөөдө `utils/money.ts` ичиндеги `toNumber` / `round2`.
- **Миграция:** схеманы өзгөрткөндө `backend/prisma/migrations/<YYYYMMDDHHMMSS>_<ат>/migration.sql` кошулат. Прод'до Vercel build учурунда `prisma migrate deploy` өзү иштейт.
- **Тексттер:** UI'деги ар бир текст i18n аркылуу берилет. Ачкычты **ky.json жана ru.json экөөнө тең** кошуңуз. Коддогу комментарийлер англисче.
- **Стиль:** Tailwind жок. Түстөр, аралыктар жана радиустар `styles/tokens.css` ичиндеги CSS өзгөрмөлөрүнөн алынат. Ар бир барактын өз `.css` файлы бар, бирок CSS глобалдуу — класстын аты башка файлда кайталанбасын (`stat-tile` ошентип кагышкан). Dark mode жок.
- **Графиктер:** Recharts. Статистика бетиндеги 3D мамычалар жана 3D тегерек диаграмма `pages/Analytics/Charts3D.tsx` ичинде. Түстөрдүн тартиби туруктуу (`PALETTE`), бир түс ар дайым бир маанини билдирет.
- **Git:** иш `feature/employee-roles` бутагында жүрөт, PR аркылуу `main`га бириктирилет (PR #1–#18). Ээси PR'ды GitHub'да өзү бириктирет; пушту ал «пуш кыл» дегенде гана жасаңыз. Коммит билдирүүлөрү англисче.

## Ушул убакка чейин эмне жасалды

Git тарыхы боюнча, эскиден жаңыга карай:

1. **Негиз:** JWT аутентификация (access 15 мүн + httpOnly refresh cookie, rotation), Google менен кирүү, Dashboard, товарлар, POS, склад, кардарлар, карыздар, чыгымдар, отчеттор (CSV), кызматкерлер.
2. **Жеткирүүчүлөр** модулу (байланыштар, сатып алуу тарыхы, аларга карыз), глобалдык издөө, билдирүүлөр борбору, мобилдик оңдоолор.
3. Юридикалык барактар, бизнес боюнча rate limit, кайра заказ сунуштары, кардар сегменттери.
4. **Кыргызча/орусча i18n** (бардык барактар), колдоо барагы жана колдонуу боюнча колдонмо.
5. Товарлар: SKU жана штрих-код өзү түзүлөт, сүрөт жүктөө, грамм/коробка бирдиктери. POS: категориялар, QR төлөм.
6. **Бизнес түрлөрү** жана товардын кошумча талаалары, IMEI/сериялык номер, кепилдик.
7. Товар кабыл алуу, инвентаризация, филиалдар, кайтаруулар, касса сменалары, ремонт модулу.
8. **Ролдор жана укуктар:** менеджер, бухгалтер, сатуучу, регистратор.
9. Тапшырмалар, ээсинин статистикасы, товар воронкасы (pipeline).
10. Сатуучунун скидкасына чек, демо аккаунтту бөгөттөө, базанын бэкабы, аудит боюнча оңдоолор.
11. **Жазылуулар/тарифтер**, паролду башкаруу (милдеттүү алмаштыруу), платформа админ панели.
12. Айлык кеңештер отчету (Insights), кайтаруулар журналы, «тоңуп калган» товарлар, жаңыланган лендинг.
13. Сайдбар бөлүмдөргө бөлүнүп, ачылып-жабыла турган болду.
14. **Статистика бети жаңыланды (2026-10-03):**
    - түстүү градиент KPI плиткалар;
    - 3D күндүк пайда графиги (түсү апта күнүнө жараша, зыян кызыл);
    - чыгымдар үчүн 3D тегерек диаграмма;
    - **айлык план + прогноз:** ушул темп менен ай аягында планга канча пайыз жетет, күнүнө канча керек, болжолдуу таза пайда.

    Планды ээси коёт (`Business.monthlyRevenuePlan`, `PUT /api/analytics/plan`). Прогноз `backend/src/services/forecast.ts` → `projectMonth()` ичинде эсептелет.
15. **Калган иштер жабылды (2026-10-06):**
    - убакыт алкагы оңдолду: Бишкек убактысы, күндөр `dayKey()` менен, `from=YYYY-MM-DD` жергиликтүү түн ортосу болуп окулат;
    - прогноз апта күндөрүн эске алат (акыркы 8 жума, кеминде 4 жума маалымат болсо);
    - P&L эсептөөсү `services/pnl.ts`'ке бөлүндү, `npm test` менен 14 unit тест;
    - отчетторду Excel'ге жүктөө (`pages/Reports/exportXlsx.ts`, 3 барак, `write-excel-file`);
    - email аркылуу паролду калыбына келтирүү: Resend, `PasswordResetToken`, `/forgot-password` → `/reset-password?token=`. `RESEND_API_KEY` + `MAIL_FROM` коюлбаса, мурункудай WhatsApp жолу көрсөтүлөт;
    - README.md жана DEPLOYMENT.md жаңыланды.

16. **AI жардамчы (2026-10-08):** `/assistant` барагы. Claude (`claude-opus-5-5`, effort `low`) 8 окуу гана куралы аркылуу бизнестин маалыматын карап жооп берет (`services/assistant.tools.ts`, `services/assistant.service.ts`). Ээси/менеджер/бухгалтер (`assistant.use`), PRO жана MAX тарифтер. Күнүнө бир бизнеске `ASSISTANT_DAILY_LIMIT` (демейки 40) суроо (`AssistantUsage`). `ANTHROPIC_API_KEY` жок болсо, барак «жандырылган эмес» дейт.

17. **Беш жаңы функция (2026-10-09):**
    - **Карыз/насыя:** бир мөөнөт же бөлүп төлөө графиги (`DebtInstallment`, `services/installments.ts`), «Эскертүү керек» тизмеси, WhatsApp `wa.me` шилтемеси менен эскертүү (`utils/whatsapp.ts`).
    - **Доллар менен баа:** `Product.usdSalePrice/usdPurchasePrice`, курс НБКРдан күнүнө бир жолу (`ExchangeRate`, `services/currency*.ts`), баалар биринчи окулганда кайра эсептелет; Жөндөөлөр → «Доллар курсу».
    - **Касса көзөмөлү:** `/risk`, `services/risk.ts` (сигналдар) + `risk.service.ts`.
    - **Онлайн каталог:** ачык `/c/:slug` барагы, `GET /api/public/catalog/:slug` (кирүүсүз, коопсуз талаалар гана), Жөндөөлөр → «Онлайн каталог».
    - **Оптом тармак:** `/wholesale`, `WholesaleOrder`, укуктар `wholesale.buy` / `wholesale.sell`; жөнөтүүдө сатуу, алганда кирим (штрих-код боюнча) + жеткирүүчүгө карыз.
    - Лендингде «Жаңы мүмкүнчүлүктөр» бөлүмү, Dashboard'да жабылуучу «Жаңылыктар» картасы (`components/WhatsNew.tsx`, `RELEASE` өзгөрсө кайра көрүнөт).

18. **Telegram бот `@ainabi_business_bot` (2026-10-09):** Настройкалар → Telegram (бир жолку `/start` коду менен туташуу), кечки отчет 21:00 (Vercel Cron, `vercel.json` → `/api/telegram/cron/daily`, `CRON_SECRET`), шашылыш кабарлар (кассада жетишпестик, жаңы оптом заказ), AI жандырылса ботко суроо. Код: `utils/telegram.ts`, `services/telegram.service.ts`, `routes/telegram.routes.ts`. Webhook биринчи жолу Telegram картасы ачылганда өзү коюлат.

19. **Жаңы лого жана Android тиркемеси (2026-10-19):**
    - Лого: `components/BrandLogo.tsx` (`BrandIcon`, `BrandLogo`), булагы `frontend/public/favicon.svg`. Favicon, PWA иконкалары жана `og-banner.png` ошондон түзүлгөн. Лендингдеги скриншот `app-preview.png` файлына көчтү (анда али эски «AB» бар — deploy'дон кийин жаңы скриншот керек).
    - `mobile/`: Capacitor 8, тиркеме жандуу сайтты ачат (`business.ainabi.site`), appId `site.ainabi.business`. Иконкалар: `npm run icons`. Gradle 9.1 (Android Studio'нун Java 25'и үчүн). Чоо-жайы `mobile/README.md`'де.
20. **Телефондо чыныгы тиркемедей (2026-10-20):**
    - ≤768px: ылдыйкы таб-бар (`layouts/MobileTabBar.tsx`, ролго жараша 4 бет + «Меню»), header — логотип + бизнестин аты, издөө баскычы толук экрандуу издөөнү ачат; тил тандоо Настройкаларда.
    - ≤640px: `Modal` ылдыйдан чыгат (bottom sheet), `Drawer` толук экран, toast'тар үстүдө. Инпуттар 16px (iPhone фокуста масштабды чоңойтпосун).
    - Safe-area: `--safe-top/--safe-bottom` (`styles/tokens.css`), `viewport-fit=cover`, iPhone PWA мета-тегдер, `index.html`'де жүктөлүү логотиби.
    - POS: себет ылдыйда калганда калкып турган «себетке өтүү» тилкеси (portal — `.route-transition` transform'у fixed'ди бузат).
    - Тиркеме: `@capacitor/app` менен Android артка баскычы (`components/NativeBackButton.tsx`, ачык терезелер `hooks/useBackButton.ts` аркылуу жабылат), SystemBars edge-to-edge, жарык тема, `AinabiApp` user-agent, тиркемеде лендинг жана Google баскычы жок. `versionCode 2` — **жаңы APK керек**.
    - Эскертүү: `layout.css` `components.css`'тен **мурун** жүктөлөт — `.btn`/`.stack` классы бар элементти жашыруу үчүн `.header .x` сыяктуу күчтүүрөөк селектор керек.

21. **Платформа панели (2026-10-10):** «төлөдү, +1 ай», «азыр бөгөттө», бизнести биротоло акысыз кылуу (`Business.complimentary`); сынамык мөөнөт Basic/Pro үчүн гана.
22. **Сериялык номер товар терезесинде (2026-11-25):** `trackSerials` күйүк бизнестерде SKU/штрих-коддун астында «Серийный номер / IMEI» талаасы. Номер жазылса `requiresSerial` өзү күйөт, баштапкы сан өзү толот. Номерлер ≤ калдык, кайталанбайт (`utils/serials.ts`, `registerSerials`); ката номер `DELETE /products/:id/serials/:serialId` менен өчөт. Кассада складда катталбаган номер азырынча кабыл алынат.
23. **База менен тесттер жана алар тапкан каталар (2026-11-25):** 5 функция локалдык базада жана Chrome'до текшерилди.
    - Оптом заказ: абал товардан **мурун** ээленет (эки жолу басканда склад эки эсе кемибейт), сатуу макулдашылган баада жазылат (`createSale(..., agreedPrices)`), «сатууга жабык» этаптагы товар тизмеде жок.
    - Сатуучу оптом бааны «оптом кардарга» гана бере алат, кардарды өзү «оптом» кыла албайт.
    - Карызга сатылганды кайтаруу: колго төлөнгөндөн көп акча берилбейт; кайтарым бөлүп төлөө графигин да кемитет; төлөм менен кайтарым бир учурда келсе экөө тең эсептелет (`FOR UPDATE`).
    - Каталог доллар баасын бүгүнкү курс менен көрсөтөт.
    - Дизайн: `gap-5/gap-6` класстары жок болчу (барактын башы карточкага жабышып турган); `stat-tile` кагышуусу.
24. **Google'да бир дарек (2026-11-25):** `index.html` ар бир баракка `https://business.ainabi.site` + path `canonical` коёт, `public/robots.txt`, `public/sitemap.xml`, JSON-LD. `og:url` атайын коюлган жок — `/c/:slug` шилтемелери башкы бетке айланып калбасын.
    - Эски `ainabi-business.vercel.app`'тин ачык беттери (`/`, `/login`, `/register`, `/privacy`, `/terms`, `/c/*`) `index.html`'деги скрипт менен `business.ainabi.site`'ке өтөт (PR #18, чыныгы сайтта текшерилди). Ички беттер (`/pos`, `/dashboard` ж.б.) жана `/api` атайын калтырылган: ал жерде иштеп жаткандар чыгып кетпесин.
    - Google менен кирүү `business.ainabi.site`'те уруксат берилген, эски даректе уруксат жок.

## Сүйлөшүүлөрдөн чыккан чечимдер жана контекст

**Колдонуучу:** долбоордун ээси (Айбек), кыргызча жазат — жоопторду кыргызча бериңиз. Система бизнесмендерге **ижарага берилген** (чыныгы кардарлар бар), ошондуктан коопсуздук жана маалыматтын сакталышы биринчи орунда.

**Инфраструктура (2026-10-08/09 абалы):**
- **Neon:** долбоор `ainabi-business` (muddy-surf-82139639), Франкфурт. **Launch** тарифине өтүлдү; `production` бутагы **корголгон**; History window **7 күн**; бэкап бутактары: `backup-2026-10-03`, `before-subscriptions`, `before-security-2026-10-08` (7 күндөн кийин өзү өчөт). 2026-11-25: алгачкы экөө гана калган, жаңы бэкап жок. Updates убактысын түнкү саатка (20:00–21:00 UTC) которуу, Spending notification жана 2FA — ээси өзү бүтүрүшү керек.
- **Vercel — эки долбоор бар (2026-11-25, GitHub deployments API'ден):** `main`'ге ар бир бириктирүүдө экөө тең deploy кылат.
  - `alsus-projects-d7718aa4` / `ainabi-business` (башка адамдын аккаунту) — **ийгиликтүү**, чыныгы production ушул болушу керек: PR #16, #17, #18 андан кийин эле доменде көрүндү. Өзгөрмөлөр ушул жакта.
  - `aibeks-projects-1f2df11d` / `ainabi-business` (ээсиники, `ainabi-business-seven.vercel.app`) — **кулайт**, GitHub'дагы кызыл ❌ ушундан; сайтка таасири жок. 2026-11-25: frontend курулат, `npx prisma generate && npx prisma migrate deploy` `exited with 1` (так `P…` катасы көрүлө элек; `DATABASE_URL` кошулганы ырасталган эмес, `DIRECT_URL` октябрдан бери турат). Коюлганы: `NODE_ENV`, `CLIENT_URL`, `GOOGLE_CLIENT_ID`, `VITE_GOOGLE_CLIENT_ID`, эки `JWT_*`, `DIRECT_URL`, `TELEGRAM_BOT_TOKEN`, `CRON_SECRET`. Telegram иштеши үчүн акыркы экөө production долбоорунда болушу керек.
  - Ээси production'ду өз долбооруна көчүрөт (кийинкиге калтырылды). Көчүп бүткөнчө: Алсудагы долбоорду өчүрбөө, `business.ainabi.site`'ти өз долбооруна кошпоо, Neon паролун алмаштырбоо, репону Private кылбоо (Hobby башка аккаунттун коммиттерин deploy кылбай калышы мүмкүн).
- Негизги домен — `https://business.ainabi.site` (сайт + `/api`; Android тиркемеси ушул даректи ачат). `ainabi.site` DNS'и Vercel'де; `business.ainabi.site` башка аккаунтка TXT тастыктоо менен кошулган. `CLIENT_URL`'дин **биринчи** дареги `https://business.ainabi.site` болушу керек: Telegram webhook жана пароль калыбына келтирүү шилтемеси ошондон түзүлөт. Өзгөрмөлөрдүн тизмеси DEPLOYMENT.md'де.
- Feature-бутакка пуш кылганда Preview deploy да кулайт (базанын өзгөрмөлөрү Production үчүн гана) — бул кадимки нерсе жана чыныгы базаны сынамык миграциядан коргойт.

**Кабыл алынган чечимдер:**
- Токендерди/сырларды **кодго же базага жазбайбыз** — Vercel Environment Variables гана (репо ачык болушу мүмкүн). Колдонуучудан токенди чатка жибербөөнү суранабыз.
- AI: демейки модель `claude-opus-5-5` (бир суроо ≈ $0.05–0.15). Арзаныраак вариант — Claude Haiku 4.5 (≈ $0.01–0.03). Gemini (Google AI Studio) да талкууланды: **акысыз тариф бизнестердин маалыматын окутууга колдонушу мүмкүн**, ошондуктан чыныгы кардарлар үчүн billing жандырылган тариф гана. Ээси AI'ды «кийин кошом» деди — азырынча ачкыч жок.
- WhatsApp: Meta API'нин ордуна акысыз `wa.me` шилтемелери (ээси бир басып жөнөтөт). Instagram API бот үчүн ылайыксыз (24 сааттык терезе) — Instagram каталог үчүн гана.
- Telegram бот WhatsApp ордуна ээлер үчүн (акысыз, тастыктоосуз).
- МойСклад менен салыштыруу жасалды: биздин артыкчылык — кыргыз тили, жергиликтүү баа, IMEI/ремонт, кеңештер/прогноз; бизде жок: ККМ/фискализация, офлайн касса, документтер (ЭСФ), буйрутма/резерв, лоялдуулук, интеграциялар, көп валюта (доллар баасы кошулду).

**Ээси жооп бере элек суроолор:**
- Кассада складда катталбаган сериялык номерди тыюу керекпи (Настройкадан күйгүзүлчү кылып)?
- Каттоодо email тастыктоо (Resend жандырылгандан кийин) кошолубу? Азыр бөтөн email менен катталып, чексиз 14 күндүк сынамык алса болот.
- Тарифтер: касса көзөмөлү PRO/MAX'та, каталог/оптом/карыз эскерткич/доллар баасы бардык тарифтерде — ушундай калсынбы?

**Келечектеги идеялар (талкууланган, жасала элек):** накладнойду сүрөттөн AI менен окуу, майрамга/сезонго даярдык эскертүүсү, рыноктук баа салыштыруу (анонимдүү), бизнес-рейтинг/кредит (банктар менен), кардарга WhatsApp чек + бонус, сатуучулардын мелдеши, ККМ интеграциясы, автоматтык бэкап (GitHub Actions).

## Калган иштер

- [ ] **Мобилдик тиркеме (эртең улантуу):** ээси iPhone колдонот — азырынча Safari → «На экран Домой». Android APK сыналган жок (эмулятор ачылган жок), чыныгы телефондо текшерүү. Кийинки кадамдар: Play Market үчүн кол коюлган `.aab` + Play Console ($25); iOS үчүн Apple Developer ($99/жыл) + Mac же булут build; тиркемеде Google менен кирүү жана CSV/Excel жүктөө үчүн нативдик плагиндер.
- [ ] **Өз Vercel'ине көчүрүү:** (1) `DATABASE_URL` (pooled) менен `DIRECT_URL`'ди текшерип, Redeploy; куласа build log'дон `Error: P…` сабын көрүү. (2) `ainabi-business-seven.vercel.app`'та email/пароль менен кирип текшерүү (чыныгы база — сынамык сатуу жасабоо). (3) Кардарлар аз кезде `business.ainabi.site`'ти кошуу, Настройкалар → Telegram'ды ачуу (webhook). Жаңы JWT болгондуктан баары бир жолу кайра кирет. (4) 1–2 жумадан кийин Neon паролун жаңылап, өзгөрмөлөрдү алмаштыруу. Коммерциялык колдонуу үчүн Vercel Pro керек.
- [ ] **Google'да жалгыз `business.ainabi.site`:** ресурс тастыкталган, код даяр. Search Console'до: `sitemap.xml` жөнөтүү, индекстөө суроо; `https://ainabi-business.vercel.app/` ресурсун кошуп, индекстөө суроо. Тездетүү үчүн «Удаления» эски ресурста **гана**, жана `business.ainabi.site` үчүн «Канонический URL, выбранный Google» өзү болгондо гана. `www.ainabi.site`'тен шилтеме коюу.
- [ ] **Автоматтык бэкапты жандыруу:** код даяр (`.github/workflows/db-backup.yml`, `backend/scripts/backup-verified.sh`, 2026-11-26 локалдык текшерилди). GitHub'га `BACKUP_DATABASE_URL` жана `BACKUP_PASSPHRASE` секреттерин коюп, бир жолу «Run workflow» менен жашыл болгонун көрүү. Нускама DEPLOYMENT.md'де.
- [ ] Сериялык номер боюнча: кассада номерди сканерлеп товарды табуу, гарантия талонун басып чыгаруу.
- [ ] Telegram: deploy'дон кийин Настройкалар → Telegram → туташтыруу, кечки отчет келгенин текшерүү (Vercel Cron multi-service түзүлүштө иштейби — текшериле элек).
- [ ] **Браузерде текшериле элек:** Excel файл, паролду калыбына келтирүү (Resend керек). 5 функция, статистика бети жана телефондогу бардык барактар локалдык база менен текшерилди (2026-11-25).
- [ ] **Resend'ди жандыруу.** resend.com'до аккаунт ачып, доменди тастыктап, Vercel'ге `RESEND_API_KEY` жана `MAIL_FROM` коюу. Андан кийин бир жолу өзүңүзгө калыбына келтирүү катын жөнөтүп текшериңиз.
- [ ] **AI жардамчыны жандыруу:** console.anthropic.com'дон API ачкыч алып, Vercel'ге `ANTHROPIC_API_KEY` коюу; чыныгы маалымат менен суроолорду сынап, жооптордун сапатын жана баасын текшерүү.
- [ ] WhatsApp эскертүүлөрүн толук автоматтык кылуу үчүн Meta WhatsApp Business API (тастыктоо керек).
