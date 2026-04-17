# ADR-056: Persistance du watermark à travers OTA et runtime

**Date** : 2026-04-17
**Statut** : Accepté
**Format** : Léger

---

## Contexte

Deux bugs silencieux faisaient disparaître le watermark d'un Pi :

1. **OTA** : `ota-install.js` faisait `rm -rf webapp/*` en ne préservant que `configuration.json`. Le dossier `webapp/assets/watermarks/` (déployé par `deploy_asset`, non présent dans l'archive OTA) était effacé à chaque mise à jour → watermark perdu jusqu'à redéploiement manuel depuis le dashboard.
2. **Runtime** : `WatermarkService.onImageError()` abandonnait définitivement après 5 échecs (séquence 5s→10s→30s→1min→2min ≈ 4min). Pendant le switch boucle→vidéo manuelle, la pression GPU de Chromium (voir `SharedImageBackingFactory` errors) peut provoquer 5 erreurs consécutives sur le `<img>` watermark en quelques secondes → watermark caché jusqu'au prochain `setConfiguration()` ou reboot.

## Décision

1. `ota-install.js` sauvegarde `webapp/assets/` dans `/tmp/webapp-assets.backup` avant l'extraction, puis restaure avec `overwrite: false` (ne touche pas aux fichiers nouvellement livrés par l'archive, préserve tout le reste).
2. `WatermarkService.onImageError()` retente indéfiniment avec backoff progressif plafonné à 2 min (`RETRY_DELAYS_MS = [5, 10, 30, 60, 120]s`, puis `MAX_RETRY_DELAY_MS = 120s`). Le `MAX_IMAGE_RETRIES` est supprimé.
3. Deux smoke tests (`smoke-deploy-ota.test.ts`) verrouillent les deux comportements pour prévenir la régression.
4. Signal de supervision : après 3 échecs consécutifs de chargement, `WatermarkService` émet une ligne structurée `[HEALTH] watermark_unavailable` (niveau `console.error`) facilement greppable dans `journalctl -u neopro-kiosk`.

## Alternatives rejetées

- **Intégrer les watermarks dans l'archive OTA** : rejeté car l'archive est générique (multi-Pi), les watermarks sont par-site et déployés à la demande.
- **Retry borné avec fallback config-reload** : rejeté car la config peut rester stable des heures pendant un match ; sans retry infini, le watermark reste absent pendant toute cette fenêtre.

## Conséquences

- Positif : watermark auto-récupère de toute erreur transitoire (GPU pressure, hiccup nginx, FS cache stale), survit aux OTA.
- Positif : les 2 bugs sont couverts par smoke tests → régression bloquée en CI.
- Négatif mineur : en cas d'image définitivement absente côté FS (rare — cas edge du cache-bust + 404 nginx permanent), le Pi retente toutes les 2 min indéfiniment. Surcoût réseau négligeable (cache nginx 304), mais log `[HEALTH] watermark_unavailable` à chaque retry — détectable côté central.

## Fichiers impactés

- `raspberry/sync-agent/src/commands/ota-install.js` — backup/restore `webapp/assets/`
- `raspberry/src/app/services/watermark.service.ts` — retry infini + signal santé
- `central-server/src/__tests__/smoke/smoke-deploy-ota.test.ts` — 2 smoke tests de non-régression
- `docs/guides/TROUBLESHOOTING.md` — section diagnostic watermark actualisée
