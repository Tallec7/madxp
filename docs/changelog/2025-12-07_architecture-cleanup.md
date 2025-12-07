# Changelog - 7 décembre 2025

## Nettoyage et réorganisation de l'architecture

### Résumé
Refonte complète de l'organisation des fichiers du projet pour améliorer la maintenabilité et la cohérence.

---

## Fichiers/dossiers supprimés

### Fichiers obsolètes
| Fichier | Raison |
|---------|--------|
| `System Volume Information/` | Fichier système Windows accidentel |
| `public/server.js` | Code obsolète non utilisé (utilisait chrome-launcher) |
| `logs/` | Dossier créé au runtime, pas à versionner |
| `scripts/deploy-to-pi.sh` | Doublon de `raspberry/scripts/deploy-remote.sh` |

### Documentation obsolète supprimée
| Fichier | Raison |
|---------|--------|
| `docs/archive/` (21 fichiers) | Documentation consolidée dans les fichiers principaux |
| `central-dashboard/FINAL_STATUS.md` | Fichier de suivi dev temporaire |
| `central-dashboard/COMPONENTS_GUIDE.md` | Template de développement |

### Doublons supprimés
| Fichier | Raison |
|---------|--------|
| `central-dashboard/public/neopro-logo.png` | Doublon de `src/assets/neopro-logo.png` |
| `central-server/render.yaml` | Fusionné dans `render.yaml` racine |
| `central-dashboard/render.yaml` | Fusionné dans `render.yaml` racine |

---

## Réorganisation

### Configuration Raspberry Pi
```
AVANT:
raspberry/config/*.service, *.conf
raspberry/configs/TEMPLATE-*.json

APRÈS:
raspberry/config/
├── systemd/          # Services systemd + configs système
│   ├── neopro-app.service
│   ├── neopro-admin.service
│   ├── neopro-kiosk.service
│   ├── neopro.service
│   ├── dnsmasq.conf
│   └── hostapd.conf
└── templates/        # Templates configuration JSON
    ├── TEMPLATE-configuration.json
    └── README.md
```

### Render.yaml consolidé
```
AVANT:
render.yaml (racine)           # Version partielle
central-server/render.yaml     # Version serveur seul
central-dashboard/render.yaml  # Version dashboard seul

APRÈS:
render.yaml (racine)           # Version complète avec tous les services
```

---

## Nouveaux fichiers créés

| Fichier | Description |
|---------|-------------|
| `.env.example` | Template variables d'environnement (Supabase, tous modules) |
| `.prettierrc` | Configuration formatage code |
| `LICENSE` | Licence MIT |
| `docs/dev/` | Documentation développement |
| `docs/changelog/` | Suivi des modifications |

---

## Documentation mise à jour

| Fichier | Changements |
|---------|-------------|
| `README.md` | Structure mise à jour, chemins corrigés, section Supabase |
| `docs/INDEX.md` | Refonte complète, suppression référence archive |
| `raspberry/README.md` | Nouvelle structure config/systemd et config/templates |
| `central-server/README.md` | Documentation Supabase ajoutée |
| `central-dashboard/README.md` | Simplifié |
| `raspberry/scripts/README.md` | Chemins mis à jour |
| `raspberry/scripts/setup-new-club.sh` | Chemins mis à jour |
| `raspberry/scripts/test-config-creation.sh` | Chemins mis à jour |
| `raspberry/config/templates/README.md` | Chemins mis à jour |

---

## Configuration Supabase

### Changement majeur
Passage de PostgreSQL Render à **Supabase** pour la base de données.

### Impact sur render.yaml
- Suppression de la section `databases:`
- `DATABASE_URL` configuré manuellement (pointe vers Supabase)
- `DATABASE_SSL=true` activé

### Format URL Supabase
```
postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
```

---

## Scripts impactés

Les scripts suivants ont été mis à jour pour utiliser les nouveaux chemins :

```bash
# Ancien chemin
raspberry/configs/TEMPLATE-configuration.json

# Nouveau chemin
raspberry/config/templates/TEMPLATE-configuration.json
```

Fichiers modifiés :
- `raspberry/scripts/setup-new-club.sh`
- `raspberry/scripts/test-config-creation.sh`

---

## Structure finale du projet

```
neopro/
├── src/                          # Application Angular (webapp)
├── public/                       # Assets statiques
├── raspberry/
│   ├── scripts/                  # Scripts de déploiement
│   ├── config/
│   │   ├── systemd/             # Services systemd
│   │   └── templates/           # Templates configuration
│   ├── server/                   # Serveur Socket.IO local
│   ├── admin/                    # Interface admin
│   └── sync-agent/              # Agent synchronisation
├── central-server/               # API Backend
├── central-dashboard/            # Dashboard admin
├── server-render/                # Socket.IO cloud
├── docs/
│   ├── dev/                     # Documentation développement
│   ├── changelog/               # Suivi des modifications
│   └── *.md                     # Documentation utilisateur
├── render.yaml                   # Config Render.com (unique)
├── .env.example                  # Variables d'environnement
├── .prettierrc                   # Config Prettier
└── LICENSE                       # Licence MIT
```

---

**Auteur :** Claude Code
**Date :** 7 décembre 2025
