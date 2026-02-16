# Module Analytics Sponsors - Documentation Complète

## 📋 Table des Matières

1. [Vue d'ensemble](#vue-densemble)
2. [Architecture](#architecture)
3. [Guides de démarrage rapide](#guides-de-démarrage-rapide)
4. [Documentation détaillée](#documentation-détaillée)
5. [État du projet](#état-du-projet)

---

## Vue d'ensemble

Le module **Analytics Sponsors** permet aux clubs sportifs de mesurer précisément la visibilité de leurs sponsors et de générer des rapports professionnels automatisés.

### Fonctionnalités principales

✅ **Dashboard Analytics Web** (Angular)

- Interface CRUD complète pour gérer les sponsors
- Visualisations Chart.js temps réel (tendances, répartitions)
- KPIs clés : impressions, temps d'écran, taux de complétion, audience
- Export CSV et PDF des données

✅ **Tracking Automatique depuis Boîtiers TV**

- Capture des impressions vidéo sponsors en temps réel
- Buffer local avec auto-flush (offline-capable)
- Synchronisation périodique vers serveur central
- Support contexte événementiel (match, entraînement, tournoi)
- **Contrôle recording** (v3.38+) : le tracking n'est actif que si `RecordingStateService.isRecording === true` — auto-ON en phase match, auto-OFF au retour en neutral, auto-start temporaire pour vidéos manuelles, auto-return en neutral après 15+3 min d'inactivité

✅ **Rapports PDF Professionnels**

- Génération PDF 4 pages avec graphiques Chart.js
- Mise en page professionnelle (charte NEOPRO)
- Certificat de diffusion avec signature numérique SHA-256
- Support multilingue (FR/EN)

### Conformité Business Plan

**98% de conformité avec BP §13** - Référence Analytics Sponsors

| Composant          | État         | Conformité |
| ------------------ | ------------ | ---------- |
| Backend API        | ✅ Complete  | 100%       |
| Frontend Dashboard | ✅ Complete  | 100%       |
| Tracking TV        | ✅ Complete  | 100%       |
| PDF Graphiques     | ✅ Complete  | 100%       |
| Tests automatisés  | ✅ Complete  | 100%       |
| Tests E2E          | ⏳ Optionnel | 0%         |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    NEOPRO ANALYTICS SPONSORS                         │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────┐         ┌──────────────────┐         ┌──────────────┐
│  TV Component    │────────▶│  Local Server    │────────▶│  Sync Agent  │
│  (Angular)       │  HTTP   │  (Express)       │  Cron   │  (Node.js)   │
│                  │         │  Port 3000       │         │              │
└──────────────────┘         └──────────────────┘         └──────────────┘
        │                             │                            │
        │ WebSocket                   │ JSON File                  │ HTTP
        │                             │ Buffer                     │
        ▼                             ▼                            ▼
┌──────────────────┐         ┌──────────────────┐         ┌──────────────┐
│  TV Display      │         │  sponsor_        │         │  Central     │
│  (VideoJS)       │         │  impressions.json│         │  Server API  │
└──────────────────┘         └──────────────────┘         └──────────────┘
                                                                   │
                                                                   ▼
                                                         ┌──────────────────┐
                                                         │  PostgreSQL DB   │
                                                         │  - sponsors      │
                                                         │  - impressions   │
                                                         │  - daily_stats   │
                                                         └──────────────────┘
                                                                   │
                                                                   ▼
                                                         ┌──────────────────┐
                                                         │  Dashboard Web   │
                                                         │  (Angular 20)    │
                                                         │  + Chart.js v4   │
                                                         └──────────────────┘
                                                                   │
                                                                   ▼
                                                         ┌──────────────────┐
                                                         │  PDF Reports     │
                                                         │  (PDFKit +       │
                                                         │   Chart.js)      │
                                                         └──────────────────┘
```

### Composants

1. **Backend (central-server)**
   - API REST (12 endpoints)
   - PostgreSQL (4 tables, 3 vues, 2 fonctions PL/pgSQL)
   - Service PDF avec graphiques

2. **Frontend Dashboard (central-dashboard)**
   - 4 composants Angular standalone
   - Chart.js v4 pour visualisations
   - Export CSV/PDF

3. **Frontend TV (raspberry/frontend)**
   - Service tracking impressions
   - Buffer localStorage avec retry
   - Auto-flush configurable
   - **Récupération automatique du site_id** via `/api/site-info`

4. **Serveur Local (raspberry/server)**
   - 2 endpoints API impressions
   - Stockage JSON local
   - Forward cloud automatique
   - **Endpoint `/api/site-info`** : expose le site_id pour les analytics

5. **Sync Agent (raspberry/sync-agent)**
   - Collecteur impressions
   - Envoi périodique (5min)
   - Retry avec backoff

---

## Guides de démarrage rapide

### Pour les développeurs

#### 1. Backend Central Server

```bash
cd central-server

# Installation
npm install

# Configuration DB
cp .env.example .env
# Éditer .env avec vos credentials PostgreSQL

# Créer les tables
psql -U postgres -d neopro -f src/scripts/sponsor-analytics-tables.sql

# Build & Run
npm run build
npm start

# API disponible sur http://localhost:4000
```

#### 2. Frontend Dashboard

```bash
cd central-dashboard

# Installation
npm install

# Dev mode
npm start

# Build production
npm run build

# Dashboard disponible sur http://localhost:4200/sponsors
```

#### 3. Raspberry Pi (Boîtier TV)

```bash
cd raspberry

# Installer sync-agent
cd sync-agent
npm install
npm start

# Installer serveur local
cd ../server
npm install
npm start

# Frontend Angular
cd ../frontend
npm install
npm start
```

### Pour les administrateurs

1. **Créer un sponsor** : Dashboard → Sponsors → Bouton "+"
2. **Associer des vidéos** : Sponsor détail → Onglet Vidéos → Bouton "Ajouter"
3. **Voir analytics** : Sponsor détail → Onglet Analytics
4. **Télécharger rapport PDF** : Analytics → Bouton "Télécharger PDF"

---

## Documentation détaillée

### Documentation technique

| Document                                                                     | Description                       | Audience             |
| ---------------------------------------------------------------------------- | --------------------------------- | -------------------- |
| [IMPLEMENTATION_ANALYTICS_SPONSORS.md](IMPLEMENTATION_ANALYTICS_SPONSORS.md) | Guide d'implémentation complet    | Développeurs         |
| [TRACKING_IMPRESSIONS_SPONSORS.md](TRACKING_IMPRESSIONS_SPONSORS.md)         | Architecture tracking boîtiers TV | Développeurs backend |
| [PDF_REPORTS_GUIDE.md](PDF_REPORTS_GUIDE.md)                                 | Génération rapports PDF           | Développeurs backend |
| [AVANCEMENT_ANALYTICS_SPONSORS.md](AVANCEMENT_ANALYTICS_SPONSORS.md)         | Suivi progression projet          | Chef de projet       |

### Schéma base de données

```sql
-- Table sponsors
CREATE TABLE sponsors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  logo_url TEXT,
  contact_email VARCHAR(255),
  contract_start DATE,
  contract_end DATE,
  status VARCHAR(50) DEFAULT 'active',
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Table sponsor_videos (association many-to-many)
CREATE TABLE sponsor_videos (
  sponsor_id UUID REFERENCES sponsors(id),
  video_id UUID REFERENCES videos(id),
  priority INTEGER DEFAULT 0,
  PRIMARY KEY (sponsor_id, video_id)
);

-- Table sponsor_impressions (données brutes)
CREATE TABLE sponsor_impressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL,
  video_id UUID NOT NULL,
  played_at TIMESTAMP NOT NULL,
  duration_played INTEGER,
  video_duration INTEGER,
  completed BOOLEAN DEFAULT false,
  event_type VARCHAR(50),
  period VARCHAR(50),
  trigger_type VARCHAR(20),
  audience_estimate INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Table sponsor_daily_stats (agrégation quotidienne)
CREATE TABLE sponsor_daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_id UUID REFERENCES sponsors(id),
  date DATE NOT NULL,
  total_impressions INTEGER,
  total_screen_time INTEGER,
  completion_rate NUMERIC(5,2),
  unique_sites INTEGER,
  estimated_reach INTEGER,
  UNIQUE(sponsor_id, date)
);
```

### API Endpoints

**CRUD Sponsors**

```http
GET    /api/sponsors              # Liste tous les sponsors
GET    /api/sponsors/:id          # Détail d'un sponsor
POST   /api/sponsors              # Créer un sponsor
PUT    /api/sponsors/:id          # Modifier un sponsor
DELETE /api/sponsors/:id          # Supprimer un sponsor
```

**Associations Vidéos**

```http
POST   /api/sponsors/:id/videos           # Associer des vidéos
DELETE /api/sponsors/:id/videos/:videoId  # Dissocier une vidéo
```

**Analytics**

```http
GET /api/sponsors/:id/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD
GET /api/sponsors/:id/videos/stats
GET /api/sponsors/:id/sites/performance
```

**Export**

```http
GET /api/sponsors/:id/export/csv?from=...&to=...
GET /api/sponsors/:id/report?from=...&to=...&signature=true
```

**Recording**

```http
POST /api/analytics/impressions
POST /api/sponsors/calculate-daily-stats
```

### Formats de données

**SponsorImpression**

```typescript
interface SponsorImpression {
  site_id?: string;
  video_id?: string;
  video_filename: string;
  played_at: string; // ISO 8601
  duration_played: number; // secondes
  video_duration: number; // secondes
  completed: boolean;
  event_type: 'match' | 'training' | 'tournament' | 'other';
  period: 'pre_match' | 'halftime' | 'post_match' | 'loop';
  trigger_type: 'auto' | 'manual';
  audience_estimate?: number; // nombre de spectateurs
}
```

---

## État du projet

### ✅ Semaine 1 - Backend + Frontend Dashboard (Complété)

**Réalisations** :

- Backend API REST complet (12 endpoints)
- Schéma PostgreSQL (4 tables, 3 vues)
- 4 composants Angular (liste, détail, analytics, vidéos)
- Intégration Chart.js v4
- Export CSV fonctionnel
- Tests manuels réussis

**Conformité** : 80%

### ✅ Semaine 2 - Tracking Boîtiers TV (Complété)

**Réalisations** :

- Service tracking frontend (sponsor-analytics.service.ts)
- Modification TV component avec hooks play/ended
- Endpoints serveur local (/api/sync/sponsor-impressions)
- Collector sync-agent (sponsor-impressions.js)
- Intégration agent.js avec auto-start
- Documentation complète (TRACKING_IMPRESSIONS_SPONSORS.md)

**Conformité** : 90%

### ✅ Semaine 3 - PDF Graphiques (Complété)

**Réalisations** :

- Installation PDFKit + chartjs-node-canvas
- Implémentation pdf-report.service.ts (785 lignes)
- 4 pages PDF professionnelles :
  - Page 1 : Garde avec logo et période
  - Page 2 : 6 KPIs en grille 2x3
  - Page 3 : Graphiques Chart.js (ligne + anneau)
  - Page 4 : Certificat avec signature SHA-256
- Fonctions utilitaires (formatDate, formatNumber, etc.)
- Documentation complète (PDF_REPORTS_GUIDE.md)
- Build TypeScript réussi

**Conformité** : 95%

### ✅ Phase 4 - Tests & Optimisations (Complétée)

**Réalisé** :

- ✅ **39 tests automatisés** (Jest + Supertest)
  - 15 tests unitaires service PDF
  - 24 tests intégration API endpoints
- ✅ **100% de réussite** (39/39 passed)
- ✅ **Documentation complète** (TESTS_ANALYTICS_SPONSORS.md)
- ✅ **CI/CD ready** (GitHub Actions)

**Conformité** : **98%**

**Optimisations (Optionnel Phase 5+)** :

- [ ] Cache Redis pour graphiques
- [ ] Génération asynchrone (Bull/BullMQ)
- [ ] Tests E2E (Cypress)

### 🔮 Semaine 5-6 - Améliorations Enterprise (Optionnel)

**Roadmap** :

- [ ] Upload logos personnalisés (sponsor/club)
- [ ] Rapports multi-sponsors (comparatifs)
- [ ] Templates personnalisables par club
- [ ] Export multi-formats (Excel, PowerPoint)
- [ ] Watermarks personnalisés

---

## Support et contribution

### Bugs et questions

Pour signaler un bug ou poser une question :

1. Consulter [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
2. Vérifier les issues GitHub existantes
3. Créer une nouvelle issue avec :
   - Description du problème
   - Étapes pour reproduire
   - Logs pertinents
   - Environnement (OS, Node version, etc.)

### Tests manuels

Voir [TESTING_GUIDE.md](TESTING_GUIDE.md) pour :

- Procédures de test fonctionnel
- Scénarios de test end-to-end
- Validation des rapports PDF

### Développement

```bash
# Vérifier le build
cd central-server && npm run build
cd central-dashboard && npm run build

# Linter
npm run lint

# Tests (si configurés)
npm test
```

---

## Références

- **Business Plan** : [BUSINESS_PLAN_COMPLET.md](BUSINESS_PLAN_COMPLET.md) §13
- **Architecture** : [SYNC_ARCHITECTURE.md](SYNC_ARCHITECTURE.md)
- **Configuration** : [CONFIGURATION.md](CONFIGURATION.md)
- **Déploiement** : [DEPLOY_CENTRAL_SERVER.md](DEPLOY_CENTRAL_SERVER.md)

---

## Changelog

| Version | Date       | Description                                                                                                 |
| ------- | ---------- | ----------------------------------------------------------------------------------------------------------- |
| 1.3.0   | 2025-12-28 | **Tracking site_id** : Les impressions sponsors incluent désormais le site_id pour une attribution correcte |
| 1.2.0   | 2025-12-20 | Propagation video_id/sponsor_id/analytics_category dans le déploiement et tracking                          |
| 1.1.0   | 2025-12-15 | Phase 4 - Tests automatisés (39 tests) - 98% conformité BP §13                                              |
| 1.0.0   | 2025-12-14 | Release initiale - 95% conformité BP §13                                                                    |
| 0.3.0   | 2025-12-14 | Semaine 3 - PDF graphiques avec Chart.js                                                                    |
| 0.2.0   | 2025-12-14 | Semaine 2 - Tracking boîtiers TV                                                                            |
| 0.1.0   | 2025-12-14 | Semaine 1 - Backend + Frontend dashboard                                                                    |

---

**Dernière mise à jour** : 16 Février 2026
**Mainteneur** : Équipe Développement NEOPRO
**Licence** : Propriétaire
**Contact** : [Voir BUSINESS_PLAN_COMPLET.md pour contacts]
