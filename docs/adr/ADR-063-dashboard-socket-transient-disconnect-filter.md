# ADR-063: Filtrage des déconnexions transitoires WebSocket côté dashboard

**Date** : 2026-04-18
**Statut** : Accepté
**Format** : Léger

---

## Contexte

Le dashboard central Angular (hébergé Hostinger) ouvre une connexion Socket.IO vers `central-server` (Railway). Depuis l'intensification des modifications `socket.service.ts` côté serveur début avril 2026 (SaaS relay, master-slave TV sync, SaaS registration — commits 06650c93 → 2264bfea), les utilisateurs observent des warnings récurrents dans la console navigateur :

```
[WARN] Socket disconnected from central server {reason: 'transport close'}
```

Diagnostic :

- `transport close` correspond à une coupure côté transport (proxy Railway qui recycle une connexion WS, redéploiement, flip-flop réseau court de 3-16s — déjà géré côté serveur par `OFFLINE_GRACE_PERIOD_MS`).
- Le client Socket.IO se reconnecte automatiquement (backoff exponentiel, lignes 50-56 de `socket.service.ts` dashboard). Dans 95 % des cas la reconnexion réussit en <3 s.
- Les warnings polluent la console et masquent les vrais problèmes.

## Décision

Sur le dashboard, différer de 3 s le log `warn` lorsque `reason === 'transport close'`. Si un `connect` arrive avant l'expiration du timer, le warn est annulé et rien n'est loggé. Toute autre raison (`io server disconnect`, `ping timeout`, `transport error`) est loggée immédiatement comme avant. Les compteurs Prometheus côté serveur (`metricsService.recordSocketDisconnect(reason, 'dashboard')`) restent inchangés — la visibilité opérationnelle passe par les métriques, pas les logs console.

## Alternatives rejetées

- **Passer `pingInterval` serveur de 10 s à 25 s** : rejeté car `pingInterval` est global Socket.IO — ça dégraderait aussi la détection des Pi offline (passe de ~30 s à ~45 s, cumulé au grace period de 60 s → alerte Slack ~2 min 15 s). Inacceptable pour le support opérationnel (NLF, matchs live).
- **Supprimer complètement le warn `transport close`** : rejeté car masquerait les vrais cas de coupure longue durée (Railway down, token JWT expiré, réseau client HS).
- **Middleware Socket.IO avec `pingInterval` différencié par `clientType`** : prometteur mais Socket.IO ne supporte pas nativement des intervalles par socket — nécessiterait un fork ou un ping custom applicatif. Reporté (potentiel ADR ultérieur si le problème persiste).

## Conséquences

- **Positif** : console dashboard propre, les vrais problèmes (reconnexion impossible, erreurs d'auth) restent visibles. Les métriques serveur continuent d'alimenter les alertes hourly (`websocket_disconnects_1h` dans `alerting-checks.service.ts`).
- **Négatif / risque** : un flip-flop court très fréquent (ex : >100 /heure) serait silencieux côté dashboard. Mitigation : l'alerting serveur `websocket_disconnects_1h` détectera la dégradation via les métriques Prometheus, indépendamment des logs console.
- **Régression protection** : smoke test `ADR-063: SocketService transient disconnect filter` dans `smoke-dashboard-guards.test.ts` vérifie la présence du timer de grâce (5 assertions).

## Fichiers impactés

- `central-dashboard/src/app/core/services/socket.service.ts` — ajout `pendingDisconnectWarnTimer` + `transientDisconnectGraceMs = 3000` ; le warn `transport close` est différé et annulé sur `connect` réussi
- `central-server/src/__tests__/smoke/smoke-dashboard-guards.test.ts` — describe `ADR-063: SocketService transient disconnect filter` (5 assertions)
- `.claude/rules/dashboard.md` — section "Socket client (ADR-063)" : interdiction de retirer le grace timer
- `docs/adr/README.md` — référence ADR-063
- `docs/changelog/2026-04-18_dashboard-socket-transient-disconnect-filter.md` — entrée changelog
