# ADR-074: PSK hotspot — source de vérité unique côté cloud

**Date** : 2026-04-19
**Statut** : Accepté — Phases 1 à 5a implémentées le 2026-04-19, Phase 5b planifiée 2026-06-15
**Décideurs** : Guillaume (CTO)
**Lié à** : ADR-072 (hotspot generalist defaults), ADR-073 (hotspot security hardening)

---

## Contexte

Audit terrain 2026-04-19 : incohérence détectée sur Pi NLF entre `/etc/hostapd/hostapd.conf` (contient le vrai PSK `NantesLoireFeminin26!`) et `/home/pi/neopro/club-config.json` (contient encore les placeholders `PASSWORD` / `NEOPRO-CLUB_NAME`). Hypothèse confirmée : ce cas n'est pas isolé, plusieurs sites de la flotte sont probablement dans le même état.

### État actuel — deux sources de vérité pour un même secret

| Fichier                            | Rôle                                                                 | Écrivains                                                                                                                     |
| ---------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `/etc/hostapd/hostapd.conf`        | Config **opérationnelle** lue par le daemon hostapd                  | `install.sh`, `prepare-image.sh`, `prepare-golden-image.sh`, `hotspot-dashboard.service.js rotatePsk()`, édition SSH manuelle |
| `/home/pi/neopro/club-config.json` | Config **déclarative** lue par admin panel, sync-agent, debug-bundle | `install.sh`, `prepare-image.sh`, `hotspot-dashboard.service.js rotatePsk()` (best-effort)                                    |

### Chemins de désync identifiés

1. **SSH manuel** : `sudo sed -i 's/wpa_passphrase=.*/.../' hostapd.conf && systemctl restart hostapd` ne touche pas `club-config.json`.
2. **`prepare-golden-image.sh`** (bug) : patche `hostapd.conf` mais n'écrit pas `club-config.json`.
3. **`rotatePsk()` best-effort** : le `try/catch` sur l'update `club-config.json` swallow silencieusement les erreurs d'écriture.
4. **Rotation PSK côté cloud non propagée** : aucun mécanisme ne remonte le PSK du Pi vers le cloud.

### Conséquences observées

- Support N1 regarde la colonne DB ou l'admin panel et voit des placeholders → appelle le CTO pour récupérer le vrai mot de passe.
- Les backups `club-config.json` sont inutiles pour la restauration.
- La rotation PSK initiée depuis le cloud n'est pas testable (le cloud ne connaît pas le PSK avant rotation).
- La colonne `sites.psk_rotated_at` (ajoutée par ADR-073) track la rotation mais ne stocke pas le PSK lui-même.

## Décision

**Le cloud est la source unique de vérité pour le PSK hotspot. Le Pi consomme, jamais ne dicte.**

1. **Storage canonique** : PSK et SSID stockés dans `central-server` DB, colonnes `sites.wifi_psk_encrypted` (AES-256-GCM, clé dans Railway secrets) + `sites.wifi_ssid`.
2. **Consommation Pi** : `sync-agent` fetch `GET /api/sites/:id/hotspot-config` au boot et sur chaque reconnexion cloud. Écrit `hostapd.conf` + restart hostapd si diff détecté.
3. **Rotation** : initiée uniquement depuis le dashboard cloud. Cloud génère le PSK → stocke → push au Pi via Socket.IO `command/rotate_psk`. Plus de rotation locale.
4. **`club-config.json` supprimé.** L'admin panel, le debug-bundle et le diagnose lisent `hostapd.conf` en read-only via un shim `hostapd-reader.service.js`.
5. **Migration one-shot** : pour chaque Pi déjà déployé, sync-agent remonte son PSK courant au cloud au premier boot post-OTA (`POST /api/sites/:id/hotspot-config/bootstrap`, autorisé une seule fois quand `sites.wifi_psk_encrypted IS NULL`).
6. **Cache local** : sync-agent garde un cache chiffré `/home/pi/neopro/.hotspot-cache` (chmod 600) pour survivre aux redémarrages offline. Si cloud injoignable au boot, utilise le cache.
7. **Check de cohérence au boot** : sync-agent compare hostapd.conf vs cache. Si diff et cloud joignable → resync + alerte. Si diff et cloud offline → trust hostapd.conf (cas support manuel légitime), remontera au prochain sync.

## Alternatives Considérées

### 1. Garde-fou bidirectionnel (watcher inotify sur les 2 fichiers)

**Avantages** :

- Implémentation rapide (~1j).
- Pas de dépendance cloud au boot.

**Inconvénients** :

- Garde deux sources de vérité → dette persistante.
- Ambigu en cas d'édition simultanée (qui gagne ?).
- Ne résout pas la propagation cloud → support toujours aveugle.
- Pourrit dès qu'un 3e consommateur du PSK apparaît.

**Verdict** : Rejeté — patch le symptôme, pas la cause.

### 2. Pi source de vérité, cloud mirroir

**Avantages** : Offline-first strict.

**Inconvénients** :

- Rotation PSK cloud impossible sans Pi joignable.
- Support aveugle tant que le Pi n'a pas sync.
- Cloud ne peut pas garantir l'unicité des PSK entre clubs.

**Verdict** : Rejeté — casse le use case support N1.

### 3. Cloud source de vérité, Pi consommateur ✅ (choisie)

**Avantages** :

- Une vérité, propagation déterministe.
- Support a toujours le vrai PSK à jour dans le dashboard.
- Rotation pilotable depuis le cloud.
- Backups n'ont plus besoin de contenir le PSK.
- Élimine la classe de bugs "club-config.json désynchronisé".

**Inconvénients** :

- Le Pi dépend du cloud au boot initial (mitigé par le cache local).
- Migration non triviale pour la flotte existante.

**Verdict** : Accepté.

## Conséquences

### Positives

1. Support N1 voit toujours le vrai PSK dans le dashboard — plus d'appel au CTO.
2. Rotation PSK automatique et fiable depuis le dashboard.
3. `club-config.json` supprimé → une seule classe de fichier config à maintenir.
4. Debug-bundle et backup ne contiennent plus le PSK en clair (il est dans la DB cloud, chiffré).
5. Édition SSH manuelle auto-corrigée au prochain sync cloud.

### Négatives

1. Dépendance réseau au boot initial d'un Pi neuf (mitigé : install.sh nécessite déjà internet).
2. Migration one-shot à orchestrer sur la flotte (50+ Pi).
3. Règle sudoers `/etc/hostapd/hostapd.conf` doit rester restreinte au `sync-agent` uniquement.

### Risques

| Risque                                                              | Mitigation                                                                                    |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Cloud down au boot initial → Pi sans WiFi                           | Cache local chiffré + fallback `hostapd.conf` existant. Jamais d'écrasement si cache absent.  |
| Migration casse un Pi en production                                 | Feature flag `HOTSPOT_PSK_CLOUD_SOURCE` par site, rollout canary 1 Pi → 5 Pi → flotte.        |
| Fuite de la clé de chiffrement Railway                              | Rotation clé trimestrielle + audit log accès. PSK chiffrés invalidés en cas de compromission. |
| Désync entre cache local et cloud après long offline                | Reconcile au retour online : cloud wins, Pi resync.                                           |
| Règle sudoers trop large permet à un autre service d'écrire hostapd | Restreindre à `/usr/bin/sync-agent-hotspot-writer` (binaire dédié).                           |

## Plan d'implémentation

### Phase 1 — Storage & API cloud (2j)

1. Migration SQL `sites.wifi_psk_encrypted` (bytea) + `sites.wifi_ssid` (varchar).
2. Service `HotspotConfigService` : chiffrement AES-256-GCM avec clé Railway `HOTSPOT_PSK_ENCRYPTION_KEY`.
3. Routes :
   - `GET /api/sites/:id/hotspot-config` (auth: apiKey Pi, retourne PSK déchiffré)
   - `POST /api/sites/:id/hotspot-config/bootstrap` (one-shot, seulement si NULL)
   - `POST /api/sites/:id/hotspot-config/rotate` (admin dashboard)
4. Tests unitaires + smoke.

### Phase 2 — Sync-agent consumer (1j)

1. Module `services/hotspot-sync.js` : fetch config + diff hostapd.conf + restart hostapd si changement.
2. Cache chiffré local `/home/pi/neopro/.hotspot-cache`.
3. Handler Socket.IO `command/rotate_psk` → réécrit + restart.
4. Tests Jest dans `raspberry/sync-agent`.

### Phase 3 — Migration flotte (1j)

1. Route bootstrap one-shot utilisée par sync-agent au premier boot post-OTA.
2. Script d'audit : liste les Pi avec `wifi_psk_encrypted IS NULL` après 7 jours → alerte.
3. Rollout canary (1 Pi test → 5 Pi → flotte).

### Phase 4 — Admin panel Pi (0,5j)

1. Nouveau service `hostapd-reader.service.js` (read-only parse hostapd.conf).
2. Suppression de `club-config.json` + tous les readers.
3. Migration des tests existants.

### Phase 5 — Retrait legacy (0,5j)

1. Supprimer écriture `club-config.json` dans `install.sh`, `prepare-image.sh`, `prepare-golden-image.sh`.
2. Supprimer `rotatePsk()` best-effort dans `hotspot-dashboard.service.js`.
3. Supprimer colonne `site_config.wifi_psk_plaintext` si elle existe.

### Critères de validation

- 100% des Pi de la flotte ont `sites.wifi_psk_encrypted NOT NULL` dans les 7j post-rollout.
- Smoke test `smoke-hotspot-psk-source-of-truth` : vérifie qu'aucun écrivain du PSK n'existe côté Pi hors sync-agent.
- Dashboard affiche le vrai PSK pour NLF, Strogatien et 3 autres sites vérifiés manuellement.
- Rotation PSK via dashboard → PSK change sur le Pi en <10s.
- Pi rebooté offline utilise le cache correctement (test manuel).

## Références

- Audit 2026-04-19 : `docs/audit/AUDIT-2026-04-19-hotspot-systemic.md` (S1, F8)
- ADR-072 : `docs/adr/ADR-072-hotspot-generalist-defaults.md`
- ADR-073 : `docs/adr/ADR-073-hotspot-security-hardening.md`
- Migration S1 déjà commencée : PR #486 `feat(db): add sites.psk_rotated_at column`

---

## État d'implémentation (2026-04-19)

### ✅ Phase 1 — Storage & API cloud (done)

- Migration `sites.wifi_psk_encrypted` (bytea) + `sites.wifi_ssid` (varchar)
- `central-server/src/services/hotspot-config.service.ts` (AES-256-GCM, clé `HOTSPOT_PSK_ENCRYPTION_KEY`)
- `central-server/src/controllers/hotspot-config.controller.ts` (GET / bootstrap / rotate)
- `central-server/src/repositories/hotspot-config.repository.ts` + barrel export
- `central-server/src/routes/hotspot-config.routes.ts` monté dans `server.ts`

### ✅ Phase 2 — Sync-agent consumer (done)

- `raspberry/sync-agent/src/services/hotspot-sync.js` (fetch, parse, diff, restart, cache chiffré)
- Cache `/home/pi/neopro/.hotspot-cache` (chmod 0600)
- `raspberry/sync-agent/src/agent.js` : appel `syncHotspotFromCloud()` après `processOfflineQueue()`
- `raspberry/sync-agent/src/commands/index.js` : handler `rotate_psk`
- `raspberry/sync-agent/src/config.js` : `'rotate_psk'` dans `DEFAULT_ALLOWED_COMMANDS`
- Tests Jest `raspberry/sync-agent/src/__tests__/hotspot-sync.test.js` (14 tests verts)

### ✅ Phase 3 — Migration flotte (done)

- `rotateHotspotConfig` dispatch `commandQueueService.sendOrQueue(id, 'rotate_psk', {})`
- Script monitoring `central-server/src/scripts/hotspot-bootstrap-status.ts`

### ✅ Phase 4 — Admin panel Pi read-only (done)

- `raspberry/admin/services/hostapd-reader.service.js` (parse read-only)
- `raspberry/admin/services/configuration.service.js` : `getClubConfig()` lit WiFi depuis hostapd
- `raspberry/admin/services/hotspot-dashboard.service.js` : `rotatePsk()` n'écrit plus club-config.json
- Tests `raspberry/admin/__tests__/hostapd-reader.service.test.js` (6 tests verts)

### ✅ Phase 5a — Retrait legacy (install / flash) (done)

- `raspberry/install.sh` : club-config.json sans wifi_ssid/wifiPassword (chmod 644)
- `raspberry/tools/prepare-image.sh` : idem
- `raspberry/scripts/diagnose-pi.sh` : check chmod 600 retiré

### 🗓️ Phase 5b — Retrait club-config.json (planifiée 2026-06-15)

**Précondition bloquante** : 100 % de la flotte bootstrappée (vérifier via `npm run hotspot:status`).

**Portée** :

1. Supprimer `configuration.service.js.getClubConfig()` + fallback `club-config.json`
2. Supprimer la route `GET /api/config` si aucun client ne la consomme
3. Supprimer l'écriture `club-config.json` complète dans `install.sh` et `prepare-image.sh`
4. Grep final `club-config.json` : zéro occurrence hors docs / archive

**Motif du report** : NLF joue encore des matches (saison jusqu'à mi-juin). Pas de prise de risque sur un Pi en match. NARH ne sera pas mis à jour d'ici fin de saison — impact nul pour cette phase tant qu'on ne flash pas.

### Supervision

- Script fleet : `npm run hotspot:status` (ajoute ligne dans `central-server/package.json`).
- Smoke tests enforced — voir `central-server/src/__tests__/smoke/smoke-hotspot-psk.test.ts`.
- Invariants cross-repo dans `.claude/rules/hotspot-psk.md`.
- Métriques Prometheus (incident 2026-04-20) :
  - `neopro_hotspot_bootstrap_attempts_total{status}` — détecte un mur d'erreurs 500 au bootstrap
    avant que la fleet en subisse les effets.
  - `neopro_hotspot_rotation_attempts_total{status}` — couvre la rotation dashboard + la propagation Pi.
  - `neopro_hotspot_psk_decrypt_errors_total` — signale qu'un PSK stocké ne peut plus être
    déchiffré (clé `HOTSPOT_PSK_ENCRYPTION_KEY` perdue ou tournée sans re-encrypt).

---

## Incident resolution (2026-04-20)

Bootstrap NLF bloqué en prod par une suite de régressions Railway cumulées. Fixée dans une
chaîne de PRs le 2026-04-20 — résumé des 4 causes racines + corrections :

| #   | Symptôme                                                   | Cause racine                                                                                                                      | Fix                                           |
| --- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1   | `POST /hotspot-config` → 500 avec message inoffensif       | `HOTSPOT_PSK_ENCRYPTION_KEY` jamais setté en prod → `encryptPsk()` throw                                                          | `railway variables --set …` + doc             |
| 2   | Healthcheck fail, route `/hotspot-config/admin-view` → 404 | Route `/:id` de `sites.routes` interceptait `/:id/hotspot-config` avant la route ADR-074 → `authenticate` 401                     | PR #495 (ADR-076 route collision cleanup)     |
| 3   | Migrations non jouées au déploiement                       | Railway Custom Start Command overrode le `CMD` du Dockerfile                                                                      | PR #496 puis PR #497 (chain dans `npm start`) |
| 4   | `migrate.js` crash → server ne boot jamais                 | `add-template-studio-v2.sql` utilisait `uuid_generate_v4()` non qualifié, `uuid-ossp` est dans le schema `extensions` sur Railway | PR #498 (switch `gen_random_uuid()`)          |

### Timeline

- 2026-04-20 T+00 : NLF Pi déployée, bootstrap renvoie 500 muet côté dashboard.
- 2026-04-20 T+04h : root cause identifiée (env var manquante). Générée via `openssl rand -hex 32`,
  setée via Railway CLI, sauvegardée dans 1Password (entrée `Neopro / HOTSPOT_PSK_ENCRYPTION_KEY`).
- 2026-04-20 T+05h : healthcheck toujours KO → découverte chaîne migrate.js / Start Command / uuid-ossp.
- 2026-04-20 T+06h : 4 PRs mergées, redeploy réussi, NLF bootstrappée à T+07h.

### Post-mortem

1. **Les env vars critiques ne sont pas validées au boot** — on ne découvre `HOTSPOT_PSK_ENCRYPTION_KEY`
   manquant que lors du premier bootstrap Pi. Smoke test ajouté : en `NODE_ENV=production`, l'absence
   de la clé doit faire échouer le boot (fail-fast).
2. **Railway Custom Start Command est invisible depuis le repo** — le Dockerfile `CMD` était
   ignoré sans trace. Doc mise à jour + commentaire explicite dans `central-server/Dockerfile`.
3. **Les migrations silencieusement cassées pendant des semaines** — pas de `gen_random_uuid` dans
   le CI = aucune détection. Smoke test ajouté : `smoke-deploy-ota.test.ts` bloque tout
   `uuid_generate_v4()` non qualifié dans les migrations.
4. **Runbook manquant** — pas de playbook pour "hotspot bootstrap 500" → grep + lecture de code
   ad-hoc. Runbook créé : `docs/modops/RUNBOOK_HOTSPOT_PSK_INCIDENT.md`.

### Vérification post-incident

```sql
-- 1 site bootstrappé (NLF), 6 legacy en attente de rollout ADR-073
SELECT site_name, wifi_psk_encrypted IS NOT NULL AS has_cloud_psk, psk_rotated_at
FROM sites WHERE site_type='pi' ORDER BY wifi_psk_encrypted IS NOT NULL DESC, site_name;
```

Ou via le script CLI : `npm run hotspot:status` depuis `central-server/`.
