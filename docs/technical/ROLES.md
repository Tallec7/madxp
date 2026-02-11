# Rôles et Permissions

> Modèle de permissions pour la plateforme Neopro — Central Server + Dashboard.

## Philosophie

Neopro utilise un **système de rôles hiérarchique** où chaque rôle hérite des capacités des rôles inférieurs. Le rôle `super_admin` est spécial : il **contourne toutes les vérifications de rôle** dans les middleware backend et les guards frontend.

## Rôles

```
super_admin (100)  ──── Accès total, bypass toutes les vérifications
    │
    ▼
  admin (80)  ────────── Gestion opérationnelle (pas users/abonnements)
    │
    ▼
  operator (60)  ─────── Opérations quotidiennes (sites assignés)
    │
    ▼
  viewer (40)  ───────── Lecture seule (sites assignés)

  advertiser (30)  ───── Portail annonceur (ses données uniquement)
  agency (20)  ────────── Portail agence (ses annonceurs uniquement)
```

| Rôle          | Niveau | Description                                                                                                                                  |
| ------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `super_admin` | 100    | Accès complet. Gère les utilisateurs, abonnements, tous les sites.                                                                           |
| `admin`       | 80     | Gère toutes les ressources opérationnelles (sites, contenu, analytics, mises à jour). Ne peut pas gérer les utilisateurs ni les abonnements. |
| `operator`    | 60     | Opérations quotidiennes sur les sites assignés : upload vidéos, déploiement, gestion contenu.                                                |
| `viewer`      | 40     | Accès lecture seule aux sites assignés et dashboards.                                                                                        |
| `advertiser`  | 30     | Gère son propre contenu publicitaire (vidéos, analytics). Limité à ses données.                                                              |
| `agency`      | 20     | Gère plusieurs annonceurs sous une même structure.                                                                                           |

### Convention de nommage

Le nom canonique du rôle utilise un underscore : `super_admin`. L'alias legacy `superadmin` (sans underscore) existe dans le type `UserRole` de la base de données et dans `ROLE_HIERARCHY` pour la compatibilité ascendante mais **ne doit pas être utilisé dans les définitions de routes ou les guards frontend**.

## Matrice de permissions

### Gestion utilisateurs

| Operation      | super_admin | admin | operator | viewer | advertiser | agency |
| -------------- | :---------: | :---: | :------: | :----: | :--------: | :----: |
| List users     |      x      |       |          |        |            |        |
| Create user    |      x      |       |          |        |            |        |
| Update user    |      x      |       |          |        |            |        |
| Delete user    |      x      |       |          |        |            |        |
| Reset password |      x      |       |          |        |            |        |

### Sites

| Operation            | super_admin | admin | operator | viewer | advertiser | agency |
| -------------------- | :---------: | :---: | :------: | :----: | :--------: | :----: |
| List sites           |      x      |   x   |    x     |   x    |            |        |
| Create site          |      x      |   x   |    x     |        |            |        |
| Update site          |      x      |   x   |    x     |        |            |        |
| Delete site          |      x      |   x   |          |        |            |        |
| Regenerate API key   |      x      |   x   |          |        |            |        |
| Fleet health         |      x      |   x   |          |        |            |        |
| Remote commands      |      x      |   x   |    x     |        |            |        |
| Debug connections    |      x      |   x   |          |        |            |        |
| View site (assigned) |      x      |   x   |    x     |   x    |            |        |

### Contenu (Vidéos)

| Operation         | super_admin | admin | operator | viewer | advertiser | agency |
| ----------------- | :---------: | :---: | :------: | :----: | :--------: | :----: |
| Upload video      |      x      |   x   |    x     |        |     x      |   x    |
| Deploy video      |      x      |   x   |    x     |        |            |        |
| Delete video      |      x      |   x   |          |        |            |        |
| Canary deployment |      x      |   x   |    x     |        |            |        |
| View videos       |      x      |   x   |    x     |   x    |     x      |   x    |

### Groups

| Operation    | super_admin | admin | operator | viewer | advertiser | agency |
| ------------ | :---------: | :---: | :------: | :----: | :--------: | :----: |
| CRUD groups  |      x      |   x   |    x     |        |            |        |
| Delete group |      x      |   x   |          |        |            |        |

### Updates

| Operation      | super_admin | admin | operator | viewer | advertiser | agency |
| -------------- | :---------: | :---: | :------: | :----: | :--------: | :----: |
| Upload package |      x      |   x   |          |        |            |        |
| Deploy update  |      x      |   x   |          |        |            |        |
| Rollback       |      x      |   x   |          |        |            |        |

### Analytics

| Operation       | super_admin | admin | operator | viewer | advertiser | agency |
| --------------- | :---------: | :---: | :------: | :----: | :--------: | :----: |
| View analytics  |      x      |   x   |    x     |   x    |     x      |   x    |
| CRUD categories |      x      |   x   |          |        |            |        |
| Export reports  |      x      |   x   |    x     |   x    |            |        |

### Advertisers

| Operation                 | super_admin | admin | operator | viewer | advertiser | agency |
| ------------------------- | :---------: | :---: | :------: | :----: | :--------: | :----: |
| Manage all advertisers    |      x      |   x   |          |        |            |        |
| Manage own content        |             |       |          |        |     x      |   x    |
| View own analytics        |             |       |          |        |     x      |   x    |
| Manage agency advertisers |             |       |          |        |            |   x    |

### Subscriptions

| Operation         | super_admin | admin | operator | viewer | advertiser | agency |
| ----------------- | :---------: | :---: | :------: | :----: | :--------: | :----: |
| Change plan       |      x      |       |          |        |            |        |
| View subscription |      x      |   x   |          |        |            |        |

### Administration

| Operation         | super_admin | admin | operator | viewer | advertiser | agency |
| ----------------- | :---------: | :---: | :------: | :----: | :--------: | :----: |
| View jobs/clients |      x      |   x   |          |        |            |        |
| Socket debug      |      x      |   x   |          |        |            |        |
| Benchmark         |      x      |   x   |          |        |            |        |
| Predictive alerts |      x      |   x   |          |        |            |        |
| Manage agencies   |      x      |   x   |          |        |            |        |

## Implémentation Backend

### Middleware (`central-server/src/middleware/auth.ts`)

```typescript
// requireRole() — super_admin bypasses all role checks
requireRole(...roles: string[])
// Example: requireRole('admin') allows both admin AND super_admin

// requireSuperAdmin() — explicit super_admin-only check
requireSuperAdmin()
// Example: user CRUD, subscription plan changes

// requireAdmin() — shortcut for requireRole('super_admin', 'admin')
requireAdmin()

// ROLE_HIERARCHY — numeric levels for comparison
ROLE_HIERARCHY = { super_admin: 100, superadmin: 100, admin: 80, ... }
```

**Comportement clé** : `requireRole('admin')` autorise implicitement `super_admin` via le bypass dans `requireRole()`. Les routes n'ont pas besoin de lister `super_admin` explicitement — il passe toujours.

### Quand utiliser chaque helper

| Helper                                       | Cas d'usage                           | Exemple                            |
| -------------------------------------------- | ------------------------------------- | ---------------------------------- |
| `requireSuperAdmin()`                        | Opérations exclusives super admin     | CRUD users, changement abonnement  |
| `requireRole('admin')`                       | Opérations admin (super_admin bypass) | Supprimer site, gérer mises à jour |
| `requireRole('admin', 'operator')`           | Opérations admin + operator           | Créer site, déployer vidéo         |
| `requireRole('admin', 'operator', 'viewer')` | Tous les rôles internes               | Voir sites, analytics              |

## Implémentation Frontend

### Guard (`auth.guard.ts`)

Les routes définissent les rôles autorisés via `data.roles`. Le `roleGuard` lit ces rôles et appelle `authService.hasRole()`.

### Service (`auth.service.ts`)

```typescript
hasRole(...roles: string[]): boolean {
  const user = this.getCurrentUser();
  if (!user) return false;
  // Super admin bypasses all role checks (mirrors backend behavior)
  if (user.role === 'super_admin') return true;
  return roles.includes(user.role);
}
```

Ce comportement miroir le backend : un utilisateur `super_admin` passe n'importe quel `hasRole()`, donc les routes n'ont pas besoin de lister `super_admin` explicitement dans leur `data.roles`.

---

## Frontière admin / super_admin (Phase 7.4)

Depuis février 2026, la frontière entre `admin` et `super_admin` est strictement appliquée :

| Opération                       | super_admin | admin |
| ------------------------------- | :---------: | :---: |
| Gestion utilisateurs (CRUD)     |     ✅      |  ❌   |
| Changement de plan d'abonnement |     ✅      |  ❌   |
| Suppression de site             |     ✅      |  ✅   |
| Régénération clé API            |     ✅      |  ✅   |

Le middleware `requireSuperAdmin()` est utilisé pour les opérations exclusives au super_admin, tandis que `requireRole('admin')` autorise implicitement le super_admin via le bypass hiérarchique.

---

**Dernière mise à jour** : 10 février 2026
