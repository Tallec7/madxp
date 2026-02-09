# Procédures Backup & Restore

**Version** : 1.0
**Date** : 9 février 2026
**Responsable** : Ops / SRE

---

## 1. VUE D'ENSEMBLE

```
┌─────────────────────────────────────────────────────────────┐
│                    COMPOSANTS À SAUVEGARDER                  │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  PostgreSQL   │  │  FTP/Supabase│  │  Raspberry Pi    │  │
│  │  (Supabase)   │  │  (Vidéos)    │  │  (Config locale) │  │
│  │  ⬇ Auto daily │  │  ⬇ Non auto  │  │  ⬇ Golden image  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐                        │
│  │  Railway     │  │  GitHub      │                        │
│  │  (Env vars)  │  │  (Code)      │                        │
│  │  ⬇ Export    │  │  ⬇ Git tags  │                        │
│  └──────────────┘  └──────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. BASE DE DONNÉES (POSTGRESQL / SUPABASE)

### 2.1 Backups automatiques (Supabase)

Supabase effectue des backups automatiques quotidiens. Accès via le dashboard Supabase :
- **Fréquence** : Quotidienne
- **Rétention** : 7 jours (plan Free/Pro)
- **Type** : Snapshot complet
- **Accès** : Dashboard Supabase → Project → Database → Backups

### 2.2 Backup manuel (pg_dump)

```bash
# Export complet
pg_dump $DATABASE_URL --format=custom --file=backup_$(date +%Y%m%d_%H%M%S).dump

# Export SQL lisible
pg_dump $DATABASE_URL --format=plain --file=backup_$(date +%Y%m%d).sql

# Export d'une table spécifique
pg_dump $DATABASE_URL --table=sites --format=custom --file=sites_backup.dump

# Export des données uniquement (pas le schéma)
pg_dump $DATABASE_URL --data-only --format=custom --file=data_only.dump
```

### 2.3 Restore

```bash
# Depuis un dump custom
pg_restore --dbname=$DATABASE_URL --clean --if-exists backup.dump

# Depuis un fichier SQL
psql $DATABASE_URL < backup.sql

# Restaurer une seule table
pg_restore --dbname=$DATABASE_URL --table=sites --clean backup.dump
```

### 2.4 Tables critiques (priorité de restore)

| Priorité | Table | Justification |
|----------|-------|---------------|
| P0 | `users` | Accès au système |
| P0 | `sites` | Configuration des clubs (api_key, subscription) |
| P0 | `videos` | Catalogue vidéo (métadonnées, storage_path) |
| P1 | `config_history` | Historique des configurations déployées |
| P1 | `content_deployments` | État des déploiements en cours |
| P1 | `subscription_history` | Historique abonnements |
| P2 | `club_daily_stats` | Agrégations analytics (irremplaçables) |
| P2 | `advertiser_daily_stats` | Agrégations annonceurs |
| P3 | `metrics` | Métriques système (7j rétention) |
| P3 | `audit_logs` | Logs d'audit (90j rétention) |

### 2.5 Schéma de référence

Le fichier `central-server/src/scripts/full-schema.sql` contient le schéma complet de la DB. En cas de reconstruction totale :

```bash
# Recréer la DB depuis le schéma
psql $DATABASE_URL < central-server/src/scripts/full-schema.sql

# Exécuter les migrations additionnelles
cd central-server && npm run db:migrate
```

---

## 3. STOCKAGE VIDÉO

### 3.1 FTP Hostinger (stockage principal)

**Pas de backup automatique** — les vidéos sont stockées sur FTP Hostinger.

```bash
# Lister les fichiers
curl ftp://FTP_HOST/videos/ --user FTP_USER:FTP_PASSWORD

# Télécharger un fichier
curl -o video.mp4 ftp://FTP_HOST/videos/video.mp4 --user FTP_USER:FTP_PASSWORD

# Backup complet (via lftp pour performance)
lftp -u FTP_USER,FTP_PASSWORD FTP_HOST -e "mirror /videos ./backup_videos; quit"
```

**Redondance** : Les vidéos déployées existent aussi sur les Pi localement dans `/home/pi/neopro/videos/`. En cas de perte FTP, les vidéos actives sont récupérables depuis les Pi.

### 3.2 Supabase Storage (fallback)

Les vidéos uploadées sans FTP configuré sont dans Supabase Storage.

```bash
# Via l'API Supabase
# Dashboard → Storage → Bucket "videos"
```

### 3.3 Identification du backend

```sql
-- Vidéos sur FTP (pas de / dans storage_path)
SELECT filename, storage_path FROM videos WHERE storage_path NOT LIKE '%/%';

-- Vidéos sur Supabase (avec / dans storage_path)
SELECT filename, storage_path FROM videos WHERE storage_path LIKE '%/%';
```

---

## 4. RASPBERRY PI (CONFIGURATION LOCALE)

### 4.1 Fichiers critiques par Pi

| Fichier | Contenu | Backup |
|---------|---------|--------|
| `/home/pi/neopro/webapp/configuration.json` | Config du site | Miroir dans `local_config_mirror` en DB |
| `/home/pi/neopro/data/license_cache.json` | Cache licence | Recalculé automatiquement |
| `/etc/hostapd/hostapd.conf` | Config hotspot WiFi | Copie dans debug-bundle |
| `/etc/wpa_supplicant/wpa_supplicant.conf` | Config WiFi client | Non sauvegardé automatiquement |
| `/home/pi/neopro/sync-agent-golden/` | Snapshot sync-agent | Créé par le guardian |

### 4.2 Backup d'un Pi

```bash
# Export configuration complète
ssh pi@neopro.local 'cat /home/pi/neopro/webapp/configuration.json' > config_backup.json

# Export debug bundle complet (inclut config, services, réseau)
# Via le dashboard : Onglet Debug → Export Debug Bundle

# Snapshot complet du dossier neopro
ssh pi@neopro.local 'tar czf /tmp/neopro-backup.tar.gz -C /home/pi neopro/'
scp pi@neopro.local:/tmp/neopro-backup.tar.gz ./backup_pi_$(date +%Y%m%d).tar.gz
```

### 4.3 Restore d'un Pi

```bash
# Restaurer la configuration
scp config_backup.json pi@neopro.local:/home/pi/neopro/webapp/configuration.json
ssh pi@neopro.local 'sudo systemctl restart neopro-app'

# Réinstallation complète (nouveau Pi ou SD corrompue)
# 1. Flash Raspberry Pi OS Lite sur la SD
# 2. Exécuter le script d'installation
curl -O https://tallec7.github.io/neopro/install/install.sh
chmod +x install.sh && sudo ./install.sh

# 3. Restaurer la config (api_key, siteId)
scp config_backup.json pi@neopro.local:/home/pi/neopro/webapp/configuration.json
```

### 4.4 Golden image (clonage rapide)

Pour déployer rapidement un nouveau Pi identique :

```bash
# Sur le Pi source (arrêté proprement)
sudo dd if=/dev/mmcblk0 bs=4M | gzip > golden_image_$(date +%Y%m%d).img.gz

# Sur le nouveau Pi
gunzip -c golden_image.img.gz | sudo dd of=/dev/mmcblk0 bs=4M
# Puis : changer l'api_key et le siteId dans configuration.json
```

---

## 5. VARIABLES D'ENVIRONNEMENT (RAILWAY)

### 5.1 Export

Railway ne fournit pas d'export automatique. **Documenter manuellement** les variables critiques :

```bash
# Variables obligatoires à sauvegarder
DATABASE_URL
JWT_SECRET
ALLOWED_ORIGINS
FTP_HOST, FTP_USER, FTP_PASSWORD, FTP_PUBLIC_URL
SUPABASE_URL, SUPABASE_SERVICE_KEY

# Variables optionnelles
SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD
LOGTAIL_TOKEN
REDIS_URL
SLACK_WEBHOOK_URL
```

**Recommandation** : Stocker ces variables dans un gestionnaire de secrets (1Password, Vault) en dehors de Railway.

### 5.2 Restore

En cas de perte des variables Railway :
1. Recréer le projet Railway
2. Configurer les variables depuis le backup sécurisé
3. Redéployer depuis GitHub (Railway pull automatique)

---

## 6. CODE SOURCE (GITHUB)

### 6.1 Protections existantes

- **Branches protégées** : `main` requiert une PR
- **Tags sémantiques** : `v3.7.8` etc. créés par semantic-release
- **GitHub Releases** : Archives binaires pour les Pi

### 6.2 Rollback d'une release

```bash
# Lister les dernières releases
gh release list --limit 10

# Redéployer une version précédente sur Railway
git checkout v3.7.7
git push origin HEAD:deploy-rollback
# → Configurer Railway pour deployer depuis cette branche
```

---

## 7. CHECKLIST DE VÉRIFICATION

### Hebdomadaire

- [ ] Vérifier que les backups Supabase sont actifs (Dashboard → Backups)
- [ ] Vérifier l'espace disque FTP (ne pas dépasser 80%)
- [ ] Vérifier les alertes prédictives dans le dashboard

### Mensuelle

- [ ] Tester un restore de backup DB sur un environnement de test
- [ ] Vérifier que les variables Railway sont documentées
- [ ] Vérifier que le golden image Pi est à jour

### Après chaque incident P0/P1

- [ ] Vérifier l'intégrité de la DB
- [ ] Vérifier les déploiements en cours (reset si bloqués)
- [ ] Vérifier les connexions Pi (tous online ?)
- [ ] Documenter dans `docs/incidents/`

---

*Créé le 9 février 2026*
