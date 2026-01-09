# ADR-004: JWT avec HttpOnly Cookies

**Date** : Novembre 2024
**Statut** : Accepté
**Décideurs** : Équipe technique Neopro

---

## Contexte

Le dashboard central nécessite une authentification sécurisée pour :

1. **Protéger les données** : Analytics, configuration des sites, vidéos
2. **Gérer les rôles** : super_admin, admin, operator, advertiser, agency, viewer
3. **Supporter le MFA** : Authentification à deux facteurs optionnelle

Contraintes :
- Application SPA (Angular)
- API REST stateless
- Protection contre XSS et CSRF
- Sessions longue durée (7 jours)

## Décision

Utiliser **JWT** stocké dans un **cookie HttpOnly** :

```typescript
// Création du token (auth.controller.ts)
const token = jwt.sign(
  { userId, role, advertiserId },
  JWT_SECRET,
  { expiresIn: '7d' }
);

// Stockage dans cookie HttpOnly
res.cookie('neopro_token', token, {
  httpOnly: true,      // Inaccessible à JavaScript
  secure: true,        // HTTPS uniquement
  sameSite: 'strict',  // Protection CSRF
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 jours
});
```

## Alternatives Considérées

### 1. JWT dans localStorage

**Avantages** :
- Simple à implémenter
- Fonctionne cross-origin facilement

**Inconvénients** :
- Vulnérable aux attaques XSS
- Accessible via JavaScript (`localStorage.getItem`)
- Pas de révocation facile

**Verdict** : Rejeté - Risque XSS trop élevé.

### 2. Sessions côté serveur (express-session)

**Avantages** :
- Révocation instantanée
- État minimal côté client

**Inconvénients** :
- Nécessite stockage sessions (Redis)
- Sticky sessions si multi-instance
- Plus complexe à scaler

**Verdict** : Rejeté - Complexité infrastructure.

### 3. JWT dans cookie non-HttpOnly

**Avantages** :
- Accessible côté client pour UI
- Envoi automatique

**Inconvénients** :
- Toujours vulnérable XSS

**Verdict** : Rejeté - Pas d'amélioration sécurité.

### 4. JWT HttpOnly Cookie ✅

**Avantages** :
- **Protection XSS** : Cookie inaccessible à JavaScript
- **Protection CSRF** : `sameSite: 'strict'`
- **Stateless** : Pas de session serveur
- **Automatique** : Envoyé avec chaque requête

**Inconvénients** :
- Pas d'accès au payload côté client
- Nécessite endpoint `/api/auth/me` pour récupérer l'utilisateur

**Verdict** : Accepté - Meilleur compromis sécurité/simplicité.

### 5. OAuth2 / OIDC externe

**Avantages** :
- SSO possible
- Délègue la sécurité

**Inconvénients** :
- Dépendance externe
- Complexité configuration
- Overkill pour notre use case

**Verdict** : Rejeté - Prématuré, pourrait être ajouté plus tard.

## Conséquences

### Positives

1. **Sécurité** : Protection XSS + CSRF natives
2. **Simplicité** : Pas de gestion de sessions serveur
3. **Performance** : Validation JWT locale (pas de DB lookup)
4. **Scalabilité** : Stateless, multi-instance sans problème

### Négatives

1. **Révocation** : Impossible de révoquer un JWT avant expiration
2. **Payload invisible** : Le frontend doit appeler `/api/auth/me`

### Mitigation Révocation

```typescript
// Vérification optionnelle en DB pour révocation
const isRevoked = await checkTokenRevocation(decoded.userId, decoded.iat);
if (isRevoked) throw new UnauthorizedError('Token révoqué');
```

## Implémentation

### Middleware Auth

```typescript
// middleware/auth.ts
export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies.neopro_token || req.headers.authorization?.split(' ')[1];

  if (!token) throw new UnauthorizedError('Token manquant');

  const decoded = jwt.verify(token, JWT_SECRET);
  req.user = decoded;
  next();
};
```

### Flux de Login

```
1. POST /api/auth/login { email, password }
2. Vérification bcrypt
3. (Optionnel) Vérification MFA TOTP
4. Génération JWT
5. Set-Cookie: neopro_token=xxx; HttpOnly; Secure; SameSite=Strict
6. Response: { user: { id, email, role } }
```

### Configuration CORS

```typescript
// server.ts
app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true  // Requis pour cookies cross-origin
}));
```

## MFA (Multi-Factor Authentication)

Implémenté via TOTP (RFC 6238) :

```typescript
// Activation MFA
POST /api/auth/mfa/enable → { secret, qrCode }

// Vérification login avec MFA
POST /api/auth/login { email, password, mfaToken }
```

Backup codes générés à l'activation (10 codes à usage unique).

## Références

- [auth.ts](../../central-server/src/middleware/auth.ts)
- [auth.controller.ts](../../central-server/src/controllers/auth.controller.ts)
- [mfa.service.ts](../../central-server/src/services/mfa.service.ts)

---

*Créé le 9 janvier 2026*
