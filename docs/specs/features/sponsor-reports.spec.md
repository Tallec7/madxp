# SPEC : Sponsor Reports (PDF mensuels + portail magic link)

> **Owner** : Daisy
> **Statut** : Live (3 types reports ✅) — gaps documentés § Évolutions
> **Dernière revue** : 2026-04-27
> **Code principal** :
>
> - `central-server/src/services/monthly-reports.service.ts` (orchestration des 3 types : club, advertiser, site_sponsor)
> - `central-server/src/services/pdf-report/{site-sponsor-report,club-report,advertiser-report}.ts` (générateurs pdfkit)
> - `central-server/src/cron-tasks/pdf-report.task.ts` (CRON 1ᵉʳ du mois 02h UTC)
> - `central-server/src/services/email.service.ts` → `sendSponsorReport()` (envoi mail mensuel)
> - `central-server/src/controllers/{reports,sponsor-portal}.controller.ts` (API list/get/download + magic link)
> - `central-dashboard/src/app/features/sponsor-portal/site-sponsor-portal.component.ts` (vue sponsor lecture-seule)
> - `central-dashboard/src/app/features/club-portal/club-sponsors.component.ts` (vue club côté dashboard)
>
> **ADR liés** : ADR-035 (sponsors locaux vs annonceurs réseau), ADR-097 (extraction CRON tasks vers `cron-tasks/`)
> **Smoke tests** : `central-server/src/__tests__/smoke/smoke-analytics-sponsors.test.ts` (couvre l'agrégation source, pas la génération PDF directement) + `monthly-reports.service.test.ts` (happy path)
> **`.claude/rules/` lié** : aucun dédié — invariants à formaliser dans `.claude/rules/sponsors.md` quand un cas régresse

## En une phrase

Tous les 1ᵉʳ du mois à 02h UTC, Neopro génère automatiquement un PDF d'impressions pour chaque club, chaque sponsor local et chaque annonceur réseau actifs le mois précédent, l'envoie par mail aux sponsors qui ont une adresse renseignée, et le rend accessible 24h/24 via un portail magic link sans login.

## Règles métier (ce qui DOIT marcher)

- **Génération mensuelle automatique** : CRON `pdf-report.task` lance `generateMonthlyReports()` le 1ᵉʳ du mois à 02h UTC, qui produit 3 types de rapports pour le mois N-1 :
  - **Club** : 1 PDF par site actif (heartbeat ou session match dans la période).
  - **Annonceur réseau** : 1 PDF par `advertisers` ayant ≥1 vidéo diffusée.
  - **Sponsor local** : 1 PDF par `site_sponsors.status = 'active'` ayant ≥1 impression.
- **KPIs sponsor local** dérivés de `site_sponsor_daily_stats` (table pré-agrégée, cf. SPEC `sponsors-rotation`) :
  - Passages = `SUM(total_impressions)`
  - Durée totale = `SUM(total_screen_time_seconds)`
  - Audience estimée = `avg_spectators × nb_matches` (fallback `audience_estimate` du daily_stats si `avg_spectators` absent)
  - Breakdown par `event_type` (match / training / tournament / other)
- **Génération on-demand** : `POST /api/reports/generate` (auth super_admin / club staff selon rôle) permet de re-générer un rapport en dehors du CRON (cas : sponsor signé en cours de mois, président qui veut un point intermédiaire).
- **Stockage permanent** : chaque PDF est uploadé via le storage service (Hostinger FTP), avec `checksum` SHA-256 + `storage_url` enregistrés dans `generated_reports`. Statut `'completed'` quand l'upload réussit, `'failed'` + `error_message` sinon.
- **Idempotence** : la table `generated_reports` a une contrainte UNIQUE sur `(report_type, site_id, advertiser_id, site_sponsor_id, period_start, period_end)`. Re-lancer le CRON ne duplique pas.
- **Mail sponsor** : envoi automatique par SendGrid à `site_sponsors.contact_email` après génération réussie. Échec mail = non-bloquant (le PDF reste accessible via portail).
- **Portail sponsor magic link** :
  - Token stateless (pas de JWT, pas de session DB), encodé avec `site_sponsor_id` + signature.
  - Endpoint `GET /api/sponsor-portal/verify` valide le token, expose `GET /stats` et `GET /report` filtrés sur ce sponsor uniquement.
  - Le sponsor voit **uniquement son club** et **ses propres KPIs** — aucune fuite vers les sponsors voisins.
- **Visualisation portail** : Chart.js (impressions hebdo, breakdown event_type) + bouton téléchargement PDF mois courant et précédents.
- **Permissions par persona** :
  - Persona 3a (Président) → consulte les rapports de son club via dashboard club (auth JWT).
  - Persona 3c (Resp partenaires) → mêmes droits, plus on-demand `POST /generate` pour la prospection.
  - Persona 6a/6b (Sponsor local) → magic link uniquement, pas de login.
  - Persona 7 (Annonceur réseau) → dashboard annonceur (🟡 partiellement implémenté, cf. § Évolutions).

## Comportements observables

| Règle                   | Comment on vérifie                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| CRON mensuel exécuté    | Grafana : tour CRON `pdf-report.task` 1ᵉʳ du mois 02h UTC + log Winston `info "Monthly reports generated"` avec compteur |
| Rapport club généré     | Dashboard club → onglet Rapports : ligne du mois N-1 visible avant 03h UTC le 1ᵉʳ                                        |
| Rapport sponsor envoyé  | Inbox du sponsor : mail SendGrid avec PDF en pièce jointe ou lien portail                                                |
| Magic link valide       | Cliquer le lien depuis le mail → page portail charge stats + bouton télécharger sans demander de login                   |
| Idempotence             | Re-lancer manuellement `POST /generate` pour la même période → 200 avec rapport existant (pas de doublon en DB)          |
| KPIs cohérents          | `total_impressions` du PDF == `SUM(total_impressions)` table `site_sponsor_daily_stats` sur la période                   |
| Échec mail non-bloquant | Couper SendGrid en staging → rapport généré + `status='completed'` + log `warn "Email delivery failed"`                  |

## Cas d'edge connus

- **Sponsor sans `contact_email`** : PDF généré, pas de mail envoyé, accessible via dashboard club. Pas d'erreur.
- **Sponsor passé `paused` ou `expired` en cours de mois** : exclu si `status != 'active'` au moment du CRON. Risque de "trou" si le statut bascule le 28 → impressions des 27 premiers jours non envoyées par mail. Workaround : génération on-demand par le resp partenaires.
- **Période sans aucun match** : rapport généré quand même (impressions = 0, page "détail matchs" absente). Ne génère pas une erreur.
- **Logo club introuvable** : PDF fallback texte "NEOPRO" au lieu de l'image club. Pas de blocage.
- **`avg_spectators` absent** : utilise `audience_estimate` de daily_stats (champ secondaire, moins fiable mais non vide).
- **Sponsor multi-clubs (1 personne morale, N contrats `site_sponsors`)** : 1 PDF par club. Pas d'agrégation cross-club côté sponsor (limitation actuelle, cf. § Évolutions).
- **Daily_stats manquante (CRON aggregation cassé)** : rapport peut afficher 0 impressions alors que la rotation tournait. Garde-fou : alerter Grafana sur `site_sponsor_daily_stats` stale >36h (déjà en place via dashboard Blind Spots PR #631).
- **Token magic link expiré ou révoqué** : page portail affiche un message "lien périmé", pas d'erreur 500. Renvoi possible depuis le dashboard club.

## Contraintes / NE PAS FAIRE

Conventions de code dans `.claude/rules/`. Règles **métier** spécifiques :

- Ne jamais inclure dans le PDF des KPIs basés sur `video_plays` brut (table avec rétention 15j) — toujours passer par `site_sponsor_daily_stats`. Sinon les rapports rétroactifs >15j affichent 0.
- Ne pas exposer le `magic link` dans une URL non-HTTPS ou loggée en clair (le token donne accès aux stats sponsor sans login).
- Ne pas envoyer 2 fois le même mail mensuel : la table `generated_reports` doit être interrogée avant l'envoi (idempotence + protection contre flapping CRON).
- Ne pas mélanger les KPIs `sponsor_local` et `sponsor_neopro` dans le même PDF : un sponsor local n'a pas accès aux impressions cross-club d'un annonceur réseau (cloisonnement contractuel ADR-035).
- Ne pas générer un rapport pour un `site_sponsors` `expired` sauf si `period_end` recouvre la période d'activité (sinon : confusion sponsor "j'ai reçu un rapport alors que mon contrat est terminé").

## Ce qui n'est PAS dans le scope

- **Rotation pondérée des sponsors** → SPEC `sponsors-rotation` (collecte des impressions, ce doc se limite à leur restitution).
- **Portail sponsor avec vue temps réel** (impressions live, pas mensuelles) → roadmap NEXT #2, future SPEC `sponsor-portal-live`.
- **Rapports semestriels audit-grade pour collectivités (persona 6c)** → 🟡 backlog roadmap (cf. PERSONAE 6c "rapport semestriel certifié logo collectivité affiché X heures cumulées").
- **Dashboard annonceur réseau pour visualiser ses propres rapports** → 🟡 code service existe, UI manquante (cf. PERSONAE 7).
- **Rapports consolidés multi-clubs pour un même sponsor** → backlog (cas typique : commerçant qui sponsorise 2 clubs voisins, 1 rapport actuellement par club).
- **A/B test de templates PDF** (branding annonceur custom) → backlog (faisable techniquement, pas de demande client).
- **Export Excel ou CSV** → backlog (PDF only en V1).
- **Signature numérique audit-grade** (chaîne de validation pour persona 6c) → backlog dépendant des rapports semestriels.

## Évolutions possibles (backlog léger)

- [ ] **Dashboard annonceur réseau** (persona 7) : UI pour consulter les rapports cross-club ; service backend déjà prêt
- [ ] **Rapports semestriels institutionnels** (persona 6c) : format PDF spécifique avec heures cumulées + impressions estimées + signature
- [ ] **Agrégation multi-clubs** côté sponsor : 1 rapport global pour un commerçant qui sponsorise N clubs
- [ ] **Rapport flotte / fédération** (persona 10) : `report_type = 'fleet'` existe en DB mais pas implémenté
- [ ] **Webhook "rapport prêt"** : notifier club ou annonceur via webhook custom à la fin du CRON mensuel
- [ ] **Smoke test PDF** : vérifier qu'un PDF généré contient bien les sections attendues (pdfkit text extraction)
- [ ] **Archivage long terme** : déplacer les rapports >2 ans en cold storage (ou supprimer)
- [ ] **A/B test templates** (annonceur réseau premium) : branding custom par annonceur
- [ ] **Export Excel/CSV** alternative au PDF
