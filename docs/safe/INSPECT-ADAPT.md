# Inspect & Adapt — NEOPRO

> **Dernière mise à jour** : 11 Avril 2026
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

| #   | Objectif PI                              | Epic | BV Planifié | Livré ?   | BV Réel | Commentaire                                  |
| --- | ---------------------------------------- | ---- | ----------- | --------- | ------- | -------------------------------------------- |
| 1   | Portail sponsor self-service             | E-01 | 9           | ☑ Partiel | 6/10    | Magic link OK, self-signup manquant          |
| 2   | Analytics sponsors avancés + rapport PDF | E-03 | 10          | ☑ Oui     | 10/10   | F-03.1 + F-03.2 Done                         |
| 3   | Rotation sponsors équitable              | E-02 | 8           | ☑ Partiel | 5/10    | Bresenham OK, min 20 + compteur DB manquants |
| 4   | Wizard onboarding club automatisé        | E-06 | 10          | ☐ Non     | 0/10    | QR code généré, wizard non implémenté        |

**Objectifs non engagés (aspirationnels)** :

| #   | Objectif                           | Epic | BV Planifié | Livré ? | BV Réel | Commentaire                             |
| --- | ---------------------------------- | ---- | ----------- | ------- | ------- | --------------------------------------- |
| 5   | WiFi USB auto-détection (reliquat) | E-07 | 7           | ☑ Oui   | 7/10    | RTL8192EU, udev, systemd, guide complet |
| 6   | Carte flotte temps réel (reliquat) | E-10 | 6           | ☑ Oui   | 6/10    | Leaflet map avec marqueurs statut       |

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
| Tests central-server      | 1464            | **2 728**     | ≥ 1464  |
| Tests Angular Dashboard   | 554             | **520**       | ≥ 554   |
| Smoke tests               | 142             | **1 193**     | 142/142 |
| Tests Admin Pi            | 146             | **194**       | ≥ 146   |
| Tests Socket Pi           | 71              | **71**        | ≥ 71    |
| **Total tests**           | **2 235**       | **4 706**     | ≥ 2 235 |
| Bugs trouvés post-release | -               | _à remplir_   | < 3     |

---

### Phase 3 : Rétrospective (20 min)

#### Ce qui a bien fonctionné ✅

1. Volume de travail livré considérable : SaaS mode, Club Portal, Billing, Campaigns, Proof of Play, USB WiFi, Leaflet map — bien au-delà du périmètre PI-1
2. Qualité du code : tests passés de 2 235 à 4 706 (+110%), couverture significativement améliorée
3. Objectifs étendus (WiFi USB + carte Leaflet) livrés à 100%
4. Architecture propre : chaque feature majeure documentée par un ADR (035 à 047)

#### Ce qui doit évoluer ⚠️

1. **Tracking SAFe non maintenu** : 6 Epics livrés sans aucun item SAFe. Le travail réel a divergé du plan PI-1 sans mise à jour du backlog
2. **Prédictibilité faible (57%)** : les objectifs engagés ont été partiellement délaissés au profit de travaux non planifiés (SaaS, Club Portal, Billing)
3. **Flow Metrics jamais collectées** : aucune vélocité, cycle time ou WIP mesurés pendant le PI — impossible de calibrer PI-2
4. **Wizard onboarding (E-06) non livré** : objectif à 10 BV avec 0% de réalisation — bottleneck scaling identifié en R-06

#### Mise à jour ROAM

| Risque                  | Statut début PI | Nouveau statut | Action                                                 |
| ----------------------- | --------------- | -------------- | ------------------------------------------------------ |
| R-01 Capacité solo-dev  | Accepted        | Accepted       | Confirmé : solo-dev a livré ~120 SP mais hors plan     |
| R-02 WiFi instable      | Mitigated       | **Resolved**   | E-07 entièrement livré (USB WiFi + cache + monitoring) |
| R-03 Aucun sponsor beta | Owned           | Owned          | Portail magic link opérationnel, pas de self-signup    |
| R-04 Supabase scaling   | Accepted        | Accepted       | Pas de problème à l'échelle actuelle                   |
| R-05 Sécurité api_keys  | Mitigated       | Mitigated      | Inchangé                                               |
| R-06 Retard onboarding  | Owned           | **Escalated**  | E-06 wizard non livré — onboarding reste manuel        |
| R-07 FTP Hostinger SPOF | Accepted        | Accepted       | Inchangé                                               |
| R-08 Tests E2E sponsor  | Owned           | Owned          | Non livré — capacité absorbée par SaaS/Club Portal     |

**Nouveaux risques identifiés** :

- **R-09** : Tracking SAFe désynchronisé du code — le pilotage produit des données obsolètes (Owned, Gwenvael)
- **R-10** : Mode SaaS non testé E2E — 30+ commits sans couverture E2E dédiée (Owned, Gwenvael)

---

### Phase 4 : Résolution de Problème (10 min)

**Problème N°1 identifié** : Le travail réel diverge du plan SAFe sans mise à jour, rendant le pilotage inopérant

| Étape                              | Détail                                                                                                                                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Accord sur le problème**         | 6 Epics livrés hors SAFe (~60 SP), objectifs engagés partiellement abandonnés, métriques jamais collectées                                                                                                                            |
| **Analyse cause racine**           | 1. Opportunités business (SaaS, Club Portal) émergent en cours de PI → 2. Solo-dev priorise le plus impactant → 3. Pas de processus pour replanifier le PI → 4. Les docs SAFe deviennent obsolètes → 5. Le pilotage perd toute valeur |
| **Identifier la cause principale** | Absence de processus de re-planification mid-PI quand de nouveaux besoins émergent                                                                                                                                                    |
| **Reformuler le problème**         | Comment garder le tracking SAFe à jour quand le scope change en cours de PI ?                                                                                                                                                         |
| **Brainstormer des solutions**     | 1. ART Sync bi-hebdomadaire (revoir le backlog toutes les 2 semaines) / 2. Automatiser la mise à jour SAFe via la règle safe-update.md / 3. Réduire le scope PI à 2 semaines (sprints courts)                                         |
| **Sélectionner et s'engager**      | Solution 2 : appliquer systématiquement `.claude/rules/safe-update.md` à chaque commit feat/fix — Gwenvael — immédiat                                                                                                                 |

---

### Décisions pour PI-2

| Décision                      | Détail                                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Report**                    | E-06 (wizard onboarding), F-01.1 (self-signup), F-02.1 restants (min 20 + compteur DB)                                        |
| **Ajustement capacité**       | Vélocité non mesurée formellement — estimation ~30 SP/sprint basée sur volume livré                                           |
| **Nouveaux risques**          | R-09 (tracking SAFe désync), R-10 (SaaS sans E2E) ajoutés au ROAM                                                             |
| **Ajustement périmètre PI-2** | PI-2 initial (263 SP) irréaliste — replanifier avec max 80 SP. E-05 templates partiellement avancé. E-22 partiellement livré. |
| **Amélioration processus**    | Appliquer systématiquement `.claude/rules/safe-update.md` à chaque commit feat/fix                                            |

---

## Template I&A (pour PI futurs)

> _Copier la section I&A PI-1 ci-dessus et renommer "I&A PI-X" pour chaque fin de PI._

---

## Historique I&A

| PI   | Date           | Prédictibilité | Vélocité moyenne | Problème N°1                                                         | Action corrective                          |
| ---- | -------------- | -------------- | ---------------- | -------------------------------------------------------------------- | ------------------------------------------ |
| PI-1 | Avril 2026     | **57%**        | _à calculer_     | Travail non tracké dans SAFe (SaaS, Club Portal, Billing, Campaigns) | Intégrer rétroactivement dans le portfolio |
| PI-2 | _Mai 2026_     |                |                  |                                                                      |                                            |
| PI-3 | _Juillet 2026_ |                |                  |                                                                      |                                            |

---

**Retour** : [SAFe Neopro](README.md) · [PI Objectives](PI-OBJECTIVES.md) · [ROAM](ROAM.md) · [Flow Metrics](FLOW-METRICS.md)
