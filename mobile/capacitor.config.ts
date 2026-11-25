import type { CapacitorConfig } from "@capacitor/cli";

// The app is a thin shell around the live site: every web deploy reaches
// users instantly, and auth cookies stay first-party (no CORS changes).
// Change SITE_URL if the production domain changes.
const SITE_URL = "https://business.ainabi.site";

const config: CapacitorConfig = {
  appId: "site.ainabi.business",
  appName: "Ainabi Business",
  webDir: "www",
  server: {
    url: SITE_URL,
    // Shown when the site can't be reached (no internet).
    errorPath: "offline.html",
  },
  // Lets the site tell it runs inside the app (frontend/src/utils/native.ts).
  appendUserAgent: "AinabiApp",
  android: {
    // Matches the site's loading screen, so the hand-off from the navy
    // launch splash to the page has no white flash.
    backgroundColor: "#F6F7FB",
  },
  plugins: {
    SystemBars: {
      // Draw edge-to-edge; the site pads itself with --safe-area-inset-*.
      insetsHandling: "css",
      initialViewportFitValueHint: "cover",
      // Dark status-bar icons over the site's white header.
      style: "LIGHT",
    },
  },
};

export default config;
