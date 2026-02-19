# Préparer un Raspberry Pi de démo

Guide pour configurer un Raspberry Pi physique dédié aux démonstrations Neopro.

**Architecture hybride** :

- Le Pi tourne en **mode démo** → sélecteur de clubs, plusieurs configurations
- Un **site "NEOPRO DEMO"** existe dans le central server → monitoring + édition des configs depuis le dashboard
- Les configs sont éditées dans le dashboard puis exportées en JSON sur le Pi

---

## 1. Prérequis matériel

| Élément                  | Détail                                           |
| ------------------------ | ------------------------------------------------ |
| Raspberry Pi             | Pi 4 (4 Go RAM min) ou Pi 5                      |
| MicroSD                  | 32 Go minimum, classe A2 recommandée             |
| Alimentation             | 5V/3A (Pi 4) ou 5V/5A (Pi 5)                     |
| Câble HDMI               | Micro HDMI → HDMI (Pi 4) ou HDMI standard (Pi 5) |
| Écran / TV               | N'importe quel écran HDMI                        |
| Clé USB WiFi (optionnel) | Pour avoir Internet en plus du hotspot           |
| Clavier USB (optionnel)  | Utile pour le setup initial                      |

---

## 2. Créer le site dans le central server

### Via le dashboard

1. Se connecter sur [neopro-admin.kalonpartners.bzh](https://neopro-admin.kalonpartners.bzh)
2. **Sites** → **Ajouter un site**
3. Remplir :
   - **Nom du site** : `NEOPRO DEMO`
   - **Nom du club** : `Neopro Demo`
   - **Ville** : `Nantes`
   - **Sport** : `Handball` (ou multi-sport)
   - **Modèle** : `Raspberry Pi 4` ou `Raspberry Pi 5`
4. **Sauvegarder l'API key affichée** — elle ne sera plus jamais visible

> ⚠️ Conservez l'API key dans un endroit sûr (gestionnaire de mots de passe). Elle sera nécessaire à l'étape 7.

### Configurer l'abonnement premium

1. Dans la fiche du site → **Abonnement**
2. Mettre le plan en **Premium**
3. Date de fin : **+1 an**

Cela active `liveScoreEnabled` sur le Pi (score, timer, animations, breaking news).

---

## 3. Installer le Pi

Suivre le guide d'installation standard : **[INSTALLATION_COMPLETE.md](./INSTALLATION_COMPLETE.md)**

### Méthode rapide (online, ~22 min)

```bash
# Depuis le Pi (après avoir flashé Raspberry Pi OS Lite + activé SSH)
curl -sSL https://tallec7.github.io/neopro/install/setup.sh | \
  sudo bash -s NEOPRO-DEMO DemoWifi2024
```

- `NEOPRO-DEMO` = nom du hotspot WiFi
- `DemoWifi2024` = mot de passe du hotspot

### Méthode locale (~45 min)

```bash
# Depuis votre Mac — copier les fichiers
./raspberry/scripts/copy-to-pi.sh raspberrypi.local

# Sur le Pi — installer
ssh pi@raspberrypi.local
cd raspberry
sudo ./install.sh NEOPRO-DEMO DemoWifi2024
```

Le Pi redémarre automatiquement après l'installation.

---

## 4. Déployer le build en mode démo

Par défaut, l'installation déploie le build `raspberry` (1 seul club, pas de sélecteur). Pour la démo, on remplace par le build `demo`.

### Build depuis votre Mac

```bash
# Depuis la racine du projet
npx ng build raspberry --configuration=demo
```

### Copier vers le Pi

```bash
# Remplacer la webapp sur le Pi
scp -r dist/raspberry/browser/* pi@neopro.local:/home/pi/neopro/webapp/
```

### Vérifier

```bash
ssh pi@neopro.local
ls /home/pi/neopro/webapp/demo-configs/
# → clubs.json, default.json, narh.json, demo-club.json, nlfhandball.json
```

Le Pi affiche maintenant le **sélecteur de clubs** sur `/remote`.

---

## 5. Préparer les configs de clubs

Référence complète : **[DEMO_PREP.md](./DEMO_PREP.md)**

### Workflow : Dashboard → Pi

1. **Créer la config dans le dashboard** : Site → Brouillon → éditer sponsors, catégories, etc.
2. **Exporter le JSON** depuis l'API :
   ```bash
   # Récupérer le brouillon (remplacer SITE_ID et TOKEN)
   curl -s -H "Cookie: token=VOTRE_JWT" \
     https://neopro-central-production.up.railway.app/api/sites/SITE_ID/draft \
     | jq '.configuration' > monclub.json
   ```
3. **Enrichir le JSON** avec les champs manquants :
   ```json
   {
     "remote": { "title": "Télécommande Néopro - MON CLUB" },
     "auth": { "password": "demo", "clubName": "Mon Club", "sessionDuration": 28800000 },
     "liveScoreEnabled": true,
     "scoreOverlay": { "position": "top-center" },
     ...
   }
   ```
4. **Copier sur le Pi** :
   ```bash
   scp monclub.json pi@neopro.local:/home/pi/neopro/webapp/demo-configs/
   ```
5. **Mettre à jour la liste des clubs** :
   ```bash
   # Éditer clubs.json sur le Pi
   ssh pi@neopro.local
   nano /home/pi/neopro/webapp/demo-configs/clubs.json
   ```
   ```json
   [
     { "id": "narh", "name": "NARH", "city": "Nantes", "sport": "Rugby" },
     { "id": "monclub", "name": "Mon Club", "city": "Paris", "sport": "Football" }
   ]
   ```

### Points importants

- **`liveScoreEnabled: true`** dans chaque config pour montrer le score, timer, animations
- Les **`categoryIds`** dans `timeCategories` doivent correspondre aux **`id`** des catégories
- Les **chemins vidéo** dans le JSON doivent correspondre aux fichiers sur le Pi (étape 6)

---

## 6. Préparer les vidéos

### Structure des dossiers sur le Pi

```
/home/pi/neopro/webapp/videos/
├── DEMO/                           # Vidéo par défaut
│   └── NEOPRO.mp4
├── narh/                           # Club NARH
│   ├── PARTENAIRES/
│   │   ├── NEOPRO.mp4
│   │   └── BOUCLE_PARTENAIRES.mp4
│   ├── FOCUS_PARTENAIRE/
│   │   ├── COULEUR_CARRELAGE.mp4
│   │   └── ...
│   ├── INFOS_CLUB/
│   │   └── RS.mp4
│   ├── ENTREEE/
│   │   ├── JOUEUR_5.mp4
│   │   └── ...
│   └── MATCH/
│       ├── BUT/
│       │   └── JOUEUR_5.mp4
│       └── JINGLE/
│           ├── MI_TEMPS.mp4
│           └── VICTOIRE.mp4
└── monclub/                        # Nouveau club
    └── (même structure)
```

### Copier les vidéos

```bash
# Copier un dossier complet de vidéos
scp -r videos/narh/ pi@neopro.local:/home/pi/neopro/webapp/videos/narh/
```

### Conseils

- **Format** : H.264 (.mp4) pour compatibilité maximale
- **Durée** : 10-30 secondes par vidéo pour la démo
- **Résolution** : 1920x1080 recommandé
- **Poids** : la microSD de 32 Go permet ~15 Go de vidéos

---

## 7. Configurer la sync avec le central (optionnel)

Si vous voulez que le Pi apparaisse "online" dans le dashboard :

### Configurer l'API key

```bash
ssh pi@neopro.local

# Éditer la configuration pour ajouter la sync
nano /home/pi/neopro/webapp/demo-configs/default.json
```

Ajouter le bloc `sync` :

```json
{
  "sync": {
    "enabled": true,
    "serverUrl": "https://neopro-central-production.up.railway.app",
    "siteName": "NEOPRO DEMO",
    "clubName": "Neopro Demo"
  }
}
```

L'API key est configurée dans le sync-agent :

```bash
# Créer le fichier de config sync-agent
sudo nano /etc/neopro/site.conf
```

```
API_KEY=votre_api_key_ici
SERVER_URL=https://neopro-central-production.up.railway.app
```

```bash
# Redémarrer le sync-agent
sudo systemctl restart neopro-sync-agent
```

Le site passe en "online" dans le dashboard après quelques secondes.

> **Note** : en mode démo, la sync ne modifie pas les configs locales. Elle sert uniquement au monitoring.

---

## 8. Mise à jour des configs sans rebuild

Les configs de clubs sont des **fichiers JSON statiques** sur le Pi. Vous pouvez les modifier à tout moment **sans rebuild** :

```bash
# Modifier directement sur le Pi
ssh pi@neopro.local
nano /home/pi/neopro/webapp/demo-configs/narh.json

# Ou copier un nouveau fichier depuis votre Mac
scp narh-updated.json pi@neopro.local:/home/pi/neopro/webapp/demo-configs/narh.json
```

Après modification, rafraîchir la page `/remote` sur le Pi pour recharger la config.

---

## 9. Checklist finale

### Infra

- [ ] Pi installé et démarré (services actifs)
- [ ] Hotspot WiFi `NEOPRO-DEMO` accessible
- [ ] Écran HDMI connecté et affiche la TV

### Configuration

- [ ] Build `--configuration=demo` déployé dans `/home/pi/neopro/webapp/`
- [ ] `clubs.json` avec au moins 1 club
- [ ] Chaque config de club a `liveScoreEnabled: true`
- [ ] Les chemins vidéo dans les JSON correspondent aux fichiers sur le Pi

### Fonctionnalités à tester

- [ ] `/remote` → sélecteur de clubs s'affiche
- [ ] Sélectionner un club → login → télécommande
- [ ] Lancer une vidéo → s'affiche sur `/tv`
- [ ] Boucle sponsors tourne automatiquement
- [ ] Score : incrémenter, changer noms d'équipe
- [ ] Timer : démarrer, mettre en pause
- [ ] Animation de but : incrémenter le score → animation
- [ ] Breaking news : envoyer un message
- [ ] Phases : changer avant/pendant/après

### Central (optionnel)

- [ ] Site "NEOPRO DEMO" existe dans le dashboard
- [ ] Abonnement premium actif
- [ ] Pi apparaît "online" dans le dashboard

---

## Résumé des commandes

```bash
# 1. Build démo (depuis votre Mac, racine du projet)
npx ng build raspberry --configuration=demo

# 2. Copier le build sur le Pi
scp -r dist/raspberry/browser/* pi@neopro.local:/home/pi/neopro/webapp/

# 3. Copier les configs de clubs
scp raspberry/src/assets/demo-configs/*.json pi@neopro.local:/home/pi/neopro/webapp/demo-configs/

# 4. Copier les vidéos
scp -r videos/narh/ pi@neopro.local:/home/pi/neopro/webapp/videos/narh/

# 5. Redémarrer les services (optionnel)
ssh pi@neopro.local 'sudo systemctl restart neopro-app neopro-kiosk'
```

---

## Liens utiles

- [DEMO_PREP.md](./DEMO_PREP.md) — Structure des configs JSON, checklist features
- [DEMO_MODE.md](./DEMO_MODE.md) — Fonctionnement du mode démo Angular
- [INSTALLATION_COMPLETE.md](./INSTALLATION_COMPLETE.md) — Installation Pi détaillée
- [GUIDE_OPERATEUR_INSTALLATION.md](./GUIDE_OPERATEUR_INSTALLATION.md) — Guide opérateur
