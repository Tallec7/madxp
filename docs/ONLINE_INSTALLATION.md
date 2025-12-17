# Installation en ligne Neopro

Guide pour configurer et utiliser l'installation en ligne de Neopro via curl depuis Internet.

## 🎯 Concept

Au lieu de créer une image golden de 58GB, on héberge un script d'installation sur GitHub Pages qui :
1. Se télécharge lui-même sur le Pi
2. Télécharge tous les fichiers d'installation depuis GitHub
3. Exécute l'installation complète

**Avantages :**
- ✅ Pas besoin de créer/distribuer des images de 58GB
- ✅ Installation toujours à jour (dernière version sur main)
- ✅ Aussi simple qu'une commande
- ✅ Fonctionne sur n'importe quelle taille de carte SD
- ✅ Pas de problème de compatibilité Mac/Linux

**Inconvénient :**
- Nécessite une connexion Internet lors de l'installation (15-20 min)

---

## 📋 Configuration requise (une seule fois)

### 1. Activer GitHub Pages sur votre repository

**Via l'interface GitHub :**

1. Allez sur votre repository : https://github.com/Tallec7/neopro
2. Cliquez sur **Settings** (⚙️)
3. Dans le menu latéral, cliquez sur **Pages**
4. Sous "Build and deployment" :
   - **Source** : GitHub Actions
   - Cliquez sur **Save**

C'est tout ! GitHub Actions va automatiquement déployer vos scripts.

### 2. Vérifier que le workflow fonctionne

Après avoir activé GitHub Pages :

1. Pushez les nouveaux fichiers (setup.sh et workflow) sur la branche `main`
2. Allez dans l'onglet **Actions** de votre repository
3. Vous devriez voir le workflow "Publish Installation Scripts to GitHub Pages"
4. Attendez qu'il se termine (status vert ✓)

### 3. Tester l'URL

Une fois le workflow terminé, visitez :

```
https://tallec7.github.io/neopro/install/
```

Vous devriez voir une page web avec les instructions d'installation.

Le script est accessible à :

```
https://tallec7.github.io/neopro/install/setup.sh
```

---

## 🚀 Utilisation

### Installation sur un nouveau Raspberry Pi

1. **Préparer le Pi :**
   - Flasher Raspberry Pi OS Lite sur une carte SD (n'importe quelle taille ≥16GB)
   - Configurer le WiFi ou brancher en Ethernet
   - Activer SSH

2. **Se connecter au Pi :**
   ```bash
   ssh pi@raspberrypi.local
   # Mot de passe par défaut : raspberry
   ```

3. **Lancer l'installation en une commande :**
   ```bash
   curl -sSL https://tallec7.github.io/neopro/install/setup.sh | sudo bash -s CLUB_NAME PASSWORD
   ```

   **Exemples :**
   ```bash
   # Pour le club de Nantes
   curl -sSL https://tallec7.github.io/neopro/install/setup.sh | sudo bash -s NANTES MyWiFiPass123

   # Pour une installation master
   curl -sSL https://tallec7.github.io/neopro/install/setup.sh | sudo bash -s MASTER MasterPass
   ```

4. **Attendre 15-20 minutes**

5. **Connectez-vous au WiFi et copiez les fichiers :**
   ```bash
   # Application Angular
   scp -r webapp/dist/* pi@neopro.local:~/neopro/webapp/

   # Vidéos
   scp videos/* pi@neopro.local:~/neopro/videos/
   ```

---

## 🔄 Workflow complet

```
┌─────────────────────────────────────────────────────────────────┐
│  DÉVELOPPEMENT (votre Mac)                                      │
├─────────────────────────────────────────────────────────────────┤
│  1. Modifier raspberry/install.sh ou les configs                │
│  2. git commit && git push                                      │
│  3. GitHub Actions déploie automatiquement                      │
│     → https://tallec7.github.io/neopro/install/setup.sh         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  INSTALLATION CHEZ UN CLUB (5 min de travail actif)            │
├─────────────────────────────────────────────────────────────────┤
│  1. Flash Pi OS Lite sur carte SD              (5 min)         │
│  2. Boot + SSH + curl setup.sh                 (1 min)         │
│  3. Attendre installation automatique          (15-20 min)     │
│  4. Se connecter au WiFi et copier fichiers    (5 min)         │
│                                                                 │
│  TOTAL TRAVAIL ACTIF : ~10 min (vs 45 min méthode manuelle)    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 Fichiers créés

### `raspberry/scripts/setup.sh`
Script principal d'installation en ligne qui :
- Télécharge tous les fichiers depuis GitHub (raw.githubusercontent.com)
- Exécute `install.sh` avec les paramètres fournis
- Nettoie les fichiers temporaires

### `.github/workflows/publish-install-scripts.yml`
GitHub Actions workflow qui :
- Se déclenche automatiquement à chaque push sur `main` touchant les fichiers d'installation
- Copie `setup.sh` vers `_site/install/setup.sh`
- Crée une page HTML d'instructions à `_site/install/index.html`
- Déploie sur GitHub Pages

---

## 🛠️ Maintenance

### Mettre à jour l'installation

Quand vous modifiez les scripts d'installation :

1. **Modifier localement :**
   ```bash
   # Éditer raspberry/install.sh, configs, etc.
   git add .
   git commit -m "fix: amélioration installation"
   git push
   ```

2. **Attendre le déploiement automatique :**
   - GitHub Actions se déclenche automatiquement
   - Vérifier dans l'onglet "Actions"
   - Délai : ~2-3 minutes

3. **Les prochaines installations utiliseront automatiquement la nouvelle version**

### Tester localement avant de pusher

```bash
# Sur le Pi
curl -sSL https://raw.githubusercontent.com/Tallec7/neopro/VOTRE_BRANCHE/raspberry/scripts/setup.sh | sudo bash -s TEST TestPass123
```

Remplacez `VOTRE_BRANCHE` par votre branche de test.

---

## 🔐 Sécurité

### Le script est-il sûr ?

Oui, car :
- ✅ Hébergé sur GitHub Pages (domaine github.io de confiance)
- ✅ Télécharge uniquement depuis votre repository GitHub officiel
- ✅ Utilise HTTPS pour tous les téléchargements
- ✅ Code source visible et vérifiable

### Bonnes pratiques

- Ne modifiez jamais l'URL du script après distribution
- Gardez votre repository GitHub à jour
- Vérifiez les logs GitHub Actions après chaque déploiement

---

## ⚠️ Aucune action requise sur Render

**Important :** Cette solution n'utilise PAS Render.

- **Render** héberge votre API backend/services en production
- **GitHub Pages** héberge les scripts d'installation (fichiers statiques)
- Ce sont deux choses complètement séparées

L'installation sur le Raspberry Pi ne communique pas avec Render pendant le processus d'installation.

---

## 🔍 Comparaison : Golden Image vs Installation en ligne

| Critère | Golden Image (dd) | Installation en ligne |
|---------|-------------------|----------------------|
| **Taille à distribuer** | 58GB compressé | Aucun fichier (~5KB script) |
| **Temps installation** | 10 min (après création) | 20 min |
| **Temps préparation** | 2-3h (créer l'image) | 0 min (automatique) |
| **Internet requis** | Non | Oui (pendant installation) |
| **Toujours à jour** | ❌ Obsolète rapidement | ✅ Dernière version |
| **Compatibilité carte SD** | ❌ Même taille que source | ✅ Toute taille ≥16GB |
| **Stockage requis** | 58GB sur Mac/disque | Aucun |
| **Complexité** | Haute (dd, PiShrink) | Basse (une commande) |

**Conclusion : Installation en ligne est MEILLEURE pour votre usage**

---

## 🆘 Dépannage

### Le script ne se télécharge pas

```bash
# Vérifier la connexion Internet sur le Pi
ping -c 4 github.com

# Vérifier que curl est installé
which curl
sudo apt-get update && sudo apt-get install -y curl
```

### GitHub Pages n'est pas actif

1. Vérifier que le workflow s'est exécuté sans erreur dans Actions
2. Vérifier que GitHub Pages est activé dans Settings → Pages
3. Attendre 5 minutes après l'activation

### Le script échoue pendant l'installation

```bash
# Voir les logs détaillés
curl -sSL https://tallec7.github.io/neopro/install/setup.sh > /tmp/setup.sh
sudo bash -x /tmp/setup.sh CLUB_NAME PASSWORD 2>&1 | tee install.log
```

### Tester le script sans l'exécuter

```bash
# Juste télécharger et afficher
curl -sSL https://tallec7.github.io/neopro/install/setup.sh | less
```

---

## 📞 Support

**Problèmes avec l'installation en ligne :**
- Vérifier les GitHub Actions : https://github.com/Tallec7/neopro/actions
- Vérifier GitHub Pages : Settings → Pages
- Tester l'URL : https://tallec7.github.io/neopro/install/

**Documentation :**
- Installation technique : `raspberry/README.md`
- Golden image (ancienne méthode) : `docs/guides/GOLDEN_IMAGE.md`

---

**Version :** 1.0.0
**Date :** Décembre 2024
**Auteur :** Neopro / Kalon Partners
