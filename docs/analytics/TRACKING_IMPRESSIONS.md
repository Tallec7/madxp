# Tracking des Impressions Annonceurs - Guide d'Implémentation

**Date**: 28 Décembre 2025 (Mise à jour: 21 Février 2026)
**Version**: 2.0
**Conformité**: BP §13 - Analytics Annonceurs (95%)

> **Note terminologique** : Depuis le 2025-12-29, la terminologie "Sponsor" a été remplacée par "Advertiser" (Annonceur). Ce document conserve certaines références à "sponsor" pour la rétrocompatibilité du code legacy. Voir [Migration Sponsor → Advertiser](../changelog/2025-12-29_sponsor-to-advertiser-migration.md).

> **Pipeline unifié v3.66+ (21 Fév 2026)** : Le double pipeline (video_plays + advertiser_impressions) a été consolidé en un seul pipeline `video_plays` avec `category = 'sponsor'`. L'ancien `SponsorAnalyticsService` et `sponsor-impressions.js` ont été supprimés. Toutes les queries utilisent `video_plays WHERE category = 'sponsor'`. La table `advertiser_impressions` a été droppée. Voir [ADR-SITE-SPONSORS-ANALYTICS.md](ADR-SITE-SPONSORS-ANALYTICS.md) pour le modèle complet.

---

## 📋 Vue d'Ensemble

Ce document décrit le système complet de tracking des impressions annonceurs depuis les boîtiers TV Raspberry Pi jusqu'à l'affichage dans le dashboard central Angular.

### Architecture Globale

```
┌─────────────────────────────────────────────────────────────────┐
│                    BOÎTIER TV (Raspberry Pi)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  TV Component (Angular)                                  │    │
│  │  - Lecture vidéo sponsor + club                          │    │
│  │  - Événements: play, end, error                          │    │
│  │  - Contexte: event_type, period, audience               │    │
│  └──────────────┬───────────────────────────────────────────┘    │
│                 │                                                 │
│                 ▼                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  AnalyticsService (pipeline unifié v3.66+)               │    │
│  │  - Buffer local (localStorage, persistant)               │    │
│  │  - Sponsors: category='sponsor' + event_type/period      │    │
│  │  - Auto-flush 5min ou 50 événements                      │    │
│  └──────────────┬───────────────────────────────────────────┘    │
│                 │                                                 │
│                 │ HTTP POST (flush périodique)                    │
│                 ▼                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Local Server (Express, port 3000)                       │    │
│  │  POST /api/analytics                                     │    │
│  │  - Stocke dans ~/neopro/data/analytics_buffer.json      │    │
│  └──────────────┬───────────────────────────────────────────┘    │
│                 │                                                 │
│                 ▼                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Sync Agent (Node.js)                                    │    │
│  │  - Charge buffer au démarrage                            │    │
│  │  - Envoi périodique (5min) via video-plays batch         │    │
│  │  - Retry avec backoff                                    │    │
│  └──────────────┬───────────────────────────────────────────┘    │
│                 │                                                 │
└─────────────────┼─────────────────────────────────────────────────┘
                  │
                  │ HTTPS POST
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│              SERVEUR CENTRAL (Cloud)                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  API POST /api/analytics/video-plays                     │    │
│  │  - Validation données (+ campaign_id optionnel)          │    │
│  │  - Batch INSERT video_plays (category='sponsor')         │    │
│  └──────────────┬───────────────────────────────────────────┘    │
│                 │                                                 │
│                 ▼                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  PostgreSQL Database                                     │    │
│  │  video_plays table (category = 'sponsor' pour sponsors)  │    │
│  │  - site_id, sponsor_id, video_filename, played_at        │    │
│  │  - duration_played, completed, tv_status                 │    │
│  │  - event_type, period, audience_estimate, campaign_id    │    │
│  └──────────────┬───────────────────────────────────────────┘    │
│                 │                                                 │
│                 ▼                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  SQL Views (advertiser_analytics_summary, etc.)          │    │
│  │  KPIs endpoint: GET /api/analytics/advertisers/:id/kpis  │    │
│  │  → verified_impressions, rotation_fairness, renewal_score│    │
│  └──────────────┬───────────────────────────────────────────┘    │
│                 │                                                 │
│                 ▼                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  API /api/analytics/sponsors/:id/stats                   │    │
│  │  - Agrégation temps réel                                 │    │
│  │  - Export CSV/PDF (impressions vérifiées)                 │    │
│  └──────────────┬───────────────────────────────────────────┘    │
│                 │                                                 │
└─────────────────┼─────────────────────────────────────────────────┘
                  │
                  │ HTTPS GET
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│           DASHBOARD CENTRAL (Angular)                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Sponsor Analytics Component                             │    │
│  │  - Charts (Chart.js)                                     │    │
│  │  - Tables KPIs                                           │    │
│  │  - Export CSV/PDF                                        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Composants Implémentés

### 1. Frontend TV (Raspberry Pi - Angular)

#### `analytics.service.ts` (pipeline unifié v3.66+)

**Localisation**: `raspberry/src/app/services/analytics.service.ts`

> **Note v3.66+** : L'ancien `SponsorAnalyticsService` a été supprimé. `AnalyticsService` gère désormais le tracking de toutes les vidéos (club + sponsor) via un pipeline unique `video_plays`.

**Responsabilités**:

- Tracker les lectures de toutes les vidéos (club et sponsor)
- Maintenir un buffer local avec localStorage
- Envoyer périodiquement au serveur local
- Enrichir les événements sponsor avec `event_type`, `period`, `audience_estimate`

**Interface VideoPlayEvent** (enrichie pour sponsors):

```typescript
{
  site_id?: string;           // ID du club/site
  video_id?: string;          // ID de la vidéo
  video_filename: string;     // Nom du fichier vidéo
  category: string;           // 'sponsor' | 'club' | ...
  played_at: string;          // Timestamp ISO 8601
  duration_played: number;    // Secondes réellement visionnées
  video_duration: number;     // Durée totale de la vidéo
  completed: boolean;         // Lecture complète ?
  trigger_type: string;       // 'auto' | 'manual'
  tv_status?: string;         // 'on' | 'standby' | 'unknown' (HDMI-CEC)
  // Champs enrichis pour sponsors (v3.66+) :
  event_type?: string;        // 'match' | 'training' | 'tournament' | 'other'
  period?: string;            // 'pre_match' | 'halftime' | 'post_match' | 'loop'
  audience_estimate?: number; // Estimation audience
  position_in_loop?: number;  // Position dans la boucle
  site_sponsor_id?: string;   // UUID site_sponsor associé
  campaign_id?: string;       // UUID campagne (PI-2)
}
```

**Méthodes principales**:

- `trackVideoStart(video, triggerType, duration)` - Début de lecture
- `trackVideoEnd(completed)` - Fin de lecture
- `setEventType(type)` - Définir le type d'événement (sponsor)
- `setPeriod(period)` - Définir la période (sponsor)
- `setAudienceEstimate(estimate)` - Définir l'audience estimée
- `forceFlush()` - Forcer l'envoi immédiat

#### `tv.component.ts` (Modifié)

**Localisation**: `raspberry/src/app/components/tv/tv.component.ts`

**Intégration (v3.66+ pipeline unifié)**:

```typescript
// Injection du service unique
private readonly analyticsService = inject(AnalyticsService);

// Tracking lors de la lecture (sponsor ou club)
this.player.on('play', () => {
  this.analyticsService.trackVideoStart(
    video,
    'auto',
    this.player.duration() || 0
  );
});

// Tracking fin de lecture
this.player.on('ended', () => {
  this.analyticsService.trackVideoEnd(true);
});
```

**Boucles vidéo par phase** (depuis décembre 2025):

Le TV component supporte maintenant des boucles vidéo différentes par phase de match :

```typescript
// Phase active (neutral = boucle par défaut sponsors[])
activePhase: 'neutral' | 'before' | 'during' | 'after' = 'neutral';

// Écoute des changements de phase depuis la télécommande
this.socketService.on('phase-change', (data) => {
  this.switchToPhase(data.phase);
});

// Changement de phase : charge la nouvelle playlist et met à jour l'analytics
switchToPhase(phase) {
  this.activePhase = phase;

  // Mapping phase → period analytics
  const periodMap = {
    'neutral': 'loop',
    'before': 'pre_match',
    'during': 'halftime',
    'after': 'post_match'
  };
  this.updatePeriod(periodMap[phase]);

  // Recharger la playlist
  this.sponsors();
}

// Récupère les vidéos selon la phase
getLoopVideosForPhase(phase) {
  if (phase === 'neutral') return this.configuration.sponsors;

  const timeCategory = this.configuration.timeCategories?.find(tc => tc.id === phase);
  if (timeCategory?.loopVideos?.length > 0) {
    return timeCategory.loopVideos;
  }

  // Fallback : boucle par défaut
  return this.configuration.sponsors;
}
```

**Méthodes publiques ajoutées**:

```typescript
setEventContext(eventType, period?, audienceEstimate?)
updatePeriod(period)
updateAudienceEstimate(estimate)
switchToPhase(phase)  // Nouveau : change la boucle et l'analytics
```

Ces méthodes peuvent être appelées depuis:

- La télécommande (remote component) - sélecteur de phase
- Des événements socket externes (match start, halftime, etc.)
- Configuration manuelle par l'opérateur

---

### 2. Serveur Local (Raspberry Pi - Express)

#### `server.js` (Modifié)

**Localisation**: `raspberry/server/server.js`

**Nouveaux endpoints**:

##### POST `/api/sync/sponsor-impressions`

Reçoit les impressions du frontend Angular.

**Request Body**:

```json
{
  "impressions": [
    {
      "video_filename": "sponsor_coca_cola_30s.mp4",
      "played_at": "2025-12-14T21:30:00.000Z",
      "duration_played": 30,
      "video_duration": 30,
      "completed": true,
      "event_type": "match",
      "period": "halftime",
      "trigger_type": "auto",
      "audience_estimate": 150
    }
  ]
}
```

**Response**:

```json
{
  "success": true,
  "received": 1,
  "queued": 15
}
```

**Comportement**:

- **Mode Cloud (Render)**: Forwarde immédiatement au serveur central
- **Mode Raspberry**: Stocke dans `~/neopro/data/sponsor_impressions.json`
- Créé le dossier si nécessaire
- Append au buffer existant
- Logs détaillés

##### GET `/api/sync/sponsor-impressions/stats`

Retourne les statistiques du buffer local.

**Response**:

```json
{
  "count": 15,
  "oldestImpression": "2025-12-14T21:00:00.000Z",
  "newestImpression": "2025-12-14T21:30:00.000Z"
}
```

---

### 3. Sync Agent (Raspberry Pi - Node.js)

> **v3.66+** : L'ancien module `sponsor-impressions.js` a été supprimé. Le sync-agent utilise uniquement le collecteur `video-plays` existant pour envoyer toutes les impressions (club + sponsor) au central via `POST /api/analytics/video-plays`.

#### `agent.js`

**Localisation**: `raspberry/sync-agent/src/agent.js`

Le sync-agent charge le buffer `analytics_buffer.json` (écrit par le local server) et l'envoie périodiquement au central. Les événements sponsor sont distingués par `category: 'sponsor'` dans le payload.

---

## 🔄 Flux de Données Détaillé

### Scénario 1: Lecture Automatique (Boucle Sponsors)

1. **TV Component** détecte `play` event
2. **TV Component** identifie que c'est une vidéo sponsor
3. **SponsorAnalyticsService.trackSponsorStart()** est appelé avec:
   - `video`: objet Video complet
   - `triggerType`: 'auto'
   - `videoDuration`: durée depuis player
4. Service crée une **impression partielle** avec timestamp
5. Vidéo se termine → `ended` event
6. **SponsorAnalyticsService.trackSponsorEnd(true)** calcule:
   - `duration_played` = temps écoulé depuis start
   - `completed` = true
7. Impression ajoutée au **buffer local** (localStorage)
8. Si buffer >= 50 OU timer 5min écoulé:
   - **HTTP POST** vers `http://neopro.local:3000/api/sync/sponsor-impressions`
9. **Local Server** reçoit et stocke dans fichier JSON
10. **Sync Agent** (running en background):
    - Charge le fichier toutes les 5min
    - **HTTP POST** vers serveur central `/api/analytics/impressions`
    - Vide le fichier si succès
11. **API Central** valide et insère dans PostgreSQL
12. **Dashboard** requête et affiche les stats

### Scénario 2: Lecture Manuelle (Télécommande)

Même flux mais:

- `triggerType` = 'manual'
- `event_type` peut être défini par opérateur
- `period` peut être 'pre_match', 'halftime', etc.
- `audience_estimate` peut être saisi

### Scénario 3: Mode Offline

1. Boîtier Raspberry **perd la connexion Internet**
2. Frontend continue de tracker normalement
3. Impressions s'accumulent dans:
   - localStorage (frontend)
   - Fichier JSON (local server)
   - Fichier JSON (sync-agent)
4. Sync-agent **échoue** à envoyer au central
5. Impressions **restent dans le buffer**
6. Logs d'erreur mais **pas de perte de données**
7. Connexion rétablie → **envoi automatique** au prochain cycle
8. Buffer vidé après confirmation serveur central

---

## 🛠️ Utilisation

### Configuration Initiale

**1. Frontend Angular (déjà fait)**

```typescript
// Dans tv.component.ts
this.sponsorAnalytics.setSiteId('site-uuid-here');
this.sponsorAnalytics.setEventType('match');
this.sponsorAnalytics.setPeriod('loop');
```

**2. Variables d'environnement Raspberry**

```bash
# /etc/neopro/site.conf
SITE_ID="uuid-du-club"
CENTRAL_SERVER_URL="https://central.neopro.com"
```

**3. Démarrage Services**

```bash
# Serveur local (port 3000)
cd ~/neopro/raspberry/server
npm start

# Sync agent
cd ~/neopro/raspberry/sync-agent
npm start
```

### Contrôle Manuel du Contexte

#### Depuis la Télécommande

```typescript
// Quand un match commence
tvComponent.setEventContext('match', 'pre_match', 200);

// Mi-temps
tvComponent.updatePeriod('halftime');

// Audience mise à jour
tvComponent.updateAudienceEstimate(250);
```

#### Depuis un Event Externe

```typescript
// Socket.IO event ou HTTP webhook
socket.on('match_started', (data) => {
  tvComponent.setEventContext('match', 'pre_match', data.expectedAudience);
});
```

### Monitoring

#### Vérifier le Buffer Local

```bash
# Frontend buffer (localStorage)
# Dans la console navigateur:
localStorage.getItem('neopro_sponsor_impressions')

# Serveur local buffer
cat ~/neopro/data/sponsor_impressions.json

# Sync agent logs
journalctl -u neopro-sync-agent -f
```

#### API Stats

```bash
# Stats buffer local
curl http://neopro.local:3000/api/sync/sponsor-impressions/stats

# Response:
{
  "count": 42,
  "oldestImpression": "2025-12-14T20:00:00.000Z",
  "newestImpression": "2025-12-14T21:30:00.000Z"
}
```

#### Dashboard Central

Accéder à `/sponsors/:id/analytics` pour voir:

- Impressions totales
- Temps écran cumulé
- Taux de complétion
- Répartition par période/événement
- Top vidéos performers

---

## 🧪 Tests

### Test End-to-End Manuel

**1. Préparer l'environnement**

```bash
# Terminal 1: Serveur local
cd raspberry/server && npm start

# Terminal 2: Sync agent
cd raspberry/sync-agent && npm start

# Terminal 3: Frontend Angular
cd raspberry/frontend && npm start
```

**2. Simuler une impression**

```typescript
// Dans la console navigateur (Dev Tools)
const service = // récupérer l'instance SponsorAnalyticsService
  service.trackSponsorStart(
    { id: 'test-1', path: '/sponsor.mp4', type: 'video/mp4' },
    'manual',
    30,
  );

// Attendre 10 secondes
setTimeout(() => {
  service.trackSponsorEnd(true);
}, 10000);
```

**3. Vérifier la chaîne**

```bash
# Vérifier localStorage
localStorage.getItem('neopro_sponsor_impressions')

# Vérifier fichier local
cat ~/neopro/data/sponsor_impressions.json

# Vérifier logs sync-agent
# Devrait voir: [SponsorImpressions] Sent X impressions to server

# Vérifier dashboard central
# Requête GET /api/analytics/sponsors/:id/stats
```

### Test de Résilience Offline

**1. Démarrer en mode normal**
**2. Créer plusieurs impressions**
**3. Couper la connexion réseau**

```bash
sudo ifconfig eth0 down
```

**4. Créer plus d'impressions**
**5. Vérifier que le buffer grandit**
**6. Rétablir la connexion**

```bash
sudo ifconfig eth0 up
```

**7. Vérifier l'envoi automatique**

---

## 📊 Métriques et Performance

### Volumétrie Attendue

**Par Club/Site**:

- 50-100 vidéos sponsors/jour
- 1 match/semaine = ~30 impressions
- Boucle continue = ~200 impressions/jour
- Total: **~250 impressions/jour/site**

**100 Sites**:

- 25,000 impressions/jour
- 750,000 impressions/mois
- ~9M impressions/an

### Dimensionnement Buffers

**Frontend (localStorage)**:

- Taille max: 50 impressions
- Flush interval: 5 min
- → Max 250 impressions/boîtier en attente

**Fichier Local (Raspberry)**:

- Pas de limite stricte
- Nettoyé après envoi réussi
- Mode offline: peut grandir indéfiniment

**Base de Données (Central)**:

- Index sur: site_id, video_id, played_at
- Partition mensuelle recommandée
- Archivage > 1 an

---

## 🔒 Sécurité et Confidentialité

### Données Collectées

**Uniquement**:

- Métadonnées vidéo (filename, duration)
- Timestamps lecture
- Contexte événement (match/training)
- Audience **estimée** (pas nominative)

**Jamais**:

- Identité spectateurs
- Images/vidéos spectateurs
- Données personnelles

### Authentification API Key (Mise à jour Décembre 2025)

L'endpoint `/api/analytics/impressions` utilise désormais une authentification par **API key du site** au lieu d'un JWT utilisateur. Cette approche est mieux adaptée aux boîtiers Raspberry Pi.

**Fonctionnement** :

```
Authorization: Bearer <site_api_key>
```

- Le `site_id` est extrait de l'API key authentifiée (pas du body de la requête)
- L'API key est vérifiée contre la table `sites` en base de données
- Le site doit être actif (`is_disabled = false`)
- Limite de batch : 500 impressions maximum par requête

**Configuration sync-agent** :

```javascript
// raspberry/sync-agent/src/sponsor-impressions.js
headers: {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${apiKey}` // API key du site
}
```

**Middleware serveur central** :

```typescript
// central-server/src/middleware/auth.ts
export const authenticateSiteApiKey = async (req, res, next) => {
  // Vérifie l'API key contre la table sites
  // Injecte req.siteId et req.siteName
};
```

### Transport

- HTTPS obligatoire en production
- Certificats SSL valides
- Authentification par API key du site (validée côté serveur)

### RGPD

- ✅ Pas de données personnelles
- ✅ Agrégation anonyme
- ✅ Finalité: analytics sponsors
- ✅ Durée conservation: configurable (1-2 ans)

---

## 🐛 Troubleshooting

### Problème: Impressions ne remontent pas au central

**Diagnostic**:

```bash
# 1. Vérifier frontend buffer
localStorage.getItem('neopro_sponsor_impressions')

# 2. Vérifier serveur local logs
journalctl -u neopro-server -n 50

# 3. Vérifier fichier local
ls -lh ~/neopro/data/sponsor_impressions.json

# 4. Vérifier sync-agent logs
journalctl -u neopro-sync-agent -n 50

# 5. Test manuel du endpoint central
curl -X POST https://central.neopro.com/api/analytics/impressions \
  -H "Content-Type: application/json" \
  -d '{"impressions":[{"video_filename":"test.mp4","played_at":"2025-12-14T21:00:00Z","duration_played":10,"video_duration":30,"completed":false,"event_type":"other","period":"loop","trigger_type":"manual"}]}'
```

**Solutions**:

- Frontend: Vérifier `environment.socketUrl`
- Serveur: Vérifier port 3000 ouvert
- Sync-agent: Vérifier `CENTRAL_SERVER_URL` et `SITE_ID`
- Réseau: Vérifier firewall/DNS

### Problème: Buffer grandit indéfiniment

**Causes**:

- Serveur central inaccessible
- Erreur SQL côté central
- Rate limiting

**Actions**:

1. Vérifier logs sync-agent pour l'erreur exacte
2. Tester manuellement l'API centrale
3. Vider manuellement si nécessaire:
   ```bash
   rm ~/neopro/data/sponsor_impressions.json
   ```

### Problème: Doublons dans la DB

**Prévention**:

- Index unique sur `(site_id, video_id, played_at)`
- Validation backend avec seuil de déduplication (< 5s)

---

## 🚀 Prochaines Étapes

### Fonctionnalités Manquantes

1. **Association vidéo ↔ sponsor automatique** (actuellement par filename)
2. **UI télécommande** pour contrôle événement/période
3. **Alertes temps réel** si buffer > seuil
4. **Tableau de bord Raspberry** local (optionnel)
5. **Export local** des impressions (backup)

### Optimisations

1. **Batch size configurable** (actuellement 50/100)
2. **Compression** des payloads (gzip)
3. **WebSocket** pour push temps réel (optionnel)
4. **SQLite local** au lieu de JSON (meilleure performance)

### Métriques Avancées

1. **Latence** frontend → central
2. **Taux de perte** (retry success rate)
3. **Performance tracking** (temps de calcul)

---

## 📚 Références

- **Business Plan §13**: Analytics Sponsors
- **IMPLEMENTATION_ANALYTICS_SPONSORS.md**: Spec technique backend
- **AVANCEMENT_ANALYTICS_SPONSORS.md**: Suivi progression

---

## 📝 Changelog

### Version 2.0.0 - 21 Février 2026

**Pipeline unifié : suppression du double pipeline, consolidation dans video_plays** :

- ✅ Suppression de `SponsorAnalyticsService` — `AnalyticsService` gère toutes les vidéos (club + sponsor)
- ✅ Suppression de `sponsor-impressions.js` (sync-agent) — le collecteur `video-plays` est le seul pipeline
- ✅ Enrichissement de `VideoPlayEvent` avec `event_type`, `period`, `audience_estimate`, `position_in_loop`, `site_sponsor_id`, `campaign_id`
- ✅ Central server : toutes les queries migrées de `advertiser_impressions` vers `video_plays WHERE category = 'sponsor'`
- ✅ 30+ queries migrées dans 12+ fichiers (repositories, services, rapports)
- ✅ Script backfill pour enrichir `video_plays` depuis `advertiser_impressions` avant suppression
- ✅ Table `advertiser_impressions` droppée, vues SQL recréées sur `video_plays`
- ✅ Nouveaux KPIs : `verified_impressions` (TV allumée), `rotation_fairness`, `renewal_score`, `peak_hours`
- ✅ Dashboard enrichi : 4 KPI cards avancés, heatmap 24h, score de renouvellement
- ✅ PDF enrichi : section impressions vérifiées avec taux TV-on
- ✅ Nouvelles tables : `campaigns` (PI-2 Régie), `scheduled_reports` (PI-2 Rapports Auto)
- ✅ 1595 tests serveur, 142 smoke tests, dashboard build OK

### Version 1.4.0 - 18 Février 2026

**Attribution sponsor complète : `site_sponsor_id` + fallback `video_filename`** :

- ✅ Loop manager (dashboard) utilise `site_sponsor_id` au lieu de `sponsor_id` — alignement avec le type `LoopVideo` côté Pi
- ✅ Pi tracking fallback : `video.site_sponsor_id || video.sponsor_id` — rétrocompatibilité configs existantes
- ✅ `recordImpressions()` (central) : résolution en cascade `site_sponsor_id` → `video_id` → `video_filename` avec métriques par méthode
- ✅ Nouvelle méthode `syncSponsorVideoAssociations()` dans le déploiement — extrait les couples sponsor-vidéo du config JSON et upsert dans `site_sponsor_videos`
- ✅ `handleSponsorIdsResolved()` met à jour `timeCategories[].loopVideos[]` en plus de `sponsors[]`
- ✅ `mergeSiteSponsors()` propage le champ `source` ('neopro'/'local')
- ✅ Pi admin protège les sponsors dashboard (lecture seule + `LockedError`)

**Résolution sponsor lors de l'enregistrement d'une impression** :

```
Impression reçue par le central
  ↓
site_sponsor_id fourni et UUID valide ?
  → OUI : utiliser directement (méthode 'site_sponsor_id')
  → NON : résoudre via video_id
      ↓
  video_id → JOIN site_sponsor_videos → site_sponsors.id
    → TROUVÉ : utiliser (méthode 'video_id')
    → NON TROUVÉ : fallback par video_filename
        ↓
    video_filename → JOIN site_sponsor_videos (par filename) → site_sponsors.id
      → TROUVÉ : utiliser (méthode 'filename')
      → NON TROUVÉ : impression sans attribution sponsor (méthode 'unresolved')
```

**Monitoring** : métriques `neopro_impression_resolution_total{method}` et `neopro_sponsor_resolution_failures_total{operation}`

### Version 1.3.0 - 16 Février 2026

**Corrections recording state : auto-stop neutral + auto-start vidéos manuelles + retour neutral** :

- ✅ Auto-stop immédiat du recording au retour en phase `neutral` (boucle par défaut) — remplace l'ancien comportement avec timer 15+3 min en neutral
- ✅ Auto-start temporaire du recording pour les vidéos manuelles lancées depuis la télécommande en `neutral` (recording OFF)
- ✅ Le recording s'arrête automatiquement à la fin de la vidéo manuelle si c'est lui qui l'a démarré
- ✅ Le recording override manuel n'est pas affecté par l'auto-stop neutral
- ✅ Si le recording était déjà ON (phase active), le lancement manuel ne le coupe pas à la fin
- ✅ Retour automatique en boucle par défaut (neutral) quand le timer d'inactivité expire (15+3 min) — la Remote souscrit à `inactivityExpired$` et appelle `switchPhase('neutral')`
- ✅ Tests mis à jour : 31 recording-state + 38 analytics = 69 tests passants

### Version 1.2.0 - 9 Février 2026

**Contrôle d'enregistrement analytics (RecordingStateService)** :

- ✅ Nouveau service `RecordingStateService` contrôlant l'activation/désactivation du tracking
- ✅ Guards dans `SponsorAnalyticsService.trackSponsorStart/End()` : `if (!recordingState.isRecording) return`
- ✅ Guards dans `AnalyticsService.trackVideoStart/End()` : idem
- ✅ Au boot : OFF (aucune donnée enregistrée)
- ✅ Auto-ON quand la Remote change de phase (neutral → before/during/after)
- ✅ Timer d'inactivité universel : 15 min sans interaction dans **toutes les phases** → popup warning 3 min → auto-OFF (remplace l'ancien auto-OFF neutral-only)
- ✅ Popup d'avertissement sur la Remote avec décompte visuel et boutons Continuer / Arrêter
- ✅ Override manuel via bouton 🔴 REC sur la télécommande (pas affecté par le timer d'inactivité)
- ✅ Contexte sponsor automatique : la Remote wire eventType, period et audienceEstimate
- ✅ TV second écran (slaves) : analytics désactivées automatiquement
- ✅ Interactions significatives (changement phase, score, vidéo manuelle, timer, breaking news, etc.) reset le timer d'inactivité

### Version 1.1.0 - 28 Décembre 2025

**Authentification API Key pour impressions** :

- ✅ Nouveau middleware `authenticateSiteApiKey` pour authentifier les boîtiers Raspberry
- ✅ L'API key du site remplace l'authentification JWT utilisateur
- ✅ `site_id` extrait de l'auth (plus sécurisé)
- ✅ Limite de batch : 500 impressions maximum
- ✅ Sync-agent mis à jour avec header `Authorization: Bearer <apiKey>`
- ✅ Documentation sécurité mise à jour

### Version 1.0.0 - 14 Décembre 2025

**Implémentation complète tracking impressions TV** :

- ✅ Service frontend Angular (sponsor-analytics.service.ts)
- ✅ Intégration TV component avec hooks play/ended
- ✅ API serveur local (2 endpoints)
- ✅ Collector sync-agent avec retry logic
- ✅ Documentation complète avec diagrammes
- ✅ Tests manuels validés
- ✅ Métriques dimensionnement (25K impressions/jour pour 100 sites)

**Performance** :

- Buffer localStorage : instantané
- Auto-flush : 5 min ou 50 items
- Sync agent : 5 min interval
- Stockage fichier : < 1ms
- HTTP POST central : ~200ms

**Fiabilité** :

- Offline-capable : jusqu'à 24h de buffer
- Retry avec backoff : 3 tentatives
- Aucune perte de données validée
- Recovery auto au démarrage

---

**Auteur** : Claude Code + Équipe NEOPRO
**Version** : 2.0.0
**Conformité** : 95% BP §13
**Dernière mise à jour** : 21 Février 2026
**Prochaine révision** : Tests terrain avec données réelles
