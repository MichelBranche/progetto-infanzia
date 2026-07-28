# Branchefy v0.2.27

## Player fluido (stile Netflix)

Chrome controlli rifatto: scrub/volume pointer-DOM, fade CSS, meno re-render React durante drag. Restano hls.js e le feature Branchefy (cast, party, audio). Niente anteprime frame sullo scrub (causa lag).

## RaiPlay

- Riga **In Diretta** in home (dopo Top 10), con palinsesto on-air
- Catalogo RaiPlay (bambini / film / serie / sport) + playback live
- Fix copertine **Rai 4** e **Rai News 24** (`landscape` vuoto → fallback `image`)
- Home: **In Diretta** al posto di «Per te»; «Per te» scende nel catalogo

## Piattaforme

- Web (Vercel) e desktop (Windows / macOS updater) sulla stessa `src/`
