---
paths:
  - "docs/adr/**"
  - "docs/templates/TEMPLATE_ADR*"
  - "central-server/src/**"
  - "central-dashboard/src/**"
  - "raspberry/**"
---

# Règles ADR

## Lors d'un plan d'implémentation

Quand tu proposes un plan d'implémentation (mode Plan ou réponse structurée avec des étapes), tu DOIS :

1. Évaluer si le plan contient une décision architecturale (choix entre alternatives, changement cross-composant, trade-off technique)
2. Si oui, inclure une étape "Créer ADR-XXX" dans le plan avec :
   - Le numéro séquentiel suivant (vérifier `docs/adr/README.md` pour le dernier numéro)
   - Le format approprié (léger si impact limité, complet si structurant)
   - La mise à jour du README ADR

## Lors de modifications cross-composant

Si une session modifie des fichiers dans 2+ composants (central-server, central-dashboard, raspberry), signaler à l'utilisateur qu'un ADR léger est recommandé.

## Format des fichiers ADR

- Nom : `ADR-XXX-nom-descriptif.md` (XXX = numéro séquentiel à 3 chiffres)
- Template complet : `docs/templates/TEMPLATE_ADR.md`
- Template léger : `docs/templates/TEMPLATE_ADR_LIGHT.md`
- Toujours mettre à jour `docs/adr/README.md` après création

## Grille de décision rapide

| Situation | Action |
|---|---|
| Choix irréversible ou cross-composant | ADR complet |
| Choix avec trade-offs, impact limité | ADR léger |
| Refactor interne, fix de bug | Commit message suffit |

Référence complète : `docs/adr/BEST_PRACTICES.md`
