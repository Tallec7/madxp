# Système de Versioning Automatique Neopro

## Vue d'ensemble

Neopro utilise **semantic-release** pour gérer automatiquement les versions selon les commits conventionnels.

## Comment ça fonctionne

### 1. Commits Conventionnels

Les versions sont automatiquement incrémentées selon le type de commit :

| Type de commit     | Exemple                               | Impact version | Exemple       |
| ------------------ | ------------------------------------- | -------------- | ------------- |
| `fix:`             | `fix(auth): handle expired tokens`    | **PATCH**      | 2.0.1 → 2.0.2 |
| `feat:`            | `feat(sites): add bulk delete`        | **MINOR**      | 2.0.1 → 2.1.0 |
| `BREAKING CHANGE:` | Commit avec footer `BREAKING CHANGE:` | **MAJOR**      | 2.0.1 → 3.0.0 |

### 2. Workflow Automatique

```
Developer push sur main
        ↓
GitHub Actions détecte le push
        ↓
semantic-release analyse les commits
        ↓
Détermine la nouvelle version
        ↓
Met à jour package.json
        ↓
Génère CHANGELOG.md
        ↓
Crée un tag Git (ex: v2.1.0)
        ↓
Crée une GitHub Release
        ↓
Commit automatique sur main
```

## Format des Commits

### Structure

```
<type>(<scope>): <description>

[corps optionnel]

[footer optionnel]
```

### Types valides

- `feat`: Nouvelle fonctionnalité
- `fix`: Correction de bug
- `docs`: Documentation uniquement
- `style`: Formatage, espaces, etc. (pas de changement de code)
- `refactor`: Refactoring sans changement de comportement
- `perf`: Amélioration de performance
- `test`: Ajout ou correction de tests
- `chore`: Maintenance (deps, config, etc.)
- `ci`: Changements CI/CD

### Exemples

#### Fix (patch : 2.0.1 → 2.0.2)

```bash
git commit -m "fix(auth): prevent token expiration loop"
```

#### Feature (minor : 2.0.1 → 2.1.0)

```bash
git commit -m "feat(analytics): add daily stats aggregation"
```

#### Breaking Change (major : 2.0.1 → 3.0.0)

```bash
git commit -m "feat(api): redesign authentication flow

BREAKING CHANGE: JWT token format changed, all clients must upgrade"
```

## Utilisation

### Workflow Normal

1. **Développer sur une branche**

```bash
git checkout -b feature/ma-feature
# ... développement ...
git commit -m "feat(sites): add site filtering by region"
git push origin feature/ma-feature
```

2. **Créer une Pull Request**
   - Vérifier que le titre et les commits suivent la convention
   - Merger sur `main` via GitHub

3. **Automatique !**
   - GitHub Actions lance le workflow
   - Version incrémentée automatiquement
   - Tag créé (ex: `v2.1.0`)
   - CHANGELOG mis à jour
   - GitHub Release publiée

### Vérifier la version actuelle

```bash
# Version du dernier tag
git describe --tags --abbrev=0

# Voir tous les tags
git tag

# Version dans package.json
cat package.json | grep version
```

### Forcer une version spécifique (rare)

Si besoin de bypass semantic-release :

```bash
npm version patch  # 2.0.1 → 2.0.2
npm version minor  # 2.0.1 → 2.1.0
npm version major  # 2.0.1 → 3.0.0

git push --tags
```

## Build et Déploiement

### Raspberry Pi Build

Le script `build-raspberry.sh` utilise maintenant le tag Git propre :

```bash
npm run build:raspberry
# → Génère neopro-raspberry-v2.1.0.tar.gz (sans hash)
```

**Avant :** `v2.0.1+91ed14a` (version + hash)
**Après :** `v2.1.0` (version propre)

### Version affichée sur les Pi

Les Raspberry Pi affichent la version depuis :

1. `release.json` (prioritaire)
2. `webapp/version.json`
3. `VERSION` (fichier texte)
4. `webapp/package.json` (fallback)

Toutes générées automatiquement lors du build.

## CHANGELOG Automatique

Le fichier `docs/changelog/CHANGELOG.md` est généré automatiquement avec :

- Titre de chaque version
- Liste des changements par type (Features, Fixes, etc.)
- Liens vers les commits GitHub
- Date de release

## Configuration

### `.releaserc.json`

```json
{
  "branches": ["main"],
  "plugins": [
    "@semantic-release/commit-analyzer", // Analyse les commits
    "@semantic-release/release-notes-generator", // Génère notes
    "@semantic-release/changelog", // Met à jour CHANGELOG
    "@semantic-release/npm", // Met à jour package.json
    "@semantic-release/git", // Commit les changements
    "@semantic-release/github" // Crée GitHub Release
  ]
}
```

### GitHub Actions (`.github/workflows/release.yml`)

- Déclenché sur push vers `main`
- Nécessite `GITHUB_TOKEN` (fourni automatiquement)

## Troubleshooting

### semantic-release ne crée pas de version

**Causes possibles :**

- Aucun commit depuis la dernière release
- Commits ne suivent pas la convention (`feat:`, `fix:`, etc.)
- Pas de changements éligibles (ex: seulement `docs:` ou `chore:`)

**Solution :**

```bash
# Vérifier les commits depuis le dernier tag
git log $(git describe --tags --abbrev=0)..HEAD --oneline

# Si besoin de forcer une release
git commit --allow-empty -m "chore(release): force new release"
git push
```

### Build affiche toujours "dev-20250103"

**Cause :** Pas de tag Git trouvé

**Solution :**

```bash
# Créer un tag initial
git tag v2.0.1
git push --tags
```

### Version dans package.json non synchronisée

**Normal !** `semantic-release` met à jour `package.json` automatiquement.
Ne **jamais** modifier `package.json` manuellement pour la version.

## Références

- [Semantic Versioning](https://semver.org/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [semantic-release](https://github.com/semantic-release/semantic-release)
- [Commit Message Guidelines](https://github.com/angular/angular/blob/main/CONTRIBUTING.md#commit)

## Migration depuis l'ancien système

### Avant

- Versions avec hash : `v2.0.1+91ed14a`
- Incrémentation manuelle
- CHANGELOG manuel

### Après

- Versions propres : `v2.1.0`
- Incrémentation automatique
- CHANGELOG automatique

### Checklist Migration

- [x] Installer semantic-release (`npm install --save-dev semantic-release ...`)
- [x] Créer `.releaserc.json`
- [x] Créer `.github/workflows/release.yml`
- [x] Modifier `raspberry/scripts/build-raspberry.sh` (retirer `+${short_sha}`)
- [x] Synchroniser `package.json` avec le dernier tag
- [ ] Former l'équipe aux commits conventionnels
- [ ] Tester sur une branche de test
- [ ] Merger sur main

## Bonnes Pratiques

### ✅ FAIRE

- Utiliser les types conventionnels (`feat:`, `fix:`, etc.)
- Décrire clairement le changement dans le message
- Regrouper les changements liés dans un commit
- Tester avant de merger sur main

### ❌ NE PAS FAIRE

- Modifier `package.json` version manuellement
- Créer des tags manuels (sauf cas exceptionnel)
- Merger des commits non conventionnels sur main
- Utiliser `git commit --amend` sur des commits pushés

## Support

En cas de problème avec le versioning :

1. Vérifier les logs GitHub Actions
2. Consulter ce document
3. Vérifier que les commits suivent la convention
4. En dernier recours : créer un tag manuel et pousser
