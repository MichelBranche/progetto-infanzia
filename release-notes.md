## Watch party

- **Stanze che non restano più attive per sempre**: quando l'host esce dal player o chiude la party, la stanza viene eliminata dal server
- **Pulizia automatica**: stanze abbandonate (crash, chiusura app) vengono rimosse dopo 15 minuti senza attività
- Gli ospiti vedono un messaggio quando la stanza viene chiusa dall'host

## Note

- Esegui anche l'aggiornamento SQL in `supabase/schema.sql` per attivare la pulizia automatica lato server
