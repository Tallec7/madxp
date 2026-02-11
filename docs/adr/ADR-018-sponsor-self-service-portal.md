# ADR-018: Portail Sponsor Self-Service

**Date** : Février 2026
**Statut** : Proposé
**Décideurs** : À déterminer

---

## Contexte

Aujourd'hui, les interactions sponsor passent systématiquement par la chargée de com' du club :
1. Le sponsor envoie son visuel par email
2. La chargée de com' l'uploade dans Neopro
3. Le sponsor demande ses stats → elle génère un PDF et l'envoie
4. Le sponsor change de créa → elle recommence

**Objectif** : Permettre au sponsor de faire ces actions lui-même, sans intermédiaire.

Le rôle `advertiser` existe déjà dans le système avec ses propres permissions (RLS, voir ADR-005).

## Décision

À prendre.

## Options

### Option A : Extension du dashboard existant (rôle advertiser)

**Principe** : Le sponsor se connecte au même dashboard que les opérateurs, mais voit uniquement ses données grâce au RLS existant.

```
dashboard.neopro.tv/login → rôle advertiser → vue limitée :
  - Mes vidéos (upload, conversion image→vidéo)
  - Mes stats (impressions, rapports)
  - Mes clubs (où mes pubs passent)
```

**Avantages** :
- **Réutilise l'existant** : Auth, RLS, services Angular, API backend
- Pas de nouvelle app à déployer
- Le rôle `advertiser` et les tables `advertiser_videos`, `advertiser_sites` existent déjà
- Maintenance : un seul codebase

**Inconvénients** :
- UX compromise : le dashboard est pensé pour les opérateurs, pas les sponsors
- Risque de surcharger le dashboard avec des vues très différentes
- Le sponsor voit la navigation "technique" même si la plupart des menus sont cachés

**Estimation effort** : Faible à Moyen
**Risque** : UX inadaptée aux sponsors

### Option B : Application Angular séparée (sponsor.neopro.tv)

**Principe** : Une application dédiée avec une UX pensée pour les sponsors.

```
sponsor.neopro.tv → App Angular dédiée :
  - Dashboard simple avec KPI en gros
  - Upload de créa (drag & drop + conversion)
  - Rapports automatiques
  - Vue "où passent mes pubs" (carte ?)
```

**Avantages** :
- **UX optimale** : Interface pensée pour un non-technicien
- Branding possible (sponsors = clients payants, l'interface doit impressionner)
- Séparation nette des responsabilités
- Peut évoluer indépendamment du dashboard opérateur

**Inconvénients** :
- Nouveau codebase Angular à maintenir
- Duplication partielle de services (auth, API calls)
- Hébergement supplémentaire
- Plus long à développer

**Estimation effort** : Élevé
**Risque** : Maintenance de 2 apps frontend

### Option C : Pages publiques (type landing page)

**Principe** : Des pages simples accessibles par lien unique (comme le Cloud Remote est accessible par UUID).

```
neopro.tv/sponsor/{sponsorId}/{token} → Page statique :
  - Mes stats ce mois
  - Upload nouveau visuel
  - Télécharger mon rapport
```

**Avantages** :
- **Zéro friction** : Pas de login, accès par lien unique (comme ADR-007)
- Ultra simple à développer (quelques pages)
- Le sponsor reçoit le lien par email chaque mois

**Inconvénients** :
- Sécurité par token (si le lien fuite, accès aux données)
- Fonctionnalités limitées
- Pas de vraie gestion de compte

**Estimation effort** : Faible
**Risque** : Sécurité, feature limitée

## Critères de décision

| Critère | Poids | Option A (Dashboard) | Option B (App dédiée) | Option C (Landing) |
|---------|-------|---------------------|----------------------|-------------------|
| Effort dev | 25% | ✅ Faible | ❌ Élevé | ✅ Très faible |
| UX sponsor | 30% | ⚠️ Moyenne | ✅ Excellente | ⚠️ Basique |
| Maintenance | 20% | ✅ 1 codebase | ❌ 2 codebases | ✅ Minimal |
| Évolutivité | 15% | ✅ Bonne | ✅ Excellente | ❌ Limitée |
| Impression client | 10% | ⚠️ Technique | ✅ Pro | ⚠️ Simple |

## Recommandation

**Option A (extension dashboard)** en V1, **Option B (app dédiée)** en V2 :

1. **V1** : Créer des vues dédiées dans le dashboard existant pour le rôle `advertiser`
   - Dashboard sponsor avec KPI
   - Upload + conversion image→vidéo
   - Stats et rapport PDF
   - ~2-3 semaines de dev

2. **V2** (si les sponsors deviennent un revenu significatif) : Extraire vers une app dédiée avec UX premium

La logique backend (API, RLS) sera identique dans les deux cas.

## Références

- ADR-005 : Multi-tenant avec RLS (rôle advertiser existant)
- ADR-007 : API publique (pattern d'accès sans auth)
- Tables existantes : `advertisers`, `advertiser_videos`, `advertiser_sites`, `advertiser_impressions`

---

*Créé le 11 février 2026*
