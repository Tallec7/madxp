# Changelog - 10 Décembre 2025

## Vue d'ensemble

Cette mise à jour complète la **Phase 1 du Business Plan** avec l'implémentation de :
1. Tests Frontend Angular pour les services manquants
2. Monitoring centralisé avec Logtail
3. Alertes Slack pour les événements critiques
4. Visualisation du contenu local dans le dashboard central

---

## Nouvelles fonctionnalités

### 1. Tests Frontend Angular

Ajout de tests unitaires pour les 3 services qui n'en avaient pas :

| Service | Fichier | Tests |
|---------|---------|-------|
| NotificationService | `notification.service.spec.ts` | 6 tests (success, error, warning, info, IDs) |
| AnalyticsService | `analytics.service.spec.ts` | 10 tests (health, availability, alerts, usage, export) |
| SocketService | `socket.service.spec.ts` | 9 tests (connect, disconnect, emit, events) |

**Couverture totale des services core : 9/9** (100%)

### 2. Logtail - Logging centralisé

Intégration de [Better Stack Logtail](https://betterstack.com/logtail) pour centraliser les logs en production.

**Configuration :**
```env
LOGTAIL_TOKEN=your-logtail-source-token
```

**Fonctionnement :**
- En production, tous les logs Winston sont envoyés à Logtail
- Les logs fichiers locaux sont conservés en backup
- Permet la recherche, alerting et dashboards dans Better Stack

### 3. Alertes Slack

Service d'alertes Slack pour les événements critiques du système.

**Configuration :**
```env
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK
SLACK_ALERTS_ENABLED=true
```

**Alertes disponibles :**

| Méthode | Déclencheur | Sévérité |
|---------|-------------|----------|
| `siteOffline()` | Site passe offline | Error |
| `siteOnline()` | Site revient online | Info |
| `highTemperature()` | Température > 75°C | Warning/Critical |
| `lowDiskSpace()` | Disque > 90% | Warning/Critical |
| `deploymentSuccess()` | Déploiement vidéo réussi | Info |
| `deploymentFailed()` | Échec déploiement | Error |
| `serverError()` | Erreur serveur | Error |

**Format des messages :**
- Couleurs par sévérité (bleu, orange, rouge)
- Emojis indicateurs
- Métadonnées structurées
- Timestamp et contexte

### 4. Visualisation du contenu local

Nouvel onglet "Contenu local" dans la page de détail d'un site.

**Fonctionnalités :**
- Affiche le miroir de la configuration stockée sur le Pi
- Visualisation des catégories et vidéos
- Indicateurs de verrouillage (NEOPRO vs Club)
- Hash de configuration et date de dernière sync
- Badges owner (NEOPRO/CLUB) colorés

**Endpoint API :**
```
GET /api/sites/:id/local-content
```

**Réponse :**
```json
{
  "siteId": "uuid",
  "siteName": "Site Name",
  "clubName": "Club Name",
  "hasContent": true,
  "lastSync": "2025-12-10T10:00:00Z",
  "configHash": "abc123...",
  "configuration": { /* SiteConfiguration */ }
}
```

---

## Fichiers modifiés

### Central Server

| Fichier | Modification |
|---------|--------------|
| `package.json` | Ajout `@logtail/node`, `@logtail/winston` |
| `.env.example` | Variables `LOGTAIL_TOKEN`, `SLACK_WEBHOOK_URL`, `SLACK_ALERTS_ENABLED` |
| `src/config/logger.ts` | Transport Logtail en production |
| `src/services/alert.service.ts` | **Nouveau** - Service d'alertes Slack |
| `src/services/socket.service.ts` | Intégration alertes (offline, temperature, disk) |
| `src/controllers/sites.controller.ts` | Fonction `getSiteLocalContent` |
| `src/routes/sites.routes.ts` | Route `GET /:id/local-content` |

### Central Dashboard

| Fichier | Modification |
|---------|--------------|
| `angular.json` | Fix styles.scss, budgets augmentés |
| `src/app/core/services/notification.service.spec.ts` | **Nouveau** - Tests |
| `src/app/core/services/analytics.service.spec.ts` | **Nouveau** - Tests |
| `src/app/core/services/socket.service.spec.ts` | **Nouveau** - Tests |
| `src/app/core/services/sites.service.ts` | Méthode `getLocalContent()` |
| `src/app/features/sites/site-detail.component.ts` | Onglet Contenu local |
| `src/app/features/sites/site-content-viewer/` | **Nouveau** - Composant visualisation |

---

## Installation

### 1. Installer les dépendances

```bash
cd central-server
npm install
```

### 2. Configurer les variables d'environnement

Ajouter dans `.env` :

```env
# Logtail (optionnel)
LOGTAIL_TOKEN=your-token

# Slack (optionnel)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
SLACK_ALERTS_ENABLED=true
```

### 3. Migration base de données

Si pas encore fait, exécuter :
```sql
-- Voir central-server/src/scripts/add-local-config-mirror.sql
ALTER TABLE sites
ADD COLUMN IF NOT EXISTS local_config_mirror JSONB,
ADD COLUMN IF NOT EXISTS local_config_hash VARCHAR(64),
ADD COLUMN IF NOT EXISTS last_config_sync TIMESTAMPTZ;
```

### 4. Builder

```bash
# Backend
cd central-server && npm run build

# Frontend
cd central-dashboard && npm run build
```

---

## État du Business Plan

### Phase 1 - Consolidation Technique (0-3 mois)

| Tâche | Statut |
|-------|--------|
| CI/CD GitHub Actions | ✅ |
| Tests backend (230 tests, ~67% couverture) | ✅ |
| Tests frontend (9 services core) | ✅ |
| Sécurité JWT HttpOnly | ✅ |
| TLS PostgreSQL | ✅ |
| API Key hashée | ✅ |
| Analytics Club | ✅ |
| Éditeur config avancé | ✅ |
| CRUD vidéos inline | ✅ |
| Upload fichiers | ✅ |
| Toast notifications | ✅ |
| Synchronisation intelligente | ✅ |
| **Monitoring/Logging (Logtail)** | ✅ **Nouveau** |
| **Alerting (Slack)** | ✅ **Nouveau** |
| Documentation OpenAPI/Swagger | ⏳ À faire |

**Progression Phase 1 : ~95%**

---

## Prochaines étapes

1. **Documentation OpenAPI** - Générer la spec Swagger
2. **20 clubs pilotes** - Déploiement terrain
3. **Phase 2** - Scale & PMF (Redis, optimisations)
