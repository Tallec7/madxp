# ADR-009: Suppression des Pages Analytics Dashboard

**Date** : Février 2026
**Statut** : Accepté
**Décideurs** : Équipe produit Neopro

---

## Contexte

Le dashboard central proposait 6 pages d'analytics :
- Vue d'ensemble (`/analytics`)
- Comparaison multi-sites (`/analytics/comparison`)
- Dashboard temps réel (`/analytics/realtime`)
- Analytics par club (`/sites/:id/analytics`)
- Catégories analytics (`/admin/analytics-categories`)
- Analytics annonceur (`/advertisers/:id/analytics`)

Ces pages affichaient des métriques qui se sont révélées **incohérentes et trompeuses**.

## Problème

| Métrique affichée | Ce qu'elle mesurait réellement | Problème |
|-------------------|-------------------------------|----------|
| "Temps de diffusion" | Somme (durée vidéo × nombre lectures) | ≠ temps écran réel. Un club affichait 1200h/jour |
| "Taux de complétion" | Toujours 100% | Bug : `video_duration == duration_played` systématiquement |
| "Disponibilité" | Connexion cloud du Pi | ≠ usage TV. Le Pi peut être connecté, TV éteinte |
| "Vidéos jouées" | Toutes les lectures y compris TV éteinte | Données gonflées artificiellement |
| Spikes de données | Vidage de buffers accumulés (Pi offline) | Créait des pics irréalistes dans les graphiques |

**Conclusion** : Mieux vaut pas de donnée que des données fausses présentées comme fiables.

## Décision

**Supprimer toutes les pages analytics du dashboard** tout en conservant les services backend pour le billing et les futurs besoins.

### Supprimé (frontend)

- Tout le dossier `features/analytics/`
- `features/admin/analytics-categories/`
- Routes, liens navigation, boutons associés

### Conservé (backend)

| Service | Raison |
|---------|--------|
| `realtime-stats.service.ts` | Utilisé pour le billing |
| `excel-export.service.ts` | Export programmatique |
| `billing.service.ts` | Facturation mensuelle |
| Endpoints API `/api/analytics/*` | Usage programmatique possible |
| Tables `video_plays`, `club_daily_stats` | Données brutes préservées |

## Alternatives Considérées

### 1. Corriger les métriques existantes

**Avantages** :
- Conserver la feature
- Les utilisateurs s'attendaient à avoir des analytics

**Inconvénients** :
- Certaines métriques sont fondamentalement non mesurables sans changement hardware (temps écran réel)
- Risque de corriger partiellement et garder des données douteuses
- Effort significatif pour un résultat incertain

**Verdict** : Rejeté - Le problème est structurel, pas un bug à corriger.

### 2. Supprimer les analytics et attendre des données fiables ✅

**Avantages** :
- Honnêteté : pas de données trompeuses
- Permet de reconstruire sur des bases saines (HDMI-CEC, voir ADR-010)
- Réduit la complexité du dashboard

**Inconvénients** :
- Les utilisateurs perdent une feature (même si elle était trompeuse)
- Période sans analytics visuelles

**Verdict** : Accepté - La confiance dans les données est plus importante que la quantité de features.

### 3. Afficher avec des disclaimers

**Avantages** :
- Feature conservée
- Transparence sur les limites

**Inconvénients** :
- Un disclaimer ne suffit pas : les utilisateurs lisent les chiffres, pas les avertissements
- Les sponsors utilisent ces chiffres pour négocier

**Verdict** : Rejeté - Les chiffres faux avec un astérisque restent des chiffres faux.

## Conséquences

### Positives

1. **Honnêteté** : Pas de données trompeuses présentées aux clients et sponsors
2. **Simplicité** : Dashboard plus léger et focalisé
3. **Base propre** : La détection HDMI-CEC (ADR-010) permet de reconstruire des analytics fiables

### Négatives

1. **Feature manquante** : Les opérateurs n'ont plus de vue analytics dans le dashboard
2. **Argumentation sponsors** : Période transitoire sans données de diffusion visuelles
3. **Perception** : Peut être vu comme une régression

### Labels "activité" modifiés

Pour compenser la suppression des analytics dans la liste des sites :
- "Inactif" → "En veille" (couleur gris neutre au lieu de rouge)
- "Faible" → "Peu actif"
- Tooltip : "Aucune lecture sur les 30 derniers jours (pas de match ?)"

## Références

- ADR-010 : Détection HDMI-CEC (solution au problème de fiabilité)
- [CLAUDE.md](../../CLAUDE.md) - Section v3.0 Breaking Changes

---

*Créé le 11 février 2026*
