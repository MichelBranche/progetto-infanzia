import type { EmailOtpType } from "@supabase/supabase-js";
import { getSupabase } from "./supabaseClient";
import { EMAIL_CONFIRMED_PATH } from "./authRoutes";

export type EmailConfirmationResult =
  | { ok: true }
  | { ok: false; message: string };

function decodeAuthError(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

function readUrlAuthError(url: URL): string | null {
  const queryError =
    url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (queryError) return decodeAuthError(queryError);

  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : "";
  if (!hash) return null;

  const hashParams = new URLSearchParams(hash);
  const hashError =
    hashParams.get("error_description") ?? hashParams.get("error");
  return hashError ? decodeAuthError(hashError) : null;
}

function cleanConfirmationUrl(): void {
  window.history.replaceState({}, "", EMAIL_CONFIRMED_PATH);
}

/**
 * Completa la conferma email dal link Supabase, poi esce dalla sessione
 * così l'utente torna all'app e accede manualmente.
 */
export async function completeEmailConfirmationFromUrl(): Promise<EmailConfirmationResult> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, message: "Servizio non configurato." };
  }

  const url = new URL(window.location.href);
  const authError = readUrlAuthError(url);
  if (authError) {
    return { ok: false, message: authError };
  }

  const code = url.searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return { ok: false, message: error.message };
    await supabase.auth.signOut();
    cleanConfirmationUrl();
    return { ok: true };
  }

  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : "";
  const hashParams = new URLSearchParams(hash);
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) return { ok: false, message: error.message };
    await supabase.auth.signOut();
    cleanConfirmationUrl();
    return { ok: true };
  }

  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
    if (error) return { ok: false, message: error.message };
    await supabase.auth.signOut();
    cleanConfirmationUrl();
    return { ok: true };
  }

  return {
    ok: false,
    message: "Link non valido, scaduto o già utilizzato.",
  };
}
