# Guide Utilisateur NEOPRO

## Bienvenue

Ce guide vous accompagne dans l'utilisation quotidienne de la plateforme NEOPRO pour gérer vos écrans publicitaires dans les clubs sportifs.

---

## Table des matières

### Partie 1 : Guide Club (Utilisation locale)

1. [Premier démarrage](#1-premier-démarrage)
2. [Connexion locale](#2-connexion-locale)
3. [Guide jour de match](#3-guide-jour-de-match)
4. [Télécommande web](#4-télécommande-web)
5. [Interface admin locale](#5-interface-admin-locale)
6. [Dépannage rapide](#6-dépannage-rapide)

### Partie 2 : Guide Dashboard (Gestionnaires)

7. [Connexion au dashboard](#7-connexion-au-dashboard)
8. [Tableau de bord](#8-tableau-de-bord)
9. [Gestion des sites](#9-gestion-des-sites)
10. [Gestion des vidéos](#10-gestion-des-vidéos)
11. [Déploiement de contenu](#11-déploiement-de-contenu)
12. [Groupes de sites](#12-groupes-de-sites)
13. [Alertes et notifications](#13-alertes-et-notifications)
14. [Sécurité du compte](#14-sécurité-du-compte)
15. [FAQ](#15-faq)

---

# PARTIE 1 : GUIDE CLUB (Utilisation locale)

Cette partie s'adresse aux responsables de clubs qui utilisent le système NEOPRO sur place.

---

## 1. Premier démarrage

### Installation physique

Votre système NEOPRO se compose d'un boîtier (Raspberry Pi) connecté à votre écran TV.

```
┌─────────────────────────────────────────────────────────────┐
│                    VOTRE INSTALLATION                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   📱 Votre smartphone          📺 Votre écran TV             │
│        │                              │                      │
│        │ WiFi NEOPRO                  │ HDMI                 │
│        │                              │                      │
│        └──────────► 📦 Boîtier NEOPRO ◄────┘                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Étapes de mise en route

1. **Connectez le boîtier** à votre écran TV via le câble HDMI fourni
2. **Branchez l'alimentation** du boîtier sur une prise électrique
3. **Allumez votre TV** et sélectionnez la source HDMI correspondante

### Démarrage automatique

Le boîtier démarre automatiquement :

1. Logo NEOPRO pendant le chargement (~30 secondes)
2. Page d'accueil avec le nom de votre club
3. Vos vidéos commencent à défiler automatiquement

> 💡 Le boîtier démarre automatiquement dès qu'il est alimenté. Pas besoin de bouton ON/OFF !

### Vérification de bon fonctionnement

Vous devriez voir :

- ✅ Le logo ou nom de votre club
- ✅ Les vidéos de vos sponsors en boucle
- ✅ Une qualité d'image nette

---

## 2. Connexion locale

### Se connecter au WiFi NEOPRO

Pour contrôler votre système, connectez-vous au réseau WiFi créé par le boîtier :

1. **Ouvrez les paramètres WiFi** de votre smartphone ou tablette
2. **Recherchez le réseau** `NEOPRO-[NOM-DE-VOTRE-CLUB]`
   - Exemple : `NEOPRO-FCNANTES` ou `NEOPRO-STADE-RENNAIS`
3. **Connectez-vous** (mot de passe fourni lors de l'installation)
4. **Attendez** que la connexion soit établie

> ⚠️ **Note** : Une fois connecté au WiFi NEOPRO, vous n'aurez plus accès à Internet. C'est normal ! Le réseau NEOPRO est dédié au contrôle de votre système.

### Accéder à la télécommande

Une fois connecté au WiFi NEOPRO :

1. **Ouvrez votre navigateur** (Safari, Chrome, Firefox...)
2. **Tapez l'adresse** : `http://192.168.4.1`
3. **Page de connexion** : Entrez le mot de passe fourni lors de l'installation
4. **La télécommande s'affiche** après authentification

### Page de connexion

La page de connexion affiche :

- Le logo **neopro.**
- Un champ de mot de passe avec placeholder "Mot de passe"
- Le nom de votre club et sport en bas (ex: "NTES - Handball")

```
┌────────────────────────────────────────┐
│                                        │
│              neopro.                   │
│                                        │
│   ┌────────────────────────────────┐   │
│   │  Mot de passe                  │   │
│   └────────────────────────────────┘   │
│                                        │
│   ┌────────────────────────────────┐   │
│   │        Se connecter            │   │
│   └────────────────────────────────┘   │
│                                        │
│          NTES - Handball               │
│                                        │
└────────────────────────────────────────┘
```

> 💡 **Premier démarrage** : Si aucun mot de passe n'est configuré, vous serez invité à en créer un. Un indicateur de force (Faible/Moyen/Fort) vous guide.

### Créer un raccourci rapide

#### Sur iPhone (Safari) :

1. Ouvrez la page dans Safari
2. Appuyez sur l'icône de partage (carré avec flèche)
3. Sélectionnez "Sur l'écran d'accueil"
4. Nommez le raccourci "NEOPRO"

#### Sur Android (Chrome) :

1. Ouvrez la page dans Chrome
2. Appuyez sur les 3 points en haut à droite
3. Sélectionnez "Ajouter à l'écran d'accueil"
4. Nommez le raccourci "NEOPRO"

---

## 3. Guide jour de match

Le jour de match est le moment idéal pour profiter pleinement de votre système NEOPRO !

### Checklist avant le match (30 min avant)

```
□ Boîtier alimenté (LED verte allumée)
□ TV allumée sur la bonne source HDMI
□ Vidéos qui défilent correctement
□ Smartphone connecté au WiFi NEOPRO-[CLUB]
□ Télécommande accessible sur http://192.168.4.1
```

### Préparation

1. **Vérifiez le système**
   - Le boîtier est alimenté (LED verte)
   - L'écran TV affiche les vidéos

2. **Connectez-vous à la télécommande**
   - WiFi : `NEOPRO-[VOTRE-CLUB]`
   - Adresse : `http://192.168.4.1`

3. **Sélectionnez la playlist**
   - Choisissez "Sponsors" pour les vidéos partenaires
   - Ou "Animations" pour le contenu événementiel

### Pendant le match

| Moment                         | Action recommandée                   |
| ------------------------------ | ------------------------------------ |
| **Avant l'entrée des équipes** | Animations d'ambiance                |
| **Pendant le match**           | Logo du club ou sponsors             |
| **Mi-temps**                   | Vidéos sponsors (audience maximale!) |
| **Après le match**             | Sponsors pendant la sortie du public |

### Actions rapides télécommande

| Action           | Bouton       |
| ---------------- | ------------ |
| Pause vidéo      | ⏸️ Pause     |
| Reprendre        | ▶️ Play      |
| Vidéo suivante   | ⏭️ Suivant   |
| Vidéo précédente | ⏮️ Précédent |
| Afficher le logo | 🏠 Accueil   |

### Après le match

- Laissez défiler les vidéos sponsors pendant que le public quitte
- Vous pouvez éteindre la TV quand le stade est vide
- Le boîtier peut rester allumé (faible consommation ~5W)

---

## 4. Télécommande web

La télécommande web est votre interface principale pour contrôler le système NEOPRO.

### Écran principal

```
┌────────────────────────────────────────┐
│         NEOPRO - [Votre Club]          │
├────────────────────────────────────────┤
│                                        │
│   ┌────────────────────────────────┐   │
│   │                                │   │
│   │      Aperçu vidéo en cours     │   │
│   │                                │   │
│   └────────────────────────────────┘   │
│                                        │
│      ⏮️    ⏸️/▶️    ⏭️               │
│                                        │
│   Volume: ████████░░ 80%              │
│                                        │
├────────────────────────────────────────┤
│   📋 Playlist: Sponsors                │
│   📺 Vidéos: 12                        │
│   🔄 Mode: Boucle automatique         │
└────────────────────────────────────────┘
```

### Contrôles de lecture

| Icône | Action    | Description                           |
| ----- | --------- | ------------------------------------- |
| ▶️    | Play      | Lance la lecture                      |
| ⏸️    | Pause     | Met en pause                          |
| ⏭️    | Suivant   | Passe à la vidéo suivante             |
| ⏮️    | Précédent | Revient à la vidéo précédente         |
| 🔄    | Boucle    | Active/désactive la lecture en boucle |
| 🔀    | Aléatoire | Lecture aléatoire                     |

### Sélection de playlist

1. Appuyez sur **📋 Playlists** dans le menu
2. Choisissez parmi :
   - **Sponsors** : Vidéos de vos partenaires
   - **Animations** : Contenus événementiels
   - **Tout** : Toutes les vidéos disponibles
3. La playlist se charge automatiquement

### Réglages

- **Volume** : Glissez le curseur ou utilisez +/-
- **Mode veille** : Éteint l'affichage temporairement
- **Plein écran** : Force l'affichage plein écran

---

## 5. Interface admin locale

L'interface d'administration permet de gérer les paramètres avancés.

### Accès

1. Connectez-vous au WiFi NEOPRO
2. Accédez à `http://192.168.4.1/admin`
3. Entrez vos identifiants (fournis lors de l'installation)

> 🔐 **Identifiants** : Fournis par votre installateur NEOPRO

### Tableau de bord admin

```
┌────────────────────────────────────────────────────────────┐
│  ADMINISTRATION - [Votre Club]                    [Déco]   │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  📊 Statut système                                         │
│  ├─ État: ● En ligne                                      │
│  ├─ Dernière sync: il y a 2 heures                        │
│  ├─ Vidéos: 15 fichiers (2.3 GB)                          │
│  └─ Espace disque: 45% utilisé                            │
│                                                            │
│  ⚙️ Actions                                                │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│  │ 🔄 Sync      │ │ 🔃 Redémarrer │ │ 📋 Logs      │       │
│  └──────────────┘ └──────────────┘ └──────────────┘       │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Actions disponibles

| Action            | Description                                       |
| ----------------- | ------------------------------------------------- |
| **🔄 Sync**       | Force une synchronisation avec le serveur central |
| **🔃 Redémarrer** | Redémarre le système (~60 secondes)               |
| **📋 Logs**       | Consulte l'historique d'activité                  |

### Informations système

- **État connexion** : En ligne / Hors ligne
- **Dernière synchronisation** : Date de la dernière mise à jour
- **Espace disque** : Stockage utilisé/disponible
- **Version** : Version du logiciel installé

---

## 6. Dépannage rapide

### L'écran reste noir

**Vérifications :**

1. ✅ Le boîtier est-il alimenté ? (LED verte allumée)
2. ✅ Le câble HDMI est-il bien branché ?
3. ✅ La TV est-elle sur la bonne source HDMI ?

**Solution :**

- Débranchez et rebranchez l'alimentation du boîtier
- Attendez 60 secondes le redémarrage

### Impossible de se connecter au WiFi NEOPRO

**Vérifications :**

1. ✅ Êtes-vous à moins de 20 mètres du boîtier ?
2. ✅ Le réseau `NEOPRO-[CLUB]` apparaît-il ?
3. ✅ Moins de 5 appareils déjà connectés ?

**Solution :**

- Rapprochez-vous du boîtier
- Déconnectez d'autres appareils si nécessaire
- Redémarrez le WiFi de votre smartphone

### La télécommande ne charge pas

**Vérifications :**

1. ✅ Êtes-vous connecté au WiFi NEOPRO ?
2. ✅ L'adresse est-elle `http://192.168.4.1` (pas https) ?

**Solution :**

- Vérifiez que vous n'êtes plus sur votre WiFi habituel
- Tapez l'adresse complète avec `http://`

### Les vidéos ne défilent pas

**Cause possible :** Synchronisation en cours

**Solution :**

1. Accédez à l'admin (`http://192.168.4.1/admin`)
2. Vérifiez l'espace disque
3. Lancez une synchronisation manuelle

### Pas de son

**Vérifications :**

1. ✅ Volume TV monté ?
2. ✅ TV pas en mode muet ?
3. ✅ Volume télécommande NEOPRO activé ?

**Solution :**

- Augmentez le volume sur la télécommande NEOPRO
- Vérifiez les paramètres audio TV (sortie HDMI)

### Contacter le support

Si le problème persiste :

📧 **Email** : support@neopro.fr
📞 **Téléphone** : 01 XX XX XX XX

**Informations à fournir :**

- Nom de votre club
- Description du problème
- Actions déjà tentées

---

# PARTIE 2 : GUIDE DASHBOARD (Gestionnaires)

Cette partie s'adresse aux gestionnaires NEOPRO utilisant le dashboard central.

---

## 7. Connexion au dashboard

### Première connexion

1. Ouvrez votre navigateur et accédez à l'adresse de la plateforme
2. Entrez votre **email** et **mot de passe** fournis par l'administrateur
3. Cliquez sur **Se connecter**

### Authentification à deux facteurs (MFA)

Si votre compte a l'authentification à deux facteurs activée :

1. Après avoir entré vos identifiants, un code à 6 chiffres vous sera demandé
2. Ouvrez votre application d'authentification (Google Authenticator, Authy, etc.)
3. Entrez le code affiché
4. Le code change toutes les 30 secondes

**En cas de perte de votre téléphone**, utilisez l'un de vos codes de secours (conservez-les précieusement).

---

## 8. Tableau de bord

Le tableau de bord vous offre une vue d'ensemble de votre parc d'écrans.

### Vue d'ensemble

- **Sites en ligne** : Nombre d'écrans actuellement connectés
- **Sites hors ligne** : Écrans non connectés (vérifiez leur état)
- **Déploiements en cours** : Vidéos en cours de transfert
- **Alertes actives** : Problèmes nécessitant votre attention

### Carte des sites

La carte interactive affiche tous vos sites géographiquement :

- **Point vert** : Site en ligne
- **Point rouge** : Site hors ligne
- **Point orange** : Site en maintenance

Cliquez sur un point pour voir les détails du site.

---

## 9. Gestion des sites

### Liste des sites

La page **Sites** affiche tous vos écrans avec :

- Nom du site et club
- Statut de connexion
- Dernière activité
- Version logicielle

### Filtrer les sites

Utilisez les filtres pour trouver rapidement un site :

- **Par statut** : En ligne, Hors ligne, Maintenance
- **Par sport** : Football, Tennis, Natation, etc.
- **Par région** : Filtrez par zone géographique
- **Recherche** : Tapez le nom du site ou du club

### Détails d'un site

Cliquez sur un site pour voir :

1. **Informations générales**
   - Nom et localisation
   - Sport(s) associé(s)
   - Modèle de matériel

2. **Métriques en temps réel**
   - Température du processeur
   - Utilisation mémoire/disque
   - Temps de fonctionnement

3. **Historique des configurations**
   - Versions précédentes
   - Date des modifications

### Actions disponibles

- **Redémarrer** : Relance l'écran (utile en cas de problème)
- **Mode maintenance** : Désactive temporairement les alertes
- **Voir les logs** : Consulter l'historique des événements

---

## 10. Gestion des vidéos

### Bibliothèque vidéo

La section **Vidéos** contient tout votre contenu publicitaire.

### Ajouter une vidéo

1. Cliquez sur **+ Nouvelle vidéo**
2. Glissez-déposez votre fichier ou cliquez pour parcourir
3. Remplissez les informations :
   - **Titre** : Nom affiché (ex: "Pub Nike Été 2024")
   - **Catégorie** : Type de contenu (Sponsor, Club, Événement)
   - **Sous-catégorie** : Précision optionnelle
4. Cliquez sur **Uploader**

### Formats acceptés

- **Formats** : MP4, MOV, AVI
- **Taille max** : 2 Go (compressé automatiquement si > 100 Mo)
- **Résolution recommandée** : 1920x1080 (Full HD)

### Organisation

- Utilisez les **catégories** pour organiser vos vidéos
- Ajoutez des **tags** pour faciliter la recherche
- Les **miniatures** sont générées automatiquement

---

## 11. Déploiement de contenu

### Déployer une vidéo

1. Depuis la bibliothèque, sélectionnez la vidéo
2. Cliquez sur **Déployer**
3. Choisissez la cible :
   - **Site unique** : Un écran spécifique
   - **Groupe** : Plusieurs sites (ex: tous les clubs de tennis)
4. Confirmez le déploiement

### Suivi du déploiement

- **En attente** : La vidéo est en file d'attente
- **En cours** : Transfert vers les sites
- **Terminé** : Vidéo disponible sur les écrans
- **Échoué** : Un problème est survenu (voir les détails)

### Déploiement progressif (Canary)

Pour les déploiements importants, utilisez le mode **Canary** :

1. Sélectionnez **Déploiement progressif**
2. Configurez :
   - **Pourcentage canary** : Sites test (défaut: 10%)
   - **Seuil de succès** : Minimum requis pour continuer (défaut: 95%)
3. Le système déploie d'abord sur quelques sites
4. Si tout va bien, le reste est déployé automatiquement
5. En cas de problème, **rollback automatique**

---

## 12. Groupes de sites

### Créer un groupe

Les groupes permettent de cibler plusieurs sites facilement :

1. Allez dans **Groupes**
2. Cliquez sur **+ Nouveau groupe**
3. Choisissez le type :
   - **Sport** : Tous les clubs d'un sport
   - **Géographie** : Une région ou ville
   - **Personnalisé** : Sélection manuelle
4. Donnez un nom et description
5. Ajoutez les sites membres

### Utiliser les groupes

- **Déploiements groupés** : Envoyez une vidéo à tout un groupe
- **Statistiques agrégées** : Vue d'ensemble du groupe
- **Maintenance groupée** : Actions sur plusieurs sites

---

## 13. Alertes et notifications

### Types d'alertes

| Icône | Type          | Description              |
| ----- | ------------- | ------------------------ |
| 🔴    | Critique      | Action immédiate requise |
| 🟠    | Avertissement | Attention recommandée    |
| 🔵    | Information   | Pour votre information   |

### Alertes courantes

- **Site hors ligne** : L'écran n'est plus connecté
- **Température élevée** : Le Raspberry Pi surchauffe
- **Disque presque plein** : Espace de stockage insuffisant
- **Échec de déploiement** : Le transfert a échoué

### Gérer les alertes

1. Cliquez sur l'alerte pour voir les détails
2. Choisissez une action :
   - **Acquitter** : Vous avez pris connaissance
   - **Résoudre** : Le problème est réglé
   - **Reporter** : Revoir plus tard

### Configurer les notifications

Dans **Paramètres > Notifications** :

- Activez/désactivez les emails
- Choisissez les types d'alertes à recevoir
- Définissez les horaires de notification

---

## 14. Sécurité du compte

### Changer de mot de passe

1. Cliquez sur votre nom en haut à droite
2. Sélectionnez **Mon profil**
3. Cliquez sur **Changer le mot de passe**
4. Entrez l'ancien et le nouveau mot de passe
5. Confirmez

### Activer l'authentification à deux facteurs

Pour renforcer la sécurité de votre compte :

1. Allez dans **Mon profil > Sécurité**
2. Cliquez sur **Activer MFA**
3. Scannez le QR code avec votre app d'authentification
4. Entrez le code à 6 chiffres pour confirmer
5. **Conservez vos codes de secours** en lieu sûr

### Bonnes pratiques

- ✅ Utilisez un mot de passe unique et complexe
- ✅ Activez l'authentification à deux facteurs
- ✅ Ne partagez jamais vos identifiants
- ✅ Déconnectez-vous après utilisation sur un ordinateur partagé

---

## 15. FAQ

### Questions fréquentes

**Q: Un site apparaît hors ligne, que faire ?**

1. Vérifiez la connexion internet du site
2. Vérifiez que l'écran est allumé
3. Attendez 5 minutes (reconnexion automatique)
4. Si persistant, utilisez "Redémarrer" depuis le dashboard
5. Contactez le support si le problème persiste

**Q: Ma vidéo ne s'affiche pas sur l'écran**

1. Vérifiez le statut du déploiement (doit être "Terminé")
2. Vérifiez que le site est en ligne
3. Le contenu peut prendre quelques minutes à apparaître
4. Vérifiez la configuration de la playlist du site

**Q: Comment supprimer une vidéo d'un écran ?**

1. Allez dans la configuration du site
2. Retirez la vidéo de la playlist
3. Poussez la nouvelle configuration

**Q: J'ai oublié mon mot de passe**

1. Cliquez sur "Mot de passe oublié" sur la page de connexion
2. Entrez votre email
3. Suivez les instructions reçues par email
4. Créez un nouveau mot de passe

**Q: Comment contacter le support ?**

- Email : support@neopro.fr
- Téléphone : 01 XX XX XX XX (lun-ven, 9h-18h)
- Dans l'application : Menu > Aide > Contacter le support

---

## Glossaire

| Terme           | Définition                                      |
| --------------- | ----------------------------------------------- |
| **Site**        | Un écran NEOPRO installé dans un club           |
| **Déploiement** | Envoi d'une vidéo vers un ou plusieurs sites    |
| **Groupe**      | Ensemble de sites regroupés par critère         |
| **Canary**      | Déploiement progressif avec tests préalables    |
| **MFA**         | Authentification à deux facteurs                |
| **Playlist**    | Liste des vidéos configurées pour un site       |
| **Rollback**    | Annulation d'une mise à jour en cas de problème |

---

## Raccourcis clavier

| Raccourci  | Action                   |
| ---------- | ------------------------ |
| `Ctrl + K` | Recherche rapide         |
| `Ctrl + N` | Nouvelle vidéo           |
| `Ctrl + G` | Aller aux groupes        |
| `Ctrl + S` | Aller aux sites          |
| `Esc`      | Fermer la fenêtre modale |

---

_Guide mis à jour le 28 décembre 2024_
_Version 1.1_
