# Système de Gestion des Sponsors Neopro

## Vue d'ensemble

Le système de sponsors Neopro permet de gérer les partenaires commerciaux qui diffusent leurs vidéos sur les écrans des sites (clubs, stades). Ce document décrit l'architecture technique, les flux de données et les API disponibles.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CENTRAL SERVER                                     │
│  ┌───────────────┐  ┌────────────────┐  ┌─────────────────────────────────┐ │
│  │   sponsors    │──│ sponsor_videos │──│            videos               │ │
│  │ (entités)     │  │ (N:M)          │  │ (fichiers vidéo)                │ │
│  └───────┬───────┘  └────────────────┘  └─────────────────────────────────┘ │
│          │                                                                   │
│  ┌───────▼───────┐                      ┌─────────────────────────────────┐ │
│  │ sponsor_sites │──────────────────────│            sites                │ │
│  │ (contrats)    │                      │ (Raspberry Pi)                  │ │
│  └───────────────┘                      └───────────────┬─────────────────┘ │
│                                                         │                   │
│  ┌─────────────────────────────────────────────────────▼─────────────────┐ │
│  │                     sponsor_impressions                                │ │
│  │ (tracking: chaque diffusion vidéo)                                     │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Sync (API key auth)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           RASPBERRY PI (Site)                                │
│  ┌────────────────────┐     ┌──────────────────┐     ┌────────────────────┐ │
│  │   Angular App      │────▶│  Local Server    │────▶│   Sync-Agent       │ │
│  │ (affichage vidéos) │     │ (buffer JSON)    │     │ (envoi central)    │ │
│  └────────────────────┘     └──────────────────┘     └────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Tables de base de données

### `sponsors`
Entités sponsors (partenaires commerciaux).

| Colonne | Type | Description |
|---------|------|-------------|
| id | UUID | Identifiant unique |
| name | VARCHAR(255) | Nom du sponsor |
| logo_url | VARCHAR(500) | URL du logo |
| contact_email | VARCHAR(255) | Email de contact |
| contact_name | VARCHAR(255) | Nom du contact |
| contact_phone | VARCHAR(50) | Téléphone |
| status | VARCHAR(50) | active, inactive, paused |
| metadata | JSONB | Données additionnelles |
| created_at | TIMESTAMP | Date de création |
| updated_at | TIMESTAMP | Date de mise à jour |

### `sponsor_videos`
Association N:M entre sponsors et vidéos.

| Colonne | Type | Description |
|---------|------|-------------|
| sponsor_id | UUID (FK) | Référence vers sponsors |
| video_id | UUID (FK) | Référence vers videos |
| is_primary | BOOLEAN | Sponsor principal de la vidéo |
| added_at | TIMESTAMP | Date d'association |

### `sponsor_sites`
Association sponsors ↔ sites avec gestion des contrats.

| Colonne | Type | Description |
|---------|------|-------------|
| sponsor_id | UUID (FK) | Référence vers sponsors |
| site_id | UUID (FK) | Référence vers sites |
| added_at | TIMESTAMP | Date d'association |
| contract_start | DATE | Début du contrat (NULL = immédiat) |
| contract_end | DATE | Fin du contrat (NULL = illimité) |
| is_active | BOOLEAN | Association active |

### `sponsor_impressions`
Tracking granulaire de chaque diffusion vidéo.

| Colonne | Type | Description |
|---------|------|-------------|
| id | UUID | Identifiant unique |
| site_id | UUID (FK) | Site de diffusion |
| video_id | UUID (FK) | Vidéo diffusée |
| played_at | TIMESTAMP | Début de lecture |
| duration_played | INTEGER | Secondes jouées |
| video_duration | INTEGER | Durée totale vidéo |
| completed | BOOLEAN | Lecture complète (95%+) |
| interrupted_at | INTEGER | Seconde d'interruption |
| event_type | VARCHAR(50) | match, training, tournament, other |
| period | VARCHAR(50) | pre_match, halftime, post_match, loop |
| trigger_type | VARCHAR(20) | auto, manual |
| position_in_loop | INTEGER | Position dans la boucle |
| audience_estimate | INTEGER | Estimation audience |

### `sponsor_daily_stats`
Statistiques agrégées par jour/vidéo/site.

| Colonne | Type | Description |
|---------|------|-------------|
| video_id | UUID (FK) | Vidéo |
| site_id | UUID (FK) | Site |
| date | DATE | Jour |
| total_impressions | INTEGER | Nombre de diffusions |
| total_duration_seconds | INTEGER | Temps d'écran total |
| completed_plays | INTEGER | Lectures complètes |
| completion_rate | DECIMAL(5,2) | Taux de complétion (%) |
| ... | ... | (autres métriques) |

---

## Flux de données

### 1. Enregistrement des impressions

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Angular    │     │   Local     │     │ Sync-Agent  │     │   Central   │
│  (TV)       │     │   Server    │     │             │     │   Server    │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │                   │
       │ trackSponsorStart │                   │                   │
       │──────────────────>│                   │                   │
       │                   │                   │                   │
       │ trackSponsorEnd   │                   │                   │
       │──────────────────>│                   │                   │
       │                   │                   │                   │
       │                   │ (buffer local)    │                   │
       │                   │──────────────────>│                   │
       │                   │                   │                   │
       │                   │                   │ POST /api/analytics/impressions
       │                   │                   │ (Authorization: Bearer <API_KEY>)
       │                   │                   │──────────────────>│
       │                   │                   │                   │
       │                   │                   │    { recorded: N }│
       │                   │                   │<──────────────────│
```

### 2. Authentification des impressions

Le sync-agent s'authentifie auprès du central via l'API key du site :

```http
POST /api/analytics/impressions
Authorization: Bearer <SITE_API_KEY>
Content-Type: application/json

{
  "impressions": [
    {
      "video_id": "uuid-video",
      "played_at": "2025-12-28T14:30:00Z",
      "duration_played": 25,
      "video_duration": 30,
      "completed": false,
      "event_type": "match",
      "period": "halftime",
      "trigger_type": "auto"
    }
  ]
}
```

Le site_id est automatiquement extrait de l'API key authentifiée.

---

## API Endpoints

### Gestion des Sponsors (Admin)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/analytics/sponsors` | Liste tous les sponsors |
| GET | `/api/analytics/sponsors/:id` | Détails d'un sponsor |
| POST | `/api/analytics/sponsors` | Créer un sponsor |
| PUT | `/api/analytics/sponsors/:id` | Modifier un sponsor |
| DELETE | `/api/analytics/sponsors/:id` | Supprimer un sponsor |

### Association Sponsors ↔ Vidéos (Admin)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/analytics/sponsors/:id/videos` | Vidéos d'un sponsor |
| POST | `/api/analytics/sponsors/:id/videos` | Associer vidéos |
| DELETE | `/api/analytics/sponsors/:id/videos/:videoId` | Dissocier vidéo |

### Association Sponsors ↔ Sites (Admin)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/sponsors/:id/sites` | Sites d'un sponsor |
| POST | `/api/sponsors/:id/sites` | Associer sites |
| PUT | `/api/sponsors/:sponsorId/sites/:siteId` | Modifier contrat |
| DELETE | `/api/sponsors/:sponsorId/sites/:siteId` | Retirer site |
| GET | `/api/sites/:id/sponsors` | Sponsors d'un site |

### Portail Sponsor (User sponsor)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/sponsor/dashboard` | Dashboard avec stats 30j |
| GET | `/api/sponsor/sites` | Sites de diffusion |
| GET | `/api/sponsor/videos` | Vidéos avec stats |
| GET | `/api/sponsor/stats` | Stats détaillées par période |

### Impressions (Raspberry)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/analytics/impressions` | Envoyer batch d'impressions |

---

## Gestion des contrats

### Statuts de contrat

| Statut | Condition |
|--------|-----------|
| `active` | is_active=true, contract_start <= today, (contract_end >= today ou NULL) |
| `pending` | is_active=true, contract_start > today |
| `expired` | is_active=true, contract_end < today |
| `inactive` | is_active=false |

### Fonctions SQL

```sql
-- Vérifier si un contrat est actif
SELECT is_sponsor_contract_active(sponsor_id, site_id, CURRENT_DATE);

-- Obtenir les sites avec contrat actif pour un sponsor
SELECT * FROM get_sponsor_active_sites(sponsor_id);

-- Obtenir les sponsors actifs pour un site
SELECT * FROM get_site_active_sponsors(site_id);
```

### Vue avec statut

```sql
SELECT * FROM sponsor_accessible_sites
WHERE sponsor_id = 'uuid'
  AND contract_status = 'active';
```

---

## Configuration Raspberry

### Interface LoopVideo (boucle vidéo)

```typescript
interface LoopVideo {
  name: string;           // Nom affiché
  type: string;           // "video/mp4"
  path: string;           // "videos/BOUCLE/sponsor.mp4"
  video_id?: string;      // UUID pour tracking analytics
  sponsor_id?: string;    // UUID du sponsor pour filtrage contrat
  analytics_category?: string; // "sponsor"
}
```

### Configuration du site

```typescript
interface Configuration {
  sponsors: LoopVideo[];  // Boucle vidéo globale
  timeCategories?: TimeCategory[]; // Phases avec boucles spécifiques
  // ...
}
```

---

## Sécurité

### Authentification

| Contexte | Méthode |
|----------|---------|
| Dashboard admin | JWT token (cookie HttpOnly) |
| Portail sponsor | JWT token avec sponsor_id |
| Impressions Raspberry | API key du site (Bearer token) |

### Contrôle d'accès

| Rôle | Accès |
|------|-------|
| super_admin | Tout |
| admin | CRUD sponsors, sites, vidéos |
| operator | Lecture + associations |
| sponsor | Ses propres données uniquement |
| viewer | Lecture seule analytics |

### Validation des impressions

- L'API key du site est vérifiée en base de données
- Le site_id est extrait de l'auth (pas du body)
- Limite de 500 impressions par batch
- Validation des UUIDs

---

## Migrations SQL

1. `sponsor-analytics-tables.sql` - Tables principales
2. `add-sponsor-agency-roles.sql` - Rôles et associations sites
3. `add-sponsor-contract-validation.sql` - Fonctions et index contrats

### Appliquer les migrations

```bash
PGPASSWORD='password' psql "postgresql://user@host/db" \
  -f src/scripts/migrations/add-sponsor-contract-validation.sql
```

---

## Monitoring

### Métriques clés

- Impressions par sponsor/jour
- Taux de complétion moyen
- Sites actifs par sponsor
- Contrats expirant bientôt (days_remaining)

### Logs

```typescript
// Impressions enregistrées
logger.info('Sponsor impressions recorded', {
  siteId,
  siteName,
  recorded: N,
  skipped: M
});

// Contrat modifié
logger.info('Sponsor-site contract updated', {
  sponsorId,
  siteId,
  updates: { contract_start, contract_end, is_active },
  updatedBy: email
});
```

---

## Évolutions futures

1. **Upload par sponsor** - Permettre aux sponsors d'uploader leurs vidéos
2. **Notifications** - Alertes contrats expirant, objectifs atteints
3. **Scheduling** - Plages horaires de diffusion
4. **Géofencing** - Restrictions géographiques par contrat
5. **Rapports PDF** - Génération automatique mensuelle
