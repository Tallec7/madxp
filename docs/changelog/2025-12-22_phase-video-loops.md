# Boucles Vidéo par Phase de Match

**Date** : 22 Décembre 2025
**Type** : Feature
**Version** : 1.1.0

---

## Résumé

Ajout de la possibilité de configurer une boucle vidéo différente pour chaque phase de match (avant-match, match, après-match) au lieu d'une boucle unique globale.

## Besoin Métier

En tant que club, je souhaite pouvoir diffuser des contenus différents selon le temps de match :

- **Avant-match** : Sponsors + vidéos d'ambiance, présentation des équipes
- **Pendant le match** : Sponsors compacts + animations live
- **Après-match** : Sponsors + résultats, remerciements

## Fonctionnement

### Comportement par défaut

- Au démarrage : la boucle "neutre" (`sponsors[]`) est utilisée
- L'opérateur peut changer de phase via la télécommande
- Si une phase n'a pas de `loopVideos` configuré, la boucle par défaut est utilisée

### Télécommande

Un **dropdown** dans le header de la télécommande permet de changer de phase à tout moment, depuis n'importe quelle vue (accueil, catégories, vidéos, recherche).

Le dropdown affiche 4 options :

- **Boucle par défaut** - La boucle sponsors globale
- **Avant-match** - Boucle spécifique pré-match
- **Match** - Boucle pendant le match
- **Après-match** - Boucle post-match

Chaque option indique le nombre de vidéos configurées. Une flèche (⟵) indique que la phase utilise la boucle par défaut (pas de loopVideos personnalisé).

### Config Editor (Dashboard Central)

Une nouvelle section "Boucles Vidéo par Phase" permet de :

- Ajouter/supprimer des vidéos dans la boucle de chaque phase
- Réordonner les vidéos par drag-drop
- Copier la boucle par défaut vers une phase
- Effacer une boucle personnalisée (revenir à la boucle par défaut)

### Analytics

Le changement de phase met automatiquement à jour le `period` des impressions sponsors :

- `neutral` → `loop`
- `before` → `pre_match`
- `during` → `halftime`
- `after` → `post_match`

Cela permet des rapports analytics séparés par phase.

## Configuration

### Structure `timeCategories[].loopVideos`

```json
{
  "timeCategories": [
    {
      "id": "before",
      "name": "Avant-match",
      "categoryIds": ["cat-ambiance"],
      "loopVideos": [
        {
          "name": "Welcome Sponsor A",
          "path": "videos/BOUCLE_AVANT/sponsor_a.mp4",
          "type": "video/mp4"
        },
        {
          "name": "Ambiance Match",
          "path": "videos/BOUCLE_AVANT/ambiance.mp4",
          "type": "video/mp4"
        }
      ]
    }
  ]
}
```

### Rétrocompatibilité

Les configurations existantes fonctionnent sans modification :

- Si `loopVideos` est absent ou vide, `sponsors[]` est utilisé
- Le comportement par défaut reste identique

## Fichiers Modifiés

### Modèle de données

- `raspberry/src/app/interfaces/configuration.interface.ts` - Ajout `loopVideos?: Sponsor[]`
- `central-dashboard/src/app/core/models/site-config.model.ts` - Idem

### Raspberry - TV Player

- `raspberry/src/app/components/tv/tv.component.ts` :
  - Variable `activePhase`
  - Écoute socket `phase-change`
  - Méthodes `switchToPhase()`, `getLoopVideosForPhase()`
  - Mise à jour automatique du period analytics

### Raspberry - Télécommande

- `raspberry/src/app/components/remote/remote.component.ts` - Gestion phases, dropdown toggle/select
- `raspberry/src/app/components/remote/remote.component.html` - Dropdown dans le header (toujours visible)
- `raspberry/src/app/components/remote/remote.component.scss` - Styles dropdown

### Raspberry - Socket Service

- `raspberry/src/app/services/socket.service.ts` - Type `PhaseChange`

### Dashboard Central

- `central-dashboard/src/app/features/sites/config-editor/config-editor.component.ts` :
  - Section "Boucles Vidéo par Phase"
  - CRUD + drag-drop pour `loopVideos`
  - Méthodes `addLoopVideo()`, `removeLoopVideo()`, `copySponsorsToLoop()`, etc.

### Documentation

- `docs/guides/CONFIGURATION.md` - Structure timeCategories.loopVideos
- `docs/analytics/TRACKING_IMPRESSIONS.md` - Boucles par phase et analytics
- `docs/changelog/2025-12-22_phase-video-loops.md` - Ce fichier

## Tests

### Scénarios validés

1. Changement de phase via télécommande → playlist rechargée
2. Phase sans loopVideos → fallback vers sponsors[]
3. Reload configuration → retour phase neutre
4. Analytics period correctement mis à jour

### Build

```bash
npx ng build raspberry  # ✅ Success
npx ng build central-dashboard  # ✅ Success
```

---

**Auteur** : Claude Code
**Reviewers** : -
