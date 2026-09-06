# Paliers d'offre B2B Alive — chiffrage

> ⚠️ **Contenu commercial de travail** (paliers de prix, taux de commission, chiffrage de développement). Le repo `madxp` est **public** — ce contenu est donc visible publiquement. Décision assumée par le propriétaire du repo.

Réflexion sur la construction de la grille commerciale B2B Alive : à partir d'un brainstorm sans contrainte de faisabilité, quelles fonctionnalités viennent enrichir chaque palier existant (Essentiel → Production Pro → +Régie B2B), ce que coûtent les deux modules qui ne rentrent dans aucun palier, comment pousser un client vers l'étape suivante, et un ordre de grandeur pour ce qui reste hors-catalogue. Sans lien avec le code MadXP : la grille de prix existante sert de base, le code n'est pas modifié.

## Les 4 documents

Chaque fichier `.html` est la source d'un artefact publié sur claude.ai (même contenu, rendu interactif) :

| Fichier | Contenu | Version publiée |
|---|---|---|
| `b2b-paliers-evolution.html` | La grille actuelle (prix inchangés) + les prochaines briques par palier, tirées du brainstorm | [claude.ai/code/artifact/d26eabe4](https://claude.ai/code/artifact/d26eabe4-eaad-45ba-a7a3-f94a316ac722) |
| `b2b-modules-chiffres-upsell.html` | Prix des deux modules transverses (Marketplace Annonceur, Fan Engagement) + tableau d'upsell par palier | [claude.ai/code/artifact/e2e29dc3](https://claude.ai/code/artifact/e2e29dc3-f292-4bf0-a6be-59d233caafb9) |
| `b2b-hors-catalogue-chiffre.html` | Chaque item hors-catalogue chiffré en jours-homme × TJM, avec son niveau d'incertitude | [claude.ai/code/artifact/433bf749](https://claude.ai/code/artifact/433bf749-1978-4268-8ece-0a2d2a98ae72) |
| `b2b-deck-offre-complet.html` | Les trois documents ci-dessus réunis en un seul dossier navigable | [claude.ai/code/artifact/5a800ccd](https://claude.ai/code/artifact/5a800ccd-d5ae-4f39-9181-488419aca9e2) |

## Statut

Grille de prix existante (Essentiel 49 €/mois → Élite 950 €/mois, +Régie B2B 20 %) inchangée : ce dossier ajoute des couches « et ensuite », pas une nouvelle grille.

Deux niveaux de confiance à distinguer avant tout usage commercial :

- **Taux de transaction** (Marketplace Annonceur, Fan Engagement) — vérifiés le 2026-09-06 contre les tarifs publics Stripe France et Weezevent.
- **Prix des modules et jours-homme du sur-devis** — estimations de travail, non négociées avec un prestataire de paiement ni cadrées avec l'équipe technique. Base de discussion, pas un tarif publiable en l'état.

Les quatre documents sont indépendants (pas de lien vivant entre eux) : une correction faite dans l'un doit être reportée manuellement dans les autres si elle s'y applique.
