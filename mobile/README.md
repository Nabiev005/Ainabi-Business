# Ainabi Business — Android тиркемеси

Capacitor 8 менен жасалган кабык. Тиркеме ичинде жандуу сайт ачылат
(`capacitor.config.ts` → `SITE_URL`, азыр `https://business.ainabi.site`).
Ошондуктан сайтка deploy кылганда тиркеме да ошол замат жаңырат, жаңы APK
керек эмес. Жаңы APK иконка, тиркеменин аты же Android жөндөөлөрү
өзгөргөндө гана чыгарылат.

## Командалар

```bash
cd mobile
npm install
npm run icons   # frontend/public/favicon.svg'ден иконка + splash түзөт
npm run sync    # capacitor.config.ts'ти android/ ичине көчүрөт
npm run open    # Android Studio'до ачат
```

Android Studio'до: **Run ▶** баскычы тиркемени телефонго же эмуляторго орнотот.
Телефонго орнотуу үчүн APK: **Build → Build App Bundle(s) / APK(s) → Build APK(s)**.
Play Market үчүн: **Build → Generate Signed App Bundle / APK → Android App Bundle**.

## Тиркемедей сезилиши үчүн эмне жасалган

Сайттын өзү (frontend) тиркеменин ичинде экенин `AinabiApp` user-agent белгиси
(`capacitor.config.ts` → `appendUserAgent`) боюнча билет — `frontend/src/utils/native.ts`.

- **Артка баскычы** (`@capacitor/app`): адегенде ачык терезени (modal, меню, издөө)
  жабат, андан кийин мурунку бетке кайтат, башкы бетте тиркемени фонго жиберет
  (`frontend/src/components/NativeBackButton.tsx`). Плагинсиз Capacitor бул
  баскычты такыр иштетпейт.
- **Edge-to-edge:** `SystemBars` (Capacitor 8'дин өзөгүндө) — сайт статус-бар жана
  ылдыйкы жаңсоо тилкесинин астына чейин тартылат, `--safe-area-inset-*` менен
  өзүн жылдырат. Статус-бардын иконкалары кара (`style: "LIGHT"`).
- **Тема:** дайыма жарык (`styles.xml`) — сайтта dark mode жок.
- Телефондо сайт: ылдыйкы таб-бар, логотип + бизнестин аты бар header,
  толук экрандуу издөө, модалдар ылдыйдан чыгат (bottom sheet), POS'то калкып
  турган себет тилкеси. Бул браузерде жана iPhone'догу «Экранга кошуу»
  (PWA) режиминде да иштейт.
- Тиркемеде лендинг ачылбайт (дароо кирүү/башкы бет), Google баскычы жашырылат.

`capacitor.config.ts`, плагиндер же `android/` өзгөргөндө: `npm install && npm run sync`,
анан жаңы APK (`versionCode`ду `android/app/build.gradle`'де көтөрүңүз).

## Чектөөлөр

- **Интернет керек.** Байланыш жок болсо `www/offline.html` көрсөтүлөт.
- **Google менен кирүү** WebView ичинде иштебейт (Google тыюу салат), ошондуктан
  тиркемеде баскычы жашырылган. Email + пароль менен кирүү иштейт. Кийин `@capgo/capacitor-social-login`
  сыяктуу нативдик плагин менен чечилет.
- **CSV/Excel жүктөө** (blob шилтемелер) WebView'до азырынча иштебейт,
  нативдик Filesystem/Share плагини менен чечилет.
- `wa.me`, `t.me` сыяктуу тышкы шилтемелер тиешелүү тиркемеде (WhatsApp, Telegram) ачылат.
- `appId` (`site.ainabi.business`) Play Market'ке чыккандан кийин өзгөрбөйт.

## Эскертүү: Gradle 9.1

Android Studio 2026.2 Java 25 менен келет, ал эми Capacitor'дун демейки
Gradle 8.14 версиясы аны колдобойт («Unsupported class file major version 69»).
Ошондуктан `gradle-wrapper.properties` ичинде Gradle 9.1.0 коюлган.
`npx cap add android` кайра иштетилсе, бул сапты кайра 9.1.0'го алмаштырыңыз.
