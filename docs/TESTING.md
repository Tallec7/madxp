# Guide de Test Neopro

Ce document décrit comment tester le système Neopro de manière exhaustive avant chaque release ou déploiement commercial.

## Table des matières

1. [Tests Automatisés](#tests-automatisés)
2. [Tests Manuels](#tests-manuels)
3. [Tests avec Raspberry Pi](#tests-avec-raspberry-pi)
4. [Tests E2E Playwright](#tests-e2e-playwright)
5. [Checklist Pré-Production](#checklist-pré-production)
6. [Troubleshooting](#troubleshooting)

---

## Tests Automatisés

### Script de Test Rapide (Recommandé)

Le script `quick-test.js` est le moyen le plus rapide de valider le système :

```bash
# Tests rapides (~2 min) - environnement, config, sécurité, build, lint
npm run test:quick

# Tests complets (~5 min) - inclut les tests unitaires Jest (830+ tests)
npm run test:full

# Avec tests E2E Playwright (nécessite dashboard lancé)
npm run test:quick -- --e2e

# Avec test du Raspberry Pi
npm run test:quick -- --pi-host 192.168.1.50

# Toutes les options
npm run test:quick -- --api-url http://localhost:3001 --pi-host neopro.local --full --e2e
```

**Options disponibles :**

| Option           | Description                                             |
| ---------------- | ------------------------------------------------------- |
| `--api-url URL`  | URL de l'API centrale (défaut: `http://localhost:3001`) |
| `--pi-host HOST` | Hostname/IP du Pi (défaut: `neopro.local`)              |
| `--skip-api`     | Ignorer les tests API                                   |
| `--skip-pi`      | Ignorer les tests Pi                                    |
| `--full`         | Inclure les tests unitaires Jest                        |
| `--e2e`          | Inclure les tests E2E Playwright                        |

### Script Bash Alternatif

Le script `test-full-system.sh` est une alternative bash :

```bash
./scripts/test-full-system.sh --api-url https://api.neopro.fr --pi-host 192.168.1.50
```

### Tests Unitaires Seuls

```bash
# Backend (Jest)
cd central-server && npm test

# Avec couverture
cd central-server && npm test -- --coverage

# Un fichier spécifique
cd central-server && npm test -- --testPathPattern="auth.controller"

# Frontend Raspberry (Karma)
npm run test:raspberry

# Frontend Dashboard (Karma)
npm run test:central
```

### Lint

```bash
npm run lint
```

---

## Tests Manuels

### Checklist Interactive

Le script `test-manual-checklist.sh` guide à travers tous les tests manuels avec génération automatique d'un rapport.

```bash
./scripts/test-manual-checklist.sh
```

Le script couvre :

- Authentification (login, logout, protection des routes)
- Gestion des sites (CRUD, API keys)
- Gestion du contenu (upload, liste, suppression)
- Déploiement (vers site, vers groupe)
- Raspberry Pi (connexion, TV, télécommande)
- Analytics (graphiques, export)
- Gestion des utilisateurs
- Portail annonceurs

Un rapport Markdown est généré dans `/tmp/neopro-test-report-*.md`.

### Tests Manuels Rapides

Si vous n'avez pas le temps pour la checklist complète :

#### 1. Vérification API (2 min)

```bash
# Health check
curl http://localhost:3001/health

# Auth protection
curl http://localhost:3001/api/auth/me
# Doit retourner 401
```

#### 2. Login (1 min)

- Ouvrir le dashboard
- Se connecter avec super_admin
- Vérifier l'accès au menu complet

#### 3. Upload vidéo (3 min)

- Uploader une petite vidéo (< 10MB)
- Vérifier qu'elle apparaît dans la liste
- Vérifier la thumbnail

#### 4. Déploiement (5 min)

- Déployer la vidéo vers un site
- Vérifier la progression
- Confirmer la réception sur le Pi

---

## Tests avec Raspberry Pi

### Prérequis

1. Pi allumé et connecté au réseau
2. Services Neopro démarrés sur le Pi
3. API centrale accessible depuis le Pi

### Vérification de la connexion

```bash
# Depuis votre machine
ping neopro.local

# SSH
ssh pi@neopro.local

# Sur le Pi - vérifier les services
sudo systemctl status neopro-app
sudo systemctl status neopro-sync
```

### Diagnostic complet du Pi

```bash
ssh pi@neopro.local 'cd /home/pi/neopro && ./scripts/diagnose-pi.sh'
```

### Tests de l'interface TV

1. Ouvrir `http://neopro.local` dans un navigateur
2. Vérifier l'affichage (logo, vidéos)
3. Tester la télécommande (mode remote)

### Tests de synchronisation

1. Modifier la configuration dans le dashboard
2. Vérifier que le Pi reçoit la mise à jour
3. Logs : `ssh pi@neopro.local 'sudo journalctl -u neopro-sync -f'`

---

## Tests E2E Playwright

Les tests E2E valident les parcours utilisateur complets dans le navigateur.

### Setup

```bash
# Installation des dépendances
cd e2e && npm install

# Installation des navigateurs
npx playwright install
```

### Exécution

```bash
# Prérequis: lancer le dashboard
npm run start:central  # Terminal 1

# Lancer les tests E2E
cd e2e && npm test     # Terminal 2

# Mode interactif (UI)
cd e2e && npm run test:ui

# Mode debug
cd e2e && npm run test:debug

# Voir le rapport HTML
cd e2e && npm run test:report
```

### Tests disponibles

| Suite                      | Tests                                         |
| -------------------------- | --------------------------------------------- |
| `auth.spec.ts`             | Login, logout, MFA, protection des routes     |
| `sites.spec.ts`            | Liste des sites, filtrage, détails, commandes |
| `video-deployment.spec.ts` | Upload, liste, déploiement, progression       |

### Configuration

Fichier `e2e/playwright.config.ts` :

- Base URL: `http://localhost:4200` (configurable via `BASE_URL`)
- Navigateurs: Chromium, Firefox, WebKit, Mobile Chrome
- Screenshots/Videos: capturés en cas d'échec

---

## Checklist Pré-Production

Avant chaque déploiement en production :

### Sécurité

- [ ] `npm audit` ne montre aucune vulnérabilité haute
- [ ] JWT_SECRET fait au moins 32 caractères
- [ ] Pas de secrets dans le code (git grep)
- [ ] CORS correctement configuré
- [ ] Rate limiting activé

### Code

- [ ] Tous les tests passent (`npm test`)
- [ ] Lint passe (`npm run lint`)
- [ ] Build réussit (`npm run build`)
- [ ] Pas de `console.log` en production

### Base de données

- [ ] Migrations à jour (`npm run db:migrate`)
- [ ] Backup récent disponible
- [ ] Indexes en place

### Configuration

- [ ] Variables d'environnement configurées
- [ ] FTP ou Supabase accessible
- [ ] SMTP configuré pour les emails

### Fonctionnel

- [ ] Login/Logout fonctionne
- [ ] Upload vidéo fonctionne
- [ ] Déploiement vers Pi fonctionne
- [ ] Analytics affiche des données
- [ ] Emails sont envoyés

### Raspberry Pi

- [ ] Au moins un Pi de test connecté
- [ ] Déploiement vidéo reçu
- [ ] Lecture vidéo fonctionnelle

---

## Troubleshooting

### L'API ne répond pas

```bash
# Vérifier que le serveur tourne
cd central-server && npm run dev

# Vérifier le port
lsof -i :3001

# Logs
tail -f logs/error.log
```

### Le Pi ne se connecte pas

```bash
# Vérifier la connectivité
ping neopro.local

# SSH et logs
ssh pi@neopro.local
sudo journalctl -u neopro-app -f

# Vérifier l'API key
cat /home/pi/neopro/.env | grep API_KEY
```

### Tests unitaires échouent

```bash
# Voir les détails
cd central-server && npm test -- --verbose

# Un seul test
npm test -- --testPathPattern="nom-du-fichier" --verbose
```

### Upload vidéo échoue

1. Vérifier la configuration FTP dans `.env`
2. Tester la connexion FTP manuellement
3. Vérifier l'espace disque
4. Logs : `grep "upload" logs/error.log`

### Déploiement bloqué

```sql
-- Voir les déploiements en cours
SELECT id, status, progress, error_message
FROM content_deployments
WHERE status = 'in_progress';

-- Reset si bloqué > 1h
UPDATE content_deployments
SET status = 'failed', error_message = 'Timeout - reset manuel'
WHERE status = 'in_progress'
AND started_at < NOW() - INTERVAL '1 hour';
```

---

## Fréquence des Tests

| Situation               | Tests recommandés                                    |
| ----------------------- | ---------------------------------------------------- |
| Développement quotidien | Tests unitaires du fichier modifié                   |
| Avant commit            | `npm run lint && npm test`                           |
| Avant PR                | `./scripts/test-full-system.sh --skip-pi`            |
| Avant release           | `./scripts/test-full-system.sh` + checklist manuelle |
| Problème en prod        | Diagnostic Pi + logs serveur                         |

---

## Dashboard de Test

Un tableau de bord web permet de gérer les tests automatisés et manuels.

### Lancement

```bash
npm run test:dashboard
# Ouvrir http://localhost:3333
```

### Pages

| Page             | Description                                     |
| ---------------- | ----------------------------------------------- |
| **Dashboard**    | Stats, lancer tests, voir échecs, console       |
| **Checklist**    | 47 tests manuels organisés par rôle utilisateur |
| **Bugs & Notes** | Documenter les problèmes rencontrés             |
| **Historique**   | Sessions de test précédentes                    |

### Tests Manuels par Rôle (47 tests)

La checklist couvre tous les parcours utilisateur critiques :

| Rôle                | Tests | Fonctionnalités                                      |
| ------------------- | ----- | ---------------------------------------------------- |
| **Super Admin**     | 9     | Login, CRUD users, sites, groupes, MFA, audit        |
| **Operator**        | 10    | Sites assignés, upload, déploiement, commandes Pi    |
| **Advertiser**      | 6     | Vidéos pub, stats impressions, export PDF            |
| **Analytics**       | 5     | Dashboard, graphiques, carte, export CSV             |
| **Raspberry Pi**    | 7     | Interface TV, télécommande, sync, heartbeat          |
| **Auth & Sécurité** | 6     | Logout, routes protégées, password reset, rate limit |

### Couverture

Le dashboard affiche une barre de couverture combinant :

- **Tests automatiques** : résultats du dernier `npm run test:quick` ou `test:full`
- **Tests manuels** : cases cochées dans la checklist (persistées en localStorage)

### Export Rapport

Le bouton "Exporter Rapport" génère un fichier Markdown contenant :

- Date du rapport
- Résultats des tests automatiques (passés/échoués/ignorés)
- État de chaque test manuel par rôle

### Données

Les sessions et bugs sont stockés dans `scripts/test-dashboard/test-data.json`.

---

## Contacts

En cas de problème critique en production :

- Voir les logs dans Better Stack (Logtail)
- Consulter `/docs/TROUBLESHOOTING.md`
- Ouvrir une issue GitHub si besoin
