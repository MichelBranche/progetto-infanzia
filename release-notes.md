## Messaggi e social

- Nuova pagina **Messaggi**: chat private tra amici, **gruppi** e chat delle **watch party** cloud
- **Profilo amico**: tocca un amico cloud per vedere foto, stato e codice; pulsante per aprire la chat
- Notifica popup + suono per **nuovi messaggi** e **nuove richieste di amicizia**
- Chat integrata nel pannello Guarda insieme (stanze online)

## Area dev

- Foto profilo visibili nella lista utenti, nel dettaglio e tra gli amici annidati

## Note Supabase

Esegui l'aggiornamento SQL in `supabase/schema.sql` se non già fatto:

- Tabelle chat (`chat_conversations`, `chat_members`, `chat_messages`, …)
- RPC chat (`open_direct_chat`, `create_group_chat`, `ensure_watch_party_chat`, `list_my_chats`, …)
- `avatar_url` in `dev_users_overview`
- Realtime su `chat_messages`

## Piattaforme

- **Windows**: aggiornamento automatico in-app
- **macOS**: scarica il `.dmg` dalla release (tasto destro → Apri alla prima apertura)
