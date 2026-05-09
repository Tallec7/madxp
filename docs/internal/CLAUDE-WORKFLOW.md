# Conventions de session Claude — workflow étendu

> Sortie du CLAUDE.md racine le 2026-05-09 (audit usage Claude Code).
>
> Ce fichier contient les conventions opérationnelles que Daisy souhaite voir appliquées **mais qui ne sont pas auto-enforced**. Il n'est pas chargé automatiquement par Claude — c'est une référence humaine et un mémo pour les sessions où Daisy veut rappeler explicitement le format attendu.
>
> Pour les règles vraiment universelles (préservées dans CLAUDE.md racine), voir : commandes, règles de code, NE JAMAIS FAIRE, routing SPECs, Challenge mode.

---

## Démarrage de session

1. **Worktree dédiée recommandée** — toute session qui modifie du code crée idéalement sa propre worktree :

   ```bash
   git worktree add ../neopro-<slug> -b <type>/<scope>
   cd ../neopro-<slug>
   ```

2. **Vérifier les sessions parallèles** : `git worktree list` + `git branch -a`. Si la tâche partage des fichiers avec une worktree active → STOP, signaler à Daisy.

3. **Confirmer la worktree** dans la première réponse de session.

> **Note 2026-05-09** : Daisy travaille désormais en mono-session active (cf. `CLAUDE-IMPROVEMENT-PLAN.md` couche 1). La règle worktree reste valable mais perd de son urgence en mono-session.

## Avant tout edit majeur (>1 fichier)

- `grep -rn "<filename>" central-server/src/__tests__` pour identifier les smoke tests pinnés au fichier (couplage caché).
- Lire le fichier cible avant d'éditer (jamais d'édit aveugle, surtout sur les fichiers critiques).
- Si refactor cross-fichier → ADR léger inclus dans la PR (cf. `.claude/rules/adr.md`).

## Commit policy

- **Atomique** : 1 commit = 1 step exécutable indépendamment.
- **Immédiat** : commit dès qu'une étape compile, ne pas attendre la fin du flux.
- **Conventional Commits stricts** : `<type>(<scope>): <impératif>`.
- **Vérification post-commit** : `git log --oneline -1` pour confirmer le hash et la branche.

## Format de réponse

### Avant un edit de code

1. État courant : 1 phrase sur ce que je vais faire.
2. Contraintes vérifiées : grep des smoke tests pinnés au fichier (si applicable).
3. Plan : étapes numérotées, max 5 lignes.

### Pendant l'exécution

- 1 ligne par changement majeur, jamais de narration de pensée.
- Si je découvre un blocker → STOP + question, pas de workaround silencieux.

### À la fin d'une tâche

1. Diff stats : fichiers / +X / -Y.
2. Tests verts : nombre / total.
3. Reste ouvert : bullet list, ou "rien".
4. Next : 1 ligne d'option, ou "ta main".

### Niveaux de confiance explicites (rappelés dans CLAUDE.md racine)

- ✅ "Vérifié" = j'ai lu le fichier ou run la commande.
- ⚠️ "Estimé" = je m'appuie sur mémoire/audit, à valider.
- ❌ "Inconnu" = je ne sais pas, je le dis.

### Length budgets

- Réponse à "ok" / "go" : <5 lignes (sauf erreur ou décision majeure).
- Récap de fin de tâche : <15 lignes structurées.
- Audit / décision : libre mais structuré (tableaux, sections claires).

## Préfixes d'impact dans les messages

Quand je ping Daisy en cours de session, préfixer avec :

- **🎯 IMPACT CLIENT** : visible utilisateur final (TV, dashboard, remote)
- **🛡️ IMPACT INFRA** : production, monitoring, sécurité, perf
- **🧹 IMPACT DEV** : refactor, dette, outillage, tests
- **❓ DÉCISION** : besoin de Daisy pour trancher, j'attends sa réponse

## Communication métier

Daisy a un profil mixte (tech + business). Quand une réponse longue (>50 lignes) utilise du jargon non évident, le traduire en passant :

- "memory leak" → "fuite mémoire (le serveur consomme de plus en plus sans raison, finit par planter)"
- "smoke test" → "test rapide qui détecte si un truc évident est cassé"
- "race condition" → "deux actions qui se marchent dessus selon l'ordre"
- "circuit breaker" → "coupe-circuit qui désactive un service en panne pour éviter la cascade"

Si la réponse est >50 lignes : ajouter en haut un encadré **TL;DR métier** en 3 phrases sans jargon.

## Validation explicite quand "go" / "ok"

Quand Daisy dit "go" ou "ok" sur un changement non-trivial, vérifier mentalement :

- Ai-je expliqué la conséquence métier (pas juste technique) ?
- Sait-il ce qui peut casser et comment on le verrait en prod ?

Si non → reformuler 1 ligne en métier avant d'agir.
Si oui (manifeste : il a posé une question précédente sur le sujet) → go.

## Story Card de fin de tâche

À la fin de toute tâche qui ship du code (commit/PR), produire une **Story Card** au format suivant — pas de SAFe US, juste la traçabilité utile. La Story sert de PR description par défaut.

```markdown
## Story <YYYY-MM-DD>-<slug>

**En tant que** : <rôle> (ex: super_admin, NLF user, sync-agent, CI, Lead Dev)
**Je veux** : <capacité, infinitif>
**Pour** : <bénéfice mesurable, pas technique>

**Livré** :

- <change observable 1>
- <change observable 2>

**Vérifié par** : <test ou métrique qui prouve que ça marche>
**Risque résiduel** : <ce qui pourrait casser>
**Next** : <follow-up si applicable, sinon "—">
```

Pas besoin d'inventer un ID SAFe (`F-XX.Y`, `IMP-XXX-NN`). Le format `YYYY-MM-DD-<slug>` suffit.

## Business Changelog

À chaque session qui ship du code, ajouter une entrée à `docs/BUSINESS-CHANGELOG.md` sous la semaine en cours, avec 3 buckets :

- 🎯 **Pour le club** (NLF, prospects) : visible utilisateur final
- 🛡️ **Pour la robustesse** : production, monitoring, sécurité
- 🧹 **Pour l'équipe** : refactor, dette, outillage

Format : 1 bullet point par PR, ton non-technique, citer le n° de PR.
Si une session ne livre RIEN visible (juste exploration / debug), ne pas créer d'entrée.

## Specs métier par composant

Les composants/features qui ont des **règles métier non évidentes du code seul** ont une SPEC dans `docs/specs/`. Format léger (1 page max), vivant, mis à jour dans la même PR que le changement de comportement.

**Périmètre** :

- ✅ Feature transverse complexe (sponsors, match sessions, templates studio, SaaS, OTA, hotspot PSK)
- ✅ Composant client-visible (TV, Remote, dashboard sites, club portal)
- ✅ Service backend critique (cron-scheduler, socket, storage, deployment, auth)
- ❌ Sous-composant CRUD basique
- ❌ Util / helper (le code suffit)

**Localisation** : `docs/specs/{components,features,services}/<name>.spec.md`

**Cycle de vie** :

- Nouvelle feature majeure → créer la SPEC en même temps que le code
- PR qui change un comportement métier → MAJ SPEC dans la même PR
- PR refactor sans changement de comportement → SPEC inchangée
- Incident production → ajouter ligne "Cas d'edge connus" + lien post-mortem
- 3 mois sans modification → SPEC marquée "stale", revue à planifier

Voir `docs/specs/README.md` pour le gabarit complet et l'index des SPECs actives.

## Garde-fous obligatoires

- **Bug fixé** → un test regression guard (unitaire ou smoke) qui faillirait si le bug revenait. Citer le test dans le commit.
- **Nouvelle Map/Set instance-level** → cleanup explicite (sweep périodique OU disconnect handler) + métrique Prometheus pour observer la taille.
- **Nouveau task CRON** → log Winston `info`/`error` + métrique `neopro_*_total` + smoke test associé.
- **Nouveau handler/service** → au minimum log Winston `info` au start + log `error` au catch.
- **Commit `feat`/`fix` non-trivial** → au moins une doc MAJ (`docs/**`, `*.md` racine, ou `.claude/rules/**`). Le hook Husky `.husky/pre-push` warne si oubli (warn-only).

## Anti-patterns interdits (étendus)

> Note : les anti-patterns techniques universels sont dans `CLAUDE.md` racine (push direct main, `--no-verify`, etc.). Ceux ci-dessous sont opérationnels.

- Modifier `CLAUDE.md` ou `.claude/rules/` sans le signaler explicitement à Daisy
- Faire "tuer X" / "archiver X" sans `grep -rn "X"` au préalable pour mesurer la dette
- Étiqueter une règle "legacy" sans avoir lu le fichier source
- Inventer un statut SAFe / une feature non-livrée
- Sur-promettre des "quick wins" sans vérifier les blockers techniques d'abord
