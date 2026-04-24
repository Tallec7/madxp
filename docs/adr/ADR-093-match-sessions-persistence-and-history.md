# ADR-093: Persistance structurée des sessions de match et historique dashboard

**Date** : 2026-04-24
**Statut** : Proposé
**Format** : Léger

---

## Contexte

La télécommande Pi collecte `homeTeam`, `awayTeam`, `matchDate`, `spectators` et les scores finaux `homeScore`/`awayScore`, mais seul un sous-ensemble est persisté en DB :

- **Déjà persisté** via `match-config.handler.ts` → `club_sessions` : `match_date`, `match_name` (chaîne concaténée `"CESSON vs RENNES"`), `audience_estimate`. `video_plays.session_id` référence déjà `club_sessions.id`.
- **Non persisté** : `homeTeam`/`awayTeam` séparés, scores finaux, `profile_id` (ADR-058), signal de fin de match, type d'événement (match / entraînement / tournoi). Côté Pi, ces valeurs vivent en `localStorage` uniquement (`local-options.service.ts:463`).
- **Dashboard** : aucune page « Historique des matchs » par site, aucun export PDF/CSV, alors que NEOPRO le demande pour ses rapports clubs.

`video_plays.event_type` et `audience_estimate` existent déjà (ADR sponsor-context 2026-02-21) mais restent sous-exploités faute d'UI.

## Décision

**Étendre `club_sessions` plutôt que créer une nouvelle table `match_events`.** Trois phases :

### Phase 1 — Schéma (migration additive, non-breaking)

Migration `extend-club-sessions-match-fields.sql` :

```sql
ALTER TABLE club_sessions
  ADD COLUMN IF NOT EXISTS home_team VARCHAR(100),
  ADD COLUMN IF NOT EXISTS away_team VARCHAR(100),
  ADD COLUMN IF NOT EXISTS home_score INTEGER,
  ADD COLUMN IF NOT EXISTS away_score INTEGER,
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES config_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS event_type VARCHAR(50) DEFAULT 'match',
  ADD COLUMN IF NOT EXISTS ended_by VARCHAR(50);  -- 'remote' | 'timeout' | 'manual'

CREATE INDEX IF NOT EXISTS idx_club_sessions_match_date
  ON club_sessions(site_id, match_date DESC NULLS LAST);
```

`match_name` conservé pour backward-compat ; backfill optionnel via `COALESCE(home_team || ' vs ' || away_team, match_name)` dans les lectures.

### Phase 2 — Ingestion (Pi → cloud)

- Étendre `MatchConfigPayload` (handler) : `homeTeam?`, `awayTeam?`, `homeScore?`, `awayScore?`, `profileId?`, `eventType?`, `endedAt?`.
- `LocalOptionsService` côté Pi : ajouter l'émission `match-config` enrichi à chaque mutation des champs concernés (debounce 2s pour éviter le spam socket). Pas de nouvel endpoint HTTP — réutiliser le canal Socket.IO existant.
- **Auto-close sans bouton dédié** : un CRON central-server ferme les sessions dont `ended_at IS NULL` après **N heures sans `video_plays` enregistré** sur la session (N = 4h par défaut, config). Set `ended_at = last_video_play_at`, `ended_by = 'timeout'`, et fige `home_score`/`away_score` au dernier `score_update` reçu. Pas de bouton « Fin de match » côté remote (UX volontairement silencieuse).
- **Pas de nouvelle API key Pi** : même auth socket existante.

### Phase 3 — Dashboard + agrégation spectateurs

- `central-dashboard/src/app/features/sites/site-detail/` : onglet « Historique » listant les dernières sessions (paginé, 20 par page), filtrable par date/équipe adverse. Colonnes : date, home vs away, score final, spectateurs, nb vidéos jouées.
- Endpoint `GET /api/sites/:id/match-sessions?from&to&limit&offset` (auth `canAccessSite`, lecture via `clubSessionsRepository`).
- **Moyenne spectateurs pour rapports sponsors** : vue/fonction PG `avg_audience_per_site(site_id, from, to)` agrégeant `AVG(audience_estimate)` sur les `club_sessions` fermées de la période. Exposée via `GET /api/sites/:id/avg-audience?from&to` et injectée dans les rapports sponsors existants (remplace/complète `sites.avg_spectators` qui était une valeur statique long-terme).
- **Pas d'export PDF/CSV pour le moment** — deferred, réévaluer après 1er cycle de rapports sponsors.

## Alternatives rejetées

- **Nouvelle table `match_events`** : rejeté car `club_sessions` couvre déjà la sémantique (1 session ≈ 1 match), `video_plays.session_id` y pointe déjà, et dupliquer casserait l'agrégation sponsor existante.
- **Persistance côté Pi uniquement + pull on-demand** : rejeté car l'export rapport club doit marcher même quand le Pi est hors ligne au moment de la génération.
- **REST POST dédié `/api/sites/:id/matches`** : rejeté car le canal Socket.IO `match-config` existe déjà, marche offline-friendly via queue sync-agent, et le doublonner créerait deux sources de vérité.

## Conséquences

- ✅ Historique match visible dashboard + moyenne spectateurs réelle (pas statique) pour rapports sponsors.
- ✅ Analytics sponsor par match déjà disponibles via `video_plays.session_id` + nouveaux champs.
- ✅ Migration additive = zéro risque sur la flotte existante.
- ✅ Auto-close timeout = pas de charge UX côté club, le Pi n'a rien à changer côté UI remote.
- ⚠️ `match_name` legacy reste en base (deprecated, pas supprimé) — lectures doivent `COALESCE(home || ' vs ' || away, match_name)`.
- ⚠️ Le Pi doit envoyer `profile_id` (ADR-058) lors du `match-config` — si absent, colonne NULL, OK.
- ⚠️ CRON auto-close dépend de `video_plays` : une session sans aucune lecture vidéo restera ouverte jusqu'au timeout « absolu » secondaire (24h sur `started_at`) — à implémenter aussi.

## Fichiers impactés

- `central-server/src/scripts/migrations/extend-club-sessions-match-fields.sql` — **nouveau**
- `central-server/src/handlers/match-config.handler.ts` — élargir payload + UPDATE/INSERT
- `central-server/src/controllers/match-sessions.controller.ts` — **nouveau** (list + avg-audience)
- `central-server/src/repositories/club-sessions.repository.ts` — **nouveau ou étendre** `analytics.repository.ts`
- `central-server/src/services/cron-scheduler.service.ts` — job auto-close `closeStaleMatchSessions()` (horaire, timeout 4h sans video_play + 24h absolu)
- `raspberry/src/app/services/local-options.service.ts` — émission socket enrichie + debounce 2s
- `central-dashboard/src/app/features/sites/site-detail/match-history/` — **nouveau** (composant + service)
- `docs/adr/README.md` — ajouter entrée ADR-093
