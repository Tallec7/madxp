# 📊 Portfolio SAFe — Vue d'ensemble

> _Vision complète du portefeuille produit, de la stratégie aux User Stories._

**Notion** : [Portfolio SAFe](https://www.notion.so/30bc27de363881538a17cf41f3c402f3)

---

## Architecture SAFe NEOPRO

```mermaid
flowchart TB
    VISION["\n🎯 VISION\nProfessionnaliser le sport amateur\npour pérenniser son modèle économique\n"]

    VISION --> OKR["\n🏆 OKR 2026\n5 Objectifs • 17 Key Results\n"]

    OKR --> TS1["🟥 TS1\nMonétisation"]
    OKR --> TS2["🟦 TS2\nExpérience Match"]
    OKR --> TS3["🟩 TS3\nAcquisition"]
    OKR --> TS4["🟪 TS4\nExcellence Ops"]

    TS1 --> VS2["🟠 VS2\nSponsor to Impression"]
    TS2 --> VS1["🟢 VS1\nClub to Screen"]
    TS2 --> VS2
    TS3 --> VS1
    TS4 --> TRANS["⬜ Transverse"]

    VS1 --> DVS["🟣 DVS-1\nNeopro Platform"]
    VS2 --> DVS
    TRANS --> DVS

    DVS --> PI1["📦 PI-1\n4 Epics + 2 reliquats • 79 SP"]
    DVS --> PI2["📦 PI-2\n5 Epics • 69 SP"]
    DVS --> PI3["📦 PI-3\n7 Epics • 73 SP"]

    style VISION fill:#1a237e,color:#fff
    style OKR fill:#283593,color:#fff
    style TS1 fill:#ffcdd2
    style TS2 fill:#bbdefb
    style TS3 fill:#c8e6c9
    style TS4 fill:#e1bee7
    style VS1 fill:#c8e6c9,stroke:#2e7d32
    style VS2 fill:#ffe0b2,stroke:#e65100
    style TRANS fill:#f5f5f5,stroke:#616161
    style DVS fill:#e1bee7,stroke:#6a1b9a
    style PI1 fill:#e3f2fd
    style PI2 fill:#e8f5e9
    style PI3 fill:#fff3e0
```

---

## Roadmap Produit 2026

```mermaid
gantt
    title Roadmap NEOPRO 2026
    dateFormat YYYY-MM-DD
    axisFormat %b %Y

    section PI-1 Fondations
    E-01 Portail Sponsor Self-Service   :e01, 2026-02-16, 42d
    E-02 Rotation Sponsors              :e02, 2026-02-16, 42d
    E-03 Analytics Sponsors Avancé      :e03, 2026-02-16, 42d
    E-04 Profils Config Match           :e04, 2026-02-16, 42d
    E-06 Onboarding Automatisé          :e06, 2026-02-16, 42d
    E-07 Résilience WiFi V2             :e07, 2026-02-16, 42d
    E-08 Alertes Prédictives            :e08, 2026-02-16, 42d
    E-09 Architecture Audit             :e09, 2026-02-16, 42d
    E-10 Monitoring Fleet               :e10, 2026-02-16, 42d

    section PI-2 Régie & Score
    E-05 Motion Design Personnalisé     :e05, 2026-04-01, 42d
    E-11 Régie Publicitaire Régionale  :crit, e11, 2026-04-01, 42d
    E-15 Score Live Phase 2             :e15, 2026-04-01, 42d
    E-16 Rapports Email Auto            :e16, 2026-04-01, 42d
    E-17 A/B Testing Créas              :e17, 2026-04-01, 42d
    E-22 Contenus Différenciés TV+LED  :e22, 2026-04-01, 42d

    section PI-3 Upsells & Écosystème
    E-12 Multi-Écrans Synchronisés      :e12, 2026-06-01, 42d
    E-13 Marque Blanche Club            :e13, 2026-06-01, 42d
    E-14 Fonds de Solidarité            :e14, 2026-06-01, 42d
    E-18 Intégrations Billetterie       :e18, 2026-06-01, 42d
    E-19 Capteurs Présence              :e19, 2026-06-01, 42d
    E-20 Analytics ML                   :e20, 2026-06-01, 42d
    E-21 API Partenaires OAuth          :e21, 2026-06-01, 42d

    section Milestones
    5 clubs payants                     :milestone, m1, 2026-03-31, 0d
    Lancement Régie (15 clubs)          :milestone, m2, 2026-05-15, 0d
    20 clubs                            :milestone, m3, 2026-07-15, 0d
```

---

## Métriques Clés

### Trajectoire Business

```mermaid
xychart-beta
    title "Trajectoire ARR NEOPRO"
    x-axis ["Q1 26", "Q2 26", "Q3 26", "Q4 26", "Q1 27", "Q2 27", "Q3 27", "Q4 27", "Q1 28"]
    y-axis "ARR (K€)" 0 --> 400
    bar [6, 14, 24, 24, 60, 120, 200, 350, 400]
```

### Croissance Clubs

```mermaid
xychart-beta
    title "Nombre de clubs équipés"
    x-axis ["Q1 26", "Q2 26", "Q3 26", "Q4 26", "Q1 27", "Q2 27", "Q3 27", "Q4 27"]
    y-axis "Clubs" 0 --> 120
    line [5, 10, 15, 20, 35, 55, 80, 100]
```

---

## Tableau de Bord Portfolio

### Par Value Stream

| Value Stream                 | Epics  | Features | US (planifiées) | SP estimés |
| ---------------------------- | ------ | -------- | --------------- | ---------- |
| 🟢 VS1 Club to Screen        | 9      | 16       | 22              | ~113 SP    |
| 🟠 VS2 Sponsor to Impression | 6      | 13       | 21              | ~103 SP    |
| ⬜ Transverse                | 7      | 10       | 6               | ~44 SP     |
| **Total**                    | **22** | **39**   | **49**          | **260 SP** |

> **Note** : Ce tableau concerne les 40 US futures (PI-1 à PI-3). 178 US supplémentaires ont été livrées avant le PI Planning (voir [IMPLEMENTED-BACKLOG.md](IMPLEMENTED-BACKLOG.md)).

### Par PI

| PI   | Période        | Epics | SP  | Focus                                                   | Milestone                     |
| ---- | -------------- | ----- | --- | ------------------------------------------------------- | ----------------------------- |
| Done | Avant PI-1     | 5     | ~41 | Profils, WiFi, Alertes, Audit, Monitoring               | -                             |
| PI-1 | Fév-Mars 2026  | 4+2   | 79  | Sponsors self-service, analytics, onboarding            | 5 clubs payants               |
| PI-2 | Avr-Mai 2026   | 6     | 108 | Régie publicitaire, score live, email auto, A/B, TV+LED | Lancement régie à 15 clubs    |
| PI-3 | Juin-Juil 2026 | 7     | 73  | Multi-écrans, marque blanche, billetterie, ML, OAuth    | 20 clubs, premiers annonceurs |

### Par Thème Stratégique

| Thème                   | Epics                                    | OKR     | Impact principal        |
| ----------------------- | ---------------------------------------- | ------- | ----------------------- |
| 🟥 TS1 Monétisation     | E-01, E-02, E-03, E-05, E-11, E-17, E-21 | O2 + O4 | ARR + revenus régie     |
| 🟦 TS2 Expérience Match | E-04, E-12, E-13, E-15, E-18, E-19, E-22 | O3 + O5 | Engagement + image pro  |
| 🟩 TS3 Acquisition      | E-06, E-07, E-14                         | O1 + O5 | Scalabilité déploiement |
| 🟪 TS4 Excellence Ops   | E-08, E-09, E-10, E-16, E-20             | O3 + O4 | Fiabilité + monitoring  |

---

## Navigation

| Page                                                                         | Description                          |
| ---------------------------------------------------------------------------- | ------------------------------------ |
| [🟢 OVS1 — Club to Screen](OVS1-CLUB-TO-SCREEN.md)                           | Canvas du flux club → écran          |
| [🟠 OVS2 — Sponsor to Impression](OVS2-SPONSOR-TO-IMPRESSION.md)             | Canvas du flux sponsor → rapport ROI |
| [🟣 DVS-1 — Neopro Platform](DVS1-NEOPRO-PLATFORM.md)                        | Canvas de développement complet      |
| [🏆 OKR NEOPRO 2026](https://www.notion.so/2ddc27de363880c9931af8f16684916d) | 5 Objectifs, 17 Key Results          |
| [SAFe Neopro — Hub](README.md)                                               | Hub principal avec databases         |

---

**Retour** : [SAFe Neopro](README.md) · [Documentation principale](../00-INDEX.md)
