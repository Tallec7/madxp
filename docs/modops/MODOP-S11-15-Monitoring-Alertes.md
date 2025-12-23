# MODOP-S11-15 : Monitoring & Alertes

**Version** : 1.0
**Date** : 23 décembre 2025
**Responsable** : Support / Ops
**Niveau requis** : Support Niveau 1-2
**Fréquence** : Réactif (sur déclenchement alerte)

---

## 1. OBJECTIF

Réagir efficacement aux alertes système pour maintenir la disponibilité et les performances de l'infrastructure Neopro.

## 2. PÉRIMÈTRE

### Ce MODOP couvre
- **MODOP-S11** : Réponse aux alertes CPU/Mémoire
- **MODOP-S12** : Réponse aux alertes température Raspberry Pi
- **MODOP-S13** : Réponse aux alertes disque plein
- **MODOP-S14** : Gestion sites hors ligne (timeout > 2 min)
- **MODOP-S15** : Analyse des logs Logtail/Winston

---

## 3. SYSTÈME D'ALERTING NEOPRO

### 3.1 Architecture

```
Métriques collectées (chaque site)
          ↓
Évaluation des seuils (alerting.service.ts)
          ↓
Alerte créée si seuil dépassé
          ↓
Notification envoyée (email, webhook, Slack)
          ↓
Dashboard affiche l'alerte
          ↓
Support/Ops réagit (ce MODOP)
```

### 3.2 Seuils par défaut

Définis dans `central-server/src/services/alerting.service.ts:50-123`

| Métrique | Seuil Warning | Seuil Critical | Durée | Cooldown | Escalade |
|----------|---------------|----------------|-------|----------|----------|
| **CPU** | 70% | 90% | 5 min | 15 min | 30 min |
| **Mémoire** | 80% | 95% | 5 min | 15 min | 30 min |
| **Température** | 65°C | 80°C | 1 min | 10 min | 15 min |
| **Disque** | 80% | 95% | Immédiat | 60 min | 120 min |
| **Site offline** | - | > 2 min | 2 min | 30 min | 60 min |
| **Déploiement failed** | - | 1 échec | Immédiat | 5 min | 30 min |

**Paramètres :**
- **Durée** : Temps pendant lequel le seuil doit être dépassé avant alerte
- **Cooldown** : Temps avant nouvelle alerte sur même métrique (évite le spam)
- **Escalade** : Temps avant escalade vers superviseur

### 3.3 Canaux de notification

| Canal | Configuration | Utilisation |
|-------|---------------|-------------|
| **Email** | support@neopro.fr | Alertes non-critiques (Warning) |
| **Webhook** | https://hooks.neopro.fr/alerts | Intégration avec systèmes tiers |
| **Slack** | #alerts-neopro | Alertes critiques (temps réel) |

---

## 4. MODOP-S11 : ALERTES CPU/MÉMOIRE

### 4.1 Alerte CPU élevé

**Email reçu :**

```
Objet : [WARNING] CPU élevé - CESSON Handball
De : alerts@neopro.fr

Avertissement: CPU élevé - Valeur actuelle: 75.0 (seuil: 70)

Site : CESSON Handball
Métrique : cpu_usage
Valeur : 75%
Seuil dépassé : 70% (warning)
Depuis : 5 minutes

Dashboard : https://neopro-central.onrender.com/sites/uuid-site
```

#### Étape 1 : Vérifier le contexte (2 min)

1. Se connecter au dashboard
2. Menu **Sites** → **CESSON**
3. Consulter les métriques en temps réel :
   - CPU : 75% (confirmer)
   - Uptime : Combien de temps depuis le dernier redémarrage ?
   - Déploiements récents : Y a-t-il eu un déploiement dans les dernières heures ?

**Questions à se poser :**
- ✅ Le CPU est-il monté progressivement ou brutalement ?
- ✅ Y a-t-il eu un déploiement récent qui pourrait expliquer ?
- ✅ D'autres sites sont-ils affectés en même temps ?

#### Étape 2 : Diagnostic (3 min)

```bash
# Se connecter au site
ssh pi@neopro.local

# Voir les processus les plus gourmands
top -n 1 | head -20

# Exemple de sortie :
# PID  USER      PR  NI    VIRT    RES  %CPU  %MEM     TIME+ COMMAND
# 1234 pi        20   0  500000  80000  45.0   2.0   0:30.00 node
# 5678 pi        20   0  300000  60000  30.0   1.5   0:15.00 chromium

# Identifier le processus problématique
ps aux | grep node
```

**Causes courantes :**

| Processus | Cause probable | Solution |
|-----------|----------------|----------|
| `node` (neopro-app) | Boucle infinie ou fuite mémoire | Redémarrer le service |
| `chromium` (kiosk) | Vidéo lourde en lecture | Normal si en cours de lecture |
| `ffmpeg` | Conversion vidéo | Attendre la fin du processus |
| Inconnu | Processus zombie | `kill -9 <PID>` |

#### Étape 3 : Actions correctives

**Si CPU normal (< 70%) au moment de la vérification :**
- Probablement un pic temporaire
- Marquer l'alerte comme "Resolved"
- Continuer la surveillance

**Si CPU toujours élevé (> 70%) :**

**Action 1 : Redémarrer le service neopro-app**

```bash
sudo systemctl restart neopro-app

# Attendre 30 secondes
sleep 30

# Vérifier le CPU
top -n 1 | head -5
```

**Action 2 : Si le problème persiste, redémarrer le boîtier**

```bash
# Depuis le dashboard : Actions rapides → Redémarrer le boîtier
# OU via SSH :
sudo reboot
```

**Action 3 : Si le problème persiste après redémarrage**

- Escalader au niveau 2 (voir section 8)
- Fournir les logs : `sudo journalctl -u neopro-app -n 200`

#### Étape 4 : Documenter et clôturer (2 min)

**Dans le dashboard :**
1. Aller sur l'alerte
2. Cliquer sur "Acknowledge" (acquitter)
3. Ajouter un commentaire :
   ```
   CPU élevé lié à un processus node en boucle.
   Action : Redémarrage neopro-app
   Résultat : CPU retourné à 25%
   Temps de résolution : 10 min
   ```
4. Marquer comme "Resolved"

### 4.2 Alerte Mémoire élevée

**Email reçu :**

```
Objet : [CRITICAL] Mémoire élevée - RENNES Volley
De : alerts@neopro.fr

CRITIQUE: Mémoire élevée - Valeur actuelle: 96.0 (seuil: 95)

Site : RENNES Volley
Métrique : memory_usage
Valeur : 96%
Seuil dépassé : 95% (critical)
Depuis : 5 minutes
```

**🚨 ALERTE CRITIQUE = ACTION IMMÉDIATE**

#### Diagnostic rapide

```bash
ssh pi@neopro.local

# Voir la mémoire
free -h

# Exemple :
#               total        used        free      shared  buff/cache   available
# Mem:           3.8G        3.7G         50M        10M        100M         80M
# Swap:          100M         50M         50M

# Processus les plus gourmands en mémoire
ps aux --sort=-%mem | head -10
```

#### Actions correctives immédiates

**Action 1 : Libérer la mémoire cache**

```bash
sudo sync
sudo sh -c 'echo 3 > /proc/sys/vm/drop_caches'

# Vérifier
free -h
```

**Action 2 : Redémarrer le service le plus gourmand**

```bash
# Identifier le service (généralement node ou chromium)
sudo systemctl restart neopro-app

# OU si c'est chromium (kiosk)
sudo systemctl restart neopro-kiosk
```

**Action 3 : Si mémoire toujours > 95%, redémarrer le boîtier**

```bash
sudo reboot
```

**⚠️ Si le problème revient après redémarrage :**
- Fuite mémoire probable dans l'application
- Escalader au niveau 3 (développement)
- Fournir : logs + résultat de `top` + `ps aux --sort=-%mem`

---

## 5. MODOP-S12 : ALERTES TEMPÉRATURE

### 5.1 Alerte température élevée

**Email reçu :**

```
Objet : [CRITICAL] Température élevée - NANTES Basket
De : alerts@neopro.fr

CRITIQUE: Température élevée - Valeur actuelle: 82.0 (seuil: 80)

Site : NANTES Basket
Métrique : temperature
Valeur : 82°C
Seuil dépassé : 80°C (critical)
Depuis : 1 minute
```

**🚨 DANGER : Température > 80°C peut endommager le Raspberry Pi**

#### Actions IMMÉDIATES (< 5 min)

**Action 1 : Vérifier la température actuelle**

```bash
ssh pi@neopro.local 'vcgencmd measure_temp'

# Exemple : temp=82.5'C
```

**Si température > 85°C → ÉTEINDRE LE BOÎTIER IMMÉDIATEMENT**

```bash
# Dashboard : Actions → Éteindre le boîtier
# OU via SSH :
sudo shutdown -h now
```

**Si température 80-85°C → Réduire la charge**

```bash
# Arrêter le mode kiosk (économise CPU)
sudo systemctl stop neopro-kiosk

# Attendre 2 minutes
sleep 120

# Vérifier la température
vcgencmd measure_temp
```

#### Action 2 : Contacter le client (10 min)

**Email type :**

```
Objet : URGENT - Température élevée sur votre boîtier Neopro

Bonjour,

Nous avons détecté une température critique sur votre boîtier Neopro (82°C).

Actions immédiates à effectuer :

1. Vérifier que le boîtier est dans un endroit ventilé
2. Éloigner le boîtier de toute source de chaleur
3. Vérifier que les grilles de ventilation ne sont pas obstruées
4. Si possible, ajouter un ventilateur externe

Le boîtier a été partiellement arrêté pour éviter la surchauffe.

Merci de nous confirmer la prise en compte de ces actions.

Cordialement,
Support Neopro
```

#### Action 3 : Surveillance (30 min)

Surveiller la température toutes les 5 minutes :

```bash
# Script de surveillance
while true; do
  ssh pi@neopro.local 'vcgencmd measure_temp'
  sleep 300  # 5 minutes
done
```

**Objectif : Descendre sous 70°C**

#### Solutions long terme

**Recommandations au client :**
1. Installer un ventilateur (dissipateur thermique + ventilateur 5V)
2. Installer un boîtier avec ventilation active
3. Éloigner des sources de chaleur (radiateurs, projecteurs)
4. Éviter de poser le Pi dans un boîtier fermé

---

## 6. MODOP-S13 : ALERTES DISQUE PLEIN

### 6.1 Alerte disque plein

**Email reçu :**

```
Objet : [CRITICAL] Disque presque plein - BREST Handball
De : alerts@neopro.fr

CRITIQUE: Disque presque plein - Valeur actuelle: 96.0 (seuil: 95)

Site : BREST Handball
Métrique : disk_usage
Valeur : 96%
Seuil dépassé : 95% (critical)
Depuis : Immédiat
```

#### Diagnostic (3 min)

```bash
ssh pi@neopro.local

# Voir l'espace disque
df -h

# Exemple :
# Filesystem      Size  Used Avail Use% Mounted on
# /dev/root        30G   29G  500M  96% /

# Identifier les gros fichiers/répertoires
du -sh /home/pi/neopro/* | sort -h

# Exemple :
# 5.2G    /home/pi/neopro/videos
# 3.8G    /home/pi/neopro/logs
# 500M    /home/pi/neopro/backups
```

#### Actions correctives (10 min)

**Action 1 : Nettoyer les logs**

```bash
# Voir la taille des logs
du -sh /home/pi/neopro/logs/*

# Supprimer les logs > 7 jours
find /home/pi/neopro/logs -name "*.log" -mtime +7 -delete

# Vider les logs système anciens
sudo journalctl --vacuum-time=7d

# Vérifier l'espace libéré
df -h
```

**Action 2 : Nettoyer les backups**

```bash
# Voir les backups
ls -lh /home/pi/neopro/backups/

# Garder seulement les 3 derniers
cd /home/pi/neopro/backups
ls -t | tail -n +4 | xargs rm -rf

# Vérifier
df -h
```

**Action 3 : Analyser les vidéos (si toujours > 90%)**

```bash
# Lister les vidéos par taille
du -sh /home/pi/neopro/videos/* | sort -h

# Si des vidéos très volumineuses (> 500MB) :
# - Contacter le client pour validation
# - Supprimer les vidéos obsolètes ou non utilisées
```

**Action 4 : Configurer la rotation automatique**

```bash
# Éditer la configuration logrotate
sudo nano /etc/logrotate.d/neopro

# Contenu :
/home/pi/neopro/logs/*.log {
    daily
    rotate 7
    compress
    missingok
    notifempty
}

# Sauvegarder : Ctrl+X, Y, Enter
```

#### Prévention

**Activer le nettoyage automatique (recommandé) :**

```bash
# Créer un cron job pour nettoyer les logs chaque semaine
sudo crontab -e

# Ajouter :
0 3 * * 0 find /home/pi/neopro/logs -name "*.log" -mtime +7 -delete
0 3 * * 0 sudo journalctl --vacuum-time=7d
```

---

## 7. MODOP-S14 : SITES HORS LIGNE

### 7.1 Alerte site hors ligne

**Email reçu :**

```
Objet : [CRITICAL] Site hors ligne - LORIENT Basket
De : alerts@neopro.fr

CRITIQUE: Site hors ligne - Valeur actuelle: 1.0 (seuil: 1)

Site : LORIENT Basket
Métrique : site_offline
Valeur : 1 (Hors ligne)
Seuil dépassé : > 2 minutes
Depuis : 2 minutes
```

#### Étape 1 : Vérifier la connectivité (2 min)

**Depuis le dashboard :**
1. Menu Sites → LORIENT
2. Vérifier **Dernière connexion** : Ex. "Il y a 5 minutes"
3. Consulter **Historique de connexions** (si disponible)

**Test de ping :**

```bash
# Tester la connectivité
ping neopro.local  # ou l'IP du site

# Si ping OK → Le Pi est allumé mais ne se connecte pas au serveur
# Si ping KO → Le Pi est éteint ou sans réseau
```

#### Étape 2 : Diagnostic selon le cas

**Cas 1 : Ping OK, mais pas de connexion WebSocket au serveur central**

```bash
# Se connecter au Pi
ssh pi@neopro.local

# Vérifier le service sync-agent
sudo systemctl status neopro-sync

# Si inactif → Redémarrer
sudo systemctl restart neopro-sync

# Voir les logs
sudo journalctl -u neopro-sync -n 50

# Rechercher les erreurs de connexion :
# - "Connection refused"
# - "401 Unauthorized"
# - "ENOTFOUND"
```

**Cas 2 : Ping KO (Pi inaccessible)**

Contacter le client :

```
Objet : Votre boîtier Neopro est hors ligne

Bonjour,

Nous avons détecté que votre boîtier Neopro est hors ligne depuis [durée].

Pouvez-vous vérifier les points suivants :

1. Le boîtier est-il allumé ? (LED verte allumée)
2. Le câble Ethernet est-il bien branché ?
3. Votre connexion Internet fonctionne-t-elle ?

Si le problème persiste, merci de nous contacter.

Cordialement,
Support Neopro
```

#### Étape 3 : Résolution automatique

**Si le site se reconnecte dans les 30 minutes :**
- L'alerte sera automatiquement marquée comme "Resolved"
- Vérifier qu'il n'y a pas de déconnexions fréquentes (pattern)

**Si le site reste hors ligne > 24h :**
- Créer un ticket de suivi
- Relancer le client après 48h si pas de réponse
- Escalader si > 72h sans nouvelles

---

## 8. MODOP-S15 : ANALYSE DES LOGS

### 8.1 Accès aux logs centralisés

**Via Logtail (si configuré) :**
1. Se connecter à Logtail : https://logtail.com
2. Sélectionner le projet Neopro
3. Filtrer par :
   - Source : `central-server` ou `raspberry-pi`
   - Level : `error`, `warn`
   - Time range : Last 24h

**Via le dashboard central :**
1. Menu **Sites** → [Site]
2. Actions rapides → **Voir les logs**
3. Sélectionner le type : app, nginx, system

### 8.2 Logs Winston (serveur central)

**Structure des logs :**

```json
{
  "level": "error",
  "message": "Deployment failed",
  "timestamp": "2025-01-23T10:30:00.000Z",
  "context": {
    "siteId": "uuid-site",
    "deploymentId": "uuid-deployment",
    "error": "Connection timeout"
  }
}
```

**Filtres utiles :**

```bash
# Logs d'erreur des dernières 24h
level:error AND timestamp:[NOW-24h TO NOW]

# Logs pour un site spécifique
context.siteId:"uuid-site"

# Logs de déploiement échoué
message:"Deployment failed"
```

### 8.3 Erreurs courantes et solutions

| Erreur dans les logs | Cause | Solution |
|----------------------|-------|----------|
| `ECONNREFUSED` | Service arrêté | Redémarrer le service |
| `EADDRINUSE` | Port déjà utilisé | Tuer le processus, redémarrer |
| `MODULE_NOT_FOUND` | Dépendances npm manquantes | `npm install` |
| `Permission denied` | Permissions incorrectes | Fix permissions (MODOP-S06) |
| `ETIMEDOUT` | Timeout réseau | Vérifier connectivité |
| `401 Unauthorized` | API key invalide | Réenregistrer le site |
| `502 Bad Gateway` | neopro-app ne répond pas | Redémarrer neopro-app |

### 8.4 Analyse proactive

**Tous les lundis matin (15 min) :**

1. Se connecter à Logtail ou dashboard
2. Filtrer les erreurs des 7 derniers jours
3. Identifier les erreurs récurrentes (> 5 occurrences)
4. Créer des tickets pour les problèmes systémiques

**Template d'analyse :**

```markdown
# Analyse Logs Hebdomadaire - Semaine du [Date]

## Erreurs les plus fréquentes
1. ECONNREFUSED (15 occurrences, 3 sites)
   - Cause : neopro-sync redémarre trop souvent
   - Action : Stabiliser le service sync

2. Permission denied (8 occurrences, 2 sites)
   - Cause : Permissions nginx incorrectes après mise à jour
   - Action : Corriger les permissions lors du déploiement

## Nouveaux types d'erreurs
- MODULE_NOT_FOUND sur axios (1 occurrence)
  - Action : Investiguer package.json

## Recommandations
- Améliorer la stabilité de neopro-sync
- Ajouter vérification des permissions post-déploiement
```

---

## 9. ESCALADE

### 9.1 Matrice d'escalade

| Niveau | Délai d'intervention | Critères |
|--------|----------------------|----------|
| **Support N1** | < 30 min | Alertes Warning, sites hors ligne < 24h |
| **Support N2** | < 1h | Alertes Critical non résolues en 30 min |
| **Ops N3** | < 30 min | Serveur central down, > 10 sites affectés |
| **Dev** | < 4h | Bugs applicatifs, fuites mémoire |

### 9.2 Informations à fournir lors de l'escalade

**Template :**

```markdown
# Escalade Ticket #[ID]

## Résumé
Site : CESSON Handball
Problème : CPU > 90% depuis 1h, redémarrages sans effet

## Contexte
- Alerte déclenchée : 23/01/2025 10:30
- Actions effectuées :
  - Redémarrage neopro-app : 10:40 (échec)
  - Redémarrage complet Pi : 10:50 (échec)
- Situation actuelle : CPU toujours à 92%

## Logs et diagnostics
- Logs neopro-app : [lien ou fichier joint]
- Résultat `top` : [fichier joint]
- Processus gourmand : node (PID 1234) - 85% CPU

## Impact client
- Site inutilisable (interface lente)
- Match prévu ce soir à 20h (4h restantes)

## Demande
Investigation urgente + correctif avant le match
```

---

## 10. CHECKLIST DE RÉPONSE AUX ALERTES

### Checklist générale (toute alerte)

- [ ] Alerte lue et comprise (< 5 min après réception)
- [ ] Contexte vérifié sur le dashboard
- [ ] Diagnostic effectué (logs, métriques)
- [ ] Action corrective appliquée
- [ ] Résultat vérifié (alerte résolue ?)
- [ ] Alerte acquittée et documentée
- [ ] Client notifié si impact (email/téléphone)
- [ ] Escalade effectuée si non résolu en 30 min

### Checklist alerte CRITICAL

- [ ] ⚠️ Intervention immédiate (< 10 min)
- [ ] 🚨 Escalade automatique si non résolu en 30 min
- [ ] 📞 Notification client systématique
- [ ] 📝 Post-mortem si impact client > 1h

---

## 11. KPI ET MÉTRIQUES

### Objectifs de réponse aux alertes
- **Temps de réponse (Warning)** : < 30 min
- **Temps de réponse (Critical)** : < 10 min
- **Taux de résolution niveau 1** : > 80%
- **Taux d'escalade** : < 20%

### Métriques à suivre
- Nombre d'alertes par jour/semaine
- Temps moyen de résolution par type d'alerte
- Taux de faux positifs (alertes résolues automatiquement)
- Nombre d'escalades par semaine

---

**FIN DU MODOP-S11-15**
