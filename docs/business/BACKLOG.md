# BACKLOG NEOPRO - Features à Développer

> **Date de création** : 15 Décembre 2025
> **Dernière MAJ** : 25 Décembre 2025
> **Statut projet** : 🟢 Production-Ready (voir `STATUS.md`)

Ce document regroupe les features planifiées et leur état d'avancement.

---

## 📋 TABLE DES MATIÈRES

1. [✅ Features Terminées Récemment](#-features-terminées-récemment)
2. [🚀 Features en Développement Actif](#-features-en-développement-actif)
3. [📌 Backlog Priorisé](#-backlog-priorisé)
4. [🔮 Backlog Long Terme](#-backlog-long-terme)
5. [❌ Features Rejetées / En Pause](#-features-rejetées--en-pause)
6. [📊 Suivi des Sprints](#-suivi-des-sprints)

---

## ✅ FEATURES TERMINÉES RÉCEMMENT

### ✅ Télécommande v2 - **TERMINÉ 15 Déc 2025 (14h30)**

**Statut** : 🟢 100% Implémenté

**Ce qui a été fait** :

- ✅ **Recherche vidéos** - Recherche instantanée dans toutes les vidéos
- ✅ **Vue "Toutes les vidéos"** - Bouton d'accès direct
- ✅ **Badge estimation audience** - Toujours visible dans le header
- ✅ **Modal configuration match** - Date, nom, spectateurs
- ✅ **Widget score en live** - Affiché si `liveScoreEnabled: true`
- ✅ **États vides** - Messages explicites
- ✅ **Suppression Mode Programmation** - Reporté au backlog

**Fichiers modifiés** :

- `raspberry/frontend/app/components/remote/remote.component.ts` (+250 lignes)
- `raspberry/frontend/app/components/remote/remote.component.html` (refonte)
- `raspberry/frontend/app/components/remote/remote.component.scss` (+500 lignes)
- `raspberry/frontend/app/interfaces/configuration.interface.ts` (+`liveScoreEnabled`)
- `raspberry/frontend/app/services/socket.service.ts` (nouveaux types)

**Note finale** : 95/100

---

### ✅ Rapport PDF Club - **TERMINÉ 15 Déc 2025**

**Statut** : 🟢 100% Implémenté et testé

**Ce qui a été fait** :

- ✅ Backend complet (`pdf-report.service.ts` - 1500 lignes)
  - Fonction `generateClubReport()` avec toutes les requêtes SQL
  - Fonction `generateClubPdf()` - Génération PDF 6 pages
  - Helper `drawKPIBox()` pour KPI cards stylisées
- ✅ Endpoint API : `GET /api/analytics/clubs/:siteId/report/pdf`
- ✅ Controller : `generateClubPdfReport()` dans `analytics.controller.ts`
- ✅ Frontend service : `getClubPdfReport()` dans `analytics.service.ts`
- ✅ UI : Bouton "📥 Télécharger PDF" dans `club-analytics.component.ts`

**Contenu du PDF** (6 pages) :

- Page 1 : Page de garde (nom club, période, date génération)
- Page 2 : Résumé exécutif (6 KPIs + points saillants automatiques)
- Page 3 : Utilisation (activité quotidienne, auto vs manuel, sessions)
- Page 4 : Contenu (breakdown catégories, top 10 vidéos)
- Page 5 : Santé système (CPU, RAM, Temp, Disque, Uptime, Alertes)
- Page 6 : Certification numérique (signature SHA-256)

**Fichiers modifiés** :

- `central-server/src/services/pdf-report.service.ts` (+600 lignes)
- `central-server/src/routes/analytics.routes.ts` (+3 lignes)
- `central-server/src/controllers/analytics.controller.ts` (+55 lignes)
- `central-dashboard/src/app/core/services/analytics.service.ts` (+15 lignes)
- `central-dashboard/src/app/features/analytics/club-analytics.component.ts` (+30 lignes)

**Référence** : Business Plan §14.4 Phase 3 - **COMPLET**

---

## 🚀 FEATURES EN DÉVELOPPEMENT ACTIF

### 1. Estimation d'Audience - Sélection Match ✅ **UI TERMINÉE**

**Objectif** : Permettre d'indiquer le jour de match, le nom du match, et l'estimation de spectateurs

**Option retenue** : Badge discret toujours visible (Option B améliorée)

**Statut UI** : ✅ TERMINÉ (15 Déc 2025)
**Statut Backend** : ⏳ Handler socket à créer

**Implémentation** :

#### 2.1 Interface Télécommande

```
┌──────────────────────────────────┐
│  📺 Télécommande                 │
│                    🏀 Badge ✏️  │  ← Clic pour ouvrir modal
├──────────────────────────────────┤
```

#### 2.2 Modal de configuration

```
┌────────────────────────────────────────┐
│  📅 Configuration Match                │
├────────────────────────────────────────┤
│  Date du match :                       │
│  [15/12/2025] 📅                      │
│                                        │
│  Match :                               │
│  [CESSON vs NANTES]                   │
│                                        │
│  Spectateurs estimés :                 │
│  [150] 👥                             │
│                                        │
│  [Annuler]          [Enregistrer]     │
└────────────────────────────────────────┘
```

#### 2.3 Base de données

```sql
-- Ajouter à club_sessions
ALTER TABLE club_sessions ADD COLUMN match_date DATE;
ALTER TABLE club_sessions ADD COLUMN match_name VARCHAR(255);
ALTER TABLE club_sessions ADD COLUMN audience_estimate INTEGER;

-- Ajouter à sponsor_impressions (déjà prévu dans schéma)
-- audience_estimate INTEGER existe déjà
```

#### 2.4 Fichiers à modifier

- `raspberry/frontend/app/components/remote/remote.component.ts` - Ajouter badge + modal
- `raspberry/frontend/app/components/remote/remote.component.html` - UI badge
- `raspberry/frontend/app/services/analytics.service.ts` - Stocker config match
- `central-server/src/controllers/analytics.controller.ts` - Recevoir données match

**Effort** : 2-3 jours

---

### 3. Score en Live - Phase 1 ✅ **UI Télécommande TERMINÉE**

**Objectif** : Afficher le score du match en surimpression pendant les vidéos

**Statut UI Télécommande** : ✅ TERMINÉ (15 Déc 2025)
**Statut UI TV (overlay)** : ⏳ À implémenter
**Statut Admin toggle** : ⏳ À implémenter

**Phase 1 (Sprint actuel)** :

- ✅ Saisie manuelle depuis télécommande
- ⏳ Overlay permanent coin supérieur droit (TV)
- ⏳ Option activable/désactivable depuis Central Dashboard (option payante)

**Configuration** : Ajouter `"liveScoreEnabled": true` dans configuration.json

#### 3.1 Activation Admin (Central Dashboard)

**Nouveau champ dans `sites` table** :

```sql
ALTER TABLE sites ADD COLUMN live_score_enabled BOOLEAN DEFAULT false;
```

**Interface Admin** :

```
central-dashboard/src/app/features/sites/site-edit.component.ts

┌────────────────────────────────────────┐
│  Options Avancées                      │
├────────────────────────────────────────┤
│  ☑️ Activer Score en Live  💰 Premium │
│                                        │
│  Cette option permet d'afficher le     │
│  score du match en surimpression.      │
└────────────────────────────────────────┘
```

#### 3.2 Saisie Score (Télécommande)

**Interface** :

```
┌────────────────────────────────────┐
│  📺 Télécommande                   │
│                                    │
│  🏀 Score (si activé) :            │
│  ┌──────────────────────────────┐ │
│  │ CESSON  [34]  -  [28]  NANTES│ │
│  │          +  -      +  -      │ │
│  └──────────────────────────────┘ │
│                                    │
│  Équipe Domicile : [CESSON]       │
│  Équipe Extérieure : [NANTES]     │
└────────────────────────────────────┘
```

#### 3.3 Overlay TV

**Fichiers à modifier** :

- `raspberry/frontend/app/components/tv/tv.component.ts`
- `raspberry/frontend/app/components/tv/tv.component.html`
- `raspberry/frontend/app/components/tv/tv.component.css`

```html
<!-- tv.component.html -->
<div class="video-container">
  <video #videoPlayer></video>

  <!-- Score overlay si activé -->
  <div class="score-overlay" *ngIf="liveScoreEnabled && currentScore">
    <div class="score-line">
      <span class="team-home">{{ currentScore.homeTeam }}</span>
      <span class="score-home">{{ currentScore.homeScore }}</span>
      <span class="separator">-</span>
      <span class="score-away">{{ currentScore.awayScore }}</span>
      <span class="team-away">{{ currentScore.awayTeam }}</span>
    </div>
  </div>
</div>
```

```css
/* tv.component.css */
.score-overlay {
  position: absolute;
  top: 20px;
  right: 20px;
  background: rgba(0, 0, 0, 0.8);
  padding: 12px 24px;
  border-radius: 12px;
  color: white;
  font-family: 'Arial', sans-serif;
  font-weight: bold;
  font-size: 28px;
  z-index: 1000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
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
}

.score-home,
.score-away {
  font-size: 36px;
  color: #10b981;
  min-width: 50px;
  text-align: center;
}

.separator {
  color: #6b7280;
  font-size: 28px;
}
```

#### 3.4 Synchronisation Socket

**Events WebSocket** :

```typescript
// remote.component.ts émet
this.socketService.emit('score-update', {
  homeTeam: 'CESSON',
  awayTeam: 'NANTES',
  homeScore: 34,
  awayScore: 28,
});

// tv.component.ts écoute
this.socketService.on('score-update', (score) => {
  this.currentScore = score;
});
```

#### 3.5 Stockage Analytics

**Ajouter contexte score aux impressions** :

```sql
ALTER TABLE sponsor_impressions
ADD COLUMN home_score INTEGER,
ADD COLUMN away_score INTEGER;

-- Permet d'analyser : "Les pubs diffusées quand on menait ont 12% meilleur taux de complétion"
```

**Effort Phase 1** : 5-7 jours

---

## 📌 BACKLOG PRIORISÉ

### 4. Score en Live - Phase 2 (Intégrations) 🔵 **P2**

**Objectif** : Intégrer automatiquement le score depuis sources externes

**Sources à intégrer** :

#### 4.1 API Fédérations

- **FFHB** (Fédération Française de Handball)
- **FFVB** (Fédération Française de Volley-Ball)
- **FFBB** (Fédération Française de Basket-Ball)
- etc.

**Exemple endpoint** :

```typescript
// Polling toutes les 30 secondes pendant le match
GET https://api.ffhb.fr/matches/{matchId}/live-score
Response: {
  homeTeam: "CESSON RENNES",
  awayTeam: "NANTES",
  homeScore: 34,
  awayScore: 28,
  period: "second_half",
  minutesPlayed: 47
}
```

#### 4.2 Intégration Tableaux d'Affichage

**Marques visées** :

- **Bodet Sport** (leader français)
- **Stramatel**
- **Favero Electronics**

**Méthodes d'intégration** :

- API REST si disponible
- Protocole propriétaire (reverse engineering si nécessaire)
- Interception signal réseau (certains tableaux envoient UDP broadcast)

**Exemple UDP** :

```javascript
// Écouter sur port UDP 5000
const dgram = require('dgram');
const server = dgram.createSocket('udp4');

server.on('message', (msg, rinfo) => {
  // Format Bodet: "HOME:34|AWAY:28|PERIOD:2"
  const score = parseBodetProtocol(msg.toString());
  updateLiveScore(score);
});
```

#### 4.3 OCR sur Tableau Existant (Fallback)

**Si pas d'API disponible** :

- Caméra USB branchée sur Raspberry Pi
- Capture frame toutes les 10 secondes
- OCR avec Tesseract.js
- Parse score depuis texte reconnu

**Librairie** : `tesseract.js` ou `sharp` + API cloud (Google Vision)

**Effort** : 2-4 semaines
**Priorité** : P2 (après Phase 1 validée)

---

### 5. Objectifs & Alertes 🔵 **P2**

**Objectif** : Permettre aux clubs/sponsors de définir des objectifs et recevoir alertes automatiques

**Fonctionnalités** :

#### 5.1 Configuration Objectifs

- Temps d'écran mensuel (ex: 40h/mois)
- Vidéos jouées par mois (ex: 1500 vidéos)
- Uptime système (ex: 98% minimum)
- Impressions sponsors (ex: 50,000/trimestre)

#### 5.2 Types d'Alertes

- 🎯 Objectif atteint (email félicitations)
- ⚠️ Objectif en danger (< 80% à J-7)
- 🚨 Pas d'activité (7 jours sans session)
- 📊 Rapport mensuel automatique
- 🔥 Alerte technique (température, uptime)

#### 5.3 Canaux de Notification

- Email
- SMS (Twilio)
- Webhook (pour intégrations tierces)
- Notification dashboard

**Tables DB** :

```sql
CREATE TABLE goals (
  id UUID PRIMARY KEY,
  site_id UUID REFERENCES sites(id),
  sponsor_id UUID REFERENCES sponsors(id),
  goal_type VARCHAR(50),
  target_value DECIMAL(10,2),
  period VARCHAR(20),
  notification_threshold DECIMAL(5,2) DEFAULT 80,
  notification_email VARCHAR(255),
  active BOOLEAN DEFAULT true
);

CREATE TABLE alerts (
  id UUID PRIMARY KEY,
  goal_id UUID REFERENCES goals(id),
  alert_type VARCHAR(50),
  severity VARCHAR(20),
  message TEXT,
  sent_at TIMESTAMP,
  acknowledged BOOLEAN DEFAULT false
);
```

**Cron Job** : Vérification quotidienne des objectifs

**Effort** : 2 semaines
**Priorité** : P2 (feature engagement clubs)

---

### 6. Benchmark Anonymisé 🔵 **P2**

**Objectif** : Comparer performance club avec clubs similaires anonymement

**Fonctionnalités** :

#### 6.1 Segmentation Intelligente

Comparer uniquement avec clubs ayant :

- Même sport (handball vs volley vs basket)
- Taille audience similaire (±50%)
- Même région géographique
- Même niveau (amateur vs semi-pro)

#### 6.2 Métriques Benchmarkées

- Temps d'écran mensuel (médiane, percentile 10/90)
- Vidéos jouées par match
- Ratio auto vs manuel
- Taux de complétion
- Uptime système
- Diversité contenu

#### 6.3 Insights Automatiques

```
🎉 Vous êtes dans le top 15% des clubs handball en Bretagne !

💡 Les clubs top performers utilisent 35% de triggers manuels (vous: 22%).
   Essayez d'animer plus vos mi-temps !

🏆 Votre fiabilité système (99.2%) est meilleure que 85% des clubs similaires !
```

#### 6.4 Anonymisation Stricte

- ❌ Jamais révéler nom des clubs
- ❌ Jamais de classement détaillé
- ✅ Seulement statistiques agrégées
- ✅ Minimum 10 clubs dans cohorte pour publier benchmark

**Vue SQL** :

```sql
CREATE VIEW benchmark_stats AS
SELECT
  sites.sport,
  sites.region,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY screen_time) as median_screen_time,
  PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY screen_time) as top10_screen_time,
  COUNT(DISTINCT site_id) as cohort_size
FROM club_daily_stats
JOIN sites ON sites.id = club_daily_stats.site_id
WHERE date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY sites.sport, sites.region
HAVING COUNT(DISTINCT site_id) >= 10; -- Anonymisation
```

**Effort** : 2 semaines
**Priorité** : P2 (feature engagement + réduction churn)

---

### 7. A/B Testing Créas 🟡 **P3**

**Objectif** : Tester plusieurs versions d'une pub sponsor pour identifier la meilleure

**Fonctionnalités** :

#### 7.1 Campagnes A/B Test

- Créer campagne avec 2-3 variantes
- Allocation trafic (33% / 33% / 34%)
- Durée test (7-30 jours)
- Sélection aléatoire pondérée

#### 7.2 Métriques Comparées

- Taux de complétion
- Impressions totales
- Audience reach
- Coût par impression

#### 7.3 Détermination Gagnant

- Calcul statistique (test χ²)
- Intervalle de confiance 95%
- Recommandation automatique

**Tables DB** :

```sql
CREATE TABLE ab_test_campaigns (
  id UUID PRIMARY KEY,
  sponsor_id UUID REFERENCES sponsors(id),
  name VARCHAR(255),
  start_date DATE,
  end_date DATE,
  status VARCHAR(20),
  winner_variant VARCHAR(10)
);

CREATE TABLE ab_test_variants (
  id UUID PRIMARY KEY,
  campaign_id UUID REFERENCES ab_test_campaigns(id),
  variant_name VARCHAR(10),
  video_id UUID REFERENCES videos(id),
  allocation_percent INTEGER DEFAULT 33,
  total_impressions INTEGER DEFAULT 0,
  avg_completion_rate DECIMAL(5,2)
);

ALTER TABLE sponsor_impressions
ADD COLUMN ab_variant VARCHAR(10);
```

**Dashboard** :

```
┌─────────────────────────────────────────────────────────────┐
│  Campagne A/B Test : Décathlon Chaussures                   │
│  ✅ Terminée - Gagnant : Variante B (+6.8% completion)      │
├─────────────────────────────────────────────────────────────┤
│  A - Statique   │ 823 impr. │ 89.3% │ 10,200 reach        │
│  B - Action ⭐  │ 845 impr. │ 96.1% │ 10,450 reach ⭐     │
│  C - Story      │ 312 impr. │ 72.4% │ 3,900 reach         │
└─────────────────────────────────────────────────────────────┘
```

**Effort** : 3-4 semaines
**Priorité** : P3 (feature premium, complexe)

---

### 8. Portail Sponsor Self-Service 🟡 **P3**

**Objectif** : Permettre aux sponsors d'accéder directement à leurs analytics sans passer par le club

**Fonctionnalités** :

#### 8.1 Authentification Sponsor

- Inscription sponsor (email + mot de passe)
- Login sécurisé (JWT)
- Association sponsor ↔ vidéos (par club admin)

#### 8.2 Dashboard Sponsor

- Vue ses campagnes uniquement
- Analytics temps réel
- Téléchargement PDF/CSV
- Comparaison périodes

#### 8.3 Permissions

- **Sponsor** : READ ONLY ses vidéos
- **Club Admin** : FULL ACCESS + gestion sponsors
- **NEOPRO Admin** : FULL ACCESS global

**Routes** :

```
https://sponsors.neopro.fr/login
https://sponsors.neopro.fr/dashboard
https://sponsors.neopro.fr/analytics/:sponsorId
https://sponsors.neopro.fr/reports/:sponsorId/pdf
```

**Tables DB** :

```sql
CREATE TABLE sponsor_users (
  id UUID PRIMARY KEY,
  sponsor_id UUID REFERENCES sponsors(id),
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255),
  role VARCHAR(20) DEFAULT 'sponsor_viewer',
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE sponsor_access_logs (
  id UUID PRIMARY KEY,
  sponsor_user_id UUID REFERENCES sponsor_users(id),
  action VARCHAR(50),
  resource VARCHAR(255),
  ip_address INET,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Effort** : 3-4 semaines
**Priorité** : P3 (nice-to-have, pas critique)

---

### 9. API Partenaires OAuth 🟡 **P3**

**Objectif** : Permettre accès API sécurisé pour partenaires externes (agences, sponsors multi-clubs)

**Fonctionnalités** :

#### 9.1 Flux OAuth 2.0

- Authorization Code Grant
- Refresh tokens
- Scopes granulaires

#### 9.2 Scopes Disponibles

- `read:analytics:club` - Lire analytics de ses clubs
- `read:analytics:sponsor` - Lire analytics de ses sponsors
- `read:analytics:aggregate` - Données agrégées multi-clubs
- `write:analytics:audience` - Écrire estimations audience
- `admin:goals` - Gérer objectifs et alertes

#### 9.3 Rate Limiting

- Gratuit : 1,000 requêtes/jour
- Pro : 50,000 requêtes/jour (€49/mois)
- Enterprise : Sur-mesure

#### 9.4 Portail Développeurs

```
https://developers.neopro.fr
- Documentation API
- Gérer applications OAuth
- Clés API
- Usage & monitoring
```

**Tables DB** :

```sql
CREATE TABLE oauth_clients (
  id UUID PRIMARY KEY,
  client_id VARCHAR(255) UNIQUE,
  client_secret_hash VARCHAR(255),
  name VARCHAR(255),
  redirect_uris TEXT[],
  allowed_scopes TEXT[]
);

CREATE TABLE oauth_tokens (
  id UUID PRIMARY KEY,
  client_id UUID REFERENCES oauth_clients(id),
  user_id UUID REFERENCES users(id),
  access_token_hash VARCHAR(255),
  refresh_token_hash VARCHAR(255),
  scopes TEXT[],
  expires_at TIMESTAMP
);

CREATE TABLE api_usage_logs (
  id UUID PRIMARY KEY,
  client_id UUID REFERENCES oauth_clients(id),
  endpoint VARCHAR(255),
  method VARCHAR(10),
  response_time_ms INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Effort** : 4-6 semaines
**Priorité** : P3 (long terme, écosystème)

---

## 🔮 BACKLOG LONG TERME

### 10. Intégrations Billetterie 🔵

**Partenaires visés** :

- Weezevent
- Fnac Spectacles
- Ticketmaster
- Eventbrite

**Objectif** : Audience réelle automatique (pas d'estimation)

**Effort** : 2-3 semaines par intégration

---

### 11. Capteur Présence Hardware 🟡

**Objectif** : Compter spectateurs automatiquement

**Technologies** :

- Caméra + Computer Vision (comptage personnes)
- Capteurs infrarouges (passages entrée)
- WiFi tracking (appareils connectés)

**Effort** : 4-8 semaines (hardware + software)

---

### 12. Analytics Prédictives 🟡

**Objectif** : Prédire performance future avec ML

**Exemples** :

- "Votre engagement va baisser de 15% ce mois-ci si vous ne changez rien"
- "Recommandation : ajouter 3 vidéos ambiance pour optimiser taux complétion"
- "Prédiction uptime : 97% ce mois (risque incident)"

**Tech Stack** :

- TensorFlow.js ou Python (scikit-learn)
- Time-series forecasting
- Anomaly detection

**Effort** : 1-2 mois

---

### 13. Rapports Email Automatiques 🟢

**Objectif** : Envoi automatique mensuel des rapports PDF

**Fonctionnalités** :

- Cron job fin de mois
- Génération PDF automatique
- Envoi email avec pièce jointe
- Liste diffusion configurable

**Service** : Nodemailer + SendGrid/Mailgun

**Effort** : 3-5 jours
**Priorité** : P2 (manque légitime Phase 2 BP)

---

## ❌ FEATURES REJETÉES / EN PAUSE

### ⏸️ Mode Programmation (Playlist Automatique)

**Statut** : En pause - reporté
**Raison** : Non prioritaire pour le MVP. Les utilisateurs utilisent principalement les vidéos manuellement et la boucle partenaires.

**Fonctionnalités prévues** :

- Création de playlists ordonnées de vidéos
- Exécution automatique sans intervention manuelle
- Cas d'usage : rituels avant-match, mi-temps, après-match
- Drag-and-drop pour réordonner les vidéos
- Persistence localStorage

**À reprendre quand** : Feedback utilisateurs demandant cette fonctionnalité

---

### ❌ Publicité Programmatique

**Raison** : Nécessite volume minimum (100+ sites), pas prioritaire Phase actuelle

### ❌ Marketplace Vidéos

**Raison** : Business model pas validé, complexité juridique (droits)

### ❌ Live Streaming Intégré

**Raison** : Hors scope produit actuel, coût infrastructure élevé

---

## 📊 SUIVI DU BACKLOG

### Prochains Sprints

**Sprint Décembre 2025 (2 semaines)** :

- ✅ Rapport PDF Club - **TERMINÉ 15 Déc**
- ✅ Estimation audience UI - **TERMINÉ 15 Déc**
- ✅ Score en live UI télécommande - **TERMINÉ 15 Déc**
- ✅ Télécommande v2 (refonte) - **TERMINÉ 15 Déc**
- ⏳ Overlay score TV - **À faire**
- ⏳ Migration DB production - **À faire**

**Sprint Janvier 2026 (2 semaines)** :

- Objectifs & Alertes
- Benchmark anonymisé
- Rapports email automatiques

**Sprint Février 2026 (2 semaines)** :

- Score en live Phase 2 (API fédérations)
- A/B Testing MVP

**T2 2026** :

- Portail sponsor self-service
- API OAuth partenaires

---

## 📝 NOTES

- Ce backlog est vivant, mis à jour régulièrement
- Les priorités peuvent changer selon feedback clients
- Chaque feature nécessite validation Business avant dev
- Les efforts sont des estimations, à affiner en planning poker

**Dernière mise à jour** : 15 Décembre 2025 14:30
**Prochaine revue backlog** : 31 Décembre 2025

---

## 📚 RÉFÉRENCES

- **STATUS.md** - État complet du projet
- **BUSINESS_PLAN_COMPLET.md** - Business Plan technique
- **IMPLEMENTATION_GUIDE_AUDIENCE_SCORE.md** - Guide implémentation détaillé
- **ROADMAP_10_SUR_10.md** - Plan amélioration qualité code
