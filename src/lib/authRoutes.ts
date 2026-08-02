/** Path della landing dopo click sul link di conferma email. */
export const EMAIL_CONFIRMED_PATH = "/auth/email-confirmed";

/** Path della landing dopo click sul link «reimposta password». */
export const RESET_PASSWORD_PATH = "/auth/reset-password";

export function isEmailConfirmedPath(pathname: string): boolean {
  return /^\/auth\/email-confirmed\/?$/.test(pathname);
}

export function isResetPasswordPath(pathname: string): boolean {
  return /^\/auth\/reset-password\/?$/.test(pathname);
}

function originOrBranchefy(): string {
  if (typeof window !== "undefined" && window.location.origin) {
    return window.location.origin;
  }
  return "https://branchefy.it";
}

/** Redirect usato in signUp (deve essere in Supabase → Redirect URLs). */
export function emailConfirmedRedirectUrl(): string {
  return `${originOrBranchefy()}${EMAIL_CONFIRMED_PATH}`;
}

/** Redirect usato in resetPasswordForEmail (deve essere in Supabase → Redirect URLs). */
export function passwordResetRedirectUrl(): string {
  return `${originOrBranchefy()}${RESET_PASSWORD_PATH}`;
}
