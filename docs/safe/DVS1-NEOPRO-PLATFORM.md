# 🟣 DVS-1 — Neopro Platform Development

> _Le Development Value Stream unique qui alimente les deux OVS._

**Notion** : [DVS-1 Canvas](https://www.notion.so/30bc27de363881b2945ae69ea554816b)

---

## Relation OVS ↔ DVS

```mermaid
flowchart TB
    DVS["\n🟣 DVS-1\nNeopro Platform Development\n1 équipe stream-aligned\n"]

    OVS1["\n🟢 OVS1 : Club to Screen\nTrigger: Club signe\nValeur: Contenu sur TV\n"]
    OVS2["\n🟠 OVS2 : Sponsor to Impression\nTrigger: Sponsor veut visibilité\nValeur: Rapport ROI\n"]

    DVS --> |"Features\nE-04, E-06, E-07\nE-12, E-13"| OVS1
    DVS --> |"Features\nE-01, E-02, E-03\nE-05, E-11"| OVS2
    DVS --> |"Enablers\nE-08, E-09, E-10\nE-14"| TRANS["\n⬜ Transverse\nMonitoring, Architecture\nFonds Solidarité\n"]

    style DVS fill:#e1bee7,stroke:#6a1b9a
    style OVS1 fill:#c8e6c9,stroke:#2e7d32
    style OVS2 fill:#ffe0b2,stroke:#e65100
    style TRANS fill:#f5f5f5,stroke:#616161
```

---

## Development Value Stream Canvas

### 🎯 Proposition de Valeur

> **POUR** les clubs sportifs amateurs et sponsors locaux
> **QUI** veulent professionnaliser leur image et prouver leur ROI
> **LA** Plateforme Neopro
> **EST UNE** solution tout-en-un boîtier + logiciel + support
> **QUI** transforme les écrans de gymnases en outils de valorisation pro
> **CONTRAIREMENT À** PowerPoint, Canva, boucles USB qui ne génèrent aucun revenu
> **NOTRE SOLUTION** offre un pilotage smartphone, des rapports auto, et un réseau publicitaire

### 🛠️ Solutions développées

| Composant             | Stack                            | OVS servi   |
| --------------------- | -------------------------------- | ----------- |
| Frontend Raspberry Pi | Angular 20, Socket.IO, SCSS      | OVS1        |
| Frontend Dashboard    | Angular 20, Chart.js, Leaflet    | OVS1 + OVS2 |
| Backend API           | Node.js 18+, Express, TypeScript | OVS1 + OVS2 |
| Base de données       | PostgreSQL 15 (Supabase)         | OVS1 + OVS2 |
| Stockage média        | FTP Hostinger                    | OVS1 + OVS2 |
| Auth                  | JWT HttpOnly + MFA (TOTP)        | Transverse  |
| Monitoring            | Prometheus + Grafana             | Transverse  |

### 🎫 Solution Context

| Segment            | Contexte d'usage                                     |
| ------------------ | ---------------------------------------------------- |
| Bénévole club      | Smartphone en bord de terrain, WiFi gymnase instable |
| Admin club         | Dashboard web, bureau ou domicile                    |
| Sponsor            | Dashboard web, bureau                                |
| Annonceur régie    | Portail web self-service                             |
| Super admin NEOPRO | Dashboard central, monitoring flotte                 |

### 👥 Équipe & Localisation

```mermaid
flowchart LR
    subgraph NOW["Aujourd'hui"]
        G["Gwenvael\nDG + Full-stack\nNantes"]
        GA["Gabin\nPrésident + Créa\nParis"]
    end

    subgraph PHASE2["Phase 2 (3-5 devs)"]
        D1["Dev Backend\nNantes"]
        D2["Dev Frontend\nRemote"]
        GA2["Gabin\nProduct + Créa"]
        G2["Gwenvael\nTech Lead + Ops"]
    end

    subgraph PHASE3["Phase 3 (8-12 devs)"]
        T1["🟢 Team VS1\nClub to Screen"]
        T2["🟠 Team VS2\nSponsor to Impression"]
        TP["⬜ Platform Team\nInfra, Auth, Monitoring"]
    end

    NOW --> PHASE2 --> PHASE3
```

---

## Segments clients

| Segment                 | Taille marché | Pénétration actuelle      |
| ----------------------- | ------------- | ------------------------- |
| Handball                | ~2 400 clubs  | 2 clubs (NARH, NLF)       |
| Basketball              | ~3 800 clubs  | 0                         |
| Volleyball              | ~1 350 clubs  | 0                         |
| Hockey                  | ~200 clubs    | 2 clubs (RACC, Corsaires) |
| Futsal                  | ~500+ clubs   | 0                         |
| **Total indoor France** | **~7 500+**   | **4 clubs (0.05%)**       |

## Canaux de développement

| Canal     | Usage                             |
| --------- | --------------------------------- |
| GitHub    | Code source, PRs, CI/CD           |
| Railway   | Hébergement API                   |
| Hostinger | Hébergement Dashboard + FTP média |
| Supabase  | PostgreSQL managé                 |
| Notion    | SAFe, backlog, docs               |
| Slack     | Communication équipe              |

## Budget & Économie Unitaire

| Poste                  | Coût               | Notes                    |
| ---------------------- | ------------------ | ------------------------ |
| Hardware / club        | 150€               | Raspberry Pi + boîtier   |
| Hosting / club / an    | 5€                 | Cloud + maintenance      |
| Coût total / club      | 155€               | Année 1                  |
| **Revenu / club / an** | **1 500 - 3 000€** | Selon formule            |
| **Marge brute**        | **~90%**           |                          |
| Break-even             | 4-5 clubs          |                          |
| LTV (3 ans)            | 3 600 - 7 200€     | Selon upsells            |
| CAC                    | ~0€                | Acquisition réseau sport |

## KPIs Développement

| KPI                      | Cible         | Mesure                    |
| ------------------------ | ------------- | ------------------------- |
| Vélocité                 | ~26 SP/sprint | Sprint Tracker            |
| Temps de cycle           | < 3 jours     | PR ouverte → fusionnée    |
| Couverture tests         | > 80%         | Jest (1464) + Karma (554) |
| Uptime production        | > 98.5%       | Prometheus                |
| Déploiement              | < 30 min      | Pipeline CI/CD            |
| Incidents critiques / PI | < 2           | Alerting                  |

## Priorisation Économique (WSJF)

```mermaid
quadrantChart
    title Priorisation WSJF (Valeur Business vs Effort)
    x-axis Effort Faible --> Effort Élevé
    y-axis Valeur Faible --> Valeur Élevée
    quadrant-1 Faire en premier
    quadrant-2 Planifier soigneusement
    quadrant-3 Gains rapides
    quadrant-4 Déprioriser
    E-06 Onboarding: [0.3, 0.85]
    E-03 Analytics: [0.4, 0.9]
    E-01 Portail Sponsor: [0.5, 0.8]
    E-11 Regie: [0.8, 0.95]
    E-08 Alertes: [0.35, 0.5]
    E-12 Multi-Ecrans: [0.5, 0.4]
    E-22 TV+LED Dual: [0.6, 0.65]
    E-13 Marque Blanche: [0.25, 0.35]
    E-14 Fonds Solidarite: [0.45, 0.3]
```

---

**Retour** : [SAFe Neopro](README.md) · [Documentation principale](../00-INDEX.md)
