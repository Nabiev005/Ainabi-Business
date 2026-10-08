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

# frontend (http://localhost:5173, /api → backend proxy)
cd frontend && npm install && npm run dev
npx tsc --noEmit            # типтерди текшерүү
npm run build               # tsc -b && vite build
```

Демо кирүү (seed'ден кийин): `owner@ainabi.kg` / `password123`.
Ар бир өзгөрүүдөн кийин: backend'де `npx tsc --noEmit` + `npm test`, frontend'де `npx tsc --noEmit` + `npm run build`.
Тесттер базасыз иштейт — ошон үчүн эсептөөлөр таза функцияларда турат (`services/pnl.ts`, `services/forecast.ts`, `utils/dateRange.ts`).

## Эрежелер (код жазганда)

- **Катмарлар:** `routes → controllers → services → validators`. Бизнес логика `services/`'те, денени Zod текшерет.
- **Изоляция:** ар бир Prisma сурамы `req.auth!.businessId` менен чектелет. Мындан эч качан четтебеңиз.
- **Укуктар:** `backend/src/config/permissions.ts` жалгыз булак. Маршрут `requirePermission("...")` менен корголот, frontend ошол эле тизмени `usePermissions().can(...)` аркылуу колдонот. Жаңы permission кошсоңуз, `frontend/src/types` ичиндеги `Permission` түрүн да жаңыртыңыз.
- **Ролдор:** OWNER (ээси), ADMIN (менеджер), ACCOUNTANT (бухгалтер), CASHIER (сатуучу — өздүк нарк менен пайданы көрбөйт), REGISTRAR (товар кабыл алуу).
- **Тарифтер:** `config/plans.ts` — BASIC / PRO / MAX. Модулдар `requireFeature("analytics")` сыяктуу жабылат, frontend'де `RequireFeature`.
- **Убакыт:** сервер `Asia/Bishkek` менен иштейт (`config/timezone.ts`, `server.ts`/`app.ts`'тин эң биринчи импорту; `APP_TIMEZONE` менен өзгөрөт). Күндүн ачкычы үчүн `utils/dateRange.ts` ичиндеги `dayKey()` колдонулат, `toISOString().slice(0, 10)` эмес (ал UTC күнүн берет).
- **Коопсуздук:** платформа админи = `PLATFORM_ADMIN_EMAILS` + Google'га байланышкан аккаунт (`isPlatformAdminUser`). Туура эмес пароль базада саналат (10 жолу → 15 мүн бөгөт). Жаңы текст талаасына `validators/common.ts` ичиндеги `LIMITS` менен чек коюңуз. CSV `utils/csv.ts` аркылуу гана (формула инъекциясынан коргойт).
- **Акча:** базада `Decimal(12,2)` (Float эмес), эсептөөдө `utils/money.ts` ичиндеги `toNumber` / `round2`.
- **Миграция:** схеманы өзгөрткөндө `backend/prisma/migrations/<YYYYMMDDHHMMSS>_<ат>/migration.sql` кошулат. Прод'до Vercel build учурунда `prisma migrate deploy` өзү иштейт.
- **Тексттер:** UI'деги ар бир текст i18n аркылуу берилет. Ачкычты **ky.json жана ru.json экөөнө тең** кошуңуз. Коддогу комментарийлер англисче.
- **Стиль:** Tailwind жок. Түстөр, аралыктар жана радиустар `styles/tokens.css` ичиндеги CSS өзгөрмөлөрүнөн алынат. Ар бир барактын өз `.css` файлы бар. Dark mode жок.
- **Графиктер:** Recharts. Статистика бетиндеги 3D мамычалар жана 3D тегерек диаграмма `pages/Analytics/Charts3D.tsx` ичинде. Түстөрдүн тартиби туруктуу (`PALETTE`), бир түс ар дайым бир маанини билдирет.
- **Git:** иш `feature/employee-roles` бутагында жүрөт, PR аркылуу `main`га бириктирилет (PR #1–#6). Коммит билдирүүлөрү англисче.

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

## Калган иштер

- [ ] **Браузерде текшерүү.** Код типтерди текшерүүдөн, тесттерден жана build'ден өттү, бирок локалдык база жок болгондуктан төмөнкүлөр чыныгы маалымат менен ачылып көрүлө элек: статистика бети (3D графиктер, прогноз), Excel файл, паролду калыбына келтирүү.
- [ ] **Resend'ди жандыруу.** resend.com'до аккаунт ачып, доменди тастыктап, Vercel'ге `RESEND_API_KEY` жана `MAIL_FROM` коюу. Андан кийин бир жолу өзүңүзгө калыбына келтирүү катын жөнөтүп текшериңиз.
- [ ] **AI жардамчыны жандыруу:** console.anthropic.com'дон API ачкыч алып, Vercel'ге `ANTHROPIC_API_KEY` коюу; чыныгы маалымат менен суроолорду сынап, жооптордун сапатын жана баасын текшерүү.
- [ ] Тамырдагы `package-lock.json` бош файл (root'то `package.json` жок, кокусунан `npm` иштетилгенде түзүлгөн). Аны өчүрсө болот.
- [ ] Тесттер азырынча эсептөөлөрдү гана камтыйт. Склад (`utils/stockLedger.ts`) жана сатуу базага көз каранды, аларды тестирлөө үчүн тест базасы керек.
