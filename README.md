# Ainabi Business

Кыргызстандагы чакан жана орто бизнес үчүн товар, склад, сатуу (POS) жана
бизнес башкаруу веб-системасы. Multi-tenant (multi-business) архитектура —
ар бир аккаунт өз алдынча "бизнес" катары иштейт, маалыматтар `businessId`
менен изоляцияланган.

```text
ainabi-bussines/
├── backend/     — Node.js + Express + TypeScript + Prisma + PostgreSQL
└── frontend/    — React + TypeScript + Vite (Tailwind жок, өздүк CSS дизайн системасы)
```

Домениңиз менен продакшенге чыгаруу үчүн [DEPLOYMENT.md](DEPLOYMENT.md)
файлын караңыз (GitHub → Vercel + Railway кадам-кадам гид).

## 1. Технологиялар

**Frontend:** React 18, TypeScript, Vite, React Router, Axios, React Hook Form + Zod,
Lucide Icons, Recharts. Дизайн таза CSS (design tokens + component classes) менен,
Tailwind колдонулган эмес.

**Backend:** Node.js, Express, TypeScript, Prisma ORM, PostgreSQL, JWT
(access + refresh token, rotation менен), bcrypt, Zod validation. Money талаалары
`Decimal(12,2)` түрүндө сакталат (Float эмес).

## 2. Ишке киргизүү (локалдык өнүктүрүү)

### Талаптар
- Node.js 18+
- PostgreSQL (локалдык же Docker)

### Backend

```bash
cd backend
cp .env.example .env      # DATABASE_URL жана JWT сырларын коюңуз
npm install
npx prisma migrate dev    # схеманы базага колдонот
npm run prisma:seed       # демо бизнес + товарлар түзөт
npm run dev                # http://localhost:4000
```

Демо кирүү (seed'ден кийин):

```
Email:  owner@ainabi.kg
Пароль: password123
```

### Frontend

```bash
cd frontend
npm install
npm run dev                # http://localhost:5173 (backend'ге /api аркылуу proxy)
```

### Google менен кирүүнү жандыруу (милдеттүү эмес)

Google Sign-In иштеши үчүн:

1. https://console.cloud.google.com/apis/credentials дареги аркылуу **OAuth 2.0 Client ID** түзүңүз (тиби: Web application).
2. "Authorized JavaScript origins" бөлүгүнө `http://localhost:5173` кошуңуз (prod'до чыныгы домен).
3. Ошол эле Client ID'ди эки жерге тең коюңуз:
   - `backend/.env` → `GOOGLE_CLIENT_ID=...`
   - `frontend/.env` → `VITE_GOOGLE_CLIENT_ID=...`
4. Эки серверди кайра иштетиңиз.

Client ID коюлбаса, "Google менен кирүү" баскычы жөн эле көрүнбөйт — email/пароль
менен катталуу дайыма иштейт.

## 3. Дизайн системасы

`frontend/src/styles/tokens.css` — бардык түс, spacing, radius, shadow,
typography CSS-өзгөрмөлөрдүн жалгыз булагы (`--color-primary-600`,
`--space-4`, `--radius-lg`, ...). `components.css` — кайра колдонулуучу
класстар: `.btn`, `.card`, `.badge`, `.table`, `.drawer`, `.modal`, `.toast`,
`.tabs`, `.empty-state`, `.skeleton`, ж.б. Ар бир баракта ошол баракка гана
тиешелүү кичине CSS файлы бар (мисалы `Pos.css`, `Products.css`).

Негизги акцент: көк (`--color-primary-600`). Success/Warning/Danger түстөрү
статус үчүн гана колдонулат.

## 4. Database schema (кыскача)

`backend/prisma/schema.prisma` — толук схема. Негизги моделдер:

- **Аккаунт:** `User` → `Employee` (роль: OWNER / ADMIN / ACCOUNTANT / CASHIER / REGISTRAR) → `Business`; `RefreshToken`, `PasswordResetToken`, `SubscriptionPayment`.
- **Товар:** `Category`, `Product` (+ варианттар, пакеттер, аналогдор, IMEI/сериялар, партиялар/мөөнөт), `Location` (филиалдар), `ProductStock`, `StockMovement`, `StockTransfer`.
- **Кабыл алуу / эсеп:** `Supplier`, `SupplierDebt`, `PurchaseReceipt`, `InventoryCount`.
- **Сатуу:** `Sale` + `SaleItem`, `SaleReturn`, `CashShift` + `CashMovement`, `Customer`, `Debt` + `DebtPayment`.
- **Башкалар:** `Expense`, `RepairOrder`, `Task`, `PipelineStage` + `ProductStageEvent`.

Бардык бизнеске тиешелүү таблицаларда `businessId` бар жана бардык
query'лер `req.auth.businessId` менен чектелет — бир бизнестин
маалыматы экинчисине эч качан көрүнбөйт. Акча талаалары `Decimal`.

## 5. API структурасы

```
/api/auth        register, login, google, refresh, logout, me, change-password,
                 password-reset, forgot-password, reset-password
/api/dashboard   KPI, сатуу динамикасы, top products, low stock
/api/products    CRUD, штрих-код, импорт, варианттар     /api/categories  CRUD
/api/sales       POS сатуу, тарых, кайтаруу              /api/shifts      касса сменалары
/api/stock       кирим/чыгым/списание/которуу/инвентаризация
/api/suppliers   жеткирүүчүлөр, аларга карыз            /api/customers   CRUD, профиль
/api/debts       карыздар, төлөмдөр                     /api/expenses    CRUD
/api/repairs     ремонт заказдары                       /api/tasks       тапшырмалар
/api/pipeline    товар воронкасы                        /api/employees   кызматкерлер, ролдор
/api/reports     отчет, /export.csv                     /api/analytics   P&L, команда, айлык план/прогноз
/api/insights    айлык кеңештер                         /api/settings    бизнес, филиалдар, товар жөндөөлөрү
/api/billing     тариф/подписка                         /api/platform    платформа админи
```

Ар бир модуль `routes/ → controllers/ → services/ → validators/ (Zod)`
катмарларына бөлүнгөн. `requireAuth` JWT'ди текшерет, `requirePermission`
ролго жараша укукту (`config/permissions.ts`), `requireFeature` тарифти
(`config/plans.ts`) текшерет.

## 6. Коопсуздук архитектурасы

- **Пароль:** bcrypt, 12 salt rounds. Google аркылуу катталгандарда
  `passwordHash` жок — алар үчүн `login` эмес, `google` эндпоинти иштейт.
- **Access token:** JWT, 15 мүнөт жашайт, ар бир сурамда `Authorization: Bearer`
  аркылуу жиберилет, **браузердин эсте тутуусунда (localStorage) эч качан
  сакталбайт** — script-injection (XSS) менен уурдалышы мүмкүн эмес.
- **Refresh token:** 30 күн жашайт, **бир гана httpOnly cookie'де** сакталат
  (`/api/auth` жолуна гана таандык), JS кодунан такыр көрүнбөйт. Ар бир
  жаңылоодо (`rotation`) эскиси өчүрүлүп, жаңысы түзүлөт — базада
  `RefreshToken` таблицасында hash'и гана сакталат (өзү эмес). Локалдык
  иштетүүдө же frontend/backend бир доменде болгондо `SameSite=Lax`;
  Vercel+Railway сыяктуу эки башка доменде болгондо `COOKIE_CROSS_SITE=true`
  коюлат да, `SameSite=None; Secure` иштейт (HTTPS милдеттүү).
- **Google Sign-In:** `idToken` backend'де Google'дун өзүндө текшерилет
  (`google-auth-library`, audience = `GOOGLE_CLIENT_ID`) — frontend'ден
  келген маалыматка эч качан ишенилбейт.
- **CORS:** так белгиленген origin'дердин тизмеси (`CLIENT_URL`, үтүр менен
  бирден ашык коюуга болот) + `credentials: true` — `*` эч качан
  колдонулган эмес, тизмеде жок origin 403 алат.
- **Секреттер:** `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` production'до
  плейсхолдер маани же 32 белгиден кыска болсо, сервер **баштала электе
  эле катаны берип токтойт** — үнсүз күчсүз сыр менен иштеп кетпейт.
- **Rate limiting:** `login`/`register`/`google` — 15 мүнөттө 20 аракет
  (brute-force коргоо), калган API — 15 мүнөттө 1200 (кассир күн бою тынымсыз
  иштесе да тоскоолдук кылбайт).
- **Multi-tenant изоляция:** ар бир сурам `req.auth.businessId` менен
  чектелет — бир бизнестин маалыматы экинчисине URL'ди билсе да көрүнбөйт.
- **Валидация:** бардык POST/PUT денеси Zod схемасынан өтөт, Prisma бардык
  SQL'ди parameterize кылат (SQL injection мүмкүн эмес).

## 7. Учурдагы абал

Иштеп жаткан бөлүмдөр: аутентификация (JWT + httpOnly refresh cookie,
Google, email аркылуу паролду калыбына келтирүү), Dashboard, товарлар
(варианттар, IMEI, мөөнөт, импорт, этикеткалар), POS, склад жана
филиалдар, товар кабыл алуу, инвентаризация, кайтаруулар, касса
сменалары, ремонт, кардарлар, карыздар, жеткирүүчүлөр, чыгымдар,
отчеттор (Excel жана CSV), статистика (P&L, айлык план жана прогноз),
айлык кеңештер, тапшырмалар, воронка, 5 роль, тарифтер, платформа
админи, кыргызча/орусча интерфейс.

Убакыт: бардык «бүгүн», «ушул ай» жана күндүк графиктер
`Asia/Bishkek` убактысы менен эсептелет (`APP_TIMEZONE` менен
өзгөртсө болот).

Тесттер: `cd backend && npm test` — P&L, прогноз жана даталар үчүн
unit тесттер (`backend/tests/`).

Калган иштердин тизмеси — [CLAUDE.md](CLAUDE.md).
