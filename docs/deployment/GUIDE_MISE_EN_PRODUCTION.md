# Guide de mise en production - NeoPro

Guide complet et détaillé pour déployer **le serveur central** NeoPro en production. Ce guide est conçu pour les débutants : chaque étape est expliquée en détail.

> 📖 **Note :** Ce guide couvre le déploiement sur **Render.com** (méthode alternative ou pour le serveur de démo).
>
> **Pour la production**, le serveur central (`central-server/`) est hébergé sur **Railway** (recommandé pour le plan Hobby à 5$/mois) :
>
> - Voir **[DEPLOY_CENTRAL_SERVER.md](DEPLOY_CENTRAL_SERVER.md)** pour le déploiement Railway (recommandé)
>
> **Résumé des hébergements :**
>
> | Composant         | Hébergement recommandé | Alternative |
> | ----------------- | ---------------------- | ----------- |
> | Central Server    | Railway (5$/mois)      | Render      |
> | Dashboard Angular | Hostinger (statique)   | Render      |
> | Base de données   | Supabase (gratuit)     | -           |
> | Stockage vidéos   | FTP Hostinger          | Supabase    |
>
> Pour l'installation des **boîtiers Raspberry Pi** dans les clubs, consultez :
>
> - **[Installation en ligne (RECOMMANDÉE)](../ONLINE_INSTALLATION.md)** - Setup remote complet (~22 min)
> - **[Configuration d'un nouveau club](../../raspberry/scripts/CLUB-SETUP-README.md)** - Remote vs Local
> - **[Installation complète Raspberry Pi](../guides/INSTALLATION_COMPLETE.md)** - 3 méthodes comparées

---

## Sommaire

1. [Introduction : Comprendre ce qu'on va faire](#1-introduction--comprendre-ce-quon-va-faire)
2. [Prérequis avant de commencer](#2-prérequis-avant-de-commencer)
3. [Partie 1 : Configurer Supabase (Base de données)](#3-partie-1--configurer-supabase-base-de-données)
4. [Partie 2 : Configurer Redis (Cache)](#4-partie-2--configurer-redis-cache)
5. [Partie 3 : Configurer Render (Hébergement)](#5-partie-3--configurer-render-hébergement)
6. [Partie 4 : Déployer le serveur API](#6-partie-4--déployer-le-serveur-api)
7. [Partie 5 : Déployer le dashboard](#7-partie-5--déployer-le-dashboard)
8. [Partie 6 : Initialiser la base de données](#8-partie-6--initialiser-la-base-de-données)
9. [Partie 7 : Créer le compte administrateur](#9-partie-7--créer-le-compte-administrateur)
10. [Partie 8 : Vérifier que tout fonctionne](#10-partie-8--vérifier-que-tout-fonctionne)
11. [Configurations optionnelles](#11-configurations-optionnelles)
12. [Dépannage](#12-dépannage)
13. [Glossaire](#13-glossaire)

---

## 1. Introduction : Comprendre ce qu'on va faire

### Qu'est-ce qu'on déploie ?

NeoPro est composé de plusieurs parties qui doivent fonctionner ensemble :

```
┌─────────────────────────────────────────────────────────────────────┐
│                        INTERNET (Cloud)                              │
│                                                                      │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│  │   SUPABASE      │    │     RENDER      │    │    UPSTASH      │ │
│  │                 │    │                 │    │                 │ │
│  │  Base de données│◄──►│  Serveur API    │◄──►│  Cache Redis    │ │
│  │  PostgreSQL     │    │  (central-server)│    │                 │ │
│  │                 │    │                 │    │                 │ │
│  │  + Stockage     │    │  Dashboard      │    │                 │ │
│  │  (vidéos)       │    │  (interface web)│    │                 │ │
│  └─────────────────┘    └────────┬────────┘    └─────────────────┘ │
│                                  │                                  │
└──────────────────────────────────┼──────────────────────────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────┐
                    │    Raspberry Pi         │
                    │    (dans les clubs)     │
                    │                         │
                    │  Se synchronise avec    │
                    │  le serveur central     │
                    └─────────────────────────┘
```

### Explication de chaque service

| Service      | C'est quoi ?                                                   | Pourquoi on en a besoin ?                                              | Coût                                                      |
| ------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------- |
| **Supabase** | Une base de données PostgreSQL hébergée + stockage de fichiers | Stocker les utilisateurs, les clubs, les configurations, et les vidéos | Gratuit (500 MB de données, 1 GB de fichiers)             |
| **Upstash**  | Un cache Redis hébergé                                         | Accélérer l'application et gérer les sessions en temps réel            | Gratuit (10 000 requêtes/jour)                            |
| **Render**   | Un hébergeur d'applications web                                | Faire tourner notre serveur API et notre interface web                 | Gratuit (avec mise en veille) ou 7$/mois (toujours actif) |

### Combien de temps ça prend ?

- **Première fois** : 1h30 à 2h (en suivant ce guide pas à pas)
- **Avec de l'expérience** : 30-45 minutes

### Ce dont vous aurez besoin

- Un ordinateur avec un navigateur web
- Une adresse email
- Un compte GitHub (gratuit)
- Le code source de NeoPro sur GitHub

---

## 2. Prérequis avant de commencer

### 2.1. Avoir un compte GitHub

GitHub est une plateforme qui héberge le code source. Tous les services qu'on va utiliser peuvent se connecter à GitHub.

**Si vous n'avez pas de compte GitHub :**

1. Aller sur https://github.com
2. Cliquer sur **Sign up** (en haut à droite)
3. Suivre les étapes :
   - Entrer votre email
   - Créer un mot de passe
   - Choisir un nom d'utilisateur
   - Résoudre le puzzle de vérification
   - Cliquer sur **Create account**
4. Vérifier votre email (GitHub envoie un code de confirmation)
5. Choisir le plan gratuit (**Free**) quand on vous le demande

### 2.2. Avoir accès au code NeoPro

Le code doit être dans votre compte GitHub. Deux options :

**Option A : Vous avez déjà accès au repo (recommandé)**

- Le propriétaire du repo vous a ajouté comme collaborateur
- Vous pouvez voir le code sur https://github.com/[organisation]/neopro

**Option B : Vous devez "forker" le repo**

1. Aller sur la page du repo NeoPro
2. Cliquer sur le bouton **Fork** (en haut à droite)
3. Cliquer sur **Create fork**
4. Le code est maintenant copié dans votre compte

### 2.3. Préparer un fichier pour noter vos informations

Pendant ce guide, vous allez collecter plusieurs informations importantes. Créez un fichier texte sur votre ordinateur (ou utilisez un gestionnaire de mots de passe) pour noter :

```
=== INFORMATIONS NEOPRO - À GARDER SECRET ===

Date de configuration : _______________

SUPABASE
--------
- Project URL :
- Database Password :
- DATABASE_URL (avec pooler) :
- SUPABASE_URL :
- SUPABASE_SERVICE_KEY :

UPSTASH (Redis)
---------------
- REDIS_URL :

RENDER
------
- URL du serveur API :
- URL du dashboard :

SECRETS GÉNÉRÉS
---------------
- JWT_SECRET :
- MFA_ENCRYPTION_KEY :

ADMIN
-----
- Email admin :
- Mot de passe admin :
```

**IMPORTANT : Ne partagez JAMAIS ce fichier. Ces informations permettent d'accéder à toute votre infrastructure.**

---

## 3. Partie 1 : Configurer Supabase (Base de données)

### C'est quoi Supabase ?

Supabase est un service qui fournit :

- **Une base de données PostgreSQL** : C'est là où seront stockées toutes les informations (utilisateurs, clubs, configurations...)
- **Un espace de stockage** : Pour stocker les vidéos et les fichiers
- **Une interface d'administration** : Pour voir et modifier les données facilement

**Pourquoi PostgreSQL ?** C'est une base de données très fiable, utilisée par des millions d'applications. Elle est gratuite et open-source.

### Étape 3.1 : Créer un compte Supabase

1. **Ouvrir Supabase**
   - Dans votre navigateur, aller sur : https://supabase.com
   - La page d'accueil de Supabase s'affiche

2. **Cliquer sur "Start your project"**
   - C'est un bouton vert en haut à droite de la page
   - Vous êtes redirigé vers la page de connexion

3. **Se connecter avec GitHub**
   - Cliquer sur le bouton **Continue with GitHub**
   - Une fenêtre s'ouvre demandant d'autoriser Supabase
   - Cliquer sur **Authorize supabase**
   - Vous êtes maintenant connecté à Supabase

4. **Vérifier que vous êtes connecté**
   - Vous devez voir le "Dashboard" de Supabase
   - Il affiche "Welcome to Supabase" ou la liste de vos projets (vide si c'est nouveau)

### Étape 3.2 : Créer un nouveau projet

Un "projet" Supabase = une base de données complète avec son stockage.

1. **Cliquer sur "New Project"**
   - Si c'est votre premier projet, le bouton est au centre de la page
   - Sinon, il est en haut à droite

2. **Sélectionner une organisation**
   - Si on vous demande de choisir une organisation, sélectionnez votre nom (Personal)
   - Ou cliquez sur "Create a new organization" si demandé :
     - Name : `MonEntreprise` (ou votre nom)
     - Type : `Personal`
     - Cliquer sur **Create organization**

3. **Remplir les informations du projet**

   | Champ                 | Que mettre                          | Explication                                                                                                                                                                        |
   | --------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | **Name**              | `neopro-production`                 | Le nom de votre projet. Choisissez quelque chose de reconnaissable.                                                                                                                |
   | **Database Password** | Cliquer sur **Generate a password** | Un mot de passe sera généré automatiquement. **TRÈS IMPORTANT : copiez ce mot de passe maintenant et collez-le dans votre fichier de notes.** Vous ne pourrez plus le voir après ! |
   | **Region**            | `West EU (Paris)`                   | Choisissez la région la plus proche de vos utilisateurs. Pour la France, choisir Paris ou Frankfurt.                                                                               |
   | **Pricing Plan**      | `Free`                              | Le plan gratuit suffit pour commencer.                                                                                                                                             |

4. **Créer le projet**
   - Vérifier que vous avez bien copié le mot de passe
   - Cliquer sur le bouton **Create new project**
   - Une barre de progression s'affiche
   - **Attendre 2-3 minutes** que le projet soit créé
   - Quand c'est prêt, vous voyez le dashboard du projet

### Étape 3.3 : Récupérer les informations de connexion à la base de données

Maintenant, on va récupérer les informations qui permettront à notre application de se connecter à la base de données.

1. **Aller dans les paramètres**
   - Dans le menu de gauche, cliquer sur l'icône **engrenage** ⚙️ (tout en bas)
   - Puis cliquer sur **Database** dans le sous-menu qui apparaît

2. **Trouver la section "Connection string"**
   - Faire défiler la page vers le bas
   - Vous verrez une section intitulée **Connection string**
   - Il y a plusieurs onglets : URI, JDBC, etc.

3. **Copier l'URI de connexion**
   - Cliquer sur l'onglet **URI**
   - Vous voyez une URL qui ressemble à :
     ```
     postgresql://postgres:[YOUR-PASSWORD]@db.abcdefghij.supabase.co:5432/postgres
     ```
   - Cliquer sur le bouton **Copy** à droite
   - **Cette URL n'est PAS celle qu'on va utiliser**, mais notez-la quand même

4. **Comprendre cette URL**
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.abcdefghij.supabase.co:5432/postgres
   │            │         │               │                        │    │
   │            │         │               │                        │    └─ Nom de la base
   │            │         │               │                        └─ Port (5432 = standard)
   │            │         │               └─ Adresse du serveur
   │            │         └─ Votre mot de passe (à remplacer !)
   │            └─ Nom d'utilisateur
   └─ Type de base de données
   ```

### Étape 3.4 : Activer et récupérer l'URL du Connection Pooler

**C'est quoi le Connection Pooler ?**

Quand une application se connecte à une base de données, elle ouvre une "connexion". Ouvrir et fermer des connexions prend du temps et des ressources. Le "Connection Pooler" (PgBouncer) maintient un groupe de connexions ouvertes et les partage entre les demandes. C'est beaucoup plus efficace.

**Pour les hébergeurs comme Render, le pooler est OBLIGATOIRE** car ils limitent le nombre de connexions.

1. **Trouver la section Connection Pooling**
   - Toujours sur la page Database (Settings > Database)
   - Faire défiler vers le bas jusqu'à voir **Connection Pooling**

2. **Vérifier que c'est activé**
   - Il y a un toggle (interrupteur)
   - Il doit être vert/activé (ON)
   - S'il est gris/désactivé, cliquer dessus pour l'activer

3. **Copier l'URL du pooler**
   - En dessous du toggle, il y a une autre section **Connection string**
   - Cliquer sur l'onglet **URI**
   - Copier cette URL. Elle ressemble à :
     ```
     postgresql://postgres.abcdefghij:[YOUR-PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true
     ```
   - **C'est cette URL qu'on va utiliser comme DATABASE_URL**

4. **Remplacer le mot de passe dans l'URL**
   - L'URL contient `[YOUR-PASSWORD]`
   - Remplacez cette partie par le vrai mot de passe que vous avez noté à l'étape 3.2
   - Exemple : si votre mot de passe est `MonSuperMotDePasse123!`, l'URL devient :
     ```
     postgresql://postgres.abcdefghij:MonSuperMotDePasse123!@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true
     ```

5. **Noter dans votre fichier**
   ```
   DATABASE_URL = postgresql://postgres.abcdefghij:MonSuperMotDePasse123!@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true
   ```

**IMPORTANT : Vérifiez ces points dans votre URL :**

- Le port est `6543` (PAS `5432`)
- L'URL se termine par `?pgbouncer=true`
- Le mot de passe est celui que vous avez noté (pas `[YOUR-PASSWORD]`)

### Étape 3.5 : Récupérer les clés API Supabase

L'application a besoin de clés spéciales pour communiquer avec Supabase.

1. **Aller dans les paramètres API**
   - Dans le menu de gauche, cliquer sur **Settings** (engrenage ⚙️)
   - Puis cliquer sur **API**

2. **Copier le Project URL**
   - En haut de la page, vous voyez **Project URL**
   - C'est une URL comme : `https://abcdefghij.supabase.co`
   - Cliquer sur **Copy**
   - **Noter dans votre fichier :**
     ```
     SUPABASE_URL = https://abcdefghij.supabase.co
     ```

3. **Copier la clé service_role**
   - Plus bas sur la page, vous voyez **Project API keys**
   - Il y a deux clés :
     - `anon` `public` : Pour les accès publics (on n'en a pas besoin)
     - `service_role` `secret` : Pour les accès administrateur (celle qu'on veut)
   - À côté de `service_role`, cliquer sur **Reveal** pour voir la clé
   - C'est une longue chaîne qui commence par `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
   - Cliquer sur **Copy**
   - **Noter dans votre fichier :**
     ```
     SUPABASE_SERVICE_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....(très long)
     ```

**⚠️ ATTENTION SÉCURITÉ :**

- La clé `service_role` donne un accès TOTAL à votre base de données
- Ne la mettez JAMAIS dans du code côté client (navigateur)
- Ne la partagez JAMAIS publiquement
- Si elle est compromise, vous pouvez la régénérer dans les paramètres

### Étape 3.6 : Créer les buckets de stockage

Les "buckets" sont des dossiers dans le cloud pour stocker des fichiers (comme les vidéos).

1. **Aller dans Storage**
   - Dans le menu de gauche, cliquer sur **Storage** (icône de dossier)

2. **Créer le bucket "videos"**
   - Cliquer sur **New bucket**
   - Une fenêtre popup s'ouvre
   - Remplir :
     - **Name** : `videos`
     - **Public bucket** : **Cocher la case** ✅
       - Cela permet aux Raspberry Pi de télécharger les vidéos sans authentification
   - Cliquer sur **Create bucket**

3. **Créer le bucket "software-updates"**
   - Cliquer à nouveau sur **New bucket**
   - Remplir :
     - **Name** : `software-updates`
     - **Public bucket** : **Cocher la case** ✅
   - Cliquer sur **Create bucket**

4. **Vérifier**
   - Vous devez maintenant voir deux buckets dans la liste :
     - `videos`
     - `software-updates`

### Étape 3.7 : Configurer les permissions des buckets

Par défaut, même les buckets "publics" ont des restrictions. On doit créer des "policies" (règles) pour autoriser les accès.

**Configurer le bucket "videos" :**

1. **Ouvrir le bucket**
   - Cliquer sur `videos` dans la liste

2. **Aller dans Policies**
   - Cliquer sur l'onglet **Policies** (en haut)

3. **Créer une policy de lecture publique**
   - Cliquer sur **New policy**
   - Choisir **For full customization** (en bas)
   - Remplir le formulaire :

     | Champ             | Valeur                        |
     | ----------------- | ----------------------------- |
     | Policy name       | `Lecture publique`            |
     | Allowed operation | Sélectionner **SELECT**       |
     | Target roles      | Laisser vide (tous les rôles) |

   - Dans le champ **Policy definition** (en bas), écrire simplement :

     ```sql
     true
     ```

     Cela signifie "autoriser tout le monde"

   - Cliquer sur **Review**
   - Vérifier que c'est correct, puis cliquer sur **Save policy**

4. **Créer une policy d'upload pour le serveur**
   - Cliquer à nouveau sur **New policy**
   - Choisir **For full customization**
   - Remplir :

     | Champ             | Valeur                  |
     | ----------------- | ----------------------- |
     | Policy name       | `Upload serveur`        |
     | Allowed operation | Sélectionner **INSERT** |
     | Target roles      | Laisser vide            |

   - Dans **Policy definition**, écrire :

     ```sql
     auth.role() = 'service_role'
     ```

     Cela signifie "seul le serveur (avec la clé service_role) peut uploader"

   - Cliquer sur **Review** puis **Save policy**

5. **Répéter pour le bucket "software-updates"**
   - Retourner à la liste des buckets
   - Cliquer sur `software-updates`
   - Créer les mêmes deux policies (lecture publique + upload serveur)

### Résumé de la Partie 1

À ce stade, vous devez avoir dans votre fichier de notes :

```
SUPABASE
--------
- Database Password : (votre mot de passe)
- DATABASE_URL : postgresql://postgres.xxxxx:MOTDEPASSE@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true
- SUPABASE_URL : https://xxxxx.supabase.co
- SUPABASE_SERVICE_KEY : eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Et dans Supabase :

- Un projet créé
- Connection pooling activé
- Deux buckets créés (videos, software-updates) avec leurs policies

---

## 4. Partie 2 : Configurer Redis (Cache)

### C'est quoi Redis ?

Redis est une base de données ultra-rapide qui stocke les données en mémoire (RAM). On l'utilise pour :

- **Mettre en cache** : Stocker temporairement des données fréquemment demandées pour ne pas interroger la base de données à chaque fois
- **Gérer les sessions** : Quand un utilisateur se connecte, sa session est stockée dans Redis
- **Communication en temps réel** : Pour synchroniser les données entre plusieurs serveurs

**Pourquoi Upstash ?**

- Service Redis gratuit et facile à utiliser
- Fonctionne en mode "serverless" (pas besoin de gérer un serveur)
- Connexion sécurisée par défaut

### Étape 4.1 : Créer un compte Upstash

1. **Ouvrir Upstash**
   - Aller sur https://upstash.com
   - La page d'accueil s'affiche

2. **S'inscrire**
   - Cliquer sur **Sign Up** (en haut à droite)
   - Choisir **Continue with GitHub**
   - Autoriser Upstash à accéder à votre compte GitHub
   - Vous êtes maintenant sur le dashboard Upstash

### Étape 4.2 : Créer une base de données Redis

1. **Créer une nouvelle base**
   - Sur le dashboard, cliquer sur **Create Database**
   - (Si vous voyez "Redis" et "Kafka", choisir **Redis**)

2. **Configurer la base**
   - Une fenêtre de configuration s'ouvre
   - Remplir :

     | Champ         | Valeur                | Explication                                                |
     | ------------- | --------------------- | ---------------------------------------------------------- |
     | **Name**      | `neopro-redis`        | Un nom pour reconnaître votre base                         |
     | **Type**      | `Regional`            | Une seule région (gratuit) vs Global (payant)              |
     | **Region**    | `eu-west-1` (Ireland) | La région la plus proche. Ireland est proche de la France. |
     | **TLS (SSL)** | **Cocher** ✅         | Connexion sécurisée (chiffrée). Toujours activer !         |

   - Cliquer sur **Create**

3. **Attendre la création**
   - La base est créée en quelques secondes
   - Vous êtes redirigé vers la page de détails de la base

### Étape 4.3 : Récupérer l'URL de connexion

1. **Trouver l'URL**
   - Sur la page de détails de votre base Redis
   - Chercher la section **Connect to your database**
   - Vous voyez plusieurs formats de connexion

2. **Copier l'URL Redis**
   - Chercher la ligne qui ressemble à :
     ```
     rediss://default:AbCdEf123456@eu1-caring-owl-12345.upstash.io:6379
     ```
   - Le `rediss://` (avec **deux s**) signifie connexion sécurisée TLS
   - Cliquer sur le bouton **Copy** à côté

3. **Noter dans votre fichier**
   ```
   REDIS_URL = rediss://default:AbCdEf123456@eu1-caring-owl-12345.upstash.io:6379
   ```

### Étape 4.4 : Comprendre le dashboard Upstash

Upstash fournit un dashboard utile pour surveiller votre Redis :

- **Data Browser** : Voir les données stockées
- **CLI** : Exécuter des commandes Redis directement
- **Metrics** : Voir l'utilisation (requêtes, mémoire...)

Pour l'instant, la base est vide. Elle se remplira quand l'application sera en route.

### Résumé de la Partie 2

Vous devez maintenant avoir :

```
UPSTASH (Redis)
---------------
- REDIS_URL : rediss://default:xxxxx@eu1-xxxxx.upstash.io:6379
```

---

## 5. Partie 3 : Configurer Render (Hébergement)

### C'est quoi Render ?

Render est un hébergeur web qui permet de déployer des applications. Il offre :

- **Web Services** : Pour faire tourner des serveurs (notre API)
- **Static Sites** : Pour héberger des sites web statiques (notre dashboard Angular)
- **Déploiement automatique** : À chaque fois que vous mettez à jour le code sur GitHub, Render redéploie automatiquement

**Pourquoi Render ?**

- Facile à utiliser
- Plan gratuit disponible
- Intégration GitHub native
- SSL gratuit (HTTPS)

### Étape 5.1 : Créer un compte Render

1. **Ouvrir Render**
   - Aller sur https://render.com

2. **S'inscrire**
   - Cliquer sur **Get Started** ou **Sign Up**
   - Choisir **GitHub**
   - Autoriser Render à accéder à votre compte GitHub
   - Vous êtes sur le dashboard Render

### Étape 5.2 : Connecter le repository GitHub

Render doit avoir accès au code source de NeoPro.

1. **Accéder aux paramètres Git**
   - Cliquer sur votre avatar (en haut à droite)
   - Cliquer sur **Account Settings**
   - Dans le menu de gauche, cliquer sur **Git Providers**

2. **Connecter GitHub (si pas déjà fait)**
   - Vous devez voir "GitHub" avec un statut
   - Si c'est "Connected" : c'est bon
   - Si c'est "Connect" : cliquer dessus

3. **Configurer les permissions**
   - GitHub va vous demander quels repositories Render peut voir
   - Deux options :
     - **All repositories** : Render voit tous vos repos (simple mais moins sécurisé)
     - **Only select repositories** : Choisir spécifiquement (recommandé)
   - Si vous choisissez "Only select repositories" :
     - Cliquer sur **Select repositories**
     - Chercher et sélectionner `neopro`
   - Cliquer sur **Install & Authorize**

4. **Vérifier**
   - Retourner sur le dashboard Render
   - Vous devez pouvoir voir le repository `neopro` quand vous créez un nouveau service

### Étape 5.3 : Générer les secrets de sécurité

Avant de créer les services, on doit générer des clés secrètes pour la sécurité.

**C'est quoi ces secrets ?**

- **JWT_SECRET** : Clé pour signer les "tokens" d'authentification. Quand un utilisateur se connecte, on lui donne un token signé avec cette clé. Ça permet de vérifier que le token est authentique.
- **MFA_ENCRYPTION_KEY** : Clé pour chiffrer les secrets MFA (authentification à deux facteurs).

**Comment les générer ?**

**Option A : Avec un terminal (Mac/Linux)**

Ouvrir le Terminal et taper :

```bash
# Générer JWT_SECRET (64 caractères)
openssl rand -base64 48
```

Résultat exemple : `K7mN9pR2sT6vX0yB4dG7hJ1lO3qU5wE8zC2fA6iL9nM4oP7rS0tV3xY6bK8mN2`

```bash
# Générer MFA_ENCRYPTION_KEY (32 caractères)
openssl rand -base64 24
```

Résultat exemple : `X7kL9mN2pQ4rS6tU8vW0xY3zA5bC7dE9`

**Option B : Avec un site web**

1. Aller sur https://randomkeygen.com/
2. Faire défiler jusqu'à **CodeIgniter Encryption Keys**
3. Copier une clé pour JWT_SECRET
4. Copier une autre clé pour MFA_ENCRYPTION_KEY

**Option C : Avec PowerShell (Windows)**

```powershell
# JWT_SECRET
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])

# MFA_ENCRYPTION_KEY
[Convert]::ToBase64String((1..24 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
```

**Noter dans votre fichier :**

```
SECRETS GÉNÉRÉS
---------------
- JWT_SECRET : K7mN9pR2sT6vX0yB4dG7hJ1lO3qU5wE8zC2fA6iL9nM4oP7rS0tV3xY6bK8mN2
- MFA_ENCRYPTION_KEY : X7kL9mN2pQ4rS6tU8vW0xY3zA5bC7dE9
```

---

## 6. Partie 4 : Déployer le serveur API

Le serveur API est le "cerveau" de NeoPro. Il :

- Reçoit les requêtes des clients (dashboard, Raspberry Pi)
- Communique avec la base de données
- Gère l'authentification
- Envoie des notifications en temps réel

### Étape 6.1 : Créer un nouveau Web Service

1. **Aller sur le dashboard Render**
   - https://dashboard.render.com

2. **Créer un nouveau service**
   - Cliquer sur le bouton **New +** (en haut à droite)
   - Sélectionner **Web Service**

3. **Choisir la source**
   - Sélectionner **Build and deploy from a Git repository**
   - Cliquer sur **Next**

4. **Sélectionner le repository**
   - Vous voyez la liste de vos repositories GitHub
   - Trouver `neopro`
   - Cliquer sur **Connect** à côté

### Étape 6.2 : Configurer le service

Un formulaire de configuration s'affiche. Remplissez **exactement** comme suit :

| Champ              | Valeur                         | Explication                             |
| ------------------ | ------------------------------ | --------------------------------------- |
| **Name**           | `neopro-central-server`        | Nom du service. Sera dans l'URL.        |
| **Region**         | `Frankfurt (EU Central)`       | Serveur en Europe, proche de la France  |
| **Branch**         | `main`                         | La branche Git à déployer               |
| **Root Directory** | `central-server`               | Le dossier contenant le code du serveur |
| **Runtime**        | `Node`                         | Le langage de programmation utilisé     |
| **Build Command**  | `npm install && npm run build` | Commandes pour construire l'application |
| **Start Command**  | `npm start`                    | Commande pour démarrer l'application    |

**Détails importants :**

- **Root Directory** : C'est crucial ! Le code du serveur est dans le sous-dossier `central-server`, pas à la racine du repo.
- **Build Command** : `npm install` télécharge les dépendances, `npm run build` compile le code TypeScript en JavaScript.

### Étape 6.3 : Choisir le plan

Faire défiler jusqu'à **Instance Type** :

| Plan        | Prix    | Caractéristiques                                                           | Recommandation  |
| ----------- | ------- | -------------------------------------------------------------------------- | --------------- |
| **Free**    | 0$      | Mise en veille après 15 min d'inactivité. Redémarre lentement (30-60 sec). | Pour tester     |
| **Starter** | 7$/mois | Toujours actif. Réponse rapide.                                            | Pour production |

**Note sur le plan Free :**

- Si personne n'utilise l'application pendant 15 minutes, Render "endort" le serveur
- La prochaine requête prendra 30-60 secondes le temps que le serveur se réveille
- C'est acceptable pour tester, mais pas idéal pour une utilisation réelle

Sélectionner le plan souhaité.

### Étape 6.4 : Ajouter les variables d'environnement

C'est la partie la plus importante ! Les variables d'environnement sont les paramètres de configuration de l'application.

1. **Faire défiler jusqu'à "Environment Variables"**

2. **Cliquer sur "Add Environment Variable" pour chaque variable**

3. **Ajouter les variables suivantes :**

**Variables obligatoires (TOUTES requises) :**

| Key (Nom)              | Value (Valeur)                    | Explication                                                       |
| ---------------------- | --------------------------------- | ----------------------------------------------------------------- |
| `NODE_ENV`             | `production`                      | Indique que c'est un environnement de production                  |
| `PORT`                 | `3001`                            | Port sur lequel le serveur écoute                                 |
| `DATABASE_URL`         | `postgresql://postgres.xxxxx:...` | URL de connexion Supabase (avec pooler) - copier depuis vos notes |
| `SUPABASE_URL`         | `https://xxxxx.supabase.co`       | URL du projet Supabase - copier depuis vos notes                  |
| `SUPABASE_SERVICE_KEY` | `eyJhbGci...`                     | Clé service_role Supabase - copier depuis vos notes               |
| `REDIS_URL`            | `rediss://default:...`            | URL de connexion Redis - copier depuis vos notes                  |
| `JWT_SECRET`           | `K7mN9pR2...`                     | Clé secrète pour les tokens - votre clé générée                   |
| `JWT_EXPIRES_IN`       | `7d`                              | Durée de validité des tokens (7 jours)                            |
| `MFA_ISSUER`           | `NeoPro`                          | Nom affiché dans les apps d'authentification                      |
| `MFA_ENCRYPTION_KEY`   | `X7kL9mN2...`                     | Clé de chiffrement MFA - votre clé générée                        |

**Pour ajouter chaque variable :**

- Cliquer sur **Add Environment Variable**
- Dans "Key", taper le nom (ex: `NODE_ENV`)
- Dans "Value", taper la valeur (ex: `production`)
- Répéter pour chaque variable

**Vérification :**

- Vous devez avoir **10 variables** au total
- Vérifiez qu'il n'y a pas d'espaces en début ou fin de valeur
- Vérifiez que DATABASE_URL contient bien votre mot de passe (pas `[YOUR-PASSWORD]`)

### Étape 6.5 : Configurer le Health Check

Le "Health Check" permet à Render de vérifier que votre application fonctionne.

1. **Faire défiler jusqu'à "Advanced"**
2. **Cliquer pour développer la section**
3. **Trouver "Health Check Path"**
4. **Entrer :** `/health`

Cela signifie que Render va régulièrement appeler `https://votre-app/health` pour vérifier que le serveur répond.

### Étape 6.6 : Créer le service

1. **Vérifier une dernière fois**
   - Toutes les variables sont remplies ?
   - Le Root Directory est bien `central-server` ?
   - Le Health Check est `/health` ?

2. **Cliquer sur "Create Web Service"**

3. **Attendre le déploiement**
   - Render va :
     1. Cloner le code depuis GitHub
     2. Installer les dépendances (`npm install`)
     3. Compiler le code (`npm run build`)
     4. Démarrer le serveur (`npm start`)
   - Vous voyez les logs en temps réel
   - Ça prend environ **3-5 minutes**

4. **Vérifier le statut**
   - En haut de la page, vous voyez le statut
   - Il passe par : `Building` → `Deploying` → `Live`
   - Quand c'est **Live** (avec un point vert), c'est bon !

### Étape 6.7 : Noter l'URL du serveur

Une fois déployé :

1. **Trouver l'URL**
   - En haut de la page, sous le nom du service
   - URL comme : `https://neopro-central-production.up.railway.app`

2. **Noter dans votre fichier**
   ```
   RENDER
   ------
   - URL du serveur API : https://neopro-central-production.up.railway.app
   ```

### Étape 6.8 : Tester le serveur

1. **Ouvrir l'URL de health check**
   - Dans votre navigateur, aller sur :

   ```
   https://neopro-central-production.up.railway.app/health
   ```

2. **Vérifier la réponse**
   - Vous devez voir quelque chose comme :

   ```json
   {
     "status": "healthy",
     "timestamp": "2024-12-14T10:30:00.000Z",
     "version": "1.0.0"
   }
   ```

   - Si vous voyez ça, **le serveur fonctionne !** 🎉

3. **Si ça ne fonctionne pas**
   - Retourner sur Render
   - Cliquer sur **Logs** dans le menu de gauche
   - Chercher les erreurs (en rouge)
   - Voir la section [Dépannage](#12-dépannage)

---

## 7. Partie 5 : Déployer le dashboard

Le dashboard est l'interface web d'administration. C'est une application Angular qui tourne dans le navigateur.

### Différence avec le serveur

- **Serveur (Web Service)** : Code qui s'exécute sur le serveur Render
- **Dashboard (Static Site)** : Fichiers HTML/CSS/JS envoyés au navigateur du visiteur

Pour un "Static Site", Render :

1. Compile l'application Angular
2. Génère des fichiers statiques (HTML, CSS, JS)
3. Les sert via un CDN rapide

### Étape 7.1 : Créer un nouveau Static Site

1. **Sur le dashboard Render**
   - Cliquer sur **New +**
   - Sélectionner **Static Site**

2. **Sélectionner le repository**
   - Choisir `neopro`
   - Cliquer sur **Connect**

### Étape 7.2 : Configurer le site

| Champ                 | Valeur                              | Explication                            |
| --------------------- | ----------------------------------- | -------------------------------------- |
| **Name**              | `neopro-dashboard`                  | Nom du site                            |
| **Branch**            | `main`                              | Branche à déployer                     |
| **Root Directory**    | `central-dashboard`                 | Dossier contenant le code du dashboard |
| **Build Command**     | `npm install && npm run build:prod` | Compiler l'application Angular         |
| **Publish Directory** | `dist/central-dashboard`            | Dossier où Angular génère les fichiers |

**Important :**

- Le **Publish Directory** doit correspondre au dossier de sortie d'Angular
- C'est généralement `dist/nom-du-projet`

### Étape 7.3 : Ajouter la variable d'environnement

Le dashboard doit savoir où se trouve le serveur API.

1. **Faire défiler jusqu'à "Environment Variables"**
2. **Ajouter une variable :**

| Key              | Value                                              |
| ---------------- | -------------------------------------------------- |
| `NG_APP_API_URL` | `https://neopro-central-production.up.railway.app` |

(Remplacer par l'URL de votre serveur, notée à l'étape 6.7)

### Étape 7.4 : Configurer la redirection SPA

Angular est une "Single Page Application" (SPA). Toutes les routes sont gérées côté client. On doit configurer Render pour rediriger toutes les requêtes vers `index.html`.

1. **Faire défiler jusqu'à "Redirects/Rewrites"**
2. **Cliquer sur "Add Rule"**
3. **Configurer :**
   - **Source** : `/*`
   - **Destination** : `/index.html`
   - **Action** : Sélectionner `Rewrite`

**Pourquoi c'est nécessaire ?**

- Sans ça, si quelqu'un va directement sur `/sites` ou `/dashboard`, Render cherche un fichier `sites.html` qui n'existe pas
- Avec la règle, Render renvoie `index.html` et Angular gère la route

### Étape 7.5 : Créer le site

1. **Cliquer sur "Create Static Site"**
2. **Attendre le déploiement** (2-3 minutes)
3. **Vérifier que le statut est "Live"**

### Étape 7.6 : Noter l'URL du dashboard

1. **Copier l'URL** affichée en haut (ex: `https://neopro-admin.kalonpartners.bzh`)
2. **Noter dans votre fichier**
   ```
   - URL du dashboard : https://neopro-admin.kalonpartners.bzh
   ```

### Étape 7.7 : Configurer CORS sur le serveur

Le serveur doit autoriser les requêtes venant du dashboard. C'est le "CORS" (Cross-Origin Resource Sharing).

1. **Retourner sur le service `neopro-central-server`**
   - Dashboard Render → cliquer sur `neopro-central-server`

2. **Aller dans Environment**
   - Menu de gauche → **Environment**

3. **Ajouter une variable**
   - Cliquer sur **Add Environment Variable**

   | Key               | Value                                    |
   | ----------------- | ---------------------------------------- |
   | `ALLOWED_ORIGINS` | `https://neopro-admin.kalonpartners.bzh` |

4. **Sauvegarder**
   - Cliquer sur **Save Changes**
   - Le serveur va redémarrer automatiquement (30 secondes environ)

### Étape 7.8 : Tester le dashboard

1. **Ouvrir l'URL du dashboard** dans votre navigateur
2. **Vous devez voir la page de login**
   - Si vous voyez une page de connexion, c'est bon !
   - Si vous voyez une page blanche ou une erreur, voir [Dépannage](#12-dépannage)

**Note :** Vous ne pouvez pas encore vous connecter car il n'y a pas d'utilisateur dans la base de données.

---

## 8. Partie 6 : Initialiser la base de données

La base de données est vide. On doit créer les tables (structure) pour stocker les données.

### Étape 8.1 : Accéder à l'éditeur SQL Supabase

1. **Aller sur Supabase**
   - https://supabase.com
   - Cliquer sur votre projet `neopro-production`

2. **Ouvrir l'éditeur SQL**
   - Dans le menu de gauche, cliquer sur **SQL Editor** (icône de terminal)

3. **Créer une nouvelle requête**
   - Cliquer sur **New query**
   - Un éditeur de texte s'ouvre

### Étape 8.2 : Exécuter le script d'initialisation

Le script de création des tables est dans le code source.

1. **Trouver le fichier**
   - Sur GitHub, aller dans : `central-server/src/scripts/init-db.sql`
   - Ou sur votre ordinateur si vous avez le code

2. **Copier tout le contenu du fichier**

3. **Coller dans l'éditeur SQL Supabase**

4. **Exécuter**
   - Cliquer sur le bouton **Run** (ou appuyer sur Ctrl+Enter / Cmd+Enter)
   - Attendre que l'exécution se termine
   - Vous devez voir "Success" en bas

### Étape 8.3 : Exécuter le script des tables analytics

1. **Créer une nouvelle requête**
   - Cliquer sur **New query** ou sur le **+**

2. **Copier le contenu de** `central-server/src/scripts/analytics-tables.sql`

3. **Coller et exécuter**
   - Cliquer sur **Run**
   - Vérifier "Success"

### Étape 8.4 : Exécuter la migration MFA

1. **Nouvelle requête**

2. **Coller ce code :**

```sql
-- =============================================
-- Migration: Support MFA (Multi-Factor Authentication)
-- =============================================

-- Ajouter les colonnes MFA à la table users
ALTER TABLE users
ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS mfa_secret TEXT,
ADD COLUMN IF NOT EXISTS mfa_backup_codes TEXT[],
ADD COLUMN IF NOT EXISTS mfa_verified_at TIMESTAMP WITH TIME ZONE;

-- Créer un index pour les requêtes sur mfa_enabled
CREATE INDEX IF NOT EXISTS idx_users_mfa_enabled
ON users(mfa_enabled)
WHERE mfa_enabled = TRUE;

-- Ajouter des commentaires explicatifs
COMMENT ON COLUMN users.mfa_enabled IS 'Indique si MFA est activé pour cet utilisateur';
COMMENT ON COLUMN users.mfa_secret IS 'Secret TOTP chiffré pour générer les codes';
COMMENT ON COLUMN users.mfa_backup_codes IS 'Codes de secours hachés';
COMMENT ON COLUMN users.mfa_verified_at IS 'Date de dernière vérification MFA réussie';
```

3. **Exécuter**

### Étape 8.5 : Vérifier que les tables existent

1. **Nouvelle requête**

2. **Coller :**

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

3. **Exécuter**

4. **Vérifier le résultat**
   - Vous devez voir une liste de tables, dont :
     - `users`
     - `sites`
     - `groups`
     - `analytics`
     - etc.

### Alternative : Utiliser l'interface Table Editor

Supabase a aussi une interface visuelle :

1. **Cliquer sur "Table Editor"** dans le menu de gauche
2. **Vous voyez toutes les tables** créées
3. **Cliquer sur une table** pour voir sa structure et son contenu

---

## 9. Partie 7 : Créer le compte administrateur

Il faut créer un premier utilisateur administrateur pour pouvoir se connecter au dashboard.

### Option A : Via le Shell Render (Recommandé)

Render permet d'accéder à un terminal sur votre serveur.

1. **Aller sur le service `neopro-central-server`**
   - Dashboard Render → cliquer sur le service

2. **Ouvrir le Shell**
   - Dans le menu de gauche, cliquer sur **Shell**
   - Attendre que la connexion s'établisse (10-20 secondes)
   - Vous voyez un terminal

3. **Exécuter le script de création**

   ```bash
   npm run create-admin
   ```

4. **Répondre aux questions**
   - **Email** : Entrer votre adresse email
   - **Password** : Entrer un mot de passe (minimum 8 caractères)
   - **Full name** : Entrer votre nom complet

5. **Noter les identifiants**
   ```
   ADMIN
   -----
   - Email admin : votre@email.com
   - Mot de passe admin : **********
   ```

### Option B : Via SQL (si le Shell ne fonctionne pas)

Si le plan Free met le serveur en veille ou si le Shell ne répond pas :

1. **Générer un hash du mot de passe**
   - Aller sur https://bcrypt-generator.com/
   - Dans "Plain Text", entrer votre mot de passe souhaité
   - Sélectionner **12 rounds**
   - Cliquer sur **Generate**
   - Copier le résultat (commence par `$2a$12$` ou `$2b$12$`)

2. **Dans Supabase SQL Editor, nouvelle requête**

3. **Coller ce code** (en remplaçant les valeurs) :

```sql
INSERT INTO users (
  email,
  password_hash,
  full_name,
  role,
  is_active,
  created_at,
  updated_at
)
VALUES (
  'votre@email.com',                    -- Remplacer par votre email
  '$2a$12$xxxxxxxxxxxxxxxxxxxxx',       -- Remplacer par le hash généré
  'Votre Nom Complet',                  -- Remplacer par votre nom
  'admin',                              -- Rôle admin
  true,                                 -- Compte actif
  NOW(),
  NOW()
);
```

4. **Exécuter**

5. **Vérifier**

```sql
SELECT id, email, full_name, role, is_active FROM users;
```

Vous devez voir votre utilisateur.

---

## 10. Partie 8 : Vérifier que tout fonctionne

### Test 1 : Health Check du serveur

1. Ouvrir : `https://neopro-central-production.up.railway.app/health`
2. **Attendu :**
   ```json
   { "status": "healthy", "timestamp": "...", "version": "1.0.0" }
   ```
3. **Si erreur :** Voir les logs Render du serveur

### Test 2 : Documentation API

1. Ouvrir : `https://neopro-central-production.up.railway.app/api-docs`
2. **Attendu :** Page Swagger avec la liste des endpoints
3. **Si page blanche :** Le serveur n'a peut-être pas démarré correctement

### Test 3 : Connexion au dashboard

1. Ouvrir : `https://neopro-admin.kalonpartners.bzh`
2. **Attendu :** Page de login
3. Entrer vos identifiants admin
4. Cliquer sur **Se connecter**
5. **Attendu :** Vous êtes redirigé vers le dashboard

### Test 4 : Vérifier la base de données

1. Dans Supabase, aller dans **Table Editor**
2. Cliquer sur la table `users`
3. **Attendu :** Vous voyez votre utilisateur admin

### Checklist finale

- [ ] Health check retourne "healthy"
- [ ] Documentation API accessible (/api-docs)
- [ ] Dashboard affiche la page de login
- [ ] Connexion avec l'admin fonctionne
- [ ] Dashboard affiche les données (même vides)
- [ ] Pas d'erreurs dans les logs Render

**Si tout est coché : Félicitations ! NeoPro est en production ! 🎉**

---

## 11. Configurations optionnelles

Ces configurations ne sont pas obligatoires mais améliorent l'expérience.

### 11.1. Alertes par email avec SendGrid

SendGrid permet d'envoyer des emails (alertes, notifications...).

**Créer un compte :**

1. Aller sur https://sendgrid.com
2. Cliquer sur **Start For Free**
3. Créer un compte

**Vérifier un expéditeur :**

1. Settings → Sender Authentication
2. Verify a Single Sender
3. Entrer votre email professionnel
4. Confirmer via l'email reçu

**Créer une clé API :**

1. Settings → API Keys
2. Create API Key
3. Nom : `neopro-production`
4. Permissions : Restricted Access → activer **Mail Send**
5. Copier la clé (commence par `SG.`)

**Ajouter sur Render :**

- `SENDGRID_API_KEY` = `SG.xxxx...`
- `EMAIL_FROM` = `noreply@votredomaine.com`

### 11.2. Notifications Slack

**Créer une App Slack :**

1. https://api.slack.com/apps
2. Create New App → From scratch
3. Nom : `NeoPro Alerts`
4. Workspace : votre workspace

**Configurer le Webhook :**

1. Incoming Webhooks → activer
2. Add New Webhook to Workspace
3. Choisir un channel (ex: `#alerts-neopro`)
4. Copier l'URL du webhook

**Tester :**

```bash
curl -X POST -H 'Content-type: application/json' \
  --data '{"text":"Test NeoPro!"}' \
  https://hooks.slack.com/services/xxx/yyy/zzz
```

**Ajouter sur Render :**

- `SLACK_WEBHOOK_URL` = `https://hooks.slack.com/services/...`

### 11.3. Logs centralisés avec Logtail

Logtail permet de voir tous vos logs dans une interface web.

1. https://betterstack.com/logtail
2. Start for free (connexion GitHub)
3. Connect source → Node.js
4. Copier le token

**Ajouter sur Render :**

- `LOGTAIL_TOKEN` = `votre_token`

### 11.4. Monitoring avec UptimeRobot

UptimeRobot vérifie que votre site est en ligne et vous alerte en cas de problème.

1. https://uptimerobot.com
2. Créer un compte gratuit
3. Add New Monitor :
   - Type : HTTP(s)
   - URL : `https://neopro-central-production.up.railway.app/health`
   - Interval : 5 minutes
4. Configurer les alertes (email, Slack...)

---

## 12. Dépannage

### Le serveur ne démarre pas

**Symptômes :** Statut "Deploy failed" ou "Crashed"

**Solutions :**

1. **Vérifier les logs :**
   - Render → votre service → Logs
   - Chercher les lignes en rouge

2. **Erreurs courantes :**
   - `DATABASE_URL is required` : Variable manquante
   - `Connection refused` : URL de base de données incorrecte
   - `Invalid JWT secret` : JWT_SECRET trop court ou manquant

3. **Vérifier les variables :**
   - Toutes les 10 variables sont présentes ?
   - Pas d'espace en début/fin de valeur ?
   - DATABASE_URL a le bon mot de passe ?

### Erreur de connexion à la base de données

**Symptômes :** `Connection refused`, `Connection timeout`, `ECONNREFUSED`

**Solutions :**

1. Vérifier que DATABASE_URL utilise le port `6543` (pas `5432`)
2. Vérifier que `?pgbouncer=true` est à la fin de l'URL
3. Vérifier que le mot de passe est correct

**Test de l'URL :**

- L'URL doit ressembler à :

```
postgresql://postgres.xxxxx:VOTRE_MOT_DE_PASSE@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

### Le dashboard affiche une page blanche

**Symptômes :** Page blanche, erreur dans la console

**Solutions :**

1. Ouvrir les DevTools (F12) → Console
2. Chercher les erreurs
3. Vérifications :
   - `NG_APP_API_URL` est correct ?
   - La règle de rewrite `/* → /index.html` existe ?
   - Le serveur API est accessible ?

### Erreur CORS

**Symptômes :** Message `Access-Control-Allow-Origin` dans la console

**Solutions :**

1. Sur Render, service API
2. Vérifier `ALLOWED_ORIGINS`
3. Format correct : `https://neopro-admin.kalonpartners.bzh` (pas de `/` à la fin)
4. Plusieurs origines : `https://site1.com,https://site2.com`

### Redis ne se connecte pas

**Symptômes :** `Redis connection error`

**Solutions :**

1. Vérifier que REDIS_URL commence par `redis://` ou `rediss://`
2. Vérifier le token dans l'URL

### Le login ne fonctionne pas

**Symptômes :** "Invalid credentials" malgré les bons identifiants

**Solutions :**

1. Vérifier que l'utilisateur existe :
   ```sql
   SELECT * FROM users WHERE email = 'votre@email.com';
   ```
2. Vérifier que le compte est actif (`is_active = true`)
3. Vérifier que le rôle est `admin`

---

## 13. Glossaire

| Terme                        | Définition                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| **API**                      | Interface de programmation. C'est comment les applications communiquent entre elles. |
| **Backend**                  | La partie serveur d'une application. Gère la logique métier et la base de données.   |
| **Base de données**          | Système pour stocker des données de manière organisée.                               |
| **Bucket**                   | Un "dossier" dans le cloud pour stocker des fichiers.                                |
| **Cache**                    | Stockage temporaire pour accélérer les accès aux données fréquentes.                 |
| **CDN**                      | Content Delivery Network. Réseau de serveurs qui distribuent le contenu rapidement.  |
| **CORS**                     | Cross-Origin Resource Sharing. Mécanisme de sécurité des navigateurs.                |
| **Dashboard**                | Interface d'administration visuelle.                                                 |
| **Déploiement**              | Mettre une application en ligne pour qu'elle soit accessible.                        |
| **Frontend**                 | La partie visible d'une application (interface utilisateur).                         |
| **Health Check**             | Vérification automatique que l'application fonctionne.                               |
| **JWT**                      | JSON Web Token. Méthode d'authentification sécurisée.                                |
| **MFA**                      | Multi-Factor Authentication. Double authentification (mot de passe + code).          |
| **Policy**                   | Règle de sécurité qui définit qui peut accéder à quoi.                               |
| **Pooler**                   | Gestionnaire de connexions à la base de données.                                     |
| **PostgreSQL**               | Système de base de données relationnelle, gratuit et open-source.                    |
| **Redis**                    | Base de données ultra-rapide stockant les données en mémoire.                        |
| **Repository (Repo)**        | Projet contenant du code source sur GitHub.                                          |
| **Serverless**               | Architecture où le serveur est géré automatiquement.                                 |
| **SPA**                      | Single Page Application. Application web qui ne recharge pas la page.                |
| **SSL/TLS**                  | Protocole de sécurité pour chiffrer les communications.                              |
| **Static Site**              | Site web composé de fichiers fixes (HTML, CSS, JS).                                  |
| **Token**                    | Jeton d'authentification. Preuve que l'utilisateur est connecté.                     |
| **Variable d'environnement** | Paramètre de configuration externe au code.                                          |
| **Web Service**              | Application serveur qui tourne en permanence.                                        |
| **Webhook**                  | URL qui reçoit des notifications automatiques.                                       |

---

## Récapitulatif des URLs

| Service            | URL                                                       |
| ------------------ | --------------------------------------------------------- |
| Supabase Dashboard | https://supabase.com/dashboard                            |
| Upstash Dashboard  | https://console.upstash.com                               |
| Render Dashboard   | https://dashboard.render.com                              |
| Votre API          | https://neopro-central-production.up.railway.app          |
| Votre Dashboard    | https://neopro-admin.kalonpartners.bzh                    |
| Health Check       | https://neopro-central-production.up.railway.app/health   |
| Documentation API  | https://neopro-central-production.up.railway.app/api-docs |

---

## Besoin d'aide ?

1. **Relire ce guide** : La solution est souvent dans les détails
2. **Vérifier les logs** : Render et Supabase affichent des messages d'erreur
3. **Consulter la documentation** :
   - Supabase : https://supabase.com/docs
   - Render : https://render.com/docs
   - Upstash : https://docs.upstash.com

---

**Version :** 4.1
**Dernière mise à jour :** Janvier 2026
