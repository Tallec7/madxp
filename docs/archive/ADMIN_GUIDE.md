# Guide d'administration - NEOPRO Fleet Management

## Table des matières

1. [Accès au dashboard](#accès-au-dashboard)
2. [Ajouter un boîtier à la flotte](#ajouter-un-boîtier-à-la-flotte)
3. [Gérer les sites](#gérer-les-sites)
4. [Gérer les groupes](#gérer-les-groupes)
5. [Déployer du contenu](#déployer-du-contenu)
6. [Déployer des mises à jour](#déployer-des-mises-à-jour)
7. [Surveiller l'état de la flotte](#surveiller-létat-de-la-flotte)
8. [Résolution de problèmes](#résolution-de-problèmes)

---

## Accès au dashboard

### URL de production
```
https://votre-dashboard.onrender.com
```

### Connexion
1. Ouvrez l'URL du dashboard dans votre navigateur
2. Entrez vos identifiants (email et mot de passe)
3. Vous serez redirigé vers le tableau de bord principal

### Rôles utilisateurs
- **Admin** : Accès complet (sites, groupes, contenu, mises à jour)
- **Operator** : Peut gérer les sites et déployer du contenu
- **Viewer** : Consultation uniquement (lecture seule)

---

## Ajouter un boîtier à la flotte

### Étape 1: Enregistrer le site dans le dashboard

1. **Accédez à la page "Sites"**
   - Cliquez sur "Sites" dans le menu latéral
   - Ou allez sur `/sites`

2. **Créer un nouveau site**
   - Cliquez sur le bouton **"+ Nouveau site"** en haut à droite
   - Remplissez le formulaire :
     - **Nom du site** : ex. "Site Rennes"
     - **Nom du club** : ex. "Rennes FC"
     - **Ville** : ex. "Rennes"
     - **Région** : ex. "Bretagne"
     - **Sports** : ex. "football, rugby" (séparés par des virgules)
   - Cliquez sur **"Créer"**

3. **Récupérer les informations du site**
   - Une fois créé, le site apparaît dans la liste
   - Cliquez sur l'icône 👁️ pour voir les détails
   - **Notez bien** :
     - L'**ID du site** (affiché en haut)
     - La **clé API** (section "Clé API du site")
   - Vous pouvez copier la clé API en cliquant sur l'icône 📋

### Étape 2: Installer l'agent sur le Raspberry Pi

**Sur le Raspberry Pi** (via SSH ou accès direct) :

1. **Installer Node.js** (si pas déjà fait)
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

2. **Récupérer le code de l'agent**
   ```bash
   cd /home/pi
   git clone https://github.com/votre-repo/neopro.git
   cd neopro/raspberry/sync-agent
   ```

3. **Installer les dépendances**
   ```bash
   npm install
   ```

4. **Enregistrer le site**
   ```bash
   sudo node scripts/register-site.js
   ```

   Le script vous demandera :
   - **URL du serveur central** : `https://neopro.onrender.com`
   - **ID du site** : (celui que vous avez noté à l'étape 1)
   - **Clé API du site** : (celle que vous avez notée à l'étape 1)

   Les informations seront enregistrées dans `/etc/neopro/site.conf`

5. **Installer le service systemd**
   ```bash
   sudo node scripts/install-service.js
   ```

6. **Démarrer l'agent**
   ```bash
   sudo systemctl start neopro-agent
   sudo systemctl enable neopro-agent
   ```

7. **Vérifier le statut**
   ```bash
   sudo systemctl status neopro-agent
   ```

### Étape 3: Vérifier la connexion

1. **Retournez sur le dashboard**
2. Allez dans **Sites** > cliquez sur votre site
3. Le statut devrait passer à **"Online"** (●vert)
4. Vous devriez voir les métriques en temps réel :
   - CPU
   - RAM
   - Température
   - Espace disque
   - Uptime

**Le boîtier est maintenant connecté à la flotte !** 🎉

---

## Gérer les sites

### Voir tous les sites

1. Cliquez sur **"Sites"** dans le menu
2. Vous voyez la liste de tous vos sites avec :
   - Nom du club
   - Localisation
   - Statut (online/offline/error/maintenance)
   - Version logicielle
   - Dernière connexion

### Filtrer les sites

Utilisez les filtres en haut de la page :
- **Recherche** : Par nom de club ou de site
- **Statut** : Online, Offline, Erreur, Maintenance
- **Région** : Bretagne, Pays de la Loire, etc.

### Voir les détails d'un site

1. Cliquez sur l'icône **👁️** à côté du site
2. Vous accédez à la vue détaillée avec :
   - Informations générales
   - Métriques en temps réel (rafraîchies toutes les 30 secondes)
   - Historique des métriques (24h)
   - Actions disponibles

### Actions disponibles sur un site

#### 1. Redémarrer le service NEOPRO
- Cliquez sur **"🔄 Redémarrer le service"**
- Redémarre uniquement l'application NEOPRO (pas le système)
- Temps d'arrêt : ~10 secondes

#### 2. Voir les logs
- Cliquez sur **"📋 Voir les logs"**
- Affiche les logs système et applicatifs
- Utile pour diagnostiquer des problèmes

#### 3. Obtenir les infos système
- Cliquez sur **"ℹ️ Infos système"**
- Affiche les informations détaillées du Raspberry Pi

#### 4. Redémarrer le système
- Cliquez sur **"🔌 Redémarrer le système"**
- ⚠️ **ATTENTION** : Redémarre physiquement le Raspberry Pi
- Temps d'arrêt : ~2 minutes

#### 5. Régénérer la clé API
- Dans la section "Clé API du site"
- Cliquez sur **"🔄 Régénérer"**
- ⚠️ Vous devrez reconfigurer l'agent sur le Raspberry Pi

### Modifier un site

1. Sur la page **Sites**, cliquez sur **✏️** à côté du site
2. Modifiez les informations (nom, localisation, sports)
3. Cliquez sur **"Mettre à jour"**

### Supprimer un site

1. Sur la page **Sites**, cliquez sur **🗑️** à côté du site
2. Confirmez la suppression
3. ⚠️ **ATTENTION** : Cette action est irréversible
4. L'agent sur le Raspberry Pi ne pourra plus se connecter

---

## Gérer les groupes

Les groupes permettent d'organiser vos sites et de déployer du contenu ou des mises à jour vers plusieurs sites simultanément.

### Créer un groupe

1. Cliquez sur **"Groupes"** dans le menu
2. Cliquez sur **"+ Nouveau groupe"**
3. Remplissez le formulaire :
   - **Nom** : ex. "Clubs de football"
   - **Type** : Sport, Géographie, Version, ou Personnalisé
   - **Description** : Description du groupe (optionnel)
   - **Métadonnées** : Selon le type choisi
     - Sport : nom du sport
     - Géographie : région
     - Version : version cible
   - **Sites** : Cochez les sites à inclure
4. Cliquez sur **"Créer"**

### Types de groupes

#### 1. Sport
Regroupe les sites par sport pratiqué
- Exemple : "Clubs de football", "Clubs de rugby"
- Métadonnée : nom du sport

#### 2. Géographie
Regroupe les sites par région
- Exemple : "Sites Bretagne", "Sites Île-de-France"
- Métadonnée : région

#### 3. Version
Regroupe les sites par version logicielle
- Exemple : "Sites v2.0", "Sites à mettre à jour"
- Métadonnée : version cible

#### 4. Personnalisé
Groupement libre selon vos besoins
- Exemple : "Sites pilotes", "Sites VIP"

### Voir les détails d'un groupe

1. Cliquez sur **👁️** à côté du groupe
2. Vous voyez :
   - Nombre de sites
   - Sites en ligne / hors ligne
   - Liste des sites du groupe
   - Actions groupées disponibles

### Ajouter des sites à un groupe

**Méthode 1 : Depuis le groupe**
1. Ouvrez le groupe
2. Cliquez sur **"+ Ajouter des sites"**
3. Cochez les sites à ajouter
4. Cliquez sur **"Ajouter"**

**Méthode 2 : Lors de la création**
- Sélectionnez les sites directement dans le formulaire de création

### Retirer un site d'un groupe

1. Ouvrez le groupe
2. Dans la liste des sites, cliquez sur **✕** à côté du site
3. Confirmez le retrait

### Actions groupées

Depuis la page de détails d'un groupe :

#### 1. Déployer du contenu
- Cliquez sur **"📹 Déployer du contenu"**
- Vous serez redirigé vers la gestion du contenu
- La vidéo sera déployée sur tous les sites du groupe

#### 2. Déployer une mise à jour
- Cliquez sur **"🔄 Mettre à jour"**
- Vous serez redirigé vers la gestion des mises à jour
- La mise à jour sera déployée sur tous les sites du groupe

#### 3. Redémarrer tous les services
- Cliquez sur **"⚡ Redémarrer les services"**
- Redémarre l'application NEOPRO sur tous les sites
- Confirmez l'action

#### 4. Redémarrer tous les systèmes
- Cliquez sur **"🔌 Redémarrer les systèmes"**
- ⚠️ **ATTENTION** : Redémarre tous les Raspberry Pi
- Confirmez l'action

### Modifier un groupe

1. Ouvrez le groupe
2. Cliquez sur **"✏️ Éditer"**
3. Modifiez les informations
4. Cliquez sur **"Mettre à jour"**

### Supprimer un groupe

1. Ouvrez le groupe
2. Cliquez sur **"🗑️ Supprimer"**
3. Confirmez la suppression
4. ⚠️ Les sites ne sont pas supprimés, seulement le groupement

---

## Déployer du contenu

### Ajouter une vidéo

1. Cliquez sur **"Gestion du contenu"** dans le menu
2. Onglet **"Vidéos"**
3. Cliquez sur **"+ Ajouter une vidéo"**
4. Remplissez le formulaire :
   - **Titre** : Nom descriptif de la vidéo
   - **Fichier** : Sélectionnez le fichier vidéo
5. Cliquez sur **"Uploader"**
6. Une barre de progression s'affiche

### Déployer une vidéo

**Méthode 1 : Depuis la liste des vidéos**
1. Onglet **"Vidéos"**
2. Cliquez sur **"🚀 Déployer"** à côté de la vidéo
3. Vous êtes redirigé vers l'onglet **"Déployer"** avec la vidéo sélectionnée

**Méthode 2 : Depuis l'onglet Déployer**
1. Onglet **"Déployer"**
2. **Étape 1** : Sélectionnez la vidéo dans la liste
3. **Étape 2** : Choisissez la cible
   - **Site individuel** : Sélectionnez un site
   - **Groupe de sites** : Sélectionnez un groupe
4. Cliquez sur **"🚀 Lancer le déploiement"**

### Suivre un déploiement

1. Onglet **"Historique"**
2. Vous voyez tous les déploiements avec :
   - Nom de la vidéo
   - Cible (site ou groupe)
   - Statut (en attente, en cours, terminé, échoué)
   - Progression (X/Y sites)
   - Pourcentage d'avancement
3. Les déploiements en cours se mettent à jour en temps réel

### Statuts de déploiement

- **En attente** (gris) : Le déploiement est planifié
- **En cours** (bleu) : Le déploiement est en cours
- **Terminé** (vert) : Déployé avec succès sur tous les sites
- **Échoué** (rouge) : Erreur lors du déploiement

### Supprimer une vidéo

1. Onglet **"Vidéos"**
2. Cliquez sur **🗑️** à côté de la vidéo
3. Confirmez la suppression
4. ⚠️ La vidéo sera supprimée du serveur central mais pas des sites où elle a déjà été déployée

---

## Déployer des mises à jour

### Créer une nouvelle version

1. Cliquez sur **"Gestion des mises à jour"** dans le menu
2. Onglet **"Mises à jour"**
3. Cliquez sur **"+ Nouvelle version"**
4. Remplissez le formulaire :
   - **Numéro de version** : ex. "2.1.0" (format SemVer recommandé)
   - **Description courte** : ex. "Correction de bugs et améliorations"
   - **Notes de version** : Détails des changements (optionnel)
   - **Package** : Fichier .tar.gz ou .zip contenant la mise à jour
   - **Mise à jour critique** : Cochez si urgent
5. Cliquez sur **"Créer"**

### Déployer une mise à jour

**Méthode 1 : Depuis la liste**
1. Onglet **"Mises à jour"**
2. Cliquez sur **"🚀 Déployer"** à côté de la version
3. Vous êtes redirigé vers l'onglet **"Déployer"**

**Méthode 2 : Depuis l'onglet Déployer**
1. Onglet **"Déployer"**
2. **Étape 1** : Sélectionnez la version
   - ⚠️ Les versions critiques sont signalées
3. **Étape 2** : Choisissez la cible
   - Site individuel ou groupe de sites
4. **Étape 3** : Options de déploiement
   - ✅ **Rollback automatique** : Restaure la version précédente en cas d'échec (recommandé)
   - ☐ **Redémarrage après installation** : Redémarre automatiquement le système
5. Cliquez sur **"🚀 Lancer le déploiement"**

### Processus de mise à jour sur le Raspberry Pi

Quand vous déployez une mise à jour, l'agent :

1. **Télécharge** le package depuis le serveur central
2. **Crée une sauvegarde** de la version actuelle
3. **Arrête les services** NEOPRO
4. **Extrait et installe** la nouvelle version
5. **Redémarre les services**
6. **Vérifie** que tout fonctionne
7. **Rollback automatique** si échec (si option activée)

### Suivre les déploiements

1. Onglet **"Historique"**
2. Vous voyez tous les déploiements de mises à jour
3. Même système que pour le contenu :
   - Statut en temps réel
   - Progression (X/Y sites)
   - Dates de début et fin

### Voir la distribution des versions

1. Onglet **"Versions installées"**
2. Vous voyez un graphique montrant :
   - Combien de sites utilisent chaque version
   - Pourcentage du parc pour chaque version
3. Utile pour :
   - Identifier les sites à mettre à jour
   - Vérifier l'homogénéité du parc

### Notes de version

- Cliquez sur la flèche **▶** pour déplier les notes
- Cliquez sur **▼** pour les replier
- Les notes détaillent les changements de la version

### Supprimer une version

1. Onglet **"Mises à jour"**
2. Cliquez sur **🗑️** à côté de la version
3. Confirmez la suppression
4. ⚠️ La version sera supprimée mais pas désinstallée des sites

---

## Surveiller l'état de la flotte

### Dashboard principal

1. Cliquez sur **"Dashboard"** dans le menu
2. Vous voyez :
   - **4 statistiques principales** :
     - Total des sites
     - Sites en ligne
     - Sites hors ligne
     - Sites en erreur
   - **Sites récents** : Les 5 derniers sites ajoutés/modifiés
   - **Actions rapides** : Accès directs aux fonctions principales
   - **Distribution des sites** : Graphique par statut

### Notifications en temps réel

Dans le menu en haut à droite :
- L'icône **🔔** affiche les notifications
- Un badge rouge indique le nombre de nouvelles notifications
- Types de notifications :
  - Site passé hors ligne
  - Alerte température/CPU/RAM/disque
  - Déploiement terminé
  - Erreur de déploiement

### Statuts des sites

- **🟢 Online** : Site connecté et fonctionnel
- **⚪ Offline** : Site déconnecté (plus de 5 minutes sans heartbeat)
- **🔴 Error** : Site en erreur (problème détecté)
- **🟡 Maintenance** : Site en maintenance (configuré manuellement)

### Alertes automatiques

Le système génère automatiquement des alertes si :
- **Température** > 75°C
- **CPU** > 90%
- **RAM** > 90%
- **Disque** > 90%
- **Site offline** > 5 minutes

Les alertes apparaissent :
- Dans les notifications
- Sur la page de détails du site
- Dans les logs système

---

## Résolution de problèmes

### Un site n'apparaît pas comme "Online"

**Vérifications sur le Raspberry Pi :**

1. **Vérifier que l'agent tourne**
   ```bash
   sudo systemctl status neopro-agent
   ```
   Si arrêté, démarrer :
   ```bash
   sudo systemctl start neopro-agent
   ```

2. **Vérifier les logs de l'agent**
   ```bash
   sudo journalctl -u neopro-agent -f
   ```
   Recherchez les erreurs de connexion

3. **Vérifier la configuration**
   ```bash
   sudo cat /etc/neopro/site.conf
   ```
   Vérifiez que l'ID et la clé API sont corrects

4. **Tester la connexion au serveur**
   ```bash
   curl https://neopro.onrender.com/api/health
   ```
   Devrait retourner `{"status":"ok"}`

5. **Vérifier la connexion réseau**
   ```bash
   ping 8.8.8.8
   ```

**Vérifications sur le dashboard :**

1. Vérifiez que le site existe dans la liste
2. Vérifiez que la clé API correspond
3. Consultez les logs du serveur central si vous y avez accès

### Un déploiement est bloqué à 0%

1. Vérifiez que les sites cibles sont **Online**
2. Consultez les logs de l'agent sur le Raspberry Pi
3. Vérifiez l'espace disque disponible sur le Raspberry Pi
4. Réessayez le déploiement

### Les métriques ne se mettent pas à jour

1. Vérifiez que le site est **Online**
2. Attendez jusqu'à 30 secondes (rafraîchissement automatique)
3. Rafraîchissez la page manuellement (F5)
4. Vérifiez que l'agent tourne sur le Raspberry Pi

### Erreur "Clé API invalide"

1. Sur le dashboard, régénérez la clé API du site
2. Sur le Raspberry Pi, mettez à jour la configuration :
   ```bash
   sudo nano /etc/neopro/site.conf
   ```
   Remplacez `SITE_API_KEY=...` par la nouvelle clé
3. Redémarrez l'agent :
   ```bash
   sudo systemctl restart neopro-agent
   ```

### Site en erreur après une mise à jour

Si le rollback automatique était activé :
- L'agent a automatiquement restauré la version précédente
- Vérifiez les logs pour identifier le problème
- Corrigez le package de mise à jour

Si le rollback n'était pas activé :
1. Connectez-vous au Raspberry Pi
2. Restaurez manuellement la sauvegarde :
   ```bash
   cd /home/pi/neopro
   sudo ./restore-backup.sh
   ```

### Problèmes de performance (CPU/RAM élevé)

1. **Redémarrez le service** depuis le dashboard
2. Si le problème persiste, **redémarrez le système**
3. Consultez les logs pour identifier la cause
4. Envisagez une mise à jour si c'est un bug connu

### Espace disque saturé

1. Identifiez les fichiers volumineux sur le Raspberry Pi :
   ```bash
   du -h /home/pi/neopro | sort -rh | head -10
   ```
2. Supprimez les anciennes vidéos/logs si nécessaire
3. Depuis le dashboard, vous pouvez supprimer des vidéos déployées

---

## Bonnes pratiques

### Gestion de la flotte

1. **Groupez vos sites** dès le départ (par sport, région, etc.)
2. **Testez les déploiements** sur 1-2 sites avant de déployer massivement
3. **Activez toujours le rollback automatique** pour les mises à jour
4. **Surveillez les alertes** régulièrement
5. **Documentez vos versions** avec des notes de version claires

### Sécurité

1. **Changez les mots de passe** par défaut
2. **Régénérez les clés API** si un Raspberry Pi est compromis
3. **Limitez les accès** selon les rôles (admin/operator/viewer)
4. **Sauvegardez** la base de données régulièrement

### Mises à jour

1. **Versionnez correctement** : Utilisez SemVer (2.1.0, 2.1.1, etc.)
2. **Testez en local** avant de déployer
3. **Déployez progressivement** : 1 site → groupe test → tous les sites
4. **Planifiez les mises à jour** en dehors des heures d'ouverture

### Maintenance

1. **Vérifiez l'état de la flotte** quotidiennement via le dashboard
2. **Nettoyez les anciennes vidéos** pour libérer de l'espace
3. **Mettez à jour régulièrement** pour bénéficier des corrections
4. **Sauvegardez les configurations** importantes

---

## Support

Pour toute question ou problème :
1. Consultez d'abord ce guide
2. Vérifiez les logs (dashboard et Raspberry Pi)
3. Contactez l'équipe NEOPRO : support@neopro.com

---

**Version du guide** : 1.0
**Date de dernière mise à jour** : 4 décembre 2025
