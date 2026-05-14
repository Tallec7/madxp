# SPEC : Hotspot PSK (rotation cloud-source-of-truth)

> **Owner** : Daisy
> **Statut** : Live (phases 1-5a déployées 2026-04-19) — Phase 5b programmée 2026-06-15 (suppression `club-config.json` conditionnée à 100% flotte bootstrappée)
> **Dernière revue** : 2026-04-27
> **last_verified** : 2026-05-10
> **verified_against_commit** : 1890d43
> **Code principal** :
>
> **Cloud (central-server)** — source unique de vérité :
>
> - `central-server/src/services/hotspot-config.service.ts` (orchestrateur API)
> - `central-server/src/services/hotspot-psk-crypto.service.ts` (chiffrement AES-256-GCM, fail-fast si clé absente)
> - `central-server/src/repositories/hotspot-config.repository.ts` (lecture/écriture `sites.wifi_psk_encrypted`)
> - `central-server/src/controllers/hotspot-config.controller.ts` + route `/api/sites/:id/hotspot-config*` (ADR-076 split routes pour éviter collision)
>
> **Pi sync-agent** — consommateur :
>
> - `raspberry/sync-agent/src/services/hotspot-sync.js` (`syncFromCloud()`, diff hostapd.conf, restart si changement, cache chmod 600)
> - `raspberry/sync-agent/src/agent.js` (appel `syncHotspotFromCloud()` après `handleAuthenticated()`)
> - `raspberry/sync-agent/src/config.js` (`'rotate_psk'` whitelisté dans `DEFAULT_ALLOWED_COMMANDS`)
>
> **Pi admin panel** — read-only :
>
> - `raspberry/admin/services/hostapd-reader.service.js` (parse `/etc/hostapd/hostapd.conf`, jamais d'écriture)
>
> **ADR liés** : ADR-073 (rotation legacy custom-PSK), ADR-074 (cloud-source-of-truth + AES-256-GCM), ADR-076 (split routes hotspot-config pour éviter collision avec `sites.routes`), ADR-126 (filet DNS `resolv.conf.head` côté Pi — neutralise le hijack `address=/#/` du captive quand `/etc/resolv.conf` est vide)
> **Smoke tests** : `central-server/src/__tests__/smoke/smoke-network-wifi.test.ts` (+ invariants enforcés cf. `.claude/rules/hotspot-psk.md`)
> **`.claude/rules/` lié** : `hotspot-psk.md` (12 invariants smoke-testés, NE JAMAIS FAIRE)

## En une phrase

Le PSK WiFi du hotspot d'un Pi vit chiffré en DB cloud (AES-256-GCM), le Pi le récupère au boot et à chaque rotation déclenchée depuis le dashboard admin, écrit `hostapd.conf` localement et redémarre `hostapd` — le Pi consomme, jamais ne dicte.

## Périmètre

Domaine restreint à la gestion du PSK hotspot du Pi (consommation cloud → écriture locale `hostapd.conf`).

- **Services backend** : `hotspot-config.service.ts`, `hotspot-psk-crypto.service.ts`, `hotspot-config.repository.ts`, `hotspot-config.controller.ts`
- **Composants Pi** : `raspberry/sync-agent/src/services/hotspot-sync.js`, `raspberry/sync-agent/src/agent.js`, `raspberry/admin/services/hostapd-reader.service.js`
- **Routes API** : `GET/PUT/POST /api/sites/:id/hotspot-config*`
- **Tables DB** : `sites.wifi_psk_encrypted`, `sites.wifi_psk_iv`, `sites.wifi_psk_auth_tag`, `sites.wifi_ssid`
- **ADR** : ADR-073, ADR-074, ADR-076
- **Smoke tests** : `smoke-network-wifi.test.ts`
- **`.claude/rules/`** : `hotspot-psk.md`

## Règles métier (ce qui DOIT marcher)

- **Cloud canonique** : `sites.wifi_psk_encrypted` (+ `wifi_psk_iv`, `wifi_psk_auth_tag`, `wifi_ssid`) est la source unique de vérité. Aucun Pi ne dicte un PSK au cloud (le legacy `POST /bootstrap` est `IF NULL` only).
- **Chiffrement AES-256-GCM** : le PSK n'est jamais persisté en clair en DB. Clé `HOTSPOT_PSK_ENCRYPTION_KEY` (Railway secret, fail-fast `process.exit(1)` en prod si absente au boot).
- **Sync au boot Pi** : `agent.js` appelle `syncHotspotFromCloud()` immédiatement après `handleAuthenticated()`. Si la config cloud diffère du `hostapd.conf` local, le Pi ré-écrit + restart hostapd.
- **Rotation depuis dashboard admin** : `POST /api/sites/:id/hotspot-config/rotate` (auth super_admin JWT) génère un nouveau PSK, persiste en DB chiffré, puis `commandQueueService.sendOrQueue(siteId, 'rotate_psk', {})` pousse le Pi à re-sync.
- **Bootstrap one-shot** : `POST /bootstrap` ne fonctionne que si `wifi_psk_encrypted IS NULL` (clause SQL). Pour les Pi legacy ADR-073, c'est le mécanisme de migration vers le modèle cloud.
- **Cache local Pi chiffré** : `/home/pi/neopro/.hotspot-cache` (chmod 600), clé dérivée du site API key. Sert de fallback si le cloud est injoignable au boot.
- **Admin panel read-only** : le panel WiFi sur le Pi (port 8080) lit `hostapd.conf` via `hostapd-reader.service.js`, ne l'écrit jamais. Le sync-agent et `install.sh` sont les seuls writers.
- **Whitelist sudoers** : le sed sur `/etc/hostapd/hostapd.conf` est la seule commande sudo autorisée pour le user `neopro`. Le PSK est shell-escapé avant injection.
- **Route hotspot-config isolée** : montée hors de `sites.routes` (ADR-076 — sinon collision avec wildcard route `/api/sites/:id/*`).
- **Métriques Prometheus** : `neopro_hotspot_bootstrap_attempts_total{status}`, `neopro_hotspot_rotation_attempts_total{status}`, `neopro_hotspot_psk_decrypt_errors_total` exposées et alertables.
- **Fleet bootstrap tracking** : `npm run hotspot:status` liste les sites avec `wifi_psk_encrypted IS NOT NULL` — précondition Phase 5b (suppression `club-config.json` PSK fields).

## Comportements observables

| Règle              | Comment on vérifie                                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Cloud canonique    | `psql` : `SELECT id, wifi_psk_encrypted IS NOT NULL FROM sites` doit retourner ≥1 row par site bootstrappé                          |
| Pi consume (sync)  | Logs Pi `journalctl -u neopro-sync-agent -f` après reboot : message `"Hotspot config synced from cloud"` + diff hash `hostapd.conf` |
| Rotation propagée  | Dashboard super_admin click "Rotate PSK" → 200 OK → Pi reçoit la commande dans <30s (queue) → modal admin affiche le nouveau PSK    |
| Cache fallback     | Couper l'API en staging, reboot Pi → hotspot reste fonctionnel (cache déchiffré)                                                    |
| Métriques          | Grafana : counter `neopro_hotspot_rotation_attempts_total{status="success"}` augmente après rotation                                |
| Bootstrap tracking | `npm run hotspot:status` retourne pourcentage de la flotte avec PSK cloud (target Phase 5b : 100%)                                  |
| Décryption error   | Si la clé `HOTSPOT_PSK_ENCRYPTION_KEY` est mauvaise → log Winston `error` + counter `neopro_hotspot_psk_decrypt_errors_total`       |

## Cas d'edge connus

- **Pi offline lors de la rotation** : la commande `rotate_psk` reste en queue (`command_queue` table). Au prochain `handleAuthenticated()`, le Pi consomme et sync. Le cloud wins, le cache local est écrasé.
- **Clé `HOTSPOT_PSK_ENCRYPTION_KEY` absente en prod** : `process.exit(1)` au boot du central-server, alerte Railway. Incident documenté 2026-04-20 → runbook ajouté.
- **Conflit bootstrap (race condition)** : 2 admins déclenchent `POST /bootstrap` simultanément → 1 seul succès (clause `IF NULL`), l'autre retourne 409. Le client doit refetch.
- **Pi legacy ADR-073 jamais bootstrappé** : `wifi_psk_encrypted IS NULL`, le Pi continue d'utiliser son PSK local. Pour migrer : `POST /bootstrap` avec PSK actuel → cloud devient canonique au prochain sync. Précondition Phase 5b.
- **Pi qui flap (reboot intempestif)** : chaque sync re-écrit `hostapd.conf` même si identique → diff détecté côté sync-agent, pas de restart inutile (idempotence garantie).
- **Cache chmod incorrect** : sync-agent re-applique chmod 600 à chaque écriture (le hash du fichier change, donc l'inode aussi).
- **Admin oublie de copier le nouveau PSK après rotation** : modal affiche le PSK une fois (copy-paste obligatoire). Si oublié, re-rotation nécessaire (pas de "show again").
- **Hostapd legacy déjà installé sans `hostapd.conf` aux specs Neopro** : `POST /bootstrap` accepte le PSK existant et le pousse au cloud. Pas de régression terrain.

## Contraintes / NE PAS FAIRE

Liste exhaustive enforcée par smoke test : `.claude/rules/hotspot-psk.md` (12 invariants, NE JAMAIS FAIRE).

Règles **métier** (pas conventions de code) :

- Ne jamais persister un PSK en clair, même temporairement (DB, log, fichier de cache, header HTTP).
- Ne jamais réintroduire l'écriture de `wifiPassword` ou `wifiSSID` dans `club-config.json` côté Pi (cf. install.sh, prepare-image.sh, hotspot-dashboard.service.js — Phase 5a a tout retiré).
- Ne pas exposer une route d'admin (rotate, admin-view) sans guard JWT super_admin + rate-limit (le PSK est sensible).
- Ne pas modifier `hostapd.conf` depuis le panel admin Pi : seul le sync-agent (cloud-driven) ou `install.sh` (provisioning initial) peut écrire.
- Ne pas activer la suppression de `club-config.json` (Phase 5b) tant que `npm run hotspot:status` ne reporte pas 100% de la flotte bootstrappée.

## Ce qui n'est PAS dans le scope

- **Provisioning initial du Pi** (image SD, première installation hostapd, `prepare-image.sh`) → SPEC `kiosk-pi` à venir.
- **Daemon `hostapd` lifecycle** (start/stop/restart bas-niveau via systemd) → couvert par les scripts shell + sudoers, pas une feature applicative.
- **Captive portal hotspot client** (page de login WiFi) → backlog roadmap LATER.
- **Autres composants WiFi** : `bgscan` (roaming Pi entre AP), IPv6 disable, USB WiFi key fallback → SPECs séparées.
- **Mode SaaS** : pas de hotspot, pas de PSK (le navigateur client se connecte directement au cloud) → cf. SPEC `saas-mode`.
- **Phase 5b suppression `club-config.json`** : planifiée 2026-06-15, dépend de la Phase 5a + 100% flotte bootstrappée. Documentée dans le memory `project_adr074_phase5b.md`.

## Évolutions possibles (backlog léger)

- [ ] **Phase 5b** (2026-06-15) : suppression définitive de `wifiSSID`/`wifiPassword` dans `club-config.json` côté Pi (install.sh, hotspot-dashboard.service.js, configuration.service.js). Conditionnée à 100% flotte bootstrappée + saison NLF terminée.
- [ ] **Rotation auto périodique** (sécurité) : CRON 90j qui force rotation PSK avec notification club. Aujourd'hui rotation = manuelle uniquement.
- [ ] **Audit log rotation** : qui a rotaté, quand, pour quel site (table `audit_log` dédiée ou réutiliser `command_queue.history`).
- [ ] **Self-service rotation côté club** : permettre au resp partenaires (persona 3c) de rotater son propre PSK quand un sponsor exige le changement (ex: après départ d'un partenaire qui connaissait le PSK gymnase).
- [ ] **Validator côté admin** : avant rotation, vérifier que le Pi est UP (heartbeat <2 min) — sinon prévenir l'admin que la commande sera queued.
- [ ] **Migration depuis Phase 5b** : retirer le code legacy `getClubConfig().wifi*` une fois 5b shippé + 1 mois de soak.
