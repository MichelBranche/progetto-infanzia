## Novità

- **Barra amici in top nav**: avatar stack, stato online/away/DND, chat rapida e inviti watch party
- **Inviti watch party**: invita amici dalla barra amici, dal menu amici o dal pannello «Guarda insieme»
- **Inviti in chat privata**: card dedicata con titolo, codice stanza e pulsante **Unisciti**
- **Stato stanza negli inviti**: ogni invito in chat mostra se la stanza è ancora **attiva** o **chiusa** (aggiornamento live)
- **Suoni**: notifica invito watch party e suoni su navigazione/apertura card
- **Chat migliorata**: picker emoji, invio messaggi più affidabile, eliminazione conversazioni
- **Popup chat**: apri una chat con un amico senza uscire da ciò che stai guardando

## Miglioramenti

- Inviti watch party anche per stanze **LAN** (con IP host in chat)
- Menu profilo e amici in portal per evitare problemi di rendering su Tauri
- Presenza amici condivisa senza crash (fix schermo nero su Profilo)
- Animazioni pill della navigazione ripristinate su desktop Tauri
- Aurora liquida e colori hero mantenuti con fix mirati per WebView2

## Correzioni

- Fix crash `useWatchPartyHost` fuori dal provider quando si apre il player da watch party
- Fix schermo nero aprendo Profilo (doppia sottoscrizione presence Supabase)
- Fix join watch party da invito (cloud e LAN)
- Pulizia chat watch party quando la stanza viene chiusa (migrazione Supabase)

## Piattaforme

- **Windows**: aggiornamento automatico in-app
- **macOS**: aggiornamento automatico in-app (installazione iniziale da `.dmg`)
