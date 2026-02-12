# Préparer une configuration de club pour la démo

Guide pour enrichir les fichiers JSON de `demo-configs/` afin de montrer toutes les fonctionnalités Neopro lors d'une démonstration.

> Les configs sont dans `raspberry/src/assets/demo-configs/`.
> Après un build, elles peuvent aussi être modifiées **directement sur le serveur** dans `demo-configs/` sans rebuild.

---

## 1. Fichier `clubs.json` — Liste des clubs disponibles

Ce fichier alimente l'écran de sélection de club sur `/remote`.

```json
[
  { "id": "narh", "name": "NARH", "city": "Nantes", "sport": "Rugby" },
  { "id": "demo-club", "name": "Demo Club", "city": "Paris", "sport": "Handball" }
]
```

| Champ   | Description                                                  |
| ------- | ------------------------------------------------------------ |
| `id`    | Nom du fichier JSON (sans `.json`). Ex: `narh` → `narh.json` |
| `name`  | Nom affiché sur la card de sélection                         |
| `city`  | Ville affichée                                               |
| `sport` | Sport affiché                                                |

> **Si `clubs.json` est vide (`[]`)**, le sélecteur de clubs ne s'affiche pas et la config `default.json` est chargée directement.

---

## 2. Structure d'une config de club

Voici le squelette complet avec **toutes les fonctionnalités activées** :

```json
{
  "remote": {
    "title": "Télécommande Néopro - MON CLUB"
  },
  "auth": {
    "password": "demo",
    "clubName": "MON CLUB",
    "sessionDuration": 28800000
  },
  "version": "1.0",

  "liveScoreEnabled": true,

  "scoreOverlay": {
    "position": "top-center",
    "backgroundColor": "rgba(0, 0, 0, 0.85)",
    "borderRadius": 12,
    "scoreColor": "#FFFFFF",
    "scoreSize": 42,
    "teamNameColor": "#CCCCCC",
    "teamNameSize": 14
  },

  "watermark": {
    "enabled": true,
    "imagePath": "videos/monclub/watermark.png",
    "fullscreen": false,
    "position": "top-right",
    "offsetX": 20,
    "offsetY": 20,
    "opacity": 80,
    "width": 120,
    "height": 0,
    "borderRadius": 8,
    "animation": "fade",
    "animationDuration": 500
  },

  "sponsors": [
    { "name": "Sponsor 1", "path": "videos/monclub/PARTENAIRES/SPONSOR1.mp4", "type": "video/mp4" },
    { "name": "Sponsor 2", "path": "videos/monclub/PARTENAIRES/SPONSOR2.mp4", "type": "video/mp4" }
  ],

  "timeCategories": [
    {
      "id": "before",
      "name": "Avant-match",
      "icon": "🏁",
      "color": "from-blue-500 to-blue-600",
      "description": "Échauffement & présentation",
      "categoryIds": ["focus-partenaires", "info-club", "entree"]
    },
    {
      "id": "during",
      "name": "Match",
      "icon": "▶️",
      "color": "from-green-500 to-green-600",
      "description": "Live & animations",
      "categoryIds": ["match", "focus-partenaires"],
      "loopVideos": [
        {
          "name": "Boucle match",
          "path": "videos/monclub/PARTENAIRES/BOUCLE_MATCH.mp4",
          "type": "video/mp4"
        }
      ]
    },
    {
      "id": "after",
      "name": "Après-match",
      "icon": "🏆",
      "color": "from-purple-500 to-purple-600",
      "description": "Résultats & remerciements",
      "categoryIds": ["info-club", "focus-partenaires"]
    }
  ],

  "categories": [
    {
      "id": "focus-partenaires",
      "name": "Focus partenaire",
      "videos": [
        {
          "name": "Partenaire A",
          "path": "videos/monclub/FOCUS_PARTENAIRE/A.mp4",
          "type": "video/mp4"
        }
      ]
    },
    {
      "id": "info-club",
      "name": "Infos club",
      "videos": [
        {
          "name": "Réseaux sociaux",
          "path": "videos/monclub/INFOS_CLUB/RS.mp4",
          "type": "video/mp4"
        }
      ]
    },
    {
      "id": "entree",
      "name": "Entrée joueurs",
      "videos": [
        { "name": "Joueur 7", "path": "videos/monclub/ENTREE/JOUEUR_7.mp4", "type": "video/mp4" },
        { "name": "Joueur 10", "path": "videos/monclub/ENTREE/JOUEUR_10.mp4", "type": "video/mp4" }
      ]
    },
    {
      "id": "match",
      "name": "Match",
      "subCategories": [
        {
          "id": "but",
          "name": "But",
          "videos": [
            {
              "name": "Joueur 7",
              "path": "videos/monclub/MATCH/BUT/JOUEUR_7.mp4",
              "type": "video/mp4"
            },
            {
              "name": "Joueur 10",
              "path": "videos/monclub/MATCH/BUT/JOUEUR_10.mp4",
              "type": "video/mp4"
            }
          ]
        },
        {
          "id": "jingle",
          "name": "Jingle",
          "videos": [
            {
              "name": "Mi-temps",
              "path": "videos/monclub/MATCH/JINGLE/MI_TEMPS.mp4",
              "type": "video/mp4"
            },
            {
              "name": "Victoire",
              "path": "videos/monclub/MATCH/JINGLE/VICTOIRE.mp4",
              "type": "video/mp4"
            }
          ]
        }
      ]
    }
  ]
}
```

---

## 3. Référence des champs

### `liveScoreEnabled` (boolean) — **Indispensable pour la démo**

Active **toutes les fonctionnalités premium** sur la remote :

| Fonctionnalité               | Sans `liveScoreEnabled` |  Avec `liveScoreEnabled: true`  |
| ---------------------------- | :---------------------: | :-----------------------------: |
| Score (édition + overlay TV) |           ❌            |               ✅                |
| Choix du sport               |           ❌            |               ✅                |
| Gestion des périodes         |           ❌            |               ✅                |
| Animation de but             |           ❌            | ✅ (popup / fullscreen / slide) |
| Chronomètre / Timer          |           ❌            |   ✅ (countdown ou croissant)   |
| Breaking news                |           ❌            |      ✅ (bandeau défilant)      |
| Menu Options                 |           ❌            |               ✅                |
| Presets (sauvegarde config)  |           ❌            |               ✅                |
| Couleurs personnalisées      |           ❌            |               ✅                |

### `scoreOverlay` (objet) — Apparence du score sur la TV

| Champ             | Type   | Défaut                  | Description                        |
| ----------------- | ------ | ----------------------- | ---------------------------------- |
| `position`        | string | `"top-center"`          | Position parmi 9 (voir ci-dessous) |
| `offsetX`         | number | `0`                     | Décalage horizontal (px)           |
| `offsetY`         | number | `0`                     | Décalage vertical (px)             |
| `backgroundColor` | string | `"rgba(0, 0, 0, 0.85)"` | Fond de l'overlay                  |
| `borderRadius`    | number | `12`                    | Arrondi des coins (px)             |
| `scoreColor`      | string | `"#FFFFFF"`             | Couleur des scores                 |
| `scoreSize`       | number | `42`                    | Taille des scores (px)             |
| `teamNameColor`   | string | `"#CCCCCC"`             | Couleur des noms d'équipe          |
| `teamNameSize`    | number | `14`                    | Taille des noms d'équipe (px)      |

**Positions disponibles** : `top-left`, `top-center`, `top-right`, `middle-left`, `middle-center`, `middle-right`, `bottom-left`, `bottom-center`, `bottom-right`

### `watermark` (objet) — Logo en surimpression sur la TV

| Champ                 | Type    | Description                                                                      |
| --------------------- | ------- | -------------------------------------------------------------------------------- |
| `enabled`             | boolean | Activer le watermark                                                             |
| `imagePath`           | string  | Chemin vers l'image (PNG recommandé, fond transparent)                           |
| `fullscreen`          | boolean | Mode plein écran (ignore position/offset/size)                                   |
| `position`            | string  | Position (9 positions)                                                           |
| `offsetX` / `offsetY` | number  | Distance des bords (px)                                                          |
| `opacity`             | number  | Opacité (0-100)                                                                  |
| `width` / `height`    | number  | Dimensions (px). `height: 0` = auto proportionnel                                |
| `borderRadius`        | number  | Arrondi des coins (px)                                                           |
| `animation`           | string  | `none`, `fade`, `slide-left`, `slide-right`, `slide-top`, `slide-bottom`, `zoom` |
| `animationDuration`   | number  | Durée animation (ms)                                                             |

**Scheduling optionnel** (pour limiter l'affichage à certains horaires) :

```json
"schedule": {
  "enabled": true,
  "rules": [{
    "id": "match-day",
    "startTime": "14:00",
    "endTime": "22:00",
    "daysOfWeek": [0, 6],
    "matchPhases": ["during", "before"]
  }]
}
```

### `sponsors` (array) — Boucle de vidéos globale

La boucle qui tourne par défaut sur `/tv`. Minimum 1 vidéo.

```json
{ "name": "Nom affiché", "path": "videos/monclub/PARTENAIRES/FICHIER.mp4", "type": "video/mp4" }
```

### `timeCategories` (array) — Phases de match

Organise les catégories de vidéos par phase. Les 3 phases standard :

| Phase    | Usage                                    |
| -------- | ---------------------------------------- |
| `before` | Avant-match : focus partenaires, entrées |
| `during` | Match : buts, jingles, cartons           |
| `after`  | Après-match : résultats, infos club      |

**`categoryIds`** : liste des `id` de catégories à afficher dans cette phase. Doit correspondre exactement aux `id` dans `categories`.

**`loopVideos`** (optionnel) : boucle vidéo spécifique à cette phase. Si absent, la boucle globale `sponsors[]` est utilisée.

### `categories` (array) — Catégories de vidéos

Chaque catégorie a un `id`, un `name`, et soit `videos` soit `subCategories` :

```json
{
  "id": "match",
  "name": "Match",
  "subCategories": [
    {
      "id": "but",
      "name": "But",
      "videos": [...]
    }
  ]
}
```

---

## 4. Checklist avant démo

### Config minimale pour montrer toutes les features

- [ ] `liveScoreEnabled: true` dans le JSON du club
- [ ] Au moins 2 vidéos dans `sponsors` (pour montrer la boucle)
- [ ] Au moins 2 catégories avec des vidéos
- [ ] Au moins 1 catégorie avec `subCategories` (pour montrer la navigation)
- [ ] `timeCategories` avec des `categoryIds` différents par phase
- [ ] `clubs.json` avec au moins 1 entrée (pour montrer le sélecteur)

### Config complète pour une démo impressionnante

- [ ] Tout ci-dessus +
- [ ] `scoreOverlay` configuré
- [ ] `watermark` avec une image PNG (logo du club)
- [ ] `loopVideos` différents sur au moins 1 phase (ex: `during`)
- [ ] Plusieurs clubs dans `clubs.json` (sports différents)

### Fichiers vidéo

- [ ] Les fichiers `.mp4` référencés dans le JSON existent sur le serveur
- [ ] Format H.264 recommandé pour compatibilité navigateur
- [ ] Vidéos courtes (10-30s) pour la démo
- [ ] Image PNG pour le watermark (fond transparent recommandé)

---

## 5. Scénario de démo type

1. **Ouvrir `/remote`** → sélecteur de clubs → choisir un club
2. **Montrer la navigation** → catégories, sous-catégories, recherche, historique
3. **Lancer une vidéo** → elle s'affiche sur `/tv`
4. **Activer le score** → bouton score → incrémenter, changer les noms
5. **Changer de sport** → Options → Sport → sélectionner (ex: Basketball → 4 quart-temps)
6. **Lancer le chronomètre** → Options → Timer → démarrer
7. **Animation de but** → incrémenter le score → animation sur la TV
8. **Breaking news** → envoyer un message → bandeau défilant sur la TV
9. **Changer de phase** → passer en "Match" → la boucle change (si `loopVideos` configuré)
10. **Changer l'overlay** → Options → position, couleurs, presets

---

## 6. Config existantes

| Fichier            | Club        | Sport    | Vidéos | `liveScoreEnabled` | Prêt pour démo ?  |
| ------------------ | ----------- | -------- | :----: | :----------------: | :---------------: |
| `default.json`     | DEMO        | —        |   1    |         ❌         |    ❌ Minimal     |
| `demo-club.json`   | DEMO CLUB   | Football |   2    |         ❌         | ❌ Pas de premium |
| `narh.json`        | NARH        | Rugby    |   32   |         ❌         | ⚠️ Pas de premium |
| `nlfhandball.json` | NLFHANDBALL | Handball |   3    |         ❌         | ❌ Peu de vidéos  |

**Aucune config n'a `liveScoreEnabled: true`** → les features premium (score, timer, animations, breaking news, options) ne sont pas démontrables.

### Action recommandée

Ajouter `"liveScoreEnabled": true` + `"scoreOverlay": {...}` dans les configs existantes, notamment `narh.json` qui a déjà un contenu riche (32 vidéos, sous-catégories, phases).
