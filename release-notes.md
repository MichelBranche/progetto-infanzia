## Console sviluppatore

- **Versione app** e **piattaforma** visibili per ogni utente cloud (heartbeat presenza + fallback feedback)
- **Elimina account**: rimuove utente auth, profilo e dati collegati (solo dev admin)

## Watch party

- Fix RLS: risolta ricorsione infinita tra policy `watch_party_rooms` e `watch_party_members` che bloccava la creazione stanze

## Note

- Esegui l'aggiornamento SQL in `supabase/schema.sql` su Supabase (colonne presenza, `dev_delete_user_account`, fix policy membri)
