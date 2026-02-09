# Admin Panel - Architecture Modulaire

## Structure

```
public/
├── app.js                  # Fichier concatene (build output - NE PAS EDITER)
├── modules/
│   ├── core/
│   │   ├── state.js        # Etat global (variables partagees)
│   │   ├── connection.js   # Monitoring connexion + fetch wrapper
│   │   └── notifications.js# Toasts, modals, utilitaires UI
│   ├── dashboard/
│   │   └── index.js        # Dashboard systeme + grille services
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
│   │   └── index.js        # Visionneuse de logs
│   ├── demo/
│   │   └── index.js        # Mode demo (donnees mockees)
│   └── bootstrap.js        # Navigation, init, DOMContentLoaded
└── build-admin.sh          # Concatene modules/ -> app.js
```

## Utilisation

```bash
# Developper dans modules/, puis build:
cd raspberry/admin/public
bash build-admin.sh

# Le fichier app.js est regenere automatiquement
```

## Convention

- Chaque module definit ses fonctions dans le scope global (pas de ES modules)
- Les fonctions appelees depuis index.html via onclick sont exportees sur `window` dans bootstrap.js
- L'etat partage est dans `core/state.js`
- L'ordre de concatenation est defini dans `build-admin.sh`
