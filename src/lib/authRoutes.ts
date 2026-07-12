/** Path della landing dopo click sul link di conferma email. */
export const EMAIL_CONFIRMED_PATH = "/auth/email-confirmed";

export function isEmailConfirmedPath(pathname: string): boolean {
  return /^\/auth\/email-confirmed\/?$/.test(pathname);
}

/** Redirect usato in signUp (deve essere in Supabase → Redirect URLs). */
export function emailConfirmedRedirectUrl(): string {
  if (typeof window !== "undefined" && window.location.origin) {
    return `${window.location.origin}${EMAIL_CONFIRMED_PATH}`;
  }
  return `https://branchefy.it${EMAIL_CONFIRMED_PATH}`;
}
