# SPEC US-22.2.2 — Indicateur écran secondaire dans la Remote

> **Epic** : E-22 — Contenus Différenciés TV + Écran Secondaire
> **Feature** : F-22.2 — Réactions différenciées TV vs Secondaire
> **US** : US-22.2.2 (3 SP)
> **Date** : 24 Février 2026
> **Statut** : GO — Design détaillé

---

## Objectif

Le staff du club qui utilise la télécommande (Remote) n'a **aucun feedback** sur l'état de l'écran secondaire. Il ne sait pas si le panneau LED est connecté, s'il affiche du contenu, ou s'il est éteint.

---

## Design UX

### Position dans le header

```
┌─────────────────────────────────────────────────────────┐
│  ← Télécommande    [REC] [📺 2nd] [Phase ▾] [Score] [⋮] │
└─────────────────────────────────────────────────────────┘
                       ↑       ↑
                    Existant  NOUVEAU
```

Le nouvel indicateur se place **entre REC et Phase**, car il représente un statut hardware (comme REC).

### États visuels

| État           | Icône | Couleur            | Label | Tooltip                                                                                                    |
| -------------- | ----- | ------------------ | ----- | ---------------------------------------------------------------------------------------------------------- |
| **Connecté**   | `📺`  | Vert (`$success`)  | `2nd` | "Écran secondaire : connecté (1920×384)"                                                                   |
| **Déconnecté** | `📺`  | Gris (`$gray-400`) | `2nd` | "Écran secondaire : déconnecté"                                                                            |
| **Non activé** | —     | —                  | —     | ~~Indicateur masqué si `secondaryDisplayEnabled = false`~~ → Toujours visible si variante existe (v3.98.7) |

### Mockup ASCII

**État connecté** :

```
┌──────────┐
│ 📺  2nd  │  ← Pill verte, icône + label
└──────────┘
```

**État déconnecté** :

```
┌──────────┐
│ 📺  2nd  │  ← Pill grise, opacité 50%
└──────────┘
```

---

## Architecture technique

### 1. Événement Socket.IO

**Nouveau event** : `secondary-display-status`

```typescript
// Émis par le Pi vers le central-server
interface SecondaryDisplayStatus {
  connected: boolean; // HDMI 1 branché et kiosk actif
  resolution?: string; // "1920x384" (depuis config ou EDID)
  chromiumAlive?: boolean; // 2e Chromium tourne
}
```

**Source** : Le watchdog écrit déjà `kiosk-status.json` avec `hdmi1Status` et `secondaryChromiumAlive`. Le sync-agent lit ce fichier et émet l'event.

**Fréquence** : Toutes les 30s (aligné sur le cycle watchdog), ou sur changement d'état (connect/disconnect).

### 2. Central Server — Relay

```typescript
// socket.service.ts — stocker l'état
private secondaryDisplayStates = new Map<string, SecondaryDisplayStatus>();

// Quand le Pi émet secondary-display-status
socket.on('secondary-display-status', (data: SecondaryDisplayStatus) => {
  this.secondaryDisplayStates.set(siteId, data);
  // Relayer aux dashboards/remote qui regardent ce site
  io.to(`site:${siteId}`).emit('secondary-display-status', data);
});

// Endpoint API pour état initial
// GET /api/remote/:siteId/state → ajouter secondaryDisplay dans la réponse
```

### 3. Remote Component — Subscription

```typescript
// remote.component.ts
public secondaryDisplayConnected = false;
public secondaryDisplayResolution: string | null = null;
// DEPRECATED v3.98.7: secondaryDisplayEnabled supprimé — toujours true (hardware-driven)
public secondaryDisplayEnabled = true;

ngOnInit() {
  // v3.98.7+: Plus de lecture depuis la config — toujours activé, le Pi détecte par hardware

  // S'abonner aux mises à jour
  this.socketService.on<SecondaryDisplayStatus>('secondary-display-status', (data) => {
    this.ngZone.run(() => {
      this.secondaryDisplayConnected = data.connected;
      this.secondaryDisplayResolution = data.resolution || null;
    });
  });
}
```

### 4. Template

```html
<!-- Indicateur secondary display — v3.98.7+: toujours visible (hardware-driven) -->
@if (secondaryDisplayEnabled) {
<div
  class="secondary-indicator"
  [class.connected]="secondaryDisplayConnected"
  [title]="secondaryDisplayConnected
         ? 'Écran secondaire : connecté' + (secondaryDisplayResolution ? ' (' + secondaryDisplayResolution + ')' : '')
         : 'Écran secondaire : déconnecté'"
>
  <span class="secondary-icon">📺</span>
  <span class="secondary-label">2nd</span>
</div>
}
```

### 5. Styles SCSS

```scss
.secondary-indicator {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.3rem 0.6rem;
  border-radius: 9999px; // Pill shape (comme REC)
  border: 1px solid $gray-300;
  background: rgba($gray-400, 0.1);
  color: $gray-400;
  font-size: 0.75rem;
  font-weight: 500;
  transition: all 0.3s ease;
  cursor: default;

  .secondary-icon {
    font-size: 0.875rem;
  }

  &.connected {
    background: rgba($success, 0.1);
    border-color: rgba($success, 0.3);
    color: $success;

    .secondary-icon {
      animation: secondary-pulse 3s ease-in-out infinite;
    }
  }
}

@keyframes secondary-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}
```

---

## Fichiers à modifier

| Fichier                                                     | Modification                                                |
| ----------------------------------------------------------- | ----------------------------------------------------------- |
| `raspberry/src/app/components/remote/remote.component.ts`   | Ajouter state + subscription Socket.IO                      |
| `raspberry/src/app/components/remote/remote.component.html` | Ajouter le template indicateur                              |
| `raspberry/src/app/components/remote/remote.component.scss` | Ajouter les styles pill                                     |
| `raspberry/sync-agent/src/services/status-reporter.js`      | Émettre `secondary-display-status` depuis kiosk-status.json |
| `central-server/src/services/socket.service.ts`             | Stocker + relayer l'event                                   |
| `central-server/src/controllers/remote.controller.ts`       | Inclure `secondaryDisplay` dans `getRemoteState()`          |

---

## Tests

| Test                                                         | Fichier                          | Assertion                         |
| ------------------------------------------------------------ | -------------------------------- | --------------------------------- |
| Unit: indicateur toujours affiché (v3.98.7+ hardware-driven) | `remote.component.spec.ts`       | `.secondary-indicator` existe     |
| ~~Unit: indicateur masqué si `!secondaryDisplayEnabled`~~    | ~~`remote.component.spec.ts`~~   | ~~supprimé v3.98.7~~              |
| Unit: classe `.connected` si `secondaryDisplayConnected`     | `remote.component.spec.ts`       | `[class.connected]` toggle        |
| Smoke: event `secondary-display-status` wired                | `smoke.test.ts`                  | Event dans la liste des events Pi |
| E2E: indicateur visible sur Remote (si site dual)            | `e2e/tests/cloud-remote.spec.ts` | `.secondary-indicator` visible    |

---

## Estimation

| Tâche                                              | SP    |
| -------------------------------------------------- | ----- |
| Sync-agent : émission event + central-server relay | 1     |
| Remote : component + template + styles             | 1     |
| Tests (unit + smoke)                               | 1     |
| **Total**                                          | **3** |

---

**Retour** : [Features E-22](../safe/FEATURES.md#f-222--réactions-différenciées-tv-vs-secondaire--partiel-fév-2026) · [Remote Component](../../raspberry/src/app/components/remote/)
