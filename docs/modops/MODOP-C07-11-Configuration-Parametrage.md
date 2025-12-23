# MODOP-C07-11 : Configuration & Paramétrage

**Version** : 1.0
**Date** : 23 décembre 2025
**Responsable** : Customer Success / Formation
**Niveau requis** : Conseiller Client / Formateur
**Durée estimée** : 30-45 minutes par client

---

## 1. OBJECTIF

Former le client à l'utilisation et à la configuration autonome de son boîtier Neopro via l'interface d'administration, de l'upload de vidéos à la configuration des time-blocks.

## 2. PÉRIMÈTRE

### Ce MODOP couvre
- **MODOP-C07** : Formation client à l'interface admin (port 8080)
- **MODOP-C08** : Upload et organisation des vidéos
- **MODOP-C09** : Configuration des time-blocks (Before/Match/After)
- **MODOP-C10** : Paramétrage des catégories et sports
- **MODOP-C11** : Configuration connexion serveur central

---

## 3. VUE D'ENSEMBLE

```
┌─────────────────────────────────────────────────────────┐
│           PROCESSUS DE FORMATION CLIENT                 │
└─────────────────────────────────────────────────────────┘

[C07] Présentation interface admin  → 10 min
         ↓
[C08] Upload et organisation vidéos → 15 min
         ↓
[C09] Configuration time-blocks     → 10 min
         ↓
[C10] Paramétrage catégories/sports → 5 min
         ↓
[C11] Configuration serveur central → 5 min
         ↓
     ✅ FORMATION TERMINÉE

TEMPS TOTAL : 40-45 minutes
```

---

## 4. MODOP-C07 : FORMATION INTERFACE ADMIN

### 4.1 Accès à l'interface

**URL** : `http://neopro.local:8080`

**Étapes pour le client :**
1. Se connecter au WiFi `NEOPRO-[CLUB]` OU être sur le même réseau Ethernet
2. Ouvrir un navigateur (Chrome, Firefox, Safari)
3. Aller sur : `http://neopro.local:8080`
4. **Pas d'authentification requise** (l'admin est en réseau local sécurisé)

### 4.2 Tour guidé de l'interface (10 min)

#### A. Dashboard principal (onglet "Système")

**Montrer au client :**

```
┌─────────────────────────────────────────────────────────┐
│                    NEOPRO ADMIN                         │
├─────────────────────────────────────────────────────────┤
│  📊 Système  |  📹 Vidéos  |  ⚙️ Configuration  |  📝 Logs │
└─────────────────────────────────────────────────────────┘

MÉTRIQUES SYSTÈME (temps réel, rafraîchissement 5s)
┌─────────┬─────────┬─────────┬─────────┬─────────┐
│ CPU     │ Mémoire │ Temp    │ Disque  │ Uptime  │
├─────────┼─────────┼─────────┼─────────┼─────────┤
│ 18%     │ 42%     │ 54°C    │ 28%     │ 3j 12h  │
│ 🟢 OK   │ 🟢 OK   │ 🟢 OK   │ 🟢 OK   │         │
└─────────┴─────────┴─────────┴─────────┴─────────┘

SERVICES SYSTEMD
✅ neopro-app      [Redémarrer]
✅ neopro-admin    [Redémarrer]
✅ nginx           [Redémarrer]
✅ neopro-sync     [Redémarrer]

RÉSEAU
Interface : wlan0 (WiFi Hotspot)
IP : 192.168.4.1
SSID : NEOPRO-CESSON
Clients connectés : 3
```

**Points à expliquer :**
- **Métriques** : Les jauges changent de couleur (🟢🟡🔴) selon les seuils
  - Vert : tout va bien
  - Orange : attention, surveiller
  - Rouge : critique, contacter le support
- **Services** : Boutons de redémarrage en cas de problème
- **Auto-refresh** : La page se rafraîchit toutes les 5 secondes

#### B. Onglet "Vidéos"

**Vue d'ensemble :**

```
┌─────────────────────────────────────────────────────────┐
│                      VIDÉOS                             │
├─────────────────────────────────────────────────────────┤
│  [📤 Upload Vidéo]           [🗂️ Catégories]           │
└─────────────────────────────────────────────────────────┘

LISTE DES VIDÉOS (12 vidéos, 3.2GB)
┌──────────────────────────────────────────────────────────┐
│ 🎬 sponsor_nike.mp4                                      │
│    📁 Sponsors  |  ⏱️ 00:30  |  💾 45MB  |  [Supprimer] │
├──────────────────────────────────────────────────────────┤
│ 🎬 highlights_match1.mp4                                 │
│    📁 Highlights |  ⏱️ 02:15  |  💾 120MB |  [Supprimer]│
└──────────────────────────────────────────────────────────┘
```

#### C. Onglet "Configuration"

**Éditeur JSON :**

```json
{
  "club": {
    "name": "CESSON",
    "fullName": "CESSON Handball"
  },
  "authentication": {
    "enabled": true,
    "password": "MySecurePass2025!"
  },
  "videos": [...]
}
```

**⚠️ Avertir le client :**
- Modifications avancées uniquement
- Toujours faire une sauvegarde avant modification
- En cas d'erreur JSON, le système peut ne plus démarrer

#### D. Onglet "Logs"

**Trois types de logs :**
- **App** : Logs de l'application principale (neopro-app)
- **Nginx** : Logs du serveur web
- **System** : Logs système globaux

**Utilisation :**
- Voir les erreurs récentes en cas de problème
- Partager les logs avec le support si nécessaire

### 4.3 Actions essentielles à retenir

**Montrer au client comment :**

1. **Vérifier que tout va bien** :
   - Onglet Système → Toutes les métriques en vert ✅
   - Tous les services actifs ✅

2. **Redémarrer un service en cas de problème** :
   - Onglet Système → Cliquer sur [Redémarrer] à côté du service

3. **Voir les erreurs** :
   - Onglet Logs → Sélectionner "App" → Rechercher les lignes rouges

4. **Redémarrer complètement le boîtier** :
   - Onglet Système → Bouton "Redémarrer le boîtier" (en bas)
   - ⚠️ Confirmer l'action
   - Attendre 2-3 minutes

---

## 5. MODOP-C08 : UPLOAD ET ORGANISATION DES VIDÉOS

### 5.1 Préparation des vidéos

**Formats supportés :**
- MP4 (recommandé)
- WebM
- MOV

**Résolution recommandée :**
- 1080p (1920x1080) : optimal
- 720p (1280x720) : acceptable
- 4K : déconseillé (taille de fichier trop importante)

**Taille recommandée :**
- Sponsors : 30-60 secondes → 30-100MB
- Highlights : 1-3 minutes → 50-200MB
- Matchs complets : déconseillé (utiliser des extraits)

**Nommage recommandé :**
```
sponsor_nike.mp4
sponsor_adidas.mp4
highlight_match1_janvier.mp4
highlight_match2_janvier.mp4
before_echauffement.mp4
```

### 5.2 Upload via l'interface admin (méthode locale)

**Méthode 1 : Upload direct depuis l'admin**

1. Ouvrir `http://neopro.local:8080`
2. Onglet **Vidéos**
3. Cliquer sur **📤 Upload Vidéo**
4. Sélectionner la vidéo sur l'ordinateur
5. Choisir la catégorie :
   - Sponsors
   - Highlights
   - Before
   - Match
   - After
   - Custom
6. Cliquer sur **Uploader**
7. Attendre la fin de l'upload (barre de progression)

**⏱️ Temps d'upload :**
- 50MB → ~30 secondes en WiFi local
- 200MB → ~2 minutes

### 5.3 Upload via le dashboard central (recommandé)

**Méthode 2 : Upload depuis le dashboard central et déploiement à distance**

1. Se connecter au dashboard : https://neopro-central.onrender.com
2. Menu **Contenu** → **Vidéos**
3. Cliquer sur **Uploader une vidéo**
4. Sélectionner la vidéo
5. Remplir les métadonnées :
   - Nom : sponsor_nike
   - Catégorie : Sponsors
   - Description : Spot Nike 30s
   - Tags : sponsor, nike
6. Cliquer sur **Uploader**
7. Une fois uploadée, cliquer sur **Déployer vers des sites**
8. Sélectionner le(s) site(s) cible(s)
9. Cliquer sur **Déployer**

**Avantages :**
- Upload depuis n'importe où (pas besoin d'être sur place)
- Upload plus rapide (connexion Internet du bureau)
- Gestion centralisée de toutes les vidéos
- Possibilité de déployer la même vidéo vers plusieurs sites

### 5.4 Organisation des vidéos

**Catégories par défaut :**

| Catégorie | Usage | Exemples |
|-----------|-------|----------|
| **Sponsors** | Publicités partenaires | sponsor_nike.mp4, sponsor_adidas.mp4 |
| **Highlights** | Résumés de matchs | highlight_match1.mp4, highlight_match2.mp4 |
| **Before** | Avant-match (échauffement) | before_echauffement.mp4, before_hymne.mp4 |
| **Match** | Pendant le match (mi-temps) | halftime_show.mp4, interview_coach.mp4 |
| **After** | Après-match | after_celebration.mp4, after_recap.mp4 |
| **Custom** | Autres contenus | club_presentation.mp4, formation.mp4 |

**Créer une nouvelle catégorie :**
1. Onglet Vidéos → **🗂️ Catégories**
2. Cliquer sur **Ajouter une catégorie**
3. Nom : ex. "Formations"
4. Couleur : choisir une couleur
5. Sauvegarder

### 5.5 Gestion des vidéos

**Supprimer une vidéo :**
1. Onglet Vidéos → Trouver la vidéo
2. Cliquer sur **[Supprimer]**
3. Confirmer la suppression
4. ⚠️ La vidéo est supprimée définitivement

**Renommer une vidéo :**
1. Via SSH :
   ```bash
   ssh pi@neopro.local
   cd /home/pi/neopro/videos
   mv ancien_nom.mp4 nouveau_nom.mp4
   ```
2. Mettre à jour `configuration.json` :
   ```bash
   nano /home/pi/neopro/webapp/configuration.json
   # Modifier le champ "videoPath"
   # Ctrl+X, Y, Enter
   ```

**Vérifier l'espace disque :**
```bash
ssh pi@neopro.local 'df -h /home/pi/neopro/videos'
```

---

## 6. MODOP-C09 : CONFIGURATION DES TIME-BLOCKS

### 6.1 Concept de time-blocks

**Time-blocks = Blocs de temps** qui déterminent quelles vidéos afficher à quel moment.

**3 time-blocks par défaut :**

| Time-block | Quand | Vidéos affichées | Durée typique |
|------------|-------|------------------|---------------|
| **Before** | Avant le match | Sponsors, échauffement, hymne | 30-60 min |
| **Match** | Pendant le match | Mi-temps, interviews | 15-30 min |
| **After** | Après le match | Highlights, célébrations | 15-30 min |

### 6.2 Configuration manuelle via configuration.json

**Accès :**
1. Interface admin → Onglet **Configuration**
2. OU via SSH :
   ```bash
   ssh pi@neopro.local
   nano /home/pi/neopro/webapp/configuration.json
   ```

**Structure des time-blocks :**

```json
{
  "timeBlocks": [
    {
      "id": "before",
      "name": "Before Match",
      "categories": ["Sponsors", "Before"],
      "duration": 3600,
      "loop": true,
      "shuffle": true
    },
    {
      "id": "match",
      "name": "During Match",
      "categories": ["Match", "Sponsors"],
      "duration": 1800,
      "loop": true,
      "shuffle": false
    },
    {
      "id": "after",
      "name": "After Match",
      "categories": ["Highlights", "After"],
      "duration": 1800,
      "loop": true,
      "shuffle": true
    }
  ]
}
```

**Paramètres :**

| Paramètre | Description | Valeurs |
|-----------|-------------|---------|
| `id` | Identifiant unique | before, match, after |
| `name` | Nom affiché | "Before Match" |
| `categories` | Catégories de vidéos à inclure | ["Sponsors", "Before"] |
| `duration` | Durée en secondes | 3600 = 1h |
| `loop` | Rejouer en boucle | true / false |
| `shuffle` | Ordre aléatoire | true / false |

### 6.3 Activation d'un time-block

**Méthode 1 : Via la télécommande (`/remote`)**

1. Ouvrir `http://neopro.local/remote`
2. Sélectionner le time-block dans le menu déroulant
3. Cliquer sur **Activer**

**Méthode 2 : Via le dashboard central**

1. Menu Sites → Sélectionner le site
2. Section **Commandes** → **Changer le time-block**
3. Sélectionner Before/Match/After
4. Cliquer sur **Envoyer**

**Méthode 3 : Programmation automatique**

*Fonctionnalité future - actuellement manuel*

### 6.4 Exemples de configuration

**Exemple 1 : Match de handball avec sponsors**

```json
"timeBlocks": [
  {
    "id": "before",
    "name": "Avant-match",
    "categories": ["Sponsors", "Before"],
    "duration": 3600,
    "loop": true,
    "shuffle": true
  },
  {
    "id": "halftime",
    "name": "Mi-temps",
    "categories": ["Sponsors", "Highlights"],
    "duration": 900,
    "loop": true,
    "shuffle": false
  },
  {
    "id": "after",
    "name": "Après-match",
    "categories": ["Highlights"],
    "duration": 1800,
    "loop": true,
    "shuffle": true
  }
]
```

---

## 7. MODOP-C10 : PARAMÉTRAGE CATÉGORIES ET SPORTS

### 7.1 Gestion des catégories

**Via l'interface admin :**

1. Onglet **Vidéos** → **🗂️ Catégories**
2. Liste des catégories existantes affichée

**Actions disponibles :**

| Action | Procédure |
|--------|-----------|
| **Créer** | Cliquer sur "Ajouter", nom + couleur |
| **Modifier** | Cliquer sur ✏️ à côté de la catégorie |
| **Supprimer** | Cliquer sur 🗑️ (si aucune vidéo) |

### 7.2 Configuration des sports

**Via configuration.json :**

```json
{
  "club": {
    "sports": ["handball", "basketball", "volleyball"]
  }
}
```

**Sports supportés :**
- handball
- basketball
- volleyball
- futsal
- badminton
- tennis
- custom (personnalisé)

---

## 8. MODOP-C11 : CONFIGURATION SERVEUR CENTRAL

### 8.1 Vérifier la connexion au serveur central

**Via l'interface admin :**

1. Onglet **Système** → Section **Serveur Central**
2. Vérifier :
   - ✅ Statut : Connecté
   - URL : https://neopro-central.onrender.com
   - Site ID : uuid-du-site

**Via SSH :**

```bash
ssh pi@neopro.local

# Vérifier la configuration
cat /etc/neopro/site.conf

# Vérifier les logs du sync-agent
sudo journalctl -u neopro-sync -n 50

# Rechercher :
# ✓ "Connected to central server"
# ✓ "Metrics sent successfully"
```

### 8.2 Activer/désactiver la connexion centrale

**Désactiver (mode standalone) :**

```json
{
  "sync": {
    "enabled": false
  }
}
```

**Activer :**

```json
{
  "sync": {
    "enabled": true,
    "serverUrl": "https://neopro-central.onrender.com"
  }
}
```

### 8.3 Réenregistrer le site

**Si la connexion est perdue ou les clés API invalides :**

```bash
ssh pi@neopro.local
cd /home/pi/neopro/sync-agent
sudo npm run register
sudo systemctl restart neopro-sync
```

---

## 9. CHECKLIST DE FORMATION

### Formation de base (30 min)

- [ ] Client sait accéder à l'interface admin (`:8080`)
- [ ] Client sait vérifier que les services sont actifs
- [ ] Client sait uploader une vidéo
- [ ] Client sait organiser les vidéos par catégories
- [ ] Client sait activer un time-block via `/remote`
- [ ] Client sait redémarrer un service si nécessaire
- [ ] Client sait contacter le support

### Formation avancée (45 min)

- [ ] Tout ci-dessus +
- [ ] Client sait modifier `configuration.json`
- [ ] Client sait créer des time-blocks personnalisés
- [ ] Client sait créer des catégories
- [ ] Client sait utiliser le dashboard central pour déployer
- [ ] Client sait lire les logs pour diagnostiquer un problème

---

## 10. DOCUMENT DE SUPPORT CLIENT

**Fournir au client un document de référence rapide :**

```
┌──────────────────────────────────────────────────────┐
│       GUIDE RAPIDE NEOPRO - [NOM CLUB]               │
└──────────────────────────────────────────────────────┘

📺 AFFICHER DES VIDÉOS
1. Uploader les vidéos : http://neopro.local:8080 → Vidéos
2. Organiser par catégories (Sponsors, Highlights, etc.)
3. Activer un time-block : http://neopro.local/remote

⚙️ VÉRIFIER QUE TOUT VA BIEN
URL : http://neopro.local:8080 → Système
✅ Toutes les métriques en vert
✅ Tous les services actifs

🔧 REDÉMARRER UN SERVICE
http://neopro.local:8080 → Système → [Redémarrer]

🆘 PROBLÈME ?
1. Voir les logs : http://neopro.local:8080 → Logs
2. Redémarrer le service concerné
3. Si ça ne marche pas → Contacter support

📞 SUPPORT
Email : support@neopro.fr
Tél : +33 X XX XX XX XX
```

---

## 11. KPI ET MÉTRIQUES

- **Temps moyen de formation** : < 45 min
- **Taux d'autonomie client après formation** : > 80%
- **Satisfaction formation** : > 4/5

---

**FIN DU MODOP-C07-11**
