# ADR-010: Suppression de l'UI Analytics Dashboard

**Date** : Février 2026 (v3.0)
**Statut** : Accepté
**Décideurs** : Équipe Neopro

---

## Contexte

Le dashboard Neopro incluait 6 pages analytics (vue d'ensemble, comparaison multi-sites, temps réel, analytics par club, catégories analytics, analytics annonceur) représentant environ 4100 lignes de code.

Problèmes identifiés lors d'un audit des données affichées :

1. **"Temps de diffusion"** : Calculé comme `somme(durée_vidéo × nombre_lectures)` — ce n'est pas le temps écran réel. Un club avec 100 lectures d'une vidéo de 30s affichait "50 minutes" même si la TV n'était allumée que 10 minutes.

2. **"Taux de complétion"** : Toujours affiché à 100% — bug : `video_duration = duration_played` car le Pi ne trackait pas la durée réelle de lecture.

3. **"Disponibilité"** : Mesurait la connexion cloud (heartbeat), pas l'usage réel de la TV. Un Pi connecté mais avec la TV éteinte comptait comme "disponible".

4. **Spikes de données** : Les Pi accumulaient des buffers analytics pendant les périodes offline. Au vidage, les données apparaissaient en spike, faussant les graphiques.

Ces métriques, présentées dans des graphiques professionnels (Chart.js), donnaient une **apparence de fiabilité** à des données fondamentalement incorrectes.

## Décision

**Supprimer les pages analytics de l'UI** tout en **conservant les services backend** pour le billing et les futurs besoins.

### Supprimé (frontend)

| Page | Route | LOC |
|------|-------|-----|
| Vue d'ensemble | `/analytics` | ~800 |
| Comparaison multi-sites | `/analytics/comparison` | ~700 |
| Dashboard temps réel | `/analytics/realtime` | ~600 |
| Analytics par club | `/sites/:id/analytics` | ~700 |
| Catégories analytics | `/admin/analytics-categories` | ~500 |
| Analytics annonceur | `/advertisers/:id/analytics` | ~800 |

### Conservé (backend)

| Service | Justification |
|---------|---------------|
| `realtime-stats.service.ts` | Compteurs connexion temps réel (dashboard principal) |
| `excel-export.service.ts` | Export Excel pour billing mensuel |
| `billing.service.ts` | Données de facturation par mois |
| `cron-scheduler.service.ts` | Agrégation `club_daily_stats` et `advertiser_daily_stats` |
| Endpoints `/api/analytics/*` | Usage programmatique et billing |

### Conservé (dashboard)

- Statut connexion (online/offline/warning) dans site-detail
- Métriques système (CPU, RAM, température, disque) dans l'onglet État
- Alertes système et prédictives
- Benchmark anonymisé entre clubs (ADR séparée)

## Alternatives Considérées

### 1. Corriger les métriques et garder l'UI

**Avantages** : Fonctionnalité analytics disponible immédiatement
**Inconvénients** : Certains problèmes sont structurels (pas de tracking côté TV, buffers offline) ; nécessiterait le déploiement de HDMI-CEC sur tous les Pi existants
**Verdict** : Rejeté à court terme — Le correctif HDMI-CEC (v3.0) résout le problème de tracking TV, mais les Pi existants n'ont pas encore la mise à jour. Les données historiques restent incorrectes.

### 2. Masquer les pages mais garder les routes (accès direct URL)

**Avantages** : Pas de suppression de code ; les power users peuvent y accéder
**Inconvénients** : Les données affichées restent trompeuses ; dette technique maintenue
**Verdict** : Rejeté — Risque que les données incorrectes soient utilisées pour des décisions commerciales.

### 3. Supprimer l'UI, garder le backend (choisi) ✅

**Avantages** :
- Élimine le risque de mauvaises décisions basées sur des données incorrectes
- Réduit la surface de maintenance (~4100 LOC)
- Le backend reste disponible pour billing et futurs besoins
- Permet de reconstruire l'UI proprement quand les données seront fiables

**Inconvénients** :
- Perte temporaire de la fonctionnalité analytics pour les utilisateurs
- Les composants et routes sont encore référencés dans `app.routes.ts` (nettoyage partiel)

**Verdict** : Accepté — Mieux vaut pas de données que des données fausses.

## Conséquences

### Positives

1. **Fiabilité** : Les utilisateurs ne prennent plus de décisions sur des métriques erronées
2. **Maintenance** : ~4100 LOC de moins à maintenir côté dashboard
3. **Focus** : L'effort peut se concentrer sur des métriques fiables (HDMI-CEC, benchmark)
4. **Billing intact** : Les exports Excel et le billing continuent de fonctionner

### Négatives

1. **Fonctionnalité manquante** : Pas d'analytics visuels pour les opérateurs
2. **Code orphelin** : Les fichiers analytics sont encore présents dans le code (voir README)
3. **Communication** : Nécessite d'expliquer aux clients pourquoi les analytics ont disparu

### Actions de suivi

- [ ] **PO Decision** : Supprimer définitivement le code ou le conserver pour reconstruction future (voir `central-dashboard/src/app/features/analytics/README.md`)
- [ ] **HDMI-CEC rollout** : Déployer le tracking TV sur l'ensemble de la flotte
- [ ] **Reconstruction** : Quand les données seront fiables, reconstruire l'UI avec des métriques correctes

## Références

- `central-dashboard/src/app/features/analytics/README.md` — Statut des composants
- `central-server/src/controllers/analytics.controller.ts` — Endpoints conservés
- `central-server/src/services/cron-scheduler.service.ts` — Agrégation quotidienne
- CLAUDE.md (Breaking Changes v3.0.0) — Détails de la suppression

---

*Créé le 9 février 2026*
