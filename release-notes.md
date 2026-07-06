## Novità

- **Home**: card cliccabili e hover espanso affidabili (fix zone morte e sovrapposizioni tra righe)
- **Card streaming**: trailer/anteprima dopo ~2,5 s dall'espansione hover, al posto della copertina
- **La mia lista**: pulsante + con effetto stelline; badge ✓ sulla card del titolo aggiunto
- **Watch party cloud**: sync istantanea via Realtime Broadcast; chat stanza più stabile
- **Cast TV**: rilevamento IP LAN migliorato su Windows, ricerca DLNA più lunga, compatibilità TV più robusta
- **Intro**: nuovo tagline sotto il logo Branchefy

## Correzioni

- Spaziatura righe home bilanciata (hover senza gap eccessivo)
- Hero e sezioni con margine negativo non intercettano più i click sulle card sottostanti
- Lista streaming aggiornata subito in UI dopo aggiunta/rimozione titolo

## Database (Supabase)

Se usi watch party in cloud, applica le ultime migrazioni in `supabase/schema.sql` (funzione `ensure_watch_party_chat` e fix race condition).

## Piattaforme

- **Windows**: aggiornamento automatico in-app
- **macOS**: scarica il `.dmg` dalla release
