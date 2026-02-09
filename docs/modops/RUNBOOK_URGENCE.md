# Runbook d'Urgence Neopro

**Version** : 1.0
**Date** : 9 février 2026
**Responsable** : Ops / SRE
**Niveau requis** : Ops Niveau 2+

---

## 1. ARBRE DE DÉCISION

```
Le système est-il accessible ?
├── OUI → /health retourne 200 ?
│   ├── Body "healthy" → Vérifier le composant spécifique (§3-§8)
│   ├── Body "degraded" → Identifier la dépendance down (§3.2)
│   └── Body "unhealthy" → Restart Railway (§2.1)
│
└── NON → Railway dashboard accessible ?
    ├── OUI → Vérifier le deploy (§2.2)
    └── NON → Vérifier statut Railway (https://status.railway.app)
```

---

## 2. CENTRAL SERVER (RAILWAY)

### 2.1 Restart d'urgence

```bash
# Via GitHub Actions (préféré)
gh workflow run railway-restart.yml

# Via Railway CLI
railway restart

# Via Railway Dashboard
# → Project → Deployments → "Restart Latest Deploy"
```

**Temps de recovery** : ~30-60s (healthcheck timeout = 100s max)

### 2.2 Deploy bloqué

**Symptôme** : Le deploy est stuck en "Building" ou "Deploying"

1. Vérifier les logs Railway : `railway logs -f`
2. Causes fréquentes :
   - **OOM pendant build** : Augmenter temporairement le plan ou optimiser
   - **Healthcheck timeout** : `/live` doit répondre en <100s
   - **DB inaccessible** : Vérifier Supabase (§3)

3. Si bloqué >5min : annuler le deploy dans le dashboard Railway et redéployer

### 2.3 Erreurs mémoire (OOM)

**Symptôme** : `FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory`

**Configuration actuelle** : Railway Hobby plan, `--max-old-space-size=256`, pool DB = 5 connexions

**Actions immédiates** :
1. Restart Railway (libère la mémoire)
2. Vérifier `/health` pour le heap usage
3. Si récurrent : vérifier les optimisations v3.7.4 (Swagger prod, Winston file transports, realtime-stats intervalle)

### 2.4 Vérification santé

```bash
# Health check complet
curl https://API_URL/health | jq .

# Réponse attendue :
# {
#   "status": "healthy",
#   "dependencies": {
#     "database": "connected",
#     "socketIO": "connected",
#     "redis": "connected"  (ou "not_configured" si Redis absent)
#   }
# }

# Liveness (Kubernetes)
curl https://API_URL/live
# → 200 OK si le process tourne

# Readiness (Kubernetes)
curl https://API_URL/ready
# → 200 si prêt, 503 si dépendance manquante
```

---

## 3. BASE DE DONNÉES (SUPABASE)

### 3.1 Vérifier la connexion

```bash
# Test direct
psql $DATABASE_URL -c "SELECT 1"

# Via l'API
curl https://API_URL/health | jq .dependencies.database
# Attendu : "connected"
```

### 3.2 Pool de connexions saturé

**Symptôme** : `Error: timeout exceeded when trying to connect`

**Configuration** : max 5 connexions, timeout 10s, idle 30s

**Actions** :
1. Vérifier le nombre de connexions actives :
   ```sql
   SELECT count(*) FROM pg_stat_activity WHERE datname = 'postgres';
   ```
2. Tuer les connexions zombie :
   ```sql
   SELECT pg_terminate_backend(pid) FROM pg_stat_activity
   WHERE state = 'idle' AND query_start < NOW() - INTERVAL '5 minutes';
   ```
3. Restart Railway (libère toutes les connexions du pool)

### 3.3 Déploiement bloqué

**Symptôme** : Déploiements vidéo stuck à "in_progress"

```sql
-- Identifier les déploiements bloqués
SELECT id, status, progress, error_message, started_at
FROM content_deployments
WHERE status = 'in_progress'
AND started_at < NOW() - INTERVAL '1 hour';

-- Reset les déploiements bloqués
UPDATE content_deployments SET status = 'failed', error_message = 'Reset manuel - timeout'
WHERE status = 'in_progress'
AND started_at < NOW() - INTERVAL '1 hour';
```

### 3.4 Supabase indisponible

1. Vérifier : https://status.supabase.com
2. Si down prolongé (>30min) :
   - Les Pi continuent de fonctionner en mode offline
   - Le dashboard sera inaccessible
   - Les nouvelles connexions Pi échoueront (register)
3. À la reprise : les Pi se reconnecteront automatiquement via le heartbeat

---

## 4. SOCKET.IO (CONNEXIONS PI)

### 4.1 Déconnexions en cascade

**Symptôme** : Plusieurs Pi passent offline simultanément

**Causes possibles** :
- OOM serveur → Les sockets sont fermées quand le process meurt
- Redis down (si configuré) → Perte du broadcast multi-instance
- Rate limit atteint → Vérifier les logs pour des 429

**Actions** :
1. Restart Railway (§2.1)
2. Les Pi se reconnecteront automatiquement (retry exponentiel)
3. Vérifier après 5min que les Pi reviennent online

### 4.2 Connexion zombie

**Symptôme** : Dashboard affiche "Connexion instable" (orange) alors que le Pi est physiquement connecté

**Diagnostic** :
```bash
# Sur le Pi
sudo journalctl -u neopro-sync-agent -n 50 | grep -E "health check|zombie|reconnect"
```

**Solution immédiate** :
```bash
# Restart du sync-agent sur le Pi
ssh pi@neopro.local 'sudo systemctl restart neopro-sync-agent'
```

### 4.3 Pi totalement inaccessible

**Arbre de diagnostic** :
```
Le Pi répond au ping ?
├── OUI → SSH possible ?
│   ├── OUI → Restart services : sudo systemctl restart neopro-app neopro-sync-agent neopro-kiosk
│   └── NON → Reboot via alimentation (débrancher/rebrancher)
│
└── NON → Sur le réseau local ?
    ├── OUI → Vérifier l'alimentation et la LED du Pi
    └── NON → Contacter le staff du club pour vérification physique
```

---

## 5. STOCKAGE VIDÉO (FTP / SUPABASE)

### 5.1 FTP Hostinger down

**Symptôme** : Upload vidéo échoue, déploiement vidéo échoue sur les Pi

**Vérification** :
```bash
curl -v ftp://FTP_HOST --user FTP_USER:FTP_PASSWORD
```

**Impact** :
- Les vidéos déjà sur les Pi continuent de fonctionner
- Les nouveaux uploads/déploiements échouent
- Le fallback Supabase est automatique **uniquement pour les nouveaux uploads** (si FTP non configuré)

**Actions** :
1. Vérifier le statut Hostinger
2. Si down prolongé : les uploads seront mis en échec, retry possible depuis le dashboard

### 5.2 Vidéo corrompue sur FTP

**Symptôme** : Pi reporte "Checksum mismatch" ou "Archive corrompue"

```bash
# Vérifier la taille du fichier sur FTP
curl -sI ftp://FTP_HOST/videos/fichier.mp4 --user FTP_USER:FTP_PASSWORD | grep Content-Length

# Comparer avec la taille en DB
psql $DATABASE_URL -c "SELECT filename, upload_verified_size FROM videos WHERE filename = 'fichier.mp4'"
```

**Solution** : Re-uploader la vidéo depuis le dashboard.

---

## 6. AUTHENTIFICATION (JWT)

### 6.1 Token invalide en masse

**Symptôme** : Tous les utilisateurs sont déconnectés simultanément

**Cause probable** : `JWT_SECRET` a été changé ou les variables d'env ont été réinitialisées

**Actions** :
1. Vérifier que `JWT_SECRET` est bien configuré dans Railway
2. Si le secret a été perdu : en générer un nouveau, **tous les utilisateurs devront se reconnecter**
3. Les Pi ne sont PAS affectés (ils utilisent `api_key`, pas JWT)

### 6.2 Reset MFA d'un utilisateur

```sql
UPDATE users SET
  mfa_enabled = false,
  mfa_secret = NULL,
  mfa_backup_codes = NULL
WHERE email = 'user@example.com';
```

---

## 7. RASPBERRY PI (INCIDENTS TERRAIN)

### 7.1 TV affiche "Aw, Snap!" (crash Chromium)

**Cause** : GPU saturé, mémoire insuffisante

**Vérification** :
```bash
ssh pi@neopro.local 'vcgencmd get_mem gpu'
# Doit afficher gpu=256M (pas gpu=4M)

ssh pi@neopro.local 'vcgencmd measure_temp'
# Normal: <70°C, Alerte: >80°C
```

**Solution immédiate** :
```bash
ssh pi@neopro.local 'sudo systemctl restart neopro-kiosk'
```

**Solution permanente** (si gpu=4M) :
```bash
ssh pi@neopro.local 'echo "gpu_mem=256" | sudo tee -a /boot/config.txt && sudo reboot'
```

### 7.2 Hotspot WiFi invisible

```bash
# Diagnostic
ssh pi@neopro.local '/home/pi/neopro/scripts/fix-hotspot.sh --json'

# Réparation automatique
ssh pi@neopro.local '/home/pi/neopro/scripts/fix-hotspot.sh --auto-fix'
# Note : nécessite un reboot pour appliquer le changement de canal
```

### 7.3 Sync-agent crashe en boucle

Le guardian restaure automatiquement après 3 crashs en 5 min.

```bash
# Vérifier le statut du guardian
ssh pi@neopro.local '/home/pi/neopro/scripts/sync-agent-guardian.sh status'

# Restauration manuelle depuis la version golden
ssh pi@neopro.local '/home/pi/neopro/scripts/sync-agent-guardian.sh restore'
```

### 7.4 Diagnostic complet

```bash
# Depuis le dashboard : Onglet Debug → Export Debug Bundle
# Ou via SSH :
ssh pi@neopro.local 'cd /home/pi/neopro && ./scripts/diagnose-pi.sh'
```

---

## 8. ALERTES ET ESCALADE

### 8.1 Sévérités

| Sévérité | Exemples | Temps de réponse | Action |
|----------|----------|------------------|--------|
| **P0 - Critique** | Serveur down, DB inaccessible | <15 min | Restart + investigation immédiate |
| **P1 - Majeur** | Déconnexions en cascade (>5 Pi) | <1h | Diagnostic + restart si nécessaire |
| **P2 - Modéré** | 1-2 Pi offline, hotspot down | <4h | Diagnostic remote, intervention planifiée |
| **P3 - Mineur** | Alerte prédictive, warning mémoire | <24h | Monitoring, action préventive |

### 8.2 Contacts

| Rôle | Canal | Quand |
|------|-------|-------|
| Dev/Ops | Slack #neopro-ops | P0, P1 |
| Support client | Email | P2 (si impact club) |
| Hébergeurs | Dashboards respectifs | Si infra down |

### 8.3 Post-mortem

Après tout incident P0/P1 :
1. Documenter la timeline dans `docs/incidents/YYYY-MM-DD-description.md`
2. Identifier la cause racine
3. Proposer des actions préventives
4. Mettre à jour ce runbook si nécessaire

---

## 9. COMMANDES RAPIDES

```bash
# === RAILWAY (CENTRAL SERVER) ===
railway logs -f                              # Logs en temps réel
railway restart                              # Restart le service
gh workflow run railway-restart.yml          # Restart via CI

# === DATABASE ===
psql $DATABASE_URL -c "SELECT count(*) FROM sites WHERE status = 'online'"
psql $DATABASE_URL -c "SELECT * FROM pg_stat_activity WHERE state = 'active'"

# === PI (via SSH) ===
ssh pi@neopro.local 'sudo systemctl status neopro-app neopro-sync-agent neopro-kiosk'
ssh pi@neopro.local 'sudo journalctl -u neopro-sync-agent -n 100 --no-pager'
ssh pi@neopro.local 'vcgencmd measure_temp && vcgencmd get_throttled'

# === HEALTH CHECKS ===
curl -s https://API_URL/health | jq .
curl -s https://API_URL/live
curl -s https://API_URL/ready
```

---

*Créé le 9 février 2026*
