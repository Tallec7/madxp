# Roles & Permissions

> Permission model for the Neopro platform — Central Server + Dashboard.

## Philosophy

Neopro uses a **hierarchical role system** where each role inherits the capabilities of the roles below it. The `super_admin` role is special: it **bypasses all role checks** in both backend middleware and frontend guards.

## Roles

| Role          | Level | Description                                                                                                   |
| ------------- | ----- | ------------------------------------------------------------------------------------------------------------- |
| `super_admin` | 100   | Full platform access. Manages users, subscriptions, all sites.                                                |
| `admin`       | 80    | Manages all operational resources (sites, content, analytics, updates). Cannot manage users or subscriptions. |
| `operator`    | 60    | Day-to-day operations on assigned sites: upload videos, deploy, manage content.                               |
| `viewer`      | 40    | Read-only access to assigned sites and dashboards.                                                            |
| `advertiser`  | 30    | Manages own advertising content (videos, analytics). Scoped to own data.                                      |
| `agency`      | 20    | Manages multiple advertisers under one umbrella.                                                              |

### Naming convention

The canonical role name uses an underscore: `super_admin`. The legacy alias `superadmin` (no underscore) exists in the database `UserRole` type and `ROLE_HIERARCHY` for backward compatibility but **must not be used in route definitions or frontend guards**.

## Permission Matrix

### User Management

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

### Content (Videos)

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

## Backend Implementation

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

**Key behavior**: `requireRole('admin')` implicitly allows `super_admin` via the bypass in `requireRole()`. This means routes don't need to list `super_admin` explicitly — it always passes.

### When to use each helper

| Helper                                       | Use case                                | Example                         |
| -------------------------------------------- | --------------------------------------- | ------------------------------- |
| `requireSuperAdmin()`                        | Super admin exclusive operations        | User CRUD, subscription changes |
| `requireRole('admin')`                       | Admin operations (super_admin bypasses) | Delete site, manage updates     |
| `requireRole('admin', 'operator')`           | Admin + operator operations             | Create site, deploy video       |
| `requireRole('admin', 'operator', 'viewer')` | All internal roles                      | View sites, analytics           |

## Frontend Implementation

### Guard (`auth.guard.ts`)

Routes define allowed roles in `data.roles`. The `roleGuard` reads these and calls `authService.hasRole()`.

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

This mirrors the backend bypass: a `super_admin` user passes any `hasRole()` check, so routes don't need to list `super_admin` explicitly in their `data.roles` array.
