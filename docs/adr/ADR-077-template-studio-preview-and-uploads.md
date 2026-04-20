# ADR-077: Template Studio — preview via @remotion/player + upload-asset ouvert aux authenticated

**Date** : 2026-04-20
**Statut** : Accepté
**Format** : Léger
**Lié** : ADR-075 (Template Studio v2), ADR-054 (async Remotion render)

---

## Contexte

ADR-075 Sprint 2 (studio user mode) a besoin de deux décisions transverses non tranchées par l'ADR parent :

1. **Preview live** : comment rendre l'aperçu vidéo côté dashboard Angular (itération form → preview < 400ms) ?
2. **Upload image user** : l'endpoint `POST /api/remotion-templates/upload-asset` était prévu super_admin-only dans ADR-075, mais US-3 (club upload photo joueur) nécessite l'accès aux rôles non super_admin.

Ces deux choix impactent dashboard + central-server et méritent un enregistrement ADR léger.

## Décision

### 1. Preview = `@remotion/player` embedded

On embarque `@remotion/player` (React) dans un wrapper Angular standalone, chargé par `TemplateEditorComponent`. Le wrapper consomme les props `TemplateV2 + RenderTemplateRequest` et réutilise le composant `TemplateRuntime.tsx` livré en Sprint 1 (single source of truth entre preview interactif et render async headless).

### 2. Endpoint `upload-asset` ouvert aux authenticated, avec discrimination role

`POST /api/remotion-templates/upload-asset` accepte tout utilisateur authentifié, mais :

- **Validation MIME par rôle** :
  - super_admin : `video/mp4`, `video/quicktime`, `image/*` (max 50 Mo)
  - autres rôles : `image/jpeg`, `image/png`, `image/webp` uniquement (max 10 Mo)
- **Rate limit** : 20 uploads/h/user (express-rate-limit)
- **Namespacing FTP** : `/template-assets/catalog/...` pour super_admin, `/template-assets/user-uploads/{siteId}/{userId}/...` pour les autres
- **Audit** : log Winston `template_asset_uploaded` avec userId, role, MIME, size

## Alternatives rejetées

- **Preview iframe + route SSR `/studio-preview`** : rejeté car round-trip server à chaque edit, surface d'attaque publique supplémentaire, double runtime à maintenir (SSR + async render)
- **`@remotion/player` dans un iframe isolé** : rejeté car perd le bénéfice du resync instantané (postMessage overhead, React remount)
- **Endpoint upload-asset séparé user vs super_admin** : rejeté pour éviter la duplication de logique FTP et audit. Une seule porte d'entrée avec guards différenciés est plus maintenable
- **Upload base64 inline dans le payload render** : rejeté — payloads render_jobs gonflés, impossible de réutiliser un upload entre 2 renders, pas de CDN

## Conséquences

**Positives** :

- Preview live instantanée, zéro round-trip server sur edit de champ
- `TemplateRuntime.tsx` unique entre preview et render = moins de dérive
- Endpoint upload mutualisé = un seul point à auditer/sécuriser
- US-3 (club upload photo joueur) débloquée sans attendre Sprint 3

**Négatives / risques** :

- React-dans-Angular via `createRoot` ajoute un pattern d'intégration (wrapper standalone). Mitigation : isoler dans un seul composant `RemotionPlayerWrapperComponent`, documenté
- Bundle dashboard +~150kb (`@remotion/player` + peer React). Mitigation : lazy-load sur la route `/content/templates-remotion`
- Upload ouvert élargit la surface d'écriture FTP. Mitigation : MIME strict, rate limit, namespacing par siteId/userId, quota FTP monitoré

## Fichiers impactés

**central-server** :

- `src/controllers/template-studio.controller.ts` — ajoute handler `uploadAsset` avec role discrimination
- `src/schemas/template-studio.schemas.ts` — schéma Joi `uploadAssetSchema` (MIME, size)
- `src/routes/remotion-templates.routes.ts` — route `POST /upload-asset` protégée par `authenticated`, pas `superAdmin`
- `src/middleware/rate-limit.ts` — rule dédiée `templateAssetUploadLimiter`
- `src/__tests__/controllers/template-studio.controller.test.ts` — tests role/MIME/size

**central-dashboard** :

- `src/app/features/templates-remotion/remotion-player-wrapper/` — wrapper standalone React↔Angular
- `src/app/features/templates-remotion/template-editor.component.ts` — consomme le wrapper
- `package.json` — ajout `@remotion/player`, `react`, `react-dom` (peer)
- Lazy-load de la route dans `app.routes.ts` pour isoler le bundle
