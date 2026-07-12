## Novità

- **Guida web app mobile** (`/web-app`): installazione PWA su iPhone, iPad e Android con video tutorial e mockup
- **Card promo piattaforma** in homepage: su mobile invita all'app desktop, su desktop alla web app mobile
- **Foto cast automatiche** su scheda titolo (TMDB + fallback Wikipedia)
- **Proxy immagini CDN** (`/sc-image`) per poster e palette colori in browser senza errori CORS
- **Conferma email** pagina dedicata dopo registrazione Supabase
- **Dev browser** (`npm run dev:browser`): API locale + proxy Vite per sviluppo web senza Tauri

## Miglioramenti

- Web app responsive su telefono e tablet con navigazione touch-first
- Card promo stile liquid glass con mockup fotorealistici (iPhone, iPad, MacBook)
- Palette hero e immagini più affidabili in modalità browser
- Backend web: invocazioni più tolleranti su errori TMDB e palette
- Template email Supabase (conferma, reset password, cambio email)

## Correzioni

- Fix build release macOS: il binario API web non viene più compilato nella build desktop
- Fix crash `SparkleActionButton` su scheda titolo
- Fix CORS e 404 su immagini `cdn.streamingcommunityz.tech` in browser
- Fix schermo nero card promo su Tauri (disabilitato `backdrop-filter` in WebView2)
- Fix join watch party e presenza amici (commit precedenti inclusi in questa release)

## Piattaforme

- **Windows**: aggiornamento automatico in-app
- **macOS**: installazione da `.dmg` universale (Intel + Apple Silicon)
