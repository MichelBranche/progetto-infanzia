# Branchefy Web (Vercel)

Versione web **1:1** con l'app desktop: riusa lo stesso codice React in `../src` e delega i comandi Tauri a un server API Rust.

## Architettura

```
Browser (Vercel)          API Rust (Fly/Railway/Docker)
     │                              │
     ├─ React UI (../src)             ├─ catalogo / streaming
     ├─ Supabase (auth, chat)         ├─ profili locali SQLite
     └─ POST /api/invoke ──proxy──►   └─ stesso codice di src-tauri
```

- **Vercel**: frontend statico + funzione `api/invoke.ts` che inoltra a `BRANCHEFY_API_URL`
- **Server Rust**: binario `branchefy-web-api` (catalogo, playback, profili, impostazioni)

## Sviluppo locale

Terminale 1 — API Rust:

```bash
cd web
npm run dev:api
```

Terminale 2 — frontend:

```bash
cd web
cp .env.example .env
# compila VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY
npm install
npm run dev
```

Apri http://localhost:5173. Le chiamate `runtimeInvoke` vanno a `http://127.0.0.1:8787/api/invoke` tramite proxy Vite.

## Deploy Vercel

1. Crea un progetto Vercel collegato al repo GitHub
2. **Root Directory** = vuoto (root del repo, **non** `web`)
3. **Framework Preset** = `Other`
4. Verifica in **Settings → General** (oppure usa `vercel.json` in root):
   - Install Command: `npm install --prefix web`
   - Build Command: `npm run build --prefix web`
   - Output Directory: `web/dist`
   - Node.js Version: `22.x`
5. Variabili ambiente:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_BRANCHEFY_WEB=1`
   - `BRANCHEFY_API_URL` (URL pubblico del server Rust)
3. Deploy

## Deploy API Rust (es. Fly.io)

Dalla **root del repository**:

```bash
fly launch --config fly.web-api.toml --no-deploy
fly volumes create branchefy_data --region fra --size 1 -a branchefy-web-api
fly deploy --config fly.web-api.toml
```

Imposta `BRANCHEFY_API_URL` su Vercel all'URL Railway (es. `https://branchefy-web-api.fly.dev`).

Su Railway aggiungi anche:

```
BRANCHEFY_PUBLIC_URL=https://TUO-URL-RAILWAY.up.railway.app
```

Senza questa variabile, copertine e streaming puntano a `127.0.0.1` e non funzionano nel browser.

## Limitazioni rispetto al desktop

| Funzione | Web | Desktop |
|----------|-----|---------|
| Catalogo / streaming | Sì (via API) | Sì |
| Auth, amici, chat cloud | Sì | Sì |
| Watch party cloud | Sì | Sì |
| Libreria media locale | No | Sì |
| Cast / DLNA | No | Sì |
| Watch party LAN | No | Sì |
| Aggiornamenti automatici | No | Sì |
