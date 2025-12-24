# Personnalisation de l'overlay score depuis le Central Dashboard

**Date** : 24 Décembre 2025

## Objectif

Permettre aux utilisateurs de personnaliser l'apparence de l'overlay du score (position, couleurs, tailles) directement depuis le Central Dashboard, sans modifier le code.

---

## Modifications apportées

### 1. Suppression du code FFmpeg (inutilisé)

Les fichiers suivants ont été supprimés car le streaming FFmpeg n'est pas utilisé en production :

**Scripts :**

- `raspberry/scripts/ffmpeg-stream.sh`
- `raspberry/scripts/install-ffmpeg-streaming.sh`
- `raspberry/scripts/vlc-kiosk.sh`

**Services :**

- `raspberry/services/playlist-manager.js`
- `raspberry/services/score-bridge.js`

**Systemd :**

- `raspberry/config/systemd/neopro-ffmpeg-stream.service`
- `raspberry/config/systemd/neopro-playlist-manager.service`
- `raspberry/config/systemd/neopro-score-bridge.service`
- `raspberry/config/systemd/neopro-vlc-kiosk.service`

**Documentation :**

- `raspberry/docs/ffmpeg-streaming.md`

### 2. Nouvelle interface ScoreOverlayConfig

Ajout de l'interface `ScoreOverlayConfig` dans :

- `raspberry/src/app/interfaces/configuration.interface.ts`
- `central-dashboard/src/app/core/models/index.ts`

```typescript
interface ScoreOverlayConfig {
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  offsetX?: number; // Distance horizontale du bord (px)
  offsetY?: number; // Distance verticale du bord (px)
  backgroundColor?: string;
  borderRadius?: number;
  scoreColor?: string;
  scoreSize?: number;
  teamNameColor?: string;
  teamNameSize?: number;
}
```

### 3. Formulaire de configuration dans le Central Dashboard

**Fichier** : `central-dashboard/src/app/features/sites/site-detail.component.ts`

Ajout dans la section "Options Premium" :

- Bouton "Personnaliser l'apparence" (visible si Score en Live activé)
- Formulaire avec :
  - Sélection de position (4 coins)
  - Distances horizontale/verticale
  - Arrondi des coins
  - Couleurs (score et noms d'équipe) avec color picker
  - Tailles de police
- Aperçu en temps réel
- Bouton "Déployer sur le boîtier"

### 4. Application dynamique des styles sur la TV

**Fichiers modifiés** :

- `raspberry/src/app/components/tv/tv.component.ts`
- `raspberry/src/app/components/tv/tv.component.html`
- `raspberry/src/app/components/tv/tv.component.scss`

Les styles sont maintenant appliqués dynamiquement via `[ngStyle]` au lieu d'être codés en dur dans le SCSS. Cela permet des modifications sans rebuild.

---

## Utilisation

1. Aller sur le **Central Dashboard**
2. Ouvrir la page d'un site
3. Dans **Options Premium**, activer "Score en Live"
4. Cliquer sur **"Personnaliser l'apparence"**
5. Modifier les paramètres avec l'aperçu en temps réel
6. Cliquer sur **"Déployer sur le boîtier"**

La configuration est automatiquement envoyée au Raspberry Pi et appliquée immédiatement.

---

## Architecture

```
Central Dashboard          Raspberry Pi
     │                          │
     │  update_config           │
     │  {scoreOverlay: {...}}   │
     ├─────────────────────────▶│
     │                          │
     │                    configuration.json
     │                    updated with scoreOverlay
     │                          │
     │                    TV Component reads
     │                    configuration.scoreOverlay
     │                          │
     │                    [ngStyle] applies
     │                    dynamic styles
```

---

## Valeurs par défaut

Si `scoreOverlay` n'est pas défini, les valeurs suivantes sont utilisées :

| Propriété       | Valeur par défaut     |
| --------------- | --------------------- |
| position        | `top-right`           |
| offsetX         | `20px`                |
| offsetY         | `20px`                |
| backgroundColor | `rgba(0, 0, 0, 0.85)` |
| borderRadius    | `12px`                |
| scoreColor      | `#4caf50` (vert)      |
| scoreSize       | `28px`                |
| teamNameColor   | `#ffffff` (blanc)     |
| teamNameSize    | `16px`                |

---

## Auteur

Claude Code - Session du 24 Décembre 2025
