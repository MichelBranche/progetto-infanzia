# Branchefy v0.2.22

## Hotfix critico player

- **Chiavi AES VixCloud**: spesso stanno sotto `/playlist/…?type=key` — in 0.2.21 venivano ancora trattate come m3u8 → chiave corrotta, caricamento infinito
- Ora `#EXT-X-KEY` / `SESSION-KEY` / `MAP` e `type=key` sono sempre **opachi** (binari), anche se il path contiene `/playlist/`
- Segmenti e playlist restano sul proxy locale

## Piattaforme

- **Windows**: installer `.exe` con aggiornamento automatico in-app
- **macOS**: `.dmg` universale (Intel + Apple Silicon) — tasto destro → Apri alla prima apertura
- **Web app**: deploy automatico su Vercel da `main` + redeploy Railway obbligatorio
