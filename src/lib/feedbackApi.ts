import { getSupabase } from "./supabaseClient";
import { isCloudEnabled } from "./cloudConfig";
import type { SubmitFeedbackInput } from "../types/feedback";

export function detectPlatform(): string {
  const ua = navigator.userAgent;
  if (ua.includes("Win")) return "windows";
  if (ua.includes("Mac")) return "macos";
  if (ua.includes("Linux")) return "linux";
  return "unknown";
}

export async function submitAppFeedback(
  input: SubmitFeedbackInput,
): Promise<void> {
  if (!isCloudEnabled()) {
    throw new Error(
      "Il cloud non è configurato. Contatta lo sviluppatore via email.",
    );
  }

  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Impossibile connettersi al servizio cloud.");
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const sessionUserId = sessionData.session?.user?.id;
  if (!sessionUserId) {
    throw new Error(
      "Accedi al tuo account cloud dalle Impostazioni per inviare feedback.",
    );
  }

  const message = input.message.trim();
  if (message.length < 10) {
    throw new Error("Scrivi almeno 10 caratteri nella descrizione.");
  }

  const subject = input.subject?.trim() || null;
  if (input.type === "title" && !subject) {
    throw new Error("Indica il titolo che vorresti aggiungere.");
  }

  const { error } = await supabase.from("app_feedback").insert({
    user_id: sessionUserId,
    profile_name: input.profileName.trim() || "Profilo",
    profile_role: input.profileRole,
    feedback_type: input.type,
    subject,
    message,
    context_json: input.context,
    app_version: input.context.appVersion,
    platform: input.context.platform,
  });

  if (error) {
    if (error.message.includes("app_feedback")) {
      throw new Error(
        "Il servizio feedback non è ancora attivo. Riprova più tardi.",
      );
    }
    throw new Error(error.message);
  }
}
