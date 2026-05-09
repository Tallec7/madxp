---
phase: 06-captive-fire-stick-page-neopro
plan: 03
type: execute
wave: 2
depends_on: []
files_modified:
  - raspberry/config/systemd/dnsmasq.conf
  - raspberry/config/nginx/neopro-base.conf
  - raspberry/webapp-captive/firestick-wait.html
  - build-raspberry.sh
  - central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts
autonomous: true
requirements: [CAPTIVE-01, CAPTIVE-03, CAPTIVE-04]
must_haves:
  truths:
    - "dnsmasq résout firetvcaptiveportal.com et spectrum.s3.amazonaws.com vers 192.168.4.1 (DNS hijack Fire OS)"
    - "nginx répond 200 'Success' sur /kindle-wifi/wifistub.html (probe Fire OS)"
    - "nginx proxifie /api/captive/whoami vers localhost:3000 avec header X-Real-IP forwardé"
    - "nginx sert /captive/wait depuis /home/pi/neopro/webapp/firestick-wait.html"
    - "firestick-wait.html affiche la MAC en 128px (CAPTIVE-03), 2 weights typo (UI-SPEC), dual mécanisme Socket.IO + polling 5s (CAPTIVE-04)"
    - "build-raspberry.sh copie firestick-wait.html dans /home/pi/neopro/webapp/ pour OTA"
    - "smoke tests gardent les invariants : domaines DNS, nginx location blocks, fichier wait page"
    - "ADR-079 invariant respecté : aucune nouvelle règle DNAT 443 introduite par cette phase"
  artifacts:
    - path: "raspberry/config/systemd/dnsmasq.conf"
      provides: "+2 lignes address=/firetvcaptiveportal.com/192.168.4.1 + address=/spectrum.s3.amazonaws.com/192.168.4.1"
    - path: "raspberry/config/nginx/neopro-base.conf"
      provides: "+3 location blocks (/kindle-wifi/wifistub.html, /api/captive/whoami proxy, /captive/wait)"
    - path: "raspberry/webapp-captive/firestick-wait.html"
      provides: "Page d'attente vanilla HTML standalone (~5KB, 2 weights, dark theme)"
      min_lines: 60
    - path: "build-raspberry.sh"
      provides: "Étape de copie webapp-captive/firestick-wait.html → raspberry/dist/webapp/"
    - path: "central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts"
      provides: "Assertions smoke pour les 6 invariants Phase 6 (DNS, nginx, wait page)"
  key_links:
    - from: "raspberry/config/nginx/neopro-base.conf::/api/captive/whoami"
      to: "http://localhost:3000/api/captive/whoami"
      via: "proxy_pass + proxy_set_header X-Real-IP $remote_addr"
      pattern: "X-Real-IP"
    - from: "raspberry/webapp-captive/firestick-wait.html"
      to: "Socket.IO /socket.io/socket.io.js (proxy nginx)"
      via: "<script src='/socket.io/socket.io.js'></script>"
      pattern: "socket.io"
    - from: "raspberry/webapp-captive/firestick-wait.html"
      to: "/api/captive/whoami"
      via: "fetch polling 5000ms (safety net)"
      pattern: "5000|setInterval"
---

<objective>
Industrialiser le POC captive Fire Stick : étendre les configs `dnsmasq.conf` (DNS hijack 2 domaines Fire OS) + `neopro-base.conf` (3 location blocks nginx) + créer la page d'attente vanilla HTML + brancher le build pour OTA + figer les invariants en smoke tests.

Purpose: Sans configs déployées par `install.sh`/`prepare-image.sh`, chaque rollout club nécessiterait une configuration manuelle SSH (anti-pattern terrain bénévole-grade). Sans page d'attente, un Fire Stick non assigné reste sur "Success" minimal — impossible pour le bénévole de communiquer la MAC à l'admin. Sans smoke tests, la dérive (qq supprimer un domaine DNS, oublier le X-Real-IP, etc.) passerait silencieusement.

Output: Configs versionnées modifiées, page d'attente créée, build pipeline mis à jour, 6 assertions smoke ajoutées.
</objective>

<execution_context>
@/home/user/neopro/.claude/get-shit-done/workflows/execute-plan.md
@/home/user/neopro/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/06-captive-fire-stick-page-neopro/06-RESEARCH.md
@.planning/phases/06-captive-fire-stick-page-neopro/06-UI-SPEC.md
@.planning/phases/06-captive-fire-stick-page-neopro/06-VALIDATION.md
@raspberry/config/systemd/dnsmasq.conf
@raspberry/config/nginx/neopro-base.conf
@raspberry/install.sh
@build-raspberry.sh
@central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts

<interfaces>
<!-- ADR-079 invariant CRITIQUE -->
- Aucun DNAT port 443 ne doit être introduit (cf. .claude/rules/raspberry.md - smoke test enforced).
- Le mécanisme Fire OS s'appuie UNIQUEMENT sur DNS hijack + nginx port 80.
- `setup-captive-portal-iptables.sh` ne doit PAS être modifié dans cette phase.

<!-- install.sh — pas de modification ici (cf. RESEARCH §Déploiement) -->
- `configure_nginx` (ligne ~662) recopie déjà `raspberry/config/nginx/neopro-base.conf` vers /etc/nginx/sites-available/.
- `configure_dnsmasq` (ligne ~450) recopie déjà `raspberry/config/systemd/dnsmasq.conf` vers /etc/dnsmasq.d/.
- DONC : modifier les sources dans `raspberry/config/` suffit, install.sh propage à la prochaine exécution. Vérifier en lisant install.sh (read_first ci-dessous).

<!-- build-raspberry.sh — copie webapp -->
- L'étape rsync `raspberry/dist/webapp/` doit inclure firestick-wait.html. Pattern à reproduire: cf. les autres copies de fichiers HTML/JS standalone.

<!-- Smoke test infrastructure -->
- `central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts` est un fichier TypeScript Jest qui lit les fichiers source du repo (fs.readFileSync) et fait des assertions grep-like.
- Pattern à reproduire: lire le fichier puis `expect(content).toContain('...')` ou `expect(content).toMatch(/regex/)`.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extend dnsmasq + nginx configs + create firestick-wait.html + build pipeline</name>
  <read_first>
    - .planning/phases/06-captive-fire-stick-page-neopro/06-RESEARCH.md sections "DNS hijack mechanism" + "nginx config" + "Page d'attente" + "Déploiement install.sh" (snippets verbatim)
    - .planning/phases/06-captive-fire-stick-page-neopro/06-UI-SPEC.md (page d'attente : 2 weights 400/700, dark #000, MAC 128px uppercase, 5s polling, French copy verbatim)
    - raspberry/config/systemd/dnsmasq.conf (état actuel — où ajouter les 2 lignes)
    - raspberry/config/nginx/neopro-base.conf (état actuel — où ajouter les 3 location blocks)
    - raspberry/install.sh (sections configure_nginx ligne ~662 + configure_dnsmasq ligne ~450 — confirmer qu'ils recopient depuis raspberry/config/)
    - build-raspberry.sh (où sont copiés les autres fichiers HTML standalone vers raspberry/dist/webapp/)
    - .claude/rules/raspberry.md (invariants ADR-079 — DNAT 443 interdit, clients3.google.com interdit)
  </read_first>
  <files>
    - raspberry/config/systemd/dnsmasq.conf (modify)
    - raspberry/config/nginx/neopro-base.conf (modify)
    - raspberry/webapp-captive/firestick-wait.html (CREATE)
    - build-raspberry.sh (modify)
  </files>
  <action>
    Step 1 — Modifier `raspberry/config/systemd/dnsmasq.conf`:
    Ajouter à la fin du fichier (ou groupé avec les autres `address=/...` existants), AVEC un commentaire de phase:
    ```
    # Fire OS / Fire Stick captive probes (Phase 6 - CAPTIVE-01)
    address=/firetvcaptiveportal.com/192.168.4.1
    address=/spectrum.s3.amazonaws.com/192.168.4.1
    ```
    NE PAS ajouter `address=/clients3.google.com/...` ni `address=/play.googleapis.com/...` (smoke test enforced .claude/rules/raspberry.md).
    NE PAS ajouter `address=/#/192.168.4.1` (wildcard hijack — RESEARCH §Pièges Fire OS dit "ne PAS faire").

    Step 2 — Modifier `raspberry/config/nginx/neopro-base.conf`:
    Ajouter dans le `server { ... }` principal (port 80 default_server) les 3 location blocks suivants — verbatim depuis RESEARCH §nginx config :

    ```nginx
    # Fire OS captive probe (Phase 6 - CAPTIVE-01)
    location = /kindle-wifi/wifistub.html {
        default_type text/html;
        return 200 '<!DOCTYPE html><html><head><title>Success</title></head><body>Success</body></html>';
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # Captive whoami endpoint — proxy vers raspberry/server :3000 (Phase 6 - CAPTIVE-02)
    location = /api/captive/whoami {
        proxy_pass http://localhost:3000/api/captive/whoami;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        # CRITIQUE : transmettre l'IP cliente réelle (sans X-Real-IP, Express voit 127.0.0.1)
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Page d'attente Fire Stick (Phase 6 - CAPTIVE-03)
    location = /captive/wait {
        root /home/pi/neopro/webapp;
        try_files /firestick-wait.html =404;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
    ```

    Vérifier la cohérence avec les autres `location` existants (proxy_pass `/socket.io/` doit déjà exister Phase 5). NE PAS toucher au bloc `/socket.io/`. NE PAS toucher au bloc `/api/` générique s'il existe (le `location =` exact match a priorité sur le préfixe `/api/`).

    Step 3 — Créer `raspberry/webapp-captive/firestick-wait.html` (mkdir -p si dir absent). Contenu intégral (vanilla HTML, 2 weights 400/700 system stack, dark #000, MAC 128px, French verbatim cf. UI-SPEC):

    ```html
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=1920, initial-scale=1">
      <title>Neopro — En attente</title>
      <style>
        :root { color-scheme: dark; }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; height: 100%; }
        body {
          background: #000000;
          color: #FFFFFF;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-weight: 400;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          max-width: 90vw;
          margin: 0 auto;
          text-align: center;
        }
        h1 {
          font-size: 48px;
          font-weight: 700;
          line-height: 1.2;
          margin: 0 0 24px 0;
        }
        .subhead {
          font-size: 24px;
          font-weight: 400;
          line-height: 1.5;
          opacity: 0.7;
          margin: 0 0 24px 0;
        }
        .mac {
          font-size: 128px;
          font-weight: 700;
          line-height: 1.0;
          letter-spacing: 0.5rem;
          margin: 0 0 32px 0;
          text-transform: uppercase;
        }
        .spin {
          width: 80px;
          height: 80px;
          border: 16px solid #333333;
          border-top-color: #2022E9;
          border-radius: 50%;
          animation: spin 2s linear infinite;
          margin: 0 0 32px 0;
        }
        .footer {
          font-size: 24px;
          font-weight: 400;
          line-height: 1.5;
          margin: 0;
        }
        .error { display: none; }
        body.error-state .normal { display: none; }
        body.error-state .error { display: block; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
      </style>
    </head>
    <body>
      <div class="normal">
        <h1>En attente d'assignation</h1>
        <p class="subhead">Code de cet écran</p>
        <div class="mac" id="mac" data-mac="">--:--:--:--:--:--</div>
        <div class="spin" aria-hidden="true"></div>
        <p class="footer">Communiquez ce code à votre administrateur. La page basculera automatiquement.</p>
      </div>
      <div class="error">
        <h1>Code écran indisponible</h1>
        <p class="footer">Redémarrez le Fire Stick et reconnectez-vous au réseau du club.</p>
      </div>
      <script src="/socket.io/socket.io.js"></script>
      <script>
        (function () {
          var params = new URLSearchParams(location.search);
          var myMac = (params.get('mac') || '').toLowerCase();

          if (!myMac) {
            document.body.classList.add('error-state');
            return;
          }

          var macEl = document.getElementById('mac');
          macEl.textContent = myMac.toUpperCase();
          macEl.setAttribute('data-mac', myMac);

          function gotoDisplay(displayIndex) {
            window.location.replace('/?display=' + displayIndex);
          }

          // Primary: Socket.IO push (latence < 200ms)
          try {
            var socket = io({ transports: ['websocket', 'polling'] });
            socket.on('connected-receivers-changed', function (payload) {
              if (!payload || !Array.isArray(payload.receivers)) return;
              var me = payload.receivers.find(function (r) {
                return r && typeof r.mac === 'string' && r.mac.toLowerCase() === myMac;
              });
              if (me && me.displayIndex !== null && me.displayIndex !== undefined) {
                gotoDisplay(me.displayIndex);
              }
            });
          } catch (e) { /* socket.io non chargé — polling prend le relais */ }

          // Safety net: polling 5s
          setInterval(function () {
            fetch('/api/captive/whoami', { cache: 'no-store' })
              .then(function (r) { return r.ok ? r.json() : null; })
              .then(function (d) {
                if (d && d.displayIndex !== null && d.displayIndex !== undefined) {
                  gotoDisplay(d.displayIndex);
                }
              })
              .catch(function () { /* offline transitoire */ });
          }, 5000);
        })();
      </script>
    </body>
    </html>
    ```

    Step 4 — Modifier `build-raspberry.sh` pour copier `raspberry/webapp-captive/firestick-wait.html` dans le bundle webapp distribué. Identifier où le build copie déjà des fichiers vers `raspberry/dist/webapp/` (typiquement après `ng build` Angular) puis ajouter:
    ```bash
    # Phase 6 - CAPTIVE-03 : copier la page d'attente Fire Stick standalone
    if [ -f "raspberry/webapp-captive/firestick-wait.html" ]; then
      cp raspberry/webapp-captive/firestick-wait.html raspberry/dist/webapp/firestick-wait.html
      echo "[build] Copied firestick-wait.html → dist/webapp/"
    fi
    ```
    Adapter le chemin de destination si build-raspberry.sh utilise un autre layout (lire le script avant). NE PAS écraser un fichier Angular existant — `firestick-wait.html` est un nom dédié, pas de collision.

    Commit: `feat(captive): extend dnsmasq+nginx+wait-page+build for Fire Stick captive (CAPTIVE-01, CAPTIVE-03)`.

    Vérification syntaxique nginx (sans Pi réel, on ne peut faire `nginx -t` que si nginx est installé localement — laisser pour validation manuelle ; les smoke tests Task 2 attraperont les invariants).
  </action>
  <verify>
    <automated>grep -q "firetvcaptiveportal.com" raspberry/config/systemd/dnsmasq.conf && grep -q "spectrum.s3.amazonaws.com" raspberry/config/systemd/dnsmasq.conf && grep -q "kindle-wifi/wifistub.html" raspberry/config/nginx/neopro-base.conf && grep -q "X-Real-IP" raspberry/config/nginx/neopro-base.conf && grep -q "/captive/wait" raspberry/config/nginx/neopro-base.conf && grep -q "data-mac" raspberry/webapp-captive/firestick-wait.html && grep -q "firestick-wait.html" build-raspberry.sh</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "address=/firetvcaptiveportal.com/192.168.4.1" raspberry/config/systemd/dnsmasq.conf` exit 0
    - `grep -q "address=/spectrum.s3.amazonaws.com/192.168.4.1" raspberry/config/systemd/dnsmasq.conf` exit 0
    - `grep -qE "address=/clients3.google.com" raspberry/config/systemd/dnsmasq.conf` exit 1 (interdit ADR-079)
    - `grep -qE "address=/#/" raspberry/config/systemd/dnsmasq.conf` exit 1 (wildcard hijack interdit)
    - `grep -q "/kindle-wifi/wifistub.html" raspberry/config/nginx/neopro-base.conf` exit 0
    - `grep -q "/api/captive/whoami" raspberry/config/nginx/neopro-base.conf` exit 0
    - `grep -q "proxy_set_header X-Real-IP" raspberry/config/nginx/neopro-base.conf` exit 0
    - `grep -q "/captive/wait" raspberry/config/nginx/neopro-base.conf` exit 0
    - `grep -q "firestick-wait.html" raspberry/config/nginx/neopro-base.conf` exit 0
    - `test -f raspberry/webapp-captive/firestick-wait.html` exit 0
    - `wc -l raspberry/webapp-captive/firestick-wait.html` ≥ 60 lignes
    - `grep -q 'data-mac' raspberry/webapp-captive/firestick-wait.html` exit 0
    - `grep -q '128px' raspberry/webapp-captive/firestick-wait.html` exit 0 (UI-SPEC : MAC 128px)
    - `grep -q '5000' raspberry/webapp-captive/firestick-wait.html` exit 0 (polling 5s UI-SPEC)
    - `grep -q "connected-receivers-changed" raspberry/webapp-captive/firestick-wait.html` exit 0
    - `grep -q "/socket.io/socket.io.js" raspberry/webapp-captive/firestick-wait.html` exit 0
    - `grep -cE "font-weight: (400|700)" raspberry/webapp-captive/firestick-wait.html` ≥ 4 ET `grep -cE "font-weight: (300|500|600|800)" raspberry/webapp-captive/firestick-wait.html` = 0 (UI-SPEC : 2 weights only)
    - `grep -q "En attente d'assignation" raspberry/webapp-captive/firestick-wait.html` exit 0 (FR copy verbatim)
    - `grep -q "firestick-wait.html" build-raspberry.sh` exit 0
    - ADR-079 invariant: `grep -E "(DNAT.*--dport 443|--to .*:443)" raspberry/config/` exit 1 ET `git diff HEAD -- raspberry/scripts/setup-captive-portal-iptables.sh` empty (aucune modif iptables 443)
  </acceptance_criteria>
  <done>
    Configs prêtes pour rollout via install.sh (déjà recopie depuis raspberry/config/). Page d'attente standalone fonctionnelle, conforme UI-SPEC. Build pipeline copie le fichier dans le bundle OTA. ADR-079 invariant respecté.
  </done>
</task>

<task type="auto">
  <name>Task 2: Extend smoke-kiosk-pi.test.ts with Phase 6 invariants</name>
  <read_first>
    - central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts (état actuel — pattern d'assertions sur les fichiers config)
    - .planning/phases/06-captive-fire-stick-page-neopro/06-RESEARCH.md §Wave 0 Gaps (liste exhaustive des 6 assertions à ajouter)
    - .claude/rules/testing.md (smoke tests sont enforced — utiliser `npm run test:smoke:smart`)
  </read_first>
  <files>
    - central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts (modify — ajouter describe Phase 6)
  </files>
  <action>
    Ajouter dans `central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts` un nouveau `describe('Phase 6 — Fire Stick Captive Portal', () => { ... })` (à la fin du fichier, avant le dernier `});` du describe parent s'il y en a un — sinon top-level).

    Pattern attendu (cohérent avec les assertions existantes du fichier — utiliser `fs.readFileSync` + `expect(...).toContain(...)`):

    ```typescript
    import * as fs from 'fs';
    import * as path from 'path';

    describe('Phase 6 — Fire Stick Captive Portal', () => {
      const REPO_ROOT = path.resolve(__dirname, '../../../..');

      it('dnsmasq.conf hijacks firetvcaptiveportal.com (CAPTIVE-01)', () => {
        const conf = fs.readFileSync(
          path.join(REPO_ROOT, 'raspberry/config/systemd/dnsmasq.conf'),
          'utf8'
        );
        expect(conf).toContain('address=/firetvcaptiveportal.com/192.168.4.1');
      });

      it('dnsmasq.conf hijacks spectrum.s3.amazonaws.com (CAPTIVE-01)', () => {
        const conf = fs.readFileSync(
          path.join(REPO_ROOT, 'raspberry/config/systemd/dnsmasq.conf'),
          'utf8'
        );
        expect(conf).toContain('address=/spectrum.s3.amazonaws.com/192.168.4.1');
      });

      it('nginx serves Fire OS kindle-wifi probe (CAPTIVE-01)', () => {
        const conf = fs.readFileSync(
          path.join(REPO_ROOT, 'raspberry/config/nginx/neopro-base.conf'),
          'utf8'
        );
        expect(conf).toMatch(/location\s*=\s*\/kindle-wifi\/wifistub\.html/);
        expect(conf).toContain('Success');
      });

      it('nginx proxies /api/captive/whoami with X-Real-IP forwarded (CAPTIVE-02)', () => {
        const conf = fs.readFileSync(
          path.join(REPO_ROOT, 'raspberry/config/nginx/neopro-base.conf'),
          'utf8'
        );
        expect(conf).toContain('/api/captive/whoami');
        expect(conf).toMatch(/proxy_set_header\s+X-Real-IP\s+\$remote_addr/);
      });

      it('nginx serves /captive/wait from firestick-wait.html (CAPTIVE-03)', () => {
        const conf = fs.readFileSync(
          path.join(REPO_ROOT, 'raspberry/config/nginx/neopro-base.conf'),
          'utf8'
        );
        expect(conf).toContain('/captive/wait');
        expect(conf).toContain('firestick-wait.html');
      });

      it('firestick-wait.html exists with required markers (CAPTIVE-03, CAPTIVE-04)', () => {
        const html = fs.readFileSync(
          path.join(REPO_ROOT, 'raspberry/webapp-captive/firestick-wait.html'),
          'utf8'
        );
        expect(html).toContain('data-mac');
        expect(html).toContain('connected-receivers-changed');
        expect(html).toContain('/api/captive/whoami');
        expect(html).toContain('/socket.io/socket.io.js');
        expect(html).toContain('128px'); // UI-SPEC : MAC display
      });

      it('ADR-079 invariant: no DNAT 443 introduced by Phase 6', () => {
        const iptables = fs.readFileSync(
          path.join(REPO_ROOT, 'raspberry/scripts/setup-captive-portal-iptables.sh'),
          'utf8'
        );
        // Aucune règle DNAT vers port 443 ou redirection depuis port 443
        expect(iptables).not.toMatch(/--dport\s+443.*-j\s+DNAT/);
        expect(iptables).not.toMatch(/--to-destination\s+\S+:443/);
      });
    });
    ```

    Si le fichier `setup-captive-portal-iptables.sh` n'existe pas, remplacer le dernier test par une assertion grep récursive sur `raspberry/`:
    ```typescript
    // Alternative si fichier absent : scan tous les .sh / .conf raspberry/ pour absence DNAT 443
    ```

    Lancer `cd central-server && npx jest --testPathPattern='smoke-kiosk-pi' --no-coverage --forceExit` → DOIT passer (les configs Task 1 sont déjà en place puisque Plans 01 et 03 sont en wave parallèle au sein de wave 2 — mais Plan 03 task 1 doit être commit avant cette task).

    Commit: `test(captive): smoke invariants for Phase 6 captive portal (CAPTIVE-01, CAPTIVE-02, CAPTIVE-03, ADR-079)`.

    NE PAS introduire de skip/it.skip. NE PAS désactiver une assertion existante du fichier. NE PAS modifier les invariants Phase 5/Phase 4 déjà couverts.
  </action>
  <verify>
    <automated>cd central-server && npx jest --testPathPattern='smoke-kiosk-pi' --no-coverage --forceExit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "Phase 6 — Fire Stick Captive Portal" central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts` exit 0
    - `grep -c "CAPTIVE-0" central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts` ≥ 5 (CAPTIVE-01, -02, -03 référencés)
    - `grep -q "ADR-079" central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts` exit 0
    - `grep -q "firetvcaptiveportal.com" central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts` exit 0
    - `grep -q "X-Real-IP" central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts` exit 0
    - `cd central-server && npx jest --testPathPattern='smoke-kiosk-pi' --no-coverage --forceExit` exit 0
    - Aucun `.skip(` introduit dans ce fichier (`grep -c '\\.skip(' central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts` = compte avant changement)
  </acceptance_criteria>
  <done>
    7 nouvelles assertions smoke gardent les invariants Phase 6. Toute régression silencieuse (suppression d'un domaine DNS, oubli X-Real-IP, suppression de la wait page, ou ré-introduction d'un DNAT 443) est attrapée par CI.
  </done>
</task>

</tasks>

<verification>
- npm run test:smoke:smart (depuis racine repo) → vert
- Aucune nouvelle règle iptables 443 (ADR-079 invariant)
- Aucune nouvelle entrée DNS hijack interdite (clients3.google.com, wildcard `/#/`)
- Page d'attente standalone passe la grille UI-SPEC : 2 weights, dark theme, MAC 128px, French copy verbatim
- build-raspberry.sh propage le fichier dans l'OTA bundle
</verification>

<success_criteria>
- Sur un Pi neuf, après `./install.sh`: `nginx -t` exit 0, `systemctl status dnsmasq` actif
- Sur un Fire Stick branché : DNS firetvcaptiveportal.com résolu vers 192.168.4.1, GET /kindle-wifi/wifistub.html → 200 "Success"
- Page /captive/wait?mac=AA:BB:CC:DD:EE:FF affiche la MAC en grand caractères, dark theme, polling 5s + Socket.IO listener actifs
</success_criteria>

<output>
After completion, create `.planning/phases/06-captive-fire-stick-page-neopro/06-captive-03-SUMMARY.md`
</output>
</content>
</invoke>