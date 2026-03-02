# Admin Panel - Architecture Modulaire

## Structure

```
public/
├── app.js                  # Fichier concatene (build output - NE PAS EDITER)
├── modules/
│   ├── core/
│   │   ├── state.js        # Etat global (variables partagees)
│   │   ├── mode-switcher.js# Toggle mode club/technicien (localStorage)
│   │   ├── connection.js   # Monitoring connexion + fetch wrapper
│   │   ├── realtime.js     # Connexion Socket.IO au serveur Pi (:3000), auto-refresh
│   │   │                   #   dashboard/videos/sponsors sur events (config_updated, license_update)
│   │   │                   #   Indicateur de connexion dans le header
│   │   └── notifications.js# Toasts, modals, utilitaires UI
│   ├── dashboard/
│   │   ├── sync-status.js  # Widget sync cloud (connexion, queue, erreurs)
│   │   └── index.js        # Dashboard systeme dual-mode (club: sante / tech: metriques)
│   ├── videos/
│   │   ├── loader.js       # Chargement + rendu videos config
│   │   ├── orphans.js      # Gestion videos orphelines
│   │   ├── editor.js       # Modal edition video
│   │   ├── bulk.js         # Selection/actions groupees
│   │   └── drag-drop.js    # Drag & drop reordonnancement
│   ├── network/
│   │   ├── wifi.js         # Scanner WiFi, connexion, BSSID
│   │   └── hotspot.js      # Diagnostic hotspot
│   ├── upload/
│   │   └── index.js        # Upload video (dropzone, progress)
│   ├── config/
│   │   ├── time-categories.js # Blocs temps (avant/pendant/apres match)
│   │   └── categories.js   # Gestionnaire categories/sous-categories
│   ├── logs/
│   │   └── index.js        # Visionneuse de logs (colorisation erreur/warning/debug,
│   │                       #   filtre texte avec surlignage, nombre de lignes configurable)
│   ├── demo/
│   │   └── index.js        # Mode demo (donnees mockees)
│   └── bootstrap.js        # Navigation, init, DOMContentLoaded
├── styles/                 # Sources CSS modulaires (10 fichiers)
│   ├── base.css            #   Reset, variables, typographie
│   ├── layout.css          #   Header, navigation, conteneurs
│   ├── dashboard.css       #   Cartes sante, metriques, sync widget
│   ├── videos.css          #   Bibliotheque, miniatures, drag-drop
│   ├── upload.css          #   Dropzone, progress bars
│   ├── network.css         #   WiFi, hotspot, interfaces
│   ├── logs.css            #   Colorisation, filtre, scrollable
│   ├── system.css          #   Services, OTA, backups
│   ├── auth.css            #   Login, change-password
│   └── responsive.css      #   Media queries
└── build-admin.sh          # Concatene modules/ -> app.js ET styles/ -> styles.css
```

## Utilisation

```bash
# Developper dans modules/, puis build:
cd raspberry/admin/public
bash build-admin.sh

# Le fichier app.js est regenere automatiquement
# Le header inclut le git hash (deterministe : pas de diff si le code n'a pas change)
```

## Convention

- Chaque module definit ses fonctions dans le scope global (pas de ES modules)
- Les fonctions appelees depuis index.html via onclick sont exportees sur `window` dans bootstrap.js
- L'etat partage est dans `core/state.js`
- L'ordre de concatenation est defini dans `build-admin.sh`

## Mode club / technicien

Le module `core/mode-switcher.js` gere un toggle qui simplifie l'UI :

- **Mode club** (defaut) : `body.mode-club` → CSS masque les elements `.tech-only` via `display: none !important`
- **Mode technicien** : `body.mode-tech` → tout visible
- Persistance : `localStorage('neopro-admin-mode')`
- Le dashboard utilise `getCurrentMode()` pour choisir entre rendu simplifie (carte sante) et complet (metriques)

## Qualite de code

- **ESLint frontend** : `.eslintrc.json` a la racine de `admin/`, verifie via `npm run lint:frontend`
- **CSS modulaire** : 10 fichiers source dans `styles/`, concatenes par `build-admin.sh` en un seul `styles.css`
