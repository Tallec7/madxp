# ADR-038: Portail club SaaS — temps réel, preview et capture d'erreurs

**Date** : 2026-04-08
**Statut** : Accepté
**Format** : Léger

---

## Contexte

ADR-037 a introduit le mode SaaS (navigateur uniquement, sans Pi), mais le portail club était aveugle :

- Quand un admin sauvegardait la config SaaS d'un club, les onglets navigateur déjà ouverts continuaient à afficher l'ancienne boucle jusqu'au prochain reload manuel.
- Les utilisateurs club n'avaient aucun moyen de vérifier le rendu de leur boucle sans ouvrir un second onglet.
- Les erreurs JavaScript côté dashboard/portail/SaaS n'étaient capturées nulle part côté serveur.
- Le rôle `club` n'avait aucun accès aux analytics de son propre site.

## Décision

Mettre en place quatre quick wins cross-composant (central-server + central-dashboard + raspberry) :

1. **Socket `saas-config-updated`** : après un `saveConfigDirect` sur un site SaaS, `socketService.emitSaasConfigUpdated()` broadcast vers la room `siteId`. Les clients SaaS enregistrés via `saas-register` écoutent cet événement et déclenchent un `window.location.reload()` (préservant `?site=UUID`).
2. **Iframe live preview** : ajout d'un panneau toggleable dans `club-loop` affichant l'écran TV SaaS en 16:9 via `DomSanitizer.bypassSecurityTrustResourceUrl`. Même URL que le bouton "Ouvrir l'écran", pas de duplication de logique.
3. **Endpoint `POST /api/client-errors`** : route publique rate-limitée (`remoteRateLimit`), payload validé par Joi, log structuré Winston. Pas de persistance DB — Winston suffit pour la phase d'observation initiale.
4. **Route `/club/analytics`** : expose `ClubAnalyticsComponent` au rôle `club` en lisant `siteId` depuis `authService.getCurrentUser()?.site_id` quand le paramètre de route est absent. Back-link devient role-aware (`/club` pour club, `/sites/:id` pour admin/operator).

## Alternatives rejetées

- **Historique config (#7)** : reporté — exigerait une migration DB + UI dédiée, hors scope quick win.
- **SSE au lieu de Socket.IO pour `saas-config-updated`** : rejeté, Socket.IO est déjà en place et la room `siteId` sert déjà à `saas-register` / `getSaasClientCount()`.
- **Capture Sentry pour les erreurs client** : rejeté pour l'instant — dépendance externe + coût. Winston suffit tant que le volume reste faible.
- **Composant `club-analytics` dédié et simplifié** : rejeté — `ClubAnalyticsComponent` (547 lignes) est déjà mature, un simple fallback `siteId` + back-link role-aware couvre 100% du besoin sans duplication.

## Conséquences

- Les sauvegardes SaaS se propagent désormais en < 1s à tous les onglets ouverts pour le site (pas de reload manuel).
- Le portail club gagne une boucle de feedback immédiate grâce à la preview iframe.
- Toute erreur JS frontend peut être envoyée à `POST /api/client-errors` et apparaîtra dans les logs Railway/Winston.
- Les users `club` voient enfin leurs propres analytics (KPIs, sponsors, timeline).
- Risque : le reload brutal sur `saas-config-updated` interrompt la lecture vidéo en cours. Acceptable car l'action est explicite côté admin et les clubs sont prévenus via le modal d'aide.

## Fichiers impactés

### central-server

- `src/services/socket.service.ts` — ajout `emitSaasConfigUpdated(siteId, meta)`
- `src/controllers/config-history.controller.ts` — appel `emitSaasConfigUpdated()` après `saveConfigDirect`
- `src/routes/client-errors.routes.ts` — nouveau fichier (Joi + Winston + rate limit)
- `src/server.ts` — mount `/api/client-errors`

### central-dashboard

- `src/app/features/club-portal/club-loop.component.ts` — panneau iframe preview + `DomSanitizer`
- `src/app/features/analytics/club-analytics.component.ts` — fallback `siteId` depuis auth + back-link role-aware
- `src/app/app.routes.ts` — route `/club/analytics`
- `src/app/features/layout/layout.component.ts` — nav item "Mes statistiques"
- `src/assets/i18n/{fr,en}.json` — clés `clubAnalytics`, `livePreview`, `showPreview`, `hidePreview`, `openInTab`

### raspberry

- `src/app/services/socket.service.ts` — listener `saas-config-updated` → `window.location.reload()`
