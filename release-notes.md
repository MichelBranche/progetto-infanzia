# Branchefy v0.2.26

## Streaming Community: dominio `.vin` + VixCloud

SC è passato a **`streamingcommunityz.vin`** (CDN `cdn.streamingcommunityz.vin`) e gli embed restano su **`vixcloud.co`**.

### Cosa rompeva il desktop

Le build ≤ 0.2.25 trattavano ancora `vixcloud.co` come host morto e riscrivavano verso `vixsrc.to` (spesso 403). I mirror non includevano `.vin`.

### Fix

- Mirror default / remoti: `.vin` in cima
- `vixcloud.co` di nuovo host embed primario (non più “legacy”)
- Referer/CDN immagini allineati al dominio live

La web app già funzionava dopo il deploy Railway; questa release allinea il **desktop**.

## Piattaforme

- Windows / macOS / Web come di consueto
