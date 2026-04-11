# ADR-047: Migration des règles CLAUDE.md vers .claude/rules/

**Date** : 2026-04-11
**Statut** : Accepté
**Format** : Léger

---

## Contexte

Le CLAUDE.md contenait ~260 règles "NE JAMAIS FAIRE" chargées dans chaque conversation AI, quel que soit le domaine édité. Cela consommait ~24K tokens de contexte en permanence, réduisant la capacité de raisonnement de l'AI sur les tâches réelles. Les `.claude/rules/` avec glob patterns existaient déjà mais ne contenaient que la documentation — pas les interdictions.

## Décision

Migrer les ~260 règles de la section "NE JAMAIS FAIRE" de CLAUDE.md vers les fichiers `.claude/rules/` existants et 3 nouveaux fichiers (`saas.md`, `dashboard.md`, `sponsors.md`), en utilisant les `paths:` glob patterns pour un chargement conditionnel. Le CLAUDE.md ne conserve que 10 règles universelles (pas de `console.log`, pas de secrets, SQL paramétré, etc.) et les pointeurs architecture. Les smoke tests existants continuent d'enforcer toutes les règles indépendamment du CLAUDE.md.

## Alternatives rejetées

- **Garder tout dans CLAUDE.md** : rejeté car 24K tokens permanents dégradent la qualité AI
- **Supprimer les règles (confiance aux smoke tests seuls)** : rejet�� car l'AI doit connaître les règles AVANT d'écrire du code, pas après (les smoke tests sont un filet, pas un guide)

## Conséquences

- CLAUDE.md passe de 330 à 83 lignes (75% de réduction)
- Les règles domaine-spécifiques ne sont chargées que quand l'AI touche les fichiers concernés
- Toute nouvelle règle doit être ajoutée dans le `.claude/rules/` approprié, pas dans CLAUDE.md

## Fichiers impactés

- `CLAUDE.md` — réduit à 83 lignes (commandes + 10 règles universelles + architecture)
- `.claude/rules/saas.md` — créé (38 règles SaaS)
- `.claude/rules/dashboard.md` — créé (40 règles dashboard Angular)
- `.claude/rules/sponsors.md` — créé (16 règles sponsors/analytics)
- `.claude/rules/network.md` — enrichi (+20 règles)
- `.claude/rules/ota.md` — enrichi (+13 règles)
- `.claude/rules/raspberry.md` — enrichi (+34 règles)
- `.claude/rules/raspberry-tv.md` — enrichi (+28 règles)
- `.claude/rules/services.md` — enrichi (+10 règles)
- `.claude/rules/security.md` — enrichi (+7 règles)
- `.claude/rules/api-routes.md` — enrichi (+6 règles)
- `.claude/rules/database.md` — enrichi (+4 règles)
- `.claude/rules/code-patterns.md` — enrichi (+1 règle)
