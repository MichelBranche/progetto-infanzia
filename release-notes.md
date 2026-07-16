# Branchefy v0.2.12

## Watch Party

- **Sync perfetto**: eliminati i desync tra host e ospiti (correzione dello sfasamento di clock)
- **Convergenza fluida**: le piccole differenze si allineano regolando dolcemente la velocità, senza salti
- **Chat in stanza**: pannello a tendina in basso a destra con badge messaggi non letti
- **Chiudi stanza**: nuovo tasto per terminare la stanza dal menu amici in alto

## Amici

- **Profilo amico a tutta pagina**: foto, presenza e titoli visti di recente al posto della finestra compatta

## Sezione Anime

- Nuova homepage dedicata con hero, righe curate (in corso, popolari, novità) e filtri per genere/audio

## Fix

- **Avvisi globali** ripristinati (richiede l'applicazione della migration DB `app_broadcasts`)
- Player: risolto lo schermo nero dopo la creazione di una stanza

## Prestazioni

- Scroll e caricamento più fluidi: rendering pigro delle righe/griglie fuori schermo, immagini lazy, ricerca indicizzata

## Piattaforme

- **Windows**: aggiornamento automatico in-app dalla release GitHub
- **Web app**: deploy su Vercel — ricarica quando compare il banner aggiornamento
- **macOS**: scarica il nuovo `.dmg` dalla release GitHub
