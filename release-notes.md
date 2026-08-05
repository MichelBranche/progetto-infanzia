# Branchefy v1.1.0

## Novità

- **Cinema Ambilight**: alone colorato sincronizzato ai bordi del video (toggle lampadina nel player)
- Pill **Supporta** in navigazione per riaprire il messaggio donazioni
- Recupero automatico URL StreamingCommunity + tool `sc:mirrors-sync` e mirror aggiornati

## Migliorie

- Watch Party più stabile (sync guest, meno thrash Broadcast, fallback poll)
- Tema ambient delle impostazioni si applica anche fuori dalla home
- Prestazioni Ambilight: niente loop a vuoto, meno carico sulla UI intorno al player

## Note

- Ambilight non disponibile con Widevine/cast o se lo stream è protetto da CORS
- Su web il deploy Vercel usa la stessa `src/` del desktop
