---
phase: 06
plan: 06
gap_closure: true
wave: 2
depends_on:
  - 05
files_modified:
  - raspberry/scripts/build-raspberry.sh
  - central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts
autonomous: true
requirements_closed:
  - success_criterion_5
must_haves:
  truths:
    - 'Le tarball OTA contient raspberry/config/nginx/neopro-base.conf à /home/pi/neopro/config/nginx/ (idempotent)'
    - "Une régression future de install.sh (réintroduction d'un heredoc) est détectée par smoke test"
    - "L'application sur nginx d'un Pi existant requiert une ré-exécution de `bash install.sh` (idempotente, supportée par Plan 05) — pas d'auto-reload sync-agent dans ce scope"
  artifacts:
    - path: raspberry/scripts/build-raspberry.sh
      provides: 'Copie de raspberry/config/nginx/neopro-base.conf dans deploy/'
      contains: 'config/nginx/neopro-base.conf'
    - path: central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts
      provides: 'Garde-fou install.sh — soit cp neopro-base.conf, soit 3 markers captive'
      contains: 'neopro-base.conf'
  key_links:
    - from: raspberry/scripts/build-raspberry.sh
      to: raspberry/deploy/config/nginx/neopro-base.conf
      via: 'cp explicite avant le tar'
      pattern: "cp .*config/nginx/neopro-base\\.conf"
    - from: smoke-kiosk-pi.test.ts (Phase 6 describe)
      to: raspberry/install.sh
      via: 'fs.readFileSync + assertion OR/markers'
      pattern: "neopro-base\\.conf"
---

<objective>
**Phase 6 verification gap closure — partie 2/2** (depend de Plan 05).

**Ordonnancement** : les tâches de ce plan doivent atterrir dans la même PR que Plan 05
(ou strictement après son merge), sinon le smoke test du task 2 échoue.

Une fois install.sh refactorée (Plan 05) pour utiliser `neopro-base.conf`, deux problèmes restent :

1. **OTA propagation (rescopée)** : `build-raspberry.sh` ne copie PAS `raspberry/config/nginx/` dans le tarball
   → un Pi existant qui pull la dernière version OTA n'a pas le fichier sous `/home/pi/neopro/config/nginx/`.
   Ce plan fait en sorte que **le tarball OTA expédie `neopro-base.conf` à `/home/pi/neopro/config/nginx/`**
   pour qu'une future ré-exécution de `bash install.sh` sur ce Pi le trouve. install.sh est idempotente
   (Plan 05) — opérationnellement, mettre à jour un Pi existant = pull latest + re-run install.sh.
   **Le critère #5 ROADMAP est explicitement rescopé à "fresh install OR re-run de install.sh"**, PAS à
   un auto-reload nginx via sync-agent (hors scope : le sync-agent n'a pas les sudoers nginx reload).
2. **Régression silencieuse** : rien n'empêche un futur PR de réintroduire un heredoc inline dans
   install.sh (le bug d'origine). Besoin d'un smoke test garde-fou.

**Output** :

- build-raspberry.sh copie `raspberry/config/nginx/neopro-base.conf` dans `${DEPLOY_DIR}/config/nginx/`.
- Nouveau `it()` dans le bloc Phase 6 de smoke-kiosk-pi.test.ts qui assert :
  - SOIT `install.sh` contient `cp .*config/nginx/neopro-base.conf` (le bon chemin)
  - SOIT `install.sh` contient les 3 markers captive (`kindle-wifi/wifistub.html`, `/api/captive/whoami`, `/captive/wait`)
    (fallback : si quelqu'un revient à un heredoc, au moins qu'il contienne les routes nécessaires).

Note OTA : sync-agent installe le tarball dans `/home/pi/neopro/`. Le fichier sera donc à
`/home/pi/neopro/config/nginx/neopro-base.conf` — chemin que install.sh (Plan 05) référence déjà
via `${INSTALL_DIR}/config/nginx/neopro-base.conf`. **Aucune sudoers update nécessaire** : le sync-agent
ne reload PAS nginx (rescope explicite ; un Pi déjà installé a son symlink, et la prochaine
ré-exécution de install.sh — idempotente — appliquera la nouvelle conf).
</objective>

<execution_context>
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/workflows/execute-plan.md
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/06-captive-fire-stick-page-neopro/06-VERIFICATION.md
@.planning/phases/06-captive-fire-stick-page-neopro/06-captive-05-PLAN.md
@raspberry/scripts/build-raspberry.sh
@raspberry/config/nginx/neopro-base.conf
@central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Propagate neopro-base.conf in build-raspberry.sh</name>
  <files>raspberry/scripts/build-raspberry.sh</files>

<read_first> - raspberry/scripts/build-raspberry.sh (lignes 365-410, autour de la copie firestick-wait.html) - raspberry/config/nginx/neopro-base.conf (vérifier qu'il existe à ce path)
</read_first>

  <action>
    Ajouter, **immédiatement après le bloc Phase 6 firestick-wait** (après la ligne 386 actuelle,
    soit après le `fi` de la copie firestick-wait.html, ~line 387), un nouveau bloc :

    ```bash
    # Phase 6 — gap closure : propager neopro-base.conf via OTA
    # Source de vérité nginx (utilisée par install.sh::configure_nginx). Sur un Pi existant,
    # l'application = re-run `bash install.sh` (idempotent, Plan 05) — pas d'auto-reload sync-agent.
    if [ -f "raspberry/config/nginx/neopro-base.conf" ]; then
        mkdir -p ${DEPLOY_DIR}/config/nginx
        cp raspberry/config/nginx/neopro-base.conf ${DEPLOY_DIR}/config/nginx/neopro-base.conf
        print_success "neopro-base.conf copiée → config/nginx/ (OTA-ready)"
    else
        print_error "raspberry/config/nginx/neopro-base.conf introuvable — abort"
        exit 1
    fi
    ```

    **Ne PAS** :
    - Modifier l'ordre des étapes existantes (rsync server, sync-agent, etc.).
    - Toucher au `rm -rf ${DEPLOY_DIR}` (la copie doit venir APRÈS).
    - Copier l'intégralité de `raspberry/config/` (scope = nginx uniquement pour ce plan).
    - Faire `cp -r raspberry/config/nginx/` sans `mkdir -p` préalable (échoue si DEPLOY_DIR/config n'existe pas).

    Conventional commit : `fix(captive): propagate neopro-base.conf in build-raspberry.sh`

  </action>

  <verify>
    <automated>bash -n raspberry/scripts/build-raspberry.sh</automated>
  </verify>

<acceptance_criteria> - `bash -n raspberry/scripts/build-raspberry.sh` exit 0 - `grep -c 'cp raspberry/config/nginx/neopro-base.conf' raspberry/scripts/build-raspberry.sh` ≥ 1 - `grep -c 'mkdir -p ${DEPLOY_DIR}/config/nginx' raspberry/scripts/build-raspberry.sh` ≥ 1 - Le bloc est positionné APRÈS la copie firestick-wait.html (vérif manuelle : grep -n affiche la ligne après celle de firestick-wait)
</acceptance_criteria>

  <done>
    `build-raspberry.sh` produit un `${DEPLOY_DIR}/config/nginx/neopro-base.conf` dans le tarball OTA.
    Sur un Pi existant qui pull cette release, le fichier sera à `/home/pi/neopro/config/nginx/neopro-base.conf`.
    L'application effective sur nginx requiert une ré-exécution de `bash install.sh` (idempotente, Plan 05) —
    rescope explicite : pas d'auto-reload sync-agent.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add smoke guard against install.sh nginx regression</name>
  <files>central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts</files>

<read_first> - central-server/src/**tests**/smoke/smoke-kiosk-pi.test.ts (chercher le `describe('Phase 6'`
ou un bloc captive existant — VERIFICATION mentionne ~ligne 3508) - raspberry/install.sh (post-Plan 05, doit déjà contenir `cp .*neopro-base.conf`)
</read_first>

  <action>
    Localiser le bloc `describe(...)` Phase 6 captive existant dans smoke-kiosk-pi.test.ts
    (autour de la ligne 3508 selon VERIFICATION ; faire `grep -n 'Phase 6' smoke-kiosk-pi.test.ts`
    pour confirmer). Y ajouter un nouveau `it(...)` :

    ```typescript
    it('install.sh wires neopro-base.conf OR contains the 3 captive markers (Phase 6 gap closure)', () => {
      const installSh = fs.readFileSync(
        path.join(__dirname, '../../../../raspberry/install.sh'),
        'utf8'
      );

      // Préférence : cp depuis neopro-base.conf (source de vérité, post-Phase 6 plan-05)
      const usesSourceOfTruth = /cp\s+["']?\$\{?INSTALL_DIR\}?[^"']*config\/nginx\/neopro-base\.conf/.test(installSh)
        || /cp\s+[^\n]*config\/nginx\/neopro-base\.conf/.test(installSh);

      // Fallback acceptable : heredoc inline mais qui contient les 3 routes captives
      const hasKindleWifi = installSh.includes('kindle-wifi/wifistub.html');
      const hasWhoami = installSh.includes('/api/captive/whoami');
      const hasCaptiveWait = installSh.includes('/captive/wait');
      const heredocHasAllMarkers = hasKindleWifi && hasWhoami && hasCaptiveWait;

      expect(
        usesSourceOfTruth || heredocHasAllMarkers,
        usesSourceOfTruth
          ? 'install.sh wires neopro-base.conf — OK'
          : `install.sh missing both neopro-base.conf cp AND captive markers ` +
            `(kindle-wifi: ${hasKindleWifi}, whoami: ${hasWhoami}, wait: ${hasCaptiveWait})`
      ).toBe(true);
    });
    ```

    Si le path `raspberry/install.sh` depuis le test est différent (vérifier comment les autres
    `it()` du même describe lisent install.sh — il y a forcément un précédent), utiliser le **même
    path résolution pattern** que les `it()` voisins.

    **Ne PAS** :
    - Créer un nouveau `describe()` parallèle (ajouter dans le bloc Phase 6 existant).
    - Importer `fs`/`path` à nouveau s'ils sont déjà importés en haut du fichier.
    - Tester `build-raspberry.sh` ici (hors scope ; le smoke test du build est implicite via `bash -n` du Plan 06 task 1).
    - Inverser la logique en `expect(usesSourceOfTruth).toBe(true)` strict (le fallback markers
      garde de la latitude pour un futur changement de stratégie sans casser le smoke).

    Conventional commit : `test(smoke): guard install.sh against captive nginx regression`

  </action>

  <verify>
    <automated>cd central-server && npx jest --testPathPattern='smoke/smoke-kiosk-pi' --no-coverage --forceExit -t 'neopro-base.conf'</automated>
  </verify>

<acceptance_criteria> - Le test runne et passe (vert) — install.sh post-Plan 05 satisfait `usesSourceOfTruth` - `grep -c 'neopro-base.conf' central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts` ≥ 1 - `grep -c "kindle-wifi/wifistub.html" central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts` ≥ 1 - `grep -c "/api/captive/whoami" central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts` ≥ 1 - `grep -c "/captive/wait" central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts` ≥ 1 - Le nouveau `it()` est dans le bloc `describe(...)` Phase 6 (vérif visuelle : indentation + position)
</acceptance_criteria>

  <done>
    Une régression future de install.sh — soit suppression du `cp neopro-base.conf`, soit
    réintroduction d'un heredoc qui oublierait les routes captives — fait échouer
    `npm run test:smoke` et bloque la PR. Le contrat est lock-in.
  </done>
</task>

</tasks>

<verification>
- Plan 05 mergé d'abord (sinon le smoke test échoue : install.sh ne contient pas encore `cp neopro-base.conf`)
- `bash -n raspberry/scripts/build-raspberry.sh` exit 0
- `npm run test:smoke -- --testPathPattern='smoke-kiosk-pi'` passe
- `grep -c 'cp raspberry/config/nginx/neopro-base.conf' raspberry/scripts/build-raspberry.sh` ≥ 1
</verification>

<success_criteria>
Critère #5 ROADMAP Phase 6 fully addressed (combiné avec Plan 05) :

1. From-scratch (Plan 05) : `bash install.sh` suffit
2. OTA tarball (Plan 06 task 1) : la conf est dans le tarball à `/home/pi/neopro/config/nginx/`,
   appliquée via re-run idempotent de `bash install.sh` (rescope explicite : pas d'auto-reload sync-agent)
3. Anti-régression (Plan 06 task 2) : smoke test bloque tout retour en arrière

Risque résiduel acceptable : auto-reload nginx via OTA hors scope. Sera adressé si besoin
par une future commande sync-agent dédiée.
</success_criteria>

<output>
Après complétion, créer `.planning/phases/06-captive-fire-stick-page-neopro/06-captive-06-SUMMARY.md`
suivant le template summary.md. Documenter explicitement :
- Le rescope "OTA propagation = tarball ship + re-run install.sh" (pas d'auto-reload nginx)
- Le pattern smoke test "OR fallback markers" comme garde-fou souple
</output>
