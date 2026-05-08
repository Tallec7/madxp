# SPEC : Sync-agent — Propagation `displays` cloud → Pi

> **Owner** : Daisy
> **Statut** : Live
> **Dernière revue** : 2026-05-08
> **Code principal** :
>
> - `raspberry/sync-agent/src/command-dispatch.js` (handler `receiver_assignment_updated` + write-through)
> - `raspberry/server/services/receivers.service.js` (cache ephemeral `.receivers-cache.json`)
> - `raspberry/server/routes/captive.js` (whoami consumer — lit `configuration.json.displays`)
> - `central-server/src/controllers/sites.controller.ts` (émetteur côté cloud `updateSiteDisplays`)
> - `central-server/src/services/command-queue.service.ts` (`sendOrQueue('receiver_assignment_updated')`)
> - `central-server/src/scripts/backfill-displays-resync.ts` (CLI rejoue la commande sur la flotte)
>
> **ADR liés** : ADR-114 (write-through configuration.json.displays)
> **Smoke tests** :
>
> - `central-server/src/__tests__/smoke/smoke-receivers-discovery.test.ts` (describe "ADR-114 — write-through configuration.json.displays côté sync-agent")
> - `raspberry/sync-agent/src/__tests__/command-dispatch-receiver-assignment.test.js` (3 cas write-through)
>
> **`.claude/rules/` lié** : `raspberry.md` section "Captive Portal — Propagation displays cloud → Pi (ADR-114)"

## En une phrase

Quand un super_admin assigne la MAC d'un Fire Stick à un display côté dashboard cloud, l'assignation est persistée dans `configuration.json.displays[]` du Pi pour que `captive.js` whoami résolve correctement IP→MAC→displayIndex à la prochaine connexion captive du Fire Stick.

## Périmètre

- **Inclus** : la commande Socket.IO `receiver_assignment_updated`, le handler sync-agent (write `.receivers-cache.json` + write-through `configuration.json`), la lecture `captive.js` whoami, le script backfill CLI.
- **Couvre** : DB `sites.displays`, fichier Pi `/home/pi/neopro/webapp/configuration.json`, fichier Pi `.receivers-cache.json` (état ephemeral), endpoint Pi `GET /api/captive/whoami`.
- **Hors périmètre** : la résolution IP→MAC (dnsmasq.leases + arp), le bootstrap captif Angular Fire Stick (cf. `.claude/rules/raspberry.md` section Captive Portal — Bootstrap Angular), le DNS hijack `firetvcaptiveportal.com` (cf. ADR-079).

## Règles métier (ce qui DOIT marcher)

- **DB cloud = seule source de vérité** : `sites.displays[]` (JSONB) gouverne la composition des écrans. Le sync-agent ne peut PAS éditer `displays` localement, le push est unidirectionnel cloud → Pi.
- **`configuration.json.displays[]` = seule source consommée par captive whoami** : pas de double lecture cache + config. `receivers.service.js.assignDisplay()` écrit dans `.receivers-cache.json` mais ce cache est ephemeral (rebuild au boot, pas source de vérité).
- **Write-through = replace, pas merge** : `localConfig.displays = payload.displays` remplace l'array entier. Un merge laisserait des entries fantômes après suppression d'un display côté dashboard.
- **Idempotent** : émettre N fois la même commande `receiver_assignment_updated` n'a pas d'effet de bord (replace = identique à chaque fois). Le script backfill peut être rejoué sans risque.
- **Fail-soft** : si `atomicWriteJson` échoue (EACCES, disk full), warn + on continue. La commande est queueable, retry automatique au prochain push dashboard.
- **Pi offline tolérant** : `commandQueueService.sendOrQueue` queue la commande dans `remote_commands` (status pending). Au prochain reconnect Pi, la commande est délivrée via le path standard.

## Comportements observables

| Règle                              | Comment on vérifie                                                                                                                              |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Write-through DB → Pi              | Côté dashboard : PUT `/api/sites/:id/displays`. Côté Pi : `cat /home/pi/neopro/webapp/configuration.json \| jq .displays` montre l'assignation. |
| Captive whoami résout correctement | `curl -H "X-Real-IP: <fire-stick-ip>" http://localhost:3000/api/captive/whoami` → `{"mac":"...","displayIndex":N,"displayName":"..."}`          |
| Idempotence backfill               | `npm run backfill:displays-resync -- --dry-run` puis sans dry-run → la 2e exécution n'a pas d'effet de bord (replace identique).                |
| Fail-soft                          | Sur Pi avec `configuration.json` en read-only : la commande log `failed to persist displays` mais ne crash pas le sync-agent.                   |
| Pi offline                         | Pi déconnecté du cloud → `sendOrQueue` retourne `queued: true`. Au reconnect, la commande est délivrée.                                         |

## Risques et angles morts connus

- **Backfill manuel requis** sur les sites assignés AVANT le déploiement de la write-through (cf. PR #903, PR #905). Sur ces sites, `sites.displays` côté DB est correct mais `configuration.json` côté Pi est désync. Le script `backfill-displays-resync` résout ce gap mais doit être exécuté manuellement après merge prod.
- **Pi non bootstrappé** (sans `siteId` dans `configuration.json`) ne reçoit aucune commande cloud — la propagation ne s'applique pas. Vérifier `siteId !== null` avant de débugger.
- **Receivers cache vs config désync** : si une PR future rajoute un nouveau path qui modifie `.receivers-cache.json` sans toucher `configuration.json`, le bug original (PR #903) re-tombe. Le smoke `smoke-receivers-discovery.test.ts` describe "ADR-114" garde-fou cela.

## Ce qui n'est PAS dans cette SPEC

- **Pas la résolution IP→MAC** : le pipeline `dnsmasq.leases` watcher + `arp -an` côté `receivers.service.js` est documenté ailleurs (cf. ADR Phase 9 OBSERVE-02). Cette SPEC suppose que IP→MAC fonctionne — elle couvre uniquement la branche MAC→displayIndex.
- **Pas le bootstrap captif Angular** : le redirect `/display/N` côté Fire Stick (CaptivePortalLauncher → Silk → Angular AppComponent) est dans `.claude/rules/raspberry.md` section "Captive Portal — Bootstrap Angular".
- **Pas le DNS hijack** : `firetvcaptiveportal.com` et `spectrum.s3.amazonaws.com` redirigés vers le Pi via `dnsmasq.conf` (cf. ADR-079).
- **Pas la composition initiale du `sites.displays`** : la création/édition côté dashboard cloud (UI + DB CRUD) est dans `central-server/src/controllers/sites.controller.ts` (`updateSiteDisplays`), pas un sujet sync-agent.
- **Pas de gestion multi-tenant** : la commande `receiver_assignment_updated` est par-site (un Pi voit uniquement ses propres `displays`). Cross-site routing inexistant.

## Cas d'edge connus

- **Format MAC** : DB cloud peut stocker `0c:43:F9:36:04:77` (uppercase). Lecture côté Pi fait `toLowerCase()` (cf. `captive.js:62`). Si un futur path skip ce normalize, lookup échoue silencieusement.
- **Pi POC dev (`neopro.local`)** : sans `siteId`, jamais de commande reçue. Edition manuelle de `configuration.json` possible mais perdue au prochain reflash.

## Référence

- [ADR-114](../../adr/ADR-114-displays-write-through-configuration-json.md)
- PR #903 — write-through sync-agent
- PR #905 — script backfill
- Incident terrain : site `c994620c-2016-40f3-9399-2d0345f69274` (Fire Stick `0c:43:f9:36:04:77` atterrit sur `/display/0` au lieu de `/display/1`)
