# Plan d'amélioration de l'utilisation de Claude Code

> Audit du 2026-05-09 — solo dev, fondateur MadXP, peur dominante = burnout, ratio fix/feat = 27/1 sur 36h, 8 PRs en cascade SaaS variants, push direct sur main, incident NLF causé par auto-fix.
>
> **Ce plan n'est PAS une roadmap rigide. C'est un menu d'actions priorisées pour réduire la surface mentale et stopper la cascade hotfix.**

---

## TL;DR

Le diagnostic chiffré :

- **Volume** : 35 commits humains en 36h, dont 27 `fix(...)`, 1 seul `feat(...)`. 22 releases. 0 reverts.
- **Cascade** : 8 PRs SaaS displays/variants sur 14h pour une cause racine touchée à la PR #6.
- **Incident NLF** : PR #935 a directement cassé le client critique, fix #939 émis 1h36 plus tard.
- **Push direct main** : commit `7610806` sans PR (force release).
- **Outils sous-exploités** : CLAUDE.md = 271 lignes (>50% wishful thinking non appliqué), `.claude/rules/` = 2070 lignes probablement non auto-chargées, GSD installé mais 0 commits récents le référencent (32 117 lignes de planning pour ~3000 LOC, ratio 10:1).
- **Mémoire fragile** : 18 SPECs existent, 879 lignes NLF.md, mais aucune connexion mécanique à Claude → re-briefing à chaque session.
- **Accès limités** : Claude n'a ni MCP Postgres, ni accès SSH Pi, ni logs Railway, ni Prometheus → code à 50% les yeux bandés sur l'état réel.

Le levier le plus rentable n'est ni technique ni Claude. C'est **la réduction de surface mentale** et **l'enforcement mécanique** des règles que tu te donnes déjà.

---

## Diagnostic : pourquoi tu tournes en rond

### Pattern 1 — "Fix-en-aveugle" sans phase root cause

Tu prompt "fix-le". Claude code direct sans cartographier le data-flow. La rustine passe les smoke. La régression revient sous une autre forme. Repeat 6 fois (cf. cascade SaaS variants).

### Pattern 2 — Fix-test-en-prod au lieu de dev:seed

22 releases en 36h. 2× force release sur la même PR (#926). Tu déploies pour vérifier. Le `npm run dev:seed` existe mais n'a pas été utilisé sur les fix critiques.

### Pattern 3 — Sessions parallèles sans worktrees disciplinées

2-3 Claude en parallèle (cf. réponse profil). Sans worktree dédiée, ils se piétinent (4 PRs variants en 33 min, push direct main).

### Pattern 4 — Pas de "stop and rollback"

0 revert sur 36h. Aucune session n'a dit STOP malgré la cascade évidente.

### Pattern 5 — Couplage architectural caché derrière "displays"

Le mot `displays` traverse 5 couches sans contrat unique : DB sites, DB variants, Pi config.json, API resolvedConfig, UI siteDisplays. Chaque Claude réinterprète. Cascade garantie.

### Pattern 6 — Mémoire institutionnelle non connectée

18 SPECs + NLF.md + INCIDENT-LOG existent mais Claude ne les charge pas spontanément. Tu re-briefes à chaque session.

### Pattern 7 — Sources potentiellement fausses sans contrôle

Doc stale + propos imprécis sous fatigue + état prod divergent = Claude code avec fausse confiance. Pas de mécanisme de triangulation (DOC + CODE + ÉTAT) avant edit.

---

## Plan en 4 couches

### COUCHE 1 — Réduction de surface (anti-burnout, J+0 à J+2)

| Action                                                                                                                   | Origine                                   | Effet                                                   |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------- |
| Désinstaller GSD (archives `.planning/`, `.claude/agents/`, `.claude/get-shit-done/`, `.claude/commands/gsd/`, manifest) | Audit GSD : 0 utilisation depuis 3+ jours | -40% contexte Claude, -38 commands friction             |
| Couper CLAUDE.md à ~90 lignes (sortir conventions session vers `docs/internal/CLAUDE-WORKFLOW.md`)                       | Audit CLAUDE.md : 65% non appliqué        | -bruit aspirational, +attention sur règles qui comptent |
| Cap **1 session Claude active**                                                                                          | Profil burnout                            | -3× context-switching mental                            |
| Cap **3 releases/jour max**                                                                                              | 22 releases en 36h                        | -85% pression deploy                                    |
| Logout dashboard pendant blocs coding                                                                                    | 3 triggers fix permanents                 | Stoppe l'auto-interruption                              |
| Pas de hotfix après 21h sauf P0 NLF                                                                                      | Cascade SaaS 23:26→00:23                  | Casse le pic de fatigue                                 |

### COUCHE 2 — Mémoire fiable et auto-vérifiée (J+2 à J+5)

| Action                                                                                      | Origine                        | Effet                                      |
| ------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------ |
| Routing SPECs dans CLAUDE.md (table domaine → SPEC obligatoire à lire avant edit)           | Mémoire features non connectée | Plus de re-briefing                        |
| `last_verified` + auto-stale dans chaque SPEC critique                                      | Risque doc stale               | Doc qui s'auto-décrédibilise quand vieille |
| Section "Challenge mode" dans CLAUDE.md (Claude DOIT pousser back si hypothèse falsifiable) | Risque propos faux             | Système qui se protège contre input erroné |
| Section "Cas d'edge connus" obligatoire dans SPEC                                           | Mémoire bugs                   | Bug knowledge cumulatif                    |
| INCIDENT-LOG.md vivant + format strict                                                      | Régression répétée             | Traçabilité incidents → tests → SPEC       |
| Convention nommage `smoke-<domaine>-incident-<date>`                                        | Mémoire bugs                   | Tests qui racontent leur histoire          |
| 1 session "consolidation doc" hebdo (vendredi 17h)                                          | Mémoire features               | Doc à jour mécaniquement                   |
| 3 templates de prompt collables (`incident.md`, `fix.md`, `feat.md`)                        | Prompt "fix-le" toxique        | Triangulation et plan mode forcés          |

### COUCHE 3 — Accès et autonomie (J+5 à J+10)

| Action                                                                         | Origine                              | Effet                                     |
| ------------------------------------------------------------------------------ | ------------------------------------ | ----------------------------------------- |
| MCP Postgres read-only sur Railway (user `claude_readonly`, GRANT SELECT ONLY) | Aucun accès DB                       | Triangulation DB possible (-50% cascades) |
| Skill `fewer-permission-prompts` lancé                                         | Allowlist Bash trop courte (14 cmds) | Auto-allowlist depuis transcripts         |
| Allowlist Bash élargie (npm test, jest, psql, find, jq, sed -n)                | Friction validation                  | Zéro friction au quotidien                |
| `.claude/ACCESS.md` documente ce que Claude peut/pas                           | Tâtonnement                          | Plus de trial-and-error                   |
| MCP Railway logs (ou alias bash autorisé)                                      | Pas de logs prod                     | Diagnostic prod possible                  |
| MCP Prometheus / curl whitelisté                                               | Pas de métriques                     | Métriques accessibles                     |
| SSH NLF read-only via script wrapper (`npm run pi:logs:nlf`)                   | Pas de logs Pi NLF                   | Logs vérifiables sans demander            |

### COUCHE 4 — Enforcement mécanique (J+10 à J+14)

| Hook                                                                                            | Bloque                   | Origine               |
| ----------------------------------------------------------------------------------------------- | ------------------------ | --------------------- |
| `pre-push` refuse `main` direct                                                                 | Push #7610806            | Workflow propre       |
| `pre-commit` refuse `fix(saas\|config\|sync\|content)` sans diff dans `docs/specs/` ou `NLF.md` | Cascade SaaS, SPEC stale | Maintien doc à jour   |
| `PreToolUse Edit` warne si fichier modifié 3+ fois en 7 jours                                   | Audit fichiers churn     | Alerte zone fragile   |
| `UserPromptSubmit` spec-autoload (mots-clés → SPEC injectée)                                    | Mémoire features         | Doc auto-chargée      |
| `post-commit` régression check (test régression + log incident)                                 | Mémoire bugs             | Force le pattern      |
| Notif desktop 21h "no hotfix mode P0-only"                                                      | Profil burnout           | Casse le réflexe nuit |
| Hook qui refuse > 3 releases/jour (env var override P0)                                         | Profil burnout           | Cap mécanique         |

---

## Séquençage 14 jours

| Jour        | Couche | Action                                                                                         | Temps estimé |
| ----------- | ------ | ---------------------------------------------------------------------------------------------- | ------------ |
| **J+0**     | 1      | Désinstaller GSD + couper CLAUDE.md à 90 lignes + 3 templates prompt                           | 1h30         |
| **J+1**     | 1      | Logout dashboard test + cap 1 session Claude (vis le test)                                     | —            |
| **J+2**     | 2      | Routing SPECs dans CLAUDE.md + section "Challenge mode" + frontmatter `last_verified` template | 1h           |
| **J+3**     | 2      | Backfill `last_verified` sur les 10 SPECs critiques (saas, sponsors, NLF, match, templates...) | 1h           |
| **J+4**     | 3      | MCP Postgres read-only setup + skill `fewer-permission-prompts`                                | 1h           |
| **J+5**     | —      | **Off complet**. Pas de code. Pas de dashboard.                                                | —            |
| **J+6**     | 3      | `.claude/ACCESS.md` + élargir allowlist Bash                                                   | 30min        |
| **J+7**     | 4      | Hook pre-push refuse main + hook spec-autoload                                                 | 1h           |
| **J+8-9**   | 4      | Hook pre-commit blocker SaaS sans SPEC + hook PreToolUse fichier instable                      | 2h           |
| **J+10**    | 4      | Hook post-commit régression check + notif 21h                                                  | 1h           |
| **J+11-13** | —      | Test en condition réelle. 1 vrai bug avec le système entier.                                   | —            |
| **J+14**    | —      | Retro : ratio fix/feat de la semaine, énergie, blockers                                        | 1h           |

**Temps total investi** : ~10h sur 14 jours. **ROI attendu** : -50% volume hotfix dès J+10, -3h/jour de re-briefing.

---

## Garde-fous critiques

1. **Le système ne fonctionne que si tu acceptes d'être challengé.** Si Claude pousse back et que tu réponds "non, fais ce que je dis" → tu détruis le mécanisme #3 (Challenge mode). Coût d'un challenge ignoré = 1 cascade de plus.

2. **La triangulation prend 5 min mais évite 6 PRs en cascade.** Preuve quantitative dans les commits du 2026-05-08/09.

3. **Sous fatigue, tes propos sont un input fragile.** L'enforcement (cap releases, cap heures, off J+5) est conçu pour réduire la fréquence de brief erroné. Plus efficace que de réparer après.

4. **Le burnout est l'ennemi #1, pas la dette.** Codebase en cascade = 1-2 mois de discipline pour rattraper. Burnout = 6-12 mois off + perte de momentum produit. Toutes les recommandations sont biaisées vers la survie cognitive d'abord.

5. **Couche 1 seule absorbe 40-50% du problème.** Les couches 2-4 sont des amplifications. Don't let perfect be enemy of good.

---

## Ce qu'on ne fait PAS, malgré ce qu'on lit partout

- ❌ "Lance 5 Claudes en parallèle pour 10× ta vélocité" → fatal sur ce profil
- ❌ "Mets un hook auto-fix qui résout les CI failures sans toi" → t'éloigne du code, accélère la dette
- ❌ "Délègue tout à un agent autonome" → tu deviens reviewer de bug en chaîne
- ❌ "Ajoute plus de tests" → 2728 tests ne t'ont pas sauvé hier ; le problème est en amont (root cause), pas en aval (validation)
- ❌ "Fais des sprints planifiés" → tu n'as pas l'énergie pour planifier en plus de coder ; les phases GSD le prouvent

---

## Suivi

- Date du plan : 2026-05-09
- Branche d'origine : `claude/review-work-process-YyrCw`
- Auteur de l'audit : session Claude Code (Opus 4.7)
- Update suivant : à J+14 retro

**Si à J+14 tu n'as fait que la couche 1 (J+0 actions), c'est suffisant.** La couche 1 seule absorbe la moitié du problème. Le reste est bonus.
