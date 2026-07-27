# Branchefy v0.2.25

## Hotfix definitivo player (`keyLoadError · HTTP 404`)

### Causa dimostrata (probe live su Railway 0.2.23)

La media playlist veniva **servita grezza** (varianti master registrate opache). Dentro c’era:

```text
#EXT-X-KEY:METHOD=AES-128,URI="/storage/enc.key"
```

hls.js risolverà quella URI sull’origin del proxy → `…/storage/enc.key` → **404**. Non è un token scaduto: è la chiave relativa non proxata.

### Fix

- Varianti del master sempre riscrivibili (già in 0.2.24)
- Sniff obbligatorio se l’URL upstream è una playlist (`type=video` / `/playlist/`), anche se registrata opaca
- `/health` espone `version` per verificare il deploy Railway
- Test di regressione sul caso `/storage/enc.key`

Dopo il deploy: hard refresh, Riprova. `/health` deve rispondere `"version":"0.2.25"`.

## Piattaforme

- Windows / macOS / Web come di consueto
