# Branchefy v0.2.19

## Novità

- **Locandine più affidabili**: poster Streaming Community via proxy (locale/Railway) con fallback multi-CDN — meno casi di app ok ma immagini vuote
- **Cover manga via proxy**: le cover MangaDex usano lo stesso schema (`/mangadex-cover`), con retry automatico
- **Player più fluido**: avvio overlay coerente, prefetch al Play, scrub/preview più stabili, HLS più resiliente
- **Proxy segmenti HLS**: senza VPN solo playlist/chiavi passano dal proxy; i segmenti restano sul CDN
- **Aurora**: in home più soft sotto la locandina; fuori dalla home a 60 fps
- **Audio ambient**: mini-player YouTube solo audio dal caricamento catalogo (volume 50%, da 0,10s), poi sticky in app
- **macOS**: updater in-app disabilitato, percorsi HOME, Info.plist rete locale, fullscreen WebKit, bind stream soft-fail

## Piattaforme

- **Windows**: installer `.exe` con aggiornamento automatico in-app
- **macOS**: `.dmg` universale (Intel + Apple Silicon) — tasto destro → Apri alla prima apertura
- **Web app**: deploy automatico su Vercel da `main`
