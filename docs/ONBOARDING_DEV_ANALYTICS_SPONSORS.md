# Guide Onboarding Développeur - Module Analytics Sponsors

**Bienvenue sur le module Analytics Sponsors NEOPRO !**

Ce guide vous permettra de démarrer rapidement sur le projet, que vous soyez nouveau développeur ou que vous repreniez le développement après une pause.

---

## 🎯 Objectif du module

Permettre aux clubs sportifs de **mesurer précisément la visibilité de leurs sponsors** et de **générer des rapports PDF professionnels automatisés** avec graphiques.

### Ce que fait le module

1. **Dashboard Web** : Interface de gestion sponsors avec analytics temps réel
2. **Tracking TV** : Capture automatique impressions vidéos depuis boîtiers
3. **Rapports PDF** : Génération PDF 4 pages avec graphiques Chart.js et certificat numérique

### État actuel

✅ **95% de conformité Business Plan §13**
- Backend API complet (12 endpoints)
- Frontend Dashboard Angular complet
- Tracking boîtiers TV fonctionnel
- Génération PDF avec graphiques
- Documentation complète

---

## 📚 Lecture requise (30-45 min)

### 1. Comprendre le contexte (10 min)

Commencez par ces 2 documents:

1. **[ANALYTICS_SPONSORS_README.md](ANALYTICS_SPONSORS_README.md)** - Vue d'ensemble
   - Fonctionnalités principales
   - Architecture globale
   - État du projet

2. **[BUSINESS_PLAN_COMPLET.md](BUSINESS_PLAN_COMPLET.md) §13** - Context business
   - Pourquoi ce module existe
   - Valeur pour clubs et sponsors
   - Modèle économique

### 2. Architecture technique (15 min)

3. **[IMPLEMENTATION_ANALYTICS_SPONSORS.md](IMPLEMENTATION_ANALYTICS_SPONSORS.md)**
   - Schéma base de données (4 tables)
   - API REST (12 endpoints)
   - Flux de données

4. **[TRACKING_IMPRESSIONS_SPONSORS.md](TRACKING_IMPRESSIONS_SPONSORS.md)**
   - Architecture tracking temps réel
   - Frontend → Serveur Local → Sync Agent → Central
   - Buffer offline-capable

### 3. Fonctionnalités spécifiques (10 min)

5. **[PDF_REPORTS_GUIDE.md](PDF_REPORTS_GUIDE.md)**
   - Structure PDF 4 pages
   - Génération graphiques Chart.js
   - Signature numérique SHA-256

### 4. Historique et progression (5 min)

6. **[changelog/2025-12-14_analytics-sponsors.md](changelog/2025-12-14_analytics-sponsors.md)**
   - Détails semaines 1-3
   - Commits par fonctionnalité
   - Décisions techniques

---

## 🛠️ Setup environnement (20 min)

### Prérequis

```bash
node --version  # v20.x requis
npm --version   # v10.x minimum
psql --version  # PostgreSQL 15+
```

### 1. Backend Central Server

```bash
cd central-server

# Installation
npm install

# Configuration
cp .env.example .env
# Éditer .env:
# - DATABASE_URL (PostgreSQL)
# - JWT_SECRET
# - PORT=4000

# Créer les tables sponsors
psql -U postgres -d neopro -f src/scripts/sponsor-analytics-tables.sql

# Vérifier build
npm run build

# Lancer en dev
npm run dev

# API disponible: http://localhost:4000
```

**Vérification** : `curl http://localhost:4000/health`

### 2. Frontend Dashboard

```bash
cd central-dashboard

# Installation
npm install

# Configuration
# src/environments/environment.ts déjà configuré

# Lancer en dev
npm start

# Dashboard: http://localhost:4200/sponsors
```

**Vérification** : Naviguer vers http://localhost:4200/sponsors → Devrait voir liste vide

### 3. Raspberry Pi (Optionnel pour tests tracking)

```bash
cd raspberry

# Sync Agent
cd sync-agent
npm install
# Éditer config.json avec votre central server URL
npm start

# Serveur Local
cd ../server
npm install
npm start

# Frontend
cd ../frontend
npm install
npm start
```

---

## 🧪 Tests rapides (10 min)

### Backend API

```bash
# Test création sponsor
curl -X POST http://localhost:4000/api/sponsors \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Test Sponsor",
    "status": "active"
  }'

# Test liste sponsors
curl http://localhost:4000/api/sponsors \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Frontend Dashboard

1. Ouvrir http://localhost:4200/sponsors
2. Cliquer bouton "+"
3. Créer un sponsor test
4. Naviguer vers détail
5. Vérifier onglets (Informations, Vidéos, Analytics)

### PDF Generation

```bash
# Générer PDF rapport sponsor
curl "http://localhost:4000/api/sponsors/SPONSOR_ID/report?from=2025-01-01&to=2025-01-31&signature=true" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  --output rapport.pdf

# Ouvrir rapport.pdf → Devrait voir 4 pages avec graphiques
```

---

## 📁 Structure code (référence rapide)

```
central-server/
├── src/
│   ├── controllers/
│   │   └── sponsor-analytics.controller.ts  # Logique métier
│   ├── routes/
│   │   └── sponsor-analytics.routes.ts      # Définition endpoints
│   ├── services/
│   │   └── pdf-report.service.ts            # Génération PDF
│   └── scripts/
│       └── sponsor-analytics-tables.sql     # Schéma DB

central-dashboard/
└── src/app/features/sponsors/
    ├── sponsors-list.component.ts           # Liste CRUD
    ├── sponsor-detail.component.ts          # Détail + tabs
    ├── sponsor-analytics.component.ts       # Analytics + charts
    └── sponsor-videos.component.ts          # Gestion vidéos

raspberry/
├── frontend/app/services/
│   └── sponsor-analytics.service.ts         # Tracking impressions
├── server/
│   └── server.js                            # API locale (port 3000)
└── sync-agent/src/
    ├── sponsor-impressions.js               # Collector
    └── agent.js                             # Intégration

docs/
├── ANALYTICS_SPONSORS_README.md             # README principal
├── IMPLEMENTATION_ANALYTICS_SPONSORS.md     # Guide implémentation
├── TRACKING_IMPRESSIONS_SPONSORS.md         # Architecture tracking
├── PDF_REPORTS_GUIDE.md                     # Guide PDF
├── AVANCEMENT_ANALYTICS_SPONSORS.md         # Progression
└── changelog/
    └── 2025-12-14_analytics-sponsors.md     # Changelog détaillé
```

---

## 🐛 Debugging courant

### Backend ne démarre pas

```bash
# Vérifier PostgreSQL running
pg_isready

# Vérifier .env configuré
cat .env | grep DATABASE_URL

# Vérifier tables créées
psql -d neopro -c "\dt sponsors*"
```

### Frontend erreurs 404 API

```bash
# Vérifier backend running
curl http://localhost:4000/health

# Vérifier CORS configuré
# src/config/cors.ts doit inclure http://localhost:4200
```

### PDF génération échoue

```bash
# Vérifier dépendances installées
npm list pdfkit chartjs-node-canvas

# Sur Linux: installer dépendances système
sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev

# Sur macOS:
brew install pkg-config cairo pango libpng jpeg giflib librsvg
```

### Graphiques ne s'affichent pas

```bash
# Vérifier Chart.js installé
npm list chart.js

# Vérifier import dans component
# import { Chart } from 'chart.js/auto';
```

---

## 🚀 Tâches fréquentes

### Ajouter un nouveau champ au sponsor

1. **Backend** :
   ```sql
   -- Migration SQL
   ALTER TABLE sponsors ADD COLUMN new_field VARCHAR(255);
   ```

2. **Controller** :
   ```typescript
   // sponsor-analytics.controller.ts
   // Ajouter champ dans validation et requêtes
   ```

3. **Frontend** :
   ```typescript
   // sponsor-detail.component.ts
   // Ajouter champ dans formulaire et interface
   ```

### Ajouter un nouveau graphique

1. **Backend - Données** :
   ```typescript
   // sponsor-analytics.controller.ts
   // Ajouter requête SQL pour nouvelles données
   const newData = await query(`SELECT ...`);
   ```

2. **Frontend - Chart.js** :
   ```typescript
   // sponsor-analytics.component.ts
   const ctx = this.chartRef.nativeElement;
   new Chart(ctx, {
     type: 'bar', // ou 'line', 'pie', 'doughnut'
     data: { ... },
     options: { ... }
   });
   ```

3. **PDF - Chart.js Node** :
   ```typescript
   // pdf-report.service.ts
   async function generateNewChart(data: any): Promise<Buffer> {
     const chartJSNodeCanvas = new ChartJSNodeCanvas({ ... });
     return chartJSNodeCanvas.renderToBuffer(config);
   }
   ```

### Modifier structure PDF

```typescript
// pdf-report.service.ts
async function generatePlaceholderPdf(data: ReportData) {
  // Page 1: Garde
  doc.fontSize(24).text('NOUVEAU TITRE');

  // Ajouter nouvelle page
  doc.addPage();

  // Ajouter contenu
  doc.text('Nouveau contenu...', 50, 100);
}
```

---

## 📊 Données de test

### Créer données test via SQL

```sql
-- Créer sponsor test
INSERT INTO sponsors (name, status, contact_email)
VALUES ('Test Sponsor', 'active', 'test@example.com')
RETURNING id;

-- Créer impressions test (remplacer UUID)
INSERT INTO sponsor_impressions (
  site_id, video_id, played_at, duration_played,
  video_duration, completed, event_type, period
)
SELECT
  gen_random_uuid(),
  gen_random_uuid(),
  NOW() - (n || ' days')::INTERVAL,
  random() * 60 + 30,
  60,
  random() > 0.3,
  (ARRAY['match', 'training', 'tournament'])[floor(random() * 3 + 1)],
  (ARRAY['pre_match', 'halftime', 'post_match'])[floor(random() * 3 + 1)]
FROM generate_series(1, 100) n;

-- Calculer stats quotidiennes
SELECT calculate_sponsor_daily_stats(
  'SPONSOR_UUID'::uuid,
  CURRENT_DATE
);
```

### Via API (Postman/cURL)

Voir collection Postman dans `docs/postman/analytics-sponsors.json` (à créer si besoin).

---

## 🎓 Concepts clés à maîtriser

### 1. Buffer + Retry Pattern

Le tracking utilise un pattern **buffer local + retry** pour gérer offline :

```typescript
// Schéma mental
localStorage (buffer)
  → Auto-flush (5min ou 50 items)
  → HTTP POST vers serveur local
  → Fichier JSON local
  → Sync agent périodique (5min)
  → HTTP POST vers central
  → PostgreSQL
```

**Avantage** : Aucune perte de données même si réseau down pendant 24h.

### 2. Agrégation quotidienne

Les impressions brutes sont agrégées quotidiennement par une fonction PL/pgSQL :

```sql
-- Appelée par cron chaque nuit
SELECT calculate_sponsor_daily_stats(sponsor_id, date);

-- Remplit sponsor_daily_stats pour queries rapides
```

**Avantage** : Dashboard ultra-rapide (query sur stats vs scan impressions).

### 3. Génération PDF asynchrone

PDFKit + Chart.js Node Canvas génèrent PDF côté serveur :

```typescript
// 1. Query DB → reportData
// 2. Chart.js → PNG Buffer
// 3. PDFKit → assemblage pages
// 4. Return PDF Buffer → download
```

**Temps** : ~500ms pour PDF complet avec 2 graphiques.

---

## 📞 Support et questions

### Où trouver de l'aide ?

1. **Documentation** : Chercher dans `/docs` (INDEX.md référence tout)
2. **Code** : Les services sont bien commentés
3. **Tests** : Voir `__tests__` pour exemples usage
4. **Issues GitHub** : Vérifier issues existantes
5. **Business Plan** : Pour questions business/architecture

### Signaler un bug

```markdown
**Description** : [Décrire le bug]

**Étapes reproduction** :
1. ...
2. ...
3. ...

**Comportement attendu** : ...

**Comportement actuel** : ...

**Logs** :
```
[Coller logs pertinents]
```

**Environnement** :
- OS: macOS/Linux/Windows
- Node: v20.x
- DB: PostgreSQL 15.x
```

---

## ✅ Checklist premier jour

Cocher au fur et à mesure:

- [ ] Lecture ANALYTICS_SPONSORS_README.md
- [ ] Setup backend + DB (tables créées)
- [ ] Setup frontend dashboard
- [ ] Test création sponsor via UI
- [ ] Test génération PDF rapport
- [ ] Lecture IMPLEMENTATION_ANALYTICS_SPONSORS.md
- [ ] Lecture TRACKING_IMPRESSIONS_SPONSORS.md
- [ ] Comprendre flux données tracking
- [ ] Explorer code backend (controller + service)
- [ ] Explorer code frontend (4 composants)
- [ ] Test modification simple (ex: texte bouton)
- [ ] Build réussi (backend + frontend)
- [ ] Questions posées/résolues

---

## 🎯 Quick Wins (premières contributions)

Idées de premières tâches pour se familiariser (par difficulté) :

### Facile (1-2h)
- [ ] Ajouter tooltip sur graphique Chart.js
- [ ] Modifier couleurs charte NEOPRO dans PDF
- [ ] Ajouter validation email sponsor
- [ ] Améliorer texte certificat PDF (FR/EN)

### Moyen (4-6h)
- [ ] Ajouter filtre statut dans liste sponsors
- [ ] Créer graphique "Top 5 sponsors par impressions"
- [ ] Ajouter export Excel (en plus de CSV)
- [ ] Tests unitaires service PDF (Jest)

### Avancé (1-2 jours)
- [ ] Cache Redis pour graphiques PDF
- [ ] Upload logo sponsor personnalisé
- [ ] Rapport comparatif multi-sponsors
- [ ] Génération asynchrone PDF (Bull queue)

---

## 📖 Ressources externes

### Technologies utilisées
- **Angular** : https://angular.dev/
- **Chart.js** : https://www.chartjs.org/docs/
- **PDFKit** : http://pdfkit.org/
- **chartjs-node-canvas** : https://github.com/SeanSobey/ChartjsNodeCanvas
- **PostgreSQL** : https://www.postgresql.org/docs/
- **TypeScript** : https://www.typescriptlang.org/docs/

### Patterns et bonnes pratiques
- Offline-First : https://offlinefirst.org/
- REST API Design : https://restfulapi.net/
- TypeScript Best Practices : https://typescript-eslint.io/

---

## 🚀 Prêt à coder !

Vous avez maintenant toutes les clés pour démarrer sur le module Analytics Sponsors.

**Prochaine étape** : Choisir une tâche dans "Quick Wins" et se lancer !

**Questions** : Créer une issue GitHub ou consulter la doc.

**Bonne chance !** 💪

---

**Dernière mise à jour** : 14 Décembre 2025
**Mainteneur** : Équipe NEOPRO
**Contact** : [Voir BUSINESS_PLAN_COMPLET.md]
