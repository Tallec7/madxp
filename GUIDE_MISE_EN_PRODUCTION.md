# Guide complet de mise en production - NeoPro

Ce document détaille **toutes les actions** nécessaires pour déployer NeoPro en production.

---

## Table des matières

1. [Comptes à créer](#1-comptes-à-créer)
2. [Configuration Supabase (Base de données + Storage)](#2-configuration-supabase-base-de-données--storage)
3. [Configuration Redis](#3-configuration-redis)
4. [Configuration Render (Hébergement)](#4-configuration-render-hébergement)
5. [Configuration Docker Hub](#5-configuration-docker-hub)
6. [Configuration GitHub Actions](#6-configuration-github-actions)
7. [Configuration Email (Alertes)](#7-configuration-email-alertes)
8. [Configuration Slack (Notifications)](#8-configuration-slack-notifications)
9. [Configuration Monitoring](#9-configuration-monitoring)
10. [Configuration Logs centralisés (Logtail)](#10-configuration-logs-centralisés-logtail)
11. [Migrations Base de données](#11-migrations-base-de-données)
12. [Création du premier administrateur](#12-création-du-premier-administrateur)
13. [Variables d'environnement complètes](#13-variables-denvironnement-complètes)
14. [Checklist finale](#14-checklist-finale)

---

## 1. Comptes à créer

| Service | Usage | Gratuit | Lien | Obligatoire |
|---------|-------|---------|------|-------------|
| **Supabase** | Base PostgreSQL + Storage | ✅ 500MB + 1GB | https://supabase.com | ✅ OUI |
| **Upstash** | Redis serverless | ✅ 10K req/jour | https://upstash.com | ✅ OUI |
| **Render** | Hébergement application | ✅ 750h/mois | https://render.com | ✅ OUI |
| **Docker Hub** | Registry images Docker | ✅ 1 repo privé | https://hub.docker.com | ⚠️ Si CI/CD |
| **SendGrid** | Envoi d'emails | ✅ 100/jour | https://sendgrid.com | ⚠️ Optionnel |
| **Slack** | Notifications alertes | ✅ | https://slack.com | ⚠️ Optionnel |
| **Logtail** | Logs centralisés | ✅ 1GB/mois | https://betterstack.com | ⚠️ Optionnel |
| **UptimeRobot** | Surveillance uptime | ✅ 50 monitors | https://uptimerobot.com | ⚠️ Optionnel |

---

## 2. Configuration Supabase (Base de données + Storage)

### Étape 2.1 : Créer un compte
1. Aller sur https://supabase.com
2. Cliquer **Start your project**
3. Se connecter avec GitHub (recommandé)

### Étape 2.2 : Créer un projet
1. Cliquer **New Project**
2. Remplir :
   - **Name** : `neopro-production`
   - **Database Password** : Générer un mot de passe fort (⚠️ NOTER LE !)
   - **Region** : `West EU (Paris)` ou le plus proche
3. Cliquer **Create new project**
4. Attendre 2 minutes la création

### Étape 2.3 : Récupérer les informations de connexion DATABASE

1. Aller dans **Settings** (icône engrenage)
2. Cliquer **Database**
3. Dans la section **Connection string**, copier l'URI :
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres
   ```
4. Remplacer `[YOUR-PASSWORD]` par le mot de passe créé à l'étape 2.2

### Étape 2.4 : Activer le Connection Pooling
1. Aller dans **Settings → Database**
2. Section **Connection Pooling** : Activer
3. Copier l'URI du pooler (⚠️ C'est cette URL qu'il faut utiliser) :
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:6543/postgres?pgbouncer=true
   ```

### Étape 2.5 : Récupérer SUPABASE_URL et SUPABASE_SERVICE_KEY

1. Aller dans **Settings → API**
2. Copier :
   - **Project URL** → C'est votre `SUPABASE_URL`
     ```
     https://xxxxx.supabase.co
     ```
   - **service_role (secret)** → C'est votre `SUPABASE_SERVICE_KEY`
     ```
     eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
     ```

> ⚠️ **ATTENTION** : Le `service_role` key est SECRET. Ne JAMAIS l'exposer côté client !

### Étape 2.6 : Créer les buckets Storage

Les vidéos et mises à jour logicielles sont stockées dans Supabase Storage.

1. Aller dans **Storage** (menu gauche)
2. Cliquer **New bucket**
3. Créer le bucket **videos** :
   - **Name** : `videos`
   - **Public bucket** : ✅ Oui (pour que les Raspberry Pi puissent télécharger)
   - Cliquer **Create bucket**
4. Créer le bucket **software-updates** :
   - **Name** : `software-updates`
   - **Public bucket** : ✅ Oui
   - Cliquer **Create bucket**

### Étape 2.7 : Configurer les policies Storage

Pour chaque bucket, configurer les permissions :

1. Cliquer sur le bucket `videos`
2. Aller dans **Policies**
3. Cliquer **New Policy** → **For full customization**
4. Créer une policy **SELECT** (lecture publique) :
   ```sql
   -- Nom: Allow public read
   -- Operation: SELECT
   -- Policy definition:
   true
   ```
5. Créer une policy **INSERT** (upload authentifié) :
   ```sql
   -- Nom: Allow authenticated upload
   -- Operation: INSERT
   -- Policy definition:
   auth.role() = 'service_role'
   ```

Répéter pour le bucket `software-updates`.

> 📝 **À noter** - Variables obtenues :
> - `DATABASE_URL` = URI avec pooler (port 6543)
> - `SUPABASE_URL` = Project URL
> - `SUPABASE_SERVICE_KEY` = service_role key

---

## 3. Configuration Redis

### Option A : Upstash (Recommandé - Serverless)

#### Étape 3.1 : Créer un compte
1. Aller sur https://upstash.com
2. Cliquer **Sign Up**
3. Se connecter avec GitHub

#### Étape 3.2 : Créer une base Redis
1. Cliquer **Create Database**
2. Remplir :
   - **Name** : `neopro-redis`
   - **Type** : `Regional`
   - **Region** : `eu-west-1` (Ireland) ou Paris si disponible
   - **TLS** : ✅ Activé (recommandé)
3. Cliquer **Create**

#### Étape 3.3 : Récupérer l'URL de connexion
1. Dans le dashboard de la base créée
2. Section **Connect to your database**
3. Copier l'URL Redis (avec TLS) :
   ```
   rediss://default:xxxxx@eu1-xxxx.upstash.io:6379
   ```

> Note : `rediss://` (avec 's') = connexion TLS sécurisée

### Option B : Redis Cloud

1. Aller sur https://redis.com/try-free/
2. Créer un compte
3. Créer une base gratuite (30MB)
4. Copier l'URL de connexion

---

## 4. Configuration Render (Hébergement)

### Étape 4.1 : Créer un compte
1. Aller sur https://render.com
2. Cliquer **Get Started**
3. Se connecter avec GitHub (pour lier les repos)

### Étape 4.2 : Connecter le repository GitHub
1. Dans Render, aller dans **Account Settings**
2. Section **Git Providers**
3. Connecter votre compte GitHub
4. Autoriser l'accès au repo `neopro`

### Étape 4.3 : Créer le service Web
1. Cliquer **New +** → **Web Service**
2. Sélectionner le repo `neopro`
3. Configurer :

| Paramètre | Valeur |
|-----------|--------|
| **Name** | `neopro-central-server` |
| **Region** | `Frankfurt (EU Central)` |
| **Branch** | `main` |
| **Root Directory** | `central-server` |
| **Runtime** | `Node` |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm start` |
| **Instance Type** | `Free` ou `Starter` ($7/mois) |

### Étape 4.4 : Configurer les variables d'environnement
1. Dans le service créé, aller dans **Environment**
2. Cliquer **Add Environment Variable**
3. Ajouter TOUTES les variables (voir [section 13](#13-variables-denvironnement-complètes))
4. Cliquer **Save Changes**

### Étape 4.5 : Configurer le Health Check
1. Aller dans **Settings**
2. Section **Health Check Path** : `/health`
3. Sauvegarder

### Étape 4.6 : Récupérer l'URL
Après déploiement, Render fournit une URL :
```
https://neopro-central-server.onrender.com
```

> ⚠️ **Important** : Ajouter cette URL dans `ALLOWED_ORIGINS` si vous avez un frontend séparé.

---

## 5. Configuration Docker Hub

> ⚠️ **Optionnel** : Uniquement nécessaire si vous utilisez le CI/CD avec GitHub Actions pour publier des images Docker.

### Étape 5.1 : Créer un compte
1. Aller sur https://hub.docker.com
2. Cliquer **Sign Up**
3. Choisir un username (ex: `monentreprise`)

### Étape 5.2 : Créer un repository
1. Cliquer **Create Repository**
2. Remplir :
   - **Name** : `neopro-central-server`
   - **Visibility** : `Private` (recommandé)
3. Cliquer **Create**

### Étape 5.3 : Créer un Access Token
1. Cliquer sur votre profil → **Account Settings**
2. Aller dans **Security**
3. Cliquer **New Access Token**
4. Remplir :
   - **Description** : `GitHub Actions CI/CD`
   - **Permissions** : `Read & Write`
5. Cliquer **Generate**
6. **COPIER LE TOKEN** (il ne sera plus visible après)

---

## 6. Configuration GitHub Actions

### Étape 6.1 : Accéder aux secrets
1. Aller sur votre repo GitHub
2. Cliquer **Settings** (onglet)
3. Dans le menu gauche : **Secrets and variables** → **Actions**

### Étape 6.2 : Ajouter les secrets
Cliquer **New repository secret** pour chaque :

| Nom du secret | Valeur | Obligatoire |
|---------------|--------|-------------|
| `DATABASE_URL` | URL Supabase avec pooler | ✅ |
| `SUPABASE_URL` | Project URL Supabase | ✅ |
| `SUPABASE_SERVICE_KEY` | Service role key | ✅ |
| `REDIS_URL` | URL Upstash | ✅ |
| `JWT_SECRET` | 64 caractères aléatoires | ✅ |
| `MFA_ENCRYPTION_KEY` | 32 caractères aléatoires | ✅ |
| `DOCKER_USERNAME` | Username Docker Hub | Si Docker |
| `DOCKER_PASSWORD` | Token Docker Hub | Si Docker |
| `RENDER_API_KEY` | Clé API Render | Si auto-deploy |
| `SENDGRID_API_KEY` | Clé API SendGrid | Si emails |
| `SLACK_WEBHOOK_URL` | URL Webhook Slack | Si Slack |
| `LOGTAIL_TOKEN` | Token Logtail | Si logs |

### Étape 6.3 : Obtenir la clé API Render
1. Sur Render, aller dans **Account Settings**
2. Section **API Keys**
3. Cliquer **Create API Key**
4. Copier la clé générée

---

## 7. Configuration Email (Alertes)

> ⚠️ **Optionnel** : Pour recevoir des alertes par email.

### Option A : SendGrid (Recommandé)

#### Étape 7.1 : Créer un compte
1. Aller sur https://sendgrid.com
2. Cliquer **Start For Free**
3. Créer un compte

#### Étape 7.2 : Vérifier un expéditeur
1. Aller dans **Settings** → **Sender Authentication**
2. Cliquer **Verify a Single Sender**
3. Remplir avec votre email professionnel
4. Confirmer via l'email reçu

#### Étape 7.3 : Créer une clé API
1. Aller dans **Settings** → **API Keys**
2. Cliquer **Create API Key**
3. Remplir :
   - **Name** : `neopro-alerts`
   - **Permissions** : `Restricted Access` → activer **Mail Send**
4. **COPIER LA CLÉ** (commence par `SG.`)

### Option B : Gmail SMTP

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=votre.email@gmail.com
SMTP_PASSWORD=xxxx xxxx xxxx xxxx
```

Pour le mot de passe d'application :
1. https://myaccount.google.com/apppasswords
2. Sélectionner **Mail** → **Autre**
3. Copier le mot de passe généré

---

## 8. Configuration Slack (Notifications)

> ⚠️ **Optionnel** : Pour recevoir des alertes sur Slack.

### Étape 8.1 : Créer une App Slack
1. Aller sur https://api.slack.com/apps
2. Cliquer **Create New App** → **From scratch**
3. Remplir :
   - **App Name** : `NeoPro Alerts`
   - **Workspace** : Sélectionner votre workspace
4. Cliquer **Create App**

### Étape 8.2 : Activer les Webhooks
1. Menu gauche → **Incoming Webhooks**
2. Activer → `On`
3. Cliquer **Add New Webhook to Workspace**
4. Sélectionner le channel (ex: `#alerts-neopro`)
5. Copier l'URL :
   ```
   https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX
   ```

### Étape 8.3 : Tester
```bash
curl -X POST -H 'Content-type: application/json' \
  --data '{"text":"✅ Test NeoPro Alert!"}' \
  YOUR_WEBHOOK_URL
```

---

## 9. Configuration Monitoring

### Option A : UptimeRobot (Simple)

1. Créer un compte sur https://uptimerobot.com
2. **Add New Monitor** :
   - Type : `HTTP(s)`
   - URL : `https://votre-app.onrender.com/health`
   - Interval : `5 minutes`
3. Configurer les alertes (email/Slack)

### Option B : Grafana Cloud (Avancé)

1. Créer un compte sur https://grafana.com
2. Récupérer les credentials Prometheus
3. Configurer le remote write dans votre Prometheus

---

## 10. Configuration Logs centralisés (Logtail)

> ⚠️ **Optionnel mais recommandé** : Pour voir tous les logs dans une interface web.

### Étape 10.1 : Créer un compte
1. Aller sur https://betterstack.com/logtail
2. Cliquer **Start for free**
3. Se connecter avec GitHub

### Étape 10.2 : Créer une source
1. Cliquer **Connect source**
2. Choisir **Node.js**
3. Copier le **Source token** :
   ```
   xxxxxxxxxxxxxxxxxxx
   ```

### Étape 10.3 : Configurer dans NeoPro
Ajouter dans les variables d'environnement :
```env
LOGTAIL_TOKEN=votre_token_ici
```

Les logs apparaîtront automatiquement dans le dashboard Logtail.

---

## 11. Migrations Base de données

### Étape 11.1 : Se connecter à Supabase SQL Editor
1. Dans Supabase, aller dans **SQL Editor**
2. Cliquer **New Query**

### Étape 11.2 : Exécuter la migration MFA
Copier-coller et exécuter :

```sql
-- =============================================
-- Migration: Ajout du support MFA (Multi-Factor Authentication)
-- =============================================

-- Ajouter les colonnes MFA à la table users
ALTER TABLE users
ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS mfa_secret TEXT,
ADD COLUMN IF NOT EXISTS mfa_backup_codes TEXT[],
ADD COLUMN IF NOT EXISTS mfa_verified_at TIMESTAMP WITH TIME ZONE;

-- Index pour les requêtes MFA
CREATE INDEX IF NOT EXISTS idx_users_mfa_enabled
ON users(mfa_enabled)
WHERE mfa_enabled = TRUE;

-- Commentaires
COMMENT ON COLUMN users.mfa_enabled IS 'Indique si MFA est activé';
COMMENT ON COLUMN users.mfa_secret IS 'Secret TOTP chiffré';
COMMENT ON COLUMN users.mfa_backup_codes IS 'Codes de secours hachés';
COMMENT ON COLUMN users.mfa_verified_at IS 'Dernière vérification MFA';
```

### Étape 11.3 : Vérifier la migration
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'users'
AND column_name LIKE 'mfa%';
```

Résultat attendu : 4 colonnes (mfa_enabled, mfa_secret, mfa_backup_codes, mfa_verified_at)

---

## 12. Création du premier administrateur

### Étape 12.1 : Exécuter le script de création

En local ou via Render Shell :

```bash
cd central-server
npm run create-admin
```

Le script vous demandera :
- Email de l'admin
- Mot de passe (min 8 caractères)
- Nom complet

### Étape 12.2 : Alternative - Création manuelle via SQL

Dans Supabase SQL Editor :

```sql
-- Remplacer les valeurs entre <>
INSERT INTO users (email, password_hash, full_name, role, is_active)
VALUES (
  '<votre@email.com>',
  -- Hash bcrypt du mot de passe (générer sur https://bcrypt-generator.com/)
  '<$2a$10$...hash...>',
  '<Votre Nom>',
  'admin',
  true
);
```

---

## 13. Variables d'environnement complètes

### Toutes les variables

```env
# ================================================
# CONFIGURATION NEOPRO - PRODUCTION
# ================================================

# ----- Application -----
NODE_ENV=production
PORT=3001

# ----- Base de données (Supabase) -----
DATABASE_URL=postgresql://postgres:MOT_DE_PASSE@db.xxxxx.supabase.co:6543/postgres?pgbouncer=true

# ----- Supabase Storage (vidéos et mises à jour) -----
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ----- Redis (Upstash) -----
REDIS_URL=rediss://default:xxxxx@eu1-xxxx.upstash.io:6379

# ----- Authentification -----
JWT_SECRET=<64_caracteres_aleatoires>
JWT_EXPIRES_IN=7d

# ----- MFA -----
MFA_ISSUER=NeoPro
MFA_ENCRYPTION_KEY=<32_caracteres_aleatoires>

# ----- CORS (origines autorisées) -----
# Séparer par des virgules si plusieurs origines
ALLOWED_ORIGINS=https://votre-frontend.com,https://admin.votre-domaine.com

# ----- Email (SendGrid) - Optionnel -----
SENDGRID_API_KEY=SG.xxxxxxxxxxxx
EMAIL_FROM=noreply@votredomaine.com

# ----- Email (SMTP alternatif) - Optionnel -----
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=votre@email.com
# SMTP_PASSWORD=xxxx

# ----- Slack (Alertes) - Optionnel -----
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
ALERT_SLACK_CHANNEL=#alerts-neopro

# ----- Logs centralisés (Logtail) - Optionnel -----
LOGTAIL_TOKEN=xxxxxxxxxxxxx

# ----- Monitoring -----
METRICS_ENABLED=true

# ----- Compression vidéo - Optionnel -----
# Seuil en MB au-dessus duquel compresser (défaut: 100)
VIDEO_COMPRESSION_THRESHOLD_MB=100
```

### Générer les secrets

```bash
# JWT_SECRET (64 caractères)
openssl rand -base64 48

# MFA_ENCRYPTION_KEY (32 caractères)
openssl rand -base64 24
```

Ou utiliser : https://randomkeygen.com/

### Résumé des variables par service

| Variable | Service | Obligatoire |
|----------|---------|-------------|
| `DATABASE_URL` | Supabase | ✅ |
| `SUPABASE_URL` | Supabase | ✅ |
| `SUPABASE_SERVICE_KEY` | Supabase | ✅ |
| `REDIS_URL` | Upstash | ✅ |
| `JWT_SECRET` | Auth | ✅ |
| `JWT_EXPIRES_IN` | Auth | ✅ |
| `MFA_ISSUER` | MFA | ✅ |
| `MFA_ENCRYPTION_KEY` | MFA | ✅ |
| `ALLOWED_ORIGINS` | CORS | ⚠️ Si frontend |
| `SENDGRID_API_KEY` | Email | ⚠️ Optionnel |
| `SLACK_WEBHOOK_URL` | Slack | ⚠️ Optionnel |
| `LOGTAIL_TOKEN` | Logs | ⚠️ Optionnel |

---

## 14. Checklist finale

### ✅ Comptes créés
- [ ] Supabase (base de données + storage)
- [ ] Upstash (Redis)
- [ ] Render (hébergement)
- [ ] Docker Hub (si CI/CD)
- [ ] SendGrid (si emails)
- [ ] Slack App (si notifications)
- [ ] Logtail (si logs centralisés)
- [ ] UptimeRobot (si monitoring uptime)

### ✅ Configuration Supabase
- [ ] Projet créé
- [ ] `DATABASE_URL` copiée (avec pooler, port 6543)
- [ ] `SUPABASE_URL` copiée
- [ ] `SUPABASE_SERVICE_KEY` copiée
- [ ] Connection pooling activé
- [ ] Bucket `videos` créé + policies
- [ ] Bucket `software-updates` créé + policies
- [ ] Migration MFA exécutée

### ✅ Configuration Redis
- [ ] Base créée sur Upstash
- [ ] `REDIS_URL` copiée

### ✅ Configuration Render
- [ ] Repository GitHub connecté
- [ ] Service Web créé
- [ ] Toutes les variables d'environnement ajoutées
- [ ] Health check configuré (`/health`)
- [ ] Premier déploiement réussi ✅

### ✅ Configuration GitHub (si CI/CD)
- [ ] Tous les secrets ajoutés
- [ ] Workflow CI/CD passe ✅

### ✅ Configuration Alertes (optionnel)
- [ ] SendGrid : expéditeur vérifié + clé API
- [ ] Slack : Webhook créé et testé

### ✅ Application
- [ ] Premier admin créé
- [ ] Connexion fonctionne
- [ ] MFA peut être activé

### ✅ Tests de validation

```bash
# Health check
curl https://votre-app.onrender.com/health
# → {"status":"healthy",...}

# Documentation API
# Ouvrir: https://votre-app.onrender.com/api-docs

# Métriques Prometheus
curl https://votre-app.onrender.com/metrics
# → http_requests_total{...} ...

# Liveness (Kubernetes)
curl https://votre-app.onrender.com/live
# → {"status":"alive",...}

# Readiness (Kubernetes)
curl https://votre-app.onrender.com/ready
# → {"status":"ready",...}
```

---

## Aide et dépannage

### L'application ne démarre pas sur Render

1. Vérifier les logs : Render → votre service → **Logs**
2. Erreurs courantes :
   - `DATABASE_URL` manquante ou incorrecte
   - `SUPABASE_SERVICE_KEY` manquante
   - Port incorrect (doit être 3001 ou variable)

### Erreur de connexion à la base de données

1. Vérifier le mot de passe dans `DATABASE_URL`
2. Utiliser le port `6543` (pooler), PAS `5432`
3. Vérifier que `?pgbouncer=true` est présent
4. Tester la connexion :
   ```bash
   psql "postgresql://postgres:xxx@db.xxx.supabase.co:6543/postgres"
   ```

### Upload de vidéos échoue

1. Vérifier `SUPABASE_URL` et `SUPABASE_SERVICE_KEY`
2. Vérifier que les buckets existent
3. Vérifier les policies des buckets

### Redis ne se connecte pas

1. Vérifier `REDIS_URL` (doit commencer par `redis://` ou `rediss://`)
2. Tester :
   ```bash
   redis-cli -u "YOUR_REDIS_URL" ping
   ```

### Erreur CORS

1. Ajouter l'origine de votre frontend dans `ALLOWED_ORIGINS`
2. Format : `https://monsite.com` (pas de `/` à la fin)
3. Plusieurs origines : `https://site1.com,https://site2.com`

### Les emails ne partent pas

1. Vérifier que l'expéditeur est vérifié dans SendGrid
2. Vérifier que la clé API commence par `SG.`
3. Consulter les logs pour l'erreur exacte

---

## Ressources

| Service | Documentation |
|---------|--------------|
| Supabase | https://supabase.com/docs |
| Render | https://render.com/docs |
| Upstash | https://docs.upstash.com |
| SendGrid | https://docs.sendgrid.com |
| Logtail | https://betterstack.com/docs/logs |

---

*Version : 2.0*
*Dernière mise à jour : Décembre 2024*
