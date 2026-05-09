---
phase: 06
plan: 05
gap_closure: true
wave: 1
depends_on: []
files_modified:
  - raspberry/install.sh
autonomous: true
requirements_closed:
  - success_criterion_5
must_haves:
  truths:
    - 'Un Pi installé via `bash install.sh` from scratch sert /api/captive/whoami sans intervention manuelle'
    - 'configure_nginx() copie raspberry/config/nginx/neopro-base.conf comme source de vérité'
    - 'Le symlink /etc/nginx/sites-enabled/neopro pointe vers /etc/nginx/sites-available/neopro'
    - 'Aucun fichier régulier ne bloque la création du symlink (idempotence install + ré-install)'
    - 'Aucun .bak résiduel dans /etc/nginx/sites-enabled/ ne casse `nginx -t` (duplicate default_server)'
  artifacts:
    - path: raspberry/install.sh
      provides: configure_nginx() refactorée — cp + ln -sf au lieu d'un heredoc inline
      contains: 'cp /home/pi/neopro/config/nginx/neopro-base.conf'
  key_links:
    - from: raspberry/install.sh::configure_nginx
      to: raspberry/config/nginx/neopro-base.conf
      via: 'cp source-of-truth → /etc/nginx/sites-available/neopro'
      pattern: "cp .*config/nginx/neopro-base\\.conf"
---

<objective>
Refactor `raspberry/install.sh::configure_nginx()` pour utiliser `raspberry/config/nginx/neopro-base.conf`
comme **unique source de vérité** au lieu de l'heredoc inline (lignes 665-794).

**Pourquoi** : la VERIFICATION Phase 6 (gap[0]) a démontré qu'un Pi installé from scratch ne sert PAS
les routes captive (`/kindle-wifi/wifistub.html`, `/api/captive/whoami`, `/captive/wait`) parce que
l'heredoc d'install.sh n'a jamais été synchronisé avec `neopro-base.conf` (ajouté en Phase 6 tasks 01-04).
Validation Pi NLF : 30 min perdues à scp+ln+restart manuel.

**Critère #5 ROADMAP** : Un `bash install.sh` from scratch doit suffire — zéro scp, zéro symlink manuel,
zéro restart manuel.

**Output** : install.sh refactorée + idempotente (gère pré-existence régulière OU symlink stale OU .bak résiduel).
</objective>

<execution_context>
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/workflows/execute-plan.md
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/06-captive-fire-stick-page-neopro/06-VERIFICATION.md
@raspberry/install.sh
@raspberry/config/nginx/neopro-base.conf
</context>

<tasks>

<task type="auto">
  <name>Task 1: Refactor configure_nginx() to use neopro-base.conf</name>
  <files>raspberry/install.sh</files>

<read_first> - raspberry/install.sh (lines 658-813, fonction `configure_nginx()` complète — heredoc lignes 665-794) - raspberry/config/nginx/neopro-base.conf (source de vérité à copier)
</read_first>

  <action>
    Remplacer **intégralement** le corps de `configure_nginx()` (lignes 662-813 dans install.sh)
    par la logique suivante. **Conserver** l'en-tête commentaire `# Étape 7: Configuration Nginx`
    et la signature `configure_nginx() {`.

    Nouvelle implémentation :

    1. `print_step "Configuration du serveur web Nginx (depuis neopro-base.conf)..."`
    2. **Source de vérité** : la conf vient de `${INSTALL_DIR}/config/nginx/neopro-base.conf`
       (qui sera `/home/pi/neopro/config/nginx/neopro-base.conf` après l'étape précédente
       `install_application()` qui copie le repo dans `${INSTALL_DIR}`).
    3. **Vérifier la présence de la source** (existence guard, séparé de la ligne cp pour faciliter
       la détection grep/smoke du `cp` littéral) :
       ```bash
       if [ ! -f "${INSTALL_DIR}/config/nginx/neopro-base.conf" ]; then
           print_error "Source nginx introuvable : ${INSTALL_DIR}/config/nginx/neopro-base.conf"
           exit 1
       fi
       ```
    4. **Backup défensif** de l'ancien fichier (si présent) — dans `sites-available/`, JAMAIS dans `sites-enabled/` :
       ```bash
       if [ -f /etc/nginx/sites-available/neopro ] && [ ! -L /etc/nginx/sites-available/neopro ]; then
           cp /etc/nginx/sites-available/neopro /etc/nginx/sites-available/neopro.pre-phase6.bak
           print_step "Backup ancienne config → /etc/nginx/sites-available/neopro.pre-phase6.bak"
       fi
       ```
    5. **Copier la source** vers `sites-available/` — chemin littéral inline sur la ligne `cp`
       (pas de variable intermédiaire) pour que les outils grep/smoke détectent le pattern
       `cp .*config/nginx/neopro-base.conf` directement sur la ligne d'action :
       ```bash
       cp "${INSTALL_DIR}/config/nginx/neopro-base.conf" /etc/nginx/sites-available/neopro
       chmod 644 /etc/nginx/sites-available/neopro
       ```
    6. **Nettoyer `sites-enabled/`** — empirique Pi NLF :
       - Si `/etc/nginx/sites-enabled/neopro` existe en fichier régulier (pas symlink) → le supprimer
         (sinon `ln -sf` crée `sites-enabled/neopro/neopro` au lieu d'écraser).
       - Supprimer tout `*.bak` ou `default` traînant dans `sites-enabled/` (nginx charge
         tout ce qu'il y a → un .bak avec `default_server` provoque "duplicate default server").
       ```bash
       # Si fichier régulier (pas symlink), supprimer
       if [ -e /etc/nginx/sites-enabled/neopro ] && [ ! -L /etc/nginx/sites-enabled/neopro ]; then
           rm -f /etc/nginx/sites-enabled/neopro
       fi
       # Nettoyer .bak résiduels (causent duplicate default_server)
       rm -f /etc/nginx/sites-enabled/*.bak
       rm -f /etc/nginx/sites-enabled/default
       ```
    7. **Créer le symlink** :
       ```bash
       ln -sf /etc/nginx/sites-available/neopro /etc/nginx/sites-enabled/neopro
       ```
    8. **Permissions www-data** (conservé de l'ancien code) :
       ```bash
       chmod 755 /home/pi
       chmod 755 "${INSTALL_DIR}"
       chmod -R 755 "${INSTALL_DIR}/webapp"
       chown -R pi:www-data "${INSTALL_DIR}/webapp"
       ```
    9. **Test + restart** — empirique Pi NLF : `reload` peut échouer à cause du stat caching
       du symlink, donc utiliser `restart` qui relit l'arbre depuis zéro :
       ```bash
       sudo nginx -t
       sudo systemctl restart nginx
       sudo systemctl enable nginx
       ```
    10. `print_success "Nginx configuré depuis neopro-base.conf (source de vérité)"`

    **Ne PAS** :
    - Garder l'heredoc inline (le but est de l'éliminer).
    - Réintroduire une variable intermédiaire `NGINX_SRC` sur la ligne `cp` (le path doit
      être littéral inline pour que `grep 'cp .*config/nginx/neopro-base.conf'` matche).
    - Modifier `install_application()` ou l'ordre des étapes du `main()`.
    - Toucher aux permissions hors du bloc nginx.
    - Créer un autre backup que `neopro.pre-phase6.bak`.
    - Lire/parser le contenu de `neopro-base.conf` (c'est un cp opaque).

    Conventional commit : `fix(captive): wire neopro-base.conf in install.sh configure_nginx`

  </action>

  <verify>
    <automated>bash -n raspberry/install.sh</automated>
  </verify>

<acceptance_criteria> - `bash -n raspberry/install.sh` exit code = 0 (syntaxe valide) - `grep -c 'cat > /etc/nginx/sites-available/neopro' raspberry/install.sh` = 0 (heredoc supprimé) - `grep -c 'cp .*config/nginx/neopro-base.conf' raspberry/install.sh` ≥ 1 (cp source de vérité présent — doit matcher la ligne `cp` littérale, pas une assignation `local NGINX_SRC=`) - `grep -c 'ln -sf /etc/nginx/sites-available/neopro /etc/nginx/sites-enabled/neopro' raspberry/install.sh` ≥ 1 - `grep -c 'rm -f /etc/nginx/sites-enabled/\*.bak' raspberry/install.sh` ≥ 1 (cleanup .bak) - `grep -c 'neopro.pre-phase6.bak' raspberry/install.sh` ≥ 1 (backup défensif) - `grep -c 'systemctl restart nginx' raspberry/install.sh` ≥ 1 (restart, pas reload) - `wc -l raspberry/install.sh` doit avoir baissé de >100 lignes par rapport à l'avant-fix
(heredoc supprimé = ~130 lignes économisées)
</acceptance_criteria>

  <done>
    `configure_nginx()` ne contient plus d'heredoc nginx inline ; elle copie
    `${INSTALL_DIR}/config/nginx/neopro-base.conf` vers `/etc/nginx/sites-available/neopro`,
    nettoie le `sites-enabled/` (regular file + .bak résiduels), crée le symlink, teste et restart nginx.
    Idempotente : ré-exécutable sans casser un Pi déjà installé.
  </done>
</task>

</tasks>

<verification>
- `bash -n raspberry/install.sh` exit 0
- Heredoc inline supprimé (`grep -c 'cat > /etc/nginx/sites-available/neopro' raspberry/install.sh` = 0)
- Source de vérité câblée (cp neopro-base.conf présent)
- Cleanup défensif présent (.bak + regular file)
</verification>

<success_criteria>
Critère #5 ROADMAP Phase 6 partiellement adressé : install.sh from scratch écrira
désormais `/etc/nginx/sites-available/neopro` à partir de `neopro-base.conf`.
La validation E2E (Pi NLF re-imagé) reste à faire en aval (hors scope de ce plan).
</success_criteria>

<output>
Après complétion, créer `.planning/phases/06-captive-fire-stick-page-neopro/06-captive-05-SUMMARY.md`
suivant le template summary.md (lister les lignes supprimées vs ajoutées, l'edge case .bak documenté).
</output>
