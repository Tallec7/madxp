# KPIs Neopro

> ⚠️ **STALE** — Dernière révision : 2026-04-25. Contenu potentiellement périmé. Revue mensuelle recommandée.

> **Audience** : futur PM (jour 1 = sait quels chiffres regarder le mardi matin) + futur CTO (sait quoi instrumenter en priorité) + Daisy (référence partagée pour challenger les décisions produit)
>
> **Statut** : Live | **Dernière revue** : 2026-04-25 | **Source** : interview Daisy 2026-04-25
>
> **Convention de lecture** :
> - 🟢 = mesurable aujourd'hui (data dispo en DB ou Prometheus)
> - 🟡 = mesurable partiellement (calcul à fiabiliser ou métrique à monter)
> - 🔮 = à mesurer plus tard (dépend d'une feature roadmap)

## Comment lire ce doc

Architecture en 3 couches inspirée du framework "North Star Metric" :

```
┌─────────────────────────────────────────────────────────────┐
│  NSM PRINCIPALE (la métrique du mardi matin pour le PM)     │
│  → Une seule métrique, reflète la valeur livrée au client    │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ alimentée par
┌─────────────────────────────────────────────────────────────┐
│  4 INPUT METRICS (leviers d'action sur la NSM)              │
│  → Sur quoi le PM peut pousser pour faire monter la NSM     │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ ne pas casser pendant qu'on optimise
┌─────────────────────────────────────────────────────────────┐
│  GUARDRAIL METRICS (alertes si dégradation)                 │
│  → Métriques de santé qui doivent rester au vert            │
└─────────────────────────────────────────────────────────────┘
```

---

## NSM Principale — Match-hours diffusés par semaine

> **Définition** : somme des durées (heures) de toutes les sessions match qui se sont déroulées sur la flotte Neopro pendant la semaine.

| Champ | Valeur |
|---|---|
| **Statut data** | 🟢 mesurable aujourd'hui |
| **Source** | `club_sessions.duration_seconds` agrégé par `date_trunc('week', started_at)` |
| **Cadence** | Weekly (lundi matin pour la semaine S-1) |
| **Owner principal** | PM (suit la trajectoire) |
| **Cible 2027** | TODO Daisy : estimer match-hours/semaine cible 2027 (input nécessaire pour tracer la trajectoire) |

### Pourquoi cette NSM
- **Reflète la valeur livrée au club** : 1h de match diffusé = 1h où Neopro crée de la valeur visible en tribune
- **Indicateur avancé du revenu** : plus de matches diffusés = clubs engagés = renouvellement sécurisé
- **Mesurable régulièrement** : data déjà en DB
- **Actionnable** : 5+ leviers identifiés (cf. input metrics ci-dessous)
- **Une seule** : agrège proprement Pi + SaaS, indoor + outdoor, sports, niveaux

### Trajectoire NSM
| Phase | NSM principale | Pourquoi évolue |
|---|---|---|
| **Aujourd'hui (2026)** | Match-hours diffusés/semaine (NSM A) | Cœur produit actuel |
| **Mois 6-12 (sponsors monétisés)** | Impressions sponsors validées (NSM B) | Une fois pricing sponsor affiné |
| **2027 cible (roadmap QR/jeu)** | Engagement spectateur (NSM D) | Métrique différenciatrice qui justifie 15-30k€/site |

→ La NSM **n'est pas figée** : elle évolue selon la maturité du produit. C'est un signal au PM que la trajectoire produit est planifiée.

---

## Input metric E — Templates générés par semaine

> **Définition** : nombre de nouveaux templates créés ou modifiés depuis le Template Studio dashboard, par semaine, agrégé par site.

| Champ | Valeur |
|---|---|
| **Statut data** | 🟡 partiellement (events à instrumenter, table `remotion_templates` consultable) |
| **Cadence** | Weekly |
| **Owner** | PM (predictive churn) |

### Pourquoi cette métrique compte tant

C'est un **leading indicator** de la NSM principale :
- Un club qui crée 0 template/semaine → **80% de chance de churner dans 3 mois**
- Un club qui crée >5 templates/semaine → club très engagé, ARR sécurisé

Permet au PM de **prédire un churn 3 mois avant qu'il arrive** → action customer success ou feature d'onboarding ciblée.

### Action levier
- Onboarding template "starter pack" (5 templates pré-faits dès la création du site)
- Notification "vous n'avez pas créé de template depuis 14 jours" → email/Slack
- Templates IA-assistés (générer 1 template à partir d'un brief texte) — roadmap LATER

---

## Input metric C — Sites actifs hebdomadaires (WAS)

> **Définition** : nombre de sites uniques (Pi + SaaS) qui ont eu au moins 1 heartbeat OU 1 connexion dashboard active dans la semaine.

| Champ | Valeur |
|---|---|
| **Statut data** | 🟢 mesurable aujourd'hui |
| **Source** | Heartbeat Pi (table `metrics`) + sessions dashboard (table `audit_logs`) |
| **Cadence** | Weekly |
| **Owner** | PM + Admin Support |

### Pourquoi cette métrique compte

Métrique de **rétention infrastructurelle** : un site qui n'utilise pas Neopro pendant 2 semaines consécutives est probablement perdu, même s'il paye encore son abonnement.

### Action levier
- Détection automatique inactivité 14j → ticket support proactif
- Onboarding refresh trimestriel
- Audit trimestriel des sites en bas de la liste WAS

---

## Input metric B — Impressions sponsors validées par semaine

> **Définition** : nombre d'impressions de pubs sponsors servies aux spectateurs présents en tribune, validées par audience estimée (capacité tribune × % occupation observée).

| Champ | Valeur |
|---|---|
| **Statut data** | 🟡 partiel (impressions mesurables via `video_plays`, audience à enrichir DB) |
| **Source** | `video_plays` filtré par `category='sponsor'` × estimation audience tribune |
| **Cadence** | Weekly |
| **Owner** | PM (futur — reste sous-utilisé tant que le pricing sponsor V1 n'est pas livré) |

### Pourquoi cette métrique compte

C'est la métrique **monétisable** côté annonceurs. Plus d'impressions = pricing power supérieur pour le club ET pour Neopro (si revenue share côté annonceur national/régie).

Cf. `BENCHMARK-COMPETITORS.md` : différenciateur fort Neopro vs Bodet/Stramatel = "Inventaire publicitaire centralisé multi-clubs".

### Action levier
- Sponsor Portal V1 (NEXT #2) — donne au sponsor la visibilité de ses impressions
- Affinement du calcul audience (intégration billetterie partenaire ?)
- Dashboard annonceur national (NEXT préparation) → métrique par campagne

### Dépendance
Pas vraiment exploitable comme NSM secondaire avant que le pricing sponsor soit revisité (typiquement M6+).

---

## Input metric D — Engagement spectateur (roadmap LATER)

> **Définition** : % de spectateurs présents dans la tribune ayant scanné le QR code et participé au jeu/pronostic affiché sur l'écran pendant le match.

| Champ | Valeur |
|---|---|
| **Statut data** | 🔮 pas avant LATER #1 (QR/jeu live) |
| **Source future** | Table à créer (events QR scan + jeu participation) |
| **Cadence cible** | Per-match + agrégé monthly |
| **Owner** | PM (futur — métrique cible 2027) |

### Pourquoi cette métrique deviendra centrale

C'est **LE différenciateur** qui justifiera le pricing premium auprès des sponsors et des clubs Premium :
- Un sponsor qui voit 30% de spectateurs scanner son QR paye 5× plus cher qu'un sponsor classique
- Un club qui montre 40% engagement match attire 3× plus d'annonceurs régionaux

### Trajectoire
| Phase | Engagement cible |
|---|---|
| **MVP QR/jeu (LATER #1, ~M6-9)** | 5-10% spectateurs participent |
| **V2 mature (~M12-18)** | 20-30% spectateurs participent |
| **V3 monétisé (~2027+)** | 30-50% participent + bouclage sponsor (lead generation) |

---

## Guardrail metrics (alertes si dégradation)

Métriques de santé qui doivent rester au vert pendant qu'on optimise les inputs et la NSM.

### G-01 — Uptime fleet (Pi + SaaS)

| Champ | Valeur |
|---|---|
| **Définition** | % de sites en statut `online` sur la fenêtre considérée |
| **Statut data** | 🟢 mesurable (heartbeat Pi + ping SaaS) |
| **Cible** | ≥ 99.5% sur 30 jours glissants |
| **Cadence** | Daily (Grafana) |
| **Alerte si** | < 98% sur 24h consécutives |

### G-02 — Time-to-resolution support (TTR)

| Champ | Valeur |
|---|---|
| **Définition** | Temps médian entre incident signalé et résolu, par sévérité |
| **Statut data** | 🔮 à instrumenter (process support à structurer dans NEXT) |
| **Cible** | < 1h pour P0, < 4h pour P1, < 24h pour P2 |
| **Cadence** | Weekly |
| **Alerte si** | TTR P0 > 2h sur incident NLF |

### G-03 — Error rate (Sentry — wire NEXT)

| Champ | Valeur |
|---|---|
| **Définition** | Nombre d'erreurs JS users-side par semaine, par app (dashboard, raspberry, central-server) |
| **Statut data** | 🔮 à instrumenter (Sentry à wire en NEXT semaine 2-3) |
| **Cible** | < 50 events/semaine sur dashboard, < 10 sur raspberry, < 100 sur central-server |
| **Cadence** | Daily (alerte Slack si pic) |
| **Alerte si** | +50% vs moyenne 4 semaines précédentes |

### G-04 — Churn mensuel

| Champ | Valeur |
|---|---|
| **Définition** | Nombre de sites résiliés ou migrés vers tier inférieur dans le mois écoulé |
| **Statut data** | 🟡 mesurable (`sites.status = 'churned'` à instrumenter) |
| **Cible** | < 5% sites/mois (= < 1 site sur 20) |
| **Cadence** | Monthly (revue 1er du mois) |
| **Alerte si** | 2 churns dans le même mois → revue customer success obligatoire |

### G-05 — Match-hours par site (équité parc)

| Champ | Valeur |
|---|---|
| **Définition** | Distribution des match-hours/semaine entre les sites — détecter les sites "morts" cachés derrière une moyenne haute |
| **Statut data** | 🟢 mesurable (extension de NSM principale) |
| **Cible** | Aucun site avec 0 match-hours sur 4 semaines consécutives |
| **Cadence** | Weekly |
| **Alerte si** | Site avec 0 match-hours sur 2 semaines consécutives → ticket customer success |

---

## Cadence des revues KPIs

| Cadence | Qui regarde | Quoi |
|---|---|---|
| **Daily** | Daisy / futur Admin Support | Guardrails G-01 (uptime) + G-03 (error rate Slack) |
| **Weekly** (lundi matin) | PM + Daisy | NSM A + 4 inputs (E/C/B/D) + G-05 (équité parc) |
| **Monthly** (1er) | PM + Daisy + futur CTO | Revue complète guardrails + NSM mensualisée + G-04 (churn) |
| **Quarterly** (fin trimestre) | Tous + sponsors investisseurs futurs | Trajectoire NSM vs cible 2027 + ajustement priorités roadmap |

→ **Cadence par défaut weekly** appliquée si TODO Daisy non renseigné. Un PM peut recadrer en arrivant.

---

## Setup pratique — où voir ces métriques

| Où | Quoi | Statut |
|---|---|---|
| **Grafana** (`docker compose up grafana`) | Guardrails infra (G-01, G-03, G-05) + NSM A | 🟢 partiel — dashboard "Business" à créer |
| **Dashboard Neopro `/admin/metrics`** (à créer) | NSM + 4 inputs visibles en 1 page pour PM | 🔮 NEXT (mois 2-3) |
| **Email mensuel automatique** | NSM + churn + top sponsors (futur) | 🔮 NEXT (mois 2-3) |
| **`docs/BUSINESS-CHANGELOG.md`** | Récap qualitatif weekly | 🟢 actif depuis semaine 17 |

---

## Synthèse pour interview PM/CTO

### Tableau récap des métriques

| Type | ID | Métrique | Statut | Cadence | Cible |
|---|---|---|---|---|---|
| **NSM** | A | Match-hours diffusés/semaine | 🟢 | Weekly | TODO Daisy 2027 |
| **Input** | E | Templates générés/semaine | 🟡 | Weekly | À calibrer post-PM |
| **Input** | C | Sites actifs hebdomadaires (WAS) | 🟢 | Weekly | 100% sites payants actifs |
| **Input** | B | Impressions sponsors validées/semaine | 🟡 | Weekly | Activable post-Sponsor V1 |
| **Input** | D | Engagement spectateur (QR/jeu) | 🔮 | Per-match | 5-10% (MVP), 30-50% (2027) |
| **Guardrail** | G-01 | Uptime fleet | 🟢 | Daily | ≥ 99.5% / 30j |
| **Guardrail** | G-02 | TTR support par sévérité | 🔮 | Weekly | <1h P0, <4h P1, <24h P2 |
| **Guardrail** | G-03 | Error rate (Sentry) | 🔮 | Daily | < 50 events/sem dashboard |
| **Guardrail** | G-04 | Churn mensuel | 🟡 | Monthly | < 5% sites/mois |
| **Guardrail** | G-05 | Équité parc (match-hours min) | 🟢 | Weekly | 0 site à 0 match >2 sem |

### Pour le pitch en 30 secondes

> *"Notre North Star aujourd'hui c'est le nombre d'heures de match diffusées par semaine sur la flotte. Elle est alimentée par 4 leviers (templates créés, sites actifs, impressions sponsors, engagement spectateur futur). On surveille 5 guardrails infra/business pour ne pas casser pendant qu'on optimise. La cadence par défaut est weekly pour les inputs et la NSM, daily pour les guardrails infra. À M6 la NSM bascule sur les impressions sponsors une fois le pricing affiné, à 2027 sur l'engagement spectateur via QR/jeu."*

### TODO Daisy persistants

- [ ] Choisir cadence finale revue NSM : daily / weekly / monthly (par défaut posée à weekly)
- [ ] Estimer cible 2027 sur match-hours/semaine (aujourd'hui ~10-30, cible ?)
- [ ] Confirmer modèle annonceurs (commission OUI/NON) — impacte si l'input metric B est aussi un revenu direct Neopro
- [ ] Instrumenter events templates (E) si pas déjà fait (à valider avec CTO)
