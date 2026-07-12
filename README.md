# Branchefy

App **desktop (Tauri)** e **web (Vercel)** condividono lo stesso frontend: `src/`, `index.html`, `public/`.

> **Regola d’oro:** modifica solo `src/` nella root. Desktop e web ricevono le stesse UI automaticamente.

## Sviluppo in browser (consigliato per UI)

```bash
cp .env.example .env   # chiavi Supabase (una tantum)
npm install
npm run dev:browser    # → http://localhost:5173
```

Stesso codice che va su `branchefy.it`, con API Rust locale.

## Sviluppo desktop

```bash
npm run tauri dev      # finestra nativa, porta 1420
```

Puoi tenere **entrambi** aperti: browser su `5173`, Tauri su `1420`.

## Deploy web

```bash
npm run build:web      # build Vercel (stesso src/)
```

Push su `main` → Vercel deploya da `web/client/vite.config.ts` che punta alla root.

## Cosa resta solo desktop

| Feature | Desktop | Web |
|---------|---------|-----|
| Catalogo streaming, auth, chat | ✅ | ✅ |
| Profili SQLite | ✅ | ✅ (via API) |
| Cartella film locale | ✅ | ❌ |
| Cast DLNA | ✅ | ❌ |
| Watch party LAN | ✅ | ❌ |

Per nuove feature UI usa `runtimeInvoke` / `usesBackendApi()` così funzionano su entrambi quando il backend lo supporta.

Vedi anche `.cursor/rules/branchefy-parity.mdc` e [web/README.md](web/README.md).
