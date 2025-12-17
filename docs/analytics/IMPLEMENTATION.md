# Implémentation Analytics Sponsors - Phase MVP

**Date** : 14 Décembre 2025
**Référence** : BUSINESS_PLAN_COMPLET.md §13
**Status** : MVP Backend Complet, Frontend et Tracking à implémenter

---

## ✅ Ce qui a été implémenté

### 1. Schéma de Base de Données ✅

**Fichier** : `central-server/src/scripts/sponsor-analytics-tables.sql`

**Tables créées** :
- `sponsors` - CRUD sponsors/partenaires
- `sponsor_videos` - Association many-to-many sponsors ↔ vidéos
- `sponsor_impressions` - Tracking granulaire de chaque diffusion
- `sponsor_daily_stats` - Statistiques quotidiennes agrégées

**Vues SQL** :
- `sponsor_analytics_summary` - Vue récapitulative par sponsor et vidéo
- `top_sponsor_videos` - Top 50 vidéos sponsors des 30 derniers jours
- `sponsor_performance_by_site` - Performance par site/club

**Fonctions PL/pgSQL** :
- `calculate_sponsor_daily_stats(video_id, site_id, date)` - Calcul stats quotidiennes
- `calculate_all_sponsor_daily_stats(date)` - Batch calculation pour tous sites

### 2. API Backend Complète ✅

**Fichier** : `central-server/src/controllers/sponsor-analytics.controller.ts`
**Routes** : `central-server/src/routes/sponsor-analytics.routes.ts`

**12 Endpoints implémentés** :

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/analytics/sponsors` | GET | All | Liste tous les sponsors |
| `/api/analytics/sponsors` | POST | admin/operator | Créer sponsor |
| `/api/analytics/sponsors/:id` | PUT | admin/operator | Modifier sponsor |
| `/api/analytics/sponsors/:id` | DELETE | admin | Supprimer sponsor |
| `/api/analytics/sponsors/:id/videos` | POST | admin/operator | Associer vidéos |
| `/api/analytics/sponsors/:id/videos/:videoId` | DELETE | admin/operator | Dissocier vidéo |
| `/api/analytics/sponsors/:id/stats` | GET | All | Analytics sponsor |
| `/api/analytics/sponsors/:id/export` | GET | All | Export CSV |
| `/api/analytics/sponsors/:id/report/pdf` | GET | All | Rapport PDF sponsor |
| `/api/analytics/clubs/:siteId/report/pdf` | GET | All | Rapport PDF club |
| `/api/analytics/impressions` | POST | All | Enregistrer impressions |
| `/api/analytics/sponsors/calculate-daily-stats` | POST | admin | Cron job stats |

**Fonctionnalités Analytics** :
- Métriques globales (impressions, durée, complétion, reach, sites actifs)
- Répartition par vidéo
- Répartition par site/club
- Répartition par période (pre_match, halftime, post_match, loop)
- Répartition par type d'événement (match, training, tournament)
- Tendances quotidiennes/hebdomadaires
- Export CSV des données brutes

### 3. Génération Rapports PDF (Structure) ✅

**Fichier** : `central-server/src/services/pdf-report.service.ts`

**Fonctions** :
- `generateSponsorReport(sponsorId, from, to, options)` - Rapport sponsor
- `generateClubReport(siteId, from, to, options)` - Rapport club

**Status** : Structure implémentée avec placeholder PDF texte

**TODO** : Implémenter génération PDF graphique avec PDFKit
```bash
npm install pdfkit @types/pdfkit
```

**Structure du rapport PDF** (selon BP §13.4) :
1. Page de garde - Logo club + sponsor, période, date
2. Résumé exécutif - KPIs clés, comparaison M vs M-1
3. Détail diffusions - Graphiques impressions/jour, répartition périodes
4. Couverture géographique - Carte sites, top 10 sites
5. Certificat diffusion - Attestation officielle, signature numérique

---

## ⏳ Ce qui reste à implémenter

### 1. Frontend Dashboard Sponsors (Priorité HAUTE)

**Fichier à créer** : `central-dashboard/src/app/features/sponsors/`

**Composants Angular nécessaires** :
- `sponsors-list.component.ts` - Liste sponsors avec CRUD
- `sponsor-detail.component.ts` - Détail sponsor avec analytics
- `sponsor-analytics.component.ts` - Dashboard analytics complet
- `sponsor-videos.component.ts` - Gestion association vidéos

**Features** :
- CRUD sponsors (nom, logo, contact, status)
- Association sponsors ↔ vidéos
- Dashboard analytics avec :
  - KPIs cards (impressions, temps écran, complétion, reach)
  - Graphique tendances quotidiennes (Chart.js)
  - Tableau top vidéos
  - Tableau top sites
  - Répartition par période (pie chart)
  - Répartition par événement (pie chart)
- Export CSV
- Téléchargement rapport PDF
- Filtres par période (7j, 30j, custom)

**Estimation** : 3-4 jours de développement

### 2. Tracking Impressions depuis Boîtiers (Priorité HAUTE)

**Fichiers à modifier** :

**Frontend Raspberry** :
- `raspberry/frontend/app/components/tv/tv.component.ts`
- `raspberry/frontend/app/services/sponsor-analytics.service.ts` (à créer)

**Sync Agent** :
- `raspberry/sync-agent/src/sync.service.ts`

**Fonctionnalités** :

**Service de tracking côté TV** :
```typescript
class SponsorAnalyticsService {
  private buffer: SponsorImpression[] = [];
  private readonly BATCH_INTERVAL = 5 * 60 * 1000; // 5 min

  trackImpression(video, context) {
    this.buffer.push({
      videoId: video.id,
      playedAt: new Date(),
      durationPlayed: video.watchedDuration,
      videoDuration: video.totalDuration,
      completed: video.completed,
      eventType: context.eventType,
      period: context.period,
      triggerType: context.trigger, // 'auto' ou 'manual'
      audienceEstimate: context.audience
    });

    if (this.buffer.length >= 50) {
      this.flushBuffer();
    }
  }

  private async flushBuffer() {
    // Envoyer au sync-agent
    await this.syncAgent.sendImpressions(this.buffer);
    this.buffer = [];
  }
}
```

**Intégration dans tv.component.ts** :
- onVideoPlay → trackImpression(start)
- onVideoEnd → trackImpression(completed)
- onVideoInterrupt → trackImpression(interrupted_at)

**Sync Agent** :
- Recevoir batch impressions du frontend
- Buffer local (SQLite ou JSON)
- Envoi périodique vers `/api/analytics/impressions`
- Retry logic si connexion perdue

**Estimation** : 2-3 jours de développement

### 3. Implémentation PDF Graphique (Priorité MOYENNE)

**Dépendances** :
```bash
cd central-server
npm install pdfkit @types/pdfkit chart.js-node-canvas
```

**Fonctionnalités** :
- Templates PDF professionnels
- Logo placement (club + sponsor)
- Graphiques (Chart.js to canvas to PDF)
- Mise en page A4 avec marges
- Tables formatées
- Footer avec signature numérique
- Génération certificat de diffusion

**Estimation** : 3-4 jours de développement

### 4. Contexte Événement sur Télécommande (Priorité BASSE)

**Fichier** : `raspberry/frontend/app/components/remote/remote.component.ts`

**Feature** :
- Dropdown type d'événement (match, training, tournament)
- Input estimation audience (optionnel)
- Indicateur période (pre_match, halftime, post_match)
- Sauvegarder contexte dans localStorage
- Passer contexte lors de `play-video` event

**Estimation** : 1-2 jours

---

## 📊 Conformité Business Plan

### Avant Implémentation
| Module | Conformité |
|--------|------------|
| Analytics Sponsors | **0%** 🔴 |

### Après Implémentation MVP
| Module | Conformité |
|--------|------------|
| Analytics Sponsors | **60%** 🟠 |

**Détail** :
- ✅ Base de données complète
- ✅ API backend complète
- ✅ Endpoints stats/export/PDF
- ✅ Structure rapports PDF
- ⏳ Frontend dashboard (à faire)
- ⏳ Tracking boîtiers (à faire)
- ⏳ PDF graphiques (à faire)

### Après Implémentation Complète (Estimation: +2 semaines)
| Module | Conformité |
|--------|------------|
| Analytics Sponsors | **95%** ✅ |

---

## 🚀 Prochaines Étapes Recommandées

### Semaine 1-2 : Frontend + Tracking
1. **Jour 1-2** : Créer composants Angular dashboard sponsors
2. **Jour 3-4** : Implémenter graphiques et visualisations
3. **Jour 5** : Intégrer endpoints API dans frontend
4. **Jour 6-7** : Implémenter tracking impressions dans tv.component
5. **Jour 8** : Configurer sync-agent pour buffer/envoi impressions

### Semaine 3 : PDF + Tests
6. **Jour 9-11** : Implémenter génération PDF graphique avec PDFKit
7. **Jour 12-13** : Tests end-to-end complets
8. **Jour 14** : Documentation utilisateur

---

## 📝 Migration Base de Données

**Pour déployer le schéma** :

```bash
# En développement (local)
psql $DATABASE_URL -f central-server/src/scripts/sponsor-analytics-tables.sql

# En production (Supabase/Render)
# Via l'interface SQL ou CLI
cat central-server/src/scripts/sponsor-analytics-tables.sql | psql $DATABASE_URL
```

**Vérification** :
```sql
-- Vérifier que les tables existent
SELECT tablename FROM pg_tables
WHERE tablename LIKE 'sponsor%'
ORDER BY tablename;

-- Doit retourner:
-- sponsor_daily_stats
-- sponsor_impressions
-- sponsor_videos
-- sponsors
```

---

## 🔗 Références

- **Business Plan** : `docs/BUSINESS_PLAN_COMPLET.md` §13
- **Audit Projet** : `docs/AUDIT_PROJET_2025-12-14.md`
- **Schéma SQL** : `central-server/src/scripts/sponsor-analytics-tables.sql`
- **Controller** : `central-server/src/controllers/sponsor-analytics.controller.ts`
- **Routes** : `central-server/src/routes/sponsor-analytics.routes.ts`
- **Service PDF** : `central-server/src/services/pdf-report.service.ts`

---

## ✨ Impact Business

**Valeur ajoutée** (BP §13.6) :

### Pour les Clubs
- Justifier tarifs sponsors avec données réelles
- Renouvellement contrats facilité (preuve valeur)
- Attirer nouveaux sponsors (dossier commercial pro)
- Upsell partenaires (plus de visibilité = plus cher)

### Pour les Sponsors
- ROI mesurable (justification interne budget)
- Optimisation créas (données pour améliorer vidéos)
- Transparence (confiance dans partenariat)
- Reporting automatisé (gain temps admin)

### Pour NEOPRO
- **Différenciateur majeur** vs concurrence
- Argument de vente B2B fort
- Upsell analytics premium (+€10-25/mois)
- Base publicité programmatique (Phase 3)
- Data insights marché (compréhension usage agrégé)

**ROI Estimé** :
- Augmentation ARPU : +30%
- Taux conversion sponsors : +50%
- Rétention clients : +15%

---

**Implémenté par** : Claude Code
**Date** : 14 Décembre 2025
**Prochaine révision** : Après implémentation frontend (J+14)
