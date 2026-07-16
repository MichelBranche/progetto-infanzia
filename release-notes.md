# Branchefy v0.2.13

## Web app

- **Link condivisibili**: aprendo un contenuto l'URL diventa `/titolo/nome-film` e le sezioni hanno il proprio indirizzo (`/film`, `/serie`, `/anime`, …)
- Il tasto **Indietro/Avanti** del browser ora naviga tra i contenuti
- Un link incollato a freddo (o inviato a un amico) apre direttamente il titolo giusto

## StreamingCommunity

- **Proxy opzionale** (desktop): chi ha l'IP bloccato può instradare il solo traffico SC tramite un proxy/VPN (HTTP o SOCKS5) dalle Impostazioni, senza cambiare nulla per gli altri utenti
- **Traffico più gentile**: l'aggiornamento del catalogo in background è più lento e con ritmo variabile, per non farsi scambiare per un bot
- Recupero automatico via server per l'account autorizzato quando l'IP di casa è bloccato

## Piattaforme

- **Windows**: aggiornamento automatico in-app dalla release GitHub
- **Web app**: deploy su Vercel — ricarica quando compare il banner aggiornamento
- **macOS**: scarica il nuovo `.dmg` dalla release GitHub
