# Branchefy v0.2.18

## Novità

- **Streaming Community auto-discovery**: l’app trova da sola il mirror attivo (lista Branchefy online + community + redirect), senza dover rilasciare ogni volta che SC cambia dominio
- **Lista mirror aggiornabile**: `sc-mirrors.json` su `branchefy.it` / GitHub — aggiornabile con un push, senza nuova build desktop
- **Fallback server per tutti**: se SC non risponde dall’IP di casa, i comandi SC ripiegano automaticamente sul server Railway (come la web app)
- **Più mirror hardcoded** di emergenza (`.gives`, `.buzz`, `.space`, `.ceo`, `.lat`, `.ltd`, …)

## Piattaforme

- **Windows**: installer `.exe` con aggiornamento automatico in-app
- **macOS**: `.dmg` universale (Intel + Apple Silicon) — tasto destro → Apri alla prima apertura
- **Web app**: deploy automatico su Vercel da `main`
