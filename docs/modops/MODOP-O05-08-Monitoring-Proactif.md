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

**URL** : `http://localhost:3000` (si Docker local) ou URL Grafana Cloud

**Login** :
- Username : admin
- Password : [voir documentation interne]

### 3.3 Dashboards à consulter (15 min)

#### Dashboard 1 : Vue d'ensemble (5 min)

**URL** : Grafana → Dashboards → Neopro Overview

**Métriques clés à vérifier :**

| Métrique | Valeur normale | Action si anormale |
|----------|----------------|---------------------|
| **Sites connectés** | Stable (±5% vs J-1) | Si chute > 10% → Vérifier logs serveur central |
| **Requêtes HTTP/s** | 50-200 req/s | Si pic anormal → Vérifier logs nginx |
| **Temps de réponse API** | < 200ms (p95) | Si > 500ms → Vérifier PostgreSQL |
| **Déploiements en cours** | 0-5 | Si > 10 → Vérifier la queue |
| **Alertes actives** | 0-2 | Si > 5 → Consulter MODOP-S11-15 |

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

#### Dashboard 2 : Santé des sites (5 min)

**URL** : Grafana → Dashboards → Sites Health

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

| Composant | Métrique | Seuil OK | Seuil Warning | Seuil Critical |
|-----------|----------|----------|---------------|----------------|
| **PostgreSQL** | Connexions | < 50 | 50-80 | > 80 |
| **PostgreSQL** | Latence queries | < 10ms | 10-50ms | > 50ms |
| **Redis** | Mémoire utilisée | < 500MB | 500-800MB | > 800MB |
| **Redis** | Hit rate | > 90% | 80-90% | < 80% |
| **WebSocket** | Connexions actives | 40-50 | 30-40 ou 50-60 | < 30 ou > 60 |
| **CPU serveur** | Utilisation | < 60% | 60-80% | > 80% |
| **Mémoire serveur** | Utilisation | < 70% | 70-85% | > 85% |

### 3.4 Rapport quotidien (template)

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

#### C. Métriques d'alertes

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

| KPI | Valeur | Objectif | Statut |
|-----|--------|----------|--------|
| Disponibilité moyenne | 98.5% | > 99% | ⚠️ |
| Temps de réponse API (p95) | 195ms | < 200ms | ✅ |
| Taux de succès déploiements | 95% | > 95% | ✅ |
| Sites en ligne | 94% (avg) | > 95% | ⚠️ |

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

| Action | Count | Unique Users |
|--------|-------|--------------|
| VIDEO_DEPLOYED | 145 | 5 |
| USER_LOGIN | 120 | 8 |
| CONFIG_PUSHED | 45 | 3 |
| SITE_CREATED | 3 | 2 |
| UPDATE_DEPLOYED | 2 | 1 |

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
curl https://neopro-central.onrender.com/health
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
curl https://neopro-central.onrender.com/health

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
- [ ] Dashboard Grafana : toutes les métriques en vert

**Temps total : 10-15 minutes**

---

## 7. ESCALADE ET ACTIONS

### Matrice de décision

| Anomalie | Sévérité | Action | Délai |
|----------|----------|--------|-------|
| Site hors ligne > 24h | 🟡 Minor | Email client | 48h |
| CPU > 80% | 🟡 Minor | Surveillance | 24h |
| Disque > 90% | 🟠 Major | Nettoyage immédiat | 4h |
| Serveur central CPU > 80% | 🔴 Critical | Investigation + escalade | 1h |
| PostgreSQL down | 🔴 Critical | Intervention immédiate | Immédiat |
| Redis down | 🔴 Critical | Intervention immédiate | Immédiat |
| > 10 sites hors ligne | 🔴 Critical | Vérifier serveur central | Immédiat |

---

## 8. KPI ET MÉTRIQUES

### Objectifs de monitoring
- **Temps de détection anomalie** : < 10 min
- **Temps de résolution incident mineur** : < 4h
- **Temps de résolution incident majeur** : < 1h
- **Couverture monitoring** : 100% des services critiques

---

**FIN DU MODOP-O05-08**
