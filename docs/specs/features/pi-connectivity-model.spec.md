# SPEC : Modèle de connectivité Pi — garde-fou offline & reconnexion

> **Owner** : Daisy
> **Statut** : Live
> **Dernière revue** : 2026-05-14
> **last_verified** : 2026-05-14
> **verified_against_commit** : abdd99ba
> **Code principal** :
>
> - `central-server/src/services/network-alerts.service.ts` (CRON 4h, détection sites offline > 24h)
> - `central-server/src/services/socket.service.ts:373,455,723` (maj `last_seen_at` sur connect/heartbeat/disconnect)
> - `raspberry/sync-agent/src/agent.js:50` (Socket.IO reconnect adaptatif côté Pi)
> - `central-server/src/services/pending-commands-drain.task.ts:32-96` (drain queue à la reconnexion)
>
> **ADR liés** : ADR-001 (autonomie locale), ADR-120 (modèle ownership Pi vs SaaS — assume ce garde-fou existant)
> **Smoke tests** : `smoke-network-wifi.test.ts`

## En une phrase

Un Pi conçu pour fonctionner offline doit néanmoins se reconnecter régulièrement pour pousser ses analytics, recevoir les commandes queueées et permettre le support distant — le système détecte les Pi non vus depuis plus de 24h via un CRON cloud, alerte les opérateurs, et permet aux Pi de re-tenter une reconnexion adaptative côté client.

## Périmètre

- **Inclus** : la promesse produit "Pi reconnecté au minimum 1×/mois", le garde-fou applicatif (alerte si dépassement seuil), le mécanisme de reconnexion adaptative côté Pi (Socket.IO retry/backoff), la maintenance du `last_seen_at` côté cloud, le drain de queue à la reconnexion.
- **Couvre** : table `sites.last_seen_at`, service `network-alerts.service.ts`, agent Pi `agent.js`, alertes `alert_type = 'site_offline'`.
- **Hors périmètre** : la détection physique de la connectivité réseau du Pi (hotspot, WiFi client — cf. `hotspot-psk.spec.md`), la résolution des incidents (dépend du support humain), le SLA contractuel client (sujet commercial).

## Promesse produit vs réalité technique

**Promesse commerciale offre Pi** (cf. `.claude/rules/context.md`) :
> "Pi reconnecté au minimum 1×/mois pour push analytics + pull MAJ config."

**Garde-fou technique actuel** (plus strict que la promesse) :
- CRON `network-alerts.service.ts` toutes les **4 heures**
- Détecte les Pi avec `last_seen_at < NOW() - INTERVAL '24 hours'`
- Génère une alerte `site_offline` par site concerné (dédup ADR-111)

→ Le seuil d'alerte (24h) est **bien plus strict** que la promesse commerciale (1 mois). C'est intentionnel : on veut savoir tôt si un Pi a un problème, pas attendre un mois.

## Règles métier

### Côté cloud — détection Pi offline

- **Source de vérité** : `sites.last_seen_at` (TIMESTAMPTZ).
- **Mises à jour** par `socket.service.ts` à 3 événements :
  - Connexion Socket.IO Pi → cloud (line 373)
  - Heartbeat applicatif (line 455)
  - Déconnexion gracieuse (line 723)
- **Détection** par `network-alerts.service.ts:119` :
  ```sql
  SELECT id, site_name FROM sites
  WHERE site_type = 'pi'
    AND last_seen_at IS NOT NULL
    AND last_seen_at < NOW() - INTERVAL '24 hours'
  ```
- **Alerting** : pour chaque site détecté, `alertRepository.create({ site_id, alert_type: 'site_offline', ... })` — dédup ADR-111 garantit qu'on n'inonde pas si le Pi reste offline plusieurs jours.

### Côté Pi — reconnexion adaptative

`raspberry/sync-agent/src/agent.js:50` configure Socket.IO client :

| Paramètre | Valeur | Effet |
|---|---|---|
| `reconnection` | `true` | Retry automatique sur disconnect |
| `reconnectionDelay` | `1000` ms | Délai initial entre tentatives |
| `reconnectionDelayMax` | `15000` ms | Délai max (exponential backoff plafonné) |
| `maxReconnectAttempts` | `10` | Après 10 échecs successifs, log `exhausted reconnect` |
| `timeout` | `5000` ms | Timeout par tentative |

Après épuisement des 10 tentatives, le sync-agent **log un message d'erreur** mais ne tue pas le process — il reste idle, et un nouveau cycle de tentatives peut être déclenché manuellement (restart service, signal applicatif, etc.). Côté Pi en pratique : `systemd` redémarre le service en cas de crash dur, donc dans les faits le retry reprend.

### Drain de la queue à la reconnexion

Quand un Pi se reconnecte (cf. [command-queue.spec.md](../services/command-queue.spec.md)) :

1. Le `pending-commands-drain.task.ts` tourne déjà toutes les 30s en CRON cloud
2. Au prochain tick après reconnexion, `socketService.getConnectedSites()` inclut le Pi reconnecté
3. Toutes les commandes `pending_commands` queueées pour ce site sont délivrées dans l'ordre `(priority ASC, created_at ASC)`
4. Latence max entre reconnexion et drain : 30s

## Comportements observables

| Situation | Comportement attendu |
|---|---|
| Pi connecté, push heartbeat OK | `last_seen_at` mis à jour à `NOW()` |
| Pi disconnect Socket.IO | `last_seen_at` figé à la valeur du dernier heartbeat |
| Pi offline depuis 23h59m | Aucune alerte (sous seuil 24h) |
| Pi offline depuis 24h01m | Alerte `site_offline` créée au prochain tick CRON 4h (latence max 4h) |
| Pi offline 24h-25h-26h... (alerte déjà créée) | Pas de nouvelle alerte (dédup ADR-111 : `occurrences++` sur la row active) |
| Pi reconnecte après 3 jours offline | Toutes commandes pending délivrées dans les 30s. Alerte `site_offline` résolue manuellement (ou auto si CRON resolve câblé). |
| Pi a épuisé 10 tentatives reconnect | Log local `exhausted reconnect`, service idle. systemd peut restart le service. |

## Risques et angles morts connus

- **Pas de seuil "1 mois sans contact"** : la promesse commerciale est plus lâche que le garde-fou technique. Si un client argumente "1 mois est OK", il faut lui expliquer qu'on alerte dès 24h pour fiabilité opérationnelle. Pas un bug, juste un gap doc.
- **Pas de notification email/Slack** automatique sur alerte `site_offline` aujourd'hui : la row `alerts` est créée mais sa diffusion vers les opérateurs dépend de l'UI dashboard (badge dans `/sites`) ou d'un canal externe à câbler (issue TBD).
- **`last_seen_at` ne distingue pas "Pi crashé" de "Pi sans internet"** : du point de vue cloud, c'est identique (silence radio). Diagnostic nécessite SSH/visite physique.
- **Pas d'auto-resolve `site_offline`** : quand un Pi reconnecte après une alerte, la row reste `status = 'active'` jusqu'à action manuelle. À automatiser (à creuser dans une futur ADR).
- **Pas de seuil per-tier** : un site Premium et un site Free ont le même seuil 24h. Si commercial veut différencier les SLA, c'est une feature à ajouter.

## Ce qui n'est PAS dans cette SPEC

- **Garde-fou côté Pi qui force la reconnexion mensuelle** : il n'existe pas aujourd'hui. Le Pi tente de se reconnecter en permanence dès qu'internet est disponible (cf. agent.js retry), pas selon un calendrier mensuel. Si le client coupe internet 6 mois, le Pi reste offline 6 mois.
- **Mécanisme de "réveil" via SMS, 4G backup, etc.** : pas implémenté. La reconnexion dépend de la connectivité que fournit le club.
- **Dégradation des features après N jours offline** : aucune logique de "déclassement progressif" Pi-side (mode dégradé, etc.). Le Pi fonctionne normalement aussi longtemps que sa config locale est valide.
- **Synchronisation forcée à intervalle régulier** : le Pi ne déclenche pas de tâches proactives "tente de joindre cloud toutes les X heures" — il dépend de la connexion réseau passive.

## Open Questions

1. **Auto-resolve `site_offline`** : quand un Pi reconnecte, la row alerte devrait passer à `status = 'resolved'` automatiquement. À câbler dans `socket.service.ts` au handler de connexion.
2. **Notification active** (email/Slack) sur alerte `site_offline` : à câbler dans `alertingService.createAlert()` selon le tier du site et la criticité.
3. **Seuil configurable par site** : ajouter `sites.offline_alert_threshold_hours` (default 24) pour permettre des SLA différenciés.

## Success Metrics

- 95 % des Pi de la flotte ont un `last_seen_at < NOW() - 30 days` (mesure mensuelle).
- Aucun Pi avec `last_seen_at < NOW() - 60 days` (= Pi orphelin à investiguer humainement).
- Latence détection : alerte créée en moins de 4h après dépassement du seuil 24h.
- Drain queue : commandes pending délivrées en moins de 30s après reconnexion.

## Référence

- [ADR-001](../../adr/ADR-001-edge-cloud-architecture.md) — autonomie locale
- [ADR-111](../../adr/ADR-111-alert-repository-dedup.md) — dédup alerts (évite spam si Pi reste offline)
- [ADR-120](../../adr/ADR-120-pi-saas-ownership-model.md) — assume ce garde-fou pour l'ownership model
- `central-server/src/services/network-alerts.service.ts` — CRON détection
- `central-server/src/services/socket.service.ts` — maj `last_seen_at`
- `raspberry/sync-agent/src/agent.js` — Socket.IO reconnect adaptatif
- [command-queue.spec.md](../services/command-queue.spec.md) — drain à la reconnexion
