# PI Objectives — Scoring Business Value

> **Dernière mise à jour** : 20 Février 2026
> **Framework** : SAFe Essential — PI Objectives avec Business Value (BV) scoring
> Le scoring BV (1-10) est défini par les Business Owners en PI Planning.

---

## Méthode de scoring

Chaque objectif PI reçoit un score de **Business Value (BV)** de 1 à 10 :

- **10** : Critique pour la survie de l'entreprise ou le revenu immédiat
- **8-9** : Fort impact business, ROI démontrable à court terme
- **5-7** : Impact modéré, amélioration significative d'un flux
- **3-4** : Amélioration incrémentale, impact indirect
- **1-2** : Nice-to-have, impact marginal

Le **Planned BV** est défini en PI Planning. Le **Actual BV** est évalué en Inspect & Adapt.
Le ratio **Actual / Planned** mesure la **Program Predictability** (cible : > 80%).

---

## Epics Done (BV acquise avant PI-1)

> Les Epics suivants étaient prévus en PI-1 mais se sont avérés déjà implémentés. Leur BV est **acquise d'office**.

| Epic                            | BV acquise | Statut     | Preuve                                    |
| ------------------------------- | ---------- | ---------- | ----------------------------------------- |
| E-04 Profils Config Match       | 7          | ✅ Done    | `config-profiles.controller.ts`           |
| E-08 Alertes Prédictives        | 6          | ✅ Done    | `predictive-alerts.service.ts`            |
| E-09 Architecture Audit         | 5          | ✅ Done    | 24 repositories, ESLint                   |
| E-07 Résilience WiFi (partiel)  | 5          | ⚠️ Partiel | Cache 48h + monitoring OK, USB WiFi reste |
| E-10 Monitoring Fleet (partiel) | 3          | ⚠️ Partiel | Métriques OK, carte Leaflet reste         |
| **Total BV acquise**            | **26**     |            |                                           |

---

## PI-1 Objectives (Février - Mars 2026)

> Après requalification des Done, le PI-1 se concentre sur 4 Epics + 2 reliquats = **79 SP**.

### Objectifs Engagés

| #   | Objectif PI                                                                                                                                            | VS  | Thème | BV (Planned) | Features liées         | SP estimés |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --- | ----- | ------------ | ---------------------- | ---------- |
| 1   | **Lancer le portail sponsor self-service** — Les sponsors peuvent s'inscrire, uploader un spot et sélectionner leurs gymnases sans intervention NEOPRO | VS2 | TS1   | **9**        | F-01.1, F-01.2, F-01.3 | 19         |
| 2   | **Livrer les analytics sponsors avec rapport PDF** — Dashboard impressions temps réel + export rapport mensuel automatisé                              | VS2 | TS1   | **10**       | F-03.1, F-03.2, F-03.3 | 23         |
| 3   | **Implémenter la rotation sponsor équitable** — Algorithme garantissant ≥ 20 passages/match/sponsor avec tracking                                      | VS2 | TS1   | **8**        | F-02.1, F-02.2         | 11         |
| 4   | **Créer le wizard onboarding club** — Nouveau club opérationnel en < 30 min via QR code + auto-provisioning                                            | VS1 | TS3   | **10**       | F-06.1, F-06.2         | 18         |

### Objectifs Étendus

| #   | Objectif PI                                                                            | VS         | Thème | BV (Planned) | Features liées | SP estimés |
| --- | -------------------------------------------------------------------------------------- | ---------- | ----- | ------------ | -------------- | ---------- |
| 5   | **Carte de la flotte Leaflet** — Vue cartographique des Pi avec statut temps réel      | Transverse | TS4   | **4**        | F-10.1         | 5          |
| 6   | **Support clé USB WiFi externe** — Améliorer la réception WiFi des gymnases difficiles | VS1        | TS3   | **3**        | F-07.3         | 3          |

---

### Récapitulatif PI-1

| Catégorie      | Objectifs | SP     | BV total |
| -------------- | --------- | ------ | -------- |
| Engagés        | 4         | 71     | 37       |
| Étendus        | 2         | 8      | 7        |
| **Total PI-1** | **6**     | **79** | **44**   |

**Capacité PI** : 79 SP (3 sprints × ~26 SP)
**Taux de charge** : Engagés 71 SP / Capacité 80 SP = **89%** (marge de sécurité de 11%)

---

### Calcul de Prédictibilité (fin de PI)

```
Prédictibilité Programme = Σ (BV Réel des objectifs atteints) / Σ (BV Planifié engagés)
                         = BV Réel / 37
Cible : > 80% → BV Réel ≥ 30
```

| Objectif                     | BV Planifié | BV Réel            | Atteint ? |
| ---------------------------- | ----------- | ------------------ | --------- |
| 1. Portail sponsor           | 9           | _à remplir en I&A_ |           |
| 2. Analytics sponsors        | 10          | _à remplir en I&A_ |           |
| 3. Rotation sponsors         | 8           | _à remplir en I&A_ |           |
| 4. Wizard onboarding         | 10          | _à remplir en I&A_ |           |
| **Total Engagés**            | **37**      |                    |           |
| 5. Carte flotte (étendu)     | 4           | _à remplir en I&A_ |           |
| 6. USB WiFi (étendu)         | 3           | _à remplir en I&A_ |           |
| **Total Étendus**            | **7**       |                    |           |
| **Prédictibilité Programme** |             | **\_%**            |           |

---

## PI-2 Objectives (prévisionnel)

> _À définir lors du PI-2 Planning (fin Mars 2026)._

| #   | Objectif PI (prévisionnel)                                             | VS  | Thème | BV estimé |
| --- | ---------------------------------------------------------------------- | --- | ----- | --------- |
| 1   | Lancer la régie publicitaire régionale avec ≥ 1 annonceur signé        | VS2 | TS1   | 10        |
| 2   | Livrer 3 templates motion design personnalisables                      | VS2 | TS2   | 6         |
| 3   | TV + LED dual output fonctionnel (1 Pi, 2 HDMI, contenus différenciés) | VS1 | TS2   | 8         |
| 4   | Carry-over PI-1 (objectifs étendus non atteints)                       | -   | -     | Variable  |

---

## PI-3 Objectives (prévisionnel)

> _À définir lors du PI-3 Planning (fin Mai 2026)._

| #   | Objectif PI (prévisionnel)                | VS         | Thème | BV estimé |
| --- | ----------------------------------------- | ---------- | ----- | --------- |
| 1   | Multi-écrans synchronisés (2 Pi par site) | VS1        | TS2   | 8         |
| 2   | Marque blanche club fonctionnelle         | VS1        | TS2   | 6         |
| 3   | Fonds de solidarité sport lancé           | Transverse | TS3   | 5         |

---

**Retour** : [SAFe Neopro](README.md) · [Features](FEATURES.md) · [Inspect & Adapt](INSPECT-ADAPT.md)
