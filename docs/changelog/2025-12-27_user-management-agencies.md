# Changelog - 27 décembre 2025

## Gestion Utilisateurs, Agences & Corrections UI/Auth

### Migrations SQL exécutées

#### 1. Migration `add-sponsor-agency-roles.sql`

Ajout du système multi-tenant avec nouveaux rôles :

- **Contrainte de rôle étendue** : `super_admin`, `admin`, `operator`, `viewer`, `sponsor`, `agency`
- **Table `agencies`** : Gestion des agences partenaires
- **Table `agency_sites`** : Association agences <-> sites
- **Table `sponsor_sites`** : Association sponsors <-> sites
- **Colonnes `sponsor_id` et `agency_id`** sur table `users`
- **Vues SQL** : `sponsor_accessible_sites`, `agency_accessible_sites`, `sponsor_stats_summary`, `agency_stats_summary`

#### 2. Migration `add-password-reset-tokens.sql`

Table pour la fonctionnalité de réinitialisation de mot de passe admin :

- **Table `password_reset_tokens`** : Stockage des tokens de reset
- Expiration automatique après 1 heure
- Liaison avec table `users`

### Corrections CSS

Les composants utilisaient des classes Tailwind CSS non configurées dans le projet Angular.

#### Fichiers réécrits avec CSS natif :

**`users-management.component.ts`**

- Interface CRUD complète pour gestion utilisateurs
- Tableau avec tri et filtres par rôle
- Modales création/édition/suppression
- Styles inline en CSS natif

**`agencies-management.component.ts`**

- Interface CRUD pour gestion des agences
- Tableau avec informations de contact
- Modales création/édition
- Styles inline en CSS natif

### Corrections d'autorisation

#### Erreur 403 sur `/api/users`

**Problème** : L'endpoint POST `/api/users` requiert le rôle `super_admin` mais l'utilisateur avait seulement `admin`.

**Solution** : Mise à jour en base de données

```sql
UPDATE users SET role = 'super_admin' WHERE email = 'admin@neopro.fr';
```

#### Navigation manquante pour super_admin

**Problème** : Les méthodes `isAdmin()` et `canManageContent()` dans `layout.component.ts` ne vérifiaient que le rôle `admin`, pas `super_admin`.

**Solution** : Modification des méthodes pour inclure les deux rôles

```typescript
// layout.component.ts - AVANT
isAdmin(): boolean {
  return this.authService.hasRole('admin');
}

// layout.component.ts - APRÈS
isAdmin(): boolean {
  return this.authService.hasRole('admin', 'super_admin');
}

canManageContent(): boolean {
  return this.authService.hasRole('admin', 'super_admin', 'operator');
}
```

### Fichiers modifiés

| Fichier                                                                              | Changement                    |
| ------------------------------------------------------------------------------------ | ----------------------------- |
| `central-dashboard/src/app/features/admin/users/users-management.component.ts`       | Réécriture CSS natif          |
| `central-dashboard/src/app/features/admin/agencies/agencies-management.component.ts` | Réécriture CSS natif          |
| `central-dashboard/src/app/features/layout/layout.component.ts`                      | Fix role checks `super_admin` |
| `central-dashboard/src/assets/i18n/fr.json`                                          | Traductions admin             |

### Endpoints API concernés

| Route                           | Méthode | Rôle requis        | Description           |
| ------------------------------- | ------- | ------------------ | --------------------- |
| `/api/users`                    | GET     | admin, super_admin | Liste utilisateurs    |
| `/api/users`                    | POST    | super_admin        | Créer utilisateur     |
| `/api/users/:id`                | PUT     | super_admin        | Modifier utilisateur  |
| `/api/users/:id`                | DELETE  | super_admin        | Supprimer utilisateur |
| `/api/users/:id/reset-password` | POST    | super_admin        | Reset mot de passe    |
| `/api/agencies`                 | GET     | admin, super_admin | Liste agences         |
| `/api/agencies`                 | POST    | super_admin        | Créer agence          |
| `/api/agencies/:id`             | PUT     | super_admin        | Modifier agence       |
| `/api/agencies/:id/sites`       | POST    | super_admin        | Associer sites        |

### Connexion Supabase

La connexion à Supabase nécessite une adresse IPv6 directe en raison de problèmes de résolution DNS :

```bash
# Connexion fonctionnelle
psql "postgres://postgres:GG_NEO_25k%21@[2a05:d01c:30c:9d26:3077:6163:d3d1:7263]:5432/postgres?sslmode=require"
```

---

**Commits de la session :**

- `fix(ui): Replace Tailwind classes with native CSS in users-management component`
- `fix(ui): Replace Tailwind classes with native CSS in agencies-management component`
- `fix(auth): Include super_admin role in layout permission checks`
