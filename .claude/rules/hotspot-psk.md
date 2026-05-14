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

### Filet DNS resolv.conf.head (ADR-126 — smoke test enforced)

- **Retirer la fonction `ensure_resolv_conf_head()` de `raspberry/install.sh` ou son appel dans `setup_hotspot()`.** Sans ce filet, quand `dhcpcd` vide `/etc/resolv.conf` (outage wlan1, bail perdu), glibc tombe sur `127.0.0.1` → `dnsmasq` local → wildcard `address=/#/192.168.4.1` (CAPTIVE-14) → **toutes** les requêtes du Pi vers Railway/FTP sont hijackées vers son propre hotspot (incident NLF 2026-05-14). Le hook `/lib/dhcpcd/dhcpcd-hooks/20-resolv.conf` lit `/etc/resolv.conf.head` à chaque renouvellement de bail et préfixe Cloudflare/Google avant le DNS de la box — c'est le seul mécanisme qui survit aux outages dhcpcd.
- **Retirer ou renommer le script `raspberry/scripts/fix-resolv-conf-head.sh`** : contrat outillage documenté dans ADR-126 (appelé par l'OTA + admin SSH manuel pour rattraper la flotte pré-ADR-126).
- **Supprimer le `address=/#/192.168.4.1` de `dnsmasq.conf`** sans préserver simultanément le pinning `resolv.conf.head` : le wildcard est nécessaire pour le captive Fire Stick (ADR-079 Phase 14), mais il devient un piège si glibc fallback localement. Les deux mesures sont couplées.
- Référence : [ADR-126](../../docs/adr/ADR-126-pi-resolv-conf-head-dns-fallback.md), smoke `central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts` (cas `RESOLV-HEAD-01` + `RESOLV-HEAD-02`).
