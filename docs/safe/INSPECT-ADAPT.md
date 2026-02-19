# Inspect & Adapt — Template

> **Framework** : SAFe Essential
> **Fréquence** : Fin de chaque PI (toutes les 6 semaines)
> **Durée** : 1 heure
> Ce document sert de template pour chaque session I&A. Copier la section "Template" pour chaque PI.

---

## Agenda I&A (1h)

| Phase                     | Durée  | Activité                                               |
| ------------------------- | ------ | ------------------------------------------------------ |
| 1. Démo Système PI        | 15 min | Démo des features livrées pendant le PI                |
| 2. Revue Quantitative     | 15 min | Analyse des métriques (vélocité, prédictibilité, flow) |
| 3. Rétrospective          | 20 min | Ce qui a bien fonctionné / ce qui doit évoluer         |
| 4. Résolution de Problème | 10 min | Identifier le problème N°1 + action corrective         |

---

## Template I&A

> _Copier cette section et renommer "I&A PI-X" pour chaque fin de PI._

### I&A PI-1 (fin Mars 2026)

**Date** : _à compléter_
**Participants** : Gwenvael, Gabin

---

#### Phase 1 : Démo Système PI (15 min)

| Objectif PI                         | BV Planifié | Livré ?               | BV Réel | Commentaire |
| ----------------------------------- | ----------- | --------------------- | ------- | ----------- |
| 1. Portail sponsor self-service     | 9           | ☐ Oui ☐ Partiel ☐ Non | /10     |             |
| 2. Analytics sponsors + rapport PDF | 10          | ☐ Oui ☐ Partiel ☐ Non | /10     |             |
| 3. Rotation sponsors équitable      | 8           | ☐ Oui ☐ Partiel ☐ Non | /10     |             |
| 4. Wizard onboarding club           | 10          | ☐ Oui ☐ Partiel ☐ Non | /10     |             |
| 5. Profils config match             | 7           | ☐ Oui ☐ Partiel ☐ Non | /10     |             |
| 6. Alertes prédictives (étendu)     | 6           | ☐ Oui ☐ Partiel ☐ Non | /10     |             |
| 7. Migration repo pattern (étendu)  | 5           | ☐ Oui ☐ Partiel ☐ Non | /10     |             |
| 8. Monitoring flotte (étendu)       | 6           | ☐ Oui ☐ Partiel ☐ Non | /10     |             |
| 9. Résilience WiFi V2 (étendu)      | 7           | ☐ Oui ☐ Partiel ☐ Non | /10     |             |

**Démo live** : _lister les features démontrées en live_

---

#### Phase 2 : Revue Quantitative (15 min)

##### Vélocité

| Sprint       | SP Planifiés | SP Complétés | Vélocité % | US Terminées | US Reportées |
| ------------ | ------------ | ------------ | ---------- | ------------ | ------------ |
| Sprint 1     | 30           |              | %          |              |              |
| Sprint 2     | 28           |              | %          |              |              |
| Sprint 3     | 22           |              | %          |              |              |
| **Total PI** | **80**       |              | **%**      |              |              |

**Vélocité moyenne** : _ SP/sprint (cible : 27)
**Taux de complétion US** : _% (cible : > 85%)
**Taux de report** : \_% (cible : < 15%)

##### Prédictibilité Programme

```
Prédictibilité = Σ BV Réel (engagés atteints) / Σ BV Planifié (engagés)
               = ___ / 44
               = ___%
Cible : > 80%
```

##### Flow Metrics (voir FLOW-METRICS.md)

| Métrique          | Valeur PI-1                                   | Cible       | Tendance |
| ----------------- | --------------------------------------------- | ----------- | -------- |
| Flow Velocity     | \_ items/sprint                               | 8           |          |
| Flow Time         | \_ jours                                      | < 10        |          |
| Flow Load         | \_ items WIP                                  | < 5         |          |
| Flow Efficiency   | \_%                                           | > 30%       |          |
| Flow Distribution | _% feature / _% enabler / _% defect / _% debt | 60/15/15/10 |          |

##### Temps de Cycle

| Métrique                                      | Valeur    | Cible      |
| --------------------------------------------- | --------- | ---------- |
| Temps de cycle moyen (PR ouverte → fusionnée) | \_ jours  | < 3 jours  |
| Délai feature (début Epic → déployé)          | \_ jours  | < 14 jours |
| Temps moyen en revue de code                  | \_ heures | < 4 heures |

##### Qualité

| Métrique                        | Valeur  | Cible     |
| ------------------------------- | ------- | --------- |
| Couverture tests (Jest + Karma) | \_%     | > 80%     |
| Bugs trouvés post-release       | \_      | < 3       |
| Smoke tests passants            | \_/142  | 142/142   |
| Tests central-server passants   | \_/1487 | 1487/1487 |

---

#### Phase 3 : Rétrospective (20 min)

##### Ce qui a bien fonctionné

1. _à compléter_
2. _à compléter_
3. _à compléter_

##### Ce qui doit évoluer

1. _à compléter_
2. _à compléter_
3. _à compléter_

##### Mise à jour ROAM

| Risque                  | Ancien statut | Nouveau statut | Action |
| ----------------------- | ------------- | -------------- | ------ |
| R-01 Capacité solo-dev  | Accepted      |                |        |
| R-02 WiFi instable      | Mitigated     |                |        |
| R-03 Aucun sponsor beta | Owned         |                |        |
| R-04 Supabase scaling   | Accepted      |                |        |
| R-05 Sécurité api_keys  | Mitigated     |                |        |
| R-06 Retard onboarding  | Owned         |                |        |
| R-07 FTP Hostinger SPOF | Accepted      |                |        |
| R-08 Tests E2E sponsor  | Owned         |                |        |

**Nouveaux risques identifiés** :

- _à compléter_

---

#### Phase 4 : Résolution de Problème (10 min)

**Problème N°1 identifié** : _à compléter_

| Étape                              | Détail                                      |
| ---------------------------------- | ------------------------------------------- |
| **Accord sur le problème**         | _description factuelle_                     |
| **Analyse cause racine**           | _5 Pourquoi ou Ishikawa_                    |
| **Identifier la cause principale** | _cause racine_                              |
| **Reformuler le problème**         | _problème reformulé_                        |
| **Brainstormer des solutions**     | _3 solutions possibles_                     |
| **Sélectionner et s'engager**      | _solution retenue + responsable + échéance_ |

---

#### Décisions pour PI-2

| Décision                      | Détail                                           |
| ----------------------------- | ------------------------------------------------ |
| **Report**                    | _US reportées vers PI-2_                         |
| **Ajustement capacité**       | _vélocité réelle → nouvelle capacité PI-2_       |
| **Nouveaux risques**          | _ajoutés au ROAM PI-2_                           |
| **Ajustement périmètre PI-2** | _Epics ajoutés/retirés_                          |
| **Amélioration processus**    | _action corrective de la résolution de problème_ |

---

## Historique I&A

| PI   | Date           | Prédictibilité | Vélocité moyenne | Problème N°1  | Action corrective |
| ---- | -------------- | -------------- | ---------------- | ------------- | ----------------- |
| PI-1 | _Mars 2026_    | \_%            | \_ SP/sprint     | _à compléter_ | _à compléter_     |
| PI-2 | _Mai 2026_     |                |                  |               |                   |
| PI-3 | _Juillet 2026_ |                |                  |               |                   |

---

**Retour** : [SAFe Neopro](README.md) · [PI Objectives](PI-OBJECTIVES.md) · [ROAM](ROAM.md) · [Flow Metrics](FLOW-METRICS.md)
