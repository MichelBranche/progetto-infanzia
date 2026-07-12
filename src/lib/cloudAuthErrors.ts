import type { AuthError } from "@supabase/supabase-js";

/** Registrazione ok ma serve conferma email prima del login. */
export class EmailConfirmationRequiredError extends Error {
  readonly email: string;

  constructor(email: string) {
    super(
      "Ti abbiamo inviato un'email di conferma. Apri il link, chiudi quella scheda e torna qui per accedere.",
    );
    this.name = "EmailConfirmationRequiredError";
    this.email = email;
  }
}

function normalizeAuthMessage(message: string): string {
  const lower = message.toLowerCase();

  if (
    lower.includes("email rate limit exceeded") ||
    lower.includes("over_email_send_rate_limit")
  ) {
    return (
      "Limite invio email raggiunto su Supabase (max 2 email/ora con il servizio predefinito). " +
      "Riprova tra circa un'ora oppure chiedi all'amministratore di configurare SMTP personalizzato " +
      "o disattivare la conferma email nel progetto Supabase."
    );
  }

  if (lower.includes("user already registered")) {
    return "Questa email è già registrata. Prova ad accedere o usa «Password dimenticata».";
  }

  if (lower.includes("invalid api key")) {
    return (
      "Chiave Supabase non valida. In .env imposta VITE_SUPABASE_PUBLISHABLE_KEY " +
      "con la anon/public key dal dashboard Supabase (Project Settings → API), poi riavvia npm run dev:browser."
    );
  }

  if (lower.includes("invalid login credentials")) {
    return "Email o password non corretti.";
  }

  if (lower.includes("email not confirmed")) {
    return "Conferma prima l'email (controlla la posta), poi accedi.";
  }

  if (lower.includes("signup requires a valid password")) {
    return "La password non è valida. Usa almeno 6 caratteri.";
  }

  if (lower.includes("unable to validate email address")) {
    return "Indirizzo email non valido.";
  }

  if (lower.includes("for security purposes") && lower.includes("seconds")) {
    return message.replace(
      /for security purposes/i,
      "Per sicurezza",
    );
  }

  return message;
}

export function mapSupabaseAuthError(error: AuthError | Error): Error {
  if (error instanceof EmailConfirmationRequiredError) return error;
  return new Error(normalizeAuthMessage(error.message));
}
