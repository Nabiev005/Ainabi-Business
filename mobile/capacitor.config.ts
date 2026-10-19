import type { CapacitorConfig } from "@capacitor/cli";

// The app is a thin shell around the live site: every web deploy reaches
// users instantly, and auth cookies stay first-party (no CORS changes).
// Change SITE_URL if the production domain changes.
const SITE_URL = "https://ainabi-business.vercel.app";

const config: CapacitorConfig = {
  appId: "site.ainabi.business",
  appName: "Ainabi Business",
  webDir: "www",
  server: {
    url: SITE_URL,
    // Shown when the site can't be reached (no internet).
    errorPath: "offline.html",
  },
  android: {
    backgroundColor: "#0A1638",
  },
};

export default config;
