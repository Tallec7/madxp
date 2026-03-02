# SAFe Neopro — Pilotage Produit

> **Dernière mise à jour** : 2 Mars 2026
> **Framework** : SAFe Essential (simplifié)
> **Cadence PI** : 6 semaines (3 sprints de 2 semaines)
> **PI actuel** : PI-1 (Février - Mars 2026)
> **Notion (visualisation)** : [SAFe Neopro](https://www.notion.so/30bc27de363881d49d06e50eabbdd6b5)

---

## Databases Notion

| Database         | Contenu                                                      |
| ---------------- | ------------------------------------------------------------ |
| Value Streams    | 2 OVS + 1 DVS avec lead times, bottlenecks                   |
| Business Pillars | 4 Thèmes Stratégiques alignés OKR                            |
| Epics            | 22 Epics (5 pré-PI-1 + 4 PI-1 + 6 PI-2 + 7 PI-3)             |
| Features         | 42 Features avec acceptance criteria                         |
| User Stories     | 254 US (178 Done + 19 PI-1 + 48 PI-2 + 9 PI-3)               |
| Sprint Tracker   | Vélocité par sprint, formules automatiques                   |
| Implemented      | 178 features livrées (13 domaines), traçabilité git complète |

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
       ├── Done (5 Epics, ~41 SP livrés)
       ├── PI-1 (4 Epics + 2 reliquats, 79 SP)
       ├── PI-2 (6 Epics, 215 SP)
       └── PI-3 (7 Epics, 73 SP)
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

### Epics Done (avant PI-1)

| Epic                               | Value Stream | Thème | Statut                                                    |
| ---------------------------------- | ------------ | ----- | --------------------------------------------------------- |
| E-04 Profils Config Match          | VS1          | TS2   | ✅ Done                                                   |
| E-07 Résilience WiFi V2            | VS1          | TS3   | ⚠️ Partiel (F-07.3 reste)                                 |
| E-08 Alertes Prédictives Dashboard | Transverse   | TS4   | ✅ Done                                                   |
| E-09 Architecture Audit            | Transverse   | TS4   | ✅ Done                                                   |
| E-10 Monitoring Fleet              | Transverse   | TS4   | ✅ Done (carte Leaflet trouvée: `sites-map.component.ts`) |

### Epics PI-1 (Backlog Actif)

| Epic                              | Value Stream | Thème | PI   |
| --------------------------------- | ------------ | ----- | ---- |
| E-01 Portail Sponsor Self-Service | VS2          | TS1   | PI-1 |
| E-02 Rotation Sponsors            | VS2          | TS1   | PI-1 |
| E-03 Analytics Sponsors Avancé    | VS2          | TS1   | PI-1 |
| E-06 Onboarding Automatisé        | VS1          | TS3   | PI-1 |

### Epics PI-2

| Epic                                  | Value Stream | Thème   | PI   |
| ------------------------------------- | ------------ | ------- | ---- |
| E-05 Motion Design Personnalisé       | VS2          | TS2     | PI-2 |
| **E-11 Régie Publicitaire Régionale** | VS2          | TS1     | PI-2 |
| **E-15 Score Live Phase 2**           | VS1          | TS2     | PI-2 |
| **E-16 Rapports Email Auto**          | Transverse   | TS4     | PI-2 |
| **E-17 A/B Testing Créas**            | VS2          | TS1     | PI-2 |
| **E-22 Contenus Différenciés TV+LED** | VS1          | TS2     | PI-2 |
| **E-23 Résilience HDMI & Accès Nav**  | VS1 + Trans  | TS4+TS2 | PI-2 |

### Epics PI-3

| Epic                                | Value Stream | Thème | PI   |
| ----------------------------------- | ------------ | ----- | ---- |
| **E-12 Multi-Écrans Synchronisés**  | VS1          | TS2   | PI-3 |
| **E-13 Marque Blanche Club**        | VS1          | TS2   | PI-3 |
| **E-14 Fonds de Solidarité Sport**  | Transverse   | TS3   | PI-3 |
| **E-18 Intégrations Billetterie**   | VS1          | TS2   | PI-3 |
| **E-19 Capteurs Présence Hardware** | VS1          | TS2   | PI-3 |
| **E-20 Analytics Prédictives ML**   | Transverse   | TS4   | PI-3 |
| **E-21 API Partenaires OAuth**      | Transverse   | TS1   | PI-3 |

## Roadmap PI

| PI   | Période        | Epics                                        | Focus                                                           |
| ---- | -------------- | -------------------------------------------- | --------------------------------------------------------------- |
| PI-1 | Fév-Mars 2026  | E-01, E-02, E-03, E-06 + reliquats E-07/E-10 | Fondations : sponsors self-service, analytics, onboarding       |
| PI-2 | Avr-Mai 2026   | E-05, E-11, E-15, E-16, E-17, E-22, E-23     | Régie + motion design + email auto + score live + TV+LED + HDMI |
| PI-3 | Juin-Juil 2026 | E-12 à E-14, E-18 à E-21                     | Multi-écrans, marque blanche, billetterie, ML, OAuth            |

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
**Backlog réel** : 79 SP (après requalification des Done)

### Objectifs PI-1

| #   | Objectif PI                               | VS  | Thème | Business Value                         |
| --- | ----------------------------------------- | --- | ----- | -------------------------------------- |
| 1   | Lancer le portail sponsor self-service    | VS2 | TS1   | Autonomie sponsors, réduction support  |
| 2   | Compléter analytics sponsors avancés      | VS2 | TS1   | Preuve de valeur annonceurs            |
| 3   | Implémenter la rotation sponsor équitable | VS2 | TS1   | Garantie passages, argument commercial |
| 4   | Créer wizard onboarding club              | VS1 | TS3   | Scalabilité déploiement                |

### Répartition par Sprint

| Sprint   | Dates     | Story Points | Focus                                                  |
| -------- | --------- | ------------ | ------------------------------------------------------ |
| Sprint 1 | Sem 8-9   | 26 SP        | Rotation sponsors, analytics API, carte flotte         |
| Sprint 2 | Sem 10-11 | 25 SP        | Portail sponsor, wizard onboarding, WiFi USB           |
| Sprint 3 | Sem 12-13 | 28 SP        | Validation admin, auto-provisioning, heatmap, rapports |

### Velocity Cible

- Sprint 1 : 26 SP (6 US)
- Sprint 2 : 25 SP (7 US)
- Sprint 3 : 28 SP (6 US)
- **Total PI-1 : 79 SP / 19 User Stories**

---

## Suivi Vélocité & Équipe

### Métriques Sprint

Le **Sprint Tracker** (database Notion) capture automatiquement :

- **SP Planifiés vs Complétés** → Vélocité (% de complétion)
- **US Terminées vs Reportées** → Taux de complétion
- **Focus Areas** → Répartition effort par Value Stream

### Indicateurs DVS (Development Value Stream)

| Métrique           | Cible PI-1    | Mesure                                 |
| ------------------ | ------------- | -------------------------------------- |
| Vélocité moyenne   | ~26 SP/sprint | SP Complétés / sprint                  |
| Taux complétion US | > 85%         | US Terminées / (Terminées + Reportées) |
| Cycle Time moyen   | < 3 jours     | PR open → merged                       |
| Lead Time feature  | < 2 semaines  | Epic start → déployé                   |
| Couverture tests   | > 80%         | Jest + Karma coverage                  |
| Taux de carry-over | < 15%         | US Reportées / total US                |

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

## Artefacts PI Planning

| Page                                             | Description                                            |
| ------------------------------------------------ | ------------------------------------------------------ |
| [📋 Lean Business Cases](LEAN-BUSINESS-CASES.md) | LBC pour les 21 Epics (problème, solution, coût, KPIs) |
| [🎯 Features & Critères](FEATURES.md)            | 35 Features avec acceptance criteria et SP             |
| [📝 User Stories Complètes](USER-STORIES.md)     | 218 US (178 Done + 40 futures) avec traçabilité ADR    |
| [🏁 PI Objectives](PI-OBJECTIVES.md)             | Objectifs PI avec scoring Business Value (1-10)        |
| [⚠️ Registre ROAM](ROAM.md)                      | 8 risques identifiés avec matrice probabilité × impact |
| [🔄 Inspect & Adapt](INSPECT-ADAPT.md)           | Template I&A avec quantitative review et retrospective |
| [📈 Flow Metrics](FLOW-METRICS.md)               | 6 Flow Metrics par Value Stream + WIP limits + CFD     |

## Backlog Complet

| Page                                             | Description                                              |
| ------------------------------------------------ | -------------------------------------------------------- |
| [✅ Implemented Backlog](IMPLEMENTED-BACKLOG.md) | 178 features livrées avec traçabilité code (13 domaines) |

## Tooling & Automatisation

### Pipeline SAFe → Excel

Les fichiers `.md` dans `docs/safe/` sont la **source de vérité**. Un pipeline automatique maintient la cohérence :

```
docs/safe/*.md  →  pre-commit hook  →  export-to-excel.py  →  NEOPRO_SAFe_Portfolio.xlsx
                                                                (13 onglets, formules WSJF)
```

| Outil           | Fichier                                    | Rôle                                                                                                                                 |
| --------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Export Excel    | `docs/safe/scripts/export-to-excel.py`     | Génère le `.xlsx` avec 13 onglets (Dashboard, Epics, Features, Sprint Tracker, ROAM, Flow Metrics, User Stories, \_ChartData, etc.)  |
| Recalc helper   | `docs/safe/scripts/recalc.py`              | Force le recalcul des formules Excel                                                                                                 |
| Pre-commit hook | `.husky/pre-commit`                        | Détecte les changements `docs/safe/*.md` et régénère l'Excel automatiquement                                                         |
| Règle Claude    | `.claude/rules/safe-update.md`             | Checklist pour que Claude mette à jour les `.md` SAFe à chaque `feat`/`fix` commit                                                   |
| Dashboard SAFe  | `central-dashboard/src/app/features/safe/` | Dashboard Angular interactif : Portfolio Overview (KPIs, Gantt, Kanban Epics, ROAM), Proposals Kanban (drag & drop), Proposal Detail |
| API SAFe        | `central-server/src/routes/safe.routes.ts` | 5 endpoints REST (`/api/safe/*`) — parse les `.md` en JSON, write-back atomique pour mutations de statut                             |

### Mise à jour automatique des .md SAFe

Quand Claude effectue un commit `feat(scope)` ou `fix(scope)` qui implémente une Feature SAFe, la règle `.claude/rules/safe-update.md` s'active et met à jour :

1. **FEATURES.md** — Statut Feature (`⏳ Backlog` → `✅ Done`), sprint
2. **IMPLEMENTED-BACKLOG.md** — Nouvelle ligne `IMP-XXX-NN` si feature complète
3. **Compteurs** — PORTFOLIO.md et README.md si nécessaire
4. **Dates** — `Dernière mise à jour` sur tous les `.md` modifiés
5. **Excel** — Régénéré automatiquement par le hook pre-commit

> Le mapping `scope → Epic → Feature` est documenté dans `.claude/rules/safe-update.md`.

---

## Références

- [🏆 OKR NEOPRO 2026](https://www.notion.so/2ddc27de363880c9931af8f16684916d)
- [📝 Documentation principale](../00-INDEX.md)
- [💼 Business Plan](../business/BUSINESS_PLAN_COMPLET.md)

---

**Retour** : [Documentation principale](../00-INDEX.md)
