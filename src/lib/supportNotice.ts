/** Campagna: cambia l’id per mostrare di nuovo l’avviso dopo un dismiss. */
export const SUPPORT_NOTICE_ID = "support-costs-2026-08";

const DISMISS_KEY = `branchefy-support-notice-dismissed:${SUPPORT_NOTICE_ID}`;

/**
 * Link donazione. Priorità: env `VITE_BRANCHEFY_DONATE_URL`, poi fallback sotto.
 * Aggiorna il fallback prima della release se non usi l’env.
 */
const DONATE_URL_FALLBACK = "https://paypal.me/Cotechinoh";

export function supportDonateUrl(): string {
  const fromEnv = import.meta.env.VITE_BRANCHEFY_DONATE_URL?.trim();
  if (fromEnv) return fromEnv;
  return DONATE_URL_FALLBACK.trim();
}

export function isSupportNoticeDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissSupportNotice(): void {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // ignore
  }
}
