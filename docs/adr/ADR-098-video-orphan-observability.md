# ADR-098 : Observabilité des vidéos orphelines (compteur temps réel + audit FTP CRON 24h)

**Date** : 2026-04-26
**Statut** : Accepté
**Format** : Léger

---

## Contexte

L'incident à l'origine de la PR #613 (recovery TV) a mis en évidence un trou de
détection : une vidéo supprimée directement sur le FTP Hostinger (hors API
MadXP) cassait silencieusement les players Pi et SaaS, sans qu'aucune alerte
ne remonte avant qu'un client ne se plaigne. La cascade DELETE côté API
(PRs #616/#617/#618) corrige le cas où la suppression passe par MadXP, mais
ne couvre pas les divergences `videos.storage_path` ↔ FTP créées hors API
(suppression manuelle, upload jamais réussi, fichier déplacé).

## Décision

On adopte un **double rideau** d'observabilité :

1. **Compteur temps réel** `neopro_video_transition_error_total` —
   incrémenté à chaque erreur player remontée par le Pi → cloud (Socket.IO
   `transition_error`). Détection immédiate dès la première lecture qui
   échoue, sans attendre un scan systématique.
2. **CRON quotidien `video_ftp_audit`** (03:00 Europe/Paris, ~24h) —
   dispatché par `cron-scheduler.service.ts`, scanne tous les
   `videos.storage_path` actifs et vérifie leur présence FTP. Alimente
   `neopro_video_ftp_audit_warnings_total{status=missing|unreachable|resolved}`
   - gauge `neopro_video_ftp_orphans_current{status}` + histogramme
     `neopro_video_ftp_audit_duration_seconds`. Détection systémique même sans
     lecture utilisateur (ex : vidéo orpheline sur un Pi qui ne tourne pas
     actuellement).
   - **Note sur `resolved`** : ce label est un compteur de transitions Prometheus
     uniquement (le CRON détecte qu'un fichier FTP est revenu → DELETE de la row
     `video_ftp_audit_warnings`). Il n'existe PAS de statut `'resolved'` persisté
     en DB — la résolution = suppression de la row (que ce soit par le CRON ou par
     `POST /api/content/videos/:id/replace`). Le replace (PR #647) ne bumpe pas
     ce compteur Prometheus (angle mort observabilité — voir PR #647).

Les 2 métriques sont alertables via Grafana/Alertmanager. Le compteur
temps réel donne le **MTTR** (mean time to repair), l'audit CRON garantit
la **complétude** (aucun orphelin ne dort plus de 24h).

## Alternatives rejetées

- **Webhook FTP Hostinger** : rejeté car Hostinger n'expose pas d'API
  d'événement sur la suppression de fichiers. Dépendance commerciale + pas
  de SLA — non viable.
- **Polling synchrone à chaque DELETE API** : rejeté car ne couvre que les
  suppressions via MadXP (or la cause racine de l'incident #613 est
  précisément une suppression FTP-direct, hors API).
- **CRON horaire** au lieu de quotidien : rejeté car bruyant côté FTP
  (4000+ fichiers, throttle Hostinger observé à ~100 req/min), gain
  marginal vs 24h pour un signal qui n'est pas critique en seconde
  (il y a déjà le compteur temps réel pour ça).
- **Ajouter une vérif `HEAD FTP` au démarrage du player Pi** : envisagé
  mais alourdit le boot (latence FTP + dépendance réseau), et le compteur
  `transition_error` couvre déjà le cas player.

## Conséquences

- ✅ Alerting Grafana possible sur les 2 métriques (seuils différents :
  burst sur le compteur, baseline sur le gauge).
- ✅ Orphelins détectés sous **24h max** côté systémique, **temps réel**
  côté player.
- ⚠️ Coût FTP : ~1 scan complet/jour (~4000 HEAD requests). Acceptable
  dans la limite Hostinger ; à reconsidérer si la flotte dépasse 10k
  vidéos.
- ⚠️ Faux positifs possibles si le FTP est temporairement injoignable
  (status=`unreachable` distinct de `missing` pour cette raison).

## Fichiers impactés

- `central-server/src/services/metrics.service.ts` —
  définit `videoFtpAuditWarningsTotal`, `videoFtpAuditScannedTotal`,
  `videoFtpAuditDuration`, `videoFtpAuditCurrentOrphansGauge`,
  et `videoTransitionErrorTotal`.
- `central-server/src/cron-tasks/video-ftp-audit.task.ts` —
  task `video_ftp_audit` (scan FTP + alimentation métriques).
- `central-server/src/services/cron-scheduler.service.ts` —
  dispatch du task via `executeVideoFtpAuditTask` (case `video_ftp_audit`).
- `central-server/src/handlers/transition-error.handler.ts` (ou équivalent) —
  incrémente `videoTransitionErrorTotal` à la réception de l'événement Pi.

## Références

- Mémoire projet : `project_video_cleanup_cascade.md`
  (4 PRs : #613/#616/#617/#618 — cause racine = suppression FTP hors API).
- ADR-070 — PostgreSQL Railway interne (contexte infra).
