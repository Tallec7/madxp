# MODOP-C12-15 : Déploiement & Mises à Jour

**Version** : 1.0
**Date** : 23 décembre 2025
**Responsable** : Ops / Déploiement
**Niveau requis** : Technicien Ops
**Durée estimée** : 10-30 minutes par déploiement

---

## 1. OBJECTIF

Gérer les déploiements de contenu et mises à jour logicielles vers les boîtiers Neopro de manière sécurisée et progressive.

## 2. PÉRIMÈTRE

### Ce MODOP couvre

- **MODOP-C12** : Déploiement standard de contenu
- **MODOP-C13** : Déploiement canary (rollout progressif 10% → 100%)
- **MODOP-C14** : Rollback en cas d'échec de déploiement
- **MODOP-C15** : Gestion des sites déconnectés (mise en queue)

---

## 3. MODOP-C12 : DÉPLOIEMENT STANDARD

### 3.1 Types de déploiement

| Type                       | Contenu                    | Fréquence    | Durée              |
| -------------------------- | -------------------------- | ------------ | ------------------ |
| **Vidéo**                  | Fichier vidéo unique       | À la demande | 1-5 min par site   |
| **Configuration**          | Fichier configuration.json | Occasionnel  | 30s par site       |
| **Mise à jour logicielle** | Package complet neopro     | Mensuel      | 10-15 min par site |

### 3.2 Déploiement de vidéo via le dashboard

**Depuis le dashboard central :**

#### Étape 1 : Upload de la vidéo (5-10 min)

```
https://neopro-central-production.up.railway.app
│
├─ Menu "Contenu" → "Vidéos"
│  └─ Cliquer sur "Uploader une vidéo"
│     ├─ Sélectionner le fichier (MP4 recommandé)
│     ├─ Nom : sponsor_nike_2025
│     ├─ Catégorie : Sponsors
│     ├─ Description : Spot Nike 30s janvier 2025
│     ├─ Tags : sponsor, nike, handball
│     └─ Cliquer sur "Uploader"
│
└─ Attendre la fin de l'upload (barre de progression)
```

**⏱️ Temps d'upload :**

- 50MB → ~1 minute (connexion fibre)
- 200MB → ~3-5 minutes

#### Étape 2 : Déploiement vers les sites (2-5 min par site)

```
Sur la page de la vidéo :
│
├─ Cliquer sur "Déployer vers des sites"
│
├─ Sélectionner les sites cibles :
│  ├─ [x] CESSON Handball
│  ├─ [x] RENNES Volley
│  └─ [ ] NANTES Basket (décoché)
│
├─ Cliquer sur "Déployer"
│
└─ Suivre la progression en temps réel :
   ├─ CESSON : 0% → 50% → 100% ✅
   ├─ RENNES : 0% → 25% → ... (en cours)
   └─ Statut final affiché
```

#### Étape 3 : Vérification du déploiement

**Vérifier sur le dashboard :**

1. Menu **Contenu** → **Historique des déploiements**
2. Trouver le déploiement (ex: "sponsor_nike_2025 vers CESSON")
3. Vérifier le statut :
   - ✅ **Déployé** : Succès
   - ⏳ **En cours** : Déploiement en cours
   - ❌ **Échec** : Erreur (voir logs)
   - 🔄 **En attente** : Site hors ligne, mise en queue

**Vérifier sur le site :**

```bash
# Se connecter au Pi
ssh pi@neopro.local

# Vérifier que la vidéo est présente
ls -lh /home/pi/neopro/videos/sponsors/ | grep nike

# Devrait afficher :
# -rw-r--r-- 1 pi pi 45M Jan 15 10:30 sponsor_nike_2025.mp4
```

### 3.3 Déploiement de configuration

**Depuis le dashboard :**

1. Menu **Sites** → Sélectionner le site
2. Section **Actions** → **Pousser la configuration**
3. Modifier le JSON ou uploader un fichier
4. Cliquer sur **Déployer**

**⚠️ Attention :**

- Toujours faire une sauvegarde avant modification
- Valider le JSON avant déploiement (https://jsonlint.com)
- Redémarrer les services après modification : `nginx`, `neopro-app`

### 3.4 Déploiement de mise à jour logicielle

**Méthode recommandée : Via le dashboard central**

```
Dashboard → Sites → [Site] → Actions → Mettre à jour le logiciel
│
├─ Sélectionner la version :
│  ├─ v1.2.0 (actuelle)
│  ├─ v1.3.0 (latest)
│  └─ v1.3.1-beta (bêta)
│
├─ Cliquer sur "Déployer la mise à jour"
│
└─ Progression :
   ├─ Téléchargement archive : 45MB (1-2 min)
   ├─ Extraction : 30s
   ├─ Installation dépendances npm : 2-3 min
   ├─ Redémarrage services : 30s
   └─ ✅ Mise à jour terminée
```

**⏱️ Durée totale : 5-10 minutes**

**Note (v3.7.14+) :** Le script `update-software.js` copie maintenant aussi le dossier `config/` (services systemd) vers le Pi. Les versions précédentes ne copiaient jamais ce dossier, ce qui empêchait l'installation des services de protection via OTA. L'archive inclut maintenant **7 services systemd** (3 core + 4 protection) et **12 scripts runtime** (dont `fix-fleet-pi.sh` et `diagnose-pi.sh`). Si des services sont manquants sur un Pi existant, utiliser `fix-fleet-pi.sh` pour les installer manuellement.

**Méthode alternative : SSH manuelle**

```bash
# Se connecter au Pi
ssh pi@neopro.local

# Télécharger le script de mise à jour
curl -O https://raw.githubusercontent.com/Tallec7/neopro/main/raspberry/scripts/update.sh
chmod +x update.sh

# Lancer la mise à jour
sudo ./update.sh v1.3.0

# Vérifier la nouvelle version
cat /home/pi/neopro/VERSION
```

---

## 4. MODOP-C13 : DÉPLOIEMENT CANARY (PROGRESSIF)

### 4.1 Qu'est-ce qu'un déploiement canary ?

**Canary deployment = Déploiement progressif**

```
Phase 1 : Canary (10% des sites) → Observer 30 min
          ↓ Si succès > 95%
Phase 2 : Gradual (25% des sites) → Observer 30 min
          ↓ Si succès > 95%
Phase 3 : Gradual (50% des sites) → Observer 30 min
          ↓ Si succès > 95%
Phase 4 : Gradual (75% des sites) → Observer 30 min
          ↓ Si succès > 95%
Phase 5 : Full (100% des sites) → Terminé
```

**Avantages :**

- ✅ Détection précoce des problèmes
- ✅ Impact limité en cas d'échec
- ✅ Rollback automatique si taux d'échec > 5%
- ✅ Observation de la stabilité entre phases

**Utiliser pour :**

- Mises à jour logicielles majeures
- Changements de configuration impactants
- Nouveaux contenus vidéo sensibles

### 4.2 Lancer un déploiement canary

**Depuis le dashboard :**

```
Menu Contenu → Vidéos → [Vidéo] → Déployer
│
├─ Cocher "Déploiement canary" ✅
│
├─ Configuration canary :
│  ├─ Canary % : 10% (défaut)
│  ├─ Étapes graduelles : [25%, 50%, 75%, 100%]
│  ├─ Période de stabilité : 30 minutes
│  ├─ Seuil de succès : 95%
│  └─ Avance automatique : ✅ Oui
│
├─ Sélectionner les sites cibles : [Tous les sites] (50 sites)
│
└─ Cliquer sur "Déployer en mode canary"
```

**Le système va :**

1. Sélectionner aléatoirement 10% des sites (5 sites sur 50)
2. Déployer vers ces 5 sites
3. Observer pendant 30 minutes
4. Si succès > 95% → Passer à 25% (13 sites)
5. Répéter jusqu'à 100%

### 4.3 Suivi d'un déploiement canary

**Dashboard → Contenu → Déploiements canary**

```
┌─────────────────────────────────────────────────────────┐
│   Déploiement Canary : sponsor_nike_2025                │
├─────────────────────────────────────────────────────────┤
│ Phase actuelle : Gradual (50%)                          │
│ Progression : 25 / 50 sites                             │
│                                                          │
│ Métriques :                                             │
│   ✅ Succès : 24 sites (96%)                            │
│   ❌ Échecs : 1 site (4%)                               │
│   ⏳ En attente : 25 sites                              │
│                                                          │
│ Prochaine phase dans : 18 minutes                       │
│                                                          │
│ Actions :                                               │
│   [Avancer manuellement]  [Rollback]  [Pause]          │
└─────────────────────────────────────────────────────────┘
```

### 4.4 Configuration avancée

**Modifier les paramètres canary :**

```json
{
  "canaryPercentage": 10,
  "gradualSteps": [25, 50, 75, 100],
  "stabilityPeriodMs": 1800000, // 30 min en ms
  "successThreshold": 95,
  "autoAdvance": true
}
```

**Exemples de configurations :**

| Scénario         | Canary % | Étapes                | Période | Seuil |
| ---------------- | -------- | --------------------- | ------- | ----- |
| **Conservateur** | 5%       | [10, 25, 50, 75, 100] | 60 min  | 98%   |
| **Standard**     | 10%      | [25, 50, 75, 100]     | 30 min  | 95%   |
| **Agressif**     | 20%      | [50, 100]             | 15 min  | 90%   |

---

## 5. MODOP-C14 : ROLLBACK EN CAS D'ÉCHEC

### 5.1 Détection automatique d'échec

**Le système déclenche un rollback automatique si :**

- Taux de succès < seuil configuré (défaut: 95%)
- Plus de 3 sites en échec consécutif
- Erreur critique détectée dans les logs

**Exemple :**

```
Phase : Canary (10% - 5 sites)
Résultat :
  - Site 1 : ✅ Succès
  - Site 2 : ❌ Échec (erreur de téléchargement)
  - Site 3 : ✅ Succès
  - Site 4 : ❌ Échec (erreur de téléchargement)
  - Site 5 : ✅ Succès

Taux de succès : 60% (< 95%)

🚨 ROLLBACK AUTOMATIQUE DÉCLENCHÉ
```

### 5.2 Rollback manuel

**Depuis le dashboard :**

```
Déploiements canary → [Déploiement] → Cliquer sur "Rollback"
│
├─ Confirmer le rollback
│
└─ Le système va :
   ├─ Arrêter le déploiement en cours
   ├─ Restaurer la version précédente sur les sites impactés
   ├─ Marquer le déploiement comme "rolled_back"
   └─ Notifier les administrateurs
```

**Via SSH (rollback d'une mise à jour logicielle) :**

```bash
ssh pi@neopro.local

# Voir l'historique des versions
ls -la /home/pi/neopro/backups/

# Restaurer une version précédente
cd /home/pi/neopro
sudo ./scripts/rollback.sh v1.2.0

# Le script va :
# 1. Arrêter les services
# 2. Restaurer les fichiers depuis backup
# 3. Redémarrer les services
```

### 5.3 Vérification post-rollback

**Checklist :**

- [ ] Services redémarrés : `sudo systemctl status neopro-app nginx`
- [ ] Version correcte : `cat /home/pi/neopro/VERSION`
- [ ] Interface accessible : `curl -I http://neopro.local`
- [ ] Logs sans erreur : `sudo journalctl -u neopro-app -n 50`
- [ ] Site reconnecté au central : Dashboard → Sites → Statut 🟢

### 5.4 Post-mortem après rollback

**Documenter :**

1. **Cause de l'échec** : Erreur réseau, fichier corrompu, incompatibilité...
2. **Sites impactés** : Liste des sites en échec
3. **Actions correctives** : Correctifs à apporter
4. **Prévention** : Comment éviter ce problème à l'avenir

**Template post-mortem :**

```markdown
# Post-Mortem Rollback - [Date]

## Déploiement concerné

- Type : Mise à jour logicielle v1.3.0
- Cibles : 50 sites
- Phase atteinte : Canary (10% - 5 sites)

## Incident

- Taux d'échec : 40% (2/5 sites)
- Symptôme : Erreur "MODULE_NOT_FOUND" au démarrage

## Cause racine

- Dépendance npm manquante dans package.json

## Actions immédiates

- Rollback automatique déclenché
- Sites restaurés en v1.2.0
- Tous les sites fonctionnels

## Actions correctives

- Corriger package.json
- Ajouter test d'intégration pour les dépendances
- Revalider la v1.3.0 en local avant redéploiement

## Prévention

- Ajouter vérification automatique des dépendances avant release
- Améliorer les tests de smoke après déploiement
```

---

## 6. MODOP-C15 : GESTION DES SITES DÉCONNECTÉS

### 6.1 Mise en queue automatique

**Comportement du système :**

```
Déploiement lancé vers un site HORS LIGNE
          ↓
Système détecte que le site est déconnecté
          ↓
Déploiement mis en FILE D'ATTENTE (queue)
          ↓
Site se reconnecte au serveur central
          ↓
Système détecte la reconnexion
          ↓
Déploiements en attente sont exécutés automatiquement
```

**Avantages :**

- ✅ Pas besoin de redéployer manuellement
- ✅ Gestion automatique des sites intermittents
- ✅ Ordre préservé (FIFO)

### 6.2 Visualisation de la queue

**Dashboard → Sites → [Site] → Onglet "Commandes en attente"**

```
┌─────────────────────────────────────────────────────────┐
│   Commandes en attente - CESSON Handball               │
├─────────────────────────────────────────────────────────┤
│ 3 commandes en file d'attente                           │
│                                                          │
│ 1. Déploiement vidéo : sponsor_nike_2025.mp4           │
│    Créé le : 15/01/2025 10:30                           │
│    Tentatives : 0/3                                     │
│    Expire le : 16/01/2025 10:30 (24h)                   │
│                                                          │
│ 2. Mise à jour logicielle : v1.3.0                      │
│    Créé le : 15/01/2025 11:00                           │
│    Tentatives : 0/3                                     │
│    Expire le : 16/01/2025 11:00 (24h)                   │
│                                                          │
│ 3. Push configuration                                   │
│    Créé le : 15/01/2025 11:15                           │
│    Tentatives : 0/3                                     │
│    Expire le : 16/01/2025 11:15 (24h)                   │
│                                                          │
│ Actions :                                               │
│   [Forcer l'exécution]  [Vider la queue]                │
└─────────────────────────────────────────────────────────┘
```

### 6.3 Paramètres de la queue

| Paramètre                 | Valeur par défaut | Description                         |
| ------------------------- | ----------------- | ----------------------------------- |
| **Tentatives max**        | 3                 | Nombre de tentatives avant abandon  |
| **Expiration**            | 24h               | Durée avant suppression automatique |
| **Intervalle tentatives** | 5 min             | Temps entre deux tentatives         |

### 6.4 Gestion manuelle de la queue

**Forcer l'exécution immédiate :**

```bash
# Via l'API
curl -X POST https://neopro-central-production.up.railway.app/api/sites/{siteId}/queue/process \
  -H "Authorization: Bearer $TOKEN"
```

**Vider la queue :**

```bash
# Supprimer toutes les commandes en attente pour un site
curl -X DELETE https://neopro-central-production.up.railway.app/api/sites/{siteId}/queue \
  -H "Authorization: Bearer $TOKEN"
```

**Voir toutes les queues :**

```bash
# Résumé de toutes les queues
curl https://neopro-central-production.up.railway.app/api/sites/queue/summary \
  -H "Authorization: Bearer $TOKEN"

# Retourne :
{
  "total_queued": 15,
  "sites_with_pending": 5,
  "oldest_command": "2025-01-15T10:30:00Z"
}
```

### 6.5 Commandes temps réel (non mises en queue)

**Certaines commandes NE PEUVENT PAS être mises en queue :**

- `get_logs` : Lecture des logs en temps réel
- `get_system_info` : Informations système actuelles
- `get_config` : Configuration actuelle
- `network_diagnostics` : Diagnostic réseau temps réel
- `get_hotspot_config` : Configuration WiFi actuelle

**Si le site est hors ligne :**

- Ces commandes renvoient une erreur : "Site hors ligne"
- L'utilisateur doit attendre la reconnexion du site

---

## 7. CHECKLIST DE DÉPLOIEMENT

### Avant le déploiement

- [ ] Contenu validé (vidéo testée, config validée JSON)
- [ ] Sites cibles vérifiés (en ligne ou OK si hors ligne)
- [ ] Type de déploiement choisi (standard ou canary)
- [ ] Backup effectué (si mise à jour logicielle)
- [ ] Fenêtre de déploiement définie (éviter les heures de match)

### Pendant le déploiement

- [ ] Progression surveillée en temps réel
- [ ] Logs consultés en cas d'erreur
- [ ] Métriques de succès vérifiées (si canary)

### Après le déploiement

- [ ] Statut final vérifié (100% succès ou échecs documentés)
- [ ] Tests de validation effectués sur échantillon de sites
- [ ] Documentation mise à jour (si changement de procédure)
- [ ] Équipe support notifiée (si impact client)

---

## 8. TEMPS ESTIMÉS

| Type de déploiement             | Temps estimé                            |
| ------------------------------- | --------------------------------------- |
| Vidéo (1 site)                  | 2-5 min                                 |
| Vidéo (10 sites)                | 5-15 min (parallèle)                    |
| Configuration (1 site)          | 1 min                                   |
| Mise à jour logicielle (1 site) | 10-15 min                               |
| Mise à jour canary (50 sites)   | 3-4 heures (avec périodes de stabilité) |
| Rollback                        | 5-10 min                                |

---

## 9. KPI ET MÉTRIQUES

### Indicateurs de performance

- **Taux de succès des déploiements** : > 95%
- **Temps moyen de déploiement vidéo** : < 3 min/site
- **Taux de rollback** : < 5%

### Métriques à suivre

- Nombre de déploiements par semaine
- Types de déploiements les plus fréquents
- Causes d'échecs les plus courantes
- Temps moyen par type de déploiement

---

## 10. NOUVELLES FONCTIONNALITÉS (v2.27+)

### 10.1 Brouillons de Configuration (Config Drafts)

Depuis la v2.27, vous pouvez **préparer une configuration à l'avance** même si le Pi est hors ligne.

**Avantages :**

- ✅ Configurer un site avant que le Pi soit installé
- ✅ Valider que toutes les vidéos sont présentes
- ✅ Déploiement orchestré (vidéos + config en séquence)

**Workflow :**

```
Dashboard → Sites → [Site] → Onglet Contenu
│
├─ 1. Uploader les vidéos (zone d'upload contextuel)
│     └─ Vidéos automatiquement associées au site (badge ⭐)
│
├─ 2. Configurer le brouillon
│     └─ Sponsors, catégories, phases de match
│
├─ 3. Valider le brouillon
│     └─ Vérification des vidéos manquantes
│
└─ 4. Déployer le brouillon
      ├─ Phase 1 : Envoi des vidéos manquantes
      └─ Phase 2 : Application de la configuration
```

**Documentation complète :** [CONFIG_DRAFTS.md](../guides/CONFIG_DRAFTS.md)

### 10.2 Upload Contextuel de Vidéos

Les vidéos uploadées depuis l'onglet **Contenu** d'un site sont automatiquement associées à ce site :

- Apparaissent **en premier** dans les sélecteurs de vidéos
- Marquées d'un badge **⭐** dans la bibliothèque
- Endpoint dédié : `GET /api/content/videos/for-site/:siteId`

### 10.3 Timeline d'Activité (Debug Tab)

L'onglet **Debug** affiche maintenant une timeline des événements récents :

- Déploiements de vidéos
- Commandes exécutées
- Changements de configuration
- Alertes système

**Accès :**

```
Dashboard → Sites → [Site] → Onglet Debug → Section Timeline
```

### 10.4 Export Debug Bundle

Pour le support technique, vous pouvez exporter un **bundle de diagnostic complet** :

```
Dashboard → Sites → [Site] → Onglet Debug → "Export Debug Bundle"
```

**Contenu du bundle (JSON) :**

- Configuration (sanitisée)
- Version logicielle
- État de santé système (GPU, services, throttling)
- Logs récents (100 lignes)
- Diagnostics réseau
- État des buffers analytics
- Liste des vidéos locales

---

## 11. SUPPORT RASPBERRY PI 5

Depuis la v2.27, le **Raspberry Pi 5** est entièrement supporté.

### Différences Pi 4 vs Pi 5

| Aspect         | Pi 4          | Pi 5                       |
| -------------- | ------------- | -------------------------- |
| GPU            | VideoCore VI  | VideoCore VII              |
| Config GPU     | `gpu_mem=256` | V3D natif (aucun flag, v3.7.3+) |
| `vcgencmd gpu` | Affiche 256M  | Affiche 4M (normal)        |
| Décodage vidéo | Hardware      | CPU (FFmpeg) + GPU V3D     |

### Vérification après déploiement

```bash
# Identifier le modèle
ssh pi@neopro.local 'cat /proc/device-tree/model'

# Pi 4 : vérifier gpu_mem
ssh pi@neopro.local 'vcgencmd get_mem gpu'
# Doit afficher : gpu=256M

# Pi 5 : vérifier V3D natif (aucun flag GPU custom)
ssh pi@neopro.local 'pgrep -a chromium | grep -E "use-gl|use-angle|swiftshader"'
# Aucun résultat = OK (V3D natif actif)
```

### Problèmes connus Pi 5

Le dashboard peut afficher un faux avertissement "Mémoire GPU insuffisante (4M)" sur Pi 5. C'est normal car `vcgencmd get_mem gpu` retourne une valeur legacy. Le sync-agent v2.27+ détecte le modèle et ignore cette vérification.

---

**Version :** 1.2
**Dernière mise à jour :** Février 2026

**FIN DU MODOP-C12-15**
