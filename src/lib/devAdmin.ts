export const DEV_ADMIN_EMAIL = "yutubecraft1234@gmail.com";

export function isDevAdminEmail(email?: string | null): boolean {
  return email?.trim().toLowerCase() === DEV_ADMIN_EMAIL.toLowerCase();
}
