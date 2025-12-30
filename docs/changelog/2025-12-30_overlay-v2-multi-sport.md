# Overlay V2 Multi-Sport - 30 Décembre 2025

## Résumé

Refonte majeure du système d'overlay du score avec support multi-sport, animations de but configurables, gestion des périodes par sport, logos d'équipes et système de presets sauvegardables.

## Contexte

Suite à l'analyse du système overlay existant (68/100), plusieurs améliorations ont été identifiées :

- Conflit !important entre configuration centrale et templates locaux
- Positions limitées (seulement 4 coins)
- Pas de gestion des périodes selon le sport
- Animation de but basique sans son
- Timer superposé au score (UX problématique)
- Pas de sauvegarde des configurations

---

## Nouvelles Fonctionnalités

### 1. Support Multi-Sport (6 sports)

| Sport      | Périodes                                       | Durée période |
| ---------- | ---------------------------------------------- | ------------- |
| Football   | 1ère/2ème mi-temps, Prolongations, Tirs au but | 45 min        |
| Basketball | 4 quart-temps + Prolongation                   | 10 min        |
| Handball   | 1ère/2ème mi-temps, Prolongations              | 30 min        |
| Volleyball | 5 Sets                                         | 25 min        |
| Rugby      | 1ère/2ème mi-temps, Prolongations              | 40 min        |
| Hockey     | 3 périodes + Prolongation + Tirs au but        | 20 min        |

**Comportement** : Changer le sport met automatiquement à jour :

- Les périodes disponibles
- La durée du timer
- Le son de but par défaut

### 2. Positions Overlay (9 positions)

Matrice 3x3 complète :

```
┌─────────────┬─────────────┬─────────────┐
│  top-left   │ top-center  │  top-right  │
├─────────────┼─────────────┼─────────────┤
│ middle-left │middle-center│ middle-right│
├─────────────┼─────────────┼─────────────┤
│ bottom-left │bottom-center│ bottom-right│
└─────────────┴─────────────┴─────────────┘
```

Le positionnement utilise CSS transform pour les centres :

- `top-center` / `bottom-center` : `translateX(-50%)`
- `middle-left` / `middle-right` : `translateY(-50%)`
- `middle-center` : `translate(-50%, -50%)`

### 3. Logos des Équipes

- **Upload** : Depuis la télécommande (Options > Sport & Match)
- **Format** : Base64 (max 500KB par logo)
- **Affichage** : Dans l'overlay score et l'animation de but
- **Gestion** : Effacés automatiquement avec "Nouveau match"

### 4. Animation de But Configurable

3 styles d'animation :

| Style          | Description                               |
| -------------- | ----------------------------------------- |
| **Popup**      | Centre écran avec animation scale         |
| **Fullscreen** | Plein écran spectaculaire avec "BUUUUT !" |
| **Slide**      | Bandeau glissant depuis la gauche         |

**Options** :

- Durée : 2-6 secondes
- Son : Activable/désactivable avec son par sport
- L'équipe qui marque est mise en surbrillance

### 5. Timer Intégré au Score (UX)

**Avant** : Timer standalone superposé au score (confus)

**Après** :

- Option "Intégrer au score" dans les paramètres
- Timer affiché sous le score avec séparateur visuel
- Position cohérente avec l'overlay

### 6. Présets de Configuration

Sauvegarde et réutilisation de configurations complètes :

- Sport + Template + Position + Couleurs
- Stockage localStorage
- Gestion : Créer, Appliquer, Supprimer

**Exemple** : "Match de championnat football" = Football + Sportif + top-right + couleurs club

### 7. Résolution Conflit !important

**Problème** : Les templates utilisaient `!important` qui écrasaient les couleurs du central.

**Solution** :

- Templates ne modifient que la structure/layout
- Couleurs appliquées via `[ngStyle]` (priorité dynamique)
- Hiérarchie : Local override > Central > Défaut

---

## Architecture Technique

### Interfaces Mises à Jour

```typescript
// configuration.interface.ts
export type SportType = 'football' | 'basketball' | 'handball' | 'volleyball' | 'rugby' | 'hockey';

export type OverlayPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'middle-center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';
```

### LocalOptions Enrichi

```typescript
export interface LocalOptions {
  sport: SportType;
  match: {
    homeTeam: TeamConfig;  // name, shortName, logo
    awayTeam: TeamConfig;
    period: string;
    periodIndex: number;
  };
  overlay: { ... };
  goalAnimation: GoalAnimationConfig;  // enabled, style, duration, sound
  timer: { ..., integratedWithScore: boolean };
  breakingNews: { ... };
  template: 'sportif' | 'elegant' | 'minimal';
  presets: OverlayPreset[];
}
```

### Templates Multi-Sport (CSS)

Classes CSS dédiées par sport pour layouts adaptés :

- `.sport-basketball` : Scores plus grands, badge quart-temps
- `.sport-volleyball` : Zone sets
- `.sport-hockey` : Badge période bleu

---

## Fichiers Modifiés

### Raspberry

| Fichier                                   | Modifications                                       |
| ----------------------------------------- | --------------------------------------------------- |
| `services/local-options.service.ts`       | Refonte complète : sports, périodes, logos, presets |
| `services/local-broadcast.service.ts`     | OptionsUpdateEvent enrichi                          |
| `interfaces/configuration.interface.ts`   | Types SportType, OverlayPosition                    |
| `components/tv/tv.component.ts`           | 9 positions, animation but avec son                 |
| `components/tv/tv.component.html`         | Logos, timer intégré, 3 styles animation            |
| `components/tv/tv.component.scss`         | Templates sans !important, multi-sport, animations  |
| `components/remote/remote.component.ts`   | Gestion sports, logos, presets                      |
| `components/remote/remote.component.html` | UI Options complète                                 |
| `components/remote/remote.component.scss` | Styles teams-config, presets                        |

### Central Dashboard

| Fichier                                   | Modifications                            |
| ----------------------------------------- | ---------------------------------------- |
| `core/models/index.ts`                    | Type OverlayPosition (9 positions)       |
| `features/sites/site-detail.component.ts` | Import OverlayPosition, select 9 options |

---

## Guide Utilisateur

### Configurer un Match

1. **Options > Sport & Match** : Sélectionner le sport
2. Entrer les noms d'équipe
3. (Optionnel) Upload des logos
4. La durée du timer et les périodes sont auto-configurées

### Pendant le Match

1. Utiliser +1/-1 pour le score
2. Bouton "→" pour passer à la période suivante
3. Animation de but automatique quand score change

### Sauvegarder une Configuration

1. **Options > Presets** : "Sauvegarder config actuelle"
2. Nommer le preset (ex: "Ligue régionale")
3. Réutiliser via "Appliquer"

---

## Améliorations Futures

- [ ] Sons personnalisés (upload MP3)
- [ ] Raccourcis clavier (espace = +1 home)
- [ ] Mode penalty/tirs au but avec compteur
- [ ] QR code spectateurs pour score live

---

## Score Système Overlay

**Avant** : 68/100
**Après** : 88/100

| Critère       | Avant         | Après          |
| ------------- | ------------- | -------------- |
| Positions     | 4             | 9              |
| Sports        | 1             | 6              |
| Animation but | Basique       | 3 styles + son |
| Logos         | Non           | Oui            |
| Périodes      | Non           | Oui (auto)     |
| Présets       | Non           | Oui            |
| Timer UX      | Problématique | Intégré        |

---

## Référence

- **Guide utilisateur** : `docs/guides/GUIDE_PERSONNALISATION_OVERLAY_SCORE.md`
- **Changelog précédent** : `docs/changelog/2025-12-28_overlay-local-system.md`
