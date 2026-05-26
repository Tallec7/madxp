# Roadmap MadXP

> ⚠️ **STALE** — Dernière révision : 2026-04-25. Contenu potentiellement périmé. Revue mensuelle recommandée.

> **Audience** : futur PM (jour 1 = sait quoi prioriser et quoi refuser) + futur CTO (sait quelles fondations construire) + Daisy (référence partagée pour décider)
>
> **Statut** : Live | **Dernière revue** : 2026-04-25 | **Prochaine revue** : tous les mois (la roadmap est vivante, pas figée)
>
> **Source** : interview Daisy 2026-04-25 + audit Lead Dev Claude + benchmark `docs/strategy/BENCHMARK-COMPETITORS.md`

## Comment lire ce doc

Format **Now / Next / Later / Anti-roadmap** (inspiré ProductPlan, jamais SAFe). Avantages :

- Pas de date contractuelle (on s'engage sur la priorité, pas la livraison)
- Lecture en 2 min par un investisseur ou candidat
- Mise à jour mensuelle facile

```
┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐
│  NOW    │  │  NEXT    │  │  LATER   │  │ ANTI-ROADMAP │
│  S1-4   │  │  M2-3    │  │  M4-12   │  │  jamais      │
│  Daisy  │  │  + PM    │  │  + CTO   │  │              │
└─────────┘  └──────────┘  └──────────┘  └──────────────┘
```

---

## Vision 12 mois (printemps 2027)

Mix scénario **B + C** :

- **B (scale-up qui lève en seed)** : 50-100 sites payants, équipe 4-8, levée seed envisagée Q3-Q4 2026
- **C (sur-mesure haut de gamme)** : prestations one-shot premium (Pack Media Day, Pack Tournoi, Audit partenariat) qui complètent l'ARR récurrent

**Pas de scale 200+ sites**, pas d'expansion internationale avant stabilisation FR.

## UVP (Unique Value Proposition)

> _"MadXP est le seul SaaS cloud multi-tenant qui permet à un club, une agence ou une fédération de piloter à distance la TV interactive, la régie publicitaire multi-niveaux et l'expérience matchday de N sites depuis un dashboard unique — là où Bodet, Stramatel et autres fabricants LED restent en console locale par installation."_

Cf. `docs/strategy/BENCHMARK-COMPETITORS.md` pour les 5 différenciateurs forts confirmés (SaaS multi-tenant, gestion de flotte, mode SaaS pur sans hardware, inventaire pub centralisé multi-clubs, templates Remotion data-driven).

---

## NOW — Semaines 1-4 (mai 2026, avant l'arrivée du PM)

> **Critère NOW** : Daisy peut le faire seule (avec Claude en exécution), ça crédibilise le recrutement, faisable en 4 semaines.

### N-01 — Merger les 2 PRs en attente

- **Quoi** : PR #612 (split cron-scheduler via ADR-097) + PR #615 (TECH-DEBT + RISKS)
- **Owner** : Daisy
- **Effort** : 0 (juste merger après review)
- **Pourquoi** : bloque toute autre PR cohérente
- **Statut** : ⏳ en attente review

### N-02 — Trio docs PM (PERSONAE + KPIS + ROADMAP)

- **Quoi** : 3 docs sortants de l'interview phase (b)
- **Owner** : Claude rédige, Daisy valide
- **Effort** : 2j
- **Pourquoi** : sans ces 3 docs, recrutement PM impossible
- **Statut** : ⏳ cette PR

### N-03 — `docs/PRODUCT.md` one-pager

- **Quoi** : pitch + market + pricing + traction sur 1 page (vu en 1er par tout candidat)
- **Owner** : Claude rédige depuis interview + benchmark, Daisy complète privé
- **Effort** : 2j (input métier requis sur traction)
- **Pourquoi** : LE doc qu'un candidat lit en 1er sur le repo public

### N-04 — `docs/CLIENTS.md` privé (gitignored)

- **Quoi** : liste 7 sites actifs + ARR + SLA + contact référent
- **Owner** : Daisy seule (info confidentielle)
- **Effort** : 0.5j (input pur)
- **Pourquoi** : le PM va demander "à qui je parle ?" jour 1

### N-05 — `docs/RUNBOOK.md` (5 incidents probables)

- **Quoi** : NLF Pi down, Railway down, Hostinger down, perte clé PSK, DB perdue → procédure pas-à-pas
- **Owner** : Daisy + Claude
- **Effort** : 2j
- **Pourquoi** : mitige R-02 bus factor (gros risque) + crédibilise auprès du CTO

### N-06 — Sentry wiré (3 apps)

- **Quoi** : Sentry Free tier sur dashboard + central-server + raspberry, sourcemaps activées
- **Owner** : Daisy
- **Effort** : 1j
- **Pourquoi** : question 3/10 du CTO en interview, gain énorme/coût

### N-07 — Backup DB testé mensuel

- **Quoi** : workflow GitHub Action mensuel qui restore + valide + Slack résultat
- **Owner** : Daisy
- **Effort** : 1j
- **Pourquoi** : mitige R-04 perte DB, crédibilise audit sécurité

**Total NOW : 7 items, ~9 jours-personne sur 4 semaines.** Tient même avec un incident NLF qui mange 2-3j.

---

## NEXT — Mois 2-3 (juin-juillet 2026, avec le PM)

> **Critère NEXT** : nécessite cadrage PM avant code, faisable sur 8 semaines, bloque le LATER si pas fait.

### NX-01 — Portail ROI Sponsor V1

- **Quoi** : mail mensuel automatique aux sponsors + portail web dédié (login simple) avec impressions, captures écran
- **Owner** : PM cadre + valide UX, Daisy code
- **Effort** : 2 sem
- **Pourquoi** : wow persona 6 (sponsor local), ouvre upsell sponsor + différenciateur fort confirmé benchmark

### NX-02 — Refonte Template Studio basée retours users

- **Quoi** : V4 du studio basée feedback utilisateurs NLF + autres clubs
- **Owner** : PM cadre, Daisy code
- **Effort** : 2 sem
- **Pourquoi** : wow persona 3 (responsable com), ADR-095 livré, V4 à concevoir avec PM

### NX-03 — Onboarding self-service nouveau site

- **Quoi** : un nouveau club peut créer son site sans Daisy (wizard, validation, paiement, provisioning Pi/SaaS)
- **Owner** : PM cadre, Daisy code
- **Effort** : 1.5 sem
- **Pourquoi** : aujourd'hui Daisy onboarde manuellement → ne scale pas, bloque B (50-100 sites)

### NX-04 — 5-10 user interviews structurés

- **Quoi** : interviews qualitatives des 4 personae 🔮 (annonceur, régie, fédération, spectateur QR) + 3 sponsors NLF + 2 staff bénévoles
- **Owner** : PM 100%
- **Effort** : 4 sem en continu
- **Pourquoi** : sans données terrain, le PM construit dans le vide

### NX-05 — Cloudflare devant Hostinger + plan bascule R2

- **Quoi** : proxy + cache Cloudflare devant FTP Hostinger vidéos + procédure de bascule documentée vers Cloudflare R2 ou S3
- **Owner** : Daisy + freelance possible
- **Effort** : 2j
- **Pourquoi** : mitige R-03 SPOF Hostinger (retiré du NOW). ⚠️ Le frontend (dashboard + SaaS) a été migré sur Cloudflare Pages le 2026-04-29 (ADR-071 phase 3, PRs #729→#743), donc R-03 ne couvre plus que la composante FTP vidéos.

### NX-06 — Split `metrics.service.ts` + 4 SPECs critiques + Smoke tests SPEC

- **Quoi** :
  - `metrics.service.ts` 1315 → ~600 lignes via `metrics/<domain>.ts`
  - 4 SPECs : templates-studio, saas-mode, cron-scheduler, socket-service
  - Smoke tests SPEC activés (chaque ADR référencé dans ≥1 SPEC, services >300 lignes ont une SPEC)
- **Owner** : Daisy autonome, parallélisable sur sessions Claude
- **Effort** : 1 sem cumul
- **Pourquoi** : crédibilise pour interviews CTO M3, ferme l'audit Lead Dev

### NX-07 — `docs/INFRA.md` + cost breakdown

- **Quoi** : map services (Railway, Hostinger, Cloudflare, domaines) + coûts mensuels exacts
- **Owner** : Daisy + 0.5j input compta
- **Effort** : 0.5j
- **Pourquoi** : le CTO va demander le coût exact avant de signer

**Total NEXT : 7 items, ~8 sem-personne** (4 sem PM + 4 sem Daisy en parallèle).

---

## LATER — Mois 4-12 (août 2026 → printemps 2027)

> **Critère LATER** : connu et désiré (pas spéculation), pas faisable en 3 mois, cohérent avec positionnement B+C.
>
> **Tag `[lacune-bench]`** = item ajouté suite à l'analyse benchmark concurrence (pas demande client directe). Cf. `docs/strategy/BENCHMARK-COMPETITORS.md`.

### L-01 — QR code + jeu live spectateur (V1)

- **Précondition** : Sponsor portal V1 livré (NX-01)
- **Cible métier** : wow persona 5 (spectateur tribune) + sponsor premium pricing 5×
- **Effort** : ~6-8 sem
- **Cible engagement** : 5-10% spectateurs participent (V1 MVP)

### L-02 — Multi-LED (pilotage panneaux LED indépendants)

- **Précondition** : dev #2 onboardé (M5+)
- **Cible métier** : marché premium clubs pro avec budget LED (extension ADR-029)
- **Effort** : ~4-6 sem
- **Note** : ne casse pas l'anti-roadmap "pas de hardware propriétaire" — pilote juste des panneaux tiers

### L-03 — Score Box hardware (boîtier table de marque)

- **Précondition** : validation prototype + partenaire fab
- **Cible métier** : wow persona 4 niveau pro, libère le bénévole de la télécommande tablet
- **Effort** : 3-6 mois (sourcing, prototype, premier batch)
- **Risque** : hardware ouvre sourcing/SAV/stocks — à cadrer avec CTO en M4-5 avant d'investir

### L-04 — Score Box software V2 (overlay multi-sport customisable)

- **Précondition** : ADR-088/090 base déjà là, extension à conduire
- **Cible métier** : vendre MadXP à d'autres sports que handball/basket (étendre le marché adressable)
- **Effort** : ~4 sem

### L-05 — Module réseaux sociaux post-match (highlights auto Insta/TikTok)

- **Précondition** : APIs Meta + TikTok cadrées
- **Cible métier** : wow persona 3 (responsable com), différenciation marché vs Bodet/Stramatel
- **Effort** : ~6 sem

### L-06 — Sponsor Portal V2 (pricing dynamique + marketplace)

- **Précondition** : Sponsor V1 stable (NX-01) + 6 mois de data ROI
- **Cible métier** : monétisation directe MadXP = nouveau revenue stream (commission sur revenu sponsor)
- **Effort** : ~8 sem

### L-07 — Régie / Fédération onboarding self-service

- **Précondition** : personae 8 (régie) et 10 (fédération) validés client réel
- **Cible métier** : canal de distribution institutionnel
- **Effort** : ~4 sem

### L-08 — Internationalisation V1 (Belgique, Suisse, Espagne)

- **Précondition** : PM onboardé + 5+ clients FR récurrents qui valident le modèle
- **Cible métier** : scale géographique cohérent avec B (scale-up seed)
- **Effort** : ~12 sem (i18n + adaptation locale + vente)

### L-09 — Animations auto sur action de jeu `[lacune-bench]`

- **Quoi** : déclenchement automatique d'animations vidéo sur événements match (but, pénalité, 3-points, temps fort)
- **Pourquoi** : lacune confirmée vs Bodet VIDEOSPORT
- **Effort** : ~3 sem

### L-10 — Streaming live + score auto intégré `[lacune-bench]`

- **Quoi** : compatibilité avec un live streaming social media du match avec score affiché en overlay
- **Pourquoi** : lacune confirmée vs Stramatel SL Stream Box
- **Effort** : ~4-6 sem

### L-11 — Sync social media intégré avec modération `[lacune-bench]`

- **Quoi** : afficher tweets / posts hashtagués sur l'écran tribune avec modérateur (style fan engagement)
- **Pourquoi** : lacune confirmée vs Bodet VIDEOSPORT (hashtags + comptes prédéfinis)
- **Effort** : ~3 sem

### L-12 — ADR-074 Phase 5b (suppression `club-config.json`)

- **Précondition** : 100% flotte bootstrappée (`hotspot:status` à 7/7)
- **Cible** : closure rollout PSK
- **Effort** : 2j

### L-13 — Démantèlement progressif SAFe

- **Précondition** : PM en place qui décide pilotage final
- **Cible** : réduction overhead doc + alignement avec `.planning/` GSD
- **Effort** : ~2 sem (multi-PR)

**Total LATER : 13 items, étalés sur 9 mois.** Tient si dev #2 recruté en M3-4.

---

## ANTI-ROADMAP (ce qu'on NE fera pas, et pourquoi)

> Un bon PM se reconnaît à ce qu'il refuse, pas à ce qu'il accepte. Liste à brandir face à un prospect qui demande "vous faites X ?".

### A-01 — Coaching vidéo / replay tactique

**Refusé** : Hudl, Sportscode, Veo dominent ce marché. On ne veut pas concurrencer un outil dédié coaching avec un sous-marin générique.
**Réponse type** : _"On reste centré sur l'expérience matchday tribune + monétisation sponsor. Le coaching vidéo a d'excellents outils dédiés."_

### A-02 — Billetterie en ligne du club

**Refusé** : Weezevent, BilletWeb, Yurplan dominent. Marché saturé, marges faibles, support 24/7 lourd.
**Réponse type** : _"On s'intègre avec votre billetterie existante (afficher capacité restante, etc.) mais on ne vendra jamais de billets."_

### A-03 — App mobile dédiée pour les supporters du club

**Refusé** : maintenance native (iOS + Android stores, certificats, push, updates) = enfer. Le QR code spectateur (L-01) est notre canal d'engagement, pas une app à installer.
**Réponse type** : _"Le compagnon mobile spectateur passe par le QR code en tribune (notre wow persona 5), pas par une app dédiée."_

### A-04 — Customisation structurelle du dashboard

**Refusé** : multiplie les surfaces de bug, casse les conventions UX, transforme le SaaS en sur-mesure infini (anti-pattern Salesforce).
**Nuance** : white-label visuel (logos, couleurs club/fédération) **OK**, customisation structurelle (renommer onglets, choisir widgets, organisation) **non négociable**. Limite à clarifier face à chaque demande.
**Réponse type** : _"Le dashboard est white-label aux couleurs du club, mais l'organisation est fixe — c'est ce qui garantit la cohérence du support et la vitesse d'évolution."_

### A-05 (anti-bench) — Tableau de score homologué fédération

**Refusé** : segment hardware Bodet/Stramatel + certifications FIBA/FFBB lourdes à obtenir, pas dans notre angle SaaS.
**Réponse type** : _"On affiche le score sur un écran moderne (TV existante), pas sur un panneau LED réglementaire homologué — pour ça utilisez un Bodet."_

### A-06 (anti-bench) — Hardware LED propriétaire

**Refusé** : Bodet/Stramatel font ça depuis 30+ ans avec 180 salariés. On utilise la TV existante du club, c'est notre angle SaaS pur (cf. ADR-037).
**Réponse type** : _"Pas de catalogue LED chez MadXP — on transforme la TV ou l'écran existant."_

### A-07 (anti-bench) — Pupitre tactile dédié style SCOREPAD

**Refusé** : la télécommande mobile (smartphone/tablet) suffit. Un pupitre dédié = SAV hardware + stock + formation.
**Réponse type** : _"La télécommande MadXP est une PWA mobile/tablette, pas un pupitre physique."_

---

## Pricing résumé (cf. `docs/PRODUCT.md` détaillé)

| Tier        | Prix annuel | Cible                                                 |
| ----------- | ----------- | ----------------------------------------------------- |
| **Play**    | 790€        | Découverte SaaS — Player web                          |
| **Club**    | 1 500€      | TV pro + Boîtier Pi                                   |
| **Pro** ⭐  | 2 100€      | Sponsors monétisés + preuves diffusion                |
| **Premium** | 3 000€      | Full service + double écran + analytics + 24h support |

Add-ons annuels : marque blanche 500€, double écran 350€, profil sup 500€.
Prestations one-shot : template club 700€, audit partenariat 1 000€, spot sponsor 300-500€, motion design 800€, shooting 600€, **Pack Media Day 2 500€**, boîtier additionnel 500€ + 30€/mois.

Engagement 9 mois (saison sportive). Boîtier propriété MadXP.

---

## Concurrents et positionnement (cf. `docs/strategy/BENCHMARK-COMPETITORS.md`)

| #   | Concurrent           | Type                            | Force                                            | Faiblesse                              |
| --- | -------------------- | ------------------------------- | ------------------------------------------------ | -------------------------------------- |
| 1   | **Bodet Sport** (FR) | LED hardware + VIDEOSPORT       | Cert FIBA, animations auto, social media intégré | Pas de cloud multi-tenant, OTA via USB |
| 2   | **Stramatel** (FR)   | LED + apps Android              | Cert FFBB+FIBA, partage social natif, service WE | Pas de dashboard cloud, pilotage radio |
| 3   | **A2Display** (FR)   | Logiciel + LED multi-secteur    | Multi-secteur                                    | Pas spécialisé club, pas multi-tenant  |
| 4   | **TVTools** (FR) ⚠️  | SaaS/On-Premise affichage stade | 38 ans expertise, périmètre proche               | Analyse session 2 à venir              |

**Concurrent indirect dominant** : OBS Studio + bricolage (gratuit, bénévole). Pitch : _"Coût caché du gratuit : temps, fragilité, pas de support flotte."_

---

## Synthèse pour interview PM/CTO

### Tableau récap roadmap

| Phase            | Période                       | Items              | Owner principal       | Total effort |
| ---------------- | ----------------------------- | ------------------ | --------------------- | ------------ |
| **NOW**          | S1-4 (mai 2026)               | 7 items            | Daisy + Claude        | ~9 j         |
| **NEXT**         | M2-3 (juin-juillet)           | 7 items            | PM cadre + Daisy code | ~8 sem       |
| **LATER**        | M4-12 (août → printemps 2027) | 13 items           | PM + dev #2 + CTO     | ~9 mois      |
| **ANTI-roadmap** | Jamais                        | 7 refus définitifs | (refus)               | n/a          |

### Pour le pitch en 30 secondes

> _"Notre roadmap est en 3 horizons : NOW = 7 items techniques avant le PM (docs, infra, monitoring), NEXT = 7 items à attaquer dès l'arrivée du PM (sponsor portal, onboarding self-service, user research), LATER = 13 items pour M4-12 dont 3 viennent de notre benchmark concurrentiel (animations auto, streaming, social media). On a aussi 7 anti-features explicitement refusées (coaching, billetterie, app mobile, hardware LED, pupitre dédié, etc.) — c'est ce qui nous garde focused sur notre angle SaaS multi-tenant pour clubs amateurs/semi-pros."_

### TODO Daisy persistants

- [ ] Valider liste roadmap NEXT avec le futur PM dès semaine 1 (peut être ajustée selon ses priorités)
- [ ] Confirmer recrutement dev #2 en M3-4 (précondition L-02, L-03, L-05)
- [ ] Décision investissement hardware Score Box (L-03) à prendre avec CTO en M4-5
- [ ] Estimer budget i18n (L-08) avant M9
