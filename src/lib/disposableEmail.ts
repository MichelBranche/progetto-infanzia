import { DISPOSABLE_EMAIL_DOMAINS } from "../data/disposableEmailDomains";

export const DISPOSABLE_EMAIL_MESSAGE =
  "L'uso di email temporanee non è tollerato, bro non sei furbo.";

function emailDomain(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return null;
  const domain = trimmed.slice(at + 1).replace(/^\.+|\.+$/g, "");
  return domain.includes(".") ? domain : null;
}

/** True se il dominio (o un parent) è nella blocklist disposable. */
export function isDisposableEmail(email: string): boolean {
  let domain = emailDomain(email);
  if (!domain) return false;

  while (domain) {
    if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) return true;
    const dot = domain.indexOf(".");
    if (dot === -1) break;
    domain = domain.slice(dot + 1);
  }
  return false;
}
