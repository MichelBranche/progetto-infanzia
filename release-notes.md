# Branchefy v0.2.23

## Hotfix critico player

- **Proxy HLS stateless**: gli URL `/remote/…` sono ticket firmati, non ID solo in memoria. Dopo un redeploy Railway (o con più repliche) i film non restano più bloccati su 404 / buffering infinito
- **Schermata di avvio**: si spegne su `canplay` (non solo su `playing`), con fallback autoplay muted e timeout di sicurezza
- Cache stream SC più corta (90s) + timeout resolve 45s
- Chiavi AES restano opache (fix 0.2.22)

## Piattaforme

- **Windows**: installer `.exe` con aggiornamento automatico in-app
- **macOS**: `.dmg` universale (Intel + Apple Silicon) — tasto destro → Apri alla prima apertura
- **Web app**: deploy automatico su Vercel da `main` + redeploy Railway obbligatorio
