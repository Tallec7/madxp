# Tech Debt Register MadXP

> ⚠️ **STALE** — Dernière révision : 2026-04-30. Contenu potentiellement périmé. Revue trimestrielle recommandée.

> **Audience** : Daisy (Lead Dev solo) + futur CTO + futur PM (pour comprendre où va l'énergie tech)
>
> **Principe directeur** : honnêteté > brillance. Mieux vaut un doc qui dit "ce truc pue, on le sait" qu'un doc qui passe sous silence. Un fichier `TECH-DEBT.md` honnête est un magnet pour les bons CTO.
>
> **Statut** : Live | **Dernière revue** : 2026-04-27 | **Prochaine revue** : tous les 2 mois

## Comment lire ce doc

Chaque item est rangé par **priorité** (P0 = bloque la prod ou la prochaine étape produit, P3 = "ce serait mieux"). Chaque item indique :

- **Pourquoi c'est de la dette** (ce que ça coûte aujourd'hui)
- **Effort estimé** (en demi-journée, journée, semaine)
- **Bloquant pour** (recrutement, scale, audit, etc.)

Si un item est résolu, on le déplace dans `## ✅ Résolu` en bas.

---

## P0 — Bloquant ou risque immédiat

### Bus factor = 1

- **Pourquoi** : si Daisy disparaît 2 semaines (maladie, vacances, accident), le projet s'arrête. Aucune autre personne ne peut déployer une version, gérer un incident NLF, ou onboarder un nouveau client.
- **Coût aujourd'hui** : impossible de prendre 1 semaine de vacances sans astreinte.
- **Effort de mitigation** : `docs/RUNBOOK.md` + `docs/RUNBOOK-INCIDENTS.md` (5 scénarios les plus probables) + un freelance back-up identifié = ~3 jours.
- **Bloquant pour** : recrutement PM/CTO (le CTO va vouloir savoir comment l'astreinte est couverte avant son arrivée), scaling client (au-delà de 15 sites, 0 backup = inacceptable).

### Hostinger SPOF (Single Point Of Failure) — partiellement mitigé

- **Pourquoi** : si Hostinger tombe (déjà arrivé en 2025), plus de vidéos servies aux Pi (FTP). Le dashboard et le SaaS ne sont plus impactés depuis la migration Cloudflare Pages (ADR-071 phase 3, 2026-04-29).
- **Coût aujourd'hui** : risque réputationnel sur les vidéos servies (TV blanche en plein match) si Pi en mode dégradé sans cache local.
- **Effort de mitigation restant** : Cloudflare en proxy + cache devant FTP Hostinger vidéos (1j) + plan de bascule documenté vers S3/R2 (1j) + test de bascule annuel.
- **Avancement (2026-04-29, PRs #729→#743)** : frontend migré sur Cloudflare Pages avec deploys atomiques, rollback 1-clic, CDN edge global. Bascule progressive via `vars.HOSTING=cloudflare`. **Reste** : phase 4 cleanup .htaccess + jobs lftp (J+7), puis FTP vidéos.
- **Bloquant pour** : signature de clients > NLF (un acheteur sérieux fera ce check sur la vidéo).

### Aucun backup DB testé

- **Pourquoi** : Railway fait des backups Postgres, mais aucun test de restore documenté. La task CRON `backup` était même une placeholder qui retournait `success: true` sans rien faire (corrigée PR #600).
- **Coût aujourd'hui** : si la DB Railway est perdue (incident provider, suppression accidentelle), impossible d'estimer combien on récupère.
- **Effort de mitigation** : workflow GitHub Action mensuel qui (1) restore le dernier backup vers une DB éphémère, (2) lance un script de validation, (3) Slack avec le résultat. ~1j.
- **Bloquant pour** : audit RGPD, audit assurance cyber, sérénité personnelle.

### TODO Daisy : runway disponible et plan de salaire pour la première recrue

- Aucune visibilité documentée sur les revenus mensuels (NLF, bworlds, autres) ni sur la trésorerie disponible. Sans ça, impossible de chiffrer la fenêtre PM puis CTO de manière réaliste.
- À documenter dans un fichier privé (gitignored), pas ici. Mais l'absence du chiffre est en soi de la dette : le CTO posera la question dès l'interview.

---

## P1 — À traiter dans 1-3 mois (avant l'arrivée du CTO)

### Drift silencieux des `site_sponsor_id` (FK manquante + réconciliation Pi figée)

- **Pourquoi** : `video_plays.site_sponsor_id` n'a aucune contrainte FK alors que les 4 autres colonnes sponsor/campaign/session/video l'ont (`ON DELETE SET NULL`). Toute suppression d'un `site_sponsors` laisse les `video_plays` en référence pendante. Couplé à une réconciliation Pi-side figée (`local_config_mirror.localSponsors[].centralId` calculé une fois en mars 2026 sans re-vérification), n'importe quelle suppression de sponsor cross-fleet propage une dette analytics et du bruit Slack permanent.
- **Coût aujourd'hui** : 12 références mortes dans `config_profiles` (NLF + Demo SaaS), 27 entries dans `localSponsors[]` (NLF: 14, Bottière: 13), faux positif `aggregation_stale critical` chronique sur clubs inactifs >36h (corrigé PR [#894](https://github.com/Tallec7/neopro/pull/894), commit `d0754257`), 2306 plays NLF perdus pour les analytics par sponsor (cleanup data appliqué prod 2026-05-07).
- **Effort** : 3 phases issues GitHub. Phase 1 cloud ([#891](https://github.com/Tallec7/neopro/issues/891) — FK + validation API + cleanup migration + ADR léger, ~1j) — débloque les autres. Phase 2 Pi OTA ([#892](https://github.com/Tallec7/neopro/issues/892) — re-réconciliation localSponsors, ~1.5j). Phase 3 observability ([#893](https://github.com/Tallec7/neopro/issues/893) — métrique + Grafana, ~0.5j si bundle).
- **Bloquant pour** : confiance dans les reports sponsor multi-sites, scaling au-delà de 15 clubs (chaque cycle "re-création de sponsors" rejouera le bug), crédibilité audit data CTO.
- **Audit complet** : `docs/audits/site-sponsor-orphans-2026-05-07.md`.

### `metrics.service.ts` à 1315 lignes

- **Pourquoi** : 35+ sections de métriques Prometheus inlinées. Au-delà des 400 lignes recommandées (règle perso). Difficile d'auditer les fuites de cardinalité ou les labels mal nommés.
- **Coût aujourd'hui** : ajouter une métrique = lecture diagonale de 1300 lignes pour vérifier qu'on ne dupplique pas un nom.
- **Effort** : split en `metrics/<domain>.ts` (HTTP, business, database, websocket, etc.) en gardant la classe singleton comme façade. ~1j. Pattern déjà rodé via ADR-096 (socket.service) et ADR-097 (cron-scheduler).
- **Bloquant pour** : pas tout de suite, mais le CTO le verra dès le 1er audit code et conclura "ils savent splitter mais ils n'ont pas fini".

### Aucune observabilité business (uniquement infra)

- **Pourquoi** : Prometheus collecte CPU, RAM, latency, errors. Mais aucune métrique business n'est tracée en temps réel : matches en live à l'instant T, pubs servies par jour, screen time médian par site, NPS, churn.
- **Coût aujourd'hui** : pour répondre "comment va le produit ?" il faut écrire une query SQL ad hoc. Le PM ne pourra pas piloter sans ça.
- **Effort** : 5-10 métriques business à ajouter dans Prometheus + 1 dashboard Grafana dédié "Business" = ~2-3j. Le contenu des queries existe déjà dans `pitch-deck-metrics.sql`.
- **Bloquant pour** : recrutement PM (1ère chose qu'il demandera).
- **Note (2026-04-27)** : la dette voisine "métriques émises sans dashboard" a été traitée par PR #631 (`neopro-blind-spots-cloud.json` + smoke guard). Le pattern audit-then-guard est désormais réplicable pour ce chantier business.

### Pas de Sentry ou équivalent (error tracking)

- **Pourquoi** : les erreurs serveur partent en logs Winston + Logtail. Côté frontend (dashboard Angular + raspberry Angular), il n'y a aucune capture des erreurs JS users-side.
- **Coût aujourd'hui** : un user qui voit une page blanche → tu ne le sauras qu'en interviewant le user. Côté Pi, idem : un crash silencieux ne remonte qu'au prochain heartbeat.
- **Effort** : Sentry Free tier suffit pour démarrer (5k events/mois). Wire dans 3 apps Angular + central-server = ~1j incluant les sourcemaps.
- **Bloquant pour** : crédibilité CTO en interview ("vous trackez les erreurs comment ?" est question 3 sur 10).

### Pas de staging Pi en flotte

- **Pourquoi** : ADR-091 a livré un staging cloud (Railway + Cloudflare staging). Mais il n'y a pas de Pi de staging dédié dans le parc qui valide une OTA avant le rollout flotte.
- **Coût aujourd'hui** : chaque OTA est testée localement chez Daisy puis envoyée en canary 5 Pi de production. Si un bug Pi-spécifique passe le canary mais casse à 50% du parc, c'est NLF qui prend.
- **Effort** : 1 Pi physique dédié (~150€ matériel) + sync-agent en mode "staging-pi" qui pull depuis le canary cohort = ~1-2j.
- **Bloquant pour** : sérénité de release, scaling au-delà de 30 sites.

### Aucune politique data retention formelle / audit RGPD

- **Pourquoi** : la DB contient des emails users, des club_sessions avec match info, des video_plays (logs comportementaux), des audit_logs. Aucun document ne dit "voici la donnée perso, voici comment on la supprime, voici qui peut y accéder".
- **Coût aujourd'hui** : risque légal modéré (clubs = personnes morales pas personnes physiques pour la majorité). Risque réputationnel si demande RGPD utilisateur dashboard et qu'on ne sait pas répondre en 30 jours.
- **Effort** : `docs/RGPD.md` 1 page + script `cleanup_user_data(user_id)` testé. ~1j.
- **Bloquant pour** : signature client entreprise (DPO leur côté demandera).
- **Avancement (2026-04-27, PR #633)** : registre RGPD (`docs/legal/GDPR_PROCESSING_REGISTER.md`), politique de confidentialité, CGV, mentions légales et page `/legal` du dashboard mis à jour avec les sous-traitants actuels (Railway USA + Hostinger UE). **Reste** : signer DPA Railway (https://railway.com/legal/dpa), écrire `docs/RGPD.md` opérationnel + script `cleanup_user_data(user_id)`.

### Secrets management : variables d'env Railway sans rotation ni audit

- **Pourquoi** : `JWT_SECRET`, `HOTSPOT_PSK_ENCRYPTION_KEY`, etc. sont stockés en clair dans Railway env vars. Pas de Vault, pas de rotation automatique, aucun log "qui a accédé à ce secret quand".
- **Coût aujourd'hui** : si un dev quitte le projet (cas hypothétique du futur dev #2), aucun moyen de prouver qu'il n'a pas exfiltré les secrets.
- **Effort** : transition vers Doppler ou Infisical = ~2j. Ou rester sur Railway env vars + ajouter un script de rotation trimestrielle = ~0.5j.
- **Bloquant pour** : multi-dev (à partir du 2e dev), audit sécurité.

### TODO Daisy : qui sont les 7 sites actifs en prod ?

- Liste à jour des sites en prod, type (Pi/SaaS), version logicielle, contact côté club, ARR, SLA contractuel. Document `docs/CLIENTS.md` privé (gitignored ou docs/clients/ existant).
- Sans ça, le PM jour 1 demande "à qui je peux parler pour faire des entretiens user ?" et personne ne sait répondre vite.

---

## P2 — À traiter dans 3-6 mois (avec l'aide du CTO)

### Code coverage non mesurée bloquant en CI

- **Pourquoi** : Codecov upload existe mais sans seuil bloquant. Une régression de couverture passe sans alerte.
- **Coût aujourd'hui** : zéro car tu maintiens un haut niveau toi-même. Mais quand l'équipe grossit, dérive certaine.
- **Effort** : configurer un seuil "ne pas baisser de plus de 1%" sur Codecov = ~0.5j.
- **Bloquant pour** : équipe à 3+ devs.

### Pas de release engineering (canary serveur, blue/green)

- **Pourquoi** : côté API/dashboard, chaque release est un déploiement direct vers prod après merge sur main. Pas de canary serveur (5% trafic vers nouvelle version, observation), pas de blue/green pour rollback instantané. Côté Pi, le canary OTA existe (ADR-094 cohorte 5 Pi), c'est très bien — manque juste l'équivalent serveur.
- **Coût aujourd'hui** : un bug serveur en prod = rollback Railway manuel via dashboard, downtime de 1-3 minutes.
- **Effort** : Railway ne supporte pas nativement le canary. Soit migration vers Render/Fly.io, soit feature flags (Unleash, GrowthBook) = ~3-5j selon option.
- **Bloquant pour** : scaling au-delà de 50 sites, SLA contractuel ≥99.5%.

### Process de release sans QA autonome

- **Pourquoi** : la qualité repose sur 1655 smoke tests + 3404 jest tests + une review PR. Pas de QA humaine, pas de tests E2E couvrant tous les flows critiques (E2E Playwright existe mais limité au login + portail club).
- **Coût aujourd'hui** : la confiance vient des tests automatisés ; OK pour l'échelle actuelle. Au-delà de 30 sites, il manque un check "human-in-the-loop" hebdomadaire.
- **Effort** : 1 freelance QA part-time (~1.5k€/mois) ou élargissement E2E Playwright (~5j de travail).
- **Bloquant pour** : pas dans les 6 mois ; à reconsidérer après recrutement PM/CTO.

### Dashboard Angular : 4 fichiers >1000 lignes

- `site-content-tab.component.ts` (1323), `group-detail.component.ts` (1091), `site-subscription-tab.component.ts` (1072), `safe-portfolio.component.ts` (1045), `sites-list.component.ts` (1011).
- **Pourquoi** : monolithes Angular avec template + logique + state mélangés.
- **Coût aujourd'hui** : modif d'un onglet impose lecture du fichier entier.
- **Effort** : split en sous-composants standalone + service dédié au state, ~1-2j par fichier. Pattern déjà appliqué à d'autres composants (cf. dashboard.md règles d'extraction).
- **Bloquant pour** : pas tout de suite. À prioriser après l'arrivée d'un fullstack mid-level (dev #2 post-CTO).

### Raspberry : `remote.component.ts` à 1203 lignes + sync-agent à 1099 lignes

- **Pourquoi** : monolithes côté Pi, particulièrement risqués car difficiles à tester localement (besoin d'un Pi physique).
- **Coût aujourd'hui** : modifs Pi sont lentes (chaque test = build + déploiement + observation TV).
- **Effort** : extraction de services Angular dédiés (state, score, timer, websocket) — pattern déjà commencé via remote-v2-helpers.ts. ~3-5j.
- **Bloquant pour** : remote-v2 rollout généralisé, ajout de nouveaux types d'événements live (set/round/etc.).

---

### Badge "📺 2nd" manquant sur la remote SaaS (Path B non généralisé)

- **Pourquoi** : `findSecondaryVariantsForVideos()` dans `video-variant.repository.ts` est hardcodé `WHERE display_type = 'secondary'` — pre-PROP-002, jamais mis à jour. Les vidéos avec variants `led-banner`/`totem`/`display-N` ne reçoivent pas de badge sur la cloud remote. Parallèlement, `remote.controller.ts` Path B lit `local_config_mirror` (vide pour les sites SaaS) → pipeline badge muet pour SaaS.
- **Coût aujourd'hui** : les badges "2nd" fonctionnent côté Pi (Path A), pas côté SaaS (Path B). Découvert incident 2026-05-08.
- **Effort** : généraliser `findSecondaryVariantsForVideos(displayTypes: string[])` + adapter `remote.controller.ts` pour lire `sites.displays[]` au lieu de `local_config_mirror` = ~0.5j.
- **Bloquant pour** : clients SaaS avec multi-écran (NLF, prospects avec TV + LED sans Pi).

## P3 — Confort, à traiter quand le reste est clean

### `validation.ts` (middleware Joi) à 1198 lignes

- 1 fichier qui contient TOUTES les schemas Joi. Pourrait être splitté par domaine (`validation/auth.ts`, `validation/sites.ts`, etc.).
- **Effort** : 0.5j. **Bloquant pour** : rien, c'est juste de l'hygiène.

### `analytics.repository.ts` à 1014 lignes

- Repository monolithique qui mélange clubs / advertisers / sponsors.
- **Effort** : 1j de split. **Bloquant pour** : rien à court terme.

### Tests à 1500+ lignes

- `advertiser-analytics.controller.test.ts` (1596), `socket.service.test.ts` (1309), `alerting.service.test.ts` (1143), `analytics.controller.test.ts` (1060).
- **Pourquoi** : tests qui ont grossi avec leur cible. Acceptable car les tests reflètent la complexité du SUT.
- **Effort** : split optionnel par describe block. Pas urgent.

### Dépendances dépréciées non auditées

- `npm audit` non lancé régulièrement. À automatiser via Dependabot.
- **Effort** : ~0.5j pour activer + trier les premières alertes.

### Documentation API non auto-générée

- Pas de Swagger/OpenAPI auto-généré. Quand on devra exposer une API publique partenaire (ADR-021 dans le futur), il faudra le faire.
- **Effort** : ~2-3j (annotations + génération + hébergement).

### Audit FTP nocturne ne check que `videos.storage_path` (pas `thumbnail_url`)

- Le CRON `video_ftp_audit` détecte les `.mp4` morts mais ignore les `.jpg` orphelins. Conséquence : on peut avoir des thumbnails sur le FTP sans vidéo associée (rest cause : suppressions FTP manuelles pré-PR avant que le cleanup auto soit ajouté). Pas un bug fonctionnel mais espace gaspillé + confusion possible (vignette qui survit à sa vidéo).
- **Effort** : ~0.5j. Étendre `video-ftp-audit.service` pour HEAD aussi `buildThumbnailPath(video.id)`, exposer une métrique `neopro_video_ftp_audit_orphan_thumbnails_total`. Pas besoin de schema change si on log juste la métrique (pas de stockage de warning par thumbnail).
- **Bloquant pour** : rien d'urgent — c'est de l'hygiène FTP. À faire après quelques semaines en prod si on voit une accumulation.

---

## ✅ Résolu

### Session 2026-04-29 (ADR-071 phase 3 — bascule prod Cloudflare Pages)

| Item                                                                                                                                                                                                      | Résolu par                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend (dashboard + SaaS) servi via FTP Hostinger + clean-slate (404 intermittents sur deep-links, dotfile bug `.htaccess`, downtime 30-60s par release, pas de rollback atomique, latence hors France) | ADR-071 phase 3 — bascule prod sur Cloudflare Pages projet unique `neopro-frontend-prod` (dashboard + SaaS sous `/saas/`). Activation par `vars.HOSTING=cloudflare`. PRs #729→#743 (13 PRs, 2026-04-29). Cleanup phase 4 (.htaccess + jobs lftp + secrets HOSTINGER*FTP*\*) planifiée J+7. |

### Session 2026-04-27 (ADR-099 — uptime flotte)

| Item                                                                                                                                                                                                                                                                               | Résolu par                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Uptime sites flotte bloqué à ~10% systématique (issue #644) — formule `COUNT(metrics) / 2880 * 100` supposait un heartbeat 30s alors que la table `metrics` est échantillonnée toutes les 5 min. Résultat : tous les Pi paraissaient instables en permanence même en parfait état. | ADR-099 — nouvelle table `connection_events` dérivée des connect/disconnect réels (pas de samples). PR #646 (backend), PR #650 (front `uptime.percent`, CRON purge 90j, helper `use-prod-db.sh`). Résolu 2026-04-27. |

### Session 2026-04-27 (cleanup Supabase + observabilité)

| Item                                                                                                 | Résolu par                                                                                                                       |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 30 métriques `neopro_*` émises sans dashboard ni alerte                                              | PR #631 — dashboard catch-all `neopro-blind-spots-cloud.json` + smoke guard `smoke-metrics-observability` (allowlist gelée vide) |
| Références Supabase mortes éparpillées (code actif, runbooks, README, legal/RGPD)                    | PR #633 — 27 fichiers nettoyés en 4 commits atomiques (env vars, code backend/frontend, docs ops, docs RGPD/legal)               |
| `@types/react` + `@types/react-dom` non déclarés en devDeps (cassait `ng serve` sur Remotion Studio) | PR #636 — devDeps ajoutés en root                                                                                                |

### Session 2026-04-25 (audit Lead Dev)

Référence : audit Lead Dev session du 25 avril.

| Item                                                  | Résolu par                                             |
| ----------------------------------------------------- | ------------------------------------------------------ |
| Memory leak `saasStates` (issue #594 cleanup partiel) | PR #600 — sweep périodique                             |
| Backup task CRON faux positif `success: true`         | PR #600 — fail-loud explicite                          |
| Notifications at_risk objectifs muettes               | PR #612 — Slack groupé par site                        |
| `socket.service.ts` à 1263 lignes                     | PR #607 — split via ADR-096 (1263 → 991)               |
| `cron-scheduler.service.ts` à 1036 lignes             | PR #612 — split via ADR-097 (1036 → 486)               |
| Règle `safe-update.md` morte (auto-load Claude)       | PR #609 — archivée                                     |
| Pas de cadre conventions multi-session Claude         | PR #614 — CLAUDE.md augmenté                           |
| Pas de format SPEC métier                             | PR #614 — `docs/specs/` créé + pilote `match-sessions` |

---

## Synthèse pour interview CTO

Si tu dois résumer en 3 phrases face à un candidat CTO :

1. **"On a fait le ménage récent : 5 PRs cette semaine pour split 2 fichiers monstres + corriger 2 P0 + archiver une règle morte. Note d'audit interne 78→85."**
2. **"On sait où on a encore de la dette et on l'a documenté : metrics.service à splitter, observabilité business à monter, Sentry à wire, bus factor 1 à mitiger. C'est dans `docs/TECH-DEBT.md`."**
3. **"Aucun de ces items n'est bloquant pour la prod NLF d'aujourd'hui, mais tous le seront pour scaler à 30+ sites. C'est exactement le périmètre du CTO qu'on cherche."**

C'est 100x plus crédible qu'un discours "tout va bien" + une découverte de dette en mois 2.
