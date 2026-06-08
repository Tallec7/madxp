# Recette d'extension retail — le plan actionnable

> **Statut** : v0.1 — dérivée de l'audit code-verified (15 domaines, cf. [findings 1](MADXP-code-verified-findings.md)/[2](MADXP-code-verified-findings-2.md)/[3](MADXP-code-verified-findings-3.md)).
> **Idée** : le retail = **un nouveau vertical branché sur l'existant** (≈80%) + **6 chantiers transverses** que MadXP n'a pas (≈20%). Ce doc dit _quoi faire concrètement_.
> **Effort** : 🟢 trivial (<1j) · 🟡 moyen (jours) · 🔴 chantier (semaines).

---

## Partie A — L'extension (réutilise l'existant)

| #   | Étape                                    | Quoi faire                                                                                                                                                        | Où                                                                                 | Effort |
| --- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------ |
| A1  | **Nouveau `site_type='retail'`**         | Étendre l'enum + Joi + CHECK constraint. Ne PAS casser `pi/saas/demo`.                                                                                            | `types/index.ts:89`, `validation.ts`, migration                                    | 🟢     |
| A2  | **Nouvelle delivery strategy**           | `RetailScreenStrategy implements` le port (probablement = clone de `SaasDirectStrategy`). 1 classe + 1 ligne registry. Smoke `noLegacySaasShortCircuit` protège.  | `delivery/retail-screen.strategy.ts`, `strategy-registry.ts`                       | 🟢     |
| A3  | **Provisioning**                         | Réutiliser le flow SaaS (UUID public, pas d'api_key matériel). Form admin retail (enseigne, magasin, écrans).                                                     | `sites.controller.ts:createSite`                                                   | 🟡     |
| A4  | **Dashboard module**                     | `features/retail-portal/` + rôle `retail` + `isRetail()` nav + thème CSS-vars. **Zéro impact cœur** (pattern club/advertiser).                                    | `app.routes.ts`, `layout.component.ts:65-90`, nouveau `RetailDashboardDataService` | 🟡     |
| A5  | **Rendu**                                | Réutiliser `TvComponent` (déjà Pi+SaaS, paramétré par callbacks). Boucle retail = pas d'overlay match.                                                            | `tv.component.ts` (aucune modif, juste config)                                     | 🟢     |
| A6  | **Realtime**                             | Réutiliser rooms-par-`siteId`. Renommer les concepts sport : `phase`→`context`, `score`→`metric`, `tvInstances`→`display_group`, `saasStates`→`SiteRuntimeState`. | `socket.service.ts`, `saas-relay.handler.ts`                                       | 🟡     |
| A7  | **Régie/audience comme features gatées** | Ajouter `retail_*` au catalogue `FEATURE_TIERS` + paliers retail éventuels. Le moteur d'entitlement existe déjà.                                                  | `feature-gate.service.ts:38-75`, `require-site-tier.ts`                            | 🟢     |
| A8  | **Contenu web live**                     | Réutiliser web-live-content (iframe/HLS) pour prix/promo/stock. Whitelist domaines (Phase 4) si besoin sécu.                                                      | `web-content.service.ts` (existant)                                                | 🟢     |
| A9  | **Géométries d'écran**                   | Réutiliser le modèle LED paramétrique pour murs/gondoles (`sides[]`). ⚠️ finir la diffusion par côté (POC).                                                       | `led-fold.service.ts` (existant)                                                   | 🟡     |
| A10 | **Généralisations soft**                 | TimeCategories depuis DB (pas "Avant/Après-match" hardcodé) ; `/templates-studio/players`→`rosters` (produits).                                                   | `config-editor-data.service.ts`, templates-studio                                  | 🟡     |

→ **Partie A seule donne un retail SaaS-like fonctionnel** (1 magasin, 1 écran, cloud-vérité, régie en features).

---

## Partie B — Les 6 chantiers transverses (à construire une fois, pour les DEUX verticaux)

| #   | Chantier                                                 | Pourquoi                                                                                                                      | Effort            | Bloque quoi                                     |
| --- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------- | ----------------------------------------------- |
| B1  | **Push-back substrat→cloud**                             | Édition locale offline (Pi ou retail) qui remonte. ADR-120 Phase 4, **non codé**. Aujourd'hui cloud-wins partout.             | 🔴                | edge éditable hors-ligne                        |
| B2  | **Hiérarchie tenant** enseigne→magasin→zone + rôle régie | `users.site_id` singleton + pas de `parent_site_id`. Pattern pivot `agency_sites` = patron.                                   | 🟡🔴 (~3-5j)      | multi-magasins, régie scopée                    |
| B3  | **Config par ÉCRAN**                                     | `config_profiles` est par-site ; un magasin N écrans = N contenus distincts non modélisable.                                  | 🔴                | magasin multi-écran différencié                 |
| B4  | **Supervision substrat-agnostique**                      | Le SaaS n'a **aucun** heartbeat ; un player retail « down » n'alerte pas.                                                     | 🟡🔴              | SLA flotte retail                               |
| B5  | **Audience humaine + CDN**                               | `video_plays` = diffusions, pas humains. Table `retail_audience_signals` séparée + `audience_type`. FTP single-account → CDN. | 🔴 (~2-3 sprints) | facturation à l'impression, volume/multi-région |
| B6  | **Auth kiosk distribué**                                 | Écrans retail sans Pi (Fire Stick/Android) à auto-provisionner sans enregistrement manuel.                                    | 🟡🔴              | déploiement parc magasin                        |

→ **Ces 6 sont le vrai sujet de la séance d'architecture.** Aucun n'est sport-spécifique ; MadXP ne les a pas résolus pour lui-même.

---

## Ordre recommandé (3 mois)

1. **Séance** : trancher la stack (Décision C — renforcée : le sport fait déjà edge `pi` ET cloud `saas`), remplir la grille retail (§I.5 du CDC), décider B1/B3 (les 2 chantiers structurants).
2. **P1 noyau** : A1+A2 (site_type + strategy) + B2 (hiérarchie tenant) + B3 (config par écran) si retail multi-écran.
3. **P2 vertical sport re-câblé** sur le noyau (cf. SPEC-CORE-PLAYER §12).
4. **P3 vertical retail MVP** : A3-A10 + B5 (audience) selon la grille remplie.

**Garde-fou** : ne PAS attaquer B1 (push-back) « parce que c'est propre » si le retail v1 est cloud-only (always-connected). Le faire seulement si un edge retail offline est confirmé (grille Q6).
