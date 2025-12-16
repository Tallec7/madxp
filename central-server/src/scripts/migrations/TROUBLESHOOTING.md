# Troubleshooting - Migrations RLS

## 🐛 Erreurs Courantes et Solutions

### Erreur #1: `function is_admin() does not exist`

**Message complet:**
```
ERROR: 42883: function is_admin() does not exist
HINT: No function matches the given name and argument types. You might need to add explicit type casts.
```

**Cause:**
Les policies RLS tentent d'utiliser la fonction `is_admin()` qui n'existe pas encore dans la base de données.

**Solution A - Recommandée (Exécuter migration complète):**
```bash
psql $DATABASE_URL -f central-server/src/scripts/migrations/enable-row-level-security.sql
```

Cette migration crée toutes les fonctions ET les policies dans le bon ordre.

**Solution B - Alternative (Créer fonctions d'abord):**
```bash
# 1. Créer uniquement les fonctions
psql $DATABASE_URL -f central-server/src/scripts/migrations/00-create-rls-functions.sql

# 2. Puis appliquer les policies
psql $DATABASE_URL -f central-server/src/scripts/migrations/enable-row-level-security.sql
```

**Vérification:**
```sql
-- Lister les fonctions RLS
SELECT proname, proargtypes
FROM pg_proc
WHERE proname IN ('is_admin', 'current_site_id', 'current_user_id', 'set_session_context');

-- Résultat attendu: 4 lignes
```

---

### Erreur #2: `column "site_id" does not exist`

**Message complet:**
```
ERROR: 42703: column "site_id" does not exist
HINT: Perhaps you meant to reference the column "content_deployments.video_id".
```

**Cause:**
Les tables `content_deployments` et `update_deployments` utilisent une structure polymorphe (`target_type` + `target_id`) au lieu d'une colonne `site_id` directe.

**Solution:**
Utiliser la version corrigée de `enable-row-level-security.sql` qui gère correctement la structure polymorphe.

**Vérification:**
```sql
-- Vérifier structure de content_deployments
\d content_deployments

-- Doit afficher:
-- target_type | character varying(50)
-- target_id   | uuid
```

**Note:** Ce problème est déjà corrigé dans la version actuelle de la migration (commit `bdfede6`).

---

### Erreur #3: `relation "group_sites" does not exist`

**Message complet:**
```
ERROR: 42P01: relation "group_sites" does not exist
```

**Cause:**
Les policies RLS font référence à la table `group_sites` qui n'existe pas. Le nom correct de la table est `site_groups`.

**Solution:**
Utiliser la version corrigée de `enable-row-level-security.sql` qui utilise le bon nom de table.

**Vérification:**
```sql
-- Vérifier que la table site_groups existe
SELECT tablename FROM pg_tables WHERE tablename = 'site_groups';

-- Doit retourner 1 ligne
```

**Note:** Ce problème est déjà corrigé dans la version actuelle de la migration (commit `74aba17`).

---

### Erreur #4: `Property 'siteId' does not exist on type 'AuthenticatedUser'`

**Message complet:**
```
src/middleware/rls-context.ts(63,42): error TS2339: Property 'siteId' does not exist on type 'AuthenticatedUser'.
```

**Cause:**
Le type `AuthenticatedUser` ne contient pas de propriété `siteId`. Les utilisateurs n'ont pas de site assigné directement - ils accèdent aux sites via les paramètres de requête.

**Solution:**
Utiliser la version corrigée de `rls-context.ts` qui ne fait pas référence à `req.user.siteId`.

**Vérification:**
```bash
# Vérifier que TypeScript compile sans erreur
cd central-server && npm run build

# Ou juste vérifier les types
npx tsc --noEmit
```

**Note:** Ce problème est déjà corrigé dans la version actuelle (commit `38dfa43`).

**Sécurité:**
L'autorisation est gérée par les policies RLS PostgreSQL, pas au niveau application:
- Les admins (`is_admin() = true`) peuvent accéder à tous les sites
- Les non-admins ne peuvent accéder qu'aux données correspondant à `current_site_id()`

---

### Erreur #5: `policy already exists`

**Message complet:**
```
ERROR: 42710: policy "admin_sites_all" for table "sites" already exists
```

**Cause:**
La migration a déjà été exécutée partiellement, et certaines policies existent déjà.

**Solution A - Supprimer les policies existantes:**
```sql
-- Supprimer toutes les policies RLS
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
      r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;
```

Puis réexécuter la migration:
```bash
psql $DATABASE_URL -f central-server/src/scripts/migrations/enable-row-level-security.sql
```

**Solution B - Utiliser CREATE OR REPLACE (si supporté):**
Modifier manuellement la migration pour utiliser `CREATE OR REPLACE POLICY` au lieu de `CREATE POLICY`.

---

### Erreur #6: `permission denied for table`

**Message complet:**
```
ERROR: 42501: permission denied for table sites
```

**Cause:**
L'utilisateur PostgreSQL n'a pas les permissions suffisantes pour modifier les policies RLS.

**Solution:**
Exécuter la migration avec un utilisateur ayant les droits `SUPERUSER` ou `BYPASSRLS`:

```bash
# Vérifier les permissions
psql $DATABASE_URL -c "SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;"

# Si pas superuser, se connecter avec un compte admin
psql -U postgres $DATABASE_URL -f central-server/src/scripts/migrations/enable-row-level-security.sql
```

---

### Erreur #7: `current transaction is aborted`

**Message complet:**
```
ERROR: 25P02: current transaction is aborted, commands ignored until end of transaction block
```

**Cause:**
Une erreur précédente a mis la transaction dans un état invalide.

**Solution:**
Terminer la transaction et recommencer:

```sql
-- Annuler la transaction en cours
ROLLBACK;

-- Réexécuter la migration
\i central-server/src/scripts/migrations/enable-row-level-security.sql
```

---

### Erreur #8: `play() failed because the user didn't interact with the document first`

**Message complet:**
```
NotAllowedError: play() failed because the user didn't interact with the document first.
https://goo.gl/xX8pDD
```

**Cause:**
Les navigateurs modernes (Chrome 66+, Safari 11+) bloquent l'autoplay des vidéos avec son sans interaction utilisateur préalable. C'est une politique de sécurité, PAS un problème RLS.

**Solution:**
Démarrer le lecteur vidéo en mode muet, puis réactiver le son après la première interaction:

```typescript
const options = {
  autoplay: true,
  muted: true, // Autorise l'autoplay
  // ... autres options
};

// Réactiver le son après interaction
document.addEventListener('click', () => {
  player.muted(false);
}, { once: true });
```

**Note:** Ce problème est déjà corrigé dans la version actuelle (commit `0926ac3`).

**Flux utilisateur:**
1. Page charge → Vidéo démarre (MUET)
2. Utilisateur clique → Son activé + Plein écran
3. Lecture normale continue avec son

**Alternative pour environnement kiosque:**
```bash
# Lancer Chrome avec flag pour désactiver la restriction
chromium-browser --autoplay-policy=no-user-gesture-required --kiosk http://neopro.local
```

---

## 🔍 Commandes de Diagnostic

### Vérifier l'état RLS des tables

```sql
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

### Lister toutes les policies

```sql
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

### Tester les fonctions RLS

```sql
-- Doit retourner NULL (pas de contexte défini)
SELECT current_site_id(), is_admin(), current_user_id();

-- Définir un contexte de test
SELECT set_session_context(
  '123e4567-e89b-12d3-a456-426614174000'::UUID,
  '123e4567-e89b-12d3-a456-426614174001'::UUID,
  true
);

-- Doit retourner les valeurs définies
SELECT current_site_id(), is_admin(), current_user_id();

-- Réinitialiser
SELECT set_session_context(NULL, NULL, false);
```

### Vérifier les permissions utilisateur

```sql
SELECT
  rolname,
  rolsuper,
  rolbypassrls,
  rolcreaterole,
  rolcreatedb
FROM pg_roles
WHERE rolname = current_user;
```

---

## 🚑 Rollback Complet

Si vous devez complètement annuler toutes les migrations RLS:

```sql
-- =============================================================================
-- ⚠️ ATTENTION: Ceci supprime TOUTES les policies et fonctions RLS
-- =============================================================================

-- 1. Désactiver RLS sur toutes les tables
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;

-- 2. Supprimer toutes les policies
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
      r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- 3. Supprimer les fonctions RLS
DROP FUNCTION IF EXISTS set_session_context(UUID, UUID, BOOLEAN);
DROP FUNCTION IF EXISTS current_site_id();
DROP FUNCTION IF EXISTS is_admin();
DROP FUNCTION IF EXISTS current_user_id();

-- Vérification
SELECT COUNT(*) AS remaining_policies FROM pg_policies WHERE schemaname = 'public';
-- Doit retourner 0
```

---

## 📞 Support

Si vous rencontrez une erreur non documentée ici:

1. **Vérifier les logs PostgreSQL:**
   ```bash
   # Sur le serveur PostgreSQL
   tail -f /var/log/postgresql/postgresql-*.log
   ```

2. **Activer le mode verbose:**
   ```bash
   psql $DATABASE_URL -e -v ON_ERROR_STOP=1 -f migration.sql
   ```

3. **Consulter la documentation:**
   - [docs/ROW_LEVEL_SECURITY.md](../../../docs/ROW_LEVEL_SECURITY.md)
   - [migrations/README.md](./README.md)
   - [changelog/2025-12-16_rls-livescore-integration.md](../../../docs/changelog/2025-12-16_rls-livescore-integration.md)

4. **Créer une issue GitHub:**
   - Inclure le message d'erreur complet
   - Inclure la sortie de `SELECT version();`
   - Inclure les commandes exécutées

---

**Dernière mise à jour:** 16 décembre 2025
