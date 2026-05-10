# SPEC : Match (sessions, scoreboard, historique)

> **Owner** : Daisy
> **Statut** : Live
> **Dernière revue** : 2026-04-29
> **last_verified** : 2026-05-10
> **verified_against_commit** : 1890d43
> **ADR liés** : ADR-088 (scoreboard SaaS-first), ADR-093 (persistance sessions + historique), ADR-097 (extraction CRON tasks)
> **Smoke tests** : `smoke-prop003-scoreboard.test.ts`, `smoke-scoreboard-saas.test.ts`
> **`.claude/rules/` lié** : `match.md`

## En une phrase

Un club enregistre une session match depuis sa télécommande, les équipes et scores sont persistés pour les rapports sponsors et l'historique, un scoreboard live optionnel reçoit les données des consoles de marque (Bodet/Stramatel) via canal HTTP, et les sessions oubliées sont fermées automatiquement.

## Acteurs impliqués

- **Club staff** : déclenche le match via Remote Pi ou Remote SaaS
- **Super admin / Operator** : consulte l'historique multi-sites
- **Dashboard admin** : visualise le scoreboard live en temps réel
- **Pi / connecteur externe (sim-bodet, sim-stramatel)** : push le score via HTTP API

## Périmètre (ce que ce domaine couvre)

- **Services backend** :
  - `central-server/src/handlers/match-config.handler.ts` (création / config session)
  - `central-server/src/handlers/score-update.handler.ts` (update score in-flight)
  - `central-server/src/cron-tasks/match-autoclose.task.ts` (auto-close CRON)
  - `central-server/src/repositories/site.repository.ts` (lecture historique)
- **Scoreboard live** :
  - `central-server/src/controllers/scoreboard.controller.ts` + routes (push HTTP)
  - `central-server/src/services/saas-match-state.service.ts` (TTL in-memory)
  - Simulateurs `sim-bodet-scorepad` + `sim-stramatel` (PROP-003)
- **Composants UI** :
  - `raspberry/src/app/components/remote/remote.component.ts` (Remote Pi)
  - `central-dashboard/src/app/features/scoreboard-live/scoreboard-live.component.ts` (live dashboard)
  - `central-dashboard/src/app/features/sites/site-detail.component.ts` (historique sessions)
- **Routes API** :
  - `POST /api/scoreboard/:siteId/state` (push scorestate ADR-088)
  - `GET /api/scoreboard/:siteId/state` (hydratation dashboard)
  - `GET /api/sites/:id/match-history` (historique filtré)
- **Tables DB** : `club_sessions` (colonnes ADR-093 : `home_team`, `away_team`, `home_score`, `away_score`, `profile_id`, `event_type`, `ended_by`)
- **ADR** : ADR-088, ADR-093, ADR-097
- **Smoke tests** : `smoke-prop003-scoreboard.test.ts`, `smoke-scoreboard-saas.test.ts`
- **`.claude/rules/`** : `match.md`

## Règles métier (ce qui DOIT marcher)

- **Ouverture de session** : le Pi (ou Remote SaaS) émet `match-config` avec `homeTeam`, `awayTeam`, `profileId`, `eventType`. Row créée dans `club_sessions` (`started_at = NOW()`, `ended_at = NULL`).
- **Score live** : `score-update` touche uniquement `home_score`/`away_score` sur les sessions `ended_at IS NULL`.
- **Score figé** : aucune écriture après `ended_at IS NOT NULL`. Les rapports sponsors dépendent de ces valeurs historiques.
- **Auto-close** : CRON 1×/h, deux critères indépendants — *idle* (aucun `video_plays` depuis 4h) + *absolute* (session > 24h). Marquée `ended_by = 'timeout'`.
- **Scoreboard live ADR-088** : `POST /api/scoreboard/:siteId/state` (Bearer `site_api_key`) → in-memory TTL 60s → broadcast Socket.IO room `siteId`. Contrat `ScoreboardMatchState` (basket FIBA : period, chronoMs, homeScore, guestScore, fouls, shotClock…).
- **PROP-003** : 3 corrections protocolaires verrouillées — Bodet 9600 bps, Pi = TCP server côté Scorepad, Stramatel 0x33 seul porteur état match. Smoke `smoke-prop003-scoreboard` enforced.
- **Historique** : `GET /api/sites/:id/match-history?from=&to=` retourne les sessions paginées, validation Joi obligatoire. Dashboard affiche badge ⏲️ pour `ended_by = 'timeout'`.
- **`match_name` legacy** : `COALESCE(match_name, home_team || ' vs ' || away_team)` pour les sessions pré-ADR-093.

## Comportements observables

| Règle | Comment on vérifie |
|---|---|
| Création session | Dashboard `/sites/<id>` → onglet Sessions : nouvelle row visible |
| Score live Socket.IO | Dashboard match en cours : score mis à jour en temps réel |
| Score figé | Session fermée re-consultée 7j plus tard : score inchangé |
| Auto-close idle | Grafana : `neopro_match_sessions_autoclosed_total{reason="idle"}` ↑ |
| Auto-close absolute | Grafana : `neopro_match_sessions_autoclosed_total{reason="absolute"}` ↑ |
| Scoreboard live | Dashboard `/scoreboard-live/:siteId` affiche état push via HTTP |
| PROP-003 | Smoke `smoke-prop003-scoreboard` 4/4 verts |
| Historique paginé | `curl /api/sites/<id>/match-history?from=...&to=...` retourne JSON paginé |

## Cas d'edge connus

- **Pi offline au moment de l'auto-close** : fermeture côté cloud uniquement, pas Pi-dépendante.
- **Bulk `video_plays` arrivant après le timeout idle** : `ended_at = MAX(last_played_at)`, session étirée.
- **Sessions parallèles pour un même site** : possible si Pi planté avant fermeture. Auto-close les ferme toutes au tick suivant.
- **Scoreboard TTL expiré (60s sans push)** : `GET /api/scoreboard/:siteId/state` retourne 404 ou état vide — le dashboard affiche un placeholder "En attente".
- **`match_name` legacy vs colonnes ADR-093** : sessions pré-ADR-093 n'ont que `match_name` — COALESCE obligatoire (cf. règle ci-dessus).
- **CRON dormant si migration `extend-club-sessions-match-fields.sql` non appliquée** : loadSchedules échoue silencieusement, loggé Winston `warn`.

## Contraintes / NE PAS FAIRE

Voir `.claude/rules/match.md` pour la liste complète (invariants smoke-testés). Règles métier spécifiques :

- Ne jamais réécrire `home_score`/`away_score` après `ended_at IS NOT NULL`.
- Ne jamais utiliser `ended_by = 'timeout'` pour une fermeture manuelle (badge UI deviendrait mensonger).
- Ne jamais bypasser `authenticateSiteApiKey` sur `POST /api/scoreboard/:siteId/state` (risque de push arbitraire cross-site).

## Ce qui n'est PAS dans ce domaine

- **Statistiques agrégées par équipe** (cumul sur N matches) → future SPEC Analytics
- **Notifications de fin de match** (Slack/Email) → roadmap non livré
- **Sessions multi-sets** (volley, tennis) → roadmap
- **Rotation sponsors à l'intérieur du matchday** → SPEC [Sponsors & Pubs](sponsors.spec.md)

## Évolutions possibles

- [ ] Réouverture manuelle d'une session fermée par timeout (avec audit log)
- [ ] Connecteur Pi PROP-003 v2 (byte-level serial/TCP Bodet Scorepad) — ADR-088 contrat déjà prêt
- [ ] Multi-événement par session (set 1, set 2…) pour sports à sets
- [ ] Vue "récap match" PDF exportable pour le club
