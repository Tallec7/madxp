# Phase 6: CAPTIVE — Fire Stick → page Neopro — Research

**Researched:** 2026-05-06
**Domain:** Pi-side captive portal (dnsmasq DNS hijack + nginx) + dynamic MAC→display routing
**Confidence:** HIGH (POC validé 2026-05-05 sur Pi RACC + reuse confirmé du stack ADR-079 captive existant)

## Summary

Phase 6 industrialise un POC déjà validé en conditions réelles le 2026-05-05 (Pi RACC, Fire Stick `0C:43:F9:36:04:77`). Le mécanisme est connu et fonctionnel ; le travail consiste à (1) **généraliser via `install.sh` + `prepare-image.sh`** ce qui a été posé manuellement, (2) **router dynamiquement** la page atterrissage en fonction du mapping MAC→display tenu par `ReceiversService` (Phase 5), (3) **synchroniser** la page d'attente sur les changements d'assignment via Socket.IO (déjà disponible localement port 3000 — wiring Phase 5 plan 03 livré).

Le stack existant (ADR-079, `nginx-captive-portal.conf`, `dnsmasq.conf`, `setup-captive-portal-iptables.sh`) couvre **déjà 80%** du besoin : nginx 80 default_server répond aux probes Apple/Android/Windows, dnsmasq hijacke les domaines connectivity check, iptables DNAT 80 (pas 443 — TLS handshake doit échouer pour qu'iOS ouvre la sheet captive). Phase 6 ajoute **deux briques** : (a) hijack des domaines Fire OS spécifiques (`firetvcaptiveportal.com`, `spectrum.s3.amazonaws.com`), (b) un endpoint dynamique côté `raspberry/server` (port 3000, derrière proxy nginx) qui résout `IP client → MAC → displayIndex` et renvoie soit redirect vers `/?display=N`, soit page d'attente.

**Primary recommendation:** Étendre les fichiers existants (`config/systemd/dnsmasq.conf` + `config/nginx/neopro-base.conf`) plutôt que créer des nouveaux fichiers `firestick-captive.*` séparés. Implémenter la résolution MAC via un endpoint Express `/api/captive/whoami` dans `raspberry/server` qui lit l'IP `req.socket.remoteAddress`, scanne `/proc/net/arp` (ou réutilise `receiversService.getReceivers()`), et retourne `{ mac, displayIndex|null }`. La page d'attente écoute `connected-receivers-changed` via Socket.IO local (déjà émis par `ReceiversService`).

## User Constraints (from CONTEXT.md)

CONTEXT.md absent — pas de phase `/gsd:discuss-phase` exécutée. Les contraintes ci-dessous proviennent de ROADMAP.md, REQUIREMENTS.md, VISION.md POC, et CLAUDE.md.

### Locked Decisions (déduits du contexte v4.0)

- **Pas de nouvelle table DB** — la source de vérité reste `sites.displays[i].receiver` (Phase 4 livrée)
- **Pas de modification de `hostapd.conf`** — ADR-074 invariant : la config PSK est gérée par sync-agent depuis le cloud (cf. `.claude/rules/hotspot-psk.md`)
- **Pattern modulaire `raspberry/server`** — orchestrateur `server.js` + `services/*.service.js` + `routes/*.js` (CLAUDE.md §Règles de code)
- **`console.info/warn` côté Pi** — pas de Winston dans `raspberry/server` (cohérent avec Phase 5 plan 01 ADR)
- **Repository pattern strict côté cloud** — N/A pour Phase 6 (Pi-only)
- **Configs nginx/dnsmasq déployées par `install.sh`** — pas de manipulation manuelle (REQ critère 5)
- **Socket.IO local port 3000** — déjà en place, déjà proxy `/socket.io/` par nginx (cf. `nginx-captive-portal.conf:122`)
- **Pas de DNAT 443** — invariant ADR-079 / `.claude/rules/raspberry.md` (smoke test enforced) : DNAT 80 only, le TLS handshake DOIT échouer pour iOS et Fire OS

### Claude's Discretion

- Choix entre extension `neopro-base.conf` vs nouveau fichier `neopro-captive-firestick.conf` séparé inclus via `include` nginx
- Choix du format page d'attente (HTML statique + polling JS vs SPA Angular réutilisée vs page mini-SSR servie par Express)
- Choix du mécanisme resolve IP→MAC (lecture `/proc/net/arp` côté Express vs reuse `ReceiversService._state` lookup inverse vs neighbor table via `ip` shell)
- Format URL d'atterrissage TV : `/?display=N` query string (cohérent avec PROP-002) vs route Angular dédiée `/firestick/:n`

### Deferred Ideas (OUT OF SCOPE — v4.1+)

- **APK TWA fullscreen** — l'URL bar Silk reste visible (acceptable MVP — Daisy pas bloquante)
- **Captive auto-launch boot** — bénévole doit lancer Silk manuellement après connexion Wi-Fi
- **Bouton "Réassigner" sur page Neopro** — pas de mécanisme physique côté Fire Stick pour rebasculer en attente
- **MAC allowlist hostapd** — PSK suffit, pas de filtrage MAC

## Phase Requirements

| ID         | Description                                              | Research Support                                                                                                                                       |
| ---------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CAPTIVE-01 | Fire Stick connecté → atterrit sur page servie par Pi    | Section "DNS hijack" (ajout 2 domaines Fire OS) + Section "Captive portal detection" (probe `/generate_204` + `/kindle-wifi/wifistub.html` déjà gérés) |
| CAPTIVE-02 | MAC assignée → page Neopro plein écran sur le bon display | Section "MAC↔IP resolution" (resolve via ARP + `siteRepository.getReceiverForDisplay`) + Section "Page Neopro plein écran" (`/?display=N`)              |
| CAPTIVE-03 | MAC non assignée → page d'attente avec MAC + auto-refresh | Section "Page d'attente" (HTML mini + Socket.IO `connected-receivers-changed` listener)                                                                |
| CAPTIVE-04 | Admin assigne MAC à distance → page Fire Stick bascule auto | Section "Page d'attente" (Socket.IO push depuis `state.service.setReceivers()` → reload) — wiring déjà en place Phase 5 plan 03                         |

## Architecture summary

### Composants en jeu

```
Fire Stick (Silk browser)
    │ DHCP from dnsmasq → IP 192.168.4.x
    │ Probes captive portal (DNS query firetvcaptiveportal.com)
    │
    ▼ DNS query
[dnsmasq port 53]  ─── address=/firetvcaptiveportal.com/192.168.4.1 ──► réponse 192.168.4.1
    │
    ▼ HTTP GET http://firetvcaptiveportal.com/...
[nginx port 80]
    │
    ├── /generate_204         → 204 (déjà géré)
    ├── /kindle-wifi/...      → 200 "Success" (Fire OS pop-up "Se connecter")
    ├── /api/captive/whoami   → proxy → raspberry/server :3000  ← NOUVEAU
    ├── /captive/wait         → static HTML (page d'attente)    ← NOUVEAU
    └── /                     → Angular webapp (Neopro TV)
              (avec query ?display=N pour sélectionner le display)

[raspberry/server :3000]
    ├── Express route /api/captive/whoami
    │       1. Lit req.socket.remoteAddress → IP
    │       2. Resolve IP → MAC (lookup ReceiversService._state OU /proc/net/arp)
    │       3. Pour MAC : interroge configuration.json local OU appelle siteRepository côté cloud
    │       4. Retourne { mac, displayIndex: number | null }
    │
    └── Socket.IO event 'connected-receivers-changed' (déjà émis Phase 5)
              ▲
              └── La page d'attente écoute cet event → reload sur match MAC
```

### Flux requête Fire Stick → page

| Étape | Acteur                | Action                                                                    |
| ----- | --------------------- | ------------------------------------------------------------------------- |
| 1     | Fire Stick (boot)     | Connect Wi-Fi NEOPRO-XXX, reçoit IP via DHCP dnsmasq                      |
| 2     | Fire OS               | Probe `http://firetvcaptiveportal.com/kindle-wifi/wifistub.html`         |
| 3     | dnsmasq               | DNS hijack → résout vers 192.168.4.1                                      |
| 4     | nginx :80             | Répond 200 "Success" → Fire OS marque réseau "connecté"                   |
| 5     | Bénévole              | Lance Silk manuellement (déféré : auto-launch v4.1+)                      |
| 6     | Silk                  | Ouvre URL par défaut (Bing/Amazon) → DNS hijacké → atterrit sur Pi nginx  |
| 7     | nginx /               | Servir page mini bootstrap qui appelle `/api/captive/whoami` via JS       |
| 8     | raspberry/server      | Resolve IP→MAC, lookup displayIndex                                       |
| 9     | Bootstrap JS          | Si `displayIndex !== null` → `window.location = '/?display=N'`            |
| 10    | Bootstrap JS          | Sinon → `window.location = '/captive/wait?mac=AA:BB:...'`                 |
| 11    | Page d'attente        | Affiche MAC, écoute Socket.IO, reload quand admin assigne                 |

### Ports & services

| Port | Service          | Rôle                                                       |
| ---- | ---------------- | ---------------------------------------------------------- |
| 53   | dnsmasq          | DNS hijack + DHCP                                          |
| 80   | nginx            | Captive portal probes + reverse proxy + static webapp       |
| 3000 | raspberry/server | Express + Socket.IO (proxified `/socket.io/` + `/api/`)     |
| 8080 | admin-server     | Admin panel local (déjà proxy par nginx `/admin/`)          |

## DNS hijack mechanism

### Domaines Fire OS à ajouter

Le POC a validé que Fire OS sonde **deux domaines** non couverts par `dnsmasq.conf` actuel :

```
# Ajouter à raspberry/config/systemd/dnsmasq.conf
address=/firetvcaptiveportal.com/192.168.4.1
address=/spectrum.s3.amazonaws.com/192.168.4.1
```

### Pièges Fire OS / Silk

| Piège                      | Statut                | Mitigation                                                                                          |
| -------------------------- | --------------------- | --------------------------------------------------------------------------------------------------- |
| **DoH forcé Amazon**       | Pas observé sur POC   | Fire OS sonde via DNS classique (port 53) — confirmé sur Pi RACC. À monitorer sur futurs Fire Sticks |
| **Pinning HTTPS**          | Évité                 | NE PAS DNAT 443 — laisser le TLS échouer fait basculer Fire OS sur le mode "captive" port 80         |
| **Wildcard hijack `address=/#/`** | Risqué        | Ne PAS faire — casserait la résolution interne du Pi (CDN externe via wlan1 si présent). Hijack ciblé uniquement |
| **Cache DNS Silk**         | Bénin                 | TTL court par défaut sur `address=/...` dnsmasq (60s) — POC montre refresh < 1min                    |
| **`address=/clients3.google.com/...`** | Interdit | Smoke test enforced (`.claude/rules/raspberry.md`) — Android utilise pour API réelles                 |

### Endpoints Fire OS connus (POC + recherche)

- `firetvcaptiveportal.com/kindle-wifi/wifistub.html` → attend `<title>Success</title>` body `Success`
- `spectrum.s3.amazonaws.com` → fallback sur certains firmwares
- `/generate_204` (Android base) → Fire OS = Android, garde la compat

## Captive portal detection

### Réponses HTTP attendues

| Endpoint                                          | OS         | Réponse correcte        | État dans `nginx-captive-portal.conf` |
| ------------------------------------------------- | ---------- | ----------------------- | ------------------------------------- |
| `/generate_204`                                   | Android    | `204 No Content`        | ✅ Déjà géré (ligne 15)               |
| `/gen_204`                                        | Android (legacy) | `204 No Content`  | ✅ Déjà géré (ligne 20)               |
| `/connecttest.txt`                                | Windows    | `200 "Microsoft Connect Test"` | ✅ Déjà géré (ligne 49)         |
| `/ncsi.txt`                                       | Windows    | `200 "Microsoft NCSI"`  | ✅ Déjà géré (ligne 54)               |
| `/hotspot-detect.html`                            | iOS/macOS  | `200` body `Success` ou page brandée | ✅ Déjà géré (ligne 28)    |
| `/library/test/success.html`                      | macOS      | `200 Success`           | ✅ Déjà géré (ligne 33)               |
| **`/kindle-wifi/wifistub.html`**                  | **Fire OS** | **`200` body `Success`** | ❌ **À AJOUTER**                    |

### Comportement Fire OS

Fire OS (basé Android 7-9 selon génération Fire Stick) :

1. À la connexion Wi-Fi, fait `GET http://firetvcaptiveportal.com/kindle-wifi/wifistub.html`
2. Si réponse `200` avec `<title>Success</title>` → marque réseau "Internet OK"
3. Si réponse différente → affiche pop-up "Se connecter au réseau" qui ouvre Silk sur l'URL résolue
4. Sonde aussi `/generate_204` Android base (déjà géré)

### Recommandation

Réutiliser le pattern `@captive_fallback` existant pour le bloc `kindle-wifi` :

```nginx
location = /kindle-wifi/wifistub.html {
    default_type text/html;
    return 200 '<!DOCTYPE html><html><head><title>Success</title></head><body>Success</body></html>';
    add_header Cache-Control "no-cache, no-store, must-revalidate";
}
```

## nginx config

### Recommandation : étendre `neopro-base.conf` + `nginx-captive-portal.conf`

Les deux fichiers existent déjà. Stratégie :

1. **`neopro-base.conf`** (sites-available/neopro, default_server) — reste le serveur principal Neopro webapp + captive endpoints généraux
2. **Ajouts ciblés** : 3 location blocks dans `neopro-base.conf`
3. **`nginx-captive-portal.conf`** : **NE PLUS UTILISER** — superseded par `neopro-base.conf` (vérifier avec Daisy si on archive ou supprime)

### Location blocks à ajouter dans `neopro-base.conf`

```nginx
# Fire OS captive probe
location = /kindle-wifi/wifistub.html {
    default_type text/html;
    return 200 '<!DOCTYPE html><html><head><title>Success</title></head><body>Success</body></html>';
    add_header Cache-Control "no-cache, no-store, must-revalidate";
}

# Captive whoami endpoint — proxy vers raspberry/server :3000
location = /api/captive/whoami {
    proxy_pass http://localhost:3000/api/captive/whoami;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    # CRITIQUE : transmettre l'IP cliente réelle (sinon Express voit 127.0.0.1)
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}

# Page d'attente Fire Stick — HTML statique servi par nginx
location = /captive/wait {
    root /home/pi/neopro/webapp;
    try_files /firestick-wait.html =404;
    add_header Cache-Control "no-cache, no-store, must-revalidate";
}
```

### Pourquoi `X-Real-IP` est critique

Express derrière nginx voit toujours `127.0.0.1` dans `req.socket.remoteAddress` si on ne forward pas l'IP cliente. Sans `X-Real-IP`, **impossible** de retrouver la MAC. Le code Express doit lire :

```javascript
const clientIp = req.headers['x-real-ip'] || req.socket.remoteAddress;
```

## MAC ↔ IP resolution pattern recommandé

### Trois sources possibles

| Source                            | Latence | Complétude                                      | Verdict                          |
| --------------------------------- | ------- | ----------------------------------------------- | -------------------------------- |
| `ReceiversService._state` (Map)   | < 1ms   | Toutes les MACs détectées (lease + ARP)         | ✅ **Préféré** — déjà en mémoire |
| `/proc/net/arp` (read sync)       | ~1-5ms  | Voisins ARP actifs                              | ⚠️ Fallback si state vide        |
| `ip neigh show` (shell exec)      | ~30ms   | Plus complet (REACHABLE/STALE/DELAY)            | ❌ Trop lent + spawn overhead    |

### Pattern recommandé : reverse-lookup dans ReceiversService

`ReceiversService` (Phase 5 plan 01) tient déjà `_state: Map<mac, {kind, lastSeenAt, displayIndex}>` mais **n'expose pas de reverse lookup IP→MAC**. dnsmasq.leases est lu mais l'IP n'est pas conservée dans le state.

**Recommandation** : étendre la value du Map pour conserver `ip` ou ajouter un second Map `_ipToMac: Map<ip, mac>` :

```javascript
// raspberry/server/services/receivers.service.js
// Dans _scanLeases() — extraire l'IP en plus de la MAC
const lines = fs.readFileSync(LEASES_PATH, 'utf8').split('\n');
for (const line of lines) {
  const [, mac, ip] = line.split(' '); // dnsmasq.leases format: ts mac ip name id
  if (!mac || !ip) continue;
  this._ipToMac.set(ip, mac.toLowerCase());
  // ... existing state update
}

// Nouvelle méthode publique
resolveMacByIp(ip) {
  return this._ipToMac.get(ip) || null;
}
```

### Snippet code orientation — endpoint Express

```javascript
// raspberry/server/routes/captive.js (NOUVEAU)
const express = require('express');
const router = express.Router();

module.exports = function createCaptiveRouter({ receiversService, configPath }) {
  router.get('/whoami', (req, res) => {
    const clientIp = req.headers['x-real-ip'] || req.socket.remoteAddress;
    const mac = receiversService.resolveMacByIp(clientIp);
    if (!mac) {
      return res.status(404).json({ error: 'mac_not_found', ip: clientIp });
    }

    // Lookup displayIndex dans configuration.json local (cache cloud)
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const displays = config.displays || [];
    const display = displays.find(
      (d) => d.receiver?.mac?.toLowerCase() === mac.toLowerCase()
    );

    return res.json({
      mac,
      displayIndex: display ? display.index : null,
      displayName: display ? display.name : null,
    });
  });

  return router;
};
```

### Edge cases

- **Fire Stick en ARP STALE** — pas dans `dnsmasq.leases` mais répond ping → fallback `arp -an` (déjà en place dans ReceiversService)
- **IP IPv6 link-local** — Fire Stick peut envoyer requête en IPv6 d'abord. nginx `listen [::]:80` (déjà dans `neopro-base.conf:11`) — extraire IPv4 du `req.socket.remoteAddress` (`::ffff:192.168.4.X` mapping)
- **Race detection** : Fire Stick fait HTTP avant que `_scanLeases` (10s) ne le vois. Solution : trigger un `_scanLeases()` synchrone au début du handler `/api/captive/whoami` si MAC absente

## Page d'attente

### Format recommandé : HTML statique mono-fichier

**Localisation** : `raspberry/webapp-captive/firestick-wait.html` (source dans repo) → copié dans `/home/pi/neopro/webapp/firestick-wait.html` par `build-raspberry.sh`.

**Pourquoi HTML statique vs SPA Angular** :

- **Taille** : ~5KB vs 500KB+ pour Angular bundle (Fire Stick basique = peu de RAM/CPU)
- **Démarrage** : instantané vs ~2s parse JS Angular
- **Indépendance** : ne dépend pas du build Angular Neopro (couplage zéro)
- **Maintenance** : une page d'attente change rarement, vivre dans un fichier dédié est plus simple

### Squelette page d'attente

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Neopro — En attente</title>
  <style>
    body { background: #000; color: #fff; font-family: sans-serif;
           display: flex; flex-direction: column; align-items: center;
           justify-content: center; height: 100vh; margin: 0; }
    .mac { font-size: 8rem; letter-spacing: 0.5rem; margin: 2rem 0; }
    .spin { animation: spin 2s linear infinite;
            border: 8px solid #333; border-top-color: #fff;
            border-radius: 50%; width: 80px; height: 80px; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <h1>En attente d'assignation</h1>
  <div class="mac" id="mac">--:--:--:--:--:--</div>
  <div class="spin"></div>
  <p>Communiquez ce code à votre administrateur</p>
  <script src="/socket.io/socket.io.js"></script>
  <script>
    const params = new URLSearchParams(location.search);
    const myMac = (params.get('mac') || '').toLowerCase();
    document.getElementById('mac').textContent = myMac.toUpperCase();

    // Connexion Socket.IO same-origin (proxy nginx)
    const socket = io({ transports: ['websocket', 'polling'] });

    socket.on('connected-receivers-changed', (payload) => {
      // payload.receivers: [{ mac, kind, lastSeenAt, displayIndex }]
      const me = payload.receivers.find(r => r.mac.toLowerCase() === myMac);
      if (me && me.displayIndex !== null) {
        // Admin a assigné → bascule
        window.location.href = '/?display=' + me.displayIndex;
      }
    });

    // Polling fallback (5s) — résilience si socket disconnect
    setInterval(async () => {
      try {
        const r = await fetch('/api/captive/whoami', { cache: 'no-store' });
        const d = await r.json();
        if (d.displayIndex !== null && d.displayIndex !== undefined) {
          window.location.href = '/?display=' + d.displayIndex;
        }
      } catch (e) { /* offline transitoire */ }
    }, 5000);
  </script>
</body>
</html>
```

### Mécanisme dual : Socket.IO + polling

- **Socket.IO** : push instantané quand admin assigne (latence < 200ms)
- **Polling 5s** : safety net si Socket.IO disconnect transitoire (Fire Stick éloigné du Pi)

Pourquoi pas que polling ? UX : 5s d'attente après l'assignation côté admin, c'est long en démo. Pourquoi pas que socket ? Si la connexion socket initiale échoue (race au boot Fire Stick), le bénévole reste bloqué.

## Page Neopro plein écran

### URL d'atterrissage : `/?display=N`

L'app Angular Neopro **supporte déjà** le query param `display=N` (cf. PROP-002 phase 5H — `state.service.js` getReceivers, displays N>0). La page bootstrap captive redirige vers cette URL et l'app Angular se charge de :

1. Lire `display=N` depuis `URLSearchParams`
2. Appeler `localBroadcastService.subscribe(displayIndex)`
3. Recevoir le state synchronisé via Socket.IO `tv-loop-state`
4. Afficher la boucle vidéo du display N

### Pas d'iframe

Pas besoin d'iframe : la page `/` Angular est l'app TV elle-même. Iframe ajouterait :
- Couplage CSP (header `frame-ancestors`)
- Couche Socket.IO supplémentaire
- Latence parse HTML × 2

### Bootstrap minimaliste à `/`

Question ouverte : faut-il que `/` serve directement Angular ou un mini bootstrap qui appelle `/api/captive/whoami` puis redirige ? **Recommandation : bootstrap mini** — sinon Fire Stick non assigné chargerait 500KB Angular pour rien avant de rebondir vers `/captive/wait`.

Pattern :

```nginx
# neopro-base.conf
location = / {
    root /home/pi/neopro/webapp;
    # Si query ?display=N présent → servir Angular index.html directement
    # Sinon → bootstrap mini qui appelle whoami
    try_files /firestick-bootstrap.html =404;
}

location ~ ^/$ {
    # Si display query param présent, fallback sur Angular
    if ($arg_display) { rewrite ^ /index.html last; }
}
```

**Alternative plus simple** : faire le routing côté JS dans `index.html` (Angular AppComponent ngOnInit) :

```typescript
// raspberry/src/app/app.component.ts
async ngOnInit() {
  const display = new URLSearchParams(location.search).get('display');
  if (display === null) {
    // Pas de display → c'est un Fire Stick fresh, route vers whoami
    const r = await fetch('/api/captive/whoami');
    const d = await r.json();
    if (d.displayIndex !== null) {
      location.replace('/?display=' + d.displayIndex);
    } else {
      location.replace('/captive/wait?mac=' + d.mac);
    }
    return;
  }
  // ... bootstrap normal Angular
}
```

**Recommandation** : option JS (Angular AppComponent). Plus simple, pas de duplication HTML, un seul code path.

## Déploiement install.sh + prepare-image.sh

### Fichiers à modifier

| Fichier                                  | Modification                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| `raspberry/config/systemd/dnsmasq.conf`  | +2 lignes `address=/firetvcaptiveportal.com/...` + `address=/spectrum.s3.amazonaws.com/...` |
| `raspberry/config/nginx/neopro-base.conf` | +3 location blocks (kindle-wifi, /api/captive/whoami, /captive/wait)         |
| `raspberry/install.sh`                   | Aucune nouvelle étape — `configure_nginx` (ligne 662) recopie déjà depuis config/ ; idem dnsmasq (ligne 450). Vérifier que le path source pointe vers le fichier mis à jour |
| `raspberry/prepare-image.sh`             | Vérifier que les nouveaux fichiers sont inclus dans l'image SD bake (idem)   |
| `raspberry/server/services/receivers.service.js` | +`resolveMacByIp(ip)` + extension `_state` ou `_ipToMac` Map         |
| `raspberry/server/routes/captive.js`     | Nouveau fichier — endpoint `/api/captive/whoami`                             |
| `raspberry/server/server.js`             | Wire la route : `app.use('/api/captive', createCaptiveRouter({ receiversService, configPath }))` |
| `raspberry/webapp-captive/firestick-wait.html` | Nouveau fichier (sources)                                              |
| `build-raspberry.sh`                     | Copy `firestick-wait.html` dans `/home/pi/neopro/webapp/` (rsync inclus si dans le scope `raspberry/dist/`) |
| `raspberry/src/app/app.component.ts`     | +bootstrap router pour `/api/captive/whoami` quand `?display` absent         |

### Permissions

- `firestick-wait.html` : `644` (lisible par www-data via group pi — déjà géré dans `install.sh:1166`)
- Pas de chmod 600 (pas de secret dedans)

### Restart services

Après install :

```bash
nginx -t && systemctl reload nginx     # déjà géré install.sh:808
systemctl restart dnsmasq              # déjà géré install.sh:464
systemctl restart neopro-server        # nouveau besoin si /routes/captive.js ajouté
```

`neopro-server` (port 3000) doit être restart pour charger la nouvelle route. Vérifier que le `Restart=on-failure` du service systemd est suffisant ou ajouter explicitement.

### `setup-captive-portal-iptables.sh`

Vérifier qu'il n'y a **rien à changer** : DNAT 80 only (smoke test enforced ADR-079). Le mécanisme Fire OS s'appuie sur DNS hijack + nginx 80, pas de DNAT additionnel requis.

## Validation Architecture

### Test Framework

| Property           | Value                                                            |
| ------------------ | ---------------------------------------------------------------- |
| Framework          | Jest 29.x (raspberry/server) + Smoke tests Jest (central-server) |
| Config file        | `raspberry/server/jest.config.js` + `central-server/jest.config.ts` |
| Quick run command  | `cd raspberry/server && npx jest --testPathPattern='captive' --no-coverage` |
| Full suite command | `cd raspberry/server && npm test && cd ../../central-server && npm run test:smoke` |

### Phase Requirements → Test Map

| Req ID     | Behavior                                                            | Test Type  | Automated Command                                                                              | File Exists?     |
| ---------- | ------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------- | ---------------- |
| CAPTIVE-01 | nginx répond 200 sur `/kindle-wifi/wifistub.html`                   | smoke      | `npx jest --testPathPattern='smoke-kiosk-pi' --no-coverage` (étendre suite existante)          | ⚠️ Étendre       |
| CAPTIVE-01 | dnsmasq config contient `address=/firetvcaptiveportal.com/`         | smoke      | `npx jest --testPathPattern='smoke-kiosk-pi' --no-coverage`                                    | ⚠️ Étendre       |
| CAPTIVE-02 | `/api/captive/whoami` retourne `{ displayIndex: N }` pour MAC assignée | unit       | `cd raspberry/server && npx jest --testPathPattern='routes/captive' --no-coverage`             | ❌ Wave 0        |
| CAPTIVE-02 | `receiversService.resolveMacByIp(ip)` retourne MAC connue           | unit       | `cd raspberry/server && npx jest --testPathPattern='receivers.service' --no-coverage`          | ✅ étendre 21+   |
| CAPTIVE-03 | `/api/captive/whoami` retourne `{ displayIndex: null }` pour MAC non assignée | unit | `cd raspberry/server && npx jest --testPathPattern='routes/captive' --no-coverage`             | ❌ Wave 0        |
| CAPTIVE-03 | `firestick-wait.html` contient `<div class="mac" id="mac">`         | smoke      | grep dans suite `smoke-kiosk-pi` (file exists + pattern)                                       | ⚠️ Étendre       |
| CAPTIVE-04 | Émission Socket.IO `connected-receivers-changed` → page wait reload | manuel/E2E | Validation Pi réel : assigner MAC depuis dashboard, observer redirect Silk                     | ❌ Manuel        |
| CAPTIVE-04 | nginx proxy `/socket.io/` vers :3000                                | smoke      | `npx jest --testPathPattern='smoke-kiosk-pi' --no-coverage` (déjà couvert ADR-074-style)        | ✅ Existant      |

### Sampling Rate

- **Per task commit:** `cd raspberry/server && npx jest --testPathPattern='(captive|receivers)' --no-coverage`
- **Per wave merge:** `cd raspberry/server && npm test && npm run test:smoke:smart` (depuis racine)
- **Phase gate:** Full suite green (raspberry/server Jest + smoke central-server) + validation manuelle Pi réel (Fire Stick branché RACC) avant `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `raspberry/server/routes/captive.js` — endpoint `/api/captive/whoami` (couvre CAPTIVE-02, CAPTIVE-03)
- [ ] `raspberry/server/__tests__/routes/captive.test.js` — Jest tests pour la route (mock receiversService + fs config)
- [ ] `raspberry/server/__tests__/receivers.service.test.js` — étendre avec tests `resolveMacByIp` (3 cas : trouvé, IPv4-mapped IPv6, absent)
- [ ] `raspberry/webapp-captive/firestick-wait.html` — page d'attente (couvre CAPTIVE-03, CAPTIVE-04)
- [ ] Étendre `central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts` :
  - Assert `dnsmasq.conf` contient `firetvcaptiveportal.com`
  - Assert `dnsmasq.conf` contient `spectrum.s3.amazonaws.com`
  - Assert `neopro-base.conf` contient `kindle-wifi/wifistub.html`
  - Assert `neopro-base.conf` contient `/api/captive/whoami`
  - Assert `neopro-base.conf` contient `proxy_set_header X-Real-IP`
  - Assert `firestick-wait.html` existe dans `raspberry/webapp-captive/`
- [ ] Étendre `app.component.ts` (Angular) avec le bootstrap router → +1 test Karma `app.component.spec.ts`

## State of the Art

| Old Approach (POC manuel)                                          | Current Approach (Phase 6)                                                | When Changed | Impact                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------- | ------------ | ----------------------------------------------- |
| `/etc/dnsmasq.d/firestick-captive.conf` séparé créé à la main      | Fusion dans `raspberry/config/systemd/dnsmasq.conf` versionné             | 2026-05-06   | install.sh idempotent, plus de fichier orphelin |
| `/etc/nginx/sites-available/firestick-captive` séparé              | Fusion dans `raspberry/config/nginx/neopro-base.conf`                     | 2026-05-06   | Une seule config nginx à maintenir              |
| Lookup MAC manuel via SSH `arp -an` puis assignation manuelle DB   | `/api/captive/whoami` automatique + dashboard assignment                  | 2026-05-06   | UX bénévole zéro-touch                          |
| Page d'attente : aucune (Fire Stick restait sur "Success" minimal) | `firestick-wait.html` avec MAC affichée + auto-refresh socket             | 2026-05-06   | Bénévole peut dicter MAC à admin                |

**Deprecated/outdated:**

- `nginx-captive-portal.conf` standalone — superseded par `neopro-base.conf` qui intègre déjà tous les endpoints captive. À archiver ou supprimer dans Phase 6 (vérifier no-dangling avec grep).
- POC `/etc/dnsmasq.d/firestick-captive.conf` sur Pi RACC — sera réécrit par install.sh prochain rollout (Daisy a flagged dans STATE.md Blockers/Concerns)

## Risks & open questions

### Risks

| Risque                                                                   | Probabilité | Mitigation                                                               |
| ------------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------ |
| Fire OS futur active DoH par défaut → DNS hijack contourné               | Moyenne     | Monitor sur futurs rollouts. Fallback : iptables DNAT 53 (mais bypass DoH non garanti) |
| `req.headers['x-real-ip']` non set car nginx mal configuré               | Faible      | Smoke test enforced + fallback `req.socket.remoteAddress`                |
| Race detection : Fire Stick HTTP avant scan ReceiversService (10s)       | Moyenne     | Trigger `_scanLeases()` synchrone dans handler whoami si MAC absente     |
| `dnsmasq.leases` parsing fragile (format change)                         | Faible      | Format stable depuis 10+ ans, fallback ARP déjà en place                 |
| Fire Stick déjà configuré sur Wi-Fi public extérieur (proxy contournement) | Faible      | Hors scope (PSK protège déjà l'accès)                                    |
| Bootstrap Angular `app.component.ts` : redirect infinite loop si bug whoami | Moyenne   | Guard sur `?display=` already set + retry max 1                          |
| nginx CSP `'self'` casse fetch `/api/captive/whoami`                     | Faible      | Same-origin, déjà autorisé                                               |
| iframe-like flash blanc avant redirect Angular                           | Moyenne     | Bootstrap mini HTML servi à `/` plutôt que via Angular ngOnInit          |

### Open Questions

1. **Endpoint `/` : bootstrap HTML mini OU Angular ngOnInit ?**
   - What we know : Angular ngOnInit est plus simple côté code, bootstrap HTML est plus rapide UX
   - What's unclear : impact perf Fire Stick basique sur premier load Angular sans display
   - Recommendation : essayer ngOnInit en premier (simpler), basculer vers bootstrap mini si flash blanc > 1s observé sur Fire Stick réel

2. **`nginx-captive-portal.conf` : archiver ou garder ?**
   - What we know : dupliqué avec `neopro-base.conf`, source unique de vérité préférable
   - What's unclear : un script ou doc pointe-t-il dessus ailleurs ?
   - Recommendation : `grep -rn "nginx-captive-portal" .` dans plan d'exécution avant archive

3. **Fire Stick éteint puis rallumé — bascule auto reprend ?**
   - What we know : cache local Phase 5 plan 02 préserve mapping MAC↔display
   - What's unclear : dnsmasq distribue-t-il la même IP au Fire Stick au reboot (lease 2h) ? Sinon `_ipToMac` doit être rebuild — pas critique car lease renouvellé OK
   - Recommendation : test manuel scenario reboot

4. **Pages d'attente concurrentes — N Fire Sticks pas encore assignés**
   - What we know : chaque page écoute `connected-receivers-changed` global
   - What's unclear : pas un risque réel — chaque page filter sur sa propre MAC depuis URL query
   - Recommendation : OK as-is

5. **`prepare-image.sh` vs `install.sh` — quel script bake la config dans l'image SD ?**
   - What we know : `install.sh` configure un Pi déjà flashé ; `prepare-image.sh` (à confirmer) bake dans l'image
   - What's unclear : `raspberry/prepare-image.sh` contenu non lu — vérifier qu'il invoque `install.sh` ou recopie `config/`
   - Recommendation : lire `prepare-image.sh` à la planification (1 ligne du plan)

## Sources

### Primary (HIGH confidence)

- `.planning/firestick-poc/VISION.md` — POC validé 2026-05-05 sur Pi RACC, configs exactes
- `raspberry/config/systemd/dnsmasq.conf` (file:1-65) — config dnsmasq production
- `raspberry/config/nginx/neopro-base.conf` (file:1-100) — config nginx production
- `raspberry/config/nginx-captive-portal.conf` (file:1-139) — captive portal endpoints (legacy)
- `raspberry/install.sh` (lines 290, 446-486, 662-810, 1166, 1186, 1348) — flow install nginx + dnsmasq
- `raspberry/server/server.js` (file:1-80) — orchestrateur, ReceiversService déjà wired
- `.planning/phases/05-detect/05-detect-01-SUMMARY.md` — ReceiversService API
- `.planning/phases/05-detect/05-detect-02-SUMMARY.md` — Cache local + assignDisplay
- `.planning/phases/05-detect/05-detect-03-SUMMARY.md` — Socket.IO wiring + state.service
- `.planning/phases/04-data/04-data-02-SUMMARY.md` — siteRepository.getReceiverForDisplay
- `.claude/rules/raspberry.md` — captive portal invariants ADR-079 (DNAT 80 only, pas 443)
- `.claude/rules/hotspot-psk.md` — invariants ADR-074 (NE PAS toucher hostapd)

### Secondary (MEDIUM confidence)

- POC observation : Fire OS sonde `firetvcaptiveportal.com/kindle-wifi/wifistub.html` (validé sur Fire Stick `0C:43:F9:36:04:77`)
- `dnsmasq.leases` format : `<unix_ts> <mac> <ip> <hostname> <client_id>` (Linux man + observations terrain)

### Tertiary (LOW confidence)

- Fire OS DoH behavior — pas observé sur POC mais futurs firmwares possibles (à monitorer)

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — réutilise nginx/dnsmasq/Express déjà en prod
- Architecture: HIGH — POC validé, pattern PROP-002 + ADR-079 connus
- Pitfalls: HIGH — DNAT 443, hostapd, DoH documentés
- Page d'attente UX: MEDIUM — non testée terrain, design proposé

**Research date:** 2026-05-06
**Valid until:** 2026-06-06 (30 jours — Fire OS est stable, DoH change ferait dériver)
