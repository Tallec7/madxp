# MODOP-S04-05 : Diagnostic à Distance

**Version** : 1.0
**Date** : 23 décembre 2025
**Responsable** : Support Technique
**Niveau requis** : Support Niveau 1-2

---

## 1. OBJECTIF

Permettre au support de diagnostiquer à distance les problèmes d'un boîtier Neopro sans intervention physique sur site, via les outils de monitoring et de commande à distance disponibles depuis le dashboard central.

## 2. PÉRIMÈTRE

### Situations couvertes

- Boîtier signalé comme "hors ligne" sur le dashboard
- Problèmes de performance (CPU, mémoire, température)
- Erreurs de déploiement vidéo
- Problèmes de connexion réseau
- Services arrêtés ou en erreur

### Hors périmètre

- Problèmes matériels nécessitant une intervention physique
- Remplacement du Raspberry Pi
- Problèmes de connectivité Internet (côté FAI)

## 3. PRÉREQUIS

### Outils requis

- Accès au dashboard central : https://neopro-central-production.up.railway.app
- Compte avec permissions support/admin
- Accès SSH au boîtier (si le boîtier est accessible)

### Informations nécessaires

- Nom du club ou ID du site
- Description du problème signalé
- Heure de début du problème (si connue)

## 4. PROCÉDURE

### ÉTAPE 1 : Vérification du statut sur le Dashboard (2 min)

#### 4.1 Accéder à la page du site

1. Se connecter au dashboard central
2. Menu **Sites** → **Liste des sites**
3. Rechercher le club concerné
4. Cliquer sur la carte du site

#### 4.2 Vérifier le statut de connexion

| Indicateur        | Signification                        | Action                                     |
| ----------------- | ------------------------------------ | ------------------------------------------ |
| 🟢 **Connecté**   | WebSocket actif                      | Passer à l'étape 2 (diagnostic en ligne)   |
| 🟡 **Instable**   | Vu récemment (<2 min) mais pas de WS | Attendre 2 minutes, actualiser la page     |
| 🔴 **Hors ligne** | Aucune connexion depuis >2 min       | Passer à l'étape 3 (diagnostic hors ligne) |
| ⚪ **Inconnu**    | Jamais connecté                      | Vérifier l'installation initiale           |

#### 4.3 Consulter les informations système

- **Dernière connexion** : Noter l'heure
- **Version logicielle** : Vérifier qu'elle n'est pas trop ancienne
- **Uptime** : Un uptime court peut indiquer des redémarrages fréquents
- **Métriques** : CPU, mémoire, température, disque

**🚨 POINT DE DÉCISION**

- Si **Connecté (🟢)** → Continuer à l'étape 2
- Si **Hors ligne (🔴)** → Aller à l'étape 3

---

### ÉTAPE 2 : Diagnostic en ligne (boîtier connecté) (5-10 min)

Le boîtier est connecté au serveur central via WebSocket. Vous pouvez utiliser les commandes à distance.

#### 2.1 Diagnostic réseau automatique

1. Dans la section **Actions rapides**, cliquer sur **Diagnostic réseau** (🌐)
2. Attendre 10-15 secondes que les tests s'exécutent
3. Analyser les résultats :

**Interprétation des résultats :**

| Situation                       | Diagnostic probable                     | Action recommandée                                       |
| ------------------------------- | --------------------------------------- | -------------------------------------------------------- |
| ❌ Passerelle                   | Câble réseau débranché ou problème DHCP | Demander au client de vérifier le câble Ethernet         |
| ✅ Passerelle, ❌ Internet      | Routeur sans accès internet             | Demander au client de vérifier sa box internet           |
| ✅ Internet, ❌ DNS             | Problème de configuration DNS           | Vérifier `/etc/resolv.conf` via SSH                      |
| ✅ Internet, ❌ Serveur central | Pare-feu ou serveur indisponible        | Vérifier le statut du serveur central sur Render         |
| Perte de paquets > 10%          | Connexion très instable                 | WiFi faible ou réseau encombré - proposer câble Ethernet |
| Port 443 fermé                  | Pare-feu bloque HTTPS                   | Demander ouverture port 443 dans le pare-feu             |
| SSL invalide                    | Certificat expiré ou problème de date   | Vérifier la date système du Pi                           |
| Reconnexions > 5                | Interface réseau instable               | Problème câble ou WiFi - demander changement de câble    |

#### 2.2 Récupération des logs système

1. Cliquer sur **Voir les logs** dans la section Actions rapides
2. Sélectionner le type de log :
   - **app** : Logs de l'application principale (port 3000)
   - **nginx** : Logs du serveur web
   - **system** : Logs système globaux
3. Rechercher les erreurs récentes (⚠️ warning, ❌ error)

**Erreurs courantes à rechercher :**

| Erreur dans les logs        | Cause probable             | Solution                                      |
| --------------------------- | -------------------------- | --------------------------------------------- |
| `ECONNREFUSED`              | Service arrêté             | Redémarrer le service concerné                |
| `EADDRINUSE`                | Port déjà utilisé          | Tuer le processus sur le port (voir 2.4)      |
| `MODULE_NOT_FOUND`          | Dépendances npm manquantes | Redéployer via dashboard ou SSH `npm install` |
| `Permission denied`         | Problème de permissions    | Fix permissions (voir MODOP-S06)              |
| `No such file or directory` | Fichier manquant           | Vérifier le déploiement                       |
| `502 Bad Gateway` (nginx)   | neopro-app ne répond pas   | Redémarrer neopro-app                         |

#### 2.3 Vérification des services systemd

1. Cliquer sur **Informations système** dans Actions rapides
2. Vérifier l'état de chaque service :
   - ✅ `neopro-app` : Application principale (Socket.IO - port 3000)
   - ✅ `neopro-admin` : Interface admin (port 8080)
   - ✅ `nginx` : Serveur web (port 80)
   - ✅ `neopro-sync` : Agent de synchronisation avec le central
   - ⚠️ `hostapd` : Hotspot WiFi (optionnel)
   - ⚠️ `neopro-kiosk` : Mode kiosque (optionnel)

**Si un service est ❌ inactif ou en erreur :**

1. Noter le nom du service
2. Consulter les logs de ce service (étape 2.2)
3. Essayer un redémarrage (étape 2.4)

#### 2.4 Redémarrage de service à distance

**⚠️ Attention : Ne redémarrer que les services nécessaires**

1. Dans la section **Actions rapides**, cliquer sur **Redémarrer un service**
2. Sélectionner le service à redémarrer :
   - `neopro-app` : Application principale
   - `neopro-admin` : Interface admin
   - `nginx` : Serveur web
   - `all` : Tous les services Neopro
3. Confirmer le redémarrage
4. Attendre 10-15 secondes
5. Vérifier le statut du service

**Ordre de redémarrage recommandé en cas de problème global :**

1. `neopro-app` (application principale)
2. `nginx` (serveur web)
3. `neopro-sync` (synchronisation)

#### 2.5 Vérification des métriques système

Consulter les métriques en temps réel :

| Métrique        | Seuil Warning | Seuil Critical | Action si dépassé                                |
| --------------- | ------------- | -------------- | ------------------------------------------------ |
| **CPU**         | > 70%         | > 90%          | Identifier processus gourmand via SSH `top`      |
| **Mémoire**     | > 80%         | > 95%          | Vérifier les fuites mémoire, redémarrer services |
| **Température** | > 65°C        | > 80°C         | Vérifier ventilation, éteindre temporairement    |
| **Disque**      | > 80%         | > 95%          | Nettoyer les logs, supprimer anciennes vidéos    |

**Si les seuils critiques sont atteints :**

1. Créer une alerte dans le système (voir MODOP-S11-15)
2. Contacter le client pour intervention rapide
3. Si possible, redémarrer le boîtier à distance

#### 2.6 Redémarrage complet du boîtier

**⚠️ Uniquement en dernier recours**

1. Prévenir le client qu'un redémarrage va avoir lieu
2. Dans Actions rapides, cliquer sur **Redémarrer le boîtier**
3. Confirmer le redémarrage
4. Attendre 2-3 minutes
5. Vérifier la reconnexion sur le dashboard

---

### ÉTAPE 3 : Diagnostic hors ligne (boîtier non connecté) (10-20 min)

Le boîtier n'est pas connecté au serveur central. Les commandes à distance ne sont pas disponibles.

#### 3.1 Vérifier l'historique de connexion

1. Consulter **Dernière connexion** : si récente (<1h), le problème est nouveau
2. Consulter **Historique des connexions** (si disponible)
3. Vérifier s'il y a eu des déploiements récents qui auraient pu causer le problème

#### 3.2 Tentative de connexion SSH directe

**Si vous avez l'adresse IP ou le hostname du boîtier :**

```bash
# Tester la connexion réseau
ping neopro.local  # ou l'IP du boîtier

# Connexion SSH (si accessible)
ssh pi@neopro.local
```

**Si SSH fonctionne** → Le boîtier est allumé et accessible, passer à l'étape 3.3

**Si SSH échoue** :

- Contacter le client pour vérifier que le boîtier est allumé
- Vérifier que le client est connecté au même réseau
- Demander au client de redémarrer le boîtier physiquement

#### 3.3 Diagnostic via SSH

**Une fois connecté en SSH, exécuter le script de diagnostic complet :**

```bash
cd /home/pi/neopro
./scripts/diagnose-pi.sh
```

**Le script vérifie automatiquement (16 catégories, v3.45.1+) :**

- ✅ Version Node.js (v18+ requis)
- ✅ Paquets apt critiques (hostapd, dnsmasq, nginx, ffmpeg, avahi-daemon)
- ✅ Paquets apt recommandés (unclutter-xfixes, chromium, cec-utils, firmware-realtek)
- ✅ Services systemd — état (running/failed/inactive)
- ✅ Services systemd — installation (.service files)
- ✅ Masquage curseur (mode TV)
- ✅ Ports ouverts (80, 3000, 8080)
- ✅ Fichiers et répertoires déployés
- ✅ node_modules (server, admin, sync-agent)
- ✅ Webapp Angular (index.html, main-\*.js)
- ✅ Config Nginx (syntaxe, routes, site-enabled)
- ✅ WiFi AP (interface, mode AP, SSID, IP statique)
- ✅ Permissions (/home/pi, club-config.json, www-data group)
- ✅ Configuration GPU
- ✅ Espace disque
- ✅ Informations de version (VERSION, release.json)

**Mode JSON pour automation :**

```bash
# Mode humain (défaut)
./scripts/diagnose-pi.sh

# Mode JSON (pour automation, intégré dans deploy-remote.sh et update-software.js)
./scripts/diagnose-pi.sh --json

# Mode silencieux (erreurs uniquement)
./scripts/diagnose-pi.sh --quiet
```

Le code de retour = nombre d'erreurs (0 = Pi sain).

**Analyser la sortie du script :**

```
╔════════════════════════════════════════════════════════════════╗
║              DIAGNOSTIC RASPBERRY PI NEOPRO                    ║
╚════════════════════════════════════════════════════════════════╝

>>> Services systemd
✓ neopro-app      : active (running)
✗ nginx           : inactive (dead)  ← PROBLÈME ICI

>>> Ports
✓ Port 3000 : LISTEN (node)
✗ Port 80   : n'écoute PAS           ← PROBLÈME ICI
```

#### 3.4 Vérification manuelle des services

```bash
# Statut de tous les services
sudo systemctl status neopro-app neopro-admin neopro-sync nginx

# Redémarrer un service défaillant
sudo systemctl restart nginx
sudo systemctl restart neopro-app

# Vérifier les logs en temps réel
sudo journalctl -u neopro-app -f
```

#### 3.5 Vérification de la configuration sync-agent

**Si le boîtier ne se connecte jamais au serveur central :**

```bash
# Vérifier que le site est enregistré
cat /etc/neopro/site.conf

# Devrait contenir :
# SITE_ID=...
# SITE_NAME=...
# API_KEY=...
```

**Si le fichier est vide ou manquant :**

```bash
# Réenregistrer le site
cd /home/pi/neopro/sync-agent
sudo node scripts/register-site.js
sudo systemctl restart neopro-sync
```

#### 3.6 Vérification de la connectivité Internet

```bash
# Test de ping Internet
ping -c 5 8.8.8.8

# Test de résolution DNS
nslookup google.com

# Test de connexion au serveur central
curl -I https://neopro-central-production.up.railway.app

# Vérifier la passerelle
ip route show default
```

**Si pas d'Internet :**

- Vérifier la configuration réseau du Pi
- Demander au client de vérifier sa box Internet
- Vérifier les câbles Ethernet

#### 3.7 Script de réparation fleet (v3.7.14+)

**Script tout-en-un pour corriger les problèmes courants** (TKIP, services manquants, GPU, permissions) :

```bash
# Le script est livré par OTA dans /home/pi/neopro/scripts/
sudo /home/pi/neopro/scripts/fix-fleet-pi.sh

# Le script détecte automatiquement :
# - Modèle Pi (4 vs 5)
# - Type de connexion (Ethernet vs WiFi)
# - Nom du site
# Et applique les corrections adaptées (7 étapes)
```

#### 3.8 Réparation manuelle des permissions

**Si les logs montrent "Permission denied" :**

```bash
# Script de réparation automatique
sudo chmod 755 /home/pi
sudo chmod 755 /home/pi/neopro
sudo chown -R www-data:www-data /home/pi/neopro/webapp/
sudo chown -R pi:pi /home/pi/neopro/server
sudo chown -R pi:pi /home/pi/neopro/admin
sudo find /home/pi/neopro/webapp -type f -exec chmod 644 {} \;
sudo find /home/pi/neopro/webapp -type d -exec chmod 755 {} \;

# Redémarrer les services
sudo systemctl restart nginx
sudo systemctl restart neopro-app
```

---

### ÉTAPE 4 : Escalade et documentation (5 min)

#### 4.1 Si le problème est résolu

1. **Documenter la résolution** :
   - Cause identifiée
   - Actions effectuées
   - Temps de résolution
2. **Mettre à jour le ticket support** (si existant)
3. **Notifier le client** de la résolution
4. **Vérifier la stabilité** 30 minutes après

#### 4.2 Si le problème persiste

1. **Escalader au niveau 2** si :
   - Problème matériel suspecté
   - Problème réseau complexe
   - Besoin d'intervention sur le serveur central
2. **Collecter les informations de diagnostic** :

   ```bash
   # Exporter les logs
   ssh pi@neopro.local 'sudo journalctl -u neopro-app -n 200' > logs-app.txt
   ssh pi@neopro.local 'sudo journalctl -u neopro-sync -n 200' > logs-sync.txt
   ssh pi@neopro.local 'sudo tail -200 /home/pi/neopro/logs/nginx-error.log' > logs-nginx.txt

   # Exporter le diagnostic
   ssh pi@neopro.local './scripts/diagnose-pi.sh' > diagnostic.txt
   ```

3. **Créer un ticket escaladé** avec :
   - Nom du club et ID du site
   - Description détaillée du problème
   - Actions déjà effectuées
   - Logs et diagnostics
   - Impact client

---

## 5. CHECKLIST DE DIAGNOSTIC

### Checklist rapide (5 min)

- [ ] Statut de connexion vérifié sur le dashboard
- [ ] Dernière connexion et métriques consultées
- [ ] Diagnostic réseau exécuté (si connecté)
- [ ] Logs consultés pour erreurs récentes
- [ ] Services systemd vérifiés

### Checklist complète (15 min)

- [ ] Tout ci-dessus +
- [ ] Connexion SSH testée
- [ ] Script `diagnose-pi.sh` exécuté
- [ ] Configuration sync-agent vérifiée
- [ ] Connectivité Internet testée
- [ ] Services redémarrés si nécessaire
- [ ] Résolution documentée ou escalade effectuée

---

## 6. TEMPS ESTIMÉS

| Scénario                                 | Temps estimé |
| ---------------------------------------- | ------------ |
| Diagnostic simple (service à redémarrer) | 5 min        |
| Diagnostic complet en ligne              | 10-15 min    |
| Diagnostic hors ligne avec SSH           | 15-20 min    |
| Diagnostic + escalade                    | 25-30 min    |

---

## 7. KPI ET MÉTRIQUES

### Indicateurs de performance

- **Temps moyen de diagnostic** : < 15 min
- **Taux de résolution en niveau 1** : > 70%
- **Taux de résolution sans SSH** : > 50% (via dashboard uniquement)

### Métriques à suivre

- Nombre de diagnostics effectués par semaine
- Types de problèmes les plus fréquents
- Temps de résolution moyen par type de problème

---

## 8. ANNEXES

### A. Commandes SSH utiles

```bash
# Voir tous les services
systemctl list-units --type=service | grep neopro

# Voir les logs en temps réel
sudo journalctl -f

# Vérifier l'espace disque
df -h

# Vérifier la mémoire
free -h

# Vérifier la température
vcgencmd measure_temp

# Vérifier les processus
top -n 1

# Redémarrer le Pi
sudo reboot
```

### B. Erreurs courantes et solutions rapides

| Erreur                     | Solution rapide                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------ |
| Port 80 non accessible     | `sudo systemctl restart nginx`                                                       |
| Application ne démarre pas | `cd /home/pi/neopro/server && sudo npm install && sudo systemctl restart neopro-app` |
| Disque plein               | Nettoyer `/home/pi/neopro/logs/` et `/var/log/`                                      |
| Température > 80°C         | Éteindre, vérifier ventilation                                                       |
| Site non enregistré        | `cd /home/pi/neopro/sync-agent && sudo npm run register`                             |

### C. Contacts et escalade

- **Support Niveau 2** : support-n2@neopro.fr
- **Support Niveau 3** : technique@neopro.fr
- **Urgence critique** : +33 X XX XX XX XX

---

**FIN DU MODOP-S04-05**
