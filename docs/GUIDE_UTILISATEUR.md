# Guide Utilisateur NEOPRO

## Bienvenue

Ce guide vous accompagne dans l'utilisation quotidienne de la plateforme NEOPRO pour gérer vos écrans publicitaires dans les clubs sportifs.

---

## Table des matières

1. [Connexion](#1-connexion)
2. [Tableau de bord](#2-tableau-de-bord)
3. [Gestion des sites](#3-gestion-des-sites)
4. [Gestion des vidéos](#4-gestion-des-vidéos)
5. [Déploiement de contenu](#5-déploiement-de-contenu)
6. [Groupes de sites](#6-groupes-de-sites)
7. [Alertes et notifications](#7-alertes-et-notifications)
8. [Sécurité du compte](#8-sécurité-du-compte)
9. [FAQ](#9-faq)

---

## 1. Connexion

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

## 2. Tableau de bord

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

## 3. Gestion des sites

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

## 4. Gestion des vidéos

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

## 5. Déploiement de contenu

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

## 6. Groupes de sites

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

## 7. Alertes et notifications

### Types d'alertes

| Icône | Type | Description |
|-------|------|-------------|
| 🔴 | Critique | Action immédiate requise |
| 🟠 | Avertissement | Attention recommandée |
| 🔵 | Information | Pour votre information |

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

## 8. Sécurité du compte

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

## 9. FAQ

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

| Terme | Définition |
|-------|------------|
| **Site** | Un écran NEOPRO installé dans un club |
| **Déploiement** | Envoi d'une vidéo vers un ou plusieurs sites |
| **Groupe** | Ensemble de sites regroupés par critère |
| **Canary** | Déploiement progressif avec tests préalables |
| **MFA** | Authentification à deux facteurs |
| **Playlist** | Liste des vidéos configurées pour un site |
| **Rollback** | Annulation d'une mise à jour en cas de problème |

---

## Raccourcis clavier

| Raccourci | Action |
|-----------|--------|
| `Ctrl + K` | Recherche rapide |
| `Ctrl + N` | Nouvelle vidéo |
| `Ctrl + G` | Aller aux groupes |
| `Ctrl + S` | Aller aux sites |
| `Esc` | Fermer la fenêtre modale |

---

*Guide mis à jour le 13 décembre 2024*
*Version 1.0*
