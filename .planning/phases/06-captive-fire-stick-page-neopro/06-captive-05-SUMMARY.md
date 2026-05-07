---
phase: 06-captive-fire-stick-page-neopro
plan: 05
subsystem: infra
tags: [nginx, install.sh, captive-portal, raspberry, idempotence]

requires:
  - phase: 06-captive-fire-stick-page-neopro
    provides: neopro-base.conf source de vérité (locations /api/captive/whoami + /captive/wait + /kindle-wifi/wifistub.html)
provides:
  - configure_nginx() refactorée — cp neopro-base.conf au lieu de heredoc inline
  - Idempotence install.sh face à un Pi déjà installé (regular file, symlink stale, .bak résiduel)
  - Closure gap[0] de 06-VERIFICATION.md (Pi from scratch sert /api/captive/* sans intervention manuelle)
affects: [phase 07 cloud-side]

tech-stack:
  added: []
  patterns:
    - 'Source unique de vérité nginx (neopro-base.conf) câblée à install.sh via cp littéral'
    - 'Cleanup défensif sites-enabled/ : .bak supprimés (duplicate default_server) + regular file → symlink upgrade'
    - 'sudo nginx -t + sudo systemctl restart (pas reload — stat caching symlink empirique Pi NLF)'

key-files:
  created: []
  modified:
    - 'raspberry/install.sh — configure_nginx() (lignes 662-813 → 662-707, -107 lignes net)'

key-decisions:
  - "cp littéral inline (pas variable NGINX_SRC) pour que grep/smoke matche la ligne d'action — leçon checker iteration 1"
  - 'Backup défensif → sites-available/neopro.pre-phase6.bak (jamais sites-enabled/, nginx charge tout = duplicate default_server)'
  - 'systemctl restart (pas reload) — empirique Pi NLF : reload échoue à cause du stat caching du symlink'
  - 'Existence guard séparé de la ligne cp pour ne pas masquer le pattern grep'

patterns-established:
  - 'install.sh idempotente : si fichier régulier dans sites-enabled/, le supprimer avant ln -sf (sinon ln crée sites-enabled/neopro/neopro)'
  - 'rm -f /etc/nginx/sites-enabled/*.bak systématique avant restart — tout fichier dans sites-enabled est chargé par nginx'

requirements-completed: [success_criterion_5]

duration: 8min
completed: 2026-05-07
---

# Phase 6 Plan 05: install.sh wire neopro-base.conf Summary

**Refactor configure_nginx() to cp `raspberry/config/nginx/neopro-base.conf` instead of inline heredoc — closes Phase 6 gap[0] (Pi from scratch ne servait pas /api/captive/whoami).**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-07T09:11:00Z
- **Completed:** 2026-05-07T09:18:55Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Heredoc nginx inline (~130 lignes) supprimé de install.sh
- `cp ${INSTALL_DIR}/config/nginx/neopro-base.conf /etc/nginx/sites-available/neopro` câblé comme single source of truth
- Idempotence : detection regular file vs symlink dans sites-enabled/, cleanup .bak résiduels (incident NLF "duplicate default_server")
- Backup défensif `neopro.pre-phase6.bak` placé dans `sites-available/` (jamais sites-enabled/)
- `systemctl restart` (pas reload) car stat caching du symlink — empirique Pi NLF

## Task Commits

1. **Task 1: Refactor configure_nginx() to use neopro-base.conf** — `d4928210` (fix)

## Files Created/Modified

- `raspberry/install.sh` — `configure_nginx()` refactorée (heredoc supprimé, cp + ln -sf + cleanup, -107 lignes net)

## Decisions Made

- **Pas de variable intermédiaire NGINX_SRC sur la ligne cp** : checker iteration 1 du planner avait surfacé que le pattern `cp .*config/nginx/neopro-base.conf` doit matcher la ligne d'action littérale, pas une assignation. Existence guard placé dans une condition séparée.
- **Backup dans sites-available/, pas sites-enabled/** : nginx charge récursivement sites-enabled/, un `.bak` avec `default_server` cause "duplicate default server" au reload. Empirique Pi NLF.
- **restart vs reload** : reload échoue par intermittence à cause du stat caching du symlink quand l'inode change. restart relit l'arbre depuis zéro.

## Deviations from Plan

None - plan executed exactly as written. Tous les acceptance criteria du plan validés au premier essai :

- `bash -n raspberry/install.sh` exit 0
- `grep -c 'cat > /etc/nginx/sites-available/neopro'` = 0 (heredoc supprimé)
- `grep -c 'cp .*config/nginx/neopro-base.conf'` = 1
- `grep -c 'ln -sf /etc/nginx/sites-available/neopro /etc/nginx/sites-enabled/neopro'` = 1
- `grep -c 'rm -f /etc/nginx/sites-enabled/*.bak'` = 1
- `grep -c 'neopro.pre-phase6.bak'` = 2 (une dans le `if -f` guard, une dans le print_step)
- `grep -c 'systemctl restart nginx'` = 1
- `wc -l` install.sh : 1368 → 1261 (107 lignes économisées, conforme à l'attente >100)

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Critère #5 ROADMAP Phase 6 partiellement fermé** : install.sh from scratch écrit désormais correctement `/etc/nginx/sites-available/neopro` à partir de `neopro-base.conf` ; reste la validation E2E sur Pi NLF re-imagé (hors scope de ce plan, à exécuter en aval).
- Pas de blocker pour Phase 07 (cloud-side captive integration).

## Self-Check: PASSED

- FOUND: raspberry/install.sh (modifié, syntaxe valide)
- FOUND: commit d4928210
- FOUND: tous les patterns grep des acceptance criteria

---

_Phase: 06-captive-fire-stick-page-neopro_
_Completed: 2026-05-07_
