---
phase: 10-captive-auto
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - raspberry/config/nginx/neopro-base.conf
  - central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts
  - docs/guides/CAPTIVE-AUTO-OTA.md
autonomous: false
requirements: [CAPTIVE-05, CAPTIVE-06, CAPTIVE-07]

must_haves:
  truths:
    - 'Un Fire Stick fraîchement connecté au hotspot Pi déclenche le CaptivePortalLauncher Fire OS sans manipulation télécommande (CAPTIVE-05).'
    - 'Au boot du Fire Stick après connexion hotspot, Silk ouvre la page captive sans intervention (CAPTIVE-06).'
    - "Si l'auto-launch ne se déclenche pas, la page d'attente reste accessible manuellement via http://firetvcaptiveportal.com — comportement v4.0 préservé (CAPTIVE-07)."
    - 'Le smoke test smoke-kiosk-pi continue de passer après modification (régression CAPTIVE-01..04 inchangée).'
  artifacts:
    - path: 'raspberry/config/nginx/neopro-base.conf'
      provides: 'Endpoint /kindle-wifi/wifistub.html retourne 302 (pas 200 Success) + nouveau endpoint /kindle-wifi/wifiredirect.html'
      contains: 'return 302'
    - path: 'central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts'
      provides: 'Guards Phase 10 : wifistub retourne 302, wifiredirect existe, no 200 Success sur wifistub'
      contains: 'wifiredirect.html'
    - path: 'docs/guides/CAPTIVE-AUTO-OTA.md'
      provides: 'Procédure de déploiement Pi RACC + checklist validation manuelle Fire Stick AFTSS'
      contains: 'ssh pi@neopro.local'
  key_links:
    - from: 'Fire OS CaptivePortalLauncher'
      to: '/kindle-wifi/wifistub.html'
      via: 'DNS hijack spectrum.s3.amazonaws.com → 192.168.4.1 (dnsmasq, déjà en place Phase 6)'
      pattern: 'return 302'
    - from: '/kindle-wifi/wifistub.html'
      to: '/kindle-wifi/wifiredirect.html'
      via: 'nginx 302 redirect'
      pattern: "return 302 http://\\$host/kindle-wifi/wifiredirect.html"
    - from: '/kindle-wifi/wifiredirect.html'
      to: 'Page Neopro racine (Angular bootstrap → whoami)'
      via: 'nginx 302 redirect vers http://192.168.4.1/'
      pattern: 'return 302 http://192.168.4.1/'
---

<objective>
Phase 10 — CAPTIVE-AUTO : Faire que Silk Browser s'ouvre automatiquement sur la page captive Pi quand un Fire Stick rejoint le hotspot, sans manipulation de la télécommande par le bénévole.

Purpose : éliminer le dernier point de friction terrain (Phase 6 livrait l'infra captive mais répondait `200 "Success"` sur wifistub.html — ce qui dit à Fire OS « Internet OK, pas besoin de portail captif »). Phase 10 inverse ce signal en retournant `302` pour déclencher CaptivePortalLauncher natif Fire OS.

Output :

- `neopro-base.conf` modifié (wifistub.html → 302 + nouveau bloc wifiredirect.html)
- Smoke guards Phase 10 dans `smoke-kiosk-pi.test.ts` (assertion 302, no Success body, wifiredirect présent)
- Doc OTA `docs/guides/CAPTIVE-AUTO-OTA.md` (procédure scp + nginx reload + checklist validation manuelle Pi RACC)
- Validation manuelle Pi RACC avec Fire Stick AFTSS `0c:43:f9:36:04:77` (checkpoint humain)
  </objective>

<execution_context>
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/workflows/execute-plan.md
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/10-captive-auto/10-RESEARCH.md
@.planning/phases/10-captive-auto/10-VALIDATION.md
@raspberry/config/nginx/neopro-base.conf
@central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts
@raspberry/install.sh

<interfaces>
<!-- Existing nginx config — bloc wifistub.html actuel (Phase 6, lignes 63-68 de neopro-base.conf) -->

```nginx
# Fire OS captive probe (Phase 6 - CAPTIVE-01)
location = /kindle-wifi/wifistub.html {
    default_type text/html;
    return 200 '<!DOCTYPE html><html><head><title>Success</title></head><body>Success</body></html>';
    add_header Cache-Control "no-cache, no-store, must-revalidate";
}
```

<!-- Existing smoke test — guard Phase 6 (smoke-kiosk-pi.test.ts:3534-3541) -->

```typescript
it('nginx serves Fire OS kindle-wifi probe (CAPTIVE-01)', () => {
  const conf = fs.readFileSync(
    path.join(REPO_ROOT, 'raspberry/config/nginx/neopro-base.conf'),
    'utf8',
  );
  expect(conf).toMatch(/location\s*=\s*\/kindle-wifi\/wifistub\.html/);
  expect(conf).toContain('Success'); // ⚠️ DOIT être supprimé Phase 10
});
```

<!-- install.sh wiring nginx (raspberry/install.sh:663-705) -->
<!-- Le cp depuis neopro-base.conf est déjà en place (Phase 6 plan-05), -->
<!-- donc la modification du fichier source se propagera via re-run install.sh ou scp direct. -->

<!-- DNS hijack actif (Phase 6) -->
<!-- raspberry/config/systemd/dnsmasq.conf : -->
<!--   address=/firetvcaptiveportal.com/192.168.4.1 -->
<!--   address=/spectrum.s3.amazonaws.com/192.168.4.1 -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1 (Wave 0) : Mettre à jour smoke-kiosk-pi guards Phase 10 (RED)</name>
  <read_first>
    - central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts (lignes 3515-3611, describe Phase 6)
    - raspberry/config/nginx/neopro-base.conf (lignes 63-68, bloc wifistub actuel)
    - .planning/phases/10-captive-auto/10-RESEARCH.md (section "Code Examples" + "Open Questions" Q3)
  </read_first>
  <files>central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts</files>
  <behavior>
    - Test existant `'nginx serves Fire OS kindle-wifi probe (CAPTIVE-01)'` ligne 3534 doit RESTER présent (le bloc location existe encore) MAIS son assertion `expect(conf).toContain('Success')` doit DISPARAÎTRE (le body 'Success' empêcherait CaptivePortalLauncher).
    - Nouveau describe block `'Phase 10 — CAPTIVE-AUTO Silk auto-launch'` ajouté en fin de fichier (après ligne 3611, AVANT la fermeture du fichier).
    - Test 1 (CAPTIVE-05) : `wifistub.html` ne contient PAS `return 200` ET ne contient PAS le body `Success` (extraction du bloc nginx via helper). Doit FAIL avec la conf actuelle.
    - Test 2 (CAPTIVE-05) : `wifistub.html` contient `return 302` redirect vers wifiredirect.html. Doit FAIL.
    - Test 3 (CAPTIVE-05/06) : un bloc `location = /kindle-wifi/wifiredirect.html` existe dans neopro-base.conf. Doit FAIL.
    - Test 4 (CAPTIVE-05/06) : le bloc wifiredirect contient `return 302` vers `http://192.168.4.1/` (page racine Pi, Angular bootstrap prend le relais).
    - Test 5 (CAPTIVE-07 régression) : le bloc `/captive/wait` existe TOUJOURS et pointe TOUJOURS vers `firestick-wait.html` (régression Phase 6 inchangée).
    - Test 6 (CAPTIVE-07 régression ADR-079) : aucune règle DNAT 443 introduite (re-vérification, garde-fou cross-phase).
  </behavior>
  <action>
    1. Modifier le test existant ligne 3534-3541 :
       - Conserver `expect(conf).toMatch(/location\s*=\s*\/kindle-wifi\/wifistub\.html/);`
       - SUPPRIMER `expect(conf).toContain('Success');` (cette assertion empêchait Phase 10 — Phase 10 inverse précisément ce comportement)
       - Renommer le label test : `'nginx kindle-wifi probe block exists (CAPTIVE-01 / CAPTIVE-05 base)'`

    2. Ajouter helper `extractNginxBlock(conf, locationPath)` au top du describe Phase 10 :
       ```typescript
       function extractNginxBlock(conf: string, locationPath: string): string {
         const re = new RegExp(`location\\s*=\\s*${locationPath.replace(/\//g, '\\/').replace(/\./g, '\\.')}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`, 'm');
         const match = conf.match(re);
         return match ? match[1] : '';
       }
       ```

    3. Ajouter un nouveau `describe('Phase 10 — CAPTIVE-AUTO Silk auto-launch', () => { ... })` AVANT la fin du fichier, contenant exactement ces 6 tests :

       ```typescript
       describe('Phase 10 — CAPTIVE-AUTO Silk auto-launch', () => {
         const REPO_ROOT = path.resolve(__dirname, '../../../..');
         const confPath = path.join(REPO_ROOT, 'raspberry/config/nginx/neopro-base.conf');

         it('CAPTIVE-05: wifistub.html does NOT return 200 Success (would suppress CaptivePortalLauncher)', () => {
           const conf = fs.readFileSync(confPath, 'utf8');
           const block = extractNginxBlock(conf, '/kindle-wifi/wifistub.html');
           expect(block).not.toMatch(/return\s+200/);
           expect(block).not.toContain('Success');
         });

         it('CAPTIVE-05: wifistub.html returns 302 redirect to wifiredirect.html', () => {
           const conf = fs.readFileSync(confPath, 'utf8');
           const block = extractNginxBlock(conf, '/kindle-wifi/wifistub.html');
           expect(block).toMatch(/return\s+302\s+http:\/\/\$host\/kindle-wifi\/wifiredirect\.html/);
         });

         it('CAPTIVE-05/06: wifiredirect.html location block exists', () => {
           const conf = fs.readFileSync(confPath, 'utf8');
           expect(conf).toMatch(/location\s*=\s*\/kindle-wifi\/wifiredirect\.html/);
         });

         it('CAPTIVE-05/06: wifiredirect.html redirects to Pi root (Angular bootstrap)', () => {
           const conf = fs.readFileSync(confPath, 'utf8');
           const block = extractNginxBlock(conf, '/kindle-wifi/wifiredirect.html');
           expect(block).toMatch(/return\s+302\s+http:\/\/192\.168\.4\.1\//);
         });

         it('CAPTIVE-07 regression: /captive/wait still serves firestick-wait.html (Phase 6 preserved)', () => {
           const conf = fs.readFileSync(confPath, 'utf8');
           expect(conf).toContain('/captive/wait');
           expect(conf).toContain('firestick-wait.html');
         });

         it('CAPTIVE-07 regression ADR-079: no DNAT 443 introduced by Phase 10', () => {
           const iptables = fs.readFileSync(
             path.join(REPO_ROOT, 'raspberry/scripts/setup-captive-portal-iptables.sh'),
             'utf8'
           );
           expect(iptables).not.toMatch(/iptables[^\n]*-[AC][^\n]+--dport\s+443[^\n]*-j\s+DNAT/);
         });
       });
       ```

    4. Lancer le smoke test pour valider que les 4 nouveaux tests CAPTIVE-05/06 ÉCHOUENT (RED phase TDD) — la conf actuelle retourne 200 Success, pas 302.

    5. Commit : `test(captive-auto): add Phase 10 smoke guards for wifistub 302 + wifiredirect (RED)`

  </action>
  <verify>
    <automated>cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-server && npx jest --testPathPatterns='smoke-kiosk-pi' --no-coverage --forceExit 2>&1 | grep -E "(Phase 10|CAPTIVE-05|CAPTIVE-07|FAIL|PASS|Tests:)" | head -30</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "Phase 10 — CAPTIVE-AUTO" central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts` retourne `1`
    - `grep -c "wifiredirect.html" central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts` retourne `>= 4` (3 tests + bloc helper)
    - `grep -c "expect(conf).toContain('Success')" central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts` retourne `0` (l'assertion Phase 6 a été supprimée)
    - `grep -c "extractNginxBlock" central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts` retourne `>= 5` (helper + ≥4 usages)
    - Sortie Jest contient `4 failed` parmi les tests Phase 10 (CAPTIVE-05 wifistub, wifiredirect block, wifiredirect target ; OK = CAPTIVE-07 regression + base block)
    - `git log --oneline -1` montre commit `test(captive-auto)` avec hash valide
  </acceptance_criteria>
  <done>
    Les 6 tests Phase 10 sont présents dans le fichier ; 4 tests CAPTIVE-05/06 échouent en RED (conf nginx pas encore modifiée) ; 2 tests CAPTIVE-07 + base passent (régression Phase 6 préservée) ; commit RED créé.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2 (Wave 1) : Modifier neopro-base.conf — wifistub 302 + nouveau wifiredirect (GREEN)</name>
  <read_first>
    - raspberry/config/nginx/neopro-base.conf (lignes complètes — voir bloc actuel lignes 63-68)
    - central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts (les guards Phase 10 ajoutés Task 1 — pour respecter EXACTEMENT les patterns assertés)
    - .planning/phases/10-captive-auto/10-RESEARCH.md (section "Pattern nginx recommandé" lignes 113-138)
  </read_first>
  <files>raspberry/config/nginx/neopro-base.conf</files>
  <behavior>
    - Bloc `/kindle-wifi/wifistub.html` (lignes 63-68 actuelles) remplacé : retourne `302` vers `http://$host/kindle-wifi/wifiredirect.html` au lieu de `200 Success`. Plus de body HTML, plus de `default_type text/html` (un 302 n'a pas besoin de body).
    - Nouveau bloc `/kindle-wifi/wifiredirect.html` ajouté immédiatement après le bloc wifistub : retourne `302` vers `http://192.168.4.1/` (racine Pi, Angular bootstrap router prend le relais).
    - Les `add_header Cache-Control "no-cache, no-store, must-revalidate"` préservés sur les deux blocs (anti-cache mandatoire pour les probes Fire OS).
    - Les autres blocs du fichier (location /, /api/captive/whoami, /captive/wait, @captive_fallback, /captive-portal.html) restent INCHANGÉS.
    - Commentaires inline expliquent pourquoi le 302 (ADR research Phase 10 + lien CAPTIVE-05).
  </behavior>
  <action>
    1. Ouvrir `raspberry/config/nginx/neopro-base.conf`.

    2. Remplacer EXACTEMENT le bloc actuel (lignes 63-68) :
       ```nginx
       # Fire OS captive probe (Phase 6 - CAPTIVE-01)
       location = /kindle-wifi/wifistub.html {
           default_type text/html;
           return 200 '<!DOCTYPE html><html><head><title>Success</title></head><body>Success</body></html>';
           add_header Cache-Control "no-cache, no-store, must-revalidate";
       }
       ```
       Par :
       ```nginx
       # Fire OS captive probe (Phase 6 CAPTIVE-01 + Phase 10 CAPTIVE-05)
       # Phase 10 : retourner 302 (au lieu de 200 Success) pour déclencher
       # CaptivePortalLauncher natif Fire OS — sans cela, Silk ne s'ouvre pas
       # automatiquement (le bénévole devait lancer Silk manuellement).
       # Voir .planning/phases/10-captive-auto/10-RESEARCH.md
       location = /kindle-wifi/wifistub.html {
           return 302 http://$host/kindle-wifi/wifiredirect.html;
           add_header Cache-Control "no-cache, no-store, must-revalidate";
       }

       # Fire OS captive portal target (Phase 10 - CAPTIVE-05/06)
       # Endpoint chargé par CaptivePortalLauncher après détection du portail.
       # Redirige vers la racine Pi → Angular bootstrap router résout via /api/captive/whoami
       # (page Neopro plein écran si MAC assignée, page d'attente sinon).
       location = /kindle-wifi/wifiredirect.html {
           return 302 http://192.168.4.1/;
           add_header Cache-Control "no-cache, no-store, must-revalidate";
       }
       ```

    3. Vérifier que le reste du fichier (notamment `location = /captive/wait`, `location = /api/captive/whoami`, `location /`) n'est pas altéré.

    4. Lancer les smoke tests Phase 10 + Phase 6 pour confirmer GREEN :
       ```bash
       cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-server && npx jest --testPathPatterns='smoke-kiosk-pi' --no-coverage --forceExit
       ```
       Tous les tests doivent passer (Phase 6 CAPTIVE-01..04 + Phase 10 CAPTIVE-05/06/07).

    5. Lancer aussi `smoke-receivers-discovery` (Phase 9) pour confirmer aucune régression cross-phase :
       ```bash
       cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-server && npx jest --testPathPatterns='smoke-receivers-discovery' --no-coverage --forceExit
       ```

    6. Commit : `feat(captive-auto): nginx wifistub 302 + wifiredirect endpoint (CAPTIVE-05/06/07) (GREEN)`

  </action>
  <verify>
    <automated>cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-server && npx jest --testPathPatterns='smoke-kiosk-pi|smoke-receivers-discovery' --no-coverage --forceExit 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "return 302 http://\$host/kindle-wifi/wifiredirect.html" raspberry/config/nginx/neopro-base.conf` retourne `1`
    - `grep -c "location = /kindle-wifi/wifiredirect.html" raspberry/config/nginx/neopro-base.conf` retourne `1`
    - `grep -c "return 302 http://192.168.4.1/" raspberry/config/nginx/neopro-base.conf` retourne `1`
    - `grep -c "return 200" raspberry/config/nginx/neopro-base.conf | head -1` ne contient PLUS la ligne `Success` HTML pour wifistub (le `@captive_fallback` ligne 57 reste, c'est un autre bloc — vérification par bloc spécifique)
    - `grep -A 2 "location = /kindle-wifi/wifistub.html" raspberry/config/nginx/neopro-base.conf | grep -c "Success"` retourne `0`
    - Smoke `smoke-kiosk-pi` : tous les tests Phase 6 + Phase 10 PASS (sortie Jest `Tests:` montre 0 failed sur ces describe blocks)
    - Smoke `smoke-receivers-discovery` : pas de régression (suite verte)
    - `git log --oneline -1` montre commit `feat(captive-auto)` avec hash valide
  </acceptance_criteria>
  <done>
    `neopro-base.conf` contient les deux blocs Phase 10 ; smoke-kiosk-pi PASSE entièrement (Phase 6 préservée + Phase 10 verte) ; aucune régression smoke-receivers-discovery ; commit GREEN créé.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3 (Wave 2) : Validation manuelle Pi RACC — Fire Stick auto-launch + doc OTA</name>
  <read_first>
    - .planning/phases/10-captive-auto/10-VALIDATION.md (section "Manual-Only Verifications")
    - .planning/phases/10-captive-auto/10-RESEARCH.md (section "Open Questions" Q1 — Fire OS 8 inconsistance)
    - raspberry/install.sh (lignes 663-705 — pour comprendre le mécanisme cp depuis neopro-base.conf)
  </read_first>
  <files>docs/guides/CAPTIVE-AUTO-OTA.md</files>
  <action>
    AVANT le checkpoint, créer la doc OTA de déploiement :

    1. Créer `docs/guides/CAPTIVE-AUTO-OTA.md` avec ce contenu (markdown littéral) :

       ```markdown
       # Phase 10 — CAPTIVE-AUTO : Procédure de déploiement Pi

       > Déploiement de la modification nginx (`wifistub.html` → 302 + nouveau `wifiredirect.html`) sur les Pi de la flotte.
       > Source de vérité : `raspberry/config/nginx/neopro-base.conf`.

       ## Option A — OTA via re-run install.sh (recommandé pour la flotte)

       Le mécanisme `install.sh` ligne 678 fait `cp config/nginx/neopro-base.conf /etc/nginx/sites-available/neopro` (Phase 6 plan-05). Il suffit donc de relancer install.sh sur chaque Pi pour propager la nouvelle config.

       ```bash
       ssh pi@<pi-host>
       cd /home/pi/neopro
       git pull
       sudo bash install.sh
       sudo systemctl restart nginx
       ```

       Vérifier post-install :
       ```bash
       sudo nginx -t && grep -A 2 "location = /kindle-wifi/wifistub" /etc/nginx/sites-available/neopro
       # Doit afficher : return 302 http://$host/kindle-wifi/wifiredirect.html;
       ```

       ## Option B — Hotfix scp direct (Pi RACC pour validation)

       Pour le Pi RACC `neopro.local` (POC bénévole) :

       ```bash
       # Depuis la worktree
       scp raspberry/config/nginx/neopro-base.conf pi@neopro.local:/tmp/neopro-base.conf
       ssh pi@neopro.local 'sudo cp /tmp/neopro-base.conf /etc/nginx/sites-available/neopro && sudo nginx -t && sudo systemctl restart nginx'
       ```

       Vérifier la réponse 302 depuis un device sur le hotspot :
       ```bash
       ssh pi@neopro.local 'curl -I -H "Host: spectrum.s3.amazonaws.com" http://192.168.4.1/kindle-wifi/wifistub.html'
       # Doit afficher : HTTP/1.1 302 Moved Temporarily
       # Location: http://spectrum.s3.amazonaws.com/kindle-wifi/wifiredirect.html
       ```

       ## Checklist validation Fire Stick AFTSS (`0c:43:f9:36:04:77`)

       - [ ] Fire Stick éteint (débrancher alim 30s)
       - [ ] Brancher Fire Stick sur HDMI Pi
       - [ ] Au boot Fire OS, sélectionner le Wi-Fi `Neopro-<club>` et entrer le PSK
       - [ ] **Observer dans les 10s** : Silk Browser doit s'ouvrir AUTOMATIQUEMENT sur la page Neopro (CAPTIVE-05 / CAPTIVE-06) — OU une notification système "Connectez-vous au réseau" doit apparaître (acceptable, 1 tap télécommande)
       - [ ] Si rien ne se déclenche après 30s → fallback CAPTIVE-07 : ouvrir Silk manuellement, taper `firetvcaptiveportal.com` → la page d'attente Neopro doit s'afficher avec la MAC du Fire Stick

       ## Rollback

       Si l'auto-launch casse l'UX d'autres devices (Android, iOS, laptop) :
       ```bash
       ssh pi@<pi-host>
       sudo cp /etc/nginx/sites-available/neopro.pre-phase6.bak /etc/nginx/sites-available/neopro
       sudo systemctl restart nginx
       ```

       ## Métriques observabilité

       - Vérifier les logs nginx : `sudo journalctl -u nginx -f` durant la connexion Fire Stick
       - 2 lignes attendues : `GET /kindle-wifi/wifistub.html` (302) puis `GET /kindle-wifi/wifiredirect.html` (302) puis `GET /` (200)
       - Si les requêtes `wifistub.html` n'apparaissent pas → DNS hijack `spectrum.s3.amazonaws.com` cassé (vérifier dnsmasq)
       ```

    2. Commit : `docs(captive-auto): add CAPTIVE-AUTO OTA deployment guide + manual validation checklist`

    PUIS effectuer la validation manuelle Pi RACC :

    3. Déployer sur Pi RACC `neopro.local` via Option B (scp + restart nginx).

    4. Tester avec le Fire Stick AFTSS `0c:43:f9:36:04:77` :
       - Reboot Fire Stick (débrancher 30s)
       - Connexion au hotspot Pi RACC
       - Observer pendant 30s

    5. Documenter le résultat dans la conversation Daisy :
       - **CAPTIVE-05/06** : Silk s'ouvre auto ? Notification visible ? Rien ?
       - **CAPTIVE-07** : page d'attente accessible manuellement via `firetvcaptiveportal.com` ?

  </action>
  <what-built>
    - `docs/guides/CAPTIVE-AUTO-OTA.md` créé (procédure OTA + checklist validation Fire Stick)
    - Pi RACC `neopro.local` mis à jour avec la nouvelle conf nginx
    - Fire Stick AFTSS testé en conditions réelles
  </what-built>
  <how-to-verify>
    1. **Côté Pi RACC** :
       ```bash
       ssh pi@neopro.local 'sudo grep -A 2 "wifistub" /etc/nginx/sites-available/neopro'
       ```
       → doit afficher `return 302 http://$host/kindle-wifi/wifiredirect.html;`

    2. **Côté Fire Stick AFTSS** :
       - Débrancher l'alim Fire Stick 30s, rebrancher.
       - Sélectionner Wi-Fi `Neopro-<club>`, entrer PSK.
       - **Attendu CAPTIVE-05/06** : Silk Browser ouvre automatiquement la page Neopro dans les 10s, OU notification système "Connectez-vous au réseau" apparaît (1 tap acceptable).
       - Si rien après 30s : tester fallback CAPTIVE-07 (ouvrir Silk manuel → `firetvcaptiveportal.com` → page d'attente affichée).

    3. **Côté logs nginx** :
       ```bash
       ssh pi@neopro.local 'sudo journalctl -u nginx -f'
       ```
       → durant la connexion Fire Stick, voir les requêtes `wifistub.html` (302) puis `wifiredirect.html` (302) puis `/` (200).

    4. **Doc** :
       ```bash
       ls -l /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/docs/guides/CAPTIVE-AUTO-OTA.md
       grep -c "ssh pi@neopro.local" /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/docs/guides/CAPTIVE-AUTO-OTA.md
       # Doit retourner >= 2
       ```

  </how-to-verify>
  <acceptance_criteria>
    - Fichier `docs/guides/CAPTIVE-AUTO-OTA.md` existe (taille >= 2 KB)
    - `grep -c "ssh pi@neopro.local" docs/guides/CAPTIVE-AUTO-OTA.md` retourne `>= 2`
    - `grep -c "302" docs/guides/CAPTIVE-AUTO-OTA.md` retourne `>= 3` (doc explique 302 wifistub, 302 wifiredirect, et exemple curl)
    - `grep -c "CAPTIVE-05\|CAPTIVE-06\|CAPTIVE-07" docs/guides/CAPTIVE-AUTO-OTA.md` retourne `>= 3` (chaque requirement référencé)
    - Sur Pi RACC : `sudo nginx -t` retourne `syntax is ok` et `test is successful`
    - Sur Pi RACC : la commande `curl -I -H "Host: spectrum.s3.amazonaws.com" http://192.168.4.1/kindle-wifi/wifistub.html` retourne `HTTP/1.1 302`
    - Daisy a observé le comportement Fire Stick et indiqué : Silk auto-launch OK / notification 1 tap OK / fallback manuel OK / régression détectée
    - `git log --oneline -1` montre commit `docs(captive-auto)` avec hash valide
  </acceptance_criteria>
  <resume-signal>
    Daisy répond `approved` (auto-launch OK ou notification acceptable + fallback manuel OK), OU décrit la régression observée (ex : autre device cassé, 302 ne déclenche rien, page d'attente plus accessible). Si régression bloquante → rollback Pi RACC et créer un plan gap closure Phase 10.
  </resume-signal>
</task>

</tasks>

<verification>
**Phase 10 globale :**

1. Smoke verts post-Phase 10 :

   ```bash
   cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/central-server && npx jest --testPathPatterns='smoke-kiosk-pi|smoke-receivers-discovery' --no-coverage --forceExit
   ```

2. Validation Pi RACC : Fire Stick AFTSS connecté → comportement auto-launch (ou notification 1-tap) observé.

3. Pas de régression cross-phase :
   - Phase 6 CAPTIVE-01..04 toujours verts (page d'attente, whoami, dnsmasq hijack, firestick-wait.html)
   - Phase 9 OBSERVE-02 (smoke-receivers-discovery) inchangé
   - ADR-079 (no DNAT 443) toujours respecté

4. Doc OTA `CAPTIVE-AUTO-OTA.md` permet le déploiement flotte sans support technique.
   </verification>

<success_criteria>

- [ ] CAPTIVE-05 : `wifistub.html` retourne 302 (smoke vert + observation Pi RACC)
- [ ] CAPTIVE-06 : auto-launch fonctionne au boot Fire Stick (validation manuelle Pi RACC) — ou notification 1-tap acceptable documentée
- [ ] CAPTIVE-07 : page d'attente reste accessible manuellement (smoke régression Phase 6 + test manuel)
- [ ] Smoke `smoke-kiosk-pi` entièrement vert (Phase 6 + Phase 10)
- [ ] Doc OTA `CAPTIVE-AUTO-OTA.md` créée et validée par Daisy
- [ ] 3 commits atomiques : test (RED) + feat (GREEN) + docs
- [ ] Story Card de fin de tâche émise dans la conversation
      </success_criteria>

<output>
After completion, create `.planning/phases/10-captive-auto/10-01-SUMMARY.md` documenting :
- Diff stats (3 fichiers modifiés)
- Smoke results (Phase 6 + Phase 10 verts)
- Résultat validation Pi RACC (auto-launch OK / notification / fallback)
- Métriques observées (logs nginx pendant connexion Fire Stick)
- Risque résiduel (Fire OS 8 inconsistance documentée 10-RESEARCH.md Q1)
- Next : OTA flotte NLF (Pi production) — à orchestrer après confirmation Pi RACC stable
</output>
