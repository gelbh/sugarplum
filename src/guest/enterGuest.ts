import { enterGuest } from "./session";
import { ensureGuestStore } from "./store";

/**
 * Start a local-only guest session and go to Today.
 * Logs out any existing cookie session first so guest and account never dual-run.
 */
export function continueAsGuest(): void {
  void (async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      /* offline / already logged out */
    }
    enterGuest();
    ensureGuestStore();
    window.location.assign("/today");
  })();
}
