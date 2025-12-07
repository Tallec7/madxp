# Changelog

Ce dossier contient l'historique des modifications significatives du projet.

## 🛠️ Génération automatique

Un script permet de générer automatiquement le changelog à partir des commits git :

```bash
# 30 derniers commits (défaut)
./scripts/generate-changelog.sh

# Depuis une date
./scripts/generate-changelog.sh --since="2025-12-01"

# N derniers commits
./scripts/generate-changelog.sh --commits=50

# Sauvegarder dans docs/changelog/
./scripts/generate-changelog.sh --save

# Aide
./scripts/generate-changelog.sh --help
```

## 📋 Format des fichiers

### Changelogs manuels (modifications majeures)
Nommage : `YYYY-MM-DD_description-courte.md`

### Changelogs générés (commits)
Nommage : `YYYY-MM-DD_commits.md`

## 📅 Historique

| Date | Fichier | Description |
|------|---------|-------------|
| 2025-12-07 | [architecture-cleanup.md](2025-12-07_architecture-cleanup.md) | Nettoyage architecture, réorganisation fichiers |
| 2025-12-07 | [2025-12-07_commits.md](2025-12-07_commits.md) | Changelog commits automatique |

---

## 📝 Template changelog

```markdown
# Changelog - [DATE]

## [Titre de la modification]

### Résumé
[Description courte]

---

## Changements

### Ajouts
- ...

### Modifications
- ...

### Suppressions
- ...

---

## Impact
[Description de l'impact sur le projet]

---

**Auteur :** [Nom]
**Date :** [Date]
```

---

**Dernière mise à jour :** 7 décembre 2025
