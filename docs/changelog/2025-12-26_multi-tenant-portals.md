# Changelog - 26 décembre 2025

## Multi-tenant Portals & Admin Améliorations

### Fonctionnalités ajoutées

#### 1. Portail Sponsor (`/sponsor-portal`)

Interface dédiée aux sponsors/annonceurs permettant de :
- Voir leur dashboard personnalisé (KPIs, impressions, tendances)
- Consulter leurs vidéos déployées et leur statut
- Voir les sites où leurs contenus sont diffusés
- Accéder à leurs statistiques détaillées

**Fichiers créés :**
- `central-dashboard/src/app/features/sponsor-portal/sponsor-dashboard.component.ts`
- `central-dashboard/src/app/core/services/sponsor-portal.service.ts`
- `central-server/src/controllers/sponsor-portal.controller.ts`
- `central-server/src/routes/sponsor-portal.routes.ts`

#### 2. Portail Agence (`/agency-portal`)

Interface pour les agences gérant plusieurs clubs :
- Dashboard avec vue d'ensemble de leurs clubs
- Liste des sites avec statut (online/offline)
- Alertes sur les problèmes détectés
- Statistiques agrégées

**Fichiers créés :**
- `central-dashboard/src/app/features/agency-portal/agency-dashboard.component.ts`
- `central-dashboard/src/app/core/services/agency-portal.service.ts`
- `central-server/src/controllers/agency.controller.ts`
- `central-server/src/routes/agency.routes.ts`

#### 3. Administration des Agences (`/admin/agencies`)

Interface admin pour gérer les agences :
- CRUD complet des agences
- Gestion des contacts et informations
- Association sites-agences

**Fichiers créés :**
- `central-dashboard/src/app/features/admin/agencies/agencies-management.component.ts`

#### 4. Nouveaux rôles utilisateurs

Ajout des rôles `sponsor` et `agency` au système d'authentification :
- Extension du type `UserRole`
- Middlewares de vérification d'accès (`requireSponsorAccess`, `requireAgencyAccess`)
- JWT enrichi avec `sponsor_id` et `agency_id`

**Fichiers modifiés :**
- `central-server/src/types/index.ts`
- `central-server/src/middleware/auth.ts`
- `central-server/src/controllers/auth.controller.ts`

### Améliorations Admin Local Raspberry

#### 1. Upload avec progression réelle

Remplacement de `fetch` par `XMLHttpRequest` pour afficher :
- Pourcentage de progression en temps réel
- Taille envoyée / taille totale
- Exemple : "Upload en cours... 67% (45.2 MB / 67.5 MB)"

#### 2. Miniatures vidéos

- Affichage des miniatures dans la bibliothèque
- Générées automatiquement par `video-processor.js`
- Fallback sur icône play si non disponible

#### 3. Prévisualisation avant upload

- Miniature de chaque fichier sélectionné
- Durée extraite des métadonnées
- Bouton preview pour visualiser avant upload

**Fichiers modifiés :**
- `raspberry/admin/public/app.js` - Fonctions `uploadWithProgress`, `formatDuration`, `getThumbnailUrl`, `previewUploadFile`
- `raspberry/admin/public/styles.css` - Styles pour thumbnails et preview

### Documentation

- `docs/technical/MULTI_TENANT.md` - Documentation complète architecture multi-tenant
- `raspberry/admin/README.md` - Mise à jour avec nouvelles fonctionnalités upload
- `docs/00-INDEX.md` - Ajout lien vers doc multi-tenant

### Migration Base de Données

Script de migration disponible :
```bash
psql $DATABASE_URL < central-server/src/scripts/migrations/add-sponsor-agency-roles.sql
```

Ajoute :
- Contrainte de rôle étendue
- Table `agencies`
- Table `agency_sites`
- Colonnes `sponsor_id` et `agency_id` sur `users`

---

**Commits :**
- `feat: implement multi-tenant portals and local admin improvements`

**Branche :** `claude/platform-audit-implementation-h20n8`
