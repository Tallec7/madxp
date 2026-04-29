# ADR-103: Web pages & livestreams in playback loops

**Date** : 2026-04-28
**Statut** : Proposé
**Décideurs** : Daisy (PO), Lead Dev
**Remplace** : —
**Étend** : ADR-089 (Web Content Phase 1 & 2 — manuel uniquement)
**Remplacé par** : —

---

## Contexte

### État actuel (post ADR-089)

- La table `videos` accepte `content_type ∈ {'video', 'web_page', 'livestream'}` avec `external_url` requis pour les non-videos.
- L'utilitaire `injectWebContentCategory()` injecte une **pseudo-catégorie "Web / Live"** dans `categories[]` de la config TV au runtime (côté `saas.controller`, `remote.controller`) ou côté Pi via `web-content-sync.js` qui merge dans `configuration.json`.
- La Remote V1 (Pi) dispatche les commandes par `contentType` dans `launchVideo()` :
  - `web_page` → command `web-page` (iframe)
  - `livestream` → command `livestream` (HLS player)
  - `video` → command `video` (DoubleBuffer manuel)
- Mode **manuel uniquement** — pas d'inclusion dans `sponsors[]` ni `timeCategories.loopVideos[]`.

### Problème observé (28/04/2026, NLF)

1. **Bug stabilité aigu** : un user a ajouté l'entrée `web_page` (id `1fe0f231-...`) dans `sponsors[]` du profil "NLF Handball" via l'éditeur de catégorie du dashboard, qui ne filtre pas par `content_type`. Le path stocké est le `filename` synthétique (`web_page-1777392352039`), pas l'`external_url`. Conséquences :
   - La TV SaaS tente de streamer cette entrée comme un MP4 via `/api/videos/stream?path=web_page-1777392352039` → 404 → MEDIA_ELEMENT_ERROR Format → 3 erreurs consécutives → reset complet du système vidéo en boucle infinie.
   - Même problème en lecture **manuelle** côté Remote V1 SaaS : la Remote envoie `type: 'video'` (pas `type: 'web-page'`), parce que le dispatch par `contentType` n'est pas branché côté SaaS (vérifié en log).
2. **Bug fonctionnel structurel** : le design ADR-089 prévoit le manuel mais le besoin métier remonté inclut **les boucles automatiques** (page web ou livestream qui passe entre deux vidéos MP4), qui n'est pas couvert.
3. **Bug UX dashboard** : aucun garde-fou n'empêche l'ajout de web_page dans `sponsors[]` ou `loopVideos[]` ; le sélecteur de vidéos liste toutes les entrées de la table sans filtrer ni transformer le path.

### Contraintes

- **Multi-tenant Pi + SaaS** : le système doit fonctionner sur Pi (Chromium kiosk, V3D GPU, mémoire limitée) ET en SaaS (navigateur quelconque).
- **Pi hors-ligne** : si la page web ou le livestream n'est pas atteignable (Pi sans Internet), l'entrée doit être skip rapidement (≤1s exigence métier).
- **Robustesse vidéo Neopro** : le DoubleBuffer (4 players, freeze-frame canvas, error recovery, watchdog 10s) est volontairement ultra-tolérant aux fautes. Toute extension ne doit PAS dégrader cette tolérance pour les vidéos MP4.
- **Master/slave sync** : multi-écran (TV principale + secondaire) doit rester synchronisé pour une page web ou un livestream comme pour un MP4.
- **Sécurité iframe** : la page web peut venir de n'importe quel domaine (clubhouse.scorenco.com, sites partenaires, etc.). Sandbox stricte obligatoire (XSS, clickjacking, mining).
- **Cross-origin freeze-frame** : `canvas.captureStream()` ou `html2canvas` ne peut **pas** capturer le contenu d'une iframe cross-origin (security policy navigateur). Les transitions doivent fonctionner sans freeze-frame du contenu web.

### Demande métier (Daisy, 28/04/2026)

> "Cas d'usage : les trois doivent être possibles. Site cible : les deux (Pi hors ligne → skip). Page web : durée gérée en param (30s, fixe…). Tolérance erreur : 1s."

Traduction :

- Pages web, livestreams ET vidéos MP4 jouables en **manuel** (depuis n'importe quelle catégorie de la Remote) ET en **boucle** (rotation auto sponsors / phase).
- Durée d'affichage configurable par entrée (déjà dans la colonne `videos.duration`).
- Erreur de chargement → skip après 1s max.

## Décision

Implémenter un **Web Content Player Service** parallèle au DoubleBuffer existant, intégré à l'orchestrateur de boucle, avec dispatch par `contentType` à toutes les couches (dashboard, backend SaaS, sync-agent Pi, TV runtime, Remote V1 + V2).

L'implémentation est découpée en **5 phases** livrables indépendamment, chacune apportant de la valeur :

- **Phase 0** — Stabilisation immédiate (filets défensifs + nettoyage DB, ~1j) ✅ livrée (PR #699, v3.266.1)
- **Phase 0.5** — Strip serveur + reject 400 sur synthetic paths, ~0.5j ✅ livrée (PR #701, v3.267.1)
- **Phase 0.6** — Visibilité pseudo-catégorie "Web / Live" dans Remote (registerWebContentInTimeCategories), ~0.5j ✅ livrée (PR #703, v3.267.2)
- **Phase 1** — Web Content Player en manuel robuste (1s timeout + analytics), ~1j ✅ livrée (PR #705)
- **Phase 2a** — Backend résout les paths synthétiques au read + drop du 400 reject : web/live ajoutables aux sponsors[]/loopVideos/categories.videos, lançables manuellement depuis n'importe quelle catégorie de la Remote, ~1j ✅ livrée (PR #710)
- **Phase 2.5** — Take-over propre depuis vidéo manuelle (clear sans resume) + boucle non-pausée + anti-flash + bouton Stop Remote V2, ~1j ✅ livrée (PR #714)
- **Phase 2.6** — Instant show (no opacity transition under freeze), ~0.5j ✅ livrée (PR #716)
- **Phase 2.7** — Paint-stable reveal (2× rAF + 250ms), ~0.5j ✅ livrée (PR #718)
- **Phase 2b** — TV runtime délègue à WebContentService quand l'étape de boucle a `contentType !== 'video'` (rotation MP4 → web → MP4 automatique), ~3-5j 🔄 en cours
- **Phase 1.5** — hls.js (Chromium HLS) + master/slave sync content_type, ~2-3j
- **Phase 3** — Dashboard UX (sélecteur, validation, preview), ~4j
- **Phase 4** — Robustesse, supervision (Prometheus), tests, ADR fermeture, ~3j

**Total estimé : 15-21 jours dev + 3-4 semaines calendaires** avec tests fleet (Pi 4, Pi 5, SaaS).

## Alternatives Considérées

### 1. Statu quo (ADR-089 manuel uniquement)

**Avantages** :

- Zéro coût.
- Zéro risque de régression sur la stabilité vidéo MP4.
- ADR-089 est déjà spec'é et partiellement implémenté.

**Inconvénients** :

- Ne couvre pas le besoin métier (boucle auto).
- Le bug du 28/04 (entrée web_page injectée dans sponsors[] qui plante la TV) reste possible.
- Le dispatch SaaS est cassé (envoie `type: 'video'` au lieu de `type: 'web-page'`).

**Verdict** : **Rejeté** — ne couvre pas le besoin métier et n'adresse pas le bug critique observé.

### 2. Livestream HLS uniquement dans la boucle (pas de pages web)

**Avantages** :

- HLS se joue dans `<video>` HTML5 → compatible DoubleBuffer existant (juste ajouter timer pour stream infini).
- Pas de nouveau système d'iframe / sandbox / freeze cross-origin.
- Coût réduit (~2-3 jours).

**Inconvénients** :

- Ne couvre pas les pages web demandées par Daisy.
- Twitch/YouTube live bloquent l'embed direct → besoin de leur SDK dédié de toute façon.

**Verdict** : **Rejeté** — couvre 1 des 3 cas d'usage métier, écart trop grand.

### 3. Web Content Player + intégration boucle (choisie) ✅

**Avantages** :

- Couvre les 3 cas d'usage demandés (vidéo MP4, page web, livestream).
- Architecture isolée du DoubleBuffer → ne dégrade pas la tolérance MP4.
- Phases livrables indépendamment → on peut s'arrêter à Phase 1 si Phase 2 s'avère plus risquée que prévu.
- Aligné avec le design `contentType` déjà présent dans la DB et `injectWebContentCategory`.

**Inconvénients** :

- Coût élevé (15-21j).
- Cross-origin freeze-frame impossible → transitions visuellement moins propres pour les pages web (fade noir 200ms au lieu de freeze-frame).
- Multiplie la surface de test (3 types × 2 modes × 3 plateformes = 18 cas matriciels).
- Sites avec `X-Frame-Options: DENY` ou CSP `frame-ancestors` strict → page blanche, skip 1s automatique mais UX dégradée.
- Twitch/YouTube live : leur SDK officiel est nécessaire pour embed légal — multiplie le scope si besoin.

**Verdict** : **Accepté** — seule option qui couvre le besoin métier, scope maîtrisé par phases.

## Conséquences

### Positives

1. **Stabilité immédiate** (Phase 0) : la TV ne plante plus quand un user ajoute par erreur une entrée web_page dans une boucle.
2. **Capacité produit** : le club peut diffuser sa page partenaires, son score live, son livestream Twitch entre deux pubs sponsors.
3. **Cohérence UX** : la Remote affiche les 3 types comme des entrées équivalentes, l'utilisateur clique pareil.
4. **Robustesse** : le timeout 1s + skip empêche une URL morte ou lente de figer la TV.
5. **Analytics complète** : `video_plays.content_type` permet de mesurer engagement web vs livestream vs vidéo (déjà en DB).
6. **Master/slave compatible** : sync par index + `currentContentType` propagé.

### Négatives

1. **Surface code étendue** : ~25-30 fichiers touchés sur 4 composants (dashboard, central, raspberry, sync-agent).
2. **Surface tests étendue** : ~50-80 nouveaux tests (smoke + unit + intégration matrice 3×2×3).
3. **Maintenance accrue** : 2 pipelines vidéo en parallèle (DoubleBuffer + WebContentPlayer) avec sémantiques d'erreurs différentes.
4. **Transitions moins propres pour pages web** : pas de freeze-frame cross-origin → fade noir 200ms imposé.
5. **Risque GPU Pi** : `<video>` HLS infini en parallèle du DoubleBuffer MP4 peut faire planter le V3D sur Pi 5 (à valider en Phase 2).
6. **Sécurité** : iframe arbitraire = surface d'attaque (XSS, clickjacking, mining). Sandbox stricte + whitelist domaines obligatoire (à voir en Phase 4).

### Risques

| Risque                                                                                        | Impact   | Probabilité | Mitigation                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------- | -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Régression sur les boucles MP4 existantes                                                     | Critique | Moyenne     | Filet défensif `contentType !== 'video'` ajouté côté `video-playback.service.ts:161` + smoke test bloquant. WebContentPlayer isolé du DoubleBuffer.                                   |
| Iframe cross-origin avec `X-Frame-Options: DENY`                                              | Moyen    | Élevée      | Détection côté backend dashboard via fetch HEAD au moment de la création (warn UX si header bloquant). Skip 1s côté TV. Ajouter une métrique Prometheus `neopro_web_content_blocked`. |
| Livestream Twitch/YouTube nécessite leur SDK propriétaire                                     | Moyen    | Élevée      | Phase 2 : `livestream` accepte uniquement HLS native (.m3u8). Twitch/YouTube → out-of-scope, à traiter en feature flag séparée si besoin.                                             |
| GPU Pi 5 plante sur HLS + MP4 parallèles                                                      | Élevé    | Moyenne     | Phase 2 : tests fleet réels avec un livestream actif + rotation MP4 pendant 24h. Si plante, fallback "kill MP4 pendant livestream".                                                   |
| Master/slave race condition sur transition MP4 → web → MP4                                    | Moyen    | Moyenne     | Étendre le pattern `_lastActionReceivedAt` (ADR-033) avec `_lastContentTypeChangeAt` + guard 2s sur stale `tv-loop-state`.                                                            |
| Synchronisation `duration` web entre TV master et slave                                       | Faible   | Faible      | Master émet `tv-loop-state` à chaque tick visible (toutes les 1s pendant un web/live), slave aligne son timer.                                                                        |
| Pi hors-ligne avec entrée web non-cachée → skip immédiat fait clignoter la TV                 | Faible   | Moyenne     | Pre-check côté Pi (DNS resolve + TCP connect 200ms) avant transition. Si fail → skip avant transition visible.                                                                        |
| Sécurité iframe : page malveillante exploite `allow-scripts`                                  | Élevé    | Faible      | Sandbox `allow-scripts` SANS `allow-same-origin` par défaut. Whitelist domaines en Phase 4 si besoin.                                                                                 |
| Erreur de durée sur livestream HLS (durée DB ignorée car flux infini)                         | Faible   | Élevée      | Validation Joi : `duration` requise pour `web_page` ET `livestream`. Le timer côté TV s'applique aux deux types.                                                                      |
| Régression analytics : `video_plays` enregistre des `web_page` avec un `video_id` synthétique | Moyen    | Moyenne     | Schema `video_plays.content_type` déjà existant (ADR-089). Phase 1 : émettre `content_type` côté analytics + dashboard sponsor reports filtre par `content_type='video'` par défaut.  |

## Plan d'implémentation

### Phase 0 — Stabilisation immédiate (~1 jour)

**Objectif** : la TV ne plante plus aujourd'hui sur une entrée web_page mal configurée.

1. **Nettoyer DB prod** : pour chaque profil, retirer toute entrée avec `path LIKE 'web_page-%'` ou `path LIKE 'livestream-%'` de `configuration->'sponsors'` ET `configuration->'timeCategories'->loopVideos` ET `configuration->'categories'->videos`. Script SQL one-shot.
2. **Filet défensif TV runtime** : `raspberry/src/app/services/video-playback.service.ts:161` — filtrer `loopVideos.filter(v => v?.path && (v.contentType ?? 'video') === 'video')`. Ajouter smoke test bloquant la régression.
3. **Filet défensif Manual Player** : `raspberry/src/app/services/manual-video.service.ts` — early return si `contentType !== 'video'` avec log warning + analytics `interruption_reason: 'wrong_content_type_in_video_player'`.
4. **Fix dispatch Remote V1 SaaS** : vérifier `launchVideo()` dans `raspberry/src/app/components/remote/remote.component.ts` → s'assurer que la branche `contentType === 'web_page'` / `'livestream'` envoie bien `type: 'web-page'` / `type: 'livestream'` (pas `type: 'video'`). Aligner le code SaaS et Pi.
5. **Smoke tests** : `central-server/src/__tests__/smoke/smoke-web-content.test.ts` — vérifie que `injectWebContentCategory` n'est jamais merge dans sponsors/loopVideos, et que les filets défensifs sont en place.

**Critères de validation Phase 0** :

- TV NLF SaaS : 0 erreur MEDIA_ELEMENT_ERROR sur 1h de fonctionnement avec entrée web_page présente dans la pseudo-catégorie.
- Remote V1 SaaS : clic sur entrée web_page → command `web-page` envoyée (pas `video`).
- Smoke tests verts.

### Phase 1 — Web Content Player en manuel (~5 jours)

**Objectif** : le club peut lancer une page web ou un livestream depuis la Remote, robuste, avec timeout 1s.

1. **Nouveau service** `raspberry/src/app/services/web-content-player.service.ts` :
   - Manage 1 iframe (web_page) + 1 `<video>` HLS (livestream) avec z-index 12 (au-dessus du manual MP4 player).
   - Timer interne basé sur `duration` (millisecondes).
   - Timeout chargement 1s avant skip → émet event `web-content-error`.
   - Sandbox iframe : `allow-scripts allow-popups` (PAS `allow-same-origin` par défaut).
2. **Hooks `tv.component.ts`** :
   - Handler `web-page` / `livestream` command → délègue à `WebContentPlayerService` au lieu de `ManualVideoService`.
   - Cleanup à la fin du timer ou sur skip → fade out 200ms → DoubleBuffer reprend la boucle.
3. **Sync master/slave** :
   - Émettre `tv-loop-state` avec `currentContentType: 'web_page' | 'livestream'` + `currentExternalUrl`.
   - Slave : `handleMasterLoopState` aligne le WebContentPlayer si `currentContentType !== 'video'`.
4. **Analytics** :
   - `analytics.service.ts` : `trackVideoStart` accepte `contentType`. Émettre `video_plays` avec `content_type` et `external_url` (champs nouveaux à ajouter à `video_plays` ou réutiliser `metadata` JSONB).
   - Métrique Prometheus `neopro_web_content_play_total{type, result}`.
5. **Tests** :
   - Unit : WebContentPlayerService timer, error 1s skip, cleanup.
   - Smoke : manuel web_page + livestream Pi + SaaS, master/slave 2 displays.
   - E2E Playwright : Remote V1 SaaS → click → web page affichée 30s → retour boucle.

**Critères de validation Phase 1** :

- Page web et livestream lançables depuis Remote V1 (Pi + SaaS).
- Skip après 1s si URL morte ou refused-to-display.
- Master + slave synchronisés sur le même contenu web/live.

### Phase 2 — Boucles avec entrées web/livestream (~7 jours)

**Objectif** : une entrée web ou livestream peut être placée dans `sponsors[]` ou `timeCategories.loopVideos[]` et joue dans la rotation comme un MP4.

1. **Étendre `getLoopVideosForPhase()`** dans `tv.component.ts` : supporter mix MP4/web/live (filtre par `path` valide ET `contentType` ∈ valid types).
2. **Étendre `video-playback.service.ts`** :
   - Si étape suivante est `contentType !== 'video'` → délègue à `WebContentPlayerService` avec timer = `duration`.
   - À la fin du timer → reprend DoubleBuffer pour MP4 suivant.
   - Transitions :
     - MP4 → web : freeze MP4 pre-captured → fade vers iframe (200ms).
     - Web → MP4 : fade vers freeze noir (cross-origin oblige) → preload MP4 sur DoubleBuffer → switch.
3. **Étendre sync-agent Pi** :
   - `web-content-sync.js` accepte aussi les entrées injectées dans `sponsors[]` / `loopVideos[]` (pas seulement la pseudo-catégorie).
   - Validation : path de l'entrée = `external_url`, pas le `filename` synthétique.
4. **Erreur web en boucle** : skip immédiat (1s timeout), métrique `interruption_reason='web_load_failed'`, passe au MP4 suivant sans casser la rotation.
5. **Pi hors-ligne** : pre-check DNS + TCP 200ms avant transition vers web ; si fail → skip avant fade-in (pas de clignotement TV).
6. **Watchdog** : étendre le watchdog 10s pour détecter un WebContentPlayer figé (pas de tick depuis 5s pendant un web), reset si nécessaire.
7. **Master/slave** : émettre `tv-loop-state` plus souvent (1s) pendant un web/live pour aligner le timer slave.
8. **Tests fleet** : 24h de rotation Pi 4 + Pi 5 + SaaS avec 1 livestream HLS + 2 pages web + 5 MP4 → 0 plantage GPU, 0 desync master/slave > 500ms.

**Critères de validation Phase 2** :

- Boucle Pi NLF avec entrée web_page intercalée → joue 30s puis revient au MP4 suivant sans coupure.
- Page web inaccessible (test : URL `https://invalid.example.test`) → skip 1s, MP4 suivant joue immédiatement.
- 24h soak Pi 5 avec rotation mixte → 0 plantage V3D.

### Phase 3 — Dashboard UX (~4 jours)

**Objectif** : l'admin/club ajoute proprement une page web ou livestream via le dashboard, sans risque de mauvaise config.

1. **Sélecteur "Ajouter à la boucle / catégorie"** : filtrer par `content_type`, présenter les 3 types avec icônes distinctes.
2. **Champ durée** : obligatoire si `web_page` ou `livestream` ET destination = boucle (sinon UI bloque le submit).
3. **Path stocké correctement** : entrée de config = `{ path: external_url, contentType, externalUrl, durationMs, name, ... }`. PAS le `filename` synthétique.
4. **Preview iframe** dans le dashboard quand l'admin sélectionne une entrée web (sandbox).
5. **Validation backend** : `config-profiles.controller.ts` refuse une entrée `path LIKE 'web_page-%'` ou `path LIKE 'livestream-%'` (forme synthétique = bug). Log + 400.
6. **Detection X-Frame-Options** : à la création web_page, fetch HEAD côté backend → si `X-Frame-Options: DENY` ou `frame-ancestors` restrictif → warning UX "ce site refuse l'embed".
7. **Migration data** : nettoyer les profils existants (déjà fait Phase 0) et ajouter une CHECK constraint SQL si possible (sur configuration JSONB c'est limité, mais on peut ajouter un trigger BEFORE UPDATE).
8. **Tests** : Karma sur le dashboard (sélecteur, validation), Jest sur le backend (refus path synthétique).

**Critères de validation Phase 3** :

- Impossible de stocker `path: web_page-XXX` dans une config (rejet 400).
- Sélecteur dashboard liste les 3 types avec icônes.
- Site bloquant `X-Frame-Options` → warning visible avant submit.

### Phase 4 — Robustesse, supervision, fermeture (~3 jours)

**Objectif** : production-ready, observable, documenté.

1. **Métriques Prometheus** :
   - `neopro_web_content_load_total{type, result}` (success | timeout | error)
   - `neopro_web_content_skip_total{reason}`
   - `neopro_web_content_blocked_total{site_id}` (X-Frame-Options bloquant)
2. **Alertes** :
   - Taux skip > 20% sur 5min sur un site → alerte URL morte.
   - 0 web_content_load_total sur 24h pour un site qui en a configuré → alerte sync-agent.
3. **Smoke tests** : compléter avec scénarios cross-cutting (3 types × 2 modes × Pi/SaaS).
4. **Documentation** :
   - `docs/specs/features/web-content-loops.spec.md` — spec métier vivante.
   - `docs/guides/WEB_CONTENT_GUIDE.md` — guide admin (whitelist domaines, durées recommandées, sites connus pour bloquer l'embed).
   - Mise à jour `docs/adr/README.md` avec ADR-103 acceptée.
5. **Fermeture ADR-103** : statut → "Accepté".
6. **Rollback plan** : feature flag `WEB_CONTENT_IN_LOOPS_ENABLED` (default OFF) côté `feature_overrides` site, permet de revenir au mode manuel ADR-089 sans déploiement.

**Critères de validation Phase 4** :

- Toutes les phases validées + soak 7 jours en prod NLF sans incident.
- Dashboards Grafana avec les 3 métriques + alertes actives.
- ADR-103 statut "Accepté" + spec + guide publiés.

## Modèle de données

### Pas de migration DB

`videos.content_type` et `videos.external_url` existent déjà (ADR-089). `videos.duration` existe. `video_plays.content_type` existe.

### Format des entrées de config (sponsors[], loopVideos[], categories[].videos[])

```typescript
// Avant (vidéo MP4)
{ name: "Sponsor Or", path: "videos/abc/xxx.mp4", type: "video/mp4", owner: "club" }

// Nouveau (page web)
{
  name: "Page partenaires",
  path: "https://clubhouse.scorenco.com/113",     // URL externe directe
  contentType: "web_page",
  externalUrl: "https://clubhouse.scorenco.com/113",
  durationMs: 30000,                               // requis pour boucle, optionnel pour manuel
  thumbnailUrl: "https://...",
  owner: "club"
}

// Nouveau (livestream HLS)
{
  name: "Live BFM Sport",
  path: "https://example.com/live.m3u8",
  contentType: "livestream",
  externalUrl: "https://example.com/live.m3u8",
  durationMs: 60000,                               // durée d'affichage avant skip
  owner: "club"
}
```

**Règle stricte** : `path === externalUrl` pour `web_page` et `livestream`. Le `filename` synthétique (`web_page-XXX`) ne doit JAMAIS apparaître dans une config.

## Sécurité

- **Iframe sandbox** : `allow-scripts allow-popups` par défaut. PAS `allow-same-origin` (sauf whitelist explicite Phase 4).
- **CSP** : la TV/Remote ne loosit pas sa CSP — l'iframe a sa propre CSP du domaine cible.
- **Whitelist domaines** (Phase 4) : option `feature_overrides.web_content_allowed_domains: ['clubhouse.scorenco.com', '*.club.fr']` pour les déploiements régulés.
- **Rate limiting création** : la création d'entrées web_page/livestream est limitée à 10/heure/user (anti-abuse).
- **Auth** : création super_admin / admin / operator / club uniquement (déjà ADR-089).

## Out-of-scope (intentionnellement) — à reconsidérer plus tard

- **Twitch / YouTube live embed** : nécessite leur SDK propriétaire (player Twitch.js, YouTube IFrame API). Hors scope ADR-103, Daisy l'a explicitement reporté à un futur ADR (2026-04-29). Tracking : à créer un ADR-104 quand un client demande explicitement.
- **Cache offline web_page** : Pi sans Internet → skip 1s + retour boucle. Pas de service worker / proxy de pages cachées dans Phase 0-4 (trop instable, mauvaise UX si page périmée). Reporté par Daisy (2026-04-29) — à reconsidérer si un client a un cas d'usage offline solide.
- **DRM / payant** : pas de support contenu DRM (Widevine, FairPlay).
- **Audio mixing** : si un livestream a du son ET un MP4 sponsor a du son, comportement par défaut = mute le MP4 sponsor pendant le livestream. Pas de ducking automatique.
- **Interactivité utilisateur** : pas de clic/scroll dans l'iframe TV (sandbox sans `allow-pointer-lock`). La TV affiche, ne permet pas l'interaction (la Remote V1 garde le contrôle).
- **Captures d'écran dashboard preview** : pas de screenshot iframe (cross-origin) ; preview = iframe live dans le dashboard.

## Métriques de succès

- **Stabilité** : 0 plantage TV lié au content_type sur 30 jours post-Phase 2.
- **Adoption** : ≥3 clubs utilisent web_page ou livestream dans leur boucle dans le mois suivant Phase 2.
- **UX** : skip rate < 5% sur les entrées web_page (sinon = signal config admin à revoir).
- **Performance** : transition MP4 → web → MP4 ≤ 400ms perçus (200ms fade × 2).

## Plan de rollback

Si Phase 2 (boucles) s'avère instable en production :

1. Feature flag `WEB_CONTENT_IN_LOOPS_ENABLED=false` (default OFF) sur le site concerné.
2. Le code Phase 1 (manuel) reste actif.
3. Migration data : retirer les entrées web_page/livestream des `loopVideos[]` / `sponsors[]` (script idempotent), elles restent dans la pseudo-catégorie "Web / Live" pour le manuel.
4. Investigation root cause + post-mortem + Phase 2bis si correctible.

Si Phase 1 (manuel) s'avère instable : revert ADR-089 → ADR-089 reste mode manuel "best effort", on retourne au statu quo.

## Références

- [ADR-089 — Web Content Phase 1 & 2 (manuel)](./ADR-089-web-content-pages-livestreams.md) (à vérifier titre exact)
- [ADR-033 — Master/slave race condition guard](./ADR-033-master-slave-race-condition-guard.md)
- [ADR-042 — DoubleBuffer architecture](./ADR-042-double-buffer-video.md)
- [Logs incident NLF 28/04/2026](./incidents/2026-04-28-saas-tv-loop-web_page-crash.md) (à créer en Phase 0)
- Code :
  - [raspberry/src/app/services/video-playback.service.ts](../../raspberry/src/app/services/video-playback.service.ts)
  - [raspberry/src/app/services/double-buffer-video.service.ts](../../raspberry/src/app/services/double-buffer-video.service.ts)
  - [raspberry/src/app/components/tv/tv.component.ts](../../raspberry/src/app/components/tv/tv.component.ts)
  - [raspberry/src/app/components/remote/remote.component.ts](../../raspberry/src/app/components/remote/remote.component.ts)
  - [raspberry/sync-agent/src/services/web-content-sync.js](../../raspberry/sync-agent/src/services/web-content-sync.js)
  - [central-server/src/utils/inject-web-content-category.ts](../../central-server/src/utils/inject-web-content-category.ts)
  - [central-server/src/controllers/web-content.controller.ts](../../central-server/src/controllers/web-content.controller.ts)
  - [central-server/src/controllers/saas.controller.ts](../../central-server/src/controllers/saas.controller.ts)
  - [central-server/src/repositories/video.repository.ts](../../central-server/src/repositories/video.repository.ts)
