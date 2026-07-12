export function getSupabaseKey(): string | undefined {
  const publishable = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  const key = publishable || anon;
  if (!key || isPlaceholderSupabaseKey(key)) return undefined;
  return key;
}

function isPlaceholderSupabaseKey(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    lower === "your-publishable-key" ||
    lower === "your-anon-key" ||
    lower === "eyj..." ||
    lower.includes("xxxx") ||
    lower.includes("your-project")
  );
}

export function isCloudEnabled(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const key = getSupabaseKey();
  return Boolean(url && key && url.startsWith("http"));
}

export function cloudConfigHint(): string {
  const rawKey =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  const rawUrl = import.meta.env.VITE_SUPABASE_URL?.trim();

  if (!rawUrl || rawUrl.includes("your-project")) {
    return "In .env imposta VITE_SUPABASE_URL (es. https://ttpirqkqaoyptxmsbvif.supabase.co), poi riavvia npm run dev:browser.";
  }

  if (!rawKey) {
    return "In .env aggiungi VITE_SUPABASE_PUBLISHABLE_KEY. Supabase → Project Settings → API Keys → Publishable key (sb_publishable_...) oppure anon (eyJ...). Poi riavvia npm run dev:browser.";
  }

  if (isPlaceholderSupabaseKey(rawKey)) {
    return "In .env hai ancora il placeholder your-publishable-key. Copia la Publishable key da Supabase → Settings → API Keys, poi riavvia npm run dev:browser.";
  }

  return "Chiave Supabase non riconosciuta in .env. Usa la anon/public key dal dashboard Supabase, poi riavvia npm run dev:browser.";
}
