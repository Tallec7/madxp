# Hotspot PSK — Invariants (ADR-074)

Source de vérité **unique** : la DB cloud (`sites.wifi_psk_encrypted`, chiffré AES-256-GCM).
Le Pi **consomme**, jamais ne dicte.

## NE JAMAIS FAIRE (smoke test enforced)

### Côté cloud (central-server)

- Supprimer `hotspot-config.controller.ts`, `hotspot-config.service.ts`, `hotspot-config.repository.ts` ou leur export dans `repositories/index.ts` (barrel)
- Démonter la route `/api/sites/:id/hotspot-config*` dans `server.ts`
- Retirer le `commandQueueService.sendOrQueue(id, 'rotate_psk', {})` après la rotation DB dans `rotateHotspotConfig` (le Pi ne saurait plus que sa config cloud a changé)
- Hardcoder la clé `HOTSPOT_PSK_ENCRYPTION_KEY` ou la commiter (secret Railway uniquement)
- Stocker le PSK en clair dans la DB (toujours passer par `hotspotConfigService.encrypt()`)

### Côté Pi (sync-agent)

- Retirer `rotate_psk` de `DEFAULT_ALLOWED_COMMANDS` dans `raspberry/sync-agent/src/config.js`
- Retirer l'appel `syncHotspotFromCloud()` dans `handleAuthenticated()` de `agent.js`
- Écrire `hostapd.conf` ailleurs que dans `services/hotspot-sync.js` (règle sudoers restreinte)
- Créer le cache `/home/pi/neopro/.hotspot-cache` sans `chmod 0600` (contient le PSK chiffré, mais perms hygiène)
- Shell-injecter le PSK dans le `sed` : toujours passer par `shellEscape()`

### Côté Pi (admin panel + install)

- Réintroduire l'écriture de `wifiSSID` / `wifiPassword` dans `club-config.json` (install.sh, prepare-image.sh, hotspot-dashboard.service.js)
- Lire le PSK depuis `club-config.json` dans l'admin panel (toujours passer par `HostapdReaderService`)
- Faire `chmod 600 club-config.json` : le fichier ne contient plus de secret (ADR-074), rester en 644 pour éviter les diffs install.sh

### Phase 5b (planifiée 2026-06-15)

Ne pas supprimer `configuration.service.js.getClubConfig()` ni la route `/api/config` tant que `npm run hotspot:status` ne reporte pas 100 % de la flotte bootstrappée.
