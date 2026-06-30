import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseKey, isCloudEnabled } from "./cloudConfig";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isCloudEnabled()) return null;
  if (!client) {
    client = createClient(
      import.meta.env.VITE_SUPABASE_URL!,
      getSupabaseKey()!,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      },
    );
  }
  return client;
}
