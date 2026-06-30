export function getSupabaseKey(): string | undefined {
  const publishable = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  return publishable || anon;
}

export function isCloudEnabled(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const key = getSupabaseKey();
  return Boolean(url && key && url.startsWith("http"));
}

export function cloudConfigHint(): string {
  return "Configura VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (vedi .env.example).";
}
