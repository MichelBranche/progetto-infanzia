# Branchefy v1.2.0

## Novità

- Blocco **email temporanee** in registrazione (messaggio chiaro in app + hook Supabase)
- Desktop **autonomo dalla web**: mirror SC e immagini locali, Railway solo opzionale
- Autoplay serie: a fine stagione continua automaticamente con la successiva
- Titoli SC «Prossimamente» si sbloccano da soli quando diventano disponibili

## Migliorie

- Worker in background che ricontrolla i titoli ancora non riproducibili
- Cache meta più corta sui «Prossimamente» e refresh in scheda titolo
- `sc-mirrors.json` incluso nel binario desktop

## Note

- Su Supabase: migration disposable email + hook **Before User Created** → `hook_prevent_disposable_email`
- Web e desktop sulla stessa versione
