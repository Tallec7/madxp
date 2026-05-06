---
phase: 06-captive-fire-stick-page-neopro
plan: 04
type: execute
wave: 3
depends_on: ["06-captive-02", "06-captive-03"]
files_modified:
  - raspberry/src/app/app.component.ts
  - raspberry/src/app/app.component.spec.ts
  - raspberry/src/index.html
autonomous: false
requirements: [CAPTIVE-02, CAPTIVE-04]
must_haves:
  truths:
    - "Au démarrage de l'app Angular sur Fire Stick, si l'URL ne contient pas ?display=N, le composant racine appelle GET /api/captive/whoami avant tout render"
    - "Si whoami retourne displayIndex !== null → redirect vers /?display=N via location.replace() (pas de history pollution)"
    - "Si whoami retourne displayIndex === null avec une mac → redirect vers /captive/wait?mac=AA:BB:... via location.replace()"
    - "Si l'URL contient déjà ?display=N → bypass complet du bootstrap router (pas de redirect, pas de fetch, l'app boot normalement)"
    - "index.html ship avec body { background: #000; } pour éviter le flash blanc pendant la résolution (UI-SPEC contrainte transition fluide)"
    - "Aucune boucle de redirection : le bootstrap ne re-fetch pas si une redirection a été déclenchée (guard hasRedirected)"
  artifacts:
    - path: "raspberry/src/app/app.component.ts"
      provides: "ngOnInit: bootstrap router fire-stick (whoami fetch + redirect)"
      contains: "/api/captive/whoami"
    - path: "raspberry/src/app/app.component.spec.ts"
      provides: "Karma tests : 4 cas (display already set, mac assigned, mac unassigned, fetch error)"
    - path: "raspberry/src/index.html"
      provides: "<body style=\"background:#000\"> ou inline CSS pour anti-flash"
      contains: "background"
  key_links:
    - from: "raspberry/src/app/app.component.ts::ngOnInit"
      to: "/api/captive/whoami"
      via: "fetch (same-origin, proxy nginx Plan 03)"
      pattern: "/api/captive/whoami"
    - from: "raspberry/src/app/app.component.ts::ngOnInit"
      to: "location.replace"
      via: "redirect sans history pollution (UI-SPEC)"
      pattern: "location\\.replace"
---

<objective>
Étendre `AppComponent` Angular du Raspberry Pi avec un bootstrap router qui, au premier paint, décide si l'URL doit basculer vers `/?display=N` (Fire Stick assigné), `/captive/wait?mac=...` (Fire Stick en attente) ou laisser l'app booter normalement (URL déjà résolue).

Purpose: Sans ce router côté client, un Fire Stick qui atterrit sur `http://192.168.4.1/` (DNS hijack par défaut) chargerait Angular plein bundle (~500KB) avant de rebondir, créant un flash blanc + UX incohérente. Avec le router, la décision est prise avant tout render Angular et `location.replace()` garantit une transition propre.

Output: AppComponent étendu, tests Karma couvrant 4 scénarios, index.html avec background noir anti-flash, validation manuelle Fire Stick réel.
</objective>

<execution_context>
@/home/user/neopro/.claude/get-shit-done/workflows/execute-plan.md
@/home/user/neopro/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/06-captive-fire-stick-page-neopro/06-RESEARCH.md
@.planning/phases/06-captive-fire-stick-page-neopro/06-UI-SPEC.md
@.planning/phases/06-captive-fire-stick-page-neopro/06-captive-02-captive-route-server-wire-PLAN.md
@.planning/phases/06-captive-fire-stick-page-neopro/06-captive-03-configs-wait-page-install-PLAN.md
@raspberry/src/app/app.component.ts
@raspberry/src/app/app.component.spec.ts
@raspberry/src/index.html

<interfaces>
<!-- API consommée -->
GET /api/captive/whoami (Plan 02 livré, exposé par nginx Plan 03):
- 200 → { mac: string, displayIndex: number | null, displayName: string | null }
- 404 → { error: 'mac_not_found', ip: string }

<!-- UI-SPEC contraintes -->
- index.html DOIT avoir background noir initial pour matcher firestick-wait.html (anti-flash)
- Redirect via location.replace() (PAS location.href = ...) pour éviter l'historique back-button
- Aucun retry infini : si whoami échoue, laisser l'app boot normalement (display=0 par défaut côté Angular existant)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add bootstrap router in AppComponent + Karma tests + index.html anti-flash</name>
  <read_first>
    - .planning/phases/06-captive-fire-stick-page-neopro/06-RESEARCH.md sections "Page Neopro plein écran" + "Bootstrap minimaliste à /" (snippet TypeScript orientation)
    - .planning/phases/06-captive-fire-stick-page-neopro/06-UI-SPEC.md section "No flash white during Angular bootstrap" (contrainte location.replace + body bg #000)
    - raspberry/src/app/app.component.ts (état actuel — voir où ngOnInit est défini, quel pattern d'init existe déjà)
    - raspberry/src/app/app.component.spec.ts (pattern Karma existant — TestBed, async/fakeAsync)
    - raspberry/src/index.html (état actuel du body)
  </read_first>
  <files>
    - raspberry/src/app/app.component.ts (modify)
    - raspberry/src/app/app.component.spec.ts (modify — ajouter tests bootstrap)
    - raspberry/src/index.html (modify — body background noir)
  </files>
  <action>
    Step 1 — Modifier `raspberry/src/app/app.component.ts`. Au début de `ngOnInit()` (avant toute autre logique), ajouter le bootstrap router. Pattern attendu:

    ```typescript
    async ngOnInit(): Promise<void> {
      // Phase 6 - Fire Stick captive bootstrap router (CAPTIVE-02, CAPTIVE-04)
      // Si l'URL contient déjà ?display=N, on est sur le path Pi natif ou Fire Stick déjà résolu → bypass
      const params = new URLSearchParams(window.location.search);
      if (!params.has('display')) {
        try {
          const response = await fetch('/api/captive/whoami', { cache: 'no-store' });
          if (response.ok) {
            const data = await response.json();
            if (data && typeof data.displayIndex === 'number') {
              // Fire Stick assigné → redirect plein écran
              window.location.replace('/?display=' + data.displayIndex);
              return;
            }
            if (data && typeof data.mac === 'string') {
              // Fire Stick non assigné → page d'attente avec MAC
              window.location.replace('/captive/wait?mac=' + encodeURIComponent(data.mac));
              return;
            }
          }
          // 404 mac_not_found ou réponse mal formée → laisser l'app boot normalement (display=0 par défaut)
        } catch (err) {
          // Réseau / proxy KO → laisser l'app boot normalement (résilience offline)
          console.warn('[AppComponent] captive whoami failed, booting normally:', err);
        }
      }

      // ... reste du ngOnInit existant
    }
    ```

    NE PAS supprimer la logique ngOnInit existante. NE PAS faire de retry. NE PAS utiliser `location.href = ...` (UI-SPEC : `location.replace()` obligatoire).

    Si `ngOnInit` n'existe pas dans le composant, l'ajouter en respectant le lifecycle Angular (`implements OnInit` côté class).

    Step 2 — Modifier `raspberry/src/app/app.component.spec.ts` — ajouter 4 tests. Pattern Jasmine/Karma:

    ```typescript
    describe('AppComponent — Fire Stick captive bootstrap (Phase 6)', () => {
      let originalLocation: Location;
      let replaceSpy: jasmine.Spy;
      let fetchSpy: jasmine.Spy;

      beforeEach(() => {
        // Spy sur window.location.replace
        replaceSpy = spyOn(window.location, 'replace').and.callFake(() => {});
        fetchSpy = spyOn(window, 'fetch');
      });

      it('bypasses bootstrap when URL already has ?display=N', async () => {
        // Setup window.location.search via Object.defineProperty si nécessaire (Karma sandbox)
        spyOnProperty(window.location, 'search', 'get').and.returnValue('?display=2');
        const fixture = TestBed.createComponent(AppComponent);
        await fixture.componentInstance.ngOnInit();
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(replaceSpy).not.toHaveBeenCalled();
      });

      it('redirects to /?display=N when whoami returns assigned displayIndex (CAPTIVE-02)', async () => {
        spyOnProperty(window.location, 'search', 'get').and.returnValue('');
        fetchSpy.and.resolveTo({
          ok: true,
          json: () => Promise.resolve({ mac: '0c:43:f9:36:04:77', displayIndex: 1, displayName: 'Buvette' }),
        } as Response);
        const fixture = TestBed.createComponent(AppComponent);
        await fixture.componentInstance.ngOnInit();
        expect(fetchSpy).toHaveBeenCalledWith('/api/captive/whoami', jasmine.objectContaining({ cache: 'no-store' }));
        expect(replaceSpy).toHaveBeenCalledWith('/?display=1');
      });

      it('redirects to /captive/wait when whoami returns null displayIndex (CAPTIVE-04)', async () => {
        spyOnProperty(window.location, 'search', 'get').and.returnValue('');
        fetchSpy.and.resolveTo({
          ok: true,
          json: () => Promise.resolve({ mac: 'aa:bb:cc:dd:ee:ff', displayIndex: null, displayName: null }),
        } as Response);
        const fixture = TestBed.createComponent(AppComponent);
        await fixture.componentInstance.ngOnInit();
        expect(replaceSpy).toHaveBeenCalledWith('/captive/wait?mac=aa%3Abb%3Acc%3Add%3Aee%3Aff');
      });

      it('boots normally when whoami fetch fails (resilience)', async () => {
        spyOnProperty(window.location, 'search', 'get').and.returnValue('');
        fetchSpy.and.rejectWith(new Error('network error'));
        const fixture = TestBed.createComponent(AppComponent);
        await fixture.componentInstance.ngOnInit();
        expect(replaceSpy).not.toHaveBeenCalled();
      });
    });
    ```

    Adapter les imports/setup TestBed pour matcher le pattern existant du fichier (le fichier actuel a déjà des `beforeEach(async () => { await TestBed.configureTestingModule(...) })`).

    Step 3 — Modifier `raspberry/src/index.html`. Dans le `<body>` (ou via `<style>` dans `<head>`), ajouter le background noir initial:

    ```html
    <head>
      ...
      <style>
        /* Phase 6 anti-flash : matche firestick-wait.html background */
        html, body { background: #000000; margin: 0; }
      </style>
    </head>
    ```

    NE PAS toucher aux liens CSS Angular existants. Le style inline est minimal et pré-bundle (parsé avant tout JS).

    Lancer:
    - `npm run test:central` n'est PAS le bon — pour raspberry/src Angular, le test runner est `npm test` à la racine ou le karma raspberry. Vérifier le script dans package.json racine. Probablement `npm test -- --watch=false --browsers=ChromeHeadless` ou similaire.
    - À défaut, faire `node --check` n'aide pas pour TS — utiliser `npx tsc --noEmit -p raspberry/tsconfig.json` pour vérifier la compilation TypeScript.

    Commit: `feat(captive): add Angular bootstrap router for Fire Stick captive flow (CAPTIVE-02, CAPTIVE-04)`.

    Note: la commande de validation Angular Karma exacte sera à confirmer en exécution (le repo expose `npm start` pour port 4200, le test Karma est probablement `ng test` ou un script dédié — lire `package.json` racine `scripts` à l'exécution).
  </action>
  <verify>
    <automated>npx tsc --noEmit -p raspberry/tsconfig.json && npm test -- --watch=false --browsers=ChromeHeadless --include='**/app.component.spec.ts' 2>&1 | tail -30</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "/api/captive/whoami" raspberry/src/app/app.component.ts` exit 0
    - `grep -q "location.replace" raspberry/src/app/app.component.ts` exit 0
    - `grep -q "URLSearchParams" raspberry/src/app/app.component.ts` exit 0
    - `grep -q "displayIndex" raspberry/src/app/app.component.ts` exit 0
    - `grep -q "/captive/wait" raspberry/src/app/app.component.ts` exit 0
    - `grep -qE "location\\.href\\s*=" raspberry/src/app/app.component.ts` exit 1 (UI-SPEC : interdit, replace only)
    - `grep -q "Fire Stick captive bootstrap" raspberry/src/app/app.component.spec.ts` exit 0
    - `grep -c "CAPTIVE-0" raspberry/src/app/app.component.spec.ts` ≥ 2
    - `grep -q "background.*#000" raspberry/src/index.html` exit 0 (anti-flash UI-SPEC)
    - `npx tsc --noEmit -p raspberry/tsconfig.json` exit 0
    - 4 nouveaux tests Karma passing (commande à adapter au runner du repo)
  </acceptance_criteria>
  <done>
    AppComponent route les Fire Stick au boot, Karma vert sur les 4 cas (URL déjà résolue / assigné / non assigné / fetch error), index.html ne flashe pas en blanc.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Manual validation on real Pi + Fire Stick (Pi RACC)</name>
  <what-built>
    Phase 6 complète : Plan 01 (resolveMacByIp), Plan 02 (route /api/captive/whoami), Plan 03 (configs nginx/dnsmasq + page d'attente + smoke), Plan 04 (Angular bootstrap router).
    Le système doit, sur un Fire Stick neuf branché au hotspot Pi RACC, atterrir automatiquement sur la bonne page sans intervention bénévole.
  </what-built>
  <how-to-verify>
    Préparation:
    1. Sur le Pi RACC (`ssh pi@neopro.local`), `cd /home/pi/neopro && git pull` puis `./scripts/sync-deploy.sh` ou équivalent OTA pour récupérer la branche.
    2. `sudo systemctl reload nginx && sudo systemctl restart dnsmasq && sudo systemctl restart neopro-server` (ou laisser le sync-agent gérer).
    3. Vérifier `nginx -t` exit 0, `systemctl status dnsmasq` actif, `curl http://localhost:3000/api/captive/whoami -H "X-Real-IP: 192.168.4.99"` retourne 404 mac_not_found (IP fictive non vue).

    Test 1 — CAPTIVE-01 + CAPTIVE-03 (Fire Stick non assigné):
    1. Brancher un Fire Stick neuf (ou réinitialiser un Fire Stick test) sur le hotspot NEOPRO-RACC, saisir le PSK.
    2. Une fois connecté, lancer Silk → DNS hijack devrait emmener Silk sur 192.168.4.1.
    3. Si l'URL est /, Angular bootstrap devrait fetch /api/captive/whoami → recevoir mac + displayIndex null → rediriger vers /captive/wait?mac=...
    4. **Observable** : page d'attente affichée, MAC en grand caractères 128px, dark theme, French copy "En attente d'assignation".
    5. Noter la MAC affichée pour Test 2.

    Test 2 — CAPTIVE-02 + CAPTIVE-04 (assignation à distance):
    1. Depuis le dashboard cloud (ou en bricolant directement la DB le temps que Phase 8 livre l'UI), assigner la MAC notée à un display via `siteRepository.setReceiver()`.
    2. Le sync-agent devrait propager le changement au Pi → state.service mis à jour → emit Socket.IO 'connected-receivers-changed'.
    3. **Observable** : la page d'attente Fire Stick bascule **automatiquement** vers /?display=N en < 5s (cible : < 500ms via Socket.IO push). L'app Neopro plein écran s'affiche sur la TV connectée à ce Fire Stick.

    Test 3 — ADR-079 invariant (port 443 NON DNAT):
    1. Sur le Pi RACC: `sudo iptables -t nat -L PREROUTING -n` → vérifier qu'aucune règle DNAT pour port 443 n'apparaît.
    2. Vérifier qu'un curl vers https://captive.apple.com depuis le Fire Stick échoue avec TLS error (pas une redirection vers le Pi). C'est le comportement attendu pour qu'iOS ouvre la sheet captive.

    Test 4 — Reboot Pi (résilience):
    1. `sudo reboot` du Pi RACC. Attendre 2 min.
    2. Vérifier que les configs Phase 6 sont toujours actives (`grep firetvcaptiveportal /etc/dnsmasq.d/*` retourne la ligne ajoutée), Fire Stick branché redémarre sur la même page d'attente / Neopro selon état d'assignation.
  </how-to-verify>
  <resume-signal>Type "approved" if all 4 tests pass on Pi RACC, or describe failures (which test, observable behavior)</resume-signal>
</task>

</tasks>

<verification>
- TypeScript build pass : npx tsc --noEmit -p raspberry/tsconfig.json
- Karma tests verts (4 nouveaux + tous les existants)
- Validation manuelle Pi RACC : 4/4 tests passing
- ADR-079 invariant respecté en prod (iptables -L PREROUTING confirme port 443 absent)
</verification>

<success_criteria>
- Un bénévole branchant un Fire Stick neuf voit la page d'attente sans aucune saisie d'URL
- L'admin assigne la MAC depuis la DB (en attendant Phase 8 dashboard) → la TV bascule en < 5s sur Neopro plein écran
- Aucune régression sur le path Pi natif (TV principale via HDMI #0 continue de fonctionner avec ?display=0)
</success_criteria>

<output>
After completion, create `.planning/phases/06-captive-fire-stick-page-neopro/06-captive-04-SUMMARY.md`

Update ROADMAP.md to mark Phase 6 plans count + completion when all 4 plans landed.
</output>
</content>
</invoke>