# Configuration Raspberry Pi - Voir documentation principale

## 📚 Documentation déplacée

La documentation a été réorganisée pour plus de clarté.

### 🚀 Vous cherchez :

#### Configuration d'un nouveau club ?
→ **[Voir README.md principal](../README.md)** - Section "1️⃣ Configurer un NOUVEAU club"

**TL;DR :**
```bash
./raspberry/scripts/setup-new-club.sh
```

#### Mise à jour d'un boîtier ?
→ **[Voir README.md principal](../README.md)** - Section "2️⃣ Mettre à jour un boîtier existant"

**TL;DR :**
```bash
# Via interface web (recommandé)
http://neopro.local:8080

# Via script
npm run build:raspberry
npm run deploy:raspberry neopro.local
```

#### Documentation technique complète ?
→ **[docs/REFERENCE.md](../docs/REFERENCE.md)**

#### Guide de dépannage ?
→ **[docs/TROUBLESHOOTING.md](../docs/TROUBLESHOOTING.md)**

---

## 📂 Structure de la documentation

```
neopro/
├── README.md                  ⭐ COMMENCER ICI
├── docs/
│   ├── INDEX.md              📖 Index de la documentation
│   ├── REFERENCE.md          📘 Documentation technique complète
│   ├── TROUBLESHOOTING.md    🔧 Guide de dépannage
│   └── archive/              📦 Anciens documents
│
└── raspberry/
    ├── scripts/
    │   └── setup-new-club.sh ⭐ Script principal nouveau club
    └── README.md             👈 Vous êtes ici
```

---

## 🛠️ Scripts utiles

### Configuration nouveau club
```bash
./raspberry/scripts/setup-new-club.sh
```

### Build et déploiement
```bash
npm run build:raspberry
npm run deploy:raspberry neopro.local
```

### Diagnostic
```bash
ssh pi@neopro.local './scripts/diagnose-pi.sh'
```

---

**Pour toute la documentation :** [README.md principal](../README.md)
