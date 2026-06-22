# Analyse concurrentielle — Stramatel ViPlex Express / Handy vs MadXP

> Source côté concurrent : doc de **mise en service ViPlex Express V8** (logiciel PC) + **ViPlex Handy 5.0** (app smartphone) fournie par Stramatel.
> Date d'analyse : 2026-06-22.
> Niveau de confiance : ✅ pour les faits issus des docs (PDF Stramatel + specs MadXP), ⚠️ pour l'interprétation stratégique.

## TL;DR

**ViPlex est un meilleur _outil d'affichage_. MadXP est un meilleur _produit pour club sportif_.** Ce ne sont pas les mêmes batailles.

- **ViPlex Express / Handy** = un logiciel de gestion de playlists (PC + smartphone) qui pilote un lecteur média LED (Mediaplayer **Taurus** / régie vidéo) en local. C'est l'écosystème **Novastar** rebadgé Stramatel, mûri sur le métier « affichage LED ».
- **MadXP** = une plateforme cloud multi-tenant (Dashboard → Central Server → Pi edge / SaaS) qui orchestre une flotte, automatise les sponsors, persiste les sessions match et fonctionne en autonomie offline.

Deux philosophies opposées : **un opérateur devant un PC** vs **une flotte pilotée à distance + un staff club autonome depuis les tribunes**.

## Tableau comparatif

| Domaine | ViPlex Express (Stramatel) | MadXP |
|---|---|---|
| **Architecture** | Logiciel local PC/smartphone ↔ régie vidéo (Taurus) | 3-tiers cloud : Dashboard ↔ Central Server ↔ Pi/SaaS |
| **Modes de pilotage** | WiFi (PC/app), HDMI, **clé USB** | Cloud (Socket.IO), LAN, hotspot, file offline |
| **Multi-sites / flotte** | ❌ Mono-régie, pas de gestion de parc | ✅ 50+ Pi + sites SaaS depuis 1 dashboard, télémétrie 30 s |
| **Création de contenu** | Éditeur intégré (pages, widgets, textes animés) | Templates Studio Remotion (rendu vidéo dynamique) |
| **Widgets prêts à l'emploi** | ✅ Météo, flux RSS, YouTube, horloge | ⚠️ Pas natifs (à faire via templates) |
| **Planification** | Créneaux heure/jour/semaine/mois/année + calendrier | Time categories (before/during/after/neutral) + CRON |
| **Live match** | « Gestion du jeu » : 1 clic change la solution (Taurus only) | Sessions match persistées (équipes, scores, historique) + scoreboard live HTTP |
| **Télécommande** | ViPlex Handy (smartphone WiFi) | Remote V1+V2, PIN par profil, fallback offline |
| **Messages d'urgence** | ✅ Intercalables sur diffusion en cours | ⚠️ Événements ponctuels via CRON, pas d'override live |
| **Multi-écrans** | ✅ Mosaïque (mur N écrans, config position) | ⚠️ Primary HDMI0 + Secondary HDMI1 (bandeau LED), pas de mosaïque NxN |
| **Export USB** | ✅ Plug & play / Copier-lire | ❌ Non |
| **Sponsors / pub** | ⚠️ Diffusion de médias, stats fréquence/durée | ✅ Rotation pondérée (Bresenham), rapports mensuels auto, magic links |
| **Analytics** | Stats basiques (fréquence, durée) | Agrégation quotidienne, breakdown event_type/période, ROI sponsor |
| **Offline** | Diffusion locale (clé USB, Taurus) | Autonomie Pi totale après bootstrap |
| **Mode sans matériel** | ❌ Toujours une régie/Taurus | ✅ SaaS : TV = page web Chromium, zéro hardware |

## Le point de bascule : la persona

| Besoin réel d'un club | ViPlex | MadXP |
|---|---|---|
| Staff qui anime depuis les **tribunes**, sans formation PC | ❌ opérateur devant un PC/app | ✅ Remote PIN, tablette en main |
| **Score live + sessions match** historisées | ⚠️ « Gestion du jeu » = changer une solution, pas de session | ✅ équipes, scores, historique, auto-close |
| **ROI sponsors** (le club vend de la pub) | ⚠️ stats de diffusion basiques | ✅ rotation pondérée + rapports auto + magic links |
| Ça tourne **tout seul** sans opérateur | ⚠️ playlist planifiée, mais quelqu'un pilote | ✅ autonomie offline + automatisation |
| Plusieurs clubs / **flotte** | ❌ mono-régie | ✅ 50+ sites, support à distance |

- **Club qui veut un « studio LED »** (contenu riche, météo, mur d'écrans, messages flash) → ViPlex coche plus de cases _en édition_.
- **Club sportif qui veut animer un match, monétiser ses sponsors et oublier la technique** → MadXP est clairement mieux aligné. C'est son positionnement assumé (cf. `.claude/rules/context.md` : « TV interactive sans dépendance internet en live »).

## Ce que Stramatel a et MadXP n'a pas

1. **Widgets natifs météo / RSS / YouTube / horloge** — pas d'équivalent prêt à l'emploi côté MadXP.
2. **Export clé USB** (plug-and-play ou copier-lire) — utile quand zéro réseau.
3. **Mosaïque multi-écrans** (mur de N écrans avec position de chaque dalle).
4. **Messages d'urgence intercalés** en live sur la diffusion en cours.
5. **Éditeur de pages/widgets WYSIWYG** très accessible (positionnement 100 % libre, propriétés média/texte granulaires).

## Ce que MadXP a et Stramatel n'a pas

1. **Gestion de flotte multi-sites** (50+ Pi, multi-tenant RLS) — ViPlex est mono-régie.
2. **Mode SaaS sans matériel** (navigateur uniquement).
3. **Automatisation sponsors** : rotation pondérée, rapports mensuels auto, portails magic-link.
4. **Sessions match persistées + historique** (analytics-ready, pas juste du live).
5. **Pilotage 100 % distant** (support à distance, push contenu sur toute la flotte) sans accès physique.
6. **Génération de contenu dynamique** (Remotion : vidéo rendue à la volée vs médias statiques).
7. **OTA / déploiement canary** sur le parc.

## Pistes d'inspiration pour MadXP

⚠️ _Interprétation — à arbitrer produit, pas une recommandation d'implémentation immédiate._

Les 4 gaps relevés ne sont **pas un retard de fond** : ce sont des **briques d'affichage** que MadXP pourrait ajouter, alors que l'inverse (flotte cloud + automatisation sponsors + sessions match) est beaucoup plus lourd à rattraper pour ViPlex.

| Piste | Valeur club | Effort estimé |
|---|---|---|
| **Messages d'urgence intercalés** en live (override de la playlist en cours) | Élevée (sécurité, annonces) | ⚠️ à chiffrer |
| **Widgets natifs** (horloge, météo, RSS) en plus des templates | Moyenne | ⚠️ à chiffrer |
| **Export clé USB** comme filet pour les sites sans réseau du tout | Faible (le Pi gère déjà l'offline) | ⚠️ à chiffrer |
| **Mosaïque multi-écrans** si MadXP vise des installations LED périmétriques larges | Dépend du marché visé | ⚠️ à chiffrer |

## Références

- Doc concurrent : `Support_mise_en_service_ViPlex_Express_Stramatel_V8.pdf` (non versionnée).
- Positionnement MadXP : `docs/product/PRODUCT-VISION.md`, `docs/product/USE-CASES.md`.
- Modèle Pi vs SaaS : `.claude/rules/context.md`, `docs/adr/ADR-120-pi-saas-ownership-model.md`.
