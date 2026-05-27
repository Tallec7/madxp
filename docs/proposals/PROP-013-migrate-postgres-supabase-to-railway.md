# PROP-013 — Migration PostgreSQL : Supabase → Railway

**Date** : 2026-04-19
**Statut** : Proposé (attente décision)
**Auteur** : Tallec7 (incident egress W16-2026)
**Remplacerait** : ADR-003 (PostgreSQL + Supabase)

---

## 1. Contexte

Le 18 avril 2026, le quota egress Supabase Free (5 GB/mois) a été dépassé (7.93 GB consommés) — services restreints en prod, flotte 50+ Pi bloquée. Le déclencheur immédiat (`cb540d3a` étendant le bloc analytics dashboard à tous les sites) a été corrigé par [PR #474](https://github.com/Tallec7/madxp/pull/474) (cache 30s + LIMIT metrics). Mais la cause **structurelle** reste : toute l'egress Supabase = lectures Railway → Supabase, facturées côté Supabase.

### Pourquoi c'est un problème de fond, pas juste un bug

| Facteur                      | Constat                                                             |
| ---------------------------- | ------------------------------------------------------------------- |
| Fleet qui grossit            | 50+ Pi aujourd'hui, +N chaque mois → egress scale linéairement      |
| Polling dashboard            | 30-60s × N users × N sites = amplificateur structurel               |
| Nouvelles features analytics | Chaque `getDashboardData`-like dégrade la consommation              |
| Free tier en prod            | 5 GB/mois = 1 incident tous les 2-3 mois, prod risque à chaque fois |

### Audit de ce que Supabase fait réellement

Grep exhaustif du code (commit `532357f2`) :

| Capacité Supabase   | Utilisation MadXP                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Postgres managé** | ✅ Seul usage via `pg` driver, port 6543 (pooler)                                                                                                                              |
| Auth                | ❌ JWT maison (`jsonwebtoken`) + bcrypt + MFA TOTP maison                                                                                                                      |
| Storage             | ❌ Hostinger FTP (`storage.service.ts`)                                                                                                                                        |
| Realtime            | ❌ Socket.IO maison                                                                                                                                                            |
| Edge Functions      | ❌ Inutilisé                                                                                                                                                                   |
| RLS                 | ❌ **Promise ADR-003 non tenue** — 0 `CREATE POLICY`, 0 `ENABLE ROW LEVEL SECURITY` dans `full-schema.sql`. Multi-tenant enforced en application (controllers + repositories). |

**Conclusion audit** : Supabase est utilisé à ~10 % de sa valeur. On paie pour un Postgres managé haut de gamme qu'on pourrait obtenir 30 % moins cher ailleurs avec zéro regression fonctionnelle.

### Audit technique pour migration

| Item             | Valeur                         | Impact migration                                       |
| ---------------- | ------------------------------ | ------------------------------------------------------ |
| Version Postgres | 15                             | Railway : ≥ 15 disponible ✅                           |
| Extensions       | `uuid-ossp` uniquement         | Railway : supportée nativement ✅                      |
| Schema           | 1578 lignes, 126 CREATE        | Dump+restore direct                                    |
| Migrations       | 89 fichiers SQL incrémentaux   | Pas besoin de rejouer — `pg_dump` capture l'état final |
| Pool connexion   | max 5 (pooler transaction)     | Railway PG pooler équivalent                           |
| RLS              | Aucune                         | Pas de politique à recréer                             |
| Auth             | Indépendante (JWT maison)      | Aucun impact utilisateurs                              |
| Data volume      | À mesurer (probablement <5 GB) | Dump <30 min                                           |

## 2. Options

### Option A — Rester sur Supabase + optimisations perpétuelles

- **Coût** : Supabase Pro $25/mo (250 GB egress, débloque immédiatement)
- **Effort** : continu, chaque feature analytics doit être pensée cache/limit
- **Risque** : course contre la montre, ex. +100 Pi → 250 GB peut être dépassé
- **Verdict** : Band-aid, ne résout pas le problème de fond

### Option B1 — Migrer Postgres vers Railway Postgres (recommandée)

- **Coût** : Railway Postgres ≈ $5/mo (service) + ~$5/mo (compute/RAM selon usage). Budget estimé **$10-15/mo** vs **$25/mo** Supabase Pro.
- **Egress intra-Railway** : **gratuit** (réseau privé interne) → disparition complète du problème d'egress DB.
- **Effort** : 1-2 jours dev + 1 fenêtre maintenance 30-60 min
- **Risque** : perte de Supabase Studio UI (remplacé par pgAdmin/DBeaver), reconfigurer backups (Railway a snapshots PITR)
- **Verdict** : résout structurellement, économie nette, 1 plateforme de moins

### Option B2 — Postgres sur VPS Hostinger

- **Coût** : inclus si VPS déjà abonné, sinon ~€4-8/mo
- **Effort** : self-managed (backups, upgrades, sécurité, monitoring)
- **Egress** : généreux chez Hostinger, mais Railway → Hostinger = egress public Hostinger (payé par Hostinger, mais latence +10-30ms)
- **Verdict** : charge ops significative, seulement si compétence DBA disponible

### Option C — Redis cache layer + Supabase

- **Coût** : Redis Railway ~$5/mo + Supabase Pro $25/mo = **$30/mo**
- **Effort** : refactor lectures chaudes vers cache
- **Verdict** : plus cher + complexité double, pertinent uniquement si on veut garder Auth/Storage/Realtime Supabase pour futur (pas le cas)

### Décision recommandée : **B1**

Raisons cumulatives :

1. On n'utilise que 10 % de Supabase → overpaiement
2. Egress intra-Railway = classe entière de problèmes qui disparaît
3. Architecture simplifiée : 2 plateformes (Railway + Hostinger) au lieu de 3
4. Économie $10-15/mo = $120-180/an
5. ADR-003 date d'Oct 2024, contexte a évolué

## 3. Plan de migration

### 3.1 Phases

| #   | Phase                                     | Durée                | Prod impact                 |
| --- | ----------------------------------------- | -------------------- | --------------------------- |
| 0   | Préparation & dry-run                     | J-3 à J-1            | Aucun                       |
| 1   | Provisioning Railway Postgres             | J0 matin             | Aucun                       |
| 2   | Migration schema + data dry-run (staging) | J0 matin             | Aucun                       |
| 3   | **Cutover production**                    | J0 fenêtre 30-60 min | Downtime lecture + écriture |
| 4   | Post-migration validation                 | J0-J+7               | Monitoring intensif         |
| 5   | Sunset Supabase                           | J+14                 | Aucun                       |

### 3.2 Phase 0 — Préparation (J-3 à J-1)

- [ ] Mesurer taille DB actuelle : `SELECT pg_database_size('postgres');`
- [ ] Mesurer nombre de rows par table critique (`sites`, `videos`, `video_plays`, `metrics`, `audit_logs`, `config_profiles`)
- [ ] Provisionner Railway Postgres en staging (plan Hobby suffit pour test)
- [ ] Dry-run `pg_dump` depuis Supabase vers dump local :
  ```bash
  pg_dump "postgresql://postgres:PWD@db.PROJECT.supabase.co:5432/postgres" \
    --no-owner --no-acl --format=custom -f neopro_$(date +%Y%m%d).dump
  ```
- [ ] `pg_restore` vers Railway staging :
  ```bash
  pg_restore --no-owner --no-acl -d "postgresql://user:pwd@railway-staging/railway" neopro_*.dump
  ```
- [ ] Checksum row counts `MD5(string_agg(...))` sur tables critiques pour comparer
- [ ] Démarrer central-server en staging pointant sur Railway Postgres → `npm run test:server` + `npm run test:smoke`
- [ ] Ajuster `max_connections` Railway + `pool.max` central-server si besoin

### 3.3 Phase 1 — Provisioning prod

- [ ] Provisionner Railway Postgres plan Pro/Hobby selon taille (Hobby limite 1 GB RAM, OK si DB < 10 GB données chaudes)
- [ ] Activer snapshots automatiques Railway (backup quotidien)
- [ ] Configurer `DATABASE_URL` en secret Railway (pas dans le repo)
- [ ] Récupérer CA certificate si SSL requis → `DATABASE_SSL_CA`

### 3.4 Phase 2 — Dry-run final (même jour que cutover, H-2)

- [ ] `pg_dump` Supabase prod → dump fichier (mesure durée exacte)
- [ ] `pg_restore` sur Railway prod → mesure durée exacte
- [ ] Validation checksums vs Supabase
- [ ] **NE PAS basculer encore** — on attend la fenêtre annoncée

### 3.5 Phase 3 — Cutover production

**Fenêtre recommandée** : nuit semaine, 02h-03h (trafic minimal — Pi continuent de jouer leur config locale, pas bloquant).

Communications :

- [ ] Annoncer 24h avant aux stakeholders
- [ ] Message Slack/email aux users dashboard/club-portal

Procédure :

1. [ ] Activer **mode read-only Supabase** (révoquer INSERT/UPDATE/DELETE pour `app_user`) → prevent writes pendant le dump final
2. [ ] `pg_dump` Supabase prod (mesure : ~X min de la phase 2)
3. [ ] Truncate/drop DB Railway staging → `pg_restore` final
4. [ ] Valider checksums row counts
5. [ ] **Basculer `DATABASE_URL` Railway sur l'env central-server prod** → redéploiement auto
6. [ ] Healthcheck API : `curl https://api.neopro.bzh/health` → 200
7. [ ] Smoke manuel dashboard : login, charger site detail, vérifier metrics
8. [ ] Smoke Pi : vérifier qu'un Pi se re-authentifie (api_key dans table `sites`)
9. [ ] Si tout OK → garder Supabase en read-only 72h (rollback possible)
10. [ ] Si KO → revert `DATABASE_URL` sur Supabase, ré-autoriser writes, investiguer

### 3.6 Phase 4 — Validation post-migration (J0-J+7)

- [ ] Monitoring Prometheus egress Railway → doit être ~0
- [ ] Vérifier alertes Slack `DbPoolSaturation` (ADR-015) — pool max toujours à 5
- [ ] Compter `SELECT` / heure sur Railway vs précédent sur Supabase
- [ ] Vérifier que tous les Pi de la flotte ont heartbeat OK (dashboard fleet)
- [ ] Vérifier analytics sponsors quotidiennes OK (cron `site_sponsor_daily_stats`)
- [ ] Vérifier OTA, uploads vidéo, remote cloud

### 3.7 Phase 5 — Sunset Supabase (J+14)

- [ ] Télécharger dump final Supabase + stocker dans archive froide (S3/backup chiffré)
- [ ] Annuler abonnement Supabase
- [ ] Mettre à jour ADR-003 → statut `Déprécié, remplacé par PROP-013`
- [ ] Créer ADR-070 final documentant la décision
- [ ] Mettre à jour `CLAUDE.md`, `docs/technical/ARCHITECTURE.md`, `docs/01-START-HERE.md`
- [ ] Supprimer références Supabase du code (`updates.controller.ts:385` packageUrl check)

## 4. Risques & mitigations

| #   | Risque                                                 | Prob    | Impact      | Mitigation                                                      |
| --- | ------------------------------------------------------ | ------- | ----------- | --------------------------------------------------------------- |
| R1  | Downtime cutover > 1h                                  | Moyenne | Élevé       | Dry-run mesure durée, fenêtre nocturne, rollback préparé        |
| R2  | Perte de données pendant dump final                    | Faible  | Critique    | Mode read-only Supabase avant dump, checksums                   |
| R3  | Performance Railway < Supabase                         | Moyenne | Moyen       | Staging 48h sous charge simulée avant cutover                   |
| R4  | `DATABASE_SSL_CA` manquant côté Railway                | Faible  | Bloquant    | Tester en staging, documenter procédure SSL                     |
| R5  | Limites Railway Hobby (RAM)                            | Moyenne | Moyen       | Monitorer RAM pool, upgrade Pro si besoin                       |
| R6  | Clients externes (sponsor-portal, saas direct) cassent | Faible  | Moyen       | Tests smoke E2E sur les endpoints publics                       |
| R7  | Perte historique Supabase Studio                       | Certain | Très faible | pgAdmin/DBeaver en remplacement, query logs Prometheus existent |
| R8  | Backups Railway moins robustes                         | Faible  | Moyen       | Vérifier PITR Railway + dump hebdo externe (S3)                 |

## 5. Budget comparé (12 mois)

| Scénario                    | Supabase      | Railway PG           | Total/an        | Écart                     |
| --------------------------- | ------------- | -------------------- | --------------- | ------------------------- |
| Actuel (Free cassé)         | $0 + risque   | $0                   | $0 (instable)   | ref                       |
| A. Supabase Pro             | $25/mo = $300 | $0                   | **$300/an**     | +$300                     |
| B1. Railway PG (ce plan)    | $0            | $10-15/mo = $120-180 | **$120-180/an** | +$120-180, −$120-180 vs A |
| C. Hybride Redis + Supabase | $25/mo        | $5/mo = $60          | **$360/an**     | +$360                     |

## 6. Critères Go/No-Go

La décision B1 est validée si toutes les conditions ci-dessous :

- [ ] Dry-run staging : `pg_restore` complet < 30 min
- [ ] Tous les smoke tests passent sur staging Railway
- [ ] Charge simulée 48h sans saturation pool ni latence dégradée
- [ ] Budget Railway final confirmé < $20/mo

Sinon → fallback Option A (Supabase Pro) le temps de réévaluer.

## 7. Décisions à prendre

1. **Valider l'option B1** ou pivoter vers A/B2/C
2. **Valider la fenêtre de maintenance** (proposition : nuit semaine 02h-03h)
3. **Valider le budget** Railway PG $10-15/mo
4. **Nommer le responsable** de l'opération de cutover

## 8. Étapes suivantes si validé

Créer les phases GSD correspondantes via `/gsd:plan-phase` :

- Phase "infra/railway-postgres-provisioning" (Phase 1)
- Phase "infra/postgres-migration-dryrun" (Phase 0+2)
- Phase "infra/postgres-cutover" (Phase 3+4)
- Phase "infra/supabase-sunset" (Phase 5)

Chaque phase aura son plan détaillé + tests de validation.

---

**Références** :

- Incident egress 2026-04-18 : [PR #474](https://github.com/Tallec7/madxp/pull/474)
- ADR-003 : choix initial Supabase
- ADR-015 : contraintes Railway Hobby (pool max 5)
- RISK-T04 (RISK-REGISTER.md) : saturation pool Supabase
