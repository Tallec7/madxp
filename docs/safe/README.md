# SAFe Neopro — Pilotage Produit

> **Dernière mise à jour** : 18 Février 2026
> **Framework** : SAFe Essential (simplifié)
> **Cadence PI** : 6 semaines (3 sprints de 2 semaines)
> **PI actuel** : PI-1 (Février - Mars 2026)
> **Source de vérité Notion** : [SAFe Neopro](https://www.notion.so/30bc27de363881d49d06e50eabbdd6b5)

---

## Databases Notion

| Database         | Contenu                                         |
| ---------------- | ----------------------------------------------- |
| Value Streams    | 2 OVS + 1 DVS avec lead times, bottlenecks      |
| Business Pillars | 4 Thèmes Stratégiques alignés OKR               |
| Epics            | 14 Epics avec Lean Business Cases, KPI, WSJF    |
| Features         | 23 Features avec acceptance criteria            |
| User Stories     | 41 US avec critères d'acceptation, story points |
| Sprint Tracker   | Vélocité par sprint, formules automatiques      |

---

## Hiérarchie

```
Vision Stratégique (OKR 2026)
  ├── Value Streams (2 flux de valeur)
  │    ├── VS1: Club to Screen
  │    └── VS2: Sponsor to Impression
  ├── Thèmes Stratégiques (transverses aux VS)
  │    ├── TS1: Monétisation (O2+O4)
  │    ├── TS2: Expérience Match (O3+O5)
  │    ├── TS3: Acquisition (O1+O5)
  │    └── TS4: Excellence Ops (O3+O4)
  └── Epics → Features → User Stories
```

## Value Streams

| VS  | Nom                   | Trigger                          | Valeur délivrée              | Bottleneck actuel                          |
| --- | --------------------- | -------------------------------- | ---------------------------- | ------------------------------------------ |
| VS1 | Club to Screen        | Un club signe                    | Contenu sur la TV du gymnase | Onboarding SSH manuel (2-3j → cible 30min) |
| VS2 | Sponsor to Impression | Un sponsor veut de la visibilité | Rapport d'impressions ROI    | Pas de self-service (1-2 sem → cible < 1j) |

## Thèmes Stratégiques (ex-Business Pillars)

| TS  | Nom                       | OKR aligné | VS impactés            |
| --- | ------------------------- | ---------- | ---------------------- |
| TS1 | Réseau Publicitaire       | O2 + O4    | VS2 principalement     |
| TS2 | Expérience Match          | O3 + O5    | VS1 principalement     |
| TS3 | Acquisition & Déploiement | O1 + O5    | VS1 principalement     |
| TS4 | Excellence Opérationnelle | O3 + O4    | Transverse (VS1 + VS2) |

## Mapping Epics → Value Streams

| Epic                                  | Value Stream | Thème Stratégique | PI   |
| ------------------------------------- | ------------ | ----------------- | ---- |
| E-01 Portail Sponsor Self-Service     | VS2          | TS1               | PI-1 |
| E-02 Rotation Sponsors                | VS2          | TS1               | PI-1 |
| E-03 Analytics Sponsors Avancé        | VS2          | TS1               | PI-1 |
| E-04 Profils Config Match             | VS1          | TS2               | PI-1 |
| E-05 Motion Design Personnalisé       | VS2          | TS2               | PI-2 |
| E-06 Onboarding Automatisé            | VS1          | TS3               | PI-1 |
| E-07 Résilience WiFi V2               | VS1          | TS3               | PI-1 |
| E-08 Alertes Prédictives Dashboard    | Transverse   | TS4               | PI-1 |
| E-09 Architecture Audit               | Transverse   | TS4               | PI-1 |
| E-10 Monitoring Fleet                 | Transverse   | TS4               | PI-1 |
| **E-11 Régie Publicitaire Régionale** | VS2          | TS1               | PI-2 |
| **E-12 Multi-Écrans Synchronisés**    | VS1          | TS2               | PI-3 |
| **E-13 Marque Blanche Club**          | VS1          | TS2               | PI-3 |
| **E-14 Fonds de Solidarité Sport**    | Transverse   | TS3               | PI-3 |

## Roadmap PI

| PI   | Période        | Epics            | Focus                                                              |
| ---- | -------------- | ---------------- | ------------------------------------------------------------------ |
| PI-1 | Fév-Mars 2026  | E-01 à E-10      | Fondations : sponsors self-service, analytics, onboarding, alertes |
| PI-2 | Avr-Mai 2026   | E-05, E-11       | Régie publicitaire régionale + motion design                       |
| PI-3 | Juin-Juil 2026 | E-12, E-13, E-14 | Multi-écrans, marque blanche, fonds solidarité                     |

## Cadence

| Évènement          | Fréquence             | Durée       |
| ------------------ | --------------------- | ----------- |
| PI Planning        | Toutes les 6 semaines | 1/2 journée |
| Sprint Planning    | Toutes les 2 semaines | 1h          |
| Sprint Review/Demo | Toutes les 2 semaines | 30min       |
| Inspect & Adapt    | Fin de PI             | 1h          |
| Backlog Refinement | Hebdomadaire          | 30min       |

---

## PI-1 Planning (Février - Mars 2026)

**Durée** : 6 semaines (3 sprints de 2 semaines)
**Capacité** : ~80 story points

### Objectifs PI-1

| #   | Objectif PI                            | VS         | Thème | Business Value                        |
| --- | -------------------------------------- | ---------- | ----- | ------------------------------------- |
| 1   | Lancer le portail sponsor self-service | VS2        | TS1   | Autonomie sponsors, réduction support |
| 2   | Compléter analytics sponsors avancés   | VS2        | TS1   | Preuve de valeur annonceurs           |
| 3   | Implémenter profils config match       | VS1        | TS2   | Expérience différenciée par phase     |
| 4   | Créer wizard onboarding club           | VS1        | TS3   | Scalabilité déploiement               |
| 5   | Afficher alertes prédictives           | Transverse | TS4   | Anticiper les pannes                  |
| 6   | Migrer controllers vers Repository     | Transverse | TS4   | Qualité code                          |

### Répartition par Sprint

| Sprint   | Dates     | Story Points | Focus                                                      |
| -------- | --------- | ------------ | ---------------------------------------------------------- |
| Sprint 1 | Sem 8-9   | ~30 SP       | Foundations : analytics, profils, monitoring, repositories |
| Sprint 2 | Sem 10-11 | ~28 SP       | Features : upload sponsor, wizard onboarding, alertes      |
| Sprint 3 | Sem 12-13 | ~22 SP       | Finalisation : campagnes, auto-provisioning, tendances     |

### Velocity Cible

- Sprint 1 : 30 SP (8 US)
- Sprint 2 : 28 SP (8 US)
- Sprint 3 : 22 SP (5 US + stretch)
- **Total PI-1 : 80 SP / 25 User Stories**

---

## Suivi Vélocité & Équipe

### Métriques Sprint

Le **Sprint Tracker** (database Notion) capture automatiquement :

- **SP Planifiés vs Complétés** → Vélocité (% de complétion)
- **US Terminées vs Reportées** → Taux de complétion
- **Focus Areas** → Répartition effort par Value Stream

### Indicateurs DVS (Development Value Stream)

| Métrique           | Cible PI-1   | Mesure                                 |
| ------------------ | ------------ | -------------------------------------- |
| Vélocité moyenne   | 27 SP/sprint | SP Complétés / sprint                  |
| Taux complétion US | > 85%        | US Terminées / (Terminées + Reportées) |
| Cycle Time moyen   | < 3 jours    | PR open → merged                       |
| Lead Time feature  | < 2 semaines | Epic start → déployé                   |
| Couverture tests   | > 80%        | Jest + Karma coverage                  |
| Taux de carry-over | < 15%        | US Reportées / total US                |

### Rituels de suivi

- **Daily** : Stand-up async (Slack) — blockers, avancement
- **Bi-weekly** : Sprint Review — démo features terminées
- **Bi-weekly** : Sprint Retro — amélioration continue
- **Fin de PI** : Inspect & Adapt — analyse vélocité, ajustement capacité PI+1

### Évolution équipe (Team Topologies)

| Phase    | Effectif  | Organisation                            | Trigger             |
| -------- | --------- | --------------------------------------- | ------------------- |
| Actuelle | 1 dev     | Stream-Aligned unique                   | -                   |
| Phase 2  | 3-5 devs  | 1 Stream-Aligned + 1 Platform (partiel) | Recrutement 2e dev  |
| Phase 3  | 8-12 devs | 2 Stream-Aligned (1/VS) + Platform Team | Clients > 100 clubs |
| Phase 4  | 10+ devs  | ART avec 2+ équipes par VS              | Nécessité d'un RTE  |

---

## Canvas & Vues Visuelles

| Page                                                             | Description                                      |
| ---------------------------------------------------------------- | ------------------------------------------------ |
| [📊 Portfolio SAFe](PORTFOLIO.md)                                | Roadmap Gantt, architecture SAFe, métriques clés |
| [🟢 OVS1 — Club to Screen](OVS1-CLUB-TO-SCREEN.md)               | Flux opérationnel, étapes, segments, KPIs        |
| [🟠 OVS2 — Sponsor to Impression](OVS2-SPONSOR-TO-IMPRESSION.md) | Flux sponsor, modèles de revenus, KPIs           |
| [🟣 DVS-1 — Neopro Platform](DVS1-NEOPRO-PLATFORM.md)            | Value Proposition, stack, budget, WSJF chart     |

## Références

- [🏆 OKR NEOPRO 2026](https://www.notion.so/2ddc27de363880c9931af8f16684916d)
- [📝 Documentation principale](../00-INDEX.md)
- [💼 Business Plan](../business/BUSINESS_PLAN_COMPLET.md)

---

**Retour** : [Documentation principale](../00-INDEX.md)
