// Bridge to the Android app (mobile/, a Capacitor shell that loads this site).
// Everything here is a no-op in a normal browser.

declare global {
  interface Window {
    Capacitor?: { isNativePlatform?: () => boolean };
  }
}

/** Running inside the Ainabi Business app (not a browser tab)? */
export function isNativeApp(): boolean {
  // The user-agent marker comes from mobile/capacitor.config.ts (appendUserAgent)
  // and is there even before Capacitor's bridge script has run.
  return !!window.Capacitor?.isNativePlatform?.() || navigator.userAgent.includes("AinabiApp");
}

type BackHandler = () => void;

/** Open overlays (modals, drawers, the mobile menu), most recent last. */
const backHandlers: BackHandler[] = [];

/** Lets the Android back button close an overlay instead of leaving the page. */
export function pushBackHandler(handler: BackHandler): () => void {
  backHandlers.push(handler);
  return () => {
    const i = backHandlers.lastIndexOf(handler);
    if (i >= 0) backHandlers.splice(i, 1);
  };
}

/** Closes the topmost overlay; false when nothing was open. */
export function runBackHandler(): boolean {
  const top = backHandlers[backHandlers.length - 1];
  if (!top) return false;
  top();
  return true;
}
