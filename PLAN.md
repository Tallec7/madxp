# Plan : Catégories Analytics Configurables par Site

**Status : ✅ IMPLÉMENTÉ**

## Objectif

Permettre à l'admin central d'associer chaque catégorie de vidéos d'un site (ex: "But", "Temps mort") à une catégorie analytics prédéfinie (sponsor, jingle, ambiance, other, ou custom).

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Table: analytics_categories (gérée par admin central)          │
│  - id, name, description, color, is_default, created_at        │
│  - Valeurs initiales: sponsor, jingle, ambiance, other         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Intégré dans SiteConfiguration (JSONB)                         │
│  categoryMappings: { [categoryId: string]: analyticsCategoryId }│
│  Exemple: { "But": "jingle", "Entrée": "ambiance" }            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Raspberry: detectCategory() utilise le mapping                 │
│  au lieu de deviner par nom de fichier                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Récapitulatif de l'implémentation

### Fichiers créés

| Fichier | Description |
|---------|-------------|
| `central-dashboard/src/app/features/admin/analytics-categories/analytics-categories.component.ts` | Composant admin pour gérer les catégories analytics |

### Fichiers modifiés

| Fichier | Modification |
|---------|--------------|
| `central-server/src/scripts/analytics-tables.sql` | ✅ Ajout table `analytics_categories` avec valeurs par défaut |
| `central-server/src/controllers/analytics.controller.ts` | ✅ Endpoints CRUD (GET/POST/PUT/DELETE) |
| `central-server/src/routes/analytics.routes.ts` | ✅ Routes API avec protection admin |
| `central-dashboard/src/app/core/models/index.ts` | ✅ Interface `AnalyticsCategory` |
| `central-dashboard/src/app/core/models/site-config.model.ts` | ✅ Ajout `categoryMappings` à SiteConfiguration |
| `central-dashboard/src/app/core/services/analytics.service.ts` | ✅ Méthodes API pour les catégories analytics |
| `central-dashboard/src/app/features/sites/config-editor/config-editor.component.ts` | ✅ Section mapping analytics dans l'éditeur |
| `central-dashboard/src/app/features/layout/layout.component.ts` | ✅ Lien sidebar vers admin analytics |
| `central-dashboard/src/app/app.routes.ts` | ✅ Route `/admin/analytics-categories` |
| `raspberry/frontend/app/interfaces/configuration.interface.ts` | ✅ Ajout `categoryMappings` |
| `raspberry/frontend/app/interfaces/video.interface.ts` | ✅ Ajout `categoryId` |
| `raspberry/frontend/app/app.routes.ts` | ✅ Fonction `enrichVideosWithCategoryId()` |
| `raspberry/frontend/app/services/analytics.service.ts` | ✅ `setConfiguration()` et détection via mapping |
| `raspberry/frontend/app/components/tv/tv.component.ts` | ✅ Appel `analyticsService.setConfiguration()` |
| `raspberry/frontend/app/components/remote/remote.component.ts` | ✅ Enrichissement vidéos + setConfiguration |

---

## Fonctionnalités implémentées

### 1. Gestion des catégories analytics (Admin)

- Page `/admin/analytics-categories` accessible aux admins
- Liste des catégories avec couleur et description
- Création de nouvelles catégories personnalisées
- Modification de toutes les catégories (y compris les catégories par défaut)
- Suppression des catégories personnalisées uniquement (les catégories par défaut ne peuvent pas être supprimées)

### 2. Mapping par site (Config Editor)

- Section "Catégories Analytics" dans l'éditeur de configuration
- Association de chaque catégorie vidéo à une catégorie analytics
- Indicateur visuel de couleur pour chaque mapping
- Sauvegarde dans `config.categoryMappings`

### 3. Utilisation côté Raspberry

- Enrichissement automatique des vidéos avec `categoryId` au chargement
- Service analytics utilise le mapping pour catégoriser les lectures
- Fallback sur détection par path/filename si pas de mapping configuré

---

## Utilisation

### Pour l'administrateur

1. Aller sur `/admin/analytics-categories` pour gérer les catégories globales
2. Créer des catégories personnalisées si nécessaire (ex: "mi-temps", "timeout")

### Pour configurer un site

1. Aller sur la page de détail d'un site
2. Ouvrir l'éditeur de configuration
3. Dans la section "Catégories Analytics", associer chaque catégorie vidéo
4. Déployer la configuration

### Migration BDD

Exécuter le script SQL pour créer la table :

```bash
psql -d neopro -f central-server/src/scripts/analytics-tables.sql
```

---

## Comportement de fallback

Si un site n'a pas de mapping configuré (ou pour les anciennes vidéos), le système utilise la détection par path/filename :

- `sponsor` : path contient "sponsor" ou "partenaire"
- `jingle` : path contient "jingle", "but", "goal", "timeout"
- `ambiance` : path contient "ambiance", "intro", "outro"
- `other` : tout le reste

Les données historiques dans `video_plays` conservent leur catégorie détectée par l'ancien algorithme.

---

## Robustesse et gestion d'erreurs

### Fallback si table non créée

Si la table `analytics_categories` n'existe pas encore en base de données (code PostgreSQL `42P01`), l'API retourne automatiquement les 4 catégories par défaut en mémoire. Cela permet au dashboard de fonctionner même avant l'exécution du script de migration SQL.

### Timeout du Config Editor

Le polling de configuration dans le Config Editor dispose d'un timeout de 30 secondes. Si le site Raspberry ne répond pas dans ce délai :
- Le polling s'arrête automatiquement
- Un message d'avertissement s'affiche
- L'utilisateur peut créer une nouvelle configuration manuellement

Cela évite le blocage infini de l'interface si le site est hors ligne.
