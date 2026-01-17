# Système de Brouillons de Configuration (Config Drafts)

**Version :** 1.0.0
**Depuis :** v2.27.0 (Janvier 2026)

---

## Vue d'ensemble

Le système de **brouillons de configuration** permet de préparer et valider une configuration de site **avant** de la déployer sur le Raspberry Pi. C'est particulièrement utile quand :

- Le Pi est **hors ligne** (site en cours d'installation)
- Les **vidéos ne sont pas encore déployées** sur le Pi
- Vous voulez **préparer à l'avance** la configuration d'un nouveau club

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   1. Créer      │     │   2. Valider    │     │   3. Déployer   │
│   brouillon     │ ──► │   (vidéos OK?)  │ ──► │   orchestré     │
│                 │     │                 │     │                 │
│   sponsors,     │     │   Liste des     │     │   Vidéos +      │
│   catégories,   │     │   vidéos        │     │   Config        │
│   phases...     │     │   manquantes    │     │   en séquence   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

---

## Concepts clés

### Un brouillon par site

Chaque site ne peut avoir qu'**un seul brouillon actif**. Créer un nouveau brouillon remplace l'ancien.

### Upload contextuel

Quand vous uploadez une vidéo depuis l'onglet **Contenu** d'un site, elle est automatiquement associée à ce site (`uploaded_for_site_id`). Ces vidéos :

- Apparaissent **en premier** dans la liste des vidéos disponibles pour ce site
- Sont marquées d'un badge **⭐** dans la bibliothèque
- Sont priorisées lors du déploiement

### Déploiement orchestré

Le déploiement d'un brouillon est **orchestré** en deux phases :

1. **Phase 1 - Vidéos** : Déploiement des vidéos manquantes (priorité haute)
2. **Phase 2 - Configuration** : Déploiement de la configuration (après les vidéos)

---

## Utilisation

### Accès

Dans le dashboard central :

```
Sites → [Sélectionner un site] → Onglet "Contenu"
```

### Créer ou modifier un brouillon

1. Modifiez la configuration dans l'éditeur (sponsors, catégories, phases...)
2. Cliquez sur **💾 Sauvegarder comme brouillon**
3. Le brouillon est enregistré en base de données

**Note** : Les modifications ne sont **pas** envoyées au Pi tant que vous ne déployez pas.

### Uploader des vidéos pour le site

1. Utilisez la **zone d'upload** dans l'onglet Contenu
2. Les vidéos uploadées sont automatiquement associées au site
3. Elles apparaissent avec un badge ⭐ dans la bibliothèque

### Valider le brouillon

1. Cliquez sur **✅ Valider le brouillon**
2. Le système vérifie que toutes les vidéos référencées existent
3. Si des vidéos manquent, elles sont listées

**Vidéos manquantes ?**

- Uploadez-les via la zone d'upload
- Ou modifiez la configuration pour retirer les références

### Déployer le brouillon

1. Cliquez sur **🚀 Déployer le brouillon**
2. Le système lance un **déploiement orchestré** :
   - D'abord : Déploiement des vidéos manquantes sur le Pi
   - Ensuite : Déploiement de la configuration
3. Suivez la progression en temps réel

**Si le Pi est hors ligne** : Les commandes sont mises en **queue** et s'exécuteront automatiquement à la reconnexion.

### Supprimer un brouillon

1. Cliquez sur **🗑️ Supprimer le brouillon**
2. Le brouillon est supprimé, la configuration actuelle du Pi n'est pas affectée

---

## Structure des données

### Table `config_drafts`

```sql
CREATE TABLE config_drafts (
  id UUID PRIMARY KEY,
  site_id UUID UNIQUE REFERENCES sites(id),  -- Un seul brouillon par site
  name VARCHAR(255),
  configuration JSONB NOT NULL,
  referenced_video_ids UUID[],               -- Vidéos référencées
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id)
);
```

### Table `orchestrated_deployments`

```sql
CREATE TABLE orchestrated_deployments (
  id UUID PRIMARY KEY,
  site_id UUID REFERENCES sites(id),
  draft_id UUID REFERENCES config_drafts(id),
  status VARCHAR(50),                        -- pending, videos_deploying, config_deploying, completed, failed
  videos_to_deploy UUID[],
  videos_completed UUID[],
  videos_failed UUID[],
  config_deployment_id UUID,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT
);
```

### Colonne `videos.uploaded_for_site_id`

```sql
ALTER TABLE videos ADD COLUMN uploaded_for_site_id UUID REFERENCES sites(id);
```

---

## API Endpoints

### Récupérer le brouillon d'un site

```http
GET /api/sites/:siteId/draft
```

**Réponse** : Le brouillon ou `null` si aucun

### Créer ou mettre à jour un brouillon

```http
PUT /api/sites/:siteId/draft
Content-Type: application/json

{
  "name": "Config janvier 2026",
  "configuration": {
    "sponsors": [...],
    "categories": [...],
    "timeCategories": [...]
  }
}
```

### Supprimer un brouillon

```http
DELETE /api/sites/:siteId/draft
```

### Valider un brouillon

```http
POST /api/sites/:siteId/draft/validate
```

**Réponse** :

```json
{
  "valid": false,
  "missingVideos": [{ "filename": "sponsor_nike.mp4", "referencedIn": "sponsors[0]" }]
}
```

### Déployer un brouillon

```http
POST /api/sites/:siteId/draft/deploy
```

**Réponse** :

```json
{
  "deploymentId": "uuid",
  "status": "videos_deploying",
  "videosToSend": 3
}
```

### Suivre la progression d'un déploiement orchestré

```http
GET /api/sites/:siteId/draft/deployment/:deploymentId
```

**Réponse** :

```json
{
  "status": "config_deploying",
  "videosCompleted": 3,
  "videosFailed": 0,
  "configDeploymentId": "uuid"
}
```

---

## Workflow complet

### Scénario : Nouveau club à configurer

1. **Créer le site** dans le dashboard (même si le Pi n'est pas encore installé)

2. **Uploader les vidéos** via la zone d'upload contextuel
   - Les vidéos sont stockées dans le cloud (FTP ou Supabase)
   - Elles sont associées au site via `uploaded_for_site_id`

3. **Configurer le brouillon**
   - Ajouter les sponsors avec leurs vidéos
   - Configurer les catégories
   - Définir les phases de match (avant/pendant/après)

4. **Valider le brouillon**
   - Vérifier que toutes les vidéos existent
   - Corriger si nécessaire

5. **Installer le Pi** sur site
   - Le Pi se connecte au serveur central
   - Son statut passe à "En ligne"

6. **Déployer le brouillon**
   - Les vidéos sont envoyées au Pi
   - La configuration est appliquée
   - Le brouillon est automatiquement supprimé après succès

---

## Cas d'usage avancés

### Préparer plusieurs sites en parallèle

Vous pouvez créer des brouillons pour plusieurs sites simultanément, même s'ils sont tous hors ligne. Quand chaque Pi se connectera, vous pourrez déployer son brouillon.

### Dupliquer une configuration

1. Allez sur un site déjà configuré
2. Exportez sa configuration (bouton Export JSON)
3. Allez sur le nouveau site
4. Importez la configuration comme base du brouillon
5. Ajustez les vidéos et paramètres spécifiques

### Rollback via brouillon

Si une configuration déployée pose problème :

1. Créez un brouillon avec l'ancienne configuration (depuis l'historique)
2. Validez et déployez

---

## Dépannage

### Le brouillon ne se sauvegarde pas

- Vérifiez que vous avez les droits sur le site (operator ou admin)
- Vérifiez la connexion au serveur central

### La validation échoue avec des vidéos manquantes

- Les vidéos référencées dans la config doivent exister dans la bibliothèque
- Uploadez les vidéos manquantes ou modifiez la configuration

### Le déploiement orchestré reste bloqué

1. Vérifiez le statut du Pi (en ligne ?)
2. Consultez les logs du déploiement
3. Si bloqué > 1h, annulez et relancez

### Les vidéos uploadées n'apparaissent pas avec le badge ⭐

- Rafraîchissez la page
- Vérifiez que vous avez uploadé depuis l'onglet Contenu du bon site

---

## Fichiers source

| Composant             | Fichier                                                          |
| --------------------- | ---------------------------------------------------------------- |
| Service backend       | `central-server/src/services/draft.service.ts`                   |
| Service orchestration | `central-server/src/services/orchestrated-deployment.service.ts` |
| Contrôleur            | `central-server/src/controllers/drafts.controller.ts`            |
| Routes                | `central-server/src/routes/drafts.routes.ts`                     |
| Service Angular       | `central-dashboard/src/app/core/services/draft.service.ts`       |
| Upload contextuel     | `central-dashboard/.../video-upload-zone/`                       |
| Migration DB          | `central-server/src/scripts/migrations/add-config-drafts.sql`    |

---

**Voir aussi :**

- [CLAUDE.md - Section Config Drafts](../../CLAUDE.md#config-drafts-brouillons-de-configuration)
- [MODOP-C12-15 - Déploiement](../modops/MODOP-C12-15-Deploiement-MAJ.md)
