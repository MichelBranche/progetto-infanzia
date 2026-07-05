## Profilo e personalizzazione

- Nuova UI profilo centrata (hero, tab a pillola, stati vuoti)
- Foto profilo JPEG (max 1 MB) salvate in locale e **sincronizzate su cloud** per amici e altri dispositivi
- Sistema **traguardi** (amici, visioni completate, lista personale)
- Flusso **Invita amici** con scelta tra link download e codice amico

## Amici e presenza

- Avatar visibili nella lista amici cloud (e arricchimento LAN quando collegati al cloud)
- Foto profilo annunciata in presenza LAN se loggati con account cloud

## App e interfaccia

- **Nuova icona** Branchefy (B con play)
- Navbar superiore ridisegnata; area **privata dev** con layout allineato al profilo
- Fix persistenza lista e cronologia dopo aggiornamenti (scanner libreria più sicuro)

## Note

- Esegui l'aggiornamento SQL in `supabase/schema.sql` su Supabase (`avatar_url`, bucket `profile-avatars`, policy Storage)
- Su Windows: aggiornamento automatico in-app; su macOS scarica il `.dmg` dalla release
