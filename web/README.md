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

**Consigliato (root del repo):** stesso `src/` della desktop.

```bash
# dalla root progetto-infanzia
cp .env.example .env
npm run dev:browser   # → http://localhost:5173
```

In alternativa, solo dal folder `web/`:

```bash
cd web
npm run dev:api    # terminale 1 — API Rust :8787
npm run dev        # terminale 2 — Vite :5173 (legge ../src)
```

Il build **non copia più** `src/` in `web/app-src`: Vite compila direttamente dalla root del repo.

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

## Deploy API Rust (Railway)

Railway deve eseguire il **binario Rust**, non il frontend (`web/`).

### Setup (una tantum)

1. Crea progetto Railway dal repo GitHub
2. **Settings → Build**:
   - Builder: **Dockerfile**
   - Dockerfile path: `web/server/Dockerfile`
3. **Variables**:
   ```
   BRANCHEFY_DATA_DIR=/data
   PORT=8787
   BRANCHEFY_PUBLIC_URL=https://TUO-SERVIZIO.up.railway.app
   ```
4. Aggiungi un **Volume** montato su `/data`
5. **Networking** → Generate Domain

### Verifica

`https://TUO-SERVIZIO.up.railway.app/health` deve rispondere JSON:

```json
{"ok":true,"service":"branchefy-web-api"}
```

Se vedi la **UI Branchefy** su `/health`, Railway sta deployando il frontend per errore.
Vai in Settings → Build → imposta **Dockerfile** (`web/server/Dockerfile`) e redeploy.

Il file `railway.toml` in root forza già questo build.

### Deploy da CLI (opzionale)


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

## Supabase Auth — registrazione email

Se la registrazione risponde **«email rate limit exceeded»**, il progetto Supabase ha esaurito il limite del **servizio email integrato** (circa **2 email/ora** per tutto il progetto).

### Soluzione rapida (consigliata per beta)

1. Supabase Dashboard → **Authentication** → **Providers** → **Email**
2. Disattiva **Confirm email**
3. Salva

Gli utenti possono registrarsi subito senza email di conferma.

### Soluzione produzione

1. Configura **SMTP personalizzato** (es. [Resend](https://resend.com/docs/send-with-supabase-smtp)):
   - Host: `smtp.resend.com`
   - Porta: `465` (SSL) o `587` (TLS)
   - User: `resend`
   - Password: API key Resend (`re_...`)
2. **Authentication** → **Rate Limits** → aumenta **Email sent** (es. 30–100/ora)

Dopo la configurazione SMTP, il limite email diventa modificabile dal dashboard.

### Landing conferma email

Dopo la registrazione, il link nell'email apre una pagina dedicata (non l'app intera):

- URL: `https://branchefy.it/auth/email-confirmed`
- Aggiungi in **Authentication → URL Configuration → Redirect URLs**:
  - `https://branchefy.it/auth/email-confirmed`
  - `http://localhost:5173/auth/email-confirmed` (sviluppo locale)

La pagina conferma l'account e invita l'utente a chiudere la scheda e accedere dall'app.
