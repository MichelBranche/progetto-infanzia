import type { EmailOtpType } from "@supabase/supabase-js";
import { getSupabase } from "./supabaseClient";
import { RESET_PASSWORD_PATH } from "./authRoutes";

export type PasswordRecoveryResult =
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

function cleanRecoveryUrl(): void {
  window.history.replaceState({}, "", RESET_PASSWORD_PATH);
}

/**
 * Completa la sessione di recovery dal link email Supabase
 * e la lascia attiva così l'utente può impostare la nuova password.
 */
export async function completePasswordRecoveryFromUrl(): Promise<PasswordRecoveryResult> {
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
    cleanRecoveryUrl();
    return { ok: true };
  }

  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : "";
  const hashParams = new URLSearchParams(hash);
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");
  const type = hashParams.get("type");
  if (accessToken && refreshToken) {
    if (type && type !== "recovery") {
      return {
        ok: false,
        message: "Questo link non è per il reset della password.",
      };
    }
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) return { ok: false, message: error.message };
    cleanRecoveryUrl();
    return { ok: true };
  }

  const tokenHash = url.searchParams.get("token_hash");
  const otpType = url.searchParams.get("type");
  if (tokenHash && otpType) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType as EmailOtpType,
    });
    if (error) return { ok: false, message: error.message };
    cleanRecoveryUrl();
    return { ok: true };
  }

  // Sessione già presente (refresh / HMR).
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    return { ok: true };
  }

  return {
    ok: false,
    message: "Link non valido, scaduto o già utilizzato. Richiedi un nuovo reset.",
  };
}
