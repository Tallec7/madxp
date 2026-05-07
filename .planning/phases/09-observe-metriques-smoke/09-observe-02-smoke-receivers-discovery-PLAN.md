---
phase: 09-observe-metriques-smoke
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - central-server/src/__tests__/smoke/smoke-receivers-discovery.test.ts
  - central-server/src/scripts/smart-smoke.sh
autonomous: true
requirements: [OBSERVE-02]
must_haves:
  truths:
    - 'La suite smoke-receivers-discovery detecte la suppression de receiver_assignment_updated de la whitelist sync-agent'
    - 'La suite smoke-receivers-discovery detecte la disparition de la route /:id/connected-receivers'
    - 'La suite smoke-receivers-discovery detecte la suppression de ReceiverInfo/ReceiverConfig du modele dashboard'
    - 'La suite smoke-receivers-discovery detecte la suppression du bloc /api/captive/whoami de nginx'
    - 'La suite smoke-receivers-discovery detecte la disparition de firetvcaptiveportal.com de dnsmasq.conf'
    - 'smart-smoke.sh declenche smoke-receivers-discovery sur modification de receivers.service ou dnsmasq.conf'
  artifacts:
    - path: 'central-server/src/__tests__/smoke/smoke-receivers-discovery.test.ts'
      provides: 'Suite smoke complete avec 11 contrats verifies'
      contains: 'smoke-receivers-discovery'
    - path: 'central-server/src/scripts/smart-smoke.sh'
      provides: 'Mapping smart-smoke vers smoke-receivers-discovery'
      contains: 'smoke-receivers-discovery'
  key_links:
    - from: 'central-server/src/__tests__/smoke/smoke-receivers-discovery.test.ts'
      to: 'raspberry/sync-agent/src/config.js'
      via: 'fs.readFileSync — verifie receiver_assignment_updated dans DEFAULT_ALLOWED_COMMANDS'
      pattern: 'receiver_assignment_updated'
    - from: 'central-server/src/__tests__/smoke/smoke-receivers-discovery.test.ts'
      to: 'central-server/src/services/socket.service.ts'
      via: 'fs.readFileSync — verifie receiversBySite Map et getConnectedReceivers'
      pattern: 'receiversBySite'
---

<objective>
Creer la suite smoke `smoke-receivers-discovery` qui fige en tests automatises les 11 contrats de wiring de la feature Fire Stick (whitelist sync-agent, route API, modele dashboard, service dashboard, nginx, dnsmasq, service Pi receivers, Map socket). Ajouter le mapping dans smart-smoke.sh pour un declenchement intelligent.

Purpose: Sans ces smoke tests, une regression de wiring (event retire de la whitelist, interface supprimee, route disparue) passerait silencieusement dans une PR future. Le file-level read garantit un bootstrap ultra-rapide (moins d'une seconde) et aucune dependance sur le runtime applicatif.
Output: 1 fichier test + 1 ligne dans smart-smoke.sh, protection de 11 contrats de wiring.
</objective>

<execution_context>
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/workflows/execute-plan.md
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md

@central-server/src/**tests**/smoke/smoke-hotspot-psk.test.ts
@central-server/src/scripts/smart-smoke.sh

<interfaces>
Pattern smoke file-level (smoke-hotspot-psk.test.ts lignes 1-12) :

```typescript
import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../../../');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(repoRoot, rel));
```

Contrats a verifier (verifies sur le codebase livre phases 5-8) :

Contrat 1 — sync-agent whitelist (raspberry/sync-agent/src/config.js) :
Doit contenir : 'receiver_assignment_updated' dans DEFAULT_ALLOWED_COMMANDS

Contrat 2 — Route API cloud (central-server/src/routes/sites.routes.ts) :
Doit contenir : 'connected-receivers'

Contrat 3a — Modele dashboard ReceiverInfo (central-dashboard/src/app/core/models/index.ts) :
Doit contenir : 'ReceiverInfo'

Contrat 3b — Modele dashboard ReceiverConfig (central-dashboard/src/app/core/models/index.ts) :
Doit contenir : 'ReceiverConfig'

Contrat 3c — Modele dashboard DisplayConfig.receiver :
Doit contenir : 'receiver' dans models/index.ts

Contrat 4 — Service dashboard (central-dashboard/src/app/core/services/sites.service.ts) :
Doit contenir : 'getConnectedReceivers'

Contrat 5 — nginx captive whoami (raspberry/config/nginx/neopro-base.conf) :
Doit contenir : '/api/captive/whoami'

Contrat 6a — dnsmasq Fire Stick DNS (raspberry/config/systemd/dnsmasq.conf) :
Doit contenir : 'firetvcaptiveportal.com'

Contrat 6b — dnsmasq Fire Stick DNS (raspberry/config/systemd/dnsmasq.conf) :
Doit contenir : 'spectrum.s3.amazonaws.com'

Contrat 7 — Pi receivers service existe :
exists('raspberry/src/app/services/receivers.service.js') OU
exists('raspberry/server/services/receivers.service.js')

Contrat 8a — Map socket cloud (central-server/src/services/socket.service.ts) :
Doit contenir : 'receiversBySite'

Contrat 8b — Methode socket cloud :
Doit contenir : 'getConnectedReceivers'

Pattern smart-smoke.sh (format pattern=suite, lignes 28-41) — nouvelle ligne a ajouter :
receivers\.service|ReceiverInfo|connected-receivers|receiver_assignment|dnsmasq\.conf=smoke-receivers-discovery
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Creer smoke-receivers-discovery.test.ts</name>
  <files>central-server/src/__tests__/smoke/smoke-receivers-discovery.test.ts</files>
  <action>
    Creer le fichier en suivant EXACTEMENT le pattern de smoke-hotspot-psk.test.ts.
    Imports fs et path uniquement. repoRoot = path.resolve(__dirname, '../../../../').
    Helpers read() et exists(). Pas de jest.mock, pas de bootstrap applicatif.
    Chaque it() teste UN contrat atomique.

    Contenu exact a produire (TypeScript) :

    En-tete JSDoc expliquant les 11 contrats gardes.

    Imports : import * as fs from 'fs'; import * as path from 'path';

    Constantes : repoRoot, read, exists (meme pattern que smoke-hotspot-psk.test.ts).

    describe('Smoke — receivers discovery (Phase 9 OBSERVE-02)', () => {

      Section sync-agent whitelist :
      it('sync-agent — receiver_assignment_updated est dans DEFAULT_ALLOWED_COMMANDS', () => {
        const config = read('raspberry/sync-agent/src/config.js');
        expect(config).toMatch(/receiver_assignment_updated/);
      });

      Section API cloud :
      it('central-server — route connected-receivers est declaree dans sites.routes.ts', () => {
        const routes = read('central-server/src/routes/sites.routes.ts');
        expect(routes).toMatch(/connected-receivers/);
      });

      Section dashboard modeles :
      it('dashboard — interface ReceiverInfo est exportee depuis models/index.ts', () => {
        const models = read('central-dashboard/src/app/core/models/index.ts');
        expect(models).toMatch(/ReceiverInfo/);
      });

      it('dashboard — interface ReceiverConfig est exportee depuis models/index.ts', () => {
        const models = read('central-dashboard/src/app/core/models/index.ts');
        expect(models).toMatch(/ReceiverConfig/);
      });

      it('dashboard — models/index.ts contient un champ receiver', () => {
        const models = read('central-dashboard/src/app/core/models/index.ts');
        expect(models).toMatch(/receiver/i);
        expect(models).toMatch(/ReceiverInfo/);
      });

      Section dashboard service :
      it('dashboard — SitesService expose getConnectedReceivers', () => {
        const service = read('central-dashboard/src/app/core/services/sites.service.ts');
        expect(service).toMatch(/getConnectedReceivers/);
      });

      Section nginx :
      it('nginx — bloc /api/captive/whoami est declare dans neopro-base.conf', () => {
        const nginx = read('raspberry/config/nginx/neopro-base.conf');
        expect(nginx).toMatch(/\/api\/captive\/whoami/);
      });

      Section dnsmasq :
      it('dnsmasq — firetvcaptiveportal.com est redirige vers le Pi', () => {
        const dnsmasq = read('raspberry/config/systemd/dnsmasq.conf');
        expect(dnsmasq).toMatch(/firetvcaptiveportal\.com/);
      });

      it('dnsmasq — spectrum.s3.amazonaws.com est redirige vers le Pi', () => {
        const dnsmasq = read('raspberry/config/systemd/dnsmasq.conf');
        expect(dnsmasq).toMatch(/spectrum\.s3\.amazonaws\.com/);
      });

      Section Pi receivers service :
      it('Pi — receivers.service.js existe dans raspberry/src/app/services/ ou raspberry/server/services/', () => {
        const inAppServices = exists('raspberry/src/app/services/receivers.service.js');
        const inServerServices = exists('raspberry/server/services/receivers.service.js');
        expect(inAppServices || inServerServices).toBe(true);
      });

      Section SocketService cloud :
      it('socket.service.ts — Map receiversBySite est declaree', () => {
        const socket = read('central-server/src/services/socket.service.ts');
        expect(socket).toMatch(/receiversBySite/);
      });

      it('socket.service.ts — methode getConnectedReceivers est declaree', () => {
        const socket = read('central-server/src/services/socket.service.ts');
        expect(socket).toMatch(/getConnectedReceivers/);
      });

    });

    IMPORTANT : Ne pas modifier ce fichier pour contourner des echecs — si un test echoue,
    corriger le wiring dans le fichier source concerne. Le test du Pi receivers.service.js
    utilise || pour tolerer deux emplacements possibles selon la structure livree en phase 5.

  </action>
  <verify>
    <automated>cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/worktrees/nifty-ellis-756b56/central-server && npx jest --testPathPattern='smoke/smoke-receivers-discovery' --no-coverage --forceExit --verbose 2>&1 | tail -30</automated>
  </verify>
  <done>La suite smoke passe avec tous les tests en PASS. Si un test echoue sur un contrat reel (wiring manquant en phase 5-8), corriger le wiring dans le fichier source concerne avant de marquer ce plan comme termine. Ne jamais assouplir le test.</done>
</task>

<task type="auto">
  <name>Task 2: Mapping smart-smoke.sh pour smoke-receivers-discovery</name>
  <files>central-server/src/scripts/smart-smoke.sh</files>
  <action>
    Dans smart-smoke.sh, le bloc MAPPINGS est un heredoc entre guillemets (lignes 27-42).
    Le format est : pattern=suite (une ligne par mapping).

    Ajouter cette ligne AVANT la ligne fermante du heredoc (le guillemet seul) :

      receivers\.service|ReceiverInfo|connected-receivers|receiver_assignment|dnsmasq\.conf=smoke-receivers-discovery

    La ligne doit etre positionnee apres la derniere ligne de mapping existante
    (actuellement : PROP-003|SPEC-PROP-003|...|scoreboard=smoke-prop003-scoreboard).

    Ce pattern declenchera smoke-receivers-discovery quand git diff touche :
    - Tout fichier dont le path contient "receivers.service" (Pi service, socket service)
    - Tout fichier dont le path contient "ReceiverInfo" (modele dashboard)
    - Tout fichier dont le path contient "connected-receivers" (route API)
    - Tout fichier dont le path contient "receiver_assignment" (whitelist, controller)
    - dnsmasq.conf (configs Pi)

    Ne pas modifier les autres lignes de mapping existantes.
    Ne pas changer les permissions du fichier.

  </action>
  <verify>
    <automated>bash -n /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/worktrees/nifty-ellis-756b56/central-server/src/scripts/smart-smoke.sh &amp;&amp; echo "Syntaxe bash OK" &amp;&amp; grep "smoke-receivers-discovery" /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/worktrees/nifty-ellis-756b56/central-server/src/scripts/smart-smoke.sh</automated>
  </verify>
  <done>bash -n passe sans erreur. grep "smoke-receivers-discovery" smart-smoke.sh retourne la ligne de mapping ajoutee. Le nombre total de lignes dans le fichier a augmente de 1.</done>
</task>

</tasks>

<verification>
```bash
# 1. Suite smoke complete
cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/worktrees/nifty-ellis-756b56/central-server
npx jest --testPathPattern='smoke/smoke-receivers-discovery' --no-coverage --forceExit --verbose

# 2. Syntaxe smart-smoke.sh

bash -n src/scripts/smart-smoke.sh

# 3. Mapping present

grep "smoke-receivers-discovery" src/scripts/smart-smoke.sh

# 4. Test smart-smoke detection (simuler modification de receivers.service)

CHANGED="central-server/src/services/socket.service.ts" bash src/scripts/smart-smoke.sh --list 2>&1 | grep "smoke-receivers-discovery"

```
</verification>

<success_criteria>
1. `npx jest --testPathPattern='smoke/smoke-receivers-discovery' --no-coverage --forceExit` passe en entier (11 tests PASS).
2. Si un test echoue, le wiring est corrige dans le fichier source concerne (pas dans le test).
3. `bash -n central-server/src/scripts/smart-smoke.sh` retourne 0 (syntaxe correcte).
4. `grep "smoke-receivers-discovery" central-server/src/scripts/smart-smoke.sh` retourne exactement 1 ligne de mapping.
5. `npm run test:smoke` (all) passe sans regression sur les 13+ suites existantes.
</success_criteria>

<output>
Apres completion, creer `.planning/phases/09-observe-metriques-smoke/09-observe-02-SUMMARY.md` avec :
- Confirmation que les 11 tests passent (ou liste des wiring corriges pour les faire passer)
- La ligne de mapping ajoutee dans smart-smoke.sh
- Hash du dernier commit
</output>
```
