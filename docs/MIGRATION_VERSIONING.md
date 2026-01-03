# Migration vers le Versioning Automatique

## Changement Principal

**Avant :** Versions avec hash Git (ex: `v2.0.1+91ed14a`)
**Après :** Versions propres Semantic Versioning (ex: `v2.1.0`)

## Pourquoi ce changement ?

1. **Professionnalisme** : Versions standards reconnues partout
2. **CHANGELOG automatique** : Plus besoin de mise à jour manuelle
3. **Traçabilité** : Chaque version = GitHub Release avec notes
4. **Cohérence** : Versioning uniforme entre package.json, tags Git, et builds

## Ce qui change pour vous

### ✅ À FAIRE

1. **Utiliser les commits conventionnels**

   ```bash
   # ✅ CORRECT
   git commit -m "feat(sites): add site filtering"
   git commit -m "fix(auth): prevent double login"
   git commit -m "docs(readme): update install steps"

   # ❌ INCORRECT (mais fonctionnel, juste sans release)
   git commit -m "update sites"
   git commit -m "bugfix"
   ```

2. **Laisser semantic-release gérer les versions**
   - Push sur `main` → Version auto-créée
   - Pas besoin de toucher à `package.json`
   - Pas besoin de créer de tags manuels

3. **Vérifier l'état avant un merge**
   ```bash
   ./scripts/check-version.sh
   ```

### ❌ NE PLUS FAIRE

1. ~~Modifier `package.json` version manuellement~~
2. ~~Créer des tags Git manuellement (`git tag v2.0.2`)~~
3. ~~Mettre à jour `CHANGELOG.md` manuellement~~

## Exemples Pratiques

### Scénario 1 : Correction de bug

```bash
# 1. Créer une branche
git checkout -b fix/auth-token-expiry

# 2. Coder le fix
# ... modifications ...

# 3. Commit avec type "fix:"
git commit -m "fix(auth): prevent token expiration loop"

# 4. Push et créer PR
git push origin fix/auth-token-expiry

# 5. Merger sur main via GitHub
# → semantic-release incrémente automatiquement : v2.0.1 → v2.0.2
```

### Scénario 2 : Nouvelle fonctionnalité

```bash
git checkout -b feature/bulk-delete-sites
# ... code ...
git commit -m "feat(sites): add bulk delete endpoint with confirmation"
git push origin feature/bulk-delete-sites

# Merger → v2.0.1 → v2.1.0 (MINOR bump)
```

### Scénario 3 : Breaking Change

```bash
git checkout -b refactor/api-auth
# ... code ...
git commit -m "feat(api): redesign authentication flow

BREAKING CHANGE: JWT token format changed, all clients must upgrade to v3.0.0"

# Merger → v2.0.1 → v3.0.0 (MAJOR bump)
```

## Workflow Complet

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Developer: Branche + Code + Commit conventionnel        │
│    git commit -m "feat(scope): description"                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│ 2. GitHub: Pull Request + Review                            │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│ 3. Merge sur main                                            │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│ 4. GitHub Actions: semantic-release                          │
│    - Analyse commits                                         │
│    - Détermine nouvelle version (2.1.0)                      │
│    - Met à jour package.json                                 │
│    - Génère CHANGELOG                                        │
│    - Crée tag Git v2.1.0                                     │
│    - Publie GitHub Release                                   │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│ 5. Résultat                                                  │
│    - Version v2.1.0 disponible                               │
│    - CHANGELOG à jour                                        │
│    - Release notes sur GitHub                                │
│    - Build suivant = neopro-raspberry-v2.1.0.tar.gz          │
└─────────────────────────────────────────────────────────────┘
```

## Types de Commits & Impact

| Prefix             | Description      | Impact    | Exemple         |
| ------------------ | ---------------- | --------- | --------------- |
| `feat:`            | Nouvelle feature | **MINOR** | v2.0.1 → v2.1.0 |
| `fix:`             | Correction bug   | **PATCH** | v2.0.1 → v2.0.2 |
| `perf:`            | Performance      | **PATCH** | v2.0.1 → v2.0.2 |
| `refactor:`        | Refactoring      | Aucun     | -               |
| `docs:`            | Documentation    | Aucun     | -               |
| `style:`           | Formatage        | Aucun     | -               |
| `test:`            | Tests            | Aucun     | -               |
| `chore:`           | Maintenance      | Aucun     | -               |
| `ci:`              | CI/CD            | Aucun     | -               |
| `BREAKING CHANGE:` | Breaking         | **MAJOR** | v2.0.1 → v3.0.0 |

## Vérifications avant Merge

### Checklist

- [ ] Commits suivent la convention (`feat:`, `fix:`, etc.)
- [ ] Description claire du changement
- [ ] Tests passent (`npm run test:server`)
- [ ] Lint passe (`npm run lint`)
- [ ] PR approved

### Commandes utiles

```bash
# Voir les commits depuis le dernier tag
git log $(git describe --tags --abbrev=0)..HEAD --oneline

# Vérifier le versioning
./scripts/check-version.sh

# Voir tous les tags
git tag --sort=-v:refname | head -10
```

## Troubleshooting

### "semantic-release n'a pas créé de version"

**Causes possibles :**

1. Aucun commit `feat:` ou `fix:` depuis la dernière release
2. Seulement des commits `docs:` ou `chore:` (ne déclenchent pas de release)

**Solution :**

- C'est normal ! Une release n'est créée que s'il y a des changements fonctionnels
- Vérifier avec : `git log $(git describe --tags --abbrev=0)..HEAD --oneline`

### "Le build affiche toujours v2.0.1"

**Cause :** Le script `build-raspberry.sh` lit le dernier tag Git

**Solution :**

```bash
# Vérifier les tags locaux
git fetch --tags
git describe --tags --abbrev=0

# Si manquant, pull les tags
git pull --tags
```

### "J'ai oublié d'utiliser la convention dans mon commit"

**Solutions :**

1. **Avant de merger** : Modifier le commit

   ```bash
   git commit --amend -m "feat(scope): description"
   git push --force
   ```

2. **Après merge** : Faire un nouveau commit conventionnel
   ```bash
   git commit --allow-empty -m "feat(scope): add feature X"
   ```

## Références

- [Semantic Versioning](https://semver.org/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Documentation complète](./VERSIONING.md)
- [semantic-release](https://github.com/semantic-release/semantic-release)

## Support

En cas de doute :

1. Consulter [docs/VERSIONING.md](./VERSIONING.md)
2. Exécuter `./scripts/check-version.sh`
3. Vérifier les GitHub Actions logs
4. Contacter l'équipe technique

---

**Date de migration :** 2026-01-03
**Version actuelle :** v2.0.1
**Prochaine version automatique :** v2.1.0 (au prochain merge avec `feat:` ou `fix:`)
