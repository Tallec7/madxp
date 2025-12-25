# Commits Archivés

> **Archivé le** : 25 décembre 2025
> **Raison** : Granularité excessive, valeur historique uniquement

Ce dossier contient **138 fichiers** de documentation de commits individuels, créés automatiquement lors de la période de développement actif (3-8 décembre 2025).

## Pourquoi archivés ?

1. **Granularité excessive** : Un fichier par commit est trop détaillé pour une documentation maintenable
2. **Redondance** : Le fichier `CHANGELOG.md` principal résume déjà ces changements
3. **Volume** : Ces 138 fichiers représentaient 63% de toute la documentation

## Contenu

Chaque fichier `.md` documente un commit spécifique avec :
- Hash du commit
- Date
- Auteur
- Description des changements

## Accès

Si vous avez besoin de détails sur un commit spécifique :

```bash
# Voir le fichier de documentation du commit
cat docs/archive/commits/[HASH].md

# Ou utiliser git directement
git show [HASH]
git log --oneline [HASH] -1
```

## Référence

Le `CHANGELOG.md` principal conserve des liens vers ces fichiers pour référence historique.

---

**Retour** : [Archive](../README.md) | [Documentation](../../00-INDEX.md)
