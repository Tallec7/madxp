# Fix: Analytics non remontées depuis le 12 décembre

**Date:** 2025-12-16
**Problème:** Aucune donnée analytics n'est enregistrée depuis le 12 décembre 23h45
**Cause:** Policies Row-Level Security bloquent les insertions non-authentifiées

## Contexte

Le 12 décembre 2025, le système Row-Level Security (RLS) a été déployé sur toutes les tables critiques, y compris les tables d'analytics (`video_plays`, `club_sessions`, `sponsor_impressions`).

Les Raspberry Pi envoient leurs données d'analytics via l'endpoint `POST /api/analytics/video-plays` **sans authentification** (par design, pour simplifier la configuration des Raspberry Pi).

## Cause du problème

### 1. RLS activé sur les tables analytics

```sql
ALTER TABLE video_plays ENABLE ROW LEVEL SECURITY;
```

### 2. Policy restrictive créée

```sql
CREATE POLICY site_insert_own_video_plays ON video_plays
  FOR INSERT
  WITH CHECK (site_id = current_site_id());
```

### 3. Comportement pour requêtes non-authentifiées

Quand un Raspberry Pi envoie des analytics :
- `site_id` = ID du site (ex: `"abc-123"`)
- `current_site_id()` = `NULL` (pas de contexte RLS car non-authentifié)
- Vérification : `"abc-123" = NULL` → **FALSE** → **INSERT BLOQUÉ**

Le middleware RLS (`rls-context.ts` ligne 34-36) détecte l'absence de `req.user` et passe au suivant sans définir de contexte. C'est le comportement attendu, mais les policies RLS ne permettent pas l'insertion sans contexte.

## Solution implémentée

### 1. Migration SQL: `fix-analytics-rls.sql`

Modification des policies pour permettre les insertions non-authentifiées tout en maintenant la sécurité :

```sql
CREATE POLICY site_insert_video_plays ON video_plays
  FOR INSERT
  WITH CHECK (
    -- Cas 1: Requête authentifiée (dashboard, API)
    (current_site_id() IS NOT NULL AND site_id = current_site_id())
    OR
    -- Cas 2: Requête non-authentifiée (Raspberry Pi)
    -- On vérifie juste que le site existe
    (current_site_id() IS NULL AND site_id IN (SELECT id FROM sites))
  );
```

### 2. Correction du pattern middleware dans `server.ts`

Changé de `/api/*` à `/api` pour matcher correctement tous les sous-chemins :

```typescript
// Avant
app.use('/api/*', setRLSContext(pool));

// Après
app.use('/api', setRLSContext(pool));
```

Note: Dans Express, `app.use('/api')` matche automatiquement `/api`, `/api/users`, `/api/analytics/video-plays`, etc.

## Tables concernées

Les policies suivantes ont été mises à jour :

- `video_plays` : INSERT
- `club_sessions` : INSERT, UPDATE
- `sponsor_impressions` : INSERT

## Sécurité maintenue

- ✅ Les requêtes authentifiées (dashboard, API) sont limitées à leur propre site
- ✅ Les requêtes non-authentifiées vérifient que le `site_id` existe dans la table `sites`
- ✅ Impossible d'insérer des données pour un site inexistant
- ✅ Les lectures (`SELECT`) restent strictement limitées par RLS

## Déploiement

### 1. Exécuter la migration

```bash
psql $DATABASE_URL -f src/scripts/migrations/fix-analytics-rls.sql
```

### 2. Redémarrer le serveur central

```bash
npm run build
pm2 restart central-server
```

### 3. Vérification

```sql
-- Vérifier que des données récentes sont insérées
SELECT COUNT(*), MAX(played_at)
FROM video_plays
WHERE played_at >= NOW() - INTERVAL '1 hour';
```

## Amélioration future

Pour une sécurité encore meilleure, considérer :

1. **Authentification par API token** pour les Raspberry Pi
   - Chaque Raspberry Pi a un token unique
   - Le middleware RLS peut définir un contexte même pour ces requêtes

2. **Rate limiting spécifique** pour l'endpoint analytics
   - Limite par `site_id` dans le body
   - Protection contre l'abus de l'endpoint non-authentifié

3. **Validation stricte** des données analytics
   - Timestamps dans une plage valide
   - Durées vidéo cohérentes
   - Noms de fichiers correspondant au contenu déployé

## Références

- Migration SQL: `src/scripts/migrations/fix-analytics-rls.sql`
- Middleware RLS: `src/middleware/rls-context.ts`
- Configuration serveur: `src/server.ts` ligne 218
- Migration RLS initiale: `src/scripts/migrations/enable-row-level-security.sql`

## Timeline

- **12 décembre 2025 23h45** : Dernière donnée analytics enregistrée avant le blocage
- **16 décembre 2025** : Problème identifié et corrigé
