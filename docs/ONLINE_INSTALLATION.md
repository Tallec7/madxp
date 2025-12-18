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

## 📋 Deux options d'hébergement (100% gratuites)

### Option 1 : GitHub Pages (URL courte) ✅ **CONFIGURÉ**

**Avantages :**
- ✅ URL plus courte et professionnelle
- ✅ Page web d'instructions incluse
- ✅ **100% gratuit** (même pour repos publics)

**Configuration (déjà fait) :**

1. Allez sur votre repository : https://github.com/Tallec7/neopro
2. Settings → Pages → Source : **GitHub Actions**
3. C'est tout ! Quand vous sélectionnez "GitHub Actions", c'est automatiquement activé

**Vérifier que ça fonctionne :**
- Onglet "Actions" → Workflow "Publish Installation Scripts to GitHub Pages" doit être ✓
- Visitez : https://tallec7.github.io/neopro/install/

**URL d'installation :**
```bash
curl -sSL https://tallec7.github.io/neopro/install/setup.sh | sudo bash -s CLUB_NAME PASSWORD
```

---

### Option 2 : Raw GitHub (aucune configuration)

**Avantages :**
- ✅ Aucune configuration nécessaire
- ✅ Fonctionne immédiatement dès que c'est sur `main`
- ✅ **100% gratuit** aussi

**Inconvénient :**
- URL plus longue

**URL d'installation :**
```bash
curl -sSL https://raw.githubusercontent.com/Tallec7/neopro/main/raspberry/scripts/setup.sh | sudo bash -s CLUB_NAME PASSWORD
```

---

### 💡 Laquelle choisir ?

Les deux fonctionnent parfaitement et sont gratuites. Utilisez **Option 1** (GitHub Pages) car l'URL est plus courte et vous l'avez déjà configurée.

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

   **Option recommandée (GitHub Pages - URL courte) :**
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

   **Alternative (Raw GitHub - URL longue) :**
   ```bash
   curl -sSL https://raw.githubusercontent.com/Tallec7/neopro/main/raspberry/scripts/setup.sh | sudo bash -s CLUB_NAME PASSWORD
   ```

4. **Attendre 15-20 minutes**

   À la fin, le Pi est installé avec :
   - ✅ Serveur Neopro actif
   - ✅ WiFi hotspot : `NEOPRO-[CLUB_NAME]`
   - ✅ Application accessible sur `http://neopro.local`

5. **Configurer le club (depuis votre PC) :**

   **⚠️ Important :** Le Pi est installé mais pas encore configuré pour le club spécifique.

   **Méthode recommandée (sans dépendance locale) :**
   ```bash
   # Télécharger le script de configuration
   curl -O https://raw.githubusercontent.com/Tallec7/neopro/main/raspberry/scripts/setup-remote-club.sh
   chmod +x setup-remote-club.sh

   # Lancer la configuration interactive
   ./setup-remote-club.sh
   ```

   Le script va :
   - Collecter les infos du club (nom complet, localisation, contact, etc.)
   - Télécharger l'application depuis GitHub Releases
   - Déployer sur le Pi
   - Configurer le hotspot WiFi avec le nom du club
   - Connecter au serveur central (optionnel)

   **Durée :** 2-5 minutes ⚡

   📖 **[Guide complet setup-remote-club.sh](../raspberry/scripts/CLUB-SETUP-README.md)**

---

## 🔄 Workflow complet

```
┌─────────────────────────────────────────────────────────────────┐
│  DÉVELOPPEMENT (votre Mac)                                      │
├─────────────────────────────────────────────────────────────────┤
│  1. Modifier code et créer une release                          │
│  2. git tag v1.x.x && git push origin v1.x.x                    │
│  3. GitHub Actions build et publie automatiquement :            │
│     → https://tallec7.github.io/neopro/install/setup.sh         │
│     → https://github.com/.../releases/v1.x.x/                   │
│        neopro-raspberry-deploy.tar.gz                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  INSTALLATION CHEZ UN CLUB (Temps total : ~22 min)             │
├─────────────────────────────────────────────────────────────────┤
│  ÉTAPE 1 : Installation du Pi (15-20 min)                      │
│  - Flash Pi OS Lite sur carte SD               (5 min)         │
│  - Boot + SSH + curl setup.sh                  (1 min)         │
│  - Attendre installation automatique           (15-20 min)     │
│                                                                 │
│  ÉTAPE 2 : Configuration du club (2-5 min)                     │
│  - Télécharger setup-remote-club.sh            (10 sec)        │
│  - Lancer le script interactif                 (2-5 min)       │
│    * Saisie infos club                                          │
│    * Téléchargement depuis GitHub Releases                      │
│    * Déploiement automatique                                    │
│                                                                 │
│  ✅ TOTAL : ~22 min (vs 45+ min méthode manuelle)              │
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

### Tester une branche avant de merger sur main

```bash
# Sur le Pi - tester depuis votre branche de développement
curl -sSL https://raw.githubusercontent.com/Tallec7/neopro/VOTRE_BRANCHE/raspberry/scripts/setup.sh | sudo bash -s TEST TestPass123
```

Remplacez `VOTRE_BRANCHE` par votre branche de test (ex: `claude/feature-xyz`).

**Note :** GitHub Pages déploie uniquement depuis `main`, donc pour tester une branche, utilisez toujours l'URL `raw.githubusercontent.com`.

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

## 💰 Coût : 0€ (Gratuit)

**GitHub Pages est 100% gratuit pour les repositories publics.**

Limites (largement suffisantes pour votre usage) :
- ✅ Taille du site : 1GB max (votre script fait ~5KB)
- ✅ Fichiers : pas de fichiers >100MB (votre script fait 5KB)
- ✅ Bande passante : 100GB/mois (largement suffisant)
- ✅ Builds : 10 par heure (vous pushez rarement)

**Aucune carte bancaire requise, aucun abonnement, aucun frais cachés.**

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
