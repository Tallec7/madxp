# 2026-04-16 — Fix CSP + reverse proxy Socket.IO côté admin Pi

## Problème

Sur le panneau admin du Pi (`http://neopro.local:8080`), le client Socket.IO ne se chargeait pas et le dashboard ne se rafraîchissait plus en temps réel. Logs :

```
Loading the script 'http://neopro.local:3000/socket.io/socket.io.js' violates the
following Content Security Policy directive: "script-src 'self' 'unsafe-inline'".
[realtime] Socket.IO client not available on :3000
```

### Cause

- `public/index.html` chargeait Socket.IO via URL absolue construite sur `window.location.hostname + ':3000'`.
- La CSP de `admin-server.js` était `script-src 'self'` → toute origine distincte du port 8080 bloquée, peu importe le hostname (`neopro.local`, IP LAN, `localhost`).

## Solution — Reverse proxy interne `/socket.io/*`

`admin-server` proxifie `/socket.io/*` vers `127.0.0.1:3000` en interne. Conséquence : le client charge Socket.IO sur la **même origine** que l'admin UI, donc aucune violation CSP possible, quel que soit le hostname d'accès.

### Nouveaux fichiers

- `raspberry/admin/socket-proxy.js` — reverse proxy HTTP + WebSocket basé sur le module `http` natif (zéro dépendance). Expose `createSocketHttpProxy()`, `attachSocketWsProxy(server)`, `pingSocketServer()`.
- `raspberry/admin/__tests__/socket-proxy.test.js` — 16 tests de non-régression (wiring proxy, ordre middlewares, CSP, chemins relatifs dans `index.html` et `realtime.js`).

### Fichiers modifiés

| Fichier                                           | Changement                                                                                                                                            |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `raspberry/admin/admin-server.js`                 | Import `http` + socket-proxy · `http.createServer(app)` remplace `app.listen` · proxy monté avant body parsers · health endpoint inclut `socketProxy` |
| `raspberry/admin/public/index.html`               | `<script src="/socket.io/socket.io.js">` (chemin relatif)                                                                                             |
| `raspberry/admin/public/modules/core/realtime.js` | `io({})` sans URL absolue (même origine)                                                                                                              |
| `raspberry/admin/README.md` + `MODULES.md`        | Doc du nouveau fichier + nature du proxy                                                                                                              |
| `docs/technical/ARCHITECTURE.md`                  | Nouvelle section "Admin UI → Socket.IO (reverse proxy)" + arborescence mise à jour                                                                    |
| `docs/guides/TROUBLESHOOTING.md`                  | Nouvelle entrée #43 avec symptômes, diagnostic, commandes curl                                                                                        |
| `.claude/rules/raspberry.md`                      | Section "NE JAMAIS FAIRE — Admin Server (:8080) & Socket.IO proxy" (4 règles)                                                                         |

## Monitoring

`GET /api/admin/health` expose désormais :

```json
{
  "status": "ok",
  "socketProxy": {
    "reachable": true,
    "status": 200,
    "latencyMs": 3
  }
}
```

`reachable: false` signale un socket-server down → le panneau admin peut afficher un état dégradé immédiatement, sans attendre qu'un client Socket.IO tente de se connecter.

## Prévention des régressions

Tests statiques dans `__tests__/socket-proxy.test.js` qui verrouillent l'invariant à chaque `npm test` :

- Le proxy est monté **avant** `express.json()` et `express.urlencoded()` (sinon les POSTs Socket.IO polling sont consommés).
- `admin-server.js` utilise `http.createServer(app)` (indispensable pour hooker l'event `upgrade` WebSocket).
- La CSP ne contient plus `:3000` ni `ws://` (le proxy est la source de vérité).
- `index.html` ne contient plus `window.location.hostname + ':3000'`.
- `realtime.js` appelle `io({})` sans URL.

Règles documentées dans `.claude/rules/raspberry.md` → chargées automatiquement par les futures éditions sur `raspberry/admin/`.

## Déploiement

```bash
# 1. Regénérer app.js depuis les modules
cd raspberry/admin/public && bash build-admin.sh

# 2. Build + déploiement normal du Pi (OTA)
# admin-server.js + socket-proxy.js sont packagés via build-raspberry.sh
```

## Tests

- `raspberry/admin` : **204/207** Jest pass (16 nouveaux tests socket-proxy, 3 échecs préexistants sur `sponsor.service.test.js` non liés à ce fix).
- `node -c` OK sur `admin-server.js` et `socket-proxy.js`.
