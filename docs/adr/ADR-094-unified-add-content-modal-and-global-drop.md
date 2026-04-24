# ADR-094: Entrée unifiée "Ajouter du contenu" et drag-drop global

**Date** : 2026-04-24
**Statut** : Accepté
**Format** : Léger

---

## Contexte

L'en-tête de la bibliothèque vidéo affichait une dropzone géante (~400 px) + deux boutons secondaires "🌐 Page web" / "📡 Livestream" (ADR-089). Ce pavé d'ajout occupait plus de place que la liste des vidéos elle-même, alors que l'upload représente ~90 % des actions et que les deux boutons secondaires restent utilisés ponctuellement. Les utilisateurs remontaient que la page était "chargée" et que la liste des vidéos n'était pas visible above-the-fold.

## Décision

Remplacer la dropzone + les deux boutons par un **bouton primaire unique** "+ Ajouter du contenu" qui ouvre un **modal à onglets** (Fichier · Page web · Livestream) hébergé dans `<app-add-content-modal>`. Le modal réutilise les composants existants (`<app-video-upload-zone>` et `<app-web-content-create-modal>` en mode `embedded`) — aucune duplication de logique.

En complément, un **overlay drag-drop global** (`position: fixed; inset: 0`) apparaît dès qu'un fichier est traîné sur la page. Le drop ouvre automatiquement le modal sur l'onglet Upload avec les fichiers pré-chargés, pour préserver le geste rapide précédent sans occuper d'espace visuel au repos.

## Alternatives rejetées

- **Dropdown/popover léger au lieu d'un modal** : rejeté car les formulaires Page web / Livestream ont plusieurs champs (nom, URL, durée, catégorie) qui ne tiennent pas confortablement dans un popover.
- **Duplication inline du formulaire web_page/livestream dans le modal** : rejeté car interdit par les règles smoke-enforced ADR-089 (`NE PAS dupliquer le formulaire de création web_page/livestream`). Solution retenue : ajouter un mode `embedded` à `<app-web-content-create-modal>` qui supprime le backdrop/header et permet l'imbrication.
- **Service global `DragOverlayService` monté dans le layout** : rejeté pour cette V1 car l'upload n'a de sens que lorsqu'un site est sélectionné (bibliothèque vidéo montée). Garder l'overlay dans `<app-video-library>` évite d'exposer le drop sur les vues admin globales sans `siteId` — aligné avec le guard `*ngIf="siteId"` des boutons ADR-089.

## Conséquences

- **Gagne ~400 px verticaux** dans l'en-tête de la bibliothèque ; la liste des vidéos remonte above-the-fold.
- **Découvrabilité préservée** : le drag-drop global fonctionne sur toute la page (pattern Gmail/Slack/Notion), le bouton "+ Ajouter" est visuellement primaire (bleu).
- **Zéro régression backend** : aucun endpoint ni schéma DB modifié. Les events et contrats (`uploadedForSiteId`, `webContentCreated`) sont inchangés.
- **Invariant ADR-089 préservé** : le `lockedSiteId` est forwardé par le modal unifié aux deux onglets Page web / Livestream — pas de leak global possible.
- **Risque** : si `<app-video-library>` se retrouve monté plusieurs fois sur la même page avec `siteId` non nul, les `@HostListener document:*` se déclenchent en double. Non applicable aujourd'hui (un seul site-content-tab monté à la fois), mais à garder en tête.

## Fichiers impactés

- `central-dashboard/src/app/shared/components/add-content-modal/add-content-modal.component.ts` — nouveau composant orchestrateur (3 onglets).
- `central-dashboard/src/app/shared/components/web-content-create-modal/web-content-create-modal.component.ts` — nouveau `@Input() embedded` + templates `#bodyTpl`/`#footerTpl` pour imbrication.
- `central-dashboard/src/app/shared/components/video-upload-zone/video-upload-zone.component.ts` — nouveau `@Input() pendingFiles` pour upload déclenché par drop global.
- `central-dashboard/src/app/features/sites/components/video-library/video-library.component.{ts,html,scss}` — bouton unique, modal hosting, 4 HostListeners drag + overlay `.global-drop-overlay`.
- `central-dashboard/src/app/features/sites/components/site-content-tab/video-manager/video-manager.component.ts` — retrait de `<app-video-upload-zone>` autonome, propagation des events depuis la library.
- `central-server/src/__tests__/smoke/smoke-web-content-adr089.test.ts` — 5 nouvelles assertions smoke pour prévenir la régression (bouton unifié, modal embedded, suppression upload-zone standalone, drag overlay guard `siteId` + filtre `Files`).
