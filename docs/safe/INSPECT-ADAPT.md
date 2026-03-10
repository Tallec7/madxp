# Inspect & Adapt — NEOPRO

> **Dernière mise à jour** : 21 Février 2026
> **Framework** : SAFe Essential
> **Fréquence** : Fin de chaque PI (toutes les 6 semaines)
> **Durée** : 1 heure
> Ce document sert de template pour chaque session I&A. Les sections pré-remplies reflètent les données du PI Planning ; les résultats sont complétés en fin de PI.

---

## Agenda I&A (1h)

| Phase                     | Durée  | Activité                                               |
| ------------------------- | ------ | ------------------------------------------------------ |
| 1. Démo Système PI        | 15 min | Démo des features livrées pendant le PI                |
| 2. Revue Quantitative     | 15 min | Analyse des métriques (vélocité, prédictibilité, flow) |
| 3. Rétrospective          | 20 min | Ce qui a bien fonctionné / ce qui doit évoluer         |
| 4. Résolution de Problème | 10 min | Identifier le problème N°1 + action corrective         |

---

## I&A PI-1 (fin Mars 2026)

**Date prévue** : Semaine 13 (fin Mars 2026)
**Participants** : Gwenvael, Gabin
**Périmètre** : E-01, E-02, E-03, E-06 + reliquats E-07/E-10

---

### Phase 1 : Démo Système PI (15 min)

| #   | Objectif PI                              | Epic | BV Planifié | Livré ?               | BV Réel | Commentaire |
| --- | ---------------------------------------- | ---- | ----------- | --------------------- | ------- | ----------- |
| 1   | Portail sponsor self-service             | E-01 | 9           | ☐ Oui ☐ Partiel ☐ Non | /10     |             |
| 2   | Analytics sponsors avancés + rapport PDF | E-03 | 10          | ☐ Oui ☐ Partiel ☐ Non | /10     |             |
| 3   | Rotation sponsors équitable              | E-02 | 8           | ☐ Oui ☐ Partiel ☐ Non | /10     |             |
| 4   | Wizard onboarding club automatisé        | E-06 | 10          | ☐ Oui ☐ Partiel ☐ Non | /10     |             |

**Objectifs non engagés (aspirationnels)** :

| #   | Objectif                           | Epic | BV Planifié | Livré ?               | BV Réel | Commentaire |
| --- | ---------------------------------- | ---- | ----------- | --------------------- | ------- | ----------- |
| 5   | WiFi USB auto-détection (reliquat) | E-07 | 7           | ☐ Oui ☐ Partiel ☐ Non | /10     |             |
| 6   | Carte flotte temps réel (reliquat) | E-10 | 6           | ☐ Oui ☐ Partiel ☐ Non | /10     |             |

**Features à démontrer** :

- F-01.1 Inscription sponsor self-service
- F-01.2 Upload vidéo sponsor + sélection gymnases
- F-01.3 Validation admin des spots
- F-02.1 Algorithme rotation round-robin
- F-02.2 Configuration rotation par site
- F-03.1 Dashboard analytics impressions
- F-03.2 Export CSV + rapport PDF
- ~~F-03.3 Heatmap Leaflet impressions~~ — **SUPPRIMÉE** (non pertinente <10 clubs)
- F-06.1 Auto-provisioning Pi
- F-06.2 Wizard onboarding 4 étapes
- F-07.3 WiFi USB auto-détection (reliquat)
- F-10.1 Carte flotte (reliquat)

---

### Phase 2 : Revue Quantitative (15 min)

#### Vélocité

| Sprint       | Dates     | SP Planifiés | SP Complétés | Vélocité % | US Terminées | US Reportées |
| ------------ | --------- | ------------ | ------------ | ---------- | ------------ | ------------ |
| Sprint 1     | Sem 8-9   | 26           | _à remplir_  | \_%        | _/6_         |              |
| Sprint 2     | Sem 10-11 | 25           | _à remplir_  | \_%        | _/7_         |              |
| Sprint 3     | Sem 12-13 | 28           | _à remplir_  | \_%        | _/6_         |              |
| **Total PI** |           | **79**       | _à remplir_  | **\_%**    | _/19_        |              |

**Vélocité moyenne** : _ SP/sprint (cible : ~26 SP/sprint)
**Taux de complétion US** : _% (cible : > 85%)
**Taux de report (carry-over)** : \_% (cible : < 15%)

#### Prédictibilité Programme

```
Prédictibilité = Σ BV Réel (engagés atteints) / Σ BV Planifié (engagés)
               = ___ / 37 (somme BV des 4 objectifs engagés : 9+10+8+10)
               = ___%
Cible : > 80%
```

#### Flow Metrics (voir [FLOW-METRICS.md](FLOW-METRICS.md))

| Métrique          | Valeur PI-1                         | Cible       | Tendance     |
| ----------------- | ----------------------------------- | ----------- | ------------ |
| Flow Velocity     | \_ items/sprint                     | 8           | _N/A (PI-1)_ |
| Flow Time         | \_ jours                            | < 10        |              |
| Flow Load         | \_ items WIP                        | < 5         |              |
| Flow Efficiency   | \_%                                 | > 30%       |              |
| Flow Distribution | _% feat / _% enb / _% def / _% debt | 60/15/15/10 |              |

#### Temps de Cycle

| Métrique                                      | Valeur    | Cible      |
| --------------------------------------------- | --------- | ---------- |
| Temps de cycle moyen (PR ouverte → fusionnée) | \_ jours  | < 3 jours  |
| Délai feature (début Epic → déployé)          | \_ jours  | < 14 jours |
| Temps moyen en revue de code                  | \_ heures | < 4 heures |

> **Note** : Avec un solo-dev (Claude + Gwenvael), le cycle time PR est quasi-instantané. Le délai feature est la métrique la plus pertinente.

#### Qualité

| Métrique                  | Valeur avant PI | Valeur fin PI | Cible   |
| ------------------------- | --------------- | ------------- | ------- |
| Tests central-server      | 1464            | _à remplir_   | ≥ 1464  |
| Tests Angular Dashboard   | 554             | _à remplir_   | ≥ 554   |
| Smoke tests               | 142             | _à remplir_   | 142/142 |
| Tests Admin Pi            | 146             | _à remplir_   | ≥ 146   |
| Tests Socket Pi           | 71              | _à remplir_   | ≥ 71    |
| **Total tests**           | **2 235**       | _à remplir_   | ≥ 2 235 |
| Bugs trouvés post-release | -               | _à remplir_   | < 3     |

---

### Phase 3 : Rétrospective (20 min)

#### Ce qui a bien fonctionné ✅

1. _à compléter en fin de PI_
2. _à compléter en fin de PI_
3. _à compléter en fin de PI_

#### Ce qui doit évoluer ⚠️

1. _à compléter en fin de PI_
2. _à compléter en fin de PI_
3. _à compléter en fin de PI_

#### Mise à jour ROAM

| Risque                  | Statut début PI | Nouveau statut | Action                                     |
| ----------------------- | --------------- | -------------- | ------------------------------------------ |
| R-01 Capacité solo-dev  | Accepted        |                | _Solo-dev reste le contrainte principale_  |
| R-02 WiFi instable      | Mitigated       |                | _WiFi USB 4 couches stabilisé en pré-PI-1_ |
| R-03 Aucun sponsor beta | Owned           |                | _Portail sponsor E-01 en PI-1_             |
| R-04 Supabase scaling   | Accepted        |                | _Transaction mode, pool 5_                 |
| R-05 Sécurité api_keys  | Mitigated       |                | _JWT + MFA + audit en place_               |
| R-06 Retard onboarding  | Owned           |                | _Wizard E-06 en PI-1_                      |
| R-07 FTP Hostinger SPOF | Accepted        |                | _ADR-025 dual storage planifié_            |
| R-08 Tests E2E sponsor  | Owned           |                | _Playwright E2E en PI-1 si capacité_       |

**Nouveaux risques identifiés** :

- _à compléter en fin de PI_

---

### Phase 4 : Résolution de Problème (10 min)

**Problème N°1 identifié** : _à compléter en fin de PI_

| Étape                              | Détail                                      |
| ---------------------------------- | ------------------------------------------- |
| **Accord sur le problème**         | _description factuelle_                     |
| **Analyse cause racine**           | _5 Pourquoi ou diagramme Ishikawa_          |
| **Identifier la cause principale** | _cause racine retenue_                      |
| **Reformuler le problème**         | _problème reformulé avec cause racine_      |
| **Brainstormer des solutions**     | 1. _ / 2. _ / 3. \_                         |
| **Sélectionner et s'engager**      | _solution retenue + responsable + échéance_ |

---

### Décisions pour PI-2

| Décision                      | Détail                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------- |
| **Report**                    | _US reportées vers PI-2_                                                         |
| **Ajustement capacité**       | _vélocité réelle → nouvelle capacité PI-2_                                       |
| **Nouveaux risques**          | _ajoutés au ROAM PI-2_                                                           |
| **Ajustement périmètre PI-2** | Périmètre prévu : E-05, E-11, E-15, E-16, E-17 (69 SP) — _ajuster si nécessaire_ |
| **Amélioration processus**    | _action corrective issue de la résolution de problème_                           |

---

## Template I&A (pour PI futurs)

> _Copier la section I&A PI-1 ci-dessus et renommer "I&A PI-X" pour chaque fin de PI._

---

## Historique I&A

| PI   | Date           | Prédictibilité | Vélocité moyenne | Problème N°1  | Action corrective |
| ---- | -------------- | -------------- | ---------------- | ------------- | ----------------- |
| PI-1 | _Mars 2026_    | \_%            | \_ SP/sprint     | _à compléter_ | _à compléter_     |
| PI-2 | _Mai 2026_     |                |                  |               |                   |
| PI-3 | _Juillet 2026_ |                |                  |               |                   |

---

**Retour** : [SAFe Neopro](README.md) · [PI Objectives](PI-OBJECTIVES.md) · [ROAM](ROAM.md) · [Flow Metrics](FLOW-METRICS.md)
