## Novità

- **Accesso ospite o account**: al primo avvio puoi registrarti oppure usare l'app come ospite (limite di 2 ore di riproduzione al giorno)
- **Feedback in-app**: invia bug, idee e richieste dalla sezione Supporto
- **Invita amici**: nuovo pulsante nella sidebar che apre la pagina GitHub per scaricare Branchefy e copia il link
- **Codice amico**: aggiungi amici cloud con il loro codice amico invece dell'email
- **Logout**: esci dall'account dal menu profilo in alto a destra (richiede nuovo accesso)
- **Lingua audio preferita**: il player rispetta la preferenza impostata (automatica, IT, EN, JA, ecc.)
- **Sidebar**: icone al posto dei numeri quando espansa

## Miglioramenti

- Fix click sulle card durante lo scroll orizzontale nelle righe del catalogo
- Console sviluppatore: gestione feedback (inbox, risolti, cestino con eliminazione dopo 30 giorni)

## Supabase (self-hosted)

Se usi il backend cloud, applica le migrazioni in `supabase/schema.sql` (tabella `app_feedback`, `lookup_friend_by_code`, ecc.).
