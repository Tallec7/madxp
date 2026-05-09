# Templates de prompt Claude Code

Templates collables en début de session Claude pour forcer un mode opératoire selon le type de tâche.

> **Pourquoi** : l'audit 2026-05-09 a montré que le prompt "fix-le" minimaliste produit des cascades de régressions (cf. `docs/internal/CLAUDE-IMPROVEMENT-PLAN.md`, pattern 1). Ces templates imposent triangulation + plan mode + vérification ground-truth AVANT le code.

## Quand utiliser quoi

| Situation | Template |
|---|---|
| Incident remonté (NLF, dashboard alerte, métrique) | [`incident.md`](./incident.md) |
| Fix bug identifié, scope clair | [`fix.md`](./fix.md) |
| Nouvelle feature ou refactor structurel | [`feat.md`](./feat.md) |

## Comment utiliser

1. Ouvre le template, copie le contenu
2. Colle en début de ta session Claude (ou en réponse au "comment puis-je t'aider ?")
3. Remplis les champs `<...>`
4. Envoie

Claude respectera la structure du template comme un contrat de session.

## Principes communs aux 3 templates

- **Triangulation obligatoire** avant tout edit : DOC (SPEC) + CODE (ce que fait vraiment le code) + ÉTAT (DB, logs, prod si accessible)
- **Mode plan obligatoire** sur les scopes sensibles (saas, config, sync, content, displays)
- **Niveaux de confiance explicites** : ✅ Vérifié / ⚠️ Estimé / ❌ Inconnu
- **Challenge mode** : Claude doit pousser back si le brief contient une hypothèse falsifiable contredite par le code
- **Reproduction locale** quand possible (`npm run dev:seed`) AVANT de coder un fix prod

## Évolution

Ces templates évoluent. Si tu te surprends à devoir compléter un template à la main pour une catégorie de tâche récurrente, ajoute un nouveau template ou enrichis l'existant.
