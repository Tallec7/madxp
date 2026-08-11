# Règles de Tests

## Smoke tests — utilisation intelligente

Après avoir modifié du code dans `central-server/`, `raspberry/`, ou `central-dashboard/`, **toujours** lancer les smoke tests pour vérifier les régressions de wiring.

**Préférer `npm run test:smoke:smart`** à `npm run test:smoke` :

- `test:smoke:smart` détecte automatiquement les fichiers modifiés (git diff) et ne lance que les suites pertinentes
- Beaucoup plus rapide (~2-5s pour 1 suite vs ~28s pour les 13)
- Utiliser `test:smoke` (tout) uniquement avant un commit final ou en cas de doute

Les 13 suites smoke et leurs domaines :

| Suite                         | Domaine                                                                |
| ----------------------------- | ---------------------------------------------------------------------- |
| `smoke-server-core`           | Health, routes, auth, CORS, validation, security headers               |
| `smoke-wiring`                | Socket.IO, services, repos, middleware exports                         |
| `smoke-consistency`           | Pi config, route/handler/repo file consistency                         |
| `smoke-socket-realtime`       | Alerting, remote relay, socket properties                              |
| `smoke-kiosk-pi`              | Kiosk, GPU, watchdog, admin panel, systemd                             |
| `smoke-display`               | E-22/E-23, HDMI, resolution, TV component                              |
| `smoke-network-wifi`          | WiFi, hotspot, bgscan, IPv6, reconnection                              |
| `smoke-analytics-sponsors`    | Analytics, sponsor stats, weighted rotation                            |
| `smoke-deploy-ota`            | OTA, deployment, canary                                                |
| `smoke-dashboard-guards`      | Dashboard DataService extraction, validation, SQL injection            |
| `smoke-saas`                  | Club portal, SaaS/ADR-037                                              |
| `smoke-adr-refactoring`       | Multi-profile, SAFe, ADR-035/041/042/043                               |
| `smoke-remotion`              | Remotion async render + template versions (ADR-054/055)                |
| `smoke-prop003-scoreboard`    | PROP-003 corrections protocolaires + simulateurs dev (F-15.2)          |
| `smoke-service-test-coverage` | Garde-fou : tout nouveau `src/services/*.service.ts` a au moins 1 test |
| `smoke-test-port-isolation`   | Garde-fou : aucune suite ne fixe de port d'écoute (anti-`EADDRINUSE`)  |

Pour lancer une suite spécifique manuellement :

```bash
cd central-server && npx jest --testPathPattern='smoke/smoke-saas' --no-coverage --forceExit
```

## Ne JAMAIS fixer un port d'écoute dans un test

Importer `src/server.ts` démarre un vrai serveur HTTP. Sous test, il écoute sur le
port **0** (éphémère, attribué par l'OS) — ne jamais réintroduire
`process.env.PORT = 'NNNN'` dans une suite.

Le registre de ports tenu à la main (3096→3109, « pour éviter les conflits »)
comptait déjà deux doublons : Jest parallélise les suites sur des process distincts,
donc deux d'entre elles écoutaient le même port au même instant → `EADDRINUSE` puis
« Server is not running. » en cascade. Un échec **aléatoire**, sur une suite
étrangère au changement testé. Le port 0 supprime la classe entière de bugs.

`supertest(app)` monte son propre listener : aucun test n'a besoin de ce port.
Enforced par `smoke-test-port-isolation.test.ts`.

## Nouveau service `.service.ts` → 1 test minimum

Tout nouveau fichier `central-server/src/services/*.service.ts` doit s'accompagner
d'un `.service.test.ts` (à côté ou dans `__tests__/`) qui importe et exerce au moins
la fonction principale. Enforced par `smoke-service-test-coverage.test.ts`.

L'allowlist `LEGACY_SERVICES_WITHOUT_TEST` est gelée — ne pas y ajouter de nouveau
service. Quand un legacy est testé, retirer son entrée dans la même PR.

Cible : faire fondre l'allowlist (23 entrées au démarrage, objectif <10 en 6 mois)
pour pouvoir durcir le seuil `coverageThreshold.functions` (41 → 50 → 60).

## Quand lancer quels tests

| Action                    | Commande                                            |
| ------------------------- | --------------------------------------------------- |
| Modif dans central-server | `npm run test:smoke:smart`                          |
| Modif controller/service  | `npm run test:smoke:smart` + `npm run test:server`  |
| Modif dashboard Angular   | `npm run test:smoke:smart` + `npm run test:central` |
| Modif raspberry/server    | `cd raspberry/server && npm test`                   |
| Modif raspberry/admin     | `cd raspberry/admin && npm test`                    |
| Avant commit final        | `npm run test:smoke` (all)                          |

## Convention nommage — tests régression incident

Tout incident P0/P1 fixé en prod doit avoir un smoke test dédié :

```
central-server/src/__tests__/smoke/smoke-<domaine>-incident-<YYYY-MM-DD>.test.ts
```

- `<domaine>` = suite smoke existante la plus proche (saas, sync, display, network-wifi…)
- `<YYYY-MM-DD>` = date de l'incident (pas du fix)
- Le test doit **échouer** si le bug revenait — ce n'est pas un test de feature, c'est un garde-fou
- Citer le test dans le message du commit fix : `fix(saas): ... — guard: smoke-saas-incident-2026-05-08`
- Entrée dans `docs/runbooks/INCIDENT-LOG.md` (colonne "Test régression")
