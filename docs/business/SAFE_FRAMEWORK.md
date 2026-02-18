# SAFe Framework — Pilotage Produit NEOPRO

> **Dernière mise à jour** : 18 Février 2026
> **Framework** : SAFe Essential (simplifié)
> **Cadence PI** : 6 semaines (3 sprints de 2 semaines)
> **Source de vérité** : [Notion — SAFe Neopro](https://www.notion.so/30bc27de363881d49d06e50eabbdd6b5)

---

## Pourquoi SAFe ?

NEOPRO est passé d'un backlog plat (BACKLOG.md) à un framework SAFe structuré pour :

- Aligner le développement produit sur la stratégie business (OKR 2026)
- Structurer les flux de valeur (Value Streams) entre clubs et sponsors
- Prioriser avec WSJF plutôt qu'au feeling
- Préparer le scaling de l'équipe (1 → 3-5 → 10+ devs)

---

## Architecture SAFe

```
Vision Stratégique (OKR 2026)
  ├── Value Streams (2 OVS + 1 DVS)
  │    ├── VS1: Club to Screen (OVS)
  │    ├── VS2: Sponsor to Impression (OVS)
  │    └── DVS-1: Neopro Platform Development
  ├── Thèmes Stratégiques (transverses)
  │    ├── TS1: Monétisation (O2+O4)
  │    ├── TS2: Expérience Match (O3+O5)
  │    ├── TS3: Acquisition & Déploiement (O1+O5)
  │    └── TS4: Excellence Opérationnelle (O3+O4)
  └── Epics (14) → Features (23) → User Stories (41)
```

## Value Streams

| VS    | Nom                         | Type | Trigger                 | Valeur délivrée               |
| ----- | --------------------------- | ---- | ----------------------- | ----------------------------- |
| VS1   | Club to Screen              | OVS  | Club signe              | Contenu pro sur TV du gymnase |
| VS2   | Sponsor to Impression       | OVS  | Sponsor veut visibilité | Rapport d'impressions ROI     |
| DVS-1 | Neopro Platform Development | DVS  | Demande OVS             | Features logicielles          |

## Roadmap PI (2026)

| PI   | Période        | Epics            | Focus                                                              |
| ---- | -------------- | ---------------- | ------------------------------------------------------------------ |
| PI-1 | Fév-Mars 2026  | E-01 à E-10      | Fondations : sponsors self-service, analytics, onboarding, alertes |
| PI-2 | Avr-Mai 2026   | E-05, E-11       | Régie publicitaire régionale + motion design                       |
| PI-3 | Juin-Juil 2026 | E-12, E-13, E-14 | Multi-écrans, marque blanche, fonds solidarité                     |

## Epics (14)

| Code | Nom                           | VS         | PI   | WSJF |
| ---- | ----------------------------- | ---------- | ---- | ---- |
| E-01 | Portail Sponsor Self-Service  | VS2        | PI-1 | 13   |
| E-02 | Rotation Sponsors             | VS2        | PI-1 | 10   |
| E-03 | Analytics Sponsors Avancé     | VS2        | PI-1 | 20   |
| E-04 | Profils Config Match          | VS1        | PI-1 | 8    |
| E-05 | Motion Design Personnalisé    | VS2        | PI-2 | 7    |
| E-06 | Onboarding Automatisé         | VS1        | PI-1 | 20   |
| E-07 | Résilience WiFi V2            | VS1        | PI-1 | 12   |
| E-08 | Alertes Prédictives Dashboard | Transverse | PI-1 | 10   |
| E-09 | Architecture Audit            | Transverse | PI-1 | 6    |
| E-10 | Monitoring Fleet              | Transverse | PI-1 | 8    |
| E-11 | Régie Publicitaire Régionale  | VS2        | PI-2 | 18   |
| E-12 | Multi-Écrans Synchronisés     | VS1        | PI-3 | 8    |
| E-13 | Marque Blanche Club           | VS1        | PI-3 | 6    |
| E-14 | Fonds de Solidarité Sport     | Transverse | PI-3 | 5    |

## Métriques suivies

### Sprint Tracker

- Vélocité (SP planifiés vs complétés)
- Taux de complétion US
- Carry-over rate

### KPIs par Epic

Chaque Epic a des **Leading Indicators** (prédictifs) et **Lagging Indicators** (résultats) alignés sur les OKR.

### DVS Metrics

| Métrique          | Cible        |
| ----------------- | ------------ |
| Vélocité moyenne  | 27 SP/sprint |
| Cycle Time        | < 3 jours    |
| Couverture tests  | > 80%        |
| Uptime production | > 98.5%      |

---

## Databases Notion

| Database         | Contenu                                         |
| ---------------- | ----------------------------------------------- |
| Value Streams    | 2 OVS + 1 DVS avec lead times, bottlenecks      |
| Epics            | 14 Epics avec Lean Business Cases, KPI, WSJF    |
| Features         | 23 Features avec acceptance criteria            |
| User Stories     | 41 US avec critères d'acceptation, story points |
| Sprint Tracker   | Vélocité par sprint, formules automatiques      |
| Business Pillars | 4 Thèmes Stratégiques alignés OKR               |

## Pages visuelles Notion

| Page           | Contenu                                             |
| -------------- | --------------------------------------------------- |
| Portfolio SAFe | Architecture Mermaid, Gantt roadmap, graphiques ARR |
| OVS1 Canvas    | Flux Club → Screen, étapes, segments, KPIs          |
| OVS2 Canvas    | Flux Sponsor → Impression, modèles revenus          |
| DVS-1 Canvas   | Value Proposition, stack, budget, WSJF chart        |

---

## Migration depuis BACKLOG.md

L'ancien `BACKLOG.md` (sprint tracking décembre 2025) est désormais archivé.
Le pilotage produit se fait exclusivement dans **Notion SAFe** :

- Les **Features terminées** de BACKLOG.md sont dans le code (changelogs)
- Les **Features en développement** sont des Epics/Features dans Notion
- Le **sprint tracking** est dans le Sprint Tracker Notion

---

## Liens

- **Source de vérité** : [Notion — SAFe Neopro](https://www.notion.so/30bc27de363881d49d06e50eabbdd6b5)
- **OKR 2026** : [Notion — OKR](https://www.notion.so/2ddc27de363880c9931af8f16684916d)
- **Changelog code** : `docs/changelog/CHANGELOG.md`

**Retour** : [Documentation principale](../00-INDEX.md)
