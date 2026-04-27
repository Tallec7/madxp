# SPEC : Sponsors Rotation Pondérée

> **Owner** : Daisy
> **Statut** : Live
> **Dernière revue** : 2026-04-27
> **Code principal** :
>
> - `central-server/src/repositories/site-sponsor.repository.ts` (CRUD + agrégations site_sponsor_daily_stats)
> - `central-server/src/services/sponsor-auto-resolution.service.ts` (résolution `site_sponsor_id` au déploiement config)
> - `central-server/src/controllers/site-sponsor.controller.ts` + `routes/site-sponsor.routes.ts` (`/api/sites/:siteId/sponsors/*`)
> - `raspberry/src/app/utils/weighted-playlist.ts` (Bresenham smooth scheduling — runtime côté Pi/SaaS)
> - `central-dashboard/src/app/features/sites/components/site-sponsors-tab/` (gestion sponsors club côté dashboard)
>
> **ADR liés** : ADR-035 (Annonceur vs Sponsor — modèle dual), ADR-093 (Match sessions — `event_type` matchday/training/...)
> **Smoke tests** : `central-server/src/__tests__/smoke/smoke-analytics-sponsors.test.ts`
> **`.claude/rules/` lié** : `sponsors.md` (6 invariants Bresenham/weight/pinned/wrap-around enforcés)

## En une phrase

Les vidéos sponsors d'un club tournent dans la boucle de l'écran selon une pondération définie par contrat (Decathlon ×3, banque locale ×2…), réparties uniformément dans le temps via Bresenham, et chaque diffusion est attribuée au bon sponsor pour générer les rapports d'impressions.

## Règles métier (ce qui DOIT marcher)

- **Rotation pondérée Bresenham** : un sponsor avec poids `W` apparaît en moyenne 1 fois toutes les `total/W` vidéos, **uniformément** réparti (pas en bloc en début de boucle). Algorithme déterministe.
- **Épinglage** : une vidéo `pinned: true` reste à sa position d'origine (cas typique : intro Neopro toujours slot 1, fin de boucle). Bresenham répartit autour des slots épinglés.
- **Wrap-around** : la première vidéo du 2ᵉ passage de la boucle ne peut pas être identique à la dernière du 1ᵉʳ passage (sinon double diffusion consécutive non voulue).
- **Auto-résolution `site_sponsor_id`** : à chaque déploiement de config Pi/SaaS, chaque vidéo sponsor de la boucle reçoit son `site_sponsor_id` correspondant (matching `video_filename` ↔ `site_sponsor_videos`). Fallback : strip du préfixe numérique `^\d+_` si match initial échoue.
- **Trois catégories analytics** : `analytics_category` ∈ `{'sponsor_local', 'sponsor_neopro', 'sponsor'}` — `sponsor_local` pour sponsors club (table `site_sponsors`), `sponsor_neopro` pour annonceurs Neopro réseau (table `advertisers`), `sponsor` legacy.
- **Agrégation quotidienne** : la table `site_sponsor_daily_stats` est pré-calculée par CRON (rétention `video_plays` = 15j, agrégat = infinie). Breakdowns obligatoires : par `event_type` (match/training/tournament/other) ET par `period` (pre_match/halftime/post_match/loop).
- **Benchmark intra-club** : le dashboard sponsor d'un site classe les sponsors actifs par impressions DESC, avec screen_time + completion_rate.
- **Cross-club pour annonceurs Neopro** : `advertiser_id` est tracké dans `site_sponsor_daily_stats` pour permettre l'agrégation multi-site côté annonceur réseau.
- **Statut sponsor** : seuls `status = 'active'` apparaissent dans la rotation runtime ; `paused` et `expired` sortent de la boucle au prochain push de config (pas de coupure live).

## Comportements observables

| Règle                         | Comment on vérifie                                                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Rotation Bresenham distribuée | Smoke test `smoke-analytics-sponsors` : longueur playlist × gaps entre 2 vidéos d'un même sponsor cohérent avec poids               |
| Épinglage respecté            | Loop preview dashboard : index 0 = vidéo pinned originale                                                                           |
| `site_sponsor_id` résolu      | Onglet sponsors d'un site : 0 vidéo "sponsor non identifié", chaque vidéo classée sous son sponsor                                  |
| Stats agrégées à jour         | CRON `aggregation.task` (fréquence horaire) + check Grafana stale <36 h                                                             |
| Breakdown event_type          | Rapport PDF / Grafana : `impressions_match + impressions_training + impressions_tournament + impressions_other = total_impressions` |
| Benchmark visible             | Dashboard sponsor club : tableau trié par `total_impressions DESC`                                                                  |
| Status `paused`               | Sponsor mis en pause depuis le dashboard → disparaît de la prochaine config Pi/SaaS pushée                                          |

## Cas d'edge connus

- **Filename ne match aucun sponsor** : fallback bare-filename + strip préfixe numérique `^\d+_` (ex: `001_decathlon.mp4` → `decathlon.mp4`). Si toujours rien, vidéo passe avec `site_sponsor_id = NULL` → exclue des stats sponsors mais pas de la boucle.
- **Tous les poids = 1 + aucune `pinned`** : fast path Bresenham (retour liste inchangée, pas de re-shuffle). Optimisation runtime côté Pi.
- **Toutes les vidéos `pinned`** : Bresenham skip total, ordre original préservé (cas dégradé d'un club qui veut tout fixer manuellement).
- **`contract_amount` NULL** : benchmark affiche "—" mais ne bloque pas l'agrégation des stats. Le sponsor reste dans la rotation.
- **`site_sponsor_id` NULL en `video_plays`** : ignoré dans `site_sponsor_daily_stats` (seul l'`advertiser_id` ou `sponsor_id` legacy compte pour le réseau).
- **Sponsor multi-clubs (annonceur Neopro)** : 1 ligne `site_sponsors` par club (FK `site_id`) ; `advertiser_id` partagé permet l'agrégation cross-club côté annonceur.
- **Vidéo orpheline FTP** : si le binaire est introuvable côté Hostinger, le CRON FTP audit (PR #618 et suivantes) marque la vidéo `❌ Introuvable FTP` ; elle reste dans la boucle config tant que l'admin ne fait pas Replace ou Unlink (cf. PRs #643/#647).

## Contraintes / NE PAS FAIRE

Liste complète : `.claude/rules/sponsors.md`. Règles **métier** spécifiques (pas conventions de code) :

- Ne jamais remplacer Bresenham par un round-robin "front-loaded" (greedy) : la diffusion devient inéquitable sur des boucles courtes (typique en pré-match : 6-8 vidéos seulement).
- Ne pas exposer `total_impressions` brut sans breakdown `event_type` dans un rapport sponsor : un sponsor qui paie pour matchday va contester si on lui compte les vues "training" comme équivalentes.
- Ne pas fusionner `site_sponsors` (local) et `advertisers` (réseau) dans une même table (ADR-035 sépare volontairement les deux modèles : un sponsor local appartient à un club, un annonceur réseau appartient à Neopro et signe une convention multi-clubs).
- Ne pas modifier la rotation en cours de match (push config Pi pendant un match) : risque de coupure visible côté TV. Toujours déployer avant ou après une session active.

## Ce qui n'est PAS dans le scope

- **Génération de rapports PDF/email sponsors** → SPEC `sponsor-reports` (ce doc se limite à la rotation + collecte des impressions, pas à leur restitution).
- **Portail web sponsor avec login** → SPEC `sponsor-reports` (magic link) + future SPEC `sponsor-portal-live` (vue temps réel — NEXT #2 roadmap).
- **Packs commerciaux bronze/argent/or** → backlog produit (cf. PERSONAE 3c CU3) — calcul de tarifs à partir des impressions, pas l'algo de rotation.
- **Campagnes annonceur réseau** (déploiement push N→M clubs) → future SPEC `advertiser-campaigns` (ADR-035).
- **Sponsors par session match** (sponsor X uniquement présent sur les matchs vs U18) → backlog (capacité ADR-093 disponible via `event_type` mais pas d'UI dédiée).

## Évolutions possibles (backlog léger)

- [ ] Smoke test renforcé : vérifier que la distribution Bresenham respecte un écart-type max sur 1000 boucles synthétiques
- [ ] UI dashboard pour visualiser la prochaine boucle pondérée (preview avant déploiement)
- [ ] A/B test 2 visuels d'un même sponsor (rotation aléatoire entre 2 fichiers liés au même `site_sponsor_id`)
- [ ] Pondération temporelle (sponsor X x3 en mi-temps, x1 en pré-match) — possible via `period` mais pas d'UI
- [ ] Alertes dashboard si un sponsor actif n'a aucune impression depuis 7j (problème de mapping filename probable)
