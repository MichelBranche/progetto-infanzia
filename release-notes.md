# Branchefy v0.2.14

## Cast alla TV

- **Fix trasmissione con VPN attiva**: con una VPN full-tunnel (es. NordVPN) l'app mandava alla TV un indirizzo della VPN, irraggiungibile dalla rete di casa (la TV mostrava "connettiti alla rete/internet"). Ora sceglie sempre l'IP reale Wi-Fi/Ethernet, scartando le interfacce VPN/virtuali (NordLynx, WireGuard, OpenVPN, TAP, Proton, Mullvad, Tailscale, ZeroTier).

## Piattaforme

- **Windows**: aggiornamento automatico in-app dalla release GitHub
- **Web app**: deploy su Vercel — ricarica quando compare il banner aggiornamento
- **macOS**: scarica il nuovo `.dmg` dalla release GitHub
