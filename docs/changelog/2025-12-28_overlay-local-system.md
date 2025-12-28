# Overlay Local System - 28 Décembre 2025

## Résumé

Implémentation d'un système complet d'overlay local pour la télécommande Raspberry, permettant aux opérateurs de table de marque de gérer le score, le timer et les breaking news directement depuis la télécommande sans dépendre d'APIs externes.

## Contexte

### Problématique initiale

L'analyse des solutions d'intégration de scores externes (Bodet Sport, Stramatel, FDME/FFHB) a révélé que :

- **Aucune API publique** n'existe pour les clubs amateurs
- Les protocoles sont **propriétaires et fermés**
- Les partenariats commerciaux sont **inaccessibles** pour une intégration tierce

### Solution retenue : Double Saisie Locale

L'opérateur de table de marque (qui gère déjà la feuille de match officielle) saisit également le score dans la télécommande NEOPRO. Cette approche :

- ✅ Ne dépend d'aucun fournisseur externe
- ✅ Fonctionne immédiatement sans configuration
- ✅ S'intègre dans le workflow existant du scoreur

---

## Nouvelles Fonctionnalités

### 1. Page Options (localStorage)

Nouvelle vue "Options" dans la télécommande avec persistence localStorage :

- **Template** : Choix entre Sportif, Élégant, Minimal
- **Position overlay** : 9 positions (combinaisons top/center/bottom + left/center/right)
- **Couleurs** : Score et noms d'équipe personnalisables
- **Tailles** : Score (16-72px) et noms (10-36px)
- **Arrondi coins** : 0-50px

**Service** : `local-options.service.ts` (nouveau)

### 2. Timer / Chronomètre

Gestion du temps de match intégrée :

- **Start/Pause/Reset** depuis la télécommande
- **Synchronisation TV** toutes les 5 secondes via BroadcastChannel
- **Affichage** : Dans l'overlay score si actif, sinon overlay standalone
- **Format** : MM:SS avec tabular-nums pour stabilité visuelle

### 3. Breaking News

Bandeau d'information défilant :

- **3 modes d'affichage** :
  - `scroll` : Texte défilant (animation CSS 15s)
  - `truncate` : Texte tronqué avec ellipsis
  - `multiline` : Multi-lignes (wrap)
- **Position** : Haut ou bas de l'écran
- **Saisie** : Textarea dans la télécommande

### 4. Goal Popup

Animation visuelle lors d'un but :

- **Affichage** : Centre écran, 3 secondes
- **Animation** : Scale + pulse (CSS keyframes)
- **Contenu** : Score actuel avec équipes

### 5. Templates Overlay

3 styles prédéfinis :

| Template    | Description                              |
| ----------- | ---------------------------------------- |
| **Sportif** | Gradient bleu, couleurs vives, énergique |
| **Élégant** | Gradient gris, épuré, professionnel      |
| **Minimal** | Noir semi-transparent, ultra-simple      |

---

## Architecture Technique

### Communication Remote ↔ TV

```
┌─────────────────┐    BroadcastChannel    ┌─────────────────┐
│                 │ ←─────────────────────→ │                 │
│    Remote       │     'neopro-local'     │       TV        │
│  (tablette)     │                         │   (écran)       │
└─────────────────┘                         └─────────────────┘
        │                                           │
        └───── localStorage ────────────────────────┘
                (options)
```

### Events BroadcastChannel

```typescript
type LocalBroadcastEvent =
  | { type: 'score-update'; score: LiveScore }
  | { type: 'goal-scored'; team: 'home' | 'away' }
  | { type: 'timer-update'; elapsedSeconds: number; isRunning: boolean }
  | { type: 'breaking-news'; news: BreakingNews | null }
  | { type: 'options-update'; options: LocalOptions };
```

### Persistence

- **Options** : `localStorage.getItem('neopro-local-options')`
- **Format** : JSON sérialisé
- **Sync** : Envoi via BroadcastChannel à chaque modification

---

## Fichiers Modifiés/Créés

### Nouveaux fichiers

- `raspberry/src/app/services/local-options.service.ts`

### Fichiers modifiés

- `raspberry/src/app/services/local-broadcast.service.ts` - Nouveaux types events
- `raspberry/src/app/components/remote/remote.component.ts` - Options, Timer, Breaking News
- `raspberry/src/app/components/remote/remote.component.html` - UI Options panel
- `raspberry/src/app/components/remote/remote.component.scss` - Styles timer panel
- `raspberry/src/app/components/tv/tv.component.ts` - Réception events, goal popup
- `raspberry/src/app/components/tv/tv.component.html` - Overlays avec templates
- `raspberry/src/app/components/tv/tv.component.scss` - 3 templates + breaking news
- `angular.json` - CSS budget augmenté à 64kB

---

## Note sur les APIs Externes

### Recherche effectuée

| Fournisseur | Type              | API Publique | Conclusion             |
| ----------- | ----------------- | ------------ | ---------------------- |
| Bodet Sport | Tableau affichage | ❌           | Protocole propriétaire |
| Stramatel   | Tableau affichage | ❌           | Protocole propriétaire |
| FDME/FFHB   | App fédération    | ❌           | Données non exposées   |
| API-Sports  | Aggregateur       | ✅           | Matchs pro uniquement  |

### Conclusion

Pour les clubs amateurs, la **saisie manuelle** (Option B) reste la seule solution viable et immédiatement déployable.

---

## Améliorations Futures Possibles

1. **Raccourcis clavier** pour +1/-1 score
2. **Historique buts** avec timestamps
3. **Périodes** (1ère MT, 2ème MT, Prolongations)
4. **Sons** lors des buts (optionnel)
5. **QR Code** pour partage score en live (spectateurs)

---

## Référence

- **Business Plan** : §14.4 Phase 3 - Live Score
- **Guide utilisateur** : `docs/guides/GUIDE_PERSONNALISATION_OVERLAY_SCORE.md`
