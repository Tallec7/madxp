# ADR-009: Alertes Prédictives Multi-Métriques

**Date** : Février 2026 (v3.0)
**Statut** : Accepté
**Décideurs** : Équipe Neopro

---

## Contexte

Avec 50+ Raspberry Pi déployés, les incidents (disque plein, surchauffe, déconnexion) étaient détectés **après** impact utilisateur. Les opérateurs découvraient les problèmes via les plaintes des clubs ou en consultant manuellement le dashboard.

Problèmes identifiés :
1. **Réactivité insuffisante** : Un Pi peut remplir son disque en 48h si les vidéos s'accumulent
2. **Surchauffe progressive** : La température monte graduellement avant un crash GPU
3. **Déconnexions silencieuses** : Un Pi peut perdre sa connexion sans alerte
4. **Abonnements oubliés** : Des clubs découvraient le blocage le jour du match

## Décision

Implémenter un **service d'alertes prédictives** qui évalue 8 métriques toutes les heures et génère des alertes avant que les problèmes ne surviennent.

### Métriques évaluées

| Métrique | Warning | Critical | Source |
|----------|---------|----------|--------|
| `days_since_last_video` | >7 jours | >14 jours | `video_plays` |
| `disk_growth_rate` | >5%/h | >10%/h | `metrics` (disk) |
| `disconnections_24h` | >5 | >10 | `metrics` (connexion) |
| `wifi_signal_quality` | <50% | <25% | `metrics` (signal) |
| `video_errors_24h` | >5 | >15 | `video_plays` (erreurs) |
| `temperature_trend` | >5°C/h | >10°C/h | `metrics` (temp) |
| `hotspot_restarts_24h` | >2 | >5 | `alerts` (hotspot) |
| `days_until_subscription_end` | <30j | <7j | `sites` (subscription) |

### Architecture

```
predictive-alerts.service.ts (cron horaire)
    │
    ├── Requête SQL agrégée (metrics, video_plays, alerts, sites)
    │
    ├── Pour chaque site : évalue les 8 métriques
    │
    ├── alerting.service.ts → evaluateMetric()
    │   ├── Seuil dépassé ? → Créer/mettre à jour l'alerte
    │   └── Seuil OK ? → Résoudre l'alerte existante
    │
    └── Stockage dans table `alerts` (type = 'predictive')
```

### Seuils par défaut

Chargés au démarrage dans `alert_thresholds` (14 seuils : 6 réactifs + 8 prédictifs). Modifiables en DB sans redéploiement.

## Alternatives Considérées

### 1. Alertes réactives uniquement (seuils simples)

**Avantages** : Simple, pas de calcul de tendance
**Inconvénients** : Alerte quand le problème est déjà là (disque plein, Pi surchauffé)
**Verdict** : Insuffisant seul — conservé pour les alertes immédiates, complété par le prédictif.

### 2. Machine Learning sur les séries temporelles

**Avantages** : Détection d'anomalies sophistiquée
**Inconvénients** : Complexité disproportionnée pour 50 Pi ; données insuffisantes pour l'entraînement
**Verdict** : Rejeté — Over-engineering pour l'échelle actuelle.

### 3. Seuils configurables avec tendances simples (choisi) ✅

**Avantages** :
- Détection précoce (heures/jours avant l'incident)
- Seuils ajustables en DB sans redéploiement
- Pas de dépendance ML
- Requête SQL unique agrégeant toutes les sources

**Inconvénients** :
- Les seuils nécessitent un calibrage initial
- Pas de détection d'anomalies contextuelles

**Verdict** : Accepté — Rapport coût/bénéfice optimal pour la taille de flotte actuelle.

## Conséquences

### Positives

1. **Proactivité** : Les problèmes sont détectés heures/jours avant impact
2. **Dashboard enrichi** : Section alertes prédictives avec badges colorés
3. **Extensibilité** : Ajout de nouvelles métriques = ajout d'un seuil en DB
4. **Audit** : Historique complet des alertes pour analyse de patterns

### Négatives

1. **Charge DB** : Requête horaire agrégée sur 4 tables (optimisable avec index)
2. **Bruit** : Risque de faux positifs si seuils mal calibrés
3. **Dépendance** : Requiert `alertingService.initialize()` au démarrage serveur

## Références

- `central-server/src/services/predictive-alerts.service.ts` — Service principal
- `central-server/src/services/alerting.service.ts` — Évaluation des seuils
- `central-server/src/controllers/alerts.controller.ts` — API REST
- `central-server/src/routes/alerts.routes.ts` — Routes

---

*Créé le 9 février 2026*
