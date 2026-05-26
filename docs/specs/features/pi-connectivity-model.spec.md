# SPEC : Modèle de connectivité Pi — garde-fous offline & reconnexion

> **Owner** : Daisy
> **Statut** : Live (avec gaps documentés — voir ADR-122 pour le plan de résolution)
> **Dernière revue** : 2026-05-14
> **last_verified** : 2026-05-14
> **verified_against_commit** : abdd99ba
> **Code principal** :
>
> - `central-server/src/services/network-alerts.service.ts` (CRON 4h, **mesh uniquement**, seuil 24h)
> - `central-server/src/services/socket.service.ts:373,455,723` (maj `last_seen_at` sur connect/heartbeat/disconnect)
> - `central-server/src/services/subscription.service.ts:181-213` (pattern in-app `message_remote`)
> - `central-server/src/services/monthly-reports.service.ts:512-527` (pattern email CRON via `contact_email`)
> - `central-server/src/cron-tasks/report.task.ts` (pattern email admin MADXP)
> - `raspberry/sync-agent/src/agent.js:50` (Socket.IO reconnect adaptatif côté Pi)
> - `central-server/src/services/pending-commands-drain.task.ts` (drain queue à la reconnexion)
>
> **ADR liés** : ADR-001 (autonomie locale), ADR-120 (modèle ownership Pi vs SaaS), **ADR-122 (Proposé, rappels reconnexion Pi)**
> **Smoke tests** : `smoke-network-wifi.test.ts`

## En une phrase

Un Pi conçu pour fonctionner offline doit néanmoins se reconnecter régulièrement à internet pour pousser ses analytics et recevoir les commandes queueées — mais les garde-fous actuels ne couvrent qu'une minorité de la flotte (sites mesh, seuil 24h), et **aucun mécanisme automatique ne rappelle au club de reconnecter son Pi**. Les patterns techniques existent (in-app + email CRON), ils n'ont juste pas été appliqués au cas Pi reconnect (cf. ADR-122 pour le plan).

## Périmètre

- **Inclus** : la promesse produit "Pi reconnecté au minimum 1×/mois", l'état actuel des détections cloud-side, le mécanisme de reconnexion adaptative côté Pi, la maintenance de `sites.last_seen_at`, le drain de queue à la reconnexion, et les **gaps connus** vs la promesse commerciale.
- **Couvre** : table `sites.last_seen_at`, service `network-alerts.service.ts` (mesh-only), agent Pi `agent.js`, alertes `alert_type` (mesh_offline_extended et autres ponctuelles).
- **Hors périmètre** : la détection physique de la connectivité réseau du Pi (hotspot, WiFi client — cf. `hotspot-psk.spec.md`), la résolution des incidents (dépend du support humain), le SLA contractuel client (sujet commercial), l'implémentation des rappels Pi reconnect (cf. ADR-122).

## ⚠️ Promesse produit vs réalité technique — les écarts

**Promesse commerciale offre Pi** (cf. `.claude/rules/context.md`) :

> "Pi reconnecté au minimum 1×/mois pour push analytics + pull MAJ config."

**Réalité technique au 2026-05-14** :

| Mécanisme                                                                           | État                                                                            | Périmètre                      | Destinataire                   |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------ | ------------------------------ |
| Alerte instantanée à la déconnexion Pi (`alertingService.siteOffline()`, grace 60s) | ✅ Implémenté                                                                   | Tous Pi (au moment de la déco) | Équipe MADXP (Slack/dashboard) |
| Alerte Pi mesh offline > 24h via CRON 4h (`network-alerts.service.ts:220-233`)      | ✅ Implémenté                                                                   | **Sites mesh uniquement**      | Équipe MADXP                   |
| Alerte Pi simple/ethernet/enterprise offline > 24h                                  | ❌ Inexistant                                                                   | n/a                            | n/a                            |
| Alerte Pi offline > 30 jours (générique)                                            | ❌ Inexistant                                                                   | n/a                            | n/a                            |
| Email automatique au club "Pensez à reconnecter votre Pi"                           | ❌ Inexistant                                                                   | n/a                            | n/a                            |
| Notification in-app télécommande "Dernière sync il y a X jours"                     | ❌ Inexistant (le pattern existe pour abonnements, pas appliqué à Pi reconnect) | n/a                            | n/a                            |
| Sanction technique (désactivation après N jours)                                    | ❌ Inexistant                                                                   | n/a                            | n/a                            |

→ **La promesse "1 mois max" n'est pas tenue par le système**. Elle repose entièrement sur la bonne volonté du club et la vigilance opérationnelle de MADXP.

## Règles métier (état actuel)

### Côté cloud — détection Pi offline (limitée)

- **Source de vérité** : `sites.last_seen_at` (TIMESTAMPTZ).
- **Mises à jour** par `socket.service.ts` à 3 événements :
  - Connexion Socket.IO Pi → cloud (line 373)
  - Heartbeat applicatif (line 455)
  - Déconnexion gracieuse (line 723)
- **Détection mesh-only** par `network-alerts.service.ts:220-233` :
  ```typescript
  // Risk 5: Site offline depuis longtemps en mesh
  if (site.status === 'offline' && (profile.type === 'mesh' || profile.type === 'mesh_isolated')) {
    if (hoursSinceLastSeen > 24) {
      risks.push({ riskType: 'mesh_offline_extended', severity: 'critical', ... });
    }
  }
  ```
  Avec un filtre SELECT amont `WHERE network_profile IS NOT NULL` (line 121). Donc **uniquement les sites pour lesquels un profil réseau mesh a été détecté**.
- **Alerte ponctuelle** : `alertingService.siteOffline()` avec `OFFLINE_GRACE_PERIOD_MS = 60s` (évite le bruit Railway flip-flops 3-16s). Cible : admin MADXP uniquement.

### Côté Pi — reconnexion adaptative

`raspberry/sync-agent/src/agent.js:50` configure Socket.IO client :

| Paramètre              | Valeur     | Effet                                                 |
| ---------------------- | ---------- | ----------------------------------------------------- |
| `reconnection`         | `true`     | Retry automatique sur disconnect                      |
| `reconnectionDelay`    | `1000` ms  | Délai initial entre tentatives                        |
| `reconnectionDelayMax` | `15000` ms | Délai max (exponential backoff plafonné)              |
| `maxReconnectAttempts` | `10`       | Après 10 échecs successifs, log `exhausted reconnect` |
| `timeout`              | `5000` ms  | Timeout par tentative                                 |

Après épuisement des 10 tentatives, le sync-agent **log un message d'erreur** mais ne tue pas le process — il reste idle, et un nouveau cycle de tentatives peut être déclenché manuellement (restart service, signal applicatif, etc.). Côté Pi en pratique : `systemd` redémarre le service en cas de crash dur, donc dans les faits le retry reprend.

⚠️ **Limite importante** : le Pi tente de se reconnecter UNIQUEMENT quand de l'internet est disponible côté club. Si le club coupe internet 6 mois, le Pi reste offline 6 mois — aucune logique applicative ne le force à demander la reconnexion.

### Drain de la queue à la reconnexion

Quand un Pi se reconnecte (cf. [command-queue.spec.md](../services/command-queue.spec.md)) :

1. Le `pending-commands-drain.task.ts` tourne déjà toutes les 30s en CRON cloud
2. Au prochain tick après reconnexion, `socketService.getConnectedSites()` inclut le Pi reconnecté
3. Toutes les commandes `pending_commands` queueées pour ce site sont délivrées dans l'ordre `(priority ASC, created_at ASC)`
4. Latence max entre reconnexion et drain : 30s

## Patterns existants à réutiliser pour Pi reconnect (cf. ADR-122)

Trois patterns sont implémentés dans le code pour des cas similaires — l'ADR-122 propose de les adapter au cas Pi reconnect.

### Pattern 1 — Warning in-app via télécommande (modèle subscription)

`subscription.service.ts:181-213` retourne un champ `message_remote` que le Pi affiche dans la télécommande quand le staff la consulte. Seuils existants pour les abonnements : 30 j / 7 j / expired+grace / blocked. **Limite** : Pi doit être online pour fetcher le message — donc à coupler avec un stockage local Pi-side du `last_cloud_sync_at`.

### Pattern 2 — Email CRON aux admins MADXP (modèle rapport périodique)

`cron-tasks/report.task.ts:34-50` envoie un rapport résumé périodique par email à tous les users avec `role IN ('admin', 'super_admin')`. **Réutilisable directement** pour notifier l'équipe MADXP d'un Pi orphelin (offline > N jours).

### Pattern 3 — Email CRON via contact_email (modèle rapport mensuel sponsor)

`monthly-reports.service.ts:512-527` envoie un PDF mensuel via `emailService.sendSponsorReport(contactEmail, ...)` à `site_sponsors.contact_email`. **Limite pour l'appliquer au club** : la table `sites` n'a pas de colonne `contact_email` aujourd'hui — il faut une migration DB pour ajouter `sites.contact_email` avant de pouvoir notifier les clubs par email.

## Comportements observables (état actuel)

| Situation                                  | Comportement attendu                                                                           |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Pi connecté, push heartbeat OK             | `last_seen_at` mis à jour à `NOW()`                                                            |
| Pi disconnect Socket.IO                    | `last_seen_at` figé, alerte `siteOffline` après 60s grace                                      |
| Pi mesh offline depuis 23h59m              | Aucune alerte 24h (sous seuil)                                                                 |
| Pi mesh offline depuis 24h01m              | Alerte `mesh_offline_extended` au prochain tick CRON 4h                                        |
| Pi simple/ethernet offline depuis 30 jours | **Aucune alerte spécifique** (gap connu)                                                       |
| Pi offline depuis 6 mois                   | **Aucune notification active** ni au club, ni à MADXP au-delà de l'alerte initiale (gap connu) |
| Pi reconnecte après 3 jours offline        | Toutes commandes pending délivrées dans les 30s                                                |
| Pi a épuisé 10 tentatives reconnect        | Log local `exhausted reconnect`, service idle. systemd peut restart                            |

## Risques et angles morts connus (= gaps)

- ❌ **Pas de garde-fou générique "Pi offline depuis N jours"** : seul le profil mesh est couvert. La majorité de la flotte (sites simples + ethernet + enterprise) peut rester offline ad vitam sans signal.
- ❌ **Pas de canal d'alerte vers le club** : aucune colonne `contact_email` sur `sites`, aucun email automatique, aucune notification in-app dédiée. Le club doit deviner qu'il faut reconnecter le Pi.
- ❌ **Pas de notif active** sur l'alerte `siteOffline` au-delà de la déco initiale : si MADXP rate le ping initial, le Pi devient orphelin silencieux.
- ⚠️ **Pas d'auto-resolve `site_offline`** : quand un Pi reconnecte après une alerte, la row reste `status = 'active'` jusqu'à action manuelle.
- ⚠️ **Pas de seuil per-tier** : un site Premium et un site Free ont le même comportement (= aucun garde-fou pour les non-mesh). Si commercial veut différencier les SLA, c'est une feature à ajouter.
- ⚠️ **`last_seen_at` ne distingue pas "Pi crashé" de "Pi sans internet"** : du point de vue cloud, c'est identique (silence radio). Diagnostic nécessite SSH/visite physique.

## Plan de résolution — ADR-122

Les gaps ci-dessus sont adressés par **[ADR-122](../../adr/ADR-122-pi-connectivity-reminders.md)** (Proposé), qui couvre :

- **Option α** : `last_cloud_sync_at` Pi-side + `message_remote` permanent affiché dans la télécommande ("Dernière sync : il y a X jours, reconnectez le Pi à internet pour vos analytics") — Pattern 1 adapté
- **Option β** : nouvelle colonne `sites.contact_email` + nouveau CRON task `executePiOfflineReminderTask` qui envoie un email au club à J+15, J+25, J+35 d'offline — Pattern 3 adapté
- **Garde-fou générique cloud** : étendre `network-alerts.service.ts` pour couvrir les sites non-mesh avec un seuil configurable (default 14 jours) — comble le gap actuel

Statut implémentation : **validé par le fondateur (2026-05-14)**, à implémenter dans une PR dédiée.

## Cas d'edge

- **Pi flip-flop rapide (3-16s)** : Railway peut couper la connexion Socket.IO en moins de 16s sur du load balancing. L'alerte `siteOffline` utilise `OFFLINE_GRACE_PERIOD_MS = 60s` pour ne pas générer de faux positifs. Conséquence : un Pi qui flip-flop en boucle (jamais stable > 60s) reste perçu comme "offline" sans alerte intermittente.
- **Pi neuf jamais bootstrappé** : sans `network_profile` détecté en DB, le check 24h-mesh ne s'applique pas. Pas non plus d'alerte générique aujourd'hui. Le Pi est invisible jusqu'à ce qu'un humain remarque dans le dashboard.
- **Pi reconnecte 1 seconde puis re-disconnect** : un tick CRON drain peut le manquer (latence 30s). Au prochain tick, le Pi est de nouveau offline. Les commandes pending restent. C'est OK pour la queue, mais l'alerte `siteOffline` peut être créée et la résolution manuelle n'a jamais lieu.
- **`last_seen_at` figé mais Pi en réalité online** : si un bug dans `socket.service.ts` empêche la maj `last_seen_at` (régression heartbeat ou config-sync), le Pi paraîtra offline indéfiniment côté dashboard alors qu'il fonctionne. À diagnostiquer via logs heartbeat côté Pi.
- **Horloge Pi désynchronisée NTP** : si le Pi ne sait pas l'heure, le `last_local_edit_at` envoyé au cloud peut être dans le passé (Pi neuf sans NTP au boot) ou dans le futur (RTC dérive). Impact sur 3-way merge (ADR-120 Phase 4) : à mitiger côté cloud en clampant les timestamps à `[NOW() - 1 an, NOW()]`.
- **Notification télécommande "Dernière sync il y a X jours" affiche 0** alors que le Pi est offline : si `last-cloud-sync.json` (Option α ADR-122) est manquant ou corrompu sur le filesystem Pi, l'endpoint `/api/connectivity-status` peut renvoyer un état faux. Fallback : afficher "Sync inconnue" plutôt que "0 j".
- **Email rappel envoyé après que le club a déjà reconnecté** : race CRON quotidien vs reconnexion Pi. Mitigation Phase 3 ADR-122 : vérifier `last_seen_at` au moment de l'envoi email (et pas seulement au moment du SELECT batch initial).

## Ce qui n'est PAS dans cette SPEC

- **Garde-fou côté Pi qui force la reconnexion** : le Pi tente de se reconnecter quand internet est disponible, mais ne demande pas activement de la connectivité. Pas dans le scope de cette spec (et probablement pas faisable techniquement sans matériel additionnel type 4G dongle).
- **Mécanisme de "réveil" via SMS, 4G backup, etc.** : pas implémenté. Discussion commerciale.
- **Dégradation des features après N jours offline** : aucune logique de "déclassement progressif" Pi-side. Le Pi fonctionne normalement aussi longtemps que sa config locale est valide.
- **Implémentation des Options α / β** : voir ADR-122.

## Success Metrics (cibles post-ADR-122)

- 95 % des Pi de la flotte ont un `last_seen_at < NOW() - 30 days` (mesure mensuelle).
- 0 Pi avec `last_seen_at < NOW() - 60 days` (= Pi orphelin à investiguer humainement).
- Délai entre Pi orphelin et email rappel au club : ≤ 4h après dépassement du seuil J+15.
- Taux de reconnexion Pi dans les 7 jours suivant l'email rappel : > 70 % (à mesurer post-déploiement).

## Référence

- [ADR-001](../../adr/ADR-001-edge-cloud-architecture.md) — autonomie locale
- [ADR-111](../../adr/ADR-111-alert-repository-dedup.md) — dédup alerts (évite spam si Pi reste offline)
- [ADR-120](../../adr/ADR-120-pi-saas-ownership-model.md) — modèle ownership Pi vs SaaS
- [ADR-122](../../adr/ADR-122-pi-connectivity-reminders.md) — plan d'implémentation des rappels (α + β)
- `central-server/src/services/network-alerts.service.ts` — CRON détection mesh-only
- `central-server/src/services/subscription.service.ts` — pattern in-app `message_remote`
- `central-server/src/services/monthly-reports.service.ts` — pattern email via `contact_email`
- `central-server/src/cron-tasks/report.task.ts` — pattern email admin MADXP
- `central-server/src/services/socket.service.ts` — maj `last_seen_at`
- `raspberry/sync-agent/src/agent.js` — Socket.IO reconnect adaptatif
- [command-queue.spec.md](../services/command-queue.spec.md) — drain à la reconnexion
