# MODOP-O05-08 : Monitoring Proactif

**Version** : 1.0
**Date** : 23 décembre 2025
**Responsable** : Ops / SRE
**Niveau requis** : Ops Niveau 2-3
**Fréquence** : Quotidien / Hebdomadaire / Mensuel

---

## 1. OBJECTIF

Surveiller proactivement l'infrastructure Neopro pour identifier et résoudre les problèmes AVANT qu'ils n'impactent les clients.

## 2. PÉRIMÈTRE

### Ce MODOP couvre

- **MODOP-O05** : Revue quotidienne dashboard Grafana
- **MODOP-O06** : Analyse hebdomadaire des métriques Prometheus
- **MODOP-O07** : Revue mensuelle des audits
- **MODOP-O08** : Vérification santé dépendances (PostgreSQL, Redis, WebSocket)

---

## 3. MODOP-O05 : REVUE QUOTIDIENNE GRAFANA

### 3.1 Objectif

Vérifier chaque jour (matin) que tous les systèmes fonctionnent normalement et identifier les anomalies.

### 3.2 Accès Grafana

**URL** : `http://localhost:3000` — sélectionner `neopro-production` dans le dropdown "Environment"

**Démarrage** : `docker compose up prometheus alertmanager grafana` (scrape local + prod Railway + alerting Slack)

**Login** :

- Username : admin
- Password : admin (par défaut, à changer en production)

> 📖 **Guide complet de lecture Grafana** : Un guide détaillé avec seuils vert/jaune/rouge, arbres de diagnostic et matrice d'escalade est disponible sur Notion :
> [📊 Guide Grafana — Lecture & Diagnostic](https://www.notion.so/305c27de363881d1a95cc4891d6cd823)

### 3.3 Dashboards à consulter (15 min)

#### Dashboard 1 : NeoPro Overview (5 min)

**URL** : Grafana → Dashboards → NeoPro → NeoPro Overview

**9 indicateurs (2 rows) :**

**Row 1 — Santé système (6 stats) :**

| Métrique            | ✅ Vert                | ⚠️ Attention | 🔴 Problème             | Où investiguer                    |
| ------------------- | ---------------------- | ------------ | ----------------------- | --------------------------------- |
| **API Health**      | UP                     | —            | DOWN                    | Railway logs                      |
| **Sites connectés** | Proche du total actifs | Écart 1-3    | Écart > 50% ou 0        | Fleet (Dashboard 3)               |
| **Alertes actives** | 0                      | 1-4          | 5+                      | Alerts by Severity (Dashboard 3)  |
| **Taux erreur 5xx** | 0%                     | 1-5%         | > 5%                    | HTTP Status Codes (Dashboard 2)   |
| **Latence API p95** | < 200ms                | 200-500ms    | > 500ms                 | Event Loop + DB Latency (Dash. 2) |
| **Mémoire RSS**     | < 256 MB               | 256-512 MB   | > 512 MB (OOM imminent) | Heap + Memory Pressure (Dash. 2)  |

**Row 2 — Déploiements OTA (3 panels) :**

| Métrique                       | ✅ Vert   | ⚠️ Attention | 🔴 Problème    | Où investiguer                                |
| ------------------------------ | --------- | ------------ | -------------- | --------------------------------------------- |
| **Déploiements échoués (24h)** | 0         | 1-2          | 3+             | Dashboard → Mises à jour → Historique         |
| **Déploiements par statut**    | Flux vert | failed rouge | Pics rouges    | Logs Railway, vérifier connectivité Pi        |
| **Durée déploiement p95**      | < 120s    | 120-300s     | > 300s (5 min) | Bande passante FTP, taille package, Pi saturé |

**Exemple de vue :**

```
┌─────────────────────────────────────────────────────────┐
│            NEOPRO OVERVIEW - Last 24h                   │
├─────────────────────────────────────────────────────────┤
│ Sites Connectés : 47 / 50 (94%)        [Graph 📊]       │
│   ↓ 3 sites hors ligne depuis > 2h                     │
│                                                          │
│ Requêtes HTTP : 125 req/s              [Graph 📊]       │
│   ✅ Pas de pic anormal                                 │
│                                                          │
│ Latence API (p95) : 180ms              [Graph 📊]       │
│   ✅ < 200ms                                            │
│                                                          │
│ Déploiements : 2 en cours              [Graph 📊]       │
│   ✅ Normal                                              │
│                                                          │
│ Alertes Actives : 1 warning, 0 critical                 │
│   ⚠️ CPU élevé sur CESSON (75%)                         │
└─────────────────────────────────────────────────────────┘
```

**Actions :**

- ✅ Tout vert → Aucune action, noter dans le rapport quotidien
- ⚠️ Anomalie mineure → Créer une note pour investigation
- 🚨 Anomalie critique → Intervention immédiate + escalade

#### Dashboard 2 : Infrastructure (5 min)

**URL** : Grafana → Dashboards → NeoPro → NeoPro Infrastructure

**Rows à vérifier (uniquement si Overview montre un problème) :**

| Row                   | Métriques clés                                      | Seuils critiques                                                                                                                                                                                          |
| --------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **API Performance**   | Request Rate, Duration p50/p95/p99, Status Codes    | p99 > 1s, 5xx visibles, Requests In Progress > 15                                                                                                                                                         |
| **Node.js Runtime**   | Heap Usage %, Event Loop Lag, Memory Pressure       | Heap > 88% warning, > 93% critical, Event Loop > 100ms, emergency events. Les Maps in-memory du alerting service sont bornées (v3.37.2) mais un heap > 88% persistant indique une fuite mémoire ailleurs. |
| **Auth & Rate Limit** | Auth Attempts (success/fail), Rate Limit Violations | Pic massif de failures = bruteforce                                                                                                                                                                       |
| **Database**          | Query Latency p95, Connection Pool active/idle      | p95 > 200ms, Pool 5/5 permanent                                                                                                                                                                           |
| **FTP / Storage**     | FTP Operations success/failed, Duration, Throughput | Failed > 0, p95 > 60s                                                                                                                                                                                     |

#### Dashboard 3 : Business & Fleet (5 min)

**URL** : Grafana → Dashboards → NeoPro → NeoPro Business & Fleet

**Vérifier :**

- **Sites connectés** : Cohérent avec le nombre de clubs actifs (Subscription Status)
- **WebSocket Connections par type** : Si Pi = 0 mais Dashboard OK → problème côté Pi
- **Config Sync Pending** : Reste élevé > 30 min → Pi ne se synchronisent pas
- **Config Drift** : Persiste > 30 min → problème
- **Predictive Alerts** : "alerts generated" en hausse → intervention préventive
- **Vidéos orphelines** : alerte `orphaned_video_references` → boutons de la télécommande ne jouent rien. Ouvrir l'onglet Contenu du site dans le dashboard, utiliser le bouton « Réparer automatiquement » si disponible, puis sauvegarder la config

#### Dashboard 4 : Sponsor Analytics (5 min)

**URL** : Grafana → Dashboards → NeoPro → NeoPro Sponsor Analytics

**4 sections à vérifier :**

| Section                       | Métriques clés                                            | Seuils critiques                                            |
| ----------------------------- | --------------------------------------------------------- | ----------------------------------------------------------- |
| **Sponsor Sync & Deployment** | Sync Rate, Sponsors/Deploy, Auto-Resolution, Failures     | Resolution failures > 0, sync rate = 0 pendant déploiements |
| **Impression Attribution**    | Méthodes de résolution (%), Unresolved Ratio, FK Fallback | Unresolved > 50%, FK fallback visible, Pi Auth failures > 0 |
| **Sponsor Health (F-AUD-07)** | Matrice santé (healthy/warning/critical), Health Checks   | Entries "critical" > 0, alertes proactives en hausse        |
| **Reports & API Quality**     | Report Generations, Duration, Network Stats & Benchmark   | Failures > 0, P95 network stats > 5s, P95 benchmark > 3s    |

**Actions :**

- ✅ Tout vert → Sponsors bien synchronisés, impressions attribuées correctement
- ⚠️ Unresolved > 20% → Vérifier `site_sponsor_videos` et loop manager config
- 🚨 Sponsor Health "critical" → Investiguer sponsors sans impressions, contacter annonceur

#### Ancienne vue : Santé des sites (Pi)

**Vérifier :**

- **Sites hors ligne > 24h** : Contacter le client
- **CPU > 80% sur plusieurs sites** : Problème potentiel de version logicielle
- **Température > 75°C** : Ventilation insuffisante, contacter le client
- **Disque > 85%** : Prévoir nettoyage des logs ou rotation

**Top 5 sites à surveiller :**

```
1. CESSON : CPU 75%, Temp 68°C          → ⚠️ Surveiller
2. RENNES : Disque 88%                  → 🚨 Action requise (nettoyage)
3. NANTES : Hors ligne depuis 3 jours   → 📞 Contacter client
4. BREST : Mémoire 92%                  → ⚠️ Surveiller
5. LORIENT : Normal                      → ✅ OK
```

#### Dashboard 3 : Infrastructure centrale (5 min)

**URL** : Grafana → Dashboards → Central Server

**Métriques :**

| Composant           | Métrique           | Seuil OK | Seuil Warning  | Seuil Critical |
| ------------------- | ------------------ | -------- | -------------- | -------------- |
| **PostgreSQL**      | Connexions         | < 50     | 50-80          | > 80           |
| **PostgreSQL**      | Latence queries    | < 10ms   | 10-50ms        | > 50ms         |
| **Redis**           | Mémoire utilisée   | < 500MB  | 500-800MB      | > 800MB        |
| **Redis**           | Hit rate           | > 90%    | 80-90%         | < 80%          |
| **WebSocket**       | Connexions actives | 40-50    | 30-40 ou 50-60 | < 30 ou > 60   |
| **WebSocket**       | Déconnexions/5min  | < 5      | 5-15           | > 15           |
| **CPU serveur**     | Utilisation        | < 60%    | 60-80%         | > 80%          |
| **Mémoire serveur** | Utilisation        | < 70%    | 70-85%         | > 85%          |

### 3.4 Vérifier les alertes Prometheus / Grafana Cloud

**En local** : Ouvrir `http://localhost:9093` (Alertmanager UI) — vérifier qu'aucune alerte n'est en `firing`.

**En prod (Grafana Cloud)** : Alerting → Alert rules → Folder "NeoPro Alerts" — vérifier l'état des 11 rules.

**Alertes critiques (action immédiate si firing)** :

| Alerte               | Signification                       | Action                                            |
| -------------------- | ----------------------------------- | ------------------------------------------------- |
| `CentralServerDown`  | Serveur inaccessible depuis 2+ min  | Vérifier Railway (crash, redéploiement)           |
| `ZeroHeartbeats`     | Aucun Pi ne communique depuis 5 min | Vérifier WebSocket, restart serveur si nécessaire |
| `NoAgentConnections` | 0 agent WS connecté depuis 5 min    | Même diagnostic que ZeroHeartbeats                |

**Alertes warning (surveillance)** :

| Alerte                | Signification        | Action                                        |
| --------------------- | -------------------- | --------------------------------------------- |
| `HighErrorRate`       | > 5% de 5xx          | Vérifier logs Railway, DB latence             |
| `DbPoolSaturation`    | Pool PG > 80%        | Vérifier requêtes longues, connexions leakées |
| `HighMemoryUsage`     | RSS > 88% de 256MB   | Risk OOM, vérifier heap, restart préventif    |
| `HighDisconnectRate`  | > 0.5 déconnexions/s | Instabilité réseau fleet-wide                 |
| `TooManyActiveAlerts` | > 10 alertes actives | Incident fleet-wide probable                  |

> **Config** : Rules Prometheus dans `docker/prometheus/rules.yml`, rules Grafana Cloud dans `docker/grafana/provisioning/alerting/neopro-alerts-cloud.yml`

### 3.5 Rapport quotidien (template)

```markdown
# Rapport Monitoring Quotidien - [Date]

## Synthèse

- ✅ Statut global : OK / ⚠️ Surveillance / 🚨 Incident
- Sites en ligne : 47/50 (94%)
- Alertes actives : 1 warning, 0 critical

## Anomalies détectées

1. **CPU élevé sur CESSON**
   - Valeur : 75%
   - Seuil warning : 70%
   - Action : Surveillance, pas d'intervention

2. **RENNES : Disque 88%**
   - Valeur : 26GB/30GB
   - Seuil critical : 85%
   - Action : Planifier nettoyage logs (ticket #123)

3. **NANTES : Hors ligne depuis 3 jours**
   - Dernière connexion : 20/01/2025 10:30
   - Action : Email envoyé au client (20/01)

## Infrastructure centrale

- PostgreSQL : ✅ 35 connexions, latence 8ms
- Redis : ✅ 420MB, hit rate 93%
- WebSocket : ✅ 47 connexions actives
- Serveur : ✅ CPU 45%, Mémoire 60%

## Actions planifiées

- [ ] Nettoyage logs RENNES (avant 25/01)
- [ ] Relance client NANTES (si pas de réponse dans 2j)
- [ ] Surveillance CESSON CPU (si > 80% → escalade)

Rédigé par : [Votre nom]
```

---

## 4. MODOP-O06 : ANALYSE HEBDOMADAIRE PROMETHEUS

### 4.1 Objectif

Analyser les tendances sur 7 jours pour identifier les problèmes récurrents et optimiser les ressources.

### 4.2 Métriques clés (30 min)

#### A. Métriques HTTP

**Requêtes totales par endpoint :**

```promql
sum by (path) (
  rate(http_requests_total[7d])
)
```

**Top 5 endpoints les plus sollicités :**

1. `/api/sites/metrics` : 45%
2. `/api/deployments/status` : 20%
3. `/api/videos` : 15%
4. `/api/health` : 10%
5. Autres : 10%

**Actions :**

- Si un endpoint > 50% → Optimiser ou mettre en cache
- Si latence > 500ms sur endpoint critique → Investiguer

#### B. Métriques de déploiement

**Déploiements par statut (7 jours) :**

```promql
sum by (status) (
  increase(neopro_deployments_total[7d])
)
```

**Exemple :**

- Success : 145 (95%)
- Failed : 8 (5%)

**Analyse des échecs :**

- 5 échecs : Timeout réseau (sites hors ligne)
- 2 échecs : Fichier corrompu
- 1 échec : Espace disque insuffisant

**Actions :**

- Améliorer la gestion des sites hors ligne (queue)
- Ajouter validation fichier avant déploiement
- Alerter proactivement sur disque < 15%

#### C. Métriques WebSocket (connexions et déconnexions)

**Connexions WebSocket par type (agent Pi vs dashboard) :**

```promql
neopro_websocket_connections
```

> **Note (v3.37.2)** : Cette gauge est maintenant alimentée à chaque scrape `/metrics` avec les labels `type="agent"` (Pi connectés) et `type="dashboard"` (utilisateurs dashboard). Si `agent=0` mais `dashboard>0` → problème côté Pi, pas côté serveur.

**Déconnexions par raison (7 jours) :**

```promql
sum by (reason) (
  increase(neopro_websocket_disconnects_total[7d])
)
```

**Raisons Socket.IO possibles :**

| Raison                 | Signification                        |
| ---------------------- | ------------------------------------ |
| `transport close`      | Perte réseau (WiFi, Ethernet, proxy) |
| `ping timeout`         | Timeout ping/pong Socket.IO          |
| `io server disconnect` | Déconnexion forcée côté serveur      |
| `io client disconnect` | Déconnexion volontaire côté client   |
| `zombie_timeout`       | Health monitor (60s sans pong)       |
| `zombie_cleanup`       | Nettoyage manuel de connexion zombie |

**Actions :**

- Si `transport close` > 50% → Problème réseau systémique, vérifier connectivité Pi
- Si `zombie_timeout` > 20% → Instabilité serveur ou réseau, investiguer
- Si déconnexions agent > 15/5min → Alerte, investiguer immédiatement

#### D. Métriques d'alertes

**Alertes générées par type (7 jours) :**

```promql
sum by (type) (
  increase(neopro_alerts_total[7d])
)
```

**Top 3 types d'alertes :**

1. CPU élevé : 25 alertes (10 sites différents)
2. Disque presque plein : 12 alertes (8 sites)
3. Site hors ligne : 8 alertes (5 sites)

**Actions :**

- CPU : Optimiser l'application (profiling)
- Disque : Activer rotation automatique des logs
- Hors ligne : Améliorer la connectivité (4G backup ?)

### 4.3 Rapport hebdomadaire (template)

```markdown
# Rapport Monitoring Hebdomadaire - Semaine du [Date]

## KPIs de la semaine

| KPI                         | Valeur    | Objectif | Statut |
| --------------------------- | --------- | -------- | ------ |
| Disponibilité moyenne       | 98.5%     | > 99%    | ⚠️     |
| Temps de réponse API (p95)  | 195ms     | < 200ms  | ✅     |
| Taux de succès déploiements | 95%       | > 95%    | ✅     |
| Sites en ligne              | 94% (avg) | > 95%    | ⚠️     |

## Tendances (vs semaine précédente)

- Sites connectés : 47 → 48 (+1) ✅
- Requêtes HTTP/jour : 1.2M → 1.4M (+16%) ✅
- Déploiements/semaine : 120 → 145 (+20%) ✅
- Alertes actives : 8 → 12 (+50%) ⚠️

## Incidents notables

1. **21/01 14:30 - Serveur central ralenti (30 min)**
   - Cause : Pic de connexions simultanées (match national)
   - Impact : Latence API 500ms → 2s
   - Résolution : Redémarrage Redis + optimisation queries
   - Prévention : Ajouter mise en cache pour `/api/sites/metrics`

2. **23/01 10:00 - 5 sites NANTES hors ligne**
   - Cause : Coupure Internet chez le client
   - Impact : Pas de monitoring pendant 4h
   - Résolution : Reconnexion automatique
   - Prévention : Aucune (dépend du client)

## Top actions d'optimisation

1. Optimiser endpoint `/api/sites/metrics` (45% du trafic)
2. Mettre en place rotation automatique des logs
3. Ajouter monitoring 4G backup pour sites critiques

Rédigé par : [Votre nom]
```

---

## 5. MODOP-O07 : REVUE MENSUELLE DES AUDITS

### 5.1 Objectif

Analyser les audits système pour identifier les comportements anormaux, les patterns de sécurité, et les opportunités d'amélioration.

### 5.2 Requêtes d'audit (30 min)

**Accès aux audits :**

```sql
-- Connexion à PostgreSQL
psql -h $DB_HOST -U $DB_USER -d neopro

-- Audits du mois dernier
SELECT
  action,
  COUNT(*) as count,
  COUNT(DISTINCT user_id) as unique_users
FROM audit_logs
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY action
ORDER BY count DESC;
```

**Exemple de résultats :**

| Action          | Count | Unique Users |
| --------------- | ----- | ------------ |
| VIDEO_DEPLOYED  | 145   | 5            |
| USER_LOGIN      | 120   | 8            |
| CONFIG_PUSHED   | 45    | 3            |
| SITE_CREATED    | 3     | 2            |
| UPDATE_DEPLOYED | 2     | 1            |

**Analyses :**

#### A. Activité utilisateurs

```sql
-- Utilisateurs les plus actifs
SELECT
  user_id,
  COUNT(*) as actions,
  MAX(created_at) as last_activity
FROM audit_logs
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY user_id
ORDER BY actions DESC
LIMIT 10;
```

**Identifier :**

- Comptes inactifs > 30 jours → Désactiver
- Activité anormale (> 500 actions/jour) → Investiguer
- Nouveaux utilisateurs → Vérifier formation

#### B. Déploiements par utilisateur

```sql
-- Qui déploie le plus ?
SELECT
  user_id,
  COUNT(*) as deployments,
  SUM(CASE WHEN metadata->>'status' = 'success' THEN 1 ELSE 0 END) as success,
  SUM(CASE WHEN metadata->>'status' = 'failed' THEN 1 ELSE 0 END) as failed
FROM audit_logs
WHERE action IN ('VIDEO_DEPLOYED', 'UPDATE_DEPLOYED', 'CONFIG_PUSHED')
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY user_id
ORDER BY deployments DESC;
```

**Identifier :**

- Taux d'échec > 10% → Formation requise
- Utilisateur avec 0 déploiement mais accès admin → Revoir permissions

#### C. Créations de sites

```sql
-- Nouveaux sites créés
SELECT
  metadata->>'site_name' as site_name,
  metadata->>'club_name' as club_name,
  created_at
FROM audit_logs
WHERE action = 'SITE_CREATED'
  AND created_at > NOW() - INTERVAL '30 days'
ORDER BY created_at DESC;
```

**Vérifier :**

- Tous les sites créés sont bien en ligne
- Documentation de chaque nouveau site
- Formation client effectuée

### 5.3 Rapport mensuel (template)

```markdown
# Rapport Audit Mensuel - [Mois Année]

## Synthèse

- Actions auditées : 315
- Utilisateurs actifs : 8
- Nouveaux sites : 3
- Incidents de sécurité : 0

## Activité par type

1. VIDEO_DEPLOYED : 145 (46%)
2. USER_LOGIN : 120 (38%)
3. CONFIG_PUSHED : 45 (14%)
4. Autres : 5 (2%)

## Utilisateurs les plus actifs

1. admin@neopro.fr : 150 actions (48%)
2. ops@neopro.fr : 80 actions (25%)
3. support@neopro.fr : 60 actions (19%)

## Nouveaux sites créés

- CESSON Handball (05/01/2025)
- RENNES Volley (12/01/2025)
- NANTES Basket (20/01/2025)

## Anomalies détectées

- Aucune anomalie de sécurité
- Compte "dev@neopro.fr" inactif depuis 45 jours → Désactivation proposée

## Recommandations

1. Former support@neopro.fr (taux d'échec 15% vs 5% pour ops)
2. Documenter les 3 nouveaux sites
3. Désactiver le compte dev@neopro.fr
4. Ajouter audit pour les modifications de permissions

Rédigé par : [Votre nom]
```

---

## 6. MODOP-O08 : VÉRIFICATION SANTÉ DÉPENDANCES

### 6.1 Objectif

Vérifier quotidiennement que toutes les dépendances critiques (PostgreSQL, Redis, WebSocket) fonctionnent correctement.

### 6.2 PostgreSQL (5 min)

**Endpoint health :**

```bash
curl https://neopro-central-production.up.railway.app/health
```

**Réponse attendue :**

```json
{
  "status": "healthy",
  "timestamp": "2025-01-23T10:00:00Z",
  "dependencies": {
    "database": {
      "status": "healthy",
      "latency": 8,
      "connections": 35
    }
  }
}
```

**Vérifications manuelles :**

```bash
# Connexion à PostgreSQL
psql -h $DB_HOST -U $DB_USER -d neopro

-- Nombre de connexions
SELECT count(*) FROM pg_stat_activity;

-- Connexions par état
SELECT state, count(*)
FROM pg_stat_activity
GROUP BY state;

-- Queries lentes (> 1s)
SELECT pid, now() - query_start as duration, query
FROM pg_stat_activity
WHERE state = 'active' AND now() - query_start > interval '1 second'
ORDER BY duration DESC;

-- Taille de la base
SELECT pg_size_pretty(pg_database_size('neopro'));
```

**Alertes :**

- Connexions > 80 → Vérifier fuites de connexions
- Query > 5s → Optimiser la requête
- Taille DB > 10GB → Planifier archivage

### 6.3 Redis (3 min)

```bash
# Connexion Redis
redis-cli -h $REDIS_HOST -p 6379 -a $REDIS_PASSWORD

# Informations
INFO

# Métriques clés à vérifier :
# - used_memory_human : < 1GB
# - connected_clients : 40-50
# - keyspace_hits / keyspace_misses : ratio > 90%
```

**Commandes utiles :**

```bash
# Hit rate
INFO stats | grep keyspace

# Exemple :
# keyspace_hits:1500000
# keyspace_misses:150000
# Hit rate = 1500000 / (1500000 + 150000) = 90.9%

# Voir les clés (attention en prod !)
KEYS *

# Nombre de clés
DBSIZE
```

### 6.4 WebSocket (3 min)

```bash
# Vérifier les connexions WebSocket
curl https://neopro-central-production.up.railway.app/health

# Devrait inclure :
{
  "websocket": {
    "status": "healthy",
    "connections": 47
  }
}
```

**Sur le serveur (si accès) :**

```javascript
// Via le dashboard
// Menu Admin → Monitoring → WebSocket Connections

// Doit afficher :
// - Nombre de sites connectés : 47
// - Messages envoyés/reçus : graphique temps réel
// - Latence moyenne : < 100ms
```

### 6.5 Checklist santé quotidienne

**Exécuter chaque matin :**

- [ ] Endpoint `/health` retourne "healthy"
- [ ] PostgreSQL : connexions < 80, pas de queries lentes
- [ ] PostgreSQL : taille DB < 10GB
- [ ] Redis : mémoire < 1GB, hit rate > 90%
- [ ] WebSocket : connexions = nombre de sites en ligne
- [ ] WebSocket : déconnexions < 5/5min (panneau "Socket Disconnects by Reason")
- [ ] Dashboard Grafana : toutes les métriques en vert

**Temps total : 10-15 minutes**

---

## 7. ESCALADE ET ACTIONS

### Matrice de décision

| Anomalie                  | Sévérité    | Action                                                                                                                        | Délai    |
| ------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------- | -------- |
| Site hors ligne > 24h     | 🟡 Minor    | Email client                                                                                                                  | 48h      |
| CPU > 80%                 | 🟡 Minor    | Surveillance                                                                                                                  | 24h      |
| Heap Usage > 88%          | 🟡 Minor    | Vérifier Memory Pressure events, les Maps du alerting service se purgent auto (v3.37.2)                                       | 24h      |
| Heap Usage > 93%          | 🟠 Major    | Le memory manager lance le cleanup auto. Si le heap reste > 93% après cleanup → fuite mémoire, investiguer avec heap snapshot | 4h       |
| Disque > 90%              | 🟠 Major    | Nettoyage immédiat                                                                                                            | 4h       |
| Serveur central CPU > 80% | 🔴 Critical | Investigation + escalade                                                                                                      | 1h       |
| PostgreSQL down           | 🔴 Critical | Intervention immédiate                                                                                                        | Immédiat |
| Redis down                | 🔴 Critical | Intervention immédiate                                                                                                        | Immédiat |
| > 10 sites hors ligne     | 🔴 Critical | Vérifier serveur central                                                                                                      | Immédiat |

---

## 8. KPI ET MÉTRIQUES

### Objectifs de monitoring

- **Temps de détection anomalie** : < 10 min
- **Temps de résolution incident mineur** : < 4h
- **Temps de résolution incident majeur** : < 1h
- **Couverture monitoring** : 100% des services critiques

---

**FIN DU MODOP-O05-08**
