import type { User } from "@supabase/supabase-js";
import { cloudConfigHint } from "./cloudConfig";
import { getSupabase } from "./supabaseClient";
import type { CloudProfile } from "../types/cloud";
import { emailConfirmedRedirectUrl } from "./authRoutes";
import {
  EmailConfirmationRequiredError,
  mapSupabaseAuthError,
} from "./cloudAuthErrors";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}

function mapProfile(row: {
  id: string;
  email: string;
  display_name: string;
  friend_code: string;
  avatar_url?: string | null;
  created_at: string;
}): CloudProfile {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    friendCode: row.friend_code,
    avatarUrl: row.avatar_url ?? undefined,
    createdAt: row.created_at,
  };
}

export async function ensureCloudProfile(user: User): Promise<CloudProfile> {
  const supabase = getSupabase();
  if (!supabase) throw new Error(cloudConfigHint());

  const { data: existing } = await supabase
    .from("cloud_profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (existing) return mapProfile(existing);

  const email = user.email ?? "";
  const displayName =
    (user.user_metadata?.display_name as string | undefined) ??
    email.split("@")[0] ??
    "Utente";

  for (let attempt = 0; attempt < 8; attempt++) {
    const friendCode = randomCode(8);
    const { data, error } = await supabase
      .from("cloud_profiles")
      .insert({
        id: user.id,
        email,
        display_name: displayName,
        friend_code: friendCode,
      })
      .select("*")
      .single();

    if (!error && data) return mapProfile(data);
    if (error && !error.message.includes("friend_code")) {
      throw new Error(error.message);
    }
  }

  throw new Error("Impossibile creare il profilo cloud");
}

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName?: string,
): Promise<CloudProfile> {
  const supabase = getSupabase();
  if (!supabase) throw new Error(cloudConfigHint());

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      emailRedirectTo: emailConfirmedRedirectUrl(),
      data: { display_name: displayName?.trim() || email.split("@")[0] },
    },
  });

  if (error) throw mapSupabaseAuthError(error);
  if (!data.user) throw new Error("Registrazione non completata");

  if (!data.session) {
    throw new EmailConfirmationRequiredError(email.trim());
  }

  return ensureCloudProfile(data.user);
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<CloudProfile> {
  const supabase = getSupabase();
  if (!supabase) throw new Error(cloudConfigHint());

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) throw mapSupabaseAuthError(error);
  if (!data.user) throw new Error("Accesso non riuscito");

  return ensureCloudProfile(data.user);
}

export async function signOutCloud(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getCurrentCloudProfile(): Promise<CloudProfile | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return null;

  const { data } = await supabase
    .from("cloud_profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!data) {
    try {
      return await ensureCloudProfile(user);
    } catch {
      return null;
    }
  }

  return mapProfile(data);
}

export async function updateCloudDisplayName(
  displayName: string,
): Promise<CloudProfile> {
  const supabase = getSupabase();
  if (!supabase) throw new Error(cloudConfigHint());

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) throw new Error("Non autenticato");

  const { data, error } = await supabase
    .from("cloud_profiles")
    .update({ display_name: displayName.trim() })
    .eq("id", userId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return mapProfile(data);
}
