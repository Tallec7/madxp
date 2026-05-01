# SPEC : Sponsors & Pubs

> **Owner** : Daisy
> **Statut** : Live
> **Dernière revue** : 2026-04-29
> **ADR liés** : ADR-035 (modèle dual Annonceur vs Sponsor local), ADR-093 (match sessions — breakdown event_type), ADR-097 (extraction CRON tasks)
> **Smoke tests** : `smoke-analytics-sponsors.test.ts`
> **`.claude/rules/` lié** : `sponsors.md`

> **Fusion** : ce document absorbe `sponsors-rotation.spec.md` et `sponsor-reports.spec.md` (SPECs pré-pivot 2026-04-27). Les anciens fichiers sont supprimés.

## En une phrase

Les vidéos sponsors tournent dans la boucle de chaque club selon une pondération Bresenham, chaque diffusion est attribuée au bon sponsor, et Neopro génère automatiquement des rapports PDF mensuels accessibles via portail magic link.

## Acteurs impliqués

- **Club** (resp partenaires / président) : gère les sponsors locaux, consulte les rapports
- **Annonceur réseau** : pousse une vidéo sur N clubs via dashboard annonceur
- **Agence** : gère N annonceurs pour compte de tiers
- **Sponsor local** (persona 6a/6b) : consulte ses KPIs via magic link sans login
- **Super admin / Operator** : configure les contrats, génère les rapports on-demand

## Périmètre (ce que ce domaine couvre)

- **Services backend** :
  - `central-server/src/services/sponsor-auto-resolution.service.ts` (mapping filename → site_sponsor_id)
  - `central-server/src/services/monthly-reports.service.ts` (orchestration PDF 3 types)
  - `central-server/src/services/pdf-report/` (générateurs pdfkit : club, advertiser, site_sponsor)
  - `central-server/src/services/email.service.ts` → `sendSponsorReport()` (envoi mensuel)
  - `central-server/src/services/asset.service.ts` (upload assets sponsors)
  - `central-server/src/cron-tasks/pdf-report.task.ts` (CRON 1ᵉʳ du mois 02h UTC)
  - `central-server/src/cron-tasks/aggregation.task.ts` (agrégation daily_stats)
- **Repositories** :
  - `central-server/src/repositories/site-sponsor.repository.ts` (CRUD + stats)
- **Controllers** :
  - `central-server/src/controllers/site-sponsor.controller.ts` + `routes/site-sponsor.routes.ts`
  - `central-server/src/controllers/reports.controller.ts` (list/get/download)
  - `central-server/src/controllers/sponsor-portal.controller.ts` (magic link)
  - `central-server/src/controllers/advertiser-portal.controller.ts`
- **Composants UI** :
  - `raspberry/src/app/utils/weighted-playlist.ts` (Bresenham runtime Pi/SaaS)
  - `central-dashboard/src/app/features/sites/components/site-sponsors-tab/` (gestion sponsors club)
  - `central-dashboard/src/app/features/sponsor-portal/site-sponsor-portal.component.ts` (vue sponsor)
  - `central-dashboard/src/app/features/club-portal/club-sponsors.component.ts` (vue club)
  - `central-dashboard/src/app/features/advertisers/` (portail annonceur réseau)
  - `central-dashboard/src/app/features/agency-portal/` (portail agence)
- **Routes API** :
  - `/api/sites/:siteId/sponsors/*` (CRUD sponsors locaux)
  - `POST /api/reports/generate` (on-demand)
  - `GET /api/sponsor-portal/verify` + `/stats` + `/report` (magic link)
- **Tables DB** : `site_sponsors`, `advertisers`, `site_sponsor_daily_stats`, `generated_reports`
- **ADR** : ADR-035, ADR-093, ADR-097
- **Smoke tests** : `smoke-analytics-sponsors.test.ts`
- **`.claude/rules/`** : `sponsors.md`

## Règles métier (ce qui DOIT marcher)

### Rotation pondérée
- **Bresenham** : sponsor poids `W` apparaît ~1 fois toutes les `total/W` vidéos, uniformément réparti. Pas de front-loading.
- **Épinglage** : `pinned: true` → position d'origine préservée. Bresenham répartit autour.
- **Wrap-around** : première vidéo du 2ᵉ passage ≠ dernière du 1ᵉʳ.
- **Auto-résolution `site_sponsor_id`** : au déploiement config, chaque vidéo sponsor reçoit son `site_sponsor_id` (matching filename, fallback strip préfixe `^\d+_`).
- **Statuts actifs** : seuls `status = 'active'` entrent dans la rotation — `paused`/`expired` sortent au prochain push de config.
- **Modèle dual ADR-035** : `site_sponsors` (local, 1 club) ≠ `advertisers` (réseau, N clubs). Ne jamais fusionner les deux tables.

### Agrégation & Rapports
- **Three catégories analytics** : `analytics_category ∈ {sponsor_local, sponsor_neopro, sponsor}`. Breakdown obligatoire par `event_type` (match/training/tournament/other) ET `period` (pre_match/halftime/post_match/loop).
- **Agrégation quotidienne** : `site_sponsor_daily_stats` pré-calculée par CRON (rétention `video_plays` = 15j, agrégat infini). Stale > 36h → alerte Grafana.
- **Génération mensuelle CRON** : 1ᵉʳ du mois 02h UTC → 3 types de PDF (club, annonceur, sponsor local). Idempotent (UNIQUE constraint en DB).
- **Génération on-demand** : `POST /api/reports/generate` pour re-générer en dehors du CRON.
- **KPIs basés sur `site_sponsor_daily_stats`** (jamais sur `video_plays` brut, rétention 15j).
- **Magic link portail sponsor** : token stateless signé `site_sponsor_id`. Endpoint `/verify` + `/stats` + `/report`. Sponsor voit uniquement son club.
- **Envoi mail** : `contact_email` renseigné → mail SendGrid après génération. Échec mail non-bloquant.

## Comportements observables

| Règle | Comment on vérifie |
|---|---|
| Bresenham distribué | Smoke `smoke-analytics-sponsors` : gaps entre 2 vidéos d'un sponsor cohérents avec poids |
| `site_sponsor_id` résolu | Dashboard sponsors : 0 vidéo "sponsor non identifié" |
| Daily stats à jour | CRON `aggregation.task` horaire + Grafana stale <36h |
| CRON mensuel PDF | Grafana + log `Monthly reports generated` avec compteur, le 1ᵉʳ du mois |
| Rapport visible club | Dashboard club → Rapports : ligne mois N-1 avant 03h UTC |
| Magic link fonctionnel | Lien mail → page portail charge stats sans login |
| Idempotence | Re-lancer `POST /generate` pour la même période → 200 (pas de doublon) |

## Cas d'edge connus

- **Filename sans match sponsor** : fallback bare-filename + strip `^\d+_`. Si toujours rien, `site_sponsor_id = NULL` → exclu des stats, pas de la boucle.
- **Tous les poids = 1 + aucun `pinned`** : fast path Bresenham (liste inchangée).
- **Sponsor passé `paused` en cours de mois** : exclu si `status != 'active'` au moment du CRON → impressions des jours précédents non envoyées par mail (workaround : génération on-demand par resp partenaires).
- **Daily_stats manquante (CRON agrégation cassé)** : PDF affiche 0 impressions. Garde-fou Grafana Blind Spots (stale >36h).
- **Token magic link expiré** : page portail affiche "lien périmé", renvoi possible depuis dashboard club.
- **Sponsor multi-clubs (annonceur réseau)** : 1 ligne `site_sponsors` par club ; `advertiser_id` partagé pour agrégation cross-club côté annonceur.

## Contraintes / NE PAS FAIRE

Voir `.claude/rules/sponsors.md`. Règles métier spécifiques :

- Ne jamais remplacer Bresenham par un round-robin greedy (inéquitable sur courtes boucles).
- Ne pas exposer `total_impressions` brut sans breakdown `event_type` dans un rapport sponsor.
- Ne jamais baser les KPIs PDF sur `video_plays` brut (rétention 15j → rapports rétroactifs = 0).
- Ne pas fusionner `site_sponsors` et `advertisers` (modèle dual ADR-035, intentionnel).
- Ne pas envoyer 2× le même mail mensuel (vérifier `generated_reports` avant envoi).

## Ce qui n'est PAS dans ce domaine

- **Portail sponsor vue temps réel** → roadmap NEXT #2 (`sponsor-portal-live`)
- **Campagnes annonceur multi-clubs** (déploiement N→M) → future SPEC `advertiser-campaigns`
- **Rapports semestriels institutionnels** (persona 6c) → backlog
- **Rotation sponsors en cours de match** → SPEC [Match](match-sessions.spec.md) pour l'event_type, pas de rotation dédiée matchday sans UI

## Évolutions possibles

- [ ] Dashboard annonceur réseau (persona 7) : UI cross-club ; backend prêt
- [ ] Rapports semestriels certifiés (persona 6c)
- [ ] Agrégation multi-clubs pour 1 sponsor local sur N clubs
- [ ] A/B test 2 visuels d'un même sponsor (`site_sponsor_id` partagé)
- [ ] Smoke test Bresenham : écart-type max sur 1000 boucles synthétiques
- [ ] Alertes si sponsor actif sans impression depuis 7j
