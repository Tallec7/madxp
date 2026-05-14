# ADR-114 : Write-through `configuration.json.displays` côté sync-agent

**Date** : 2026-05-08
**Statut** : Accepté (amendée partiellement par [ADR-120](ADR-120-pi-saas-ownership-model.md) pour `site_type = 'pi'`)
**Format** : Léger

> **Amendement ADR-120 (Phase 3-4)** : pour les sites `site_type = 'pi'`, la matrice d'ownership s'inverse — le Pi devient source de vérité pour `displays` (l'opérateur sur place via `:8080` assigne), le cloud reflète au push-back. Cette ADR-114 reste inchangée pour `site_type = 'saas'`. Détails : [sync-agent-displays-write-through.spec.md](../specs/services/sync-agent-displays-write-through.spec.md) section "Amendement ADR-120".

---

## Contexte

Incident terrain (site `c994620c`, 2026-05-08) : un Fire Stick avec MAC `0c:43:f9:36:04:77`, assigné au display #1 ("Bandeau LED horizontal") depuis le dashboard cloud, atterrit systématiquement sur `/display/0` au lieu de `/display/1`.

Investigation : la chaîne cloud → Pi pour la propagation des `displays[]` est cassée structurellement.

| #   | Étape                                                                                       | Code                                                                                    | Statut |
| --- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------ |
| 1   | Dashboard `PUT /api/sites/:id/displays` → DB `sites.displays`                               | [sites.controller.ts:452](../../central-server/src/controllers/sites.controller.ts:452) | ✅     |
| 2   | Cloud émet commande `receiver_assignment_updated`                                           | [sites.controller.ts:471](../../central-server/src/controllers/sites.controller.ts:471) | ✅     |
| 3   | Sync-agent reçoit, parcourt `payload.displays`, appelle `assignDisplay(mac, idx)`           | [command-dispatch.js:81](../../raspberry/sync-agent/src/command-dispatch.js:81)         | ✅     |
| 4   | `assignDisplay()` écrit dans `/home/pi/neopro/.receivers-cache.json`                        | [receivers.service.js:226](../../raspberry/server/services/receivers.service.js:226)    | ✅     |
| 5   | `captive.js` whoami lit `/home/pi/neopro/webapp/configuration.json.displays[].receiver.mac` | [captive.js:53](../../raspberry/server/routes/captive.js:53)                            | ❌     |

Les étapes 4 et 5 lisent **deux fichiers différents** sur le Pi. `update-config.js` (le merge config cloud → local) ne mentionne pas `displays` (`grep displays` → 0 résultat). Aucun mécanisme ne propage l'assignation cloud vers `configuration.json` — le cache receivers reçoit la mise à jour, mais le captive whoami ne le lit jamais.

## Décision

**Write-through `configuration.json.displays = payload.displays`** dans le handler `receiver_assignment_updated` de `command-dispatch.js`, après la boucle `assignDisplay()`.

- Le cloud (DB `sites.displays`) reste la **seule source de vérité** pour la composition des écrans d'un site.
- Côté Pi, `configuration.json.displays[]` devient la **seule source consommée** par `captive.js` whoami (pas de double lecture cache + config).
- Le receivers cache `.receivers-cache.json` garde son rôle d'état ephemeral : `lastSeenAt`, `kind`, présence en LAN — il alimente l'event Socket.IO `connected-receivers-changed` du admin-server.
- Échec d'écriture = `console.warn` + on continue. La commande est idempotente : la prochaine assignation cloud retentera. Pas de throw qui crasherait le sync-agent.
- Utilise `safeReadConfig` + `atomicWriteJson` (helpers ADR-028) pour la résilience power-loss / SD card.

## Alternatives rejetées

- **Faire lire `captive.js` à la fois `configuration.json` ET `.receivers-cache.json`** : duplique la logique de résolution sur le Pi, complique l'invariant "1 fichier = 1 source", et le cache n'est pas idempotent au boot Pi (Map vide tant que `loadCache()` n'a pas tourné).
- **Étendre `update-config.js` pour merger `displays`** : couple le path `update_config` (push complet de la config cloud) au path `receiver_assignment_updated` (delta MAC). L'event sources sont distinctes côté cloud (PUT site config vs PATCH displays), garder deux handlers séparés est plus lisible.
- **Supprimer `displayIndex` du receivers cache** : possible mais hors scope. Le cache reste utile comme observability locale (admin-server `connected-receivers-changed`). À reconsidérer si le cache devient une troisième source de divergence.

## Conséquences

- ✅ Assignation MAC dashboard → captive whoami fonctionne en bout de chaîne sur Pi prod normalement bootstrappé.
- ✅ Fire Stick atterrit sur le bon `/display/N` après reconnexion captive.
- ⚠️ Le sync-agent dépend maintenant directement de `configuration.json` pour cette commande (avant : passait par `assignDisplay()` qui écrivait ailleurs). Mitigé par les helpers `safeReadConfig` / `atomicWriteJson` et un fallback warn.
- ⚠️ Aucun backfill automatique des Pi déjà déployés : seules les **futures** assignations dashboard propageront. Pour les sites existants avec assignation déjà faite, refaire un PUT displays côté dashboard re-déclenche la commande.

## Fichiers impactés

- [raspberry/sync-agent/src/command-dispatch.js](../../raspberry/sync-agent/src/command-dispatch.js) — write-through après `assignDisplay()`.
- [raspberry/sync-agent/src/**tests**/command-dispatch-receiver-assignment.test.js](../../raspberry/sync-agent/src/__tests__/command-dispatch-receiver-assignment.test.js) — 3 nouveaux tests (write OK, write fail, config unreadable).
- [.claude/rules/raspberry.md](../../.claude/rules/raspberry.md) — invariants "ne jamais faire" pour la write-through.
