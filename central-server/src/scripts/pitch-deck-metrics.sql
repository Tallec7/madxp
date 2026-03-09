-- =============================================================================
-- NEOPRO — Métriques de Traction pour Pitch Deck Investisseur
-- =============================================================================
-- Usage: psql $DATABASE_URL -f pitch-deck-metrics.sql
-- Ou copier/coller les requêtes individuellement dans un client SQL
-- =============================================================================

\echo ''
\echo '╔══════════════════════════════════════════════════════════════════╗'
\echo '║           NEOPRO — MÉTRIQUES DE TRACTION INVESTISSEUR          ║'
\echo '╚══════════════════════════════════════════════════════════════════╝'
\echo ''

-- =============================================================================
-- 1. VUE D'ENSEMBLE (slide "Key Metrics")
-- =============================================================================

\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
\echo '  1. VUE D''ENSEMBLE — CHIFFRES CLÉS'
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'

SELECT
    COUNT(*)                                                          AS "Sites déployés (total)",
    COUNT(*) FILTER (WHERE status = 'online')                         AS "Sites en ligne",
    ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'online') / NULLIF(COUNT(*), 0), 1) AS "% online",
    COUNT(*) FILTER (WHERE subscription_end > NOW() AND NOT suspended) AS "Abonnements actifs",
    COUNT(*) FILTER (WHERE subscription_plan = 'trial')               AS "En période d'essai",
    COUNT(*) FILTER (WHERE subscription_plan = 'standard')            AS "Plan Standard",
    COUNT(*) FILTER (WHERE subscription_plan = 'premium')             AS "Plan Premium",
    MIN(created_at)::date                                             AS "Premier site créé",
    MAX(created_at)::date                                             AS "Dernier site créé"
FROM sites;

SELECT
    COUNT(*)                                        AS "Utilisateurs total",
    COUNT(*) FILTER (WHERE role = 'super_admin')    AS "Super Admins",
    COUNT(*) FILTER (WHERE role = 'admin')          AS "Admins",
    COUNT(*) FILTER (WHERE role = 'operator')       AS "Opérateurs",
    COUNT(*) FILTER (WHERE role = 'advertiser')     AS "Annonceurs",
    COUNT(*) FILTER (WHERE role = 'agency')         AS "Agences",
    COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '30 days') AS "Actifs 30j"
FROM users;

-- =============================================================================
-- 2. CROISSANCE FLOTTE (slide "Growth" — courbe cumulative)
-- =============================================================================

\echo ''
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
\echo '  2. CROISSANCE FLOTTE — Sites déployés par mois'
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'

SELECT
    TO_CHAR(month, 'YYYY-MM')                                              AS "Mois",
    new_sites                                                              AS "Nouveaux sites",
    SUM(new_sites) OVER (ORDER BY month ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS "Total cumulé",
    CASE
        WHEN LAG(new_sites) OVER (ORDER BY month) > 0
        THEN ROUND(100.0 * (new_sites - LAG(new_sites) OVER (ORDER BY month))
             / LAG(new_sites) OVER (ORDER BY month), 0) || '%'
        ELSE '—'
    END                                                                    AS "Croissance MoM"
FROM (
    SELECT
        DATE_TRUNC('month', created_at) AS month,
        COUNT(*)                        AS new_sites
    FROM sites
    GROUP BY 1
) monthly
ORDER BY month;

-- =============================================================================
-- 3. ENGAGEMENT (slide "Engagement" — le plus percutant)
-- =============================================================================

\echo ''
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
\echo '  3. ENGAGEMENT GLOBAL'
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'

SELECT
    COUNT(*)                                                              AS "Lectures vidéo totales",
    TO_CHAR(COALESCE(SUM(duration_played), 0) / 3600, 'FM999,999')        AS "Heures de screen time",
    TO_CHAR(COALESCE(SUM(duration_played), 0) / 3600 / 24, 'FM999,999')   AS "Jours de screen time",
    ROUND(AVG(CASE WHEN video_duration > 0
        THEN 100.0 * duration_played / video_duration ELSE NULL END), 1)  AS "Taux complétion moyen %",
    COUNT(DISTINCT site_id)                                               AS "Sites ayant joué au moins 1 vidéo",
    ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT site_id), 0), 0)      AS "Moy. lectures/site"
FROM video_plays;

-- =============================================================================
-- 3b. ENGAGEMENT MENSUEL (courbe de croissance)
-- =============================================================================

\echo ''
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
\echo '  3b. ENGAGEMENT MENSUEL — Tendance'
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'

SELECT
    TO_CHAR(month, 'YYYY-MM')                               AS "Mois",
    plays                                                   AS "Lectures",
    active_sites                                             AS "Sites actifs",
    ROUND(screen_time_h, 0)                                  AS "Screen time (h)",
    ROUND(plays::numeric / NULLIF(active_sites, 0), 0)       AS "Lectures/site",
    CASE
        WHEN LAG(plays) OVER (ORDER BY month) > 0
        THEN ROUND(100.0 * (plays - LAG(plays) OVER (ORDER BY month))
             / LAG(plays) OVER (ORDER BY month), 0) || '%'
        ELSE '—'
    END                                                      AS "Croissance MoM"
FROM (
    SELECT
        DATE_TRUNC('month', played_at)                 AS month,
        COUNT(*)                                       AS plays,
        COUNT(DISTINCT site_id)                        AS active_sites,
        COALESCE(SUM(duration_played), 0) / 3600.0     AS screen_time_h
    FROM video_plays
    GROUP BY 1
) monthly
ORDER BY month;

-- =============================================================================
-- 4. SESSIONS D'UTILISATION (preuve d'usage réel)
-- =============================================================================

\echo ''
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
\echo '  4. SESSIONS D''UTILISATION'
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'

SELECT
    COUNT(*)                                                        AS "Sessions totales",
    ROUND(AVG(duration_seconds) / 60.0, 1)                          AS "Durée moy. session (min)",
    ROUND(AVG(videos_played), 1)                                    AS "Vidéos moy./session",
    ROUND(100.0 * SUM(manual_triggers) / NULLIF(SUM(videos_played), 0), 1)
                                                                    AS "% triggers manuels",
    COUNT(DISTINCT site_id)                                         AS "Sites avec sessions"
FROM club_sessions
WHERE duration_seconds > 0;

-- =============================================================================
-- 5. SCREEN TIME AGRÉGÉ (club_daily_stats_live — données solides)
-- =============================================================================

\echo ''
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
\echo '  5. SCREEN TIME & UPTIME — Agrégé par mois'
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'

SELECT
    TO_CHAR(DATE_TRUNC('month', date), 'YYYY-MM')              AS "Mois",
    SUM(videos_played)                                         AS "Vidéos jouées",
    ROUND(SUM(screen_time_seconds) / 3600.0, 0)                AS "Screen time (h)",
    COUNT(DISTINCT site_id)                                    AS "Sites actifs",
    ROUND(AVG(uptime_percent), 1)                              AS "Uptime moyen %",
    SUM(sponsor_plays)                                         AS "Lectures sponsors",
    ROUND(100.0 * SUM(manual_triggers) / NULLIF(SUM(videos_played), 0), 1)
                                                               AS "% interaction manuelle"
FROM club_daily_stats_live
GROUP BY 1
ORDER BY 1;

-- =============================================================================
-- 6. CONTENU — Bibliothèque vidéo
-- =============================================================================

\echo ''
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
\echo '  6. BIBLIOTHÈQUE VIDÉO'
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'

SELECT
    COUNT(*)                                                     AS "Vidéos uploadées (total)",
    COUNT(*) FILTER (WHERE category = 'sponsor')                 AS "Vidéos sponsors",
    COUNT(*) FILTER (WHERE category = 'jingle')                  AS "Jingles",
    COUNT(*) FILTER (WHERE category = 'ambiance')                AS "Ambiances",
    ROUND(COALESCE(SUM(file_size), 0) / 1073741824.0, 1)         AS "Stockage total (Go)",
    ROUND(AVG(duration) / 60.0, 1)                               AS "Durée moy. (min)",
    COUNT(DISTINCT uploaded_by)                                  AS "Uploadeurs distincts"
FROM videos
WHERE upload_status = 'ready';

-- Croissance du catalogue par mois
SELECT
    TO_CHAR(month, 'YYYY-MM')                                    AS "Mois",
    videos_added                                                 AS "Vidéos ajoutées",
    SUM(videos_added) OVER (ORDER BY month
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)       AS "Catalogue cumulé"
FROM (
    SELECT
        DATE_TRUNC('month', created_at) AS month,
        COUNT(*)                        AS videos_added
    FROM videos
    WHERE upload_status = 'ready'
    GROUP BY 1
) monthly
ORDER BY month;

-- =============================================================================
-- 7. REVENUS & ABONNEMENTS (slide "Business Model")
-- =============================================================================

\echo ''
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
\echo '  7. ABONNEMENTS — Statut actuel'
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'

SELECT
    COUNT(*) FILTER (WHERE subscription_end > NOW() AND NOT suspended)    AS "Actifs",
    COUNT(*) FILTER (WHERE subscription_end > NOW()
                     AND subscription_end < NOW() + INTERVAL '30 days'
                     AND NOT suspended)                                   AS "Expirent < 30j",
    COUNT(*) FILTER (WHERE subscription_end < NOW()
                     AND subscription_end > NOW() - INTERVAL '7 days'
                     AND NOT suspended)                                   AS "Grâce (7j)",
    COUNT(*) FILTER (WHERE suspended = true)                              AS "Suspendus",
    COUNT(*) FILTER (WHERE subscription_plan = 'trial'
                     AND subscription_end > NOW())                        AS "Trials actifs",
    COUNT(*) FILTER (WHERE subscription_plan = 'standard'
                     AND subscription_end > NOW())                        AS "Standard actifs",
    COUNT(*) FILTER (WHERE subscription_plan = 'premium'
                     AND subscription_end > NOW())                        AS "Premium actifs"
FROM sites;

-- =============================================================================
-- 7b. HISTORIQUE ABONNEMENTS (churn, renouvellements, upgrades)
-- =============================================================================

\echo ''
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
\echo '  7b. HISTORIQUE ABONNEMENTS — Actions par mois'
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'

SELECT
    TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM')          AS "Mois",
    COUNT(*) FILTER (WHERE action = 'activated')                 AS "Activations",
    COUNT(*) FILTER (WHERE action = 'renewed')                   AS "Renouvellements",
    COUNT(*) FILTER (WHERE action = 'plan_changed')              AS "Changements plan",
    COUNT(*) FILTER (WHERE action = 'suspended')                 AS "Suspensions",
    COUNT(*) FILTER (WHERE action = 'reactivated')               AS "Réactivations",
    COUNT(*) FILTER (WHERE action = 'expired')                   AS "Expirations"
FROM subscription_history
GROUP BY 1
ORDER BY 1;

-- Taux de churn (raisons de suspension)
\echo ''
\echo '  7c. RAISONS DE SUSPENSION'

SELECT
    COALESCE(ssr.label, sh.reason, 'Non spécifié')               AS "Raison",
    COUNT(*)                                                     AS "Occurrences",
    ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 1) AS "%"
FROM subscription_history sh
LEFT JOIN subscription_suspension_reasons ssr ON ssr.code = sh.reason
WHERE sh.action = 'suspended'
GROUP BY 1
ORDER BY 2 DESC;

-- =============================================================================
-- 8. ANNONCEURS & IMPRESSIONS (slide "Revenue Diversification")
-- =============================================================================

\echo ''
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
\echo '  8. ANNONCEURS — Vue d''ensemble'
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'

SELECT
    (SELECT COUNT(*) FROM advertisers)                              AS "Annonceurs total",
    (SELECT COUNT(*) FROM advertisers WHERE status = 'active')      AS "Annonceurs actifs",
    (SELECT COUNT(*) FROM agencies)                                 AS "Agences",
    (SELECT COUNT(*) FROM agencies WHERE status = 'active')         AS "Agences actives",
    COUNT(*)                                                        AS "Impressions totales",
    COUNT(DISTINCT site_id)                                         AS "Sites touchés",
    COUNT(DISTINCT video_id)                                        AS "Vidéos diffusées",
    TO_CHAR(COALESCE(SUM(duration_played), 0) / 3600, 'FM999,999') AS "Heures de diffusion pub",
    ROUND(100.0 * COUNT(*) FILTER (WHERE completed = true)
        / NULLIF(COUNT(*), 0), 1)                                   AS "Taux complétion %"
FROM video_plays WHERE category = 'sponsor';

-- Impressions par mois
\echo ''
\echo '  8b. IMPRESSIONS PUBLICITAIRES PAR MOIS'

SELECT
    TO_CHAR(month, 'YYYY-MM')                                       AS "Mois",
    impressions                                                     AS "Impressions",
    sites                                                           AS "Sites",
    videos                                                          AS "Vidéos",
    ROUND(screen_time_h, 0)                                         AS "Heures diffusion",
    CASE
        WHEN LAG(impressions) OVER (ORDER BY month) > 0
        THEN ROUND(100.0 * (impressions - LAG(impressions) OVER (ORDER BY month))
             / LAG(impressions) OVER (ORDER BY month), 0) || '%'
        ELSE '—'
    END                                                             AS "Croissance MoM"
FROM (
    SELECT
        DATE_TRUNC('month', played_at)              AS month,
        COUNT(*)                                    AS impressions,
        COUNT(DISTINCT site_id)                     AS sites,
        COUNT(DISTINCT video_id)                    AS videos,
        COALESCE(SUM(duration_played), 0) / 3600.0  AS screen_time_h
    FROM video_plays
    WHERE category = 'sponsor'
    GROUP BY 1
) monthly
ORDER BY month;

-- =============================================================================
-- 9. DÉPLOIEMENTS DE CONTENU (preuve de plateforme opérationnelle)
-- =============================================================================

\echo ''
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
\echo '  9. DÉPLOIEMENTS DE CONTENU'
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'

SELECT
    COUNT(*)                                                         AS "Déploiements total",
    COUNT(*) FILTER (WHERE status = 'completed')                     AS "Réussis",
    COUNT(*) FILTER (WHERE status = 'failed')                        AS "Échoués",
    ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'completed')
        / NULLIF(COUNT(*), 0), 1)                                    AS "Taux de succès %",
    ROUND(AVG(EXTRACT(EPOCH FROM completed_at - created_at) / 60)
        FILTER (WHERE status = 'completed'), 1)                      AS "Durée moy. (min)"
FROM content_deployments;

-- =============================================================================
-- 10. FIABILITÉ PLATEFORME (slide "Technology")
-- =============================================================================

\echo ''
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
\echo '  10. FIABILITÉ & UPTIME'
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'

SELECT
    ROUND(AVG(uptime_percent), 2)                                     AS "Uptime moyen global %",
    COUNT(DISTINCT site_id)                                           AS "Sites monitorés",
    COUNT(DISTINCT date)                                              AS "Jours de données",
    ROUND(AVG(avg_cpu), 1)                                            AS "CPU moyen %",
    ROUND(AVG(avg_memory), 1)                                         AS "RAM moyenne %",
    ROUND(AVG(avg_temperature), 1)                                    AS "Température moy. °C"
FROM club_daily_stats_live;

-- Alertes résolues
SELECT
    COUNT(*)                                                          AS "Alertes totales",
    COUNT(*) FILTER (WHERE status = 'resolved')                       AS "Résolues",
    ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'resolved')
        / NULLIF(COUNT(*), 0), 1)                                     AS "Taux résolution %",
    ROUND(AVG(EXTRACT(EPOCH FROM resolved_at - created_at) / 3600)
        FILTER (WHERE status = 'resolved'), 1)                        AS "TTR moyen (heures)"
FROM alerts;

-- =============================================================================
-- 11. MISES À JOUR LOGICIELLES (vélocité produit)
-- =============================================================================

\echo ''
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
\echo '  11. VÉLOCITÉ PRODUIT — Releases'
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'

SELECT
    COUNT(*)                                                          AS "Releases totales",
    COUNT(*) FILTER (WHERE is_critical)                               AS "Releases critiques",
    MIN(created_at)::date                                             AS "Première release",
    MAX(created_at)::date                                             AS "Dernière release",
    ROUND(COUNT(*)::numeric /
        NULLIF(EXTRACT(MONTH FROM AGE(MAX(created_at), MIN(created_at))), 0), 1)
                                                                      AS "Releases/mois (moy.)"
FROM software_updates;

-- Taux d'adoption des MAJ
SELECT
    su.version                                                        AS "Version",
    su.created_at::date                                               AS "Date release",
    COUNT(*) FILTER (WHERE ud.status = 'completed')                   AS "Déployés OK",
    COUNT(*) FILTER (WHERE ud.status = 'failed')                      AS "Échoués",
    ROUND(100.0 * COUNT(*) FILTER (WHERE ud.status = 'completed')
        / NULLIF(COUNT(*), 0), 1)                                     AS "Adoption %"
FROM software_updates su
LEFT JOIN update_deployments ud ON ud.update_id = su.id
GROUP BY su.id, su.version, su.created_at
ORDER BY su.created_at DESC
LIMIT 10;

-- =============================================================================
-- 12. TOP SITES (pour storytelling)
-- =============================================================================

\echo ''
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
\echo '  12. TOP 10 SITES PAR ENGAGEMENT'
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'

SELECT
    s.club_name                                                       AS "Club",
    s.status                                                          AS "Statut",
    COALESCE(SUM(cds.videos_played), 0)                               AS "Vidéos jouées",
    ROUND(COALESCE(SUM(cds.screen_time_seconds), 0) / 3600.0, 0)     AS "Screen time (h)",
    COUNT(DISTINCT cds.date)                                          AS "Jours actifs",
    ROUND(AVG(cds.uptime_percent), 1)                                 AS "Uptime %",
    s.created_at::date                                                AS "Inscrit le"
FROM sites s
LEFT JOIN club_daily_stats_live cds ON cds.site_id = s.id
GROUP BY s.id, s.club_name, s.status, s.created_at
ORDER BY "Vidéos jouées" DESC
LIMIT 10;

-- =============================================================================
-- 13. RÉPARTITION SPORTS (preuve multi-sport)
-- =============================================================================

\echo ''
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
\echo '  13. RÉPARTITION PAR SPORT'
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'

SELECT
    sport_value                                                       AS "Sport",
    COUNT(*)                                                          AS "Nombre de sites",
    ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 1)     AS "%"
FROM sites, jsonb_array_elements_text(COALESCE(sports, '[]'::jsonb)) AS sport_value
GROUP BY 1
ORDER BY 2 DESC;

-- =============================================================================
-- 14. RÉTENTION — Cohorte mensuelle simplifiée
-- =============================================================================

\echo ''
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
\echo '  14. RÉTENTION — Sites actifs par cohorte d''inscription'
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'

SELECT
    TO_CHAR(cohort, 'YYYY-MM')                                       AS "Cohorte",
    total_sites                                                      AS "Sites inscrits",
    still_active                                                     AS "Toujours actifs",
    ROUND(100.0 * still_active / NULLIF(total_sites, 0), 1)          AS "Rétention %",
    avg_age_months                                                   AS "Âge moyen (mois)"
FROM (
    SELECT
        DATE_TRUNC('month', s.created_at)                            AS cohort,
        COUNT(*)                                                     AS total_sites,
        COUNT(*) FILTER (WHERE s.last_seen_at > NOW() - INTERVAL '30 days'
                         AND NOT s.suspended)                        AS still_active,
        ROUND(AVG(EXTRACT(MONTH FROM AGE(NOW(), s.created_at))), 1)  AS avg_age_months
    FROM sites s
    GROUP BY 1
) cohorts
ORDER BY cohort;

-- =============================================================================
-- 15. MIX DE CONTENU (slide "Content Strategy")
-- =============================================================================

\echo ''
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
\echo '  15. MIX DE CONTENU — Répartition des lectures'
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'

SELECT
    COALESCE(category, 'non catégorisé')                              AS "Catégorie",
    COUNT(*)                                                         AS "Lectures",
    ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 1)    AS "%",
    ROUND(AVG(CASE WHEN video_duration > 0
        THEN 100.0 * duration_played / video_duration ELSE NULL END), 1) AS "Complétion moy. %"
FROM video_plays
GROUP BY 1
ORDER BY 2 DESC;

-- =============================================================================
-- RÉSUMÉ EXÉCUTIF
-- =============================================================================

\echo ''
\echo '╔══════════════════════════════════════════════════════════════════╗'
\echo '║                    RÉSUMÉ EXÉCUTIF                             ║'
\echo '╚══════════════════════════════════════════════════════════════════╝'

SELECT
    (SELECT COUNT(*) FROM sites)                                      AS "Boîtiers déployés",
    (SELECT COUNT(*) FROM sites
     WHERE subscription_end > NOW() AND NOT suspended)                AS "Abonnements payants",
    (SELECT TO_CHAR(COUNT(*), 'FM999,999,999') FROM video_plays)      AS "Lectures vidéo (lifetime)",
    (SELECT TO_CHAR(COALESCE(SUM(duration_played), 0) / 3600, 'FM999,999,999')
     FROM video_plays)                                                AS "Heures de screen time",
    (SELECT COUNT(*) FROM advertisers WHERE status = 'active')        AS "Annonceurs actifs",
    (SELECT TO_CHAR(COUNT(*), 'FM999,999,999')
     FROM video_plays WHERE category = 'sponsor')                      AS "Impressions pub (lifetime)",
    (SELECT COUNT(*) FROM software_updates)                           AS "Releases produit",
    (SELECT ROUND(AVG(uptime_percent), 1) FROM club_daily_stats_live)      AS "Uptime moyen %";

\echo ''
\echo 'Script terminé. Données prêtes pour le pitch deck!'
\echo ''
