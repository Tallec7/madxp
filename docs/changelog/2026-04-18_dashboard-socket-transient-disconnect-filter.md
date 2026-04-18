# 2026-04-18 — Dashboard : filtrage des déconnexions WebSocket transitoires

**ADR** : [ADR-063](../adr/ADR-063-dashboard-socket-transient-disconnect-filter.md)
**Type** : fix
**Scope** : dashboard / observability

## Problème

Depuis la série de modifications `socket.service.ts` côté central-server début avril 2026 (SaaS relay, master-slave TV sync, SaaS registration), la console du dashboard affichait régulièrement :

```
[WARN] Socket disconnected from central server {reason: 'transport close'}
```

suivi d'une reconnexion silencieuse en <3s. Root cause = flip-flop du proxy Railway (recycling de connexion WS, micro-redéploiements). Les warnings polluaient la console et masquaient les vrais incidents (auth, reconnexion impossible).

## Solution

Sur `SocketService` ([central-dashboard/src/app/core/services/socket.service.ts](../../central-dashboard/src/app/core/services/socket.service.ts)) :

- Ajout d'un grace period de 3s avant de logger un warn pour `reason === 'transport close'`
- Le handler `connect` annule le timer si la reconnexion réussit avant expiration
- Les autres raisons (`io server disconnect`, `ping timeout`, `transport error`) restent loggées immédiatement
- La méthode `disconnect()` nettoie aussi le timer (évite fuite)

## Supervision inchangée

Les métriques Prometheus côté serveur continuent de capter tous les disconnects :

- `metricsService.recordSocketDisconnect(reason, 'dashboard')` dans [central-server/src/services/socket.service.ts:294](../../central-server/src/services/socket.service.ts) → alimente le counter `websocket_disconnects_total`
- `alerting-checks.service.ts` évalue `websocket_disconnects_1h` pour déclencher des alertes si le taux dépasse le seuil

Concrètement : si un cluster de flip-flops persiste (> 50/h), l'alerting Slack se déclenche **sans** qu'on ait à réactiver le spam console.

## Non-régression

Smoke test `ADR-063: SocketService transient disconnect filter` dans [smoke-dashboard-guards.test.ts](../../central-server/src/__tests__/smoke/smoke-dashboard-guards.test.ts) vérifie :

1. Présence de `transientDisconnectGraceMs = 3000` et `pendingDisconnectWarnTimer`
2. Branche `'transport close'` utilise `setTimeout(..., graceMs)`
3. Handler `connect` appelle `clearTimeout(pendingDisconnectWarnTimer)`
4. Warn immédiat conservé dans le `else` pour les autres raisons
5. Méthode `disconnect()` nettoie le timer

Règle `.claude/rules/dashboard.md` (section "Socket client") protège contre le reverter.

## Alternative évaluée et rejetée

Passer `pingInterval` serveur de 10s → 25s aurait réduit la fréquence des coupures, mais `pingInterval` est global Socket.IO → dégrade aussi la détection des Pi offline (~30s → ~45s, cumulé à `OFFLINE_GRACE_PERIOD_MS=60s` → alerte Slack en ~2 min 15s). Inacceptable pour le support opérationnel NLF et matchs live. Voir ADR-063 §Alternatives.

## Fichiers modifiés

- `central-dashboard/src/app/core/services/socket.service.ts`
- `central-server/src/__tests__/smoke/smoke-dashboard-guards.test.ts`
- `.claude/rules/dashboard.md`
- `docs/adr/ADR-063-dashboard-socket-transient-disconnect-filter.md` (nouveau)
- `docs/adr/README.md`
- `docs/changelog/2026-04-18_dashboard-socket-transient-disconnect-filter.md` (ce fichier)
