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

## RaiPlay

Catalogo free da `www.raiplay.it` (prefix `raiplay`), playback HLS via relinker.

| Sezione app | Sorgente RaiPlay |
|-------------|------------------|
| **Cartoni** | `/tipologia/bambini/index.json` |
| **Film** | `/tipologia/film/index.json` |
| **Serie TV** | `/tipologia/serieitaliane` + `serieinternazionali` |
| **Home · In diretta** | `/dirette` + `/palinsesto/onAir.json` |

- **Desktop (IP Italia):** playback free non-DRM supportato.
- **Web (Railway):** catalogo sfogliabile; lo stream può fallire se l’egress API non è in Italia (geo-block). Messaggio esplicito in app.
- Titoli **DRM** vengono saltati / rifiutati (niente Widevine).
- Provider filtro browse: **RaiPlay** (anche Film/Serie).

## Checklist ops v1.0 (produzione)

Verificato dal repo (2026-08):

| Check | Stato |
|-------|--------|
| Railway `/health` | OK — `branchefy-web-api` risponde |
| Redirect auth in codice | `/auth/email-confirmed`, `/auth/reset-password` |
| Migration donor in repo | `supabase/migrations/20260801140000_donors.sql` + `..._donor_claims.sql` |

Da confermare **nel dashboard** prima/dopo il tag 1.0.0:

1. Supabase → SQL: migration donor (+ ban) applicate
2. Supabase → **SMTP personalizzato** (obbligatorio in produzione; vedi sotto)
3. Supabase → Redirect URLs (lista sotto)
4. Vercel env: `VITE_SUPABASE_*`, `BRANCHEFY_API_URL`, `SUPABASE_SERVICE_ROLE_KEY`
5. Railway: volume su `/data` ancora montato

## Supabase Auth — registrazione email

### Blocco email temporanee

1. Applica la migration `supabase/migrations/20260808150000_block_disposable_emails.sql`
2. Dashboard → **Authentication → Hooks → Before User Created**
   - Type: **Postgres Function**
   - Schema: `public`
   - Function: `hook_prevent_disposable_email`

Senza l’hook, resta solo il controllo lato app (aggirabile). Con l’hook la registrazione viene rifiutata anche via API.

Lista domini: ~8200 da [disposable-email-domains](https://github.com/disposable-email-domains/disposable-email-domains). Rigenera con `npm run emails:disposable-sync` dopo aver scaricato il `.conf`.

Se la registrazione risponde **«email rate limit exceeded»**, il progetto Supabase ha esaurito il limite del **servizio email integrato** (circa **2 email/ora** per tutto il progetto).

### Produzione (v1.0)

1. Configura **SMTP personalizzato** (es. [Resend](https://resend.com/docs/send-with-supabase-smtp)):
   - Host: `smtp.resend.com`
   - Porta: `465` (SSL) o `587` (TLS)
   - User: `resend`
   - Password: API key Resend (`re_...`)
2. **Authentication** → **Rate Limits** → aumenta **Email sent** (es. 30–100/ora)
3. Lascia **Confirm email** attivo se usi SMTP (consigliato)

Dopo la configurazione SMTP, il limite email diventa modificabile dal dashboard.

### Solo emergenza / lab locale

Disattivare Confirm email evita l’invio mail ma non è adatto a produzione pubblica.

### Landing conferma email / reset password

I link nelle email aprono pagine dedicate (non l'app intera):

- Conferma: `https://branchefy.it/auth/email-confirmed`
- Reset password: `https://branchefy.it/auth/reset-password`

Aggiungi in **Authentication → URL Configuration → Redirect URLs**:
- `https://branchefy.it/auth/email-confirmed`
- `https://branchefy.it/auth/reset-password`
- `http://localhost:5173/auth/email-confirmed` (sviluppo locale)
- `http://localhost:5173/auth/reset-password` (sviluppo locale)

La conferma invita a chiudere la scheda e accedere dall'app. Il reset lascia scegliere la nuova password e poi accedere di nuovo.
