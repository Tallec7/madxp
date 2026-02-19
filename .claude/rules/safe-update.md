---
paths:
  - 'docs/safe/**'
  - 'central-server/src/**'
  - 'central-dashboard/src/**'
  - 'raspberry/**'
---

# Règle SAFe — Mise à jour automatique des fichiers de pilotage

## Quand cette règle s'active

Avant chaque commit de type `feat(scope)` ou `fix(scope)` qui implémente ou complète une Feature SAFe (F-XX.Y), Claude DOIT vérifier si les fichiers SAFe doivent être mis à jour.

**Ne s'applique PAS** aux commits `chore`, `docs`, `refactor`, `test`, `ci`, `style` sauf s'ils complètent explicitement une Feature SAFe.

## Checklist avant commit

### 1. Identifier la Feature SAFe concernée

Utiliser le mapping scope → Epic pour déterminer quelle Feature est impactée :

| Scope commit                    | Epics liés       | Features               |
| ------------------------------- | ---------------- | ---------------------- |
| `sponsors`, `advertiser`        | E-01, E-02, E-03 | F-01.x, F-02.x, F-03.x |
| `match`, `remote`, `profiles`   | E-04             | F-04.x (Done)          |
| `onboarding`, `provisioning`    | E-06             | F-06.x                 |
| `wifi`, `resilience`, `offline` | E-07             | F-07.x                 |
| `alerts`, `predictive`          | E-08             | F-08.x (Done)          |
| `audit`, `repository`           | E-09             | F-09.x (Done)          |
| `fleet`, `monitoring`           | E-10             | F-10.x                 |
| `motion`, `templates`           | E-05             | F-05.x (PI-2)          |
| `regie`, `regional`             | E-11             | F-11.x (PI-2)          |
| `score`, `live`                 | E-15             | F-15.x (PI-2)          |
| `email`, `reports`              | E-16             | F-16.x (PI-2)          |
| `ab-test`, `creas`              | E-17             | F-17.x (PI-2)          |
| `multi-screen`, `sync`          | E-12             | F-12.x (PI-3)          |
| `branding`, `whitelabel`        | E-13             | F-13.x (PI-3)          |
| `solidarity`, `fund`            | E-14             | F-14.x (PI-3)          |
| `ticketing`                     | E-18             | F-18.x (PI-3)          |
| `presence`, `sensors`           | E-19             | F-19.x (PI-3)          |
| `ml`, `analytics-ml`            | E-20             | F-20.x (PI-3)          |
| `oauth`, `api-partners`         | E-21             | F-21.x (PI-3)          |

Si le scope ne matche aucun Epic, ou si le commit ne complète pas une Feature SAFe → **skip**, ne rien mettre à jour.

### 2. Mettre à jour `docs/safe/FEATURES.md`

Si une Feature passe à "Terminé" :

- Changer le statut de `⏳ Backlog` à `✅ Done`
- Renseigner le sprint (S1, S2, S3)
- Ajouter les fichiers clés implémentés

Format exact :

```markdown
| F-XX.Y Nom de la feature | ✅ Done | `fichier1.ts`, `fichier2.ts` |
```

### 3. Mettre à jour `docs/safe/IMPLEMENTED-BACKLOG.md`

Si une feature est **complète et déployable**, ajouter une ligne dans le bon domaine.

**Convention IMP- par domaine** :

| Domaine                         | Préfixe  | Dernier ID |
| ------------------------------- | -------- | ---------- |
| Authentification & Sécurité     | IMP-SEC- | 13         |
| Gestion de Contenu & Vidéo      | IMP-VID- | 13         |
| Score en Direct & Overlays      | IMP-OVR- | 10         |
| Déploiement & OTA               | IMP-DEP- | 12         |
| Monétisation & Sponsors         | IMP-MON- | 14         |
| Analytics & Reporting           | IMP-ANA- | 18         |
| Raspberry Pi (Edge)             | IMP-PI-  | 21         |
| Résilience Réseau & Sync        | IMP-NET- | 17         |
| Monitoring & Alertes            | IMP-ALR- | 22         |
| Administration & Infrastructure | IMP-ADM- | 22         |
| Playlists & Programmation       | IMP-PLS- | 03         |
| Gestion Utilisateurs & Rôles    | IMP-USR- | 04         |
| Documentation & Qualité         | IMP-DOC- | 07         |

Format ligne :

```markdown
| IMP-XXX-NN | Description de la feature | Production | `fichier1.ts`, `fichier2.ts` | Mois YYYY |
```

**Aussi** : mettre à jour le compteur dans la section Résumé en bas du fichier.

### 4. Mettre à jour les compteurs si nécessaire

Si le nombre total de Features/US/SP change :

- `docs/safe/PORTFOLIO.md` → Tableau "Par Value Stream" (Features, User Stories, SP Total)
- `docs/safe/README.md` → Nombres dans les tableaux de mapping

### 5. Mettre à jour les dates

Pour **chaque fichier `.md` modifié** dans `docs/safe/`, mettre à jour la ligne :

```markdown
> **Dernière mise à jour** : DD Mois YYYY
```

Format date français : `19 Février 2026`, `5 Mars 2026`, etc.

Mois en français : Janvier, Février, Mars, Avril, Mai, Juin, Juillet, Août, Septembre, Octobre, Novembre, Décembre.

### 6. Régénération Excel

**Ne rien faire** — le hook pre-commit dans `.husky/pre-commit` détecte automatiquement les changements `docs/safe/*.md` et régénère `NEOPRO_SAFe_Portfolio.xlsx`.

### 7. Mettre à jour `export-to-excel.py` si les données changent

Si de nouvelles données sont ajoutées (nouvelle Feature terminée, nouveau risque, etc.), mettre aussi à jour les données en dur dans `docs/safe/scripts/export-to-excel.py` pour que le prochain Excel généré soit cohérent.

## Exemple concret

Commit : `feat(sponsors): implement sponsor signup with magic link`
→ Complète F-01.1 (Inscription et profil sponsor)

Actions :

1. **FEATURES.md** : F-01.1 passe de `⏳ Backlog` à `✅ Done`, sprint = S2
2. **IMPLEMENTED-BACKLOG.md** : Ajouter `IMP-MON-15` dans "Monétisation & Sponsors"
3. **Dates** : Mettre à jour FEATURES.md et IMPLEMENTED-BACKLOG.md
4. **export-to-excel.py** : Mettre à jour le statut de F-01.1 dans `build_features_us()`
5. **Commit** : Inclure les `.md` modifiés dans le même commit
6. **Excel** : Le hook pre-commit régénère automatiquement

## Règles importantes

- **Ne JAMAIS inventer un statut** — demander à l'utilisateur si la Feature est vraiment terminée en cas de doute
- **Ne JAMAIS modifier les SP estimés** — seul l'utilisateur peut les ajuster
- **Ne JAMAIS changer le PI d'un Epic** — c'est une décision PI Planning
- Si plusieurs Features sont impactées par un seul commit, toutes les mettre à jour
- Les fichiers ROAM, FLOW-METRICS et INSPECT-ADAPT ne sont mis à jour que sur demande explicite de l'utilisateur (pas à chaque commit)
