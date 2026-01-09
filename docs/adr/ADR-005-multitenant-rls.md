# ADR-005: Multi-tenant avec Row-Level Security

**Date** : Novembre 2024
**Statut** : Accepté
**Décideurs** : Équipe technique Neopro

---

## Contexte

Neopro est une plateforme multi-tenant avec différents niveaux d'accès :

| Rôle | Accès |
|------|-------|
| super_admin | Tout |
| admin | Tous les sites |
| operator | Sites assignés uniquement |
| advertiser | Ses vidéos et stats uniquement |
| agency | Ses annonceurs et leurs données |
| viewer | Lecture seule sur sites autorisés |

Contraintes :
- Isolation stricte des données
- Performance : pas de dégradation avec 50+ sites
- Maintenance : éviter la duplication de code de filtrage

## Décision

Implémenter l'isolation via **Row-Level Security (RLS)** de PostgreSQL :

```sql
-- Politique sur la table sites
CREATE POLICY sites_access ON sites
  FOR ALL
  USING (
    current_setting('app.user_role') = 'super_admin'
    OR current_setting('app.user_role') = 'admin'
    OR id = ANY(
      SELECT site_id FROM operator_sites
      WHERE user_id = current_setting('app.user_id')::uuid
    )
  );

-- Activation
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
```

## Alternatives Considérées

### 1. Filtrage applicatif (WHERE dans chaque requête)

**Avantages** :
- Simple à comprendre
- Pas de configuration DB

**Inconvénients** :
- Duplication de code
- Risque d'oubli (faille de sécurité)
- Difficile à maintenir

**Verdict** : Rejeté - Trop risqué, maintenance difficile.

### 2. Schema par tenant

**Avantages** :
- Isolation totale
- Performance optimale par tenant

**Inconvénients** :
- Complexité migrations
- Overhead : 50+ schemas
- Cross-tenant queries impossibles

**Verdict** : Rejeté - Overkill pour notre nombre de tenants.

### 3. Base de données par tenant

**Avantages** :
- Isolation maximale
- Backup/restore individuel

**Inconvénients** :
- Coût infrastructure élevé
- Gestion connexions complexe
- Impossible pour analytics cross-tenant

**Verdict** : Rejeté - Coût prohibitif.

### 4. Row-Level Security (RLS) ✅

**Avantages** :
- **Sécurité garantie** : Filtre au niveau DB, impossible à contourner
- **DRY** : Politique définie une fois, appliquée partout
- **Performance** : Optimiseur PostgreSQL intègre les filtres
- **Audit** : Politiques versionnées avec le schéma

**Inconvénients** :
- Complexité initiale de configuration
- Debug parfois difficile
- Nécessite `set_config` pour le contexte

**Verdict** : Accepté - Sécurité maximale avec maintenance minimale.

## Conséquences

### Positives

1. **Sécurité** : Impossible d'accéder aux données non autorisées
2. **Maintenance** : Une seule source de vérité pour les règles d'accès
3. **Performance** : PostgreSQL optimise automatiquement
4. **Audit** : Les politiques sont des objets DB versionnables

### Négatives

1. **Complexité setup** : Politiques à définir pour chaque table
2. **Debug** : Erreurs RLS parfois cryptiques
3. **Tests** : Nécessite de simuler le contexte

## Implémentation

### Middleware pour Contexte

```typescript
// middleware/rls-context.ts
export const setRlsContext = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { user } = req;

  await query(`SELECT set_config('app.user_id', $1, true)`, [user.id]);
  await query(`SELECT set_config('app.user_role', $1, true)`, [user.role]);

  if (user.advertiserId) {
    await query(`SELECT set_config('app.advertiser_id', $1, true)`, [user.advertiserId]);
  }

  next();
};
```

### Politiques Principales

```sql
-- Sites (par rôle)
CREATE POLICY sites_policy ON sites USING (
  current_setting('app.user_role') IN ('super_admin', 'admin')
  OR id = ANY(get_operator_sites(current_setting('app.user_id')::uuid))
);

-- Vidéos (par advertiser)
CREATE POLICY videos_policy ON videos USING (
  current_setting('app.user_role') IN ('super_admin', 'admin')
  OR uploaded_by = current_setting('app.user_id')::uuid
  OR id = ANY(
    SELECT video_id FROM advertiser_videos
    WHERE advertiser_id = current_setting('app.advertiser_id')::uuid
  )
);

-- Analytics (par site accessible)
CREATE POLICY analytics_policy ON video_plays USING (
  site_id = ANY(get_accessible_sites())
);
```

### Hiérarchie des Rôles

```
super_admin
    │
    └── admin
         │
         ├── operator (sites assignés)
         │
         ├── advertiser (ses pubs)
         │
         ├── agency (ses annonceurs)
         │
         └── viewer (lecture seule)
```

### Fonctions Helper

```sql
-- Sites accessibles pour l'utilisateur courant
CREATE FUNCTION get_accessible_sites() RETURNS uuid[] AS $$
DECLARE
  role text := current_setting('app.user_role', true);
  user_id uuid := current_setting('app.user_id', true)::uuid;
BEGIN
  IF role IN ('super_admin', 'admin') THEN
    RETURN ARRAY(SELECT id FROM sites);
  ELSIF role = 'operator' THEN
    RETURN ARRAY(SELECT site_id FROM operator_sites WHERE user_id = user_id);
  ELSE
    RETURN ARRAY[]::uuid[];
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Tests

```typescript
// Test isolation operator
it('operator sees only assigned sites', async () => {
  await setTestContext({ role: 'operator', userId: operatorId });

  const result = await query('SELECT * FROM sites');

  expect(result.rows).toHaveLength(2); // Seulement sites assignés
  expect(result.rows.map(r => r.id)).not.toContain(unassignedSiteId);
});
```

## Références

- [RLS_SECURITY.md](../technical/RLS_SECURITY.md)
- [full-schema.sql](../../central-server/src/scripts/full-schema.sql)
- [rls-context middleware](../../central-server/src/middleware/rls-context.ts)

---

*Créé le 9 janvier 2026*
