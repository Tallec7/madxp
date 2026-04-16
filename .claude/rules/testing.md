# Règles de Tests

## Smoke tests — utilisation intelligente

Après avoir modifié du code dans `central-server/`, `raspberry/`, ou `central-dashboard/`, **toujours** lancer les smoke tests pour vérifier les régressions de wiring.

**Préférer `npm run test:smoke:smart`** à `npm run test:smoke` :

- `test:smoke:smart` détecte automatiquement les fichiers modifiés (git diff) et ne lance que les suites pertinentes
- Beaucoup plus rapide (~2-5s pour 1 suite vs ~28s pour les 13)
- Utiliser `test:smoke` (tout) uniquement avant un commit final ou en cas de doute

Les 13 suites smoke et leurs domaines :

| Suite                      | Domaine                                                     |
| -------------------------- | ----------------------------------------------------------- |
| `smoke-server-core`        | Health, routes, auth, CORS, validation, security headers    |
| `smoke-wiring`             | Socket.IO, services, repos, middleware exports              |
| `smoke-consistency`        | Pi config, route/handler/repo file consistency              |
| `smoke-socket-realtime`    | Alerting, remote relay, socket properties                   |
| `smoke-kiosk-pi`           | Kiosk, GPU, watchdog, admin panel, systemd                  |
| `smoke-display`            | E-22/E-23, HDMI, resolution, TV component                   |
| `smoke-network-wifi`       | WiFi, hotspot, bgscan, IPv6, reconnection                   |
| `smoke-analytics-sponsors` | Analytics, sponsor stats, weighted rotation                 |
| `smoke-deploy-ota`         | OTA, deployment, canary                                     |
| `smoke-dashboard-guards`   | Dashboard DataService extraction, validation, SQL injection |
| `smoke-saas`               | Club portal, SaaS/ADR-037                                   |
| `smoke-adr-refactoring`    | Multi-profile, SAFe, ADR-035/041/042/043                    |
| `smoke-remotion`           | Remotion async render + template versions (ADR-054/055)     |

Pour lancer une suite spécifique manuellement :

```bash
cd central-server && npx jest --testPathPattern='smoke/smoke-saas' --no-coverage --forceExit
```

## Quand lancer quels tests

| Action                    | Commande                                            |
| ------------------------- | --------------------------------------------------- |
| Modif dans central-server | `npm run test:smoke:smart`                          |
| Modif controller/service  | `npm run test:smoke:smart` + `npm run test:server`  |
| Modif dashboard Angular   | `npm run test:smoke:smart` + `npm run test:central` |
| Modif raspberry/server    | `cd raspberry/server && npm test`                   |
| Modif raspberry/admin     | `cd raspberry/admin && npm test`                    |
| Avant commit final        | `npm run test:smoke` (all)                          |
