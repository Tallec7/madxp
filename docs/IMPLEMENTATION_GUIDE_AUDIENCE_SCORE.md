# Guide d'Implémentation - Estimation Audience & Score en Live

> Date : 15 Décembre 2025
> Référence : BACKLOG.md - Sprint Décembre 2025

---

## 📋 TABLE DES MATIÈRES

1. [Estimation d'Audience](#1-estimation-daudience)
2. [Score en Live - Phase 1](#2-score-en-live---phase-1)
3. [Scripts de Migration](#3-scripts-de-migration)
4. [Tests à Effectuer](#4-tests-à-effectuer)

---

## 1. ESTIMATION D'AUDIENCE

### 1.1 Base de Données ✅ FAIT

**Fichier** : `central-server/src/scripts/migrations/add-audience-and-score-fields.sql`

Champs ajoutés à `club_sessions` :
- `match_date DATE` - Date du match
- `match_name VARCHAR(255)` - Nom du match (ex: "CESSON vs NANTES")
- `audience_estimate INTEGER` - Estimation spectateurs

**Exécuter la migration** :
```bash
psql -U neopro_user -d neopro_db -f central-server/src/scripts/migrations/add-audience-and-score-fields.sql
```

---

### 1.2 Frontend Télécommande - Badge & Modal

#### 1.2.1 Modifier `remote.component.ts`

**Ajouter les propriétés** (après ligne 38) :

```typescript
// Estimation d'audience
public showMatchModal = false;
public matchInfo = {
  date: new Date().toISOString().split('T')[0],
  matchName: '',
  audienceEstimate: 150
};
public currentSessionId: string | null = null;
```

**Ajouter les méthodes** (avant la fin de la classe) :

```typescript
/**
 * Ouvre le modal de configuration du match
 */
openMatchModal(): void {
  this.showMatchModal = true;
}

/**
 * Ferme le modal sans sauvegarder
 */
closeMatchModal(): void {
  this.showMatchModal = false;
}

/**
 * Sauvegarde les informations du match
 */
saveMatchInfo(): void {
  console.log('Match info saved:', this.matchInfo);

  // Créer une nouvelle session avec les infos du match
  this.currentSessionId = this.generateUUID();

  // Envoyer au serveur via socket
  this.socketService.emit('match-config', {
    sessionId: this.currentSessionId,
    matchDate: this.matchInfo.date,
    matchName: this.matchInfo.matchName,
    audienceEstimate: this.matchInfo.audienceEstimate
  });

  this.showMatchModal = false;
}

/**
 * Génère un UUID v4
 */
private generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
```

**Modifier la méthode `launchSponsors()`** (ligne ~149) :

```typescript
public launchSponsors(): void {
  console.log('emit sponsors loop');

  // Si pas de session active, proposer de configurer le match
  if (!this.currentSessionId) {
    this.openMatchModal();
    return;
  }

  this.socketService.emit('command', {
    type: 'sponsors',
    sessionId: this.currentSessionId
  });
}
```

#### 1.2.2 Modifier `remote.component.html`

**Ajouter le badge dans le header** (après ligne 37, dans `header-left`) :

```html
<!-- Badge estimation audience -->
<button class="audience-badge" (click)="openMatchModal()" title="Configuration match">
  <span class="badge-icon">👥</span>
  <span class="badge-value">{{ matchInfo.audienceEstimate }}</span>
  <span class="badge-edit">✏️</span>
</button>
```

**Ajouter le modal** (après la ligne ~250, juste avant la fermeture de `remote-container`) :

```html
<!-- Modal configuration match -->
@if (showMatchModal) {
  <div class="modal-overlay" (click)="closeMatchModal()">
    <div class="modal-content" (click)="$event.stopPropagation()">
      <div class="modal-header">
        <h2>📅 Configuration Match</h2>
        <button class="modal-close" (click)="closeMatchModal()">×</button>
      </div>

      <div class="modal-body">
        <!-- Date du match -->
        <div class="form-group">
          <label for="matchDate">Date du match</label>
          <input
            type="date"
            id="matchDate"
            [(ngModel)]="matchInfo.date"
            class="form-input"
          />
        </div>

        <!-- Nom du match -->
        <div class="form-group">
          <label for="matchName">Match</label>
          <input
            type="text"
            id="matchName"
            [(ngModel)]="matchInfo.matchName"
            placeholder="CESSON vs NANTES"
            class="form-input"
          />
        </div>

        <!-- Estimation spectateurs -->
        <div class="form-group">
          <label for="audienceEstimate">Spectateurs estimés</label>
          <div class="audience-input-group">
            <button
              class="audience-btn minus"
              (click)="matchInfo.audienceEstimate = Math.max(0, matchInfo.audienceEstimate - 10)"
            >-</button>
            <input
              type="number"
              id="audienceEstimate"
              [(ngModel)]="matchInfo.audienceEstimate"
              min="0"
              step="10"
              class="form-input audience-number"
            />
            <button
              class="audience-btn plus"
              (click)="matchInfo.audienceEstimate = matchInfo.audienceEstimate + 10"
            >+</button>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" (click)="closeMatchModal()">
          Annuler
        </button>
        <button class="btn btn-primary" (click)="saveMatchInfo()">
          Enregistrer
        </button>
      </div>
    </div>
  </div>
}
```

**Important** : Ajouter `FormsModule` dans les imports du component :

```typescript
// remote.component.ts - ligne 17
imports: [CommonModule, ClubSelectorComponent, FormsModule],
```

```typescript
// Ajouter l'import en haut du fichier
import { FormsModule } from '@angular/forms';
```

#### 1.2.3 Modifier `remote.component.scss`

**Ajouter les styles** (à la fin du fichier) :

```scss
// ============================================================================
// BADGE AUDIENCE
// ============================================================================

.audience-badge {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 1.5rem;
  color: white;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  margin-left: 1rem;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }

  .badge-icon {
    font-size: 1.2rem;
  }

  .badge-value {
    font-size: 1.1rem;
  }

  .badge-edit {
    font-size: 0.9rem;
    opacity: 0.8;
  }
}

// ============================================================================
// MODAL CONFIGURATION MATCH
// ============================================================================

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease-out;
}

.modal-content {
  background: white;
  border-radius: 1rem;
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  overflow: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.3s ease-out;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid #e5e7eb;

  h2 {
    margin: 0;
    font-size: 1.5rem;
    color: #1f2937;
  }
}

.modal-close {
  background: none;
  border: none;
  font-size: 2rem;
  color: #6b7280;
  cursor: pointer;
  padding: 0;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;

  &:hover {
    color: #1f2937;
  }
}

.modal-body {
  padding: 1.5rem;
}

.form-group {
  margin-bottom: 1.5rem;

  label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 600;
    color: #374151;
    font-size: 0.95rem;
  }
}

.form-input {
  width: 100%;
  padding: 0.75rem 1rem;
  border: 2px solid #e5e7eb;
  border-radius: 0.5rem;
  font-size: 1rem;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: #667eea;
  }
}

.audience-input-group {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.audience-btn {
  width: 3rem;
  height: 3rem;
  border: 2px solid #667eea;
  background: white;
  color: #667eea;
  border-radius: 0.5rem;
  font-size: 1.5rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;

  &:hover {
    background: #667eea;
    color: white;
  }

  &:active {
    transform: scale(0.95);
  }
}

.audience-number {
  flex: 1;
  text-align: center;
  font-weight: 600;
  font-size: 1.2rem;
}

.modal-footer {
  display: flex;
  gap: 1rem;
  padding: 1.5rem;
  border-top: 1px solid #e5e7eb;
  justify-content: flex-end;
}

.btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 0.5rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &.btn-primary {
    background: #667eea;
    color: white;

    &:hover {
      background: #5568d3;
    }
  }

  &.btn-secondary {
    background: #e5e7eb;
    color: #374151;

    &:hover {
      background: #d1d5db;
    }
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
```

---

### 1.3 Backend - Récupération des Données

#### 1.3.1 Modifier `analytics.controller.ts`

**Ajouter dans la fonction `recordVideoPlays`** (ligne ~50) :

Lors de la création/récupération de la session, inclure les champs match :

```typescript
// Trouver ou créer une session active
let sessionResult = await query(
  `SELECT id FROM club_sessions
   WHERE site_id = $1 AND ended_at IS NULL
   ORDER BY started_at DESC LIMIT 1`,
  [siteId]
);

let sessionId: string;

if (sessionResult.rowCount === 0) {
  // Créer nouvelle session
  const newSession = await query(
    `INSERT INTO club_sessions (site_id, started_at, match_date, match_name, audience_estimate)
     VALUES ($1, NOW(), $2, $3, $4)
     RETURNING id`,
    [siteId, null, null, null] // Sera mis à jour par match-config
  );
  sessionId = newSession.rows[0].id;
} else {
  sessionId = sessionResult.rows[0].id;
}
```

#### 1.3.2 Socket.io - Événement match-config

**Créer nouveau fichier** : `raspberry/backend/src/handlers/match-config.handler.ts`

```typescript
import { Socket } from 'socket.io';
import { query } from '../../../central-server/src/config/database';
import logger from '../../../central-server/src/config/logger';

export async function handleMatchConfig(socket: Socket, data: any) {
  try {
    const { sessionId, matchDate, matchName, audienceEstimate } = data;
    const siteId = socket.data.siteId;

    // Mettre à jour la session avec les infos du match
    await query(
      `UPDATE club_sessions
       SET match_date = $1,
           match_name = $2,
           audience_estimate = $3
       WHERE id = $4 AND site_id = $5`,
      [matchDate, matchName, audienceEstimate, sessionId, siteId]
    );

    logger.info('Match config updated', {
      siteId,
      sessionId,
      matchName,
      audienceEstimate
    });

    socket.emit('match-config-saved', { success: true });

  } catch (error) {
    logger.error('Error handling match config:', error);
    socket.emit('match-config-saved', { success: false, error: String(error) });
  }
}
```

**Enregistrer le handler dans le serveur Socket.io** :

```typescript
// Dans raspberry/backend/src/server.ts
import { handleMatchConfig } from './handlers/match-config.handler';

io.on('connection', (socket) => {
  // ... handlers existants

  socket.on('match-config', (data) => handleMatchConfig(socket, data));
});
```

---

## 2. SCORE EN LIVE - PHASE 1

### 2.1 Base de Données ✅ FAIT

**Fichier** : `central-server/src/scripts/migrations/add-audience-and-score-fields.sql`

Déjà exécuté dans la section 1.1.

Champs ajoutés :
- `sites.live_score_enabled BOOLEAN` - Active/désactive le score (option payante)
- `sponsor_impressions.home_score INTEGER` - Score domicile
- `sponsor_impressions.away_score INTEGER` - Score extérieur

---

### 2.2 Admin Central - Toggle Activation

#### 2.2.1 Modifier `site-edit.component.ts` (central-dashboard)

**Ajouter dans l'interface Site** (si pas déjà présent) :

```typescript
export interface Site {
  // ... champs existants
  live_score_enabled?: boolean;
}
```

**Dans le template HTML du formulaire d'édition** :

```html
<!-- Section Options Avancées -->
<div class="form-section">
  <h3>Options Avancées</h3>

  <div class="form-group checkbox-group premium">
    <label>
      <input
        type="checkbox"
        [(ngModel)]="site.live_score_enabled"
        name="liveScoreEnabled"
      />
      <span class="checkbox-label">
        <span class="checkbox-text">Activer Score en Live</span>
        <span class="premium-badge">💰 Premium</span>
      </span>
    </label>
    <p class="form-help">
      Permet d'afficher le score du match en surimpression pendant les vidéos.
      Cette fonctionnalité est une option payante.
    </p>
  </div>
</div>
```

**Styles à ajouter** :

```scss
.premium {
  border: 2px solid #f59e0b;
  background: #fffbeb;
  padding: 1rem;
  border-radius: 0.5rem;
}

.premium-badge {
  display: inline-block;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 1rem;
  font-size: 0.85rem;
  font-weight: 600;
  margin-left: 0.5rem;
}
```

---

### 2.3 Frontend Télécommande - Saisie Score

#### 2.3.1 Modifier `remote.component.ts`

**Ajouter les propriétés** (après matchInfo) :

```typescript
// Score en live
public liveScoreEnabled = false;
public currentScore = {
  homeTeam: 'DOMICILE',
  awayTeam: 'EXTÉRIEUR',
  homeScore: 0,
  awayScore: 0
};
```

**Ajouter dans `ngOnInit()`** :

```typescript
ngOnInit(): void {
  // ... code existant

  // Charger la config pour savoir si le score est activé
  this.loadConfiguration();

  // Écouter les mises à jour du score
  this.socketService.on('score-updated', (score: any) => {
    console.log('Score updated from TV:', score);
  });
}
```

**Ajouter les méthodes de gestion du score** :

```typescript
/**
 * Incrémente le score de l'équipe domicile
 */
incrementHomeScore(): void {
  this.currentScore.homeScore++;
  this.broadcastScore();
}

/**
 * Décrémente le score de l'équipe domicile
 */
decrementHomeScore(): void {
  if (this.currentScore.homeScore > 0) {
    this.currentScore.homeScore--;
    this.broadcastScore();
  }
}

/**
 * Incrémente le score de l'équipe extérieure
 */
incrementAwayScore(): void {
  this.currentScore.awayScore++;
  this.broadcastScore();
}

/**
 * Décrémente le score de l'équipe extérieure
 */
decrementAwayScore(): void {
  if (this.currentScore.awayScore > 0) {
    this.currentScore.awayScore--;
    this.broadcastScore();
  }
}

/**
 * Met à jour les noms des équipes
 */
updateTeamNames(): void {
  // Extraire les noms depuis matchInfo.matchName si disponible
  if (this.matchInfo.matchName && this.matchInfo.matchName.includes('vs')) {
    const teams = this.matchInfo.matchName.split('vs').map(t => t.trim());
    this.currentScore.homeTeam = teams[0] || 'DOMICILE';
    this.currentScore.awayTeam = teams[1] || 'EXTÉRIEUR';
  }
}

/**
 * Envoie le score à la TV via socket
 */
private broadcastScore(): void {
  this.socketService.emit('score-update', {
    homeTeam: this.currentScore.homeTeam,
    awayTeam: this.currentScore.awayTeam,
    homeScore: this.currentScore.homeScore,
    awayScore: this.currentScore.awayScore
  });
}
```

**Modifier `saveMatchInfo()`** pour extraire les noms d'équipes :

```typescript
saveMatchInfo(): void {
  // ... code existant

  // Extraire les noms d'équipes
  this.updateTeamNames();

  // ... reste du code
}
```

#### 2.3.2 Modifier `remote.component.html`

**Ajouter le widget score** (dans la section home, après quick-actions) :

```html
<!-- Widget Score (si activé) -->
@if (liveScoreEnabled && currentView === 'home') {
  <div class="score-widget">
    <div class="score-widget-header">
      <h3>🏀 Score du Match</h3>
    </div>

    <div class="score-display">
      <!-- Équipe Domicile -->
      <div class="team-section">
        <input
          type="text"
          [(ngModel)]="currentScore.homeTeam"
          (blur)="broadcastScore()"
          class="team-name-input"
          placeholder="DOMICILE"
        />
        <div class="score-controls">
          <button class="score-btn minus" (click)="decrementHomeScore()">-</button>
          <div class="score-value">{{ currentScore.homeScore }}</div>
          <button class="score-btn plus" (click)="incrementHomeScore()">+</button>
        </div>
      </div>

      <!-- Séparateur -->
      <div class="score-separator">-</div>

      <!-- Équipe Extérieure -->
      <div class="team-section">
        <input
          type="text"
          [(ngModel)]="currentScore.awayTeam"
          (blur)="broadcastScore()"
          class="team-name-input"
          placeholder="EXTÉRIEUR"
        />
        <div class="score-controls">
          <button class="score-btn minus" (click)="decrementAwayScore()">-</button>
          <div class="score-value">{{ currentScore.awayScore }}</div>
          <button class="score-btn plus" (click)="incrementAwayScore()">+</button>
        </div>
      </div>
    </div>
  </div>
}
```

#### 2.3.3 Modifier `remote.component.scss`

**Ajouter les styles** (après les styles du modal) :

```scss
// ============================================================================
// WIDGET SCORE EN LIVE
// ============================================================================

.score-widget {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 1rem;
  padding: 1.5rem;
  margin: 1.5rem 0;
  box-shadow: 0 4px 20px rgba(102, 126, 234, 0.3);
}

.score-widget-header {
  text-align: center;
  margin-bottom: 1.5rem;

  h3 {
    color: white;
    margin: 0;
    font-size: 1.3rem;
    font-weight: 700;
  }
}

.score-display {
  display: flex;
  align-items: center;
  justify-content: space-around;
  gap: 1rem;
}

.team-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

.team-name-input {
  background: rgba(255, 255, 255, 0.2);
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 0.5rem;
  color: white;
  text-align: center;
  padding: 0.5rem 1rem;
  font-weight: 700;
  font-size: 0.95rem;
  width: 100%;
  text-transform: uppercase;

  &::placeholder {
    color: rgba(255, 255, 255, 0.5);
  }

  &:focus {
    outline: none;
    border-color: rgba(255, 255, 255, 0.6);
    background: rgba(255, 255, 255, 0.3);
  }
}

.score-controls {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.score-btn {
  width: 3.5rem;
  height: 3.5rem;
  border: 3px solid white;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border-radius: 50%;
  font-size: 2rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(10px);

  &:hover {
    background: rgba(255, 255, 255, 0.3);
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }
}

.score-value {
  font-size: 3rem;
  font-weight: 900;
  color: white;
  min-width: 4rem;
  text-align: center;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
}

.score-separator {
  font-size: 2.5rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.6);
}
```

---

### 2.4 Frontend TV - Overlay Score

#### 2.4.1 Modifier `tv.component.ts`

**Ajouter les propriétés** :

```typescript
// Score en live
public liveScoreEnabled = false;
public currentScore: {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
} | null = null;
public showScorePopup = false;
```

**Ajouter dans `ngOnInit()`** :

```typescript
ngOnInit(): void {
  // ... code existant

  // Écouter les mises à jour du score
  this.socketService.on('score-update', (score: any) => {
    const previousScore = this.currentScore ? { ...this.currentScore } : null;
    this.currentScore = score;

    // Afficher popup si changement de score
    if (previousScore && (
      score.homeScore > previousScore.homeScore ||
      score.awayScore > previousScore.awayScore
    )) {
      this.showScoreChangePopup();
    }
  });

  // Charger l'état du score activé depuis la config
  this.loadScoreConfig();
}
```

**Ajouter les méthodes** :

```typescript
/**
 * Charge la configuration du score depuis le serveur
 */
private async loadScoreConfig(): Promise<void> {
  try {
    const response = await fetch('/api/config/score-enabled');
    const data = await response.json();
    this.liveScoreEnabled = data.enabled;
  } catch (error) {
    console.error('Error loading score config:', error);
  }
}

/**
 * Affiche le popup de changement de score pendant 5 secondes
 */
private showScoreChangePopup(): void {
  this.showScorePopup = true;
  setTimeout(() => {
    this.showScorePopup = false;
  }, 5000);
}
```

#### 2.4.2 Modifier `tv.component.html`

**Ajouter l'overlay score** (dans le container de la vidéo) :

```html
<div class="video-container">
  <video #videoPlayer class="video-player"></video>

  <!-- Overlay score permanent (coin supérieur droit) -->
  @if (liveScoreEnabled && currentScore) {
    <div class="score-overlay">
      <div class="score-line">
        <span class="team-home">{{ currentScore.homeTeam }}</span>
        <span class="score-home">{{ currentScore.homeScore }}</span>
        <span class="separator">-</span>
        <span class="score-away">{{ currentScore.awayScore }}</span>
        <span class="team-away">{{ currentScore.awayTeam }}</span>
      </div>
    </div>
  }

  <!-- Popup changement de score (centre écran) -->
  @if (liveScoreEnabled && showScorePopup && currentScore) {
    <div class="score-popup">
      <div class="popup-content">
        <div class="popup-icon">⚽</div>
        <div class="popup-score">
          {{ currentScore.homeTeam }} {{ currentScore.homeScore }}
          -
          {{ currentScore.awayScore }} {{ currentScore.awayTeam }}
        </div>
      </div>
    </div>
  }
</div>
```

#### 2.4.3 Modifier `tv.component.css`

**Ajouter les styles** :

```css
/* ============================================================================
   OVERLAY SCORE EN LIVE
   ============================================================================ */

.score-overlay {
  position: absolute;
  top: 20px;
  right: 20px;
  background: rgba(0, 0, 0, 0.85);
  padding: 12px 24px;
  border-radius: 12px;
  color: white;
  font-family: 'Arial', sans-serif;
  font-weight: bold;
  z-index: 1000;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(10px);
  border: 2px solid rgba(255, 255, 255, 0.1);
}

.score-line {
  display: flex;
  align-items: center;
  gap: 12px;
}

.team-home,
.team-away {
  font-size: 20px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.score-home,
.score-away {
  font-size: 36px;
  color: #10b981;
  min-width: 50px;
  text-align: center;
  font-weight: 900;
}

.separator {
  color: #6b7280;
  font-size: 28px;
  margin: 0 4px;
}

/* Popup changement de score */
.score-popup {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 2000;
  animation: scorePopupSlide 0.5s ease-out;
}

.popup-content {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 40px 60px;
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  text-align: center;
  border: 3px solid rgba(255, 255, 255, 0.3);
}

.popup-icon {
  font-size: 60px;
  margin-bottom: 20px;
  animation: bounce 0.6s ease-in-out;
}

.popup-score {
  font-size: 48px;
  font-weight: 900;
  color: white;
  text-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

@keyframes scorePopupSlide {
  from {
    transform: translate(-50%, -100%);
    opacity: 0;
  }
  to {
    transform: translate(-50%, -50%);
    opacity: 1;
  }
}

@keyframes bounce {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}
```

---

## 3. SCRIPTS DE MIGRATION

### 3.1 Exécuter la Migration

```bash
# Se connecter à PostgreSQL
psql -U neopro_user -d neopro_db

# Exécuter le script
\i central-server/src/scripts/migrations/add-audience-and-score-fields.sql

# Vérifier les colonnes ajoutées
\d club_sessions
\d sites
\d sponsor_impressions
```

### 3.2 Rollback si Nécessaire

```sql
-- Annuler la migration
ALTER TABLE club_sessions
DROP COLUMN IF EXISTS match_date,
DROP COLUMN IF EXISTS match_name,
DROP COLUMN IF EXISTS audience_estimate;

ALTER TABLE sites
DROP COLUMN IF EXISTS live_score_enabled;

ALTER TABLE sponsor_impressions
DROP COLUMN IF EXISTS home_score,
DROP COLUMN IF EXISTS away_score;
```

---

## 4. TESTS À EFFECTUER

### 4.1 Tests Estimation d'Audience

**Scénario 1 : Première utilisation**
1. Ouvrir la télécommande
2. Vérifier que le badge audience s'affiche avec valeur par défaut (150)
3. Cliquer sur le badge
4. Vérifier que le modal s'ouvre
5. Modifier date, match, et audience
6. Cliquer "Enregistrer"
7. Vérifier que le badge se met à jour
8. Lancer la boucle sponsors
9. Vérifier en DB que la session contient les bonnes infos :

```sql
SELECT id, match_date, match_name, audience_estimate
FROM club_sessions
WHERE site_id = 'your-site-id'
ORDER BY created_at DESC
LIMIT 1;
```

**Scénario 2 : Session active**
1. Avec une session déjà configurée
2. Lancer directement les sponsors
3. Vérifier qu'aucun modal ne s'affiche
4. Modifier le badge pour changer l'audience
5. Vérifier la mise à jour en DB

**Scénario 3 : Plusieurs matchs le même jour**
1. Configurer un match du matin
2. Terminer la session
3. Configurer un nouveau match l'après-midi
4. Vérifier que 2 sessions distinctes existent en DB

---

### 4.2 Tests Score en Live

**Scénario 1 : Activation Admin**
1. Se connecter au dashboard central en tant qu'admin
2. Éditer un site
3. Activer "Score en Live"
4. Sauvegarder
5. Vérifier en DB :

```sql
SELECT id, club_name, live_score_enabled
FROM sites
WHERE id = 'your-site-id';
```

**Scénario 2 : Widget Score Télécommande**
1. Sur un site avec score activé
2. Ouvrir la télécommande
3. Vérifier que le widget score s'affiche
4. Saisir les noms d'équipes
5. Incrémenter/décrémenter les scores
6. Vérifier que l'overlay TV se met à jour en temps réel

**Scénario 3 : Overlay TV**
1. Lancer une vidéo sur la TV
2. Modifier le score depuis la télécommande
3. Vérifier que l'overlay permanent se met à jour
4. Incrémenter le score
5. Vérifier que le popup apparaît pendant 5 secondes

**Scénario 4 : Désactivation**
1. Désactiver le score en live dans l'admin
2. Recharger la télécommande
3. Vérifier que le widget score n'apparaît plus
4. Vérifier que l'overlay TV n'apparaît plus

---

## 5. CHECKLIST FINALE

### Estimation d'Audience
- [ ] Migration DB exécutée
- [ ] Badge audience visible sur télécommande
- [ ] Modal de configuration fonctionnel
- [ ] Socket event `match-config` enregistré
- [ ] Données sauvegardées en DB dans `club_sessions`
- [ ] Export CSV inclut les nouvelles colonnes
- [ ] Rapport PDF Club inclut les infos de match

### Score en Live
- [ ] Migration DB exécutée
- [ ] Toggle admin fonctionnel
- [ ] Widget score sur télécommande (si activé)
- [ ] Overlay permanent sur TV
- [ ] Popup changement de score
- [ ] Socket event `score-update` fonctionnel
- [ ] Scores stockés dans `sponsor_impressions`
- [ ] Analytics montrent le contexte de score

---

## 6. AMÉLIORATIONS FUTURES (BACKLOG)

### Phase 2 - Score en Live
- [ ] Intégration API fédérations (FFHB, FFVB, FFBB)
- [ ] Intégration tableaux d'affichage (Bodet, Stramatel)
- [ ] OCR sur tableau existant (fallback)
- [ ] Chronomètre temps de jeu
- [ ] Popup personnalisables (célébrations)

### Analytics Avancées
- [ ] Corrélation score/taux complétion des pubs
- [ ] Heatmap des moments forts du match
- [ ] Recommendations pour diffuser pubs aux meilleurs moments

---

**Documentation créée le** : 15 Décembre 2025
**Dernière mise à jour** : 15 Décembre 2025
**Auteur** : Claude Code
**Statut** : 📝 Guide d'implémentation prêt
