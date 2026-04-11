---
paths:
  - 'central-server/src/**'
  - 'central-dashboard/src/**'
---

# Patterns de Code

## Contrôleur Express

```typescript
export const getSite = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM sites WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Get site error:', { error, siteId: req.params.id });
    res.status(500).json({ error: 'Erreur serveur interne' });
  }
};
```

## Validation Joi

```typescript
const schema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
});
router.post('/login', validate(schemas.login), controller.login);
```

## Angular Standalone Component

```typescript
@Component({
  selector: 'app-sites-list',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `...`,
})
export class SitesListComponent implements OnInit {}
```

## Pagination Standard

```typescript
const { page = 1, limit = 20 } = req.query;
const offset = (page - 1) * limit;
res.json({ data: rows, pagination: { page, limit, total } });
```

## Conventions de nommage

| Type       | Convention           | Exemple                   |
| ---------- | -------------------- | ------------------------- |
| Fichiers   | kebab-case + suffixe | `sites.controller.ts`     |
| Classes    | PascalCase           | `DeploymentService`       |
| Fonctions  | camelCase + verbe    | `getSites`, `deployVideo` |
| Interfaces | PascalCase, pas de I | `interface User`          |

## Règles strictes

- **TypeScript strict** : pas de `any` sauf exception justifiée
- **Async/await** : jamais de callbacks, toujours try/catch
- **Logs structurés** : `logger.info('Action', { context })` — pas de string concat
- **Pas de console.log** : utiliser Winston logger
- **Requêtes SQL paramétrées** uniquement

## Fichiers critiques (review obligatoire)

- `central-server/src/middleware/auth.ts` — Auth JWT
- `central-server/src/config/database.ts` — Connexion DB
- `central-server/src/services/socket.service.ts` — Protocole Pi ↔ Cloud
- `raspberry/scripts/setup-new-club.sh` — Setup production

## NE JAMAIS FAIRE (smoke test enforced)

- Retourner `'0 B'` dans `formatBytes()` pour `null`/`undefined` (masque les vidéos à taille inconnue — retourner `'-'` pour null/undefined, réserver `'0 B'` pour un vrai 0)
