# Branchefy v0.2.24

## Hotfix robusto player

Causa dello schermo nero (0.2.22–0.2.23): nel **master** HLS le righe nude (varianti qualità) venivano trattate come segmenti opachi. Il player riceveva playlist grezze → chiavi relative e segmenti senza Referer → buffering infinito / nero.

### Cosa cambia

- **Master vs media**: le varianti del master restano playlist riscrivibili; solo i segmenti della media sono opachi
- **Sniff del body**: se arriva `#EXTM3U` si riscrive sempre; se è una chiave AES (16 byte) non si tocca un byte — rete di sicurezza contro le classificazioni sbagliate
- **ID corti** di nuovo (niente ticket lunghi nelle playlist: in 0.2.23 gonfiavano ogni URL segmento)
- **Niente più schermo nero silenzioso**: overlay di errore con messaggio diagnostico + pulsante **Riprova** (rigenera lo stream)
- Auto-retry se gli URL `/remote/…` non esistono più (riavvio app / redeploy)

## Piattaforme

- **Windows**: installer `.exe` con aggiornamento automatico in-app
- **macOS**: `.dmg` universale — tasto destro → Apri alla prima apertura
- **Web**: Vercel da `main` + Railway
