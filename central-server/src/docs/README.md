# Documentation API NEOPRO

Cette documentation OpenAPI/Swagger documente l'ensemble des endpoints REST de l'API centrale NEOPRO.

## Fichiers

### openapi.yaml (Principal)
Documente les endpoints fondamentaux:
- **Authentication** (`/api/auth/*`) - Login, logout, JWT
- **MFA** (`/api/mfa/*`) - Authentification 2FA
- **Sites** (`/api/sites/*`) - Gestion boîtiers Raspberry Pi
- **Groups** (`/api/groups/*`) - Groupes de sites
- **Videos** (`/api/videos/*`) - Contenu vidéo
- **Deployments** (`/api/deployments/*`) - Déploiements contenu
- **Canary** (`/api/canary/*`) - Déploiements progressifs
- **Updates** (`/api/updates/*`) - Mises à jour logicielles
- **Audit** (`/api/audit/*`) - Logs d'audit
- **System** (`/health`) - Health checks

### openapi-analytics-sponsors.yaml (Extension)
Documente les modules Analytics:
- **Analytics Club** (`/api/analytics/clubs/*`) - Métriques clubs
- **Sponsors** (`/api/sponsors/*`) - Gestion sponsors
- **Analytics Sponsors** (`/api/sponsors/*/stats`, `/api/analytics/impressions`) - Tracking sponsors

## Visualiser la documentation

### Option 1: Swagger UI (Local)

```bash
cd central-server
npm install -g swagger-ui

# Terminal 1: Lancer l'API
npm run dev

# Terminal 2: Lancer Swagger UI
swagger-ui -p 8081 src/docs/openapi.yaml
```

Ouvrir: http://localhost:8081

### Option 2: Swagger Editor en ligne

1. Aller sur https://editor.swagger.io
2. Fichier > Import File
3. Sélectionner `openapi.yaml`
4. Naviguer dans la doc

### Option 3: VS Code Extension

Installer: [OpenAPI (Swagger) Editor](https://marketplace.visualstudio.com/items?itemName=42Crunch.vscode-openapi)

```bash
code src/docs/openapi.yaml
# Ctrl+Shift+P > "OpenAPI: Show preview"
```

### Option 4: Redoc (Recommandé pour production)

```bash
npm install -g redoc-cli

# Générer HTML statique
redoc-cli bundle src/docs/openapi.yaml -o public/api-docs.html

# Servir
npx serve public
```

## Tester les endpoints

### Avec Swagger UI

1. Lancer Swagger UI (voir ci-dessus)
2. Cliquer sur "Authorize" 🔒
3. Obtenir un token:
   ```bash
   curl -X POST http://localhost:3001/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@neopro.fr","password":"your_password"}'
   ```
4. Copier le `token` de la réponse
5. Dans Swagger UI: Coller dans "Bearer Token"
6. Tester les endpoints interactivement

### Avec curl

```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@neopro.fr","password":"password"}' \
  | jq -r '.token')

# 2. Requête authentifiée
curl -X GET http://localhost:3001/api/sites \
  -H "Authorization: Bearer $TOKEN"

# 3. Créer un sponsor
curl -X POST http://localhost:3001/api/sponsors \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sponsor Test",
    "contact_email": "contact@sponsor.fr",
    "status": "active"
  }'
```

### Avec Postman

1. Importer la collection:
   - File > Import > File
   - Sélectionner `openapi.yaml`
2. Configurer l'authentification:
   - Collection > Authorization
   - Type: Bearer Token
   - Token: {{token}}
3. Créer une requête Pre-request Script:
   ```javascript
   pm.sendRequest({
     url: 'http://localhost:3001/api/auth/login',
     method: 'POST',
     header: { 'Content-Type': 'application/json' },
     body: {
       mode: 'raw',
       raw: JSON.stringify({
         email: 'admin@neopro.fr',
         password: 'password'
       })
     }
   }, (err, res) => {
     if (!err) {
       pm.environment.set('token', res.json().token);
     }
   });
   ```

## Générer des clients SDK

### TypeScript/JavaScript

```bash
npm install -g openapi-generator-cli

# Générer client TypeScript
openapi-generator-cli generate \
  -i src/docs/openapi.yaml \
  -g typescript-axios \
  -o ../sdk/typescript

# Utiliser
cd ../sdk/typescript
npm install
```

```typescript
import { Configuration, SitesApi } from './sdk/typescript';

const config = new Configuration({
  basePath: 'http://localhost:3001',
  accessToken: 'your-jwt-token'
});

const sitesApi = new SitesApi(config);
const sites = await sitesApi.getSites();
```

### Python

```bash
openapi-generator-cli generate \
  -i src/docs/openapi.yaml \
  -g python \
  -o ../sdk/python
```

### Autres langages

Supportés: Java, Go, Ruby, PHP, C#, Swift, Kotlin...

Voir: https://openapi-generator.tech/docs/generators/

## Intégrer Swagger UI dans l'app

### Option 1: Express Middleware

```bash
npm install swagger-ui-express yamljs
```

```typescript
// central-server/src/server.ts
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';

const swaggerDocument = YAML.load('./src/docs/openapi.yaml');

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'NEOPRO API Docs'
}));
```

Accéder à: http://localhost:3001/api-docs

### Option 2: Redoc

```bash
npm install redoc-express
```

```typescript
import { redoc } from 'redoc-express';

app.get('/api-docs', redoc({
  title: 'NEOPRO API Docs',
  specUrl: '/api-docs/openapi.yaml',
  nonce: '', // optional
  redocOptions: {
    theme: {
      colors: {
        primary: { main: '#dd5522' }
      }
    }
  }
}));

// Servir le fichier YAML
app.get('/api-docs/openapi.yaml', (req, res) => {
  res.sendFile(path.join(__dirname, 'docs/openapi.yaml'));
});
```

## Validation automatique des requêtes

### express-openapi-validator

```bash
npm install express-openapi-validator
```

```typescript
import * as OpenApiValidator from 'express-openapi-validator';

app.use(
  OpenApiValidator.middleware({
    apiSpec: './src/docs/openapi.yaml',
    validateRequests: true,
    validateResponses: true
  })
);

// Les requêtes seront automatiquement validées contre le schéma
```

**Avantages:**
- Validation automatique des body/query/params
- Erreurs 400 si requête invalide
- Documentation = source de vérité

## Maintenance de la documentation

### Générer automatiquement depuis les routes

**Bibliothèques recommandées:**
- [tsoa](https://github.com/lukeautry/tsoa) - Génère OpenAPI depuis décorateurs TypeScript
- [swagger-jsdoc](https://github.com/Surnet/swagger-jsdoc) - Génère depuis JSDoc comments

**Exemple tsoa:**

```typescript
import { Controller, Get, Route, Tags } from 'tsoa';

@Route('api/sites')
@Tags('Sites')
export class SitesController extends Controller {
  @Get('/')
  public async getSites(): Promise<Site[]> {
    // ...
  }

  @Get('{id}')
  public async getSite(id: string): Promise<Site> {
    // ...
  }
}

// Génère openapi.yaml automatiquement
```

### Tests de cohérence

```typescript
// __tests__/openapi-spec.test.ts
import fs from 'fs';
import YAML from 'yamljs';

describe('OpenAPI Specification', () => {
  it('should be valid YAML', () => {
    const spec = YAML.load('./src/docs/openapi.yaml');
    expect(spec).toBeDefined();
    expect(spec.openapi).toBe('3.0.3');
  });

  it('should document all routes', () => {
    const spec = YAML.load('./src/docs/openapi.yaml');
    const paths = Object.keys(spec.paths);

    expect(paths).toContain('/api/auth/login');
    expect(paths).toContain('/api/sites');
    expect(paths).toContain('/api/sponsors');
    // etc.
  });

  it('should have security on protected routes', () => {
    const spec = YAML.load('./src/docs/openapi.yaml');
    const sitesGet = spec.paths['/api/sites'].get;

    expect(sitesGet.security).toBeDefined();
  });
});
```

## Déploiement documentation

### Héberger sur GitHub Pages

```bash
# 1. Générer HTML statique
redoc-cli bundle src/docs/openapi.yaml -o docs/index.html

# 2. Commit
git add docs/index.html
git commit -m "docs: update API documentation"
git push

# 3. Activer GitHub Pages
# Settings > Pages > Source: docs/
```

Accéder: https://votreorg.github.io/neopro/

### Héberger sur Netlify/Vercel

```bash
# 1. Créer dossier public/
mkdir -p public
redoc-cli bundle src/docs/openapi.yaml -o public/index.html

# 2. Deploy
npx vercel public/
# ou
npx netlify deploy --dir=public --prod
```

## Exemples avancés

### Télécharger un PDF

```bash
TOKEN="your-jwt-token"

# Rapport sponsor PDF
curl -X GET "http://localhost:3001/api/sponsors/sponsor-id/report/pdf?startDate=2025-01-01&endDate=2025-12-31" \
  -H "Authorization: Bearer $TOKEN" \
  -o sponsor-report.pdf

# Rapport club PDF
curl -X GET "http://localhost:3001/api/clubs/site-id/report/pdf?startDate=2025-01-01&endDate=2025-12-31" \
  -H "Authorization: Bearer $TOKEN" \
  -o club-report.pdf
```

### Export CSV

```bash
# Export analytics club
curl -X GET "http://localhost:3001/api/analytics/clubs/site-id/export?startDate=2025-01-01&endDate=2025-12-31&format=csv" \
  -H "Authorization: Bearer $TOKEN" \
  -o analytics.csv

# Export sponsor
curl -X GET "http://localhost:3001/api/sponsors/sponsor-id/export?startDate=2025-01-01&endDate=2025-12-31&format=csv" \
  -H "Authorization: Bearer $TOKEN" \
  -o sponsor.csv
```

### Batch impressions (Raspberry Pi)

```bash
# Enregistrer impressions sponsors
curl -X POST http://localhost:3001/api/analytics/impressions \
  -H "Content-Type: application/json" \
  -d '{
    "impressions": [
      {
        "site_id": "site-uuid",
        "video_id": "video-uuid",
        "played_at": "2025-12-16T14:30:00Z",
        "duration_played": 28,
        "video_duration": 30,
        "completed": true,
        "event_type": "match",
        "period": "halftime",
        "trigger_type": "auto",
        "audience_estimate": 150,
        "home_score": 15,
        "away_score": 12
      }
    ]
  }'
```

## Références

- [OpenAPI Specification 3.0.3](https://spec.openapis.org/oas/v3.0.3)
- [Swagger UI](https://swagger.io/tools/swagger-ui/)
- [Redoc](https://redoc.ly/)
- [OpenAPI Generator](https://openapi-generator.tech/)
- [Express OpenAPI Validator](https://github.com/cdimascio/express-openapi-validator)

## Support

Pour toute question sur l'API:
- **Documentation**: [docs/](../../../docs/)
- **Issues**: https://github.com/neopro/neopro/issues
- **Email**: support@neopro.fr

---

**Dernière mise à jour**: 16 décembre 2025
