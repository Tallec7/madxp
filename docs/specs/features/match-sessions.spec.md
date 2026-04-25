# SPEC : Match Sessions

> **Owner** : Daisy
> **Statut** : Live
> **Dernière revue** : 2026-04-25
> **Code principal** :
> - `central-server/src/handlers/match-config.handler.ts` (création / config)
> - `central-server/src/handlers/score-update.handler.ts` (update score in-flight)
> - `central-server/src/cron-tasks/match-autoclose.task.ts` (auto-close CRON)
> - `central-server/src/repositories/site.repository.ts` (lecture historique)
> - `raspberry/src/app/components/remote/remote.component.ts` (UI Pi side)
> **ADR liés** : ADR-093 (persistence + history), ADR-097 (extraction CRON tasks)
> **Smoke tests** : `central-server/src/__tests__/smoke/smoke-adr093-match-sessions.test.ts`
> **`.claude/rules/` lié** : `match.md`

## En une phrase

Un club enregistre une session match (équipes + score) depuis sa télécommande, le central garde l'historique pour les rapports sponsors, et les sessions oubliées sont fermées automatiquement.

## Règles métier (ce qui DOIT marcher)

- **Une session match s'ouvre** quand le Pi (ou la Remote SaaS) émet un évènement `match-config` avec `homeTeam`, `awayTeam`, `profileId`, `eventType`. La row est créée dans `club_sessions` avec `started_at = NOW()`, `ended_at = NULL`.
- **Le score est mis à jour en live** via l'évènement `score-update` (ne touche que `home_score` / `away_score` ; le `score-update.handler` UPDATE uniquement les sessions `ended_at IS NULL`).
- **Le score est figé** au moment où `ended_at` est renseigné (par fermeture manuelle OU auto-close). Aucune écriture du score n'est autorisée après.
- **Une session se ferme automatiquement** dans 2 cas :
  - **Idle** : aucun `video_plays` depuis 4h ET `started_at` plus vieux que 4h → `ended_at = MAX(last_played_at)` (ou `started_at + 4h` si aucun play)
  - **Absolute** : `started_at` plus vieux que 24h → `ended_at = started_at + 24h`
- **Une session auto-fermée** est marquée `ended_by = 'timeout'` ; une session fermée à la main par l'utilisateur a `ended_by = 'user'` ou autre valeur explicite.
- **L'auto-close émet une métrique Prometheus** `neopro_match_sessions_autoclosed_total{reason="idle"|"absolute"}` à chaque tour de CRON (1×/h).
- **L'historique des sessions** est exposé via `GET /api/sites/:id/match-history` avec filtres `from`/`to` (validation Joi obligatoire).
- **Les rapports sponsors période-filtrés** consomment `home_team`, `away_team`, `home_score`, `away_score`, `profile_id`, `event_type` de `club_sessions` (cf. SPEC `sponsors-rotation` à terme).

## Comportements observables

| Règle | Comment on vérifie |
|---|---|
| Création de session | Dashboard `/sites/<id>/matches` affiche la nouvelle row dans les minutes qui suivent l'évènement Pi |
| Score live | Dashboard match en cours affiche le score en temps réel via Socket.IO `score-update` |
| Score figé après ended_at | Re-consulter une session fermée 7j plus tard → score identique |
| Auto-close idle (4h) | Grafana : `neopro_match_sessions_autoclosed_total{reason="idle"}` augmente |
| Auto-close absolute (24h) | Grafana : `neopro_match_sessions_autoclosed_total{reason="absolute"}` augmente |
| Badge UI auto-close | Dashboard affiche un badge ⏲️ "auto" sur les sessions fermées par timeout (filtre `ended_by = 'timeout'`) |
| API match-history | `curl /api/sites/<id>/match-history?from=2026-04-01&to=2026-04-30` retourne du JSON paginé |

## Cas d'edge connus

- **Pi offline au moment du auto-close** : la session reste ouverte, fermée au prochain tick CRON quand l'agrégation tourne (la fermeture est côté cloud, pas Pi-dépendante).
- **Bulk de `video_plays` arrivant après le timeout idle** : `ended_at` = `MAX(last_played_at)`, pas le timestamp du timeout — la session est étirée.
- **Plusieurs sessions ouvertes en parallèle pour un même site** : possible si le Pi a planté avant fermeture. L'auto-close les ferme toutes au tick suivant. Pas de constraint UNIQUE sur `(site_id) WHERE ended_at IS NULL` (volontaire).
- **`match_name` legacy vs `home_team || ' vs ' || away_team`** : les sessions pré-ADR-093 n'ont que `match_name`. Le dashboard utilise `COALESCE(match_name, home_team || ' vs ' || away_team)`.
- **CRON dormant si la migration `extend-club-sessions-match-fields.sql` n'est pas appliquée** : les colonnes `home_team` etc. n'existent pas → loadSchedules échoue silencieusement, alerté via log Winston `warn`.

## Contraintes / NE PAS FAIRE

Voir `.claude/rules/match.md` pour la liste complète des invariants smoke-testés. Règles **métier** spécifiques (pas conventions de code) :

- Ne jamais réécrire `home_score`/`away_score` après `ended_at IS NOT NULL` (les rapports sponsors comptent dessus pour la période historique).
- Ne pas afficher `home_score`/`away_score` dans une vue publique sans filtrer `ended_at IS NOT NULL` (sinon scores en cours de match exposés en double-écriture, peut induire des erreurs de comm).
- Ne pas fermer une session manuellement avec `ended_by = 'timeout'` (réservé au CRON — sinon le badge UI ⏲️ devient mensonger).

## Ce qui n'est PAS dans le scope

- **Statistiques agrégées par équipe** (somme score sur N matches) → SPEC `analytics` (à venir).
- **Notifications de fin de match** vers Slack/Email → roadmap, non livré (cf. backlog ci-dessous).
- **Sessions multi-sets** (volley, tennis, badminton avec score par set) → roadmap.
- **Validation manuelle d'une session auto-fermée** (réouverture) → roadmap.

## Évolutions possibles (backlog léger)

- [ ] Permettre la réouverture manuelle d'une session fermée par timeout (avec audit log)
- [ ] Webhook custom à la fermeture (pour intégrations club)
- [ ] Multi-événement par session (set 1, set 2…) pour sports à sets
- [ ] Notification Slack à la fermeture si score final inhabituel (>50 ou diff >30)
- [ ] Vue "récap match" PDF à exporter pour le club
