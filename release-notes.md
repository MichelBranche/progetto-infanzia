# Branchefy v0.2.16

## Fix release desktop

- **macOS universal build**: i bin di sviluppo (`export-sc-catalog-seed`, web-api) non vengono più inclusi nel bundle Tauri. Prima il bundler cercava `export-sc-catalog-seed` nel target universal e falliva.

## Da v0.2.15 (inclusa)

- Performance home/boot, Top 10 Streaming Community, libro manga 3D su desktop

## Piattaforme

- **Windows**: aggiornamento automatico in-app dalla release GitHub
- **Web app**: deploy su Vercel — ricarica quando compare il banner aggiornamento
- **macOS**: scarica il nuovo `.dmg` dalla release GitHub
