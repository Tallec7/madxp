# 🟢 OVS1 — Club to Screen

> _Du moment où un club signe jusqu'à ce que le contenu tourne sur l'écran du gymnase._

**Notion** : [OVS1 Canvas](https://www.notion.so/30bc27de363881399568db3d78b4b774)

---

## Flux Opérationnel

```mermaid
flowchart LR
    A["🎯 Club signe\nun contrat"] --> B["📦 Envoi\nboîtier Pi"]
    B --> C["🔧 Installation\n30 min plug & play"]
    C --> D["📱 Config\nsmartphone"]
    D --> E["🎥 Upload\ncontenu"]
    E --> F["📡 Sync\nCloud → Pi"]
    F --> G["📺 Diffusion\nsur écran"]
    G --> H["✅ Valeur :\nContenu pro\nsur la TV"]

    style A fill:#e8f5e9
    style H fill:#c8e6c9
```

---

## Canvas OVS

### 🎯 Trigger

> Un club sportif amateur signe un contrat NEOPRO (Essentiel, Autonomie ou Premium)

### 💰 Valeur délivrée

> Contenu professionnel diffusé en temps réel sur l'écran du gymnase — scores, vidéos joueurs, spots sponsors, animations match day

### ⏱️ Lead Time

| Métrique              | Actuel                 | Cible PI-2               |
| --------------------- | ---------------------- | ------------------------ |
| Onboarding club       | 2-3 jours (SSH manuel) | 30 minutes (wizard auto) |
| Déploiement contenu   | ~1 heure               | < 5 minutes              |
| Premier match diffusé | J+3 après installation | J+0 (même jour)          |

### 🚧 Bottleneck actuel

> **Onboarding SSH manuel** — Chaque nouveau club nécessite une config manuelle par terminal. Non scalable au-delà de 15 clubs.
>
> **Solution en cours** : Epic E-06 Onboarding Automatisé (PI-1)

---

## Étapes détaillées

```mermaid
flowchart TD
    subgraph ACQUISITION["1️⃣ Acquisition"]
        A1["Démo gratuite\n30 jours"]
        A2["Closing\ncycle ~30j"]
        A1 --> A2
    end

    subgraph DEPLOY["2️⃣ Déploiement"]
        B1["Envoi boîtier\nRaspberry Pi"]
        B2["Installation\nplug & play"]
        B3["Config WiFi\n+ pairing"]
        B1 --> B2 --> B3
    end

    subgraph OPERATE["3️⃣ Opérations"]
        C1["📱 Pilotage\nsmartphone"]
        C2["🎥 Upload vidéos\njoueurs, buts"]
        C3["🏆 Match day\nscores temps réel"]
        C1 --> C2
        C1 --> C3
    end

    subgraph VALUE["4️⃣ Valeur"]
        D1["Image pro\ndu club"]
        D2["Engagement\nspectateurs"]
        D3["Valorisation\nsponsors"]
    end

    ACQUISITION --> DEPLOY --> OPERATE --> VALUE
```

---

## Segments clients

| Segment                   | Profil                      | Besoin principal      | Formule type          |
| ------------------------- | --------------------------- | --------------------- | --------------------- |
| Clubs semi-pro            | N1-N3, budget > 5K€ comm    | Image pro + sponsors  | Premium (3 000€/an)   |
| Clubs amateurs structurés | Régional, 3+ sponsors       | Valorisation sponsors | Autonomie (2 100€/an) |
| Petits clubs              | Départemental, 1-2 sponsors | Débuter la diffusion  | Essentiel (1 500€/an) |

## Canaux

- **Bouche-à-oreille** sportif (CAC ~0€)
- **Démos gratuites** 30 jours
- **Ligues et fédérations** (FFHB, FFBB, FFVolley)
- **Tournois** (Cup En Sambre, mai 2026)
- **Prescripteurs** (présidents de ligue, arbitres vidéo)

## Epics alignés

| Epic                           | PI   | Statut  |
| ------------------------------ | ---- | ------- |
| E-04 Profils Config Match      | PI-1 | Backlog |
| E-06 Onboarding Automatisé     | PI-1 | Backlog |
| E-07 Résilience WiFi V2        | PI-1 | Backlog |
| E-12 Multi-Écrans Synchronisés | PI-3 | Backlog |
| E-13 Marque Blanche Club       | PI-3 | Backlog |

## KPIs

| KPI                       | Cible 2026 | Cible 2028 |
| ------------------------- | ---------- | ---------- |
| Clubs équipés             | 15         | 300        |
| Uptime                    | 98.5%      | 99.5%      |
| Temps onboarding          | < 30 min   | < 15 min   |
| Matchs diffusés / semaine | 20         | 500+       |
| NPS clubs                 | > 50       | > 70       |

---

**Retour** : [SAFe Neopro](README.md) · [Documentation principale](../00-INDEX.md)
