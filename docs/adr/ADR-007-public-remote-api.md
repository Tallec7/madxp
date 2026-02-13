# ADR-007: API Remote Publique (sans Authentification JWT)

**Date** : Janvier 2026 (documenté rétroactivement)
**Statut** : Accepté
**Décideurs** : Équipe technique Neopro

---

## Contexte

La télécommande Cloud Remote permet de contrôler un site à distance via `https://dashboard.neopro.tv/remote/{siteId}`. Elle est utilisée par le staff des clubs (bénévoles, responsables sportifs) qui scannent un QR code avec leur téléphone personnel.

Contraintes :

1. **Pas de compte utilisateur** : Les bénévoles n'ont pas de login Neopro
2. **Accès immédiat** : Scanner le QR code → télécommande fonctionnelle en 2 secondes
3. **Réseaux variés** : Le téléphone peut être sur le hotspot du club, le WiFi du lieu, ou la 4G
4. **Cas mesh WiFi** : L'isolation client peut bloquer l'accès local à `/remote`

## Décision

Les endpoints `/api/remote/*` sont **volontairement publics** (pas d'authentification JWT) :

```
GET  /api/remote/:siteId/state      → État du site + licence + recording state (public)
POST /api/remote/:siteId/verify-pin → Vérifier PIN → JWT token (public)
POST /api/remote/:siteId/command    → Envoyer une commande (public, PIN-protégé si configuré)
GET  /api/remote/:siteId/videos     → Liste vidéos (public, PIN-protégé si configuré)
```

**Sécurité sans JWT** :

- **UUID du site** : 128 bits d'entropie, impossible à deviner par force brute
- **Rate limiting** : 30 req/min par IP (sensitiveRateLimit)
- **Site online requis** : Les commandes ne sont relayées que si le Pi est connecté
- **PIN optionnel** : 4-6 chiffres (SHA-256), protection brute-force (5 tentatives / 10 min), JWT token 24h après vérification

**Données publiques exposées** :

- `licenseStatus` : Toujours retourné (même sans PIN), expose uniquement le statut et les compteurs — pas de données sensibles
- `recordingState` : État éphémère (isRecording, isManualOverride), stocké en mémoire uniquement

## Alternatives Considérées

### 1. Authentification JWT classique (login/password)

**Avantages** :

- Sécurité standard
- Traçabilité par utilisateur

**Inconvénients** :

- Le bénévole doit créer un compte et se souvenir du mot de passe
- Le scan du QR code mène à une page de login → friction fatale
- La plupart des clubs ont 10-15 bénévoles qui changent chaque saison

**Verdict** : Rejeté - La friction tue l'usage. Un bénévole qui tombe sur un login ne reviendra pas.

### 2. Token temporaire dans le QR code

**Avantages** :

- Pas de login
- Token à durée limitée

**Inconvénients** :

- Le QR code doit être régénéré régulièrement
- Si le QR code est imprimé (affiche), il expire
- Complexité de gestion des tokens

**Verdict** : Rejeté - Trop complexe pour le use case (QR code imprimé dans le club).

### 3. PIN simple (4-6 chiffres)

**Avantages** :

- Facile à retenir
- Pas besoin de compte

**Inconvénients** :

- Espace d'entropie faible (10^4 à 10^6) → brute-forceable
- Il faut communiquer le PIN au staff
- Nécessite un écran de saisie supplémentaire

**Verdict** : Rejeté - Sécurité insuffisante et friction ajoutée.

### 4. UUID comme seul secret ✅

**Avantages** :

- **Zéro friction** : QR code → télécommande instantanée
- **Entropie suffisante** : UUID v4 = 122 bits aléatoires
- **QR code stable** : Peut être imprimé et affiché durablement
- **Simple** : Pas de gestion de tokens/sessions

**Inconvénients** :

- Si l'UUID fuite, n'importe qui peut envoyer des commandes
- Pas de traçabilité par utilisateur (uniquement par IP)

**Verdict** : Accepté - Le risque est minime (le pire = quelqu'un change le score à distance) et le gain UX est massif.

## Conséquences

### Positives

1. **Adoption** : Le staff utilise réellement la télécommande (zéro friction)
2. **Universalité** : Fonctionne sur tout téléphone, tout navigateur, tout réseau
3. **Simplicité** : Pas de gestion de comptes pour les bénévoles

### Négatives

1. **Pas de traçabilité** : On sait l'IP mais pas qui a envoyé la commande
2. **Fuite possible** : Si l'URL est partagée publiquement, des tiers peuvent interagir
3. **Pas de permissions** : Tout utilisateur avec l'URL peut tout faire (score, vidéos, etc.)

### Mitigations

| Risque                               | Mitigation                                 |
| ------------------------------------ | ------------------------------------------ |
| UUID dans les logs serveur           | Logs d'accès par IP, rate limiting         |
| Abus externe                         | Rate limit 30 req/min par IP               |
| Spam de commandes                    | Le site doit être online pour recevoir     |
| URL partagée sur les réseaux sociaux | Possibilité de régénérer l'API key du site |

### Impact sur l'intercepteur Angular

L'intercepteur HTTP du dashboard exclut `/api/remote/` de la redirection vers login en cas de 401 :

```typescript
// auth.interceptor.ts
if (error.status === 401 && !req.url.includes('/api/remote/')) {
  this.authService.logout();
}
```

## Évolutions (février 2026)

### PIN optionnel (v2.33)

Les clubs peuvent configurer un PIN 4-6 chiffres pour protéger l'accès cloud remote. Le PIN est stocké en SHA-256 côté serveur. Après vérification (`POST /verify-pin`), un JWT token 24h est retourné et stocké en localStorage. Protection brute-force : max 5 tentatives par IP+site en 10 minutes.

### Licence + REC (v3.21+)

L'endpoint `GET /state` retourne désormais `licenseStatus` (statut, daysLeft, messageRemote...) et `recordingState` (isRecording, isManualOverride). La commande `recording-toggle` a été ajoutée aux commandes valides. Le recording state est éphémère (Map en mémoire côté serveur), alimenté par le heartbeat du Pi.

## Références

- [remote.controller.ts](../../central-server/src/controllers/remote.controller.ts) - Endpoints publics
- [remote.routes.ts](../../central-server/src/routes/remote.routes.ts) - Routes sans middleware authenticate
- [remote-pin.middleware.ts](../../central-server/src/middleware/remote-pin.middleware.ts) - PIN vérification + JWT
- [cloud-remote.component.ts](../../central-dashboard/src/app/features/remote/cloud-remote.component.ts) - UI
- [auth.interceptor.ts](../../central-dashboard/src/app/core/interceptors/auth.interceptor.ts) - Exclusion remote

---

_Créé le 11 février 2026_
