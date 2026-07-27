# Branchefy v0.2.20

## Hotfix

- **Player**: ripristinato il proxy HLS completo (playlist + segmenti). In 0.2.19 i segmenti andavano diretti al CDN senza Referer → caricamento infinito e film che non partiva
- **Locandine / loghi SC**: proxy su schede titolo e schermata di avvio player; su desktop le immagini usano Railway per primi (il bind locale :17890 poteva fallire in silenzio)
- **CDN immagini**: ordine fallback più robusto (CDN noti prima di mirror sticky)

## Piattaforme

- **Windows**: installer `.exe` con aggiornamento automatico in-app
- **macOS**: `.dmg` universale (Intel + Apple Silicon) — tasto destro → Apri alla prima apertura
- **Web app**: deploy automatico su Vercel da `main`
