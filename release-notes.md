# Branchefy v0.2.21

## Hotfix critico player

- **Chiavi AES HLS**: in 0.2.19/0.2.20 le chiavi di decrittazione venivano riscritte come se fossero playlist m3u8 → body corrotto, buffering infinito, film che non partiva mai
- Ora le chiavi restano proxate (Referer ok) ma **opache** (binarie), come in 0.2.18
- Segmenti e playlist restano sul proxy locale

## Piattaforme

- **Windows**: installer `.exe` con aggiornamento automatico in-app
- **macOS**: `.dmg` universale (Intel + Apple Silicon) — tasto destro → Apri alla prima apertura
- **Web app**: deploy automatico su Vercel da `main` + redeploy Railway obbligatorio
