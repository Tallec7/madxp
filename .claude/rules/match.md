# Match Sessions — Invariants (ADR-092)

Source de vérité : ADR-092. Les sessions match sont persistées dans `club_sessions`
(pas de table parallèle) pour préserver le pipeline analytics (`video_plays.session_id`).

## NE JAMAIS FAIRE (smoke test enforced)

### Persistance

- Retirer `home_team`, `away_team`, `home_score`, `away_score`, `profile_id`,
  `event_type` ou `ended_by` de `club_sessions` (colonnes ADR-092, utilisées par
  l'historique match + sponsor reports période-filtrés).
- Laisser `score-update.handler.ts` sans UPDATE sur `club_sessions` (sans ça, les
  scores finaux ne sont jamais gelés → historique match vide côté dashboard).
- Retirer le UPDATE de `home_team`/`away_team`/`profile_id`/`event_type` dans
  `match-config.handler.ts` (le Pi émet `match-config` au démarrage du match ;
  sans persistance, les équipes apparaissent uniquement dans `match_name` legacy).
- Oublier `COALESCE` sur `match_name` legacy vs `home_team || ' vs ' || away_team`
  côté dashboard (les sessions pré-ADR-092 n'ont que `match_name`).

### CRON auto-close

- Retirer `'match_session_autoclose'` du CHECK constraint `check_task_type`
  (casserait `recurring_schedules` au redémarrage — migration + full-schema).
- Retirer `executeMatchAutoCloseTask()` ou le case dans `executeSchedule` /
  `runNow` de `cron-scheduler.service.ts` (sans ça, sessions ouvertes dormantes
  restent `ended_at = NULL` ad vitam, fausse les stats flotte).
- Retirer le seed INSERT `'Match session auto-close'` de la migration
  `extend-club-sessions-match-fields.sql` (source de vérité pour l'activation).
- Supprimer `metricsService.recordMatchSessionAutoclosed()` dans le CRON (sans
  supervision Prometheus, un bug silencieux du CRON reste invisible).
- Lever le `ended_by = 'timeout'` dans les UPDATEs auto-close (le dashboard
  affiche le badge ⏲️ auto en se basant dessus).

### Payload Pi → Cloud

- Retirer `homeTeam`, `awayTeam`, `profileId` ou `eventType` du payload émis par
  `saveMatchInfo()` dans `raspberry/src/app/components/remote/remote.component.ts`
  (sans ça, `match-config.handler` ne peut pas renseigner les nouvelles colonnes).
- Oublier de populer `currentProfileId` dans `onClubSelected` (le profil actif
  doit être tracé pour audit + sponsor reports multi-profil).

### Validation API

- Retirer `validateQuery(querySchemas.matchHistory)` de la route
  `/api/sites/:id/match-history` (sans ça, `from`/`to` acceptent n'importe quel
  string → SQL accepte, mais cast date explosera en 500).

### Full-schema

- Modifier les colonnes ADR-092 dans `full-schema.sql` sans créer une nouvelle
  migration (la migration `extend-club-sessions-match-fields.sql` est la source
  de vérité prod — `full-schema.sql` est le snapshot staging bootstrap).

## Référence

- [ADR-092](../../docs/adr/ADR-092-match-sessions-persistence-and-history.md)
- Migration : `central-server/src/scripts/migrations/extend-club-sessions-match-fields.sql`
- CRON : `central-server/src/services/cron-scheduler.service.ts` → `executeMatchAutoCloseTask`
- Supervision : `neopro_match_sessions_autoclosed_total{reason}`
