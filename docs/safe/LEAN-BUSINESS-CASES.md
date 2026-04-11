# Lean Business Cases — Epics NEOPRO

> **Dernière mise à jour** : 11 Avril 2026 (E-15 pivot API fédérale → table de marque, E-21 extension F-21.2 public scores API — PROP-003)
> **PI actuel** : PI-1 (Février - Mars 2026)
> Chaque Epic dispose d'un Lean Business Case conforme SAFe : problème, solution, hypothèses, coût, bénéfice, KPIs, et critère Go/No-Go.

---

## PI-1 Epics

---

### E-01 — Portail Sponsor Self-Service

| Champ                 | Détail                      |
| --------------------- | --------------------------- |
| **Value Stream**      | VS2 — Sponsor to Impression |
| **Thème Stratégique** | TS1 — Monétisation          |
| **WSJF**              | 13                          |

**Problème** : L'onboarding d'un nouveau sponsor est entièrement manuel (email, transfert fichier, config manuelle). Lead time de 1 à 2 semaines. Ne scale pas au-delà de 10 sponsors. Aucune autonomie pour l'annonceur.

**Solution** : Portail web self-service où le sponsor peut créer un compte, uploader ses vidéos, sélectionner ses gymnases cibles, et suivre ses diffusions. Validation admin avant diffusion.

**Hypothèses**

- Les sponsors locaux sont capables d'uploader une vidéo de 15-30s au bon format
- Le taux de conversion démo → inscription augmente de 20% avec un portail autonome
- Le support NEOPRO réduit de 60% le temps consacré aux sponsors

**Coût estimé** : 15 SP (≈ 2 semaines dev)

**Bénéfice attendu**

- Lead time onboarding sponsor : 1-2 sem → < 1 jour
- Réduction support : -60% temps dédié sponsors
- Enabler pour E-11 (Régie Publicitaire)

**Indicateurs avancés** : Nombre d'inscriptions self-service, taux de complétion du formulaire
**Indicateurs retardés** : Lead time onboarding sponsor, taux de churn sponsor

**MVP** : Page inscription + upload vidéo + sélection gymnase + validation admin
**Go/No-Go** : Go si ≥ 3 sponsors intéressés identifiés avant fin Sprint 1

---

### E-02 — Rotation Sponsors

| Champ                 | Détail                      |
| --------------------- | --------------------------- |
| **Value Stream**      | VS2 — Sponsor to Impression |
| **Thème Stratégique** | TS1 — Monétisation          |
| **WSJF**              | 10                          |

**Problème** : Les spots sponsors sont diffusés manuellement ou en boucle fixe. Aucune équité de rotation entre sponsors, aucune garantie de passage. Les sponsors n'ont pas de preuve de diffusion.

**Solution** : Algorithme de rotation automatique garantissant un nombre minimum de passages par match pour chaque sponsor actif, avec pondération selon la formule (Essentiel/Autonomie/Premium).

**Hypothèses**

- Un match moyen dure 1h30 avec ~90 créneaux de diffusion spot (1 toutes les minutes)
- Chaque sponsor a besoin d'au moins 20 passages/match pour que ce soit perçu comme "visible"
- La rotation équitable augmente le taux de renouvellement sponsor de 15%

**Coût estimé** : 8 SP (≈ 1 semaine dev)

**Bénéfice attendu**

- Garantie contractuelle de passages → argument commercial
- Taux de renouvellement sponsor : 40% → 60%
- Enabler pour E-03 (Analytics) et E-11 (Régie)

**Indicateurs avancés** : Nombre moyen de passages/match/sponsor
**Indicateurs retardés** : Taux de renouvellement sponsor, NPS sponsor

**MVP** : Algorithme round-robin avec minimum garanti + compteur de passages
**Go/No-Go** : Go (dépendance bloquante pour E-03)

---

### E-03 — Analytics Sponsors Avancé ⚠️ PARTIEL

| Champ                 | Détail                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------- |
| **Value Stream**      | VS2 — Sponsor to Impression                                                                 |
| **Thème Stratégique** | TS1 — Monétisation                                                                          |
| **WSJF**              | 20 (priorité maximale)                                                                      |
| **Statut**            | ✅ Done — F-03.1 + F-03.2 Done (18 SP). F-03.3 Heatmap supprimée (non pertinente <10 clubs) |

**Problème** : Aucun rapport de diffusion pour les sponsors. Impossible de prouver le ROI. Les sponsors renouvellent au "feeling", sans data. Frein majeur à l'acquisition de nouveaux sponsors et à la régie publicitaire.

**Solution** : Dashboard analytics sponsor avec compteur d'impressions temps réel, tendances temporelles, et export rapport PDF/CSV mensuel automatisé.

**Hypothèses**

- Un rapport mensuel avec preuves d'impressions augmente le renouvellement de 25%
- Les sponsors régionaux exigent des rapports avant de signer (condition sine qua non pour la régie)
- Le coût d'un rapport manuel est ~2h/sponsor/mois → non scalable

**Coût estimé** : 13 SP (≈ 1.5 semaines dev)

**Bénéfice attendu**

- Taux de renouvellement sponsor : 60% → 85%
- Argument commercial N°1 pour la régie régionale (E-11)
- Réduction du support reporting : -100% (automatisé)

**Indicateurs avancés** : Taux de consultation du dashboard sponsor, nombre de rapports générés
**Indicateurs retardés** : Taux de renouvellement sponsor, ARR régie

**MVP** : Dashboard impressions + export PDF mensuel
**Go/No-Go** : Go (WSJF max, critique pour VS2) — **✅ Done** (F-03.1 Dashboard + F-03.2 Export livrés. F-03.3 Heatmap supprimée le 09/03/2026)

---

### E-04 — Profils Config Match

| Champ                 | Détail                 |
| --------------------- | ---------------------- |
| **Value Stream**      | VS1 — Club to Screen   |
| **Thème Stratégique** | TS2 — Expérience Match |
| **WSJF**              | 8                      |

**Problème** : La configuration de l'écran est la même avant, pendant et après le match. Pas de différenciation d'ambiance. L'opérateur doit changer manuellement les paramètres à chaque phase.

**Solution** : Système de profils prédéfinis (Avant-Match, Match, Mi-Temps, Après-Match) avec transitions automatiques ou manuelles. Chaque profil configure : playlist, overlay, luminosité, volume.

**Hypothèses**

- Les clubs valorisent une expérience différenciée par phase de match (+NPS)
- La transition automatique réduit la charge opérateur de 80%
- Feature différenciante vs concurrence (aucune solution amateur ne propose ça)

**Coût estimé** : 10 SP (≈ 1.5 semaines dev)

**Bénéfice attendu**

- NPS club : +10 points (expérience pro)
- Charge opérateur réduite de 80% par match
- Argument premium pour la formule à 3 000€/an

**Indicateurs avancés** : Nombre de profils créés par club, taux d'utilisation des transitions auto
**Indicateurs retardés** : NPS club, taux d'upgrade vers Premium

**MVP** : 3 profils (Avant-Match, Match, Après-Match) + switch manuel
**Go/No-Go** : Go si ≥ 2 clubs demandent la feature

---

### E-06 — Onboarding Automatisé

| Champ                 | Détail                          |
| --------------------- | ------------------------------- |
| **Value Stream**      | VS1 — Club to Screen            |
| **Thème Stratégique** | TS3 — Acquisition & Déploiement |
| **WSJF**              | 20 (priorité maximale)          |

**Problème** : Chaque nouveau club nécessite une configuration SSH manuelle du Raspberry Pi (2-3 jours). C'est le bottleneck N°1 de VS1. Ne scale pas au-delà de 15 clubs sans recrutement.

**Solution** : Wizard d'onboarding automatisé : le club branche le Pi, scanne un QR code, le Pi se connecte au cloud, télécharge sa config, et est opérationnel en < 30 minutes. Zero-touch provisioning.

**Hypothèses**

- 90% des installations peuvent être automatisées (WiFi standard, pas de proxy entreprise)
- Le temps d'onboarding cible de 30 min est réaliste (bootstrap + sync initiale)
- Chaque jour gagné par onboarding = 1 club supplémentaire déployable par semaine

**Coût estimé** : 13 SP (≈ 1.5 semaines dev)

**Bénéfice attendu**

- Lead time onboarding : 2-3 jours → 30 minutes
- Capacité de déploiement : 1 club/semaine → 5 clubs/semaine
- Suppression du bottleneck N°1 de VS1

**Indicateurs avancés** : Taux de succès wizard (% de Pi auto-provisionnés), temps moyen onboarding
**Indicateurs retardés** : Nombre de clubs déployés/mois, coût marginal par club

**MVP** : QR code → auto-registration → download config → ready
**Go/No-Go** : Go (bottleneck critique, WSJF max)

---

### E-07 — Résilience WiFi V2

| Champ                 | Détail                          |
| --------------------- | ------------------------------- |
| **Value Stream**      | VS1 — Club to Screen            |
| **Thème Stratégique** | TS3 — Acquisition & Déploiement |
| **WSJF**              | 12                              |

**Problème** : Les gymnases ont un WiFi instable (murs épais, beaucoup de monde le soir de match). Les déconnexions perturbent la diffusion et génèrent des alertes fausses-positives. Source N°1 de tickets support.

**Solution** : Mode résilience WiFi avancé : cache local étendu (48h de contenu), reconnexion agressive (backoff exponentiel), monitoring signal WiFi, support clé USB WiFi externe, fallback 4G optionnel.

**Hypothèses**

- 70% des incidents support actuels sont liés au WiFi
- Un cache de 48h couvre 99% des cas d'utilisation (un match par semaine max)
- La clé USB WiFi externe résout les cas de signal faible

**Coût estimé** : 10 SP (≈ 1.5 semaines dev)

**Bénéfice attendu**

- Tickets support WiFi : -70%
- Uptime perçu : 95% → 99%
- Réduction du churn lié aux problèmes techniques

**Indicateurs avancés** : Taux de reconnexion automatique, durée moyenne de déconnexion
**Indicateurs retardés** : Tickets support/mois, uptime moyen flotte, churn technique

**MVP** : Cache 48h + reconnexion agressive + monitoring signal
**Go/No-Go** : Go (dépendance E-06 pour le déploiement massif)

---

### E-08 — Alertes Prédictives Dashboard

| Champ                 | Détail                          |
| --------------------- | ------------------------------- |
| **Value Stream**      | Transverse                      |
| **Thème Stratégique** | TS4 — Excellence Opérationnelle |
| **WSJF**              | 10                              |

**Problème** : Les alertes actuelles sont réactives (le Pi est déjà tombé). Aucune anticipation des pannes. Le super admin découvre les problèmes en même temps que le club.

**Solution** : Alertes prédictives basées sur les tendances : dégradation du signal WiFi, espace disque diminuant, température CPU anormale, latence de sync croissante. Notification avant la panne.

**Hypothèses**

- 60% des pannes sont précédées de signaux détectables (WiFi dégradé, CPU chaud)
- Une alerte 24h avant la panne permet d'intervenir à distance dans 80% des cas
- Réduction des interventions physiques de 50%

**Coût estimé** : 8 SP (≈ 1 semaine dev)

**Bénéfice attendu**

- Incidents critiques évités : 60% des pannes anticipées
- Temps de résolution moyen : 24h → 2h (intervention préventive)
- NPS club : +5 points (fiabilité perçue)

**Indicateurs avancés** : Taux de détection préventive, nombre d'alertes prédictives déclenchées
**Indicateurs retardés** : MTTR (Mean Time To Repair), incidents critiques/PI

**MVP** : 3 règles prédictives (WiFi, disque, température) + notification dashboard
**Go/No-Go** : Go (améliore la fiabilité perçue pour tous les clubs)

---

### E-09 — Architecture Audit

| Champ                 | Détail                          |
| --------------------- | ------------------------------- |
| **Value Stream**      | Transverse                      |
| **Thème Stratégique** | TS4 — Excellence Opérationnelle |
| **WSJF**              | 6                               |

**Problème** : Certains controllers accèdent directement à la base de données (bypass du repository pattern). Dette technique accumulée qui freine le développement de nouvelles features et rend le code difficile à tester.

**Solution** : Audit systématique des controllers, migration vers le repository pattern, ajout de règles ESLint bloquantes, et amélioration de la couverture de tests.

**Hypothèses**

- ~15 controllers doivent être migrés
- Chaque migration prend 2-4h (refactor + tests)
- La productivité dev augmente de 20% après l'audit (moins de bugs, code plus lisible)

**Coût estimé** : 8 SP (≈ 1 semaine dev)

**Bénéfice attendu**

- 100% des controllers sur repository pattern
- Couverture tests : 80% → 85%
- Temps de développement par feature : -20%

**Indicateurs avancés** : Nombre de controllers migrés, warnings ESLint restants
**Indicateurs retardés** : Couverture tests, temps moyen de développement d'une US

**MVP** : Migration des 5 controllers les plus critiques + règle ESLint bloquante
**Go/No-Go** : Go (enabler technique, faible risque)

---

### E-10 — Monitoring Fleet

| Champ                 | Détail                          |
| --------------------- | ------------------------------- |
| **Value Stream**      | Transverse                      |
| **Thème Stratégique** | TS4 — Excellence Opérationnelle |
| **WSJF**              | 8                               |

**Problème** : Le monitoring actuel est basique (heartbeat + uptime). Pas de vue agrégée de la flotte, pas de tendances, pas de comparaison entre sites. Impossible de piloter 50+ Pi sans vue globale.

**Solution** : Dashboard de monitoring flotte avec carte Leaflet (localisation des Pi), statuts temps réel, métriques agrégées (CPU, RAM, disque, signal WiFi), et tendances sur 30 jours.

**Hypothèses**

- Au-delà de 15 clubs, un monitoring individuel n'est plus gérable
- La vue cartographique permet d'identifier les clusters de problèmes (zone géographique)
- Le monitoring proactif réduit le churn technique de 30%

**Coût estimé** : 10 SP (≈ 1.5 semaines dev)

**Bénéfice attendu**

- Temps de diagnostic : 30 min → 5 min (vue globale)
- Identification de patterns géographiques (FAI, gymnases problématiques)
- Scalabilité ops : 15 clubs → 50+ clubs sans recrutement ops

**Indicateurs avancés** : Taux d'adoption du dashboard monitoring, fréquence de consultation
**Indicateurs retardés** : MTTR, churn technique, nombre d'interventions physiques/mois

**MVP** : Carte Leaflet + statuts Pi + métriques CPU/RAM/disque
**Go/No-Go** : Go (indispensable pour le scaling PI-2/PI-3)

---

## PI-2 Epics

---

### E-05 — Motion Design Personnalisé

| Champ                 | Détail                      |
| --------------------- | --------------------------- |
| **Value Stream**      | VS2 — Sponsor to Impression |
| **Thème Stratégique** | TS2 — Expérience Match      |
| **WSJF**              | 7                           |

**Problème** : Les animations d'écran sont statiques et identiques pour tous les clubs. Pas de personnalisation visuelle. Les clubs premium attendent une identité visuelle sur mesure.

**Solution** : Bibliothèque de templates motion design personnalisables (couleurs club, logo, typographie) avec aperçu temps réel. Possibilité d'uploader des animations custom (Lottie/MP4).

**Hypothèses**

- 40% des clubs Premium paieraient un supplément pour des animations personnalisées
- Le motion design augmente le "wow factor" perçu par les sponsors (+15% renouvellement)
- Gabin (co-fondateur, créa) peut produire 5 templates/mois

**Coût estimé** : 13 SP (≈ 1.5 semaines dev)

**Bénéfice attendu**

- Upsell motion design : +500€/an pour les clubs Premium
- Différenciation vs concurrence
- Argument commercial pour la régie (E-11)

**Indicateurs avancés** : Nombre de templates créés, taux d'adoption par les clubs Premium
**Indicateurs retardés** : Revenu upsell motion design, NPS club Premium

**MVP** : 3 templates personnalisables (couleurs + logo) + preview temps réel
**Go/No-Go** : Go si ≥ 5 clubs actifs en fin de PI-1

---

### E-11 — Régie Publicitaire Régionale

| Champ                 | Détail                      |
| --------------------- | --------------------------- |
| **Value Stream**      | VS2 — Sponsor to Impression |
| **Thème Stratégique** | TS1 — Monétisation          |
| **WSJF**              | 18                          |

**Problème** : Aujourd'hui, seuls les sponsors locaux (liés à un club) peuvent diffuser. Aucun moyen pour un annonceur régional (chaîne de magasins, banque) de toucher plusieurs gymnases. Pas de revenus passifs pour NEOPRO.

**Solution** : Marketplace publicitaire où des annonceurs régionaux achètent des "packs gymnases" (5, 10, 50 gymnases) avec ciblage géographique, scheduling automatique et reporting consolidé. Revenue split : 90% NEOPRO, 10% club.

**Hypothèses**

- Le prix de 300€/mois pour 5 gymnases est acceptable pour un annonceur régional
- Il faut ≥ 15 clubs actifs pour que la régie soit attractive
- 3-6 annonceurs régionaux atteignables en 6 mois post-lancement
- Le revenue split de 10% motive les clubs à rejoindre le réseau

**Coût estimé** : 20 SP (≈ 2.5 semaines dev)

**Bénéfice attendu**

- Nouveau flux de revenus récurrents (ARR régie)
- Revenus passifs pour les clubs (fidélisation)
- ARR cible régie 2027 : 350K€

**Indicateurs avancés** : Nombre d'annonceurs inscrits, taux de remplissage des créneaux
**Indicateurs retardés** : ARR régie, revenue partagé aux clubs, CPM moyen

**MVP** : Portail annonceur + sélection pack gymnases + Stripe + reporting mensuel
**Go/No-Go** : Go si ≥ 15 clubs actifs et E-01/E-02/E-03 terminés

---

## PI-3 Epics

---

### E-12 — Multi-Écrans Synchronisés

| Champ                 | Détail                 |
| --------------------- | ---------------------- |
| **Value Stream**      | VS1 — Club to Screen   |
| **Thème Stratégique** | TS2 — Expérience Match |
| **WSJF**              | 8                      |

**Problème** : Chaque club n'a qu'un seul écran. Certains gymnases multi-salles ou clubs semi-pro veulent 2-4 écrans synchronisés (entrée, buvette, tribune, terrain).

**Solution** : Support multi-Pi par site avec synchronisation des playlists et des overlays. Un Pi "master" orchestre les Pi "slaves" via WebSocket local.

**Hypothèses**

- 15% des clubs cibles ont besoin de 2+ écrans
- L'upsell multi-écran justifie un supplément de 50€/mois par écran supplémentaire
- La synchronisation WebSocket local est fiable en réseau local (< 100ms de latence)

**Coût estimé** : 15 SP (≈ 2 semaines dev)

**Bénéfice attendu**

- Upsell : +600€/an par écran supplémentaire
- Pénétration des clubs semi-pro (segment Premium)
- Différenciation massive vs concurrence

**Indicateurs avancés** : Nombre de clubs multi-écrans, latence de synchronisation
**Indicateurs retardés** : ARR upsell multi-écrans, NPS clubs semi-pro

**MVP** : 2 écrans synchronisés (master/slave) + playlist unifiée
**Go/No-Go** : Go si ≥ 3 clubs demandent multi-écrans

---

### E-13 — Marque Blanche Club

| Champ                 | Détail                 |
| --------------------- | ---------------------- |
| **Value Stream**      | VS1 — Club to Screen   |
| **Thème Stratégique** | TS2 — Expérience Match |
| **WSJF**              | 6                      |

**Problème** : L'interface affiche le branding NEOPRO. Les clubs premium veulent que l'écran porte leurs couleurs, leur logo, et leur identité. Les sponsors aussi préfèrent un branding "du club" plutôt que "d'un prestataire".

**Solution** : Système de thématisation par club : logo, palette de couleurs, police, écran d'accueil personnalisé. Le branding NEOPRO est optionnel (mention "Powered by NEOPRO" en petit).

**Hypothèses**

- Les clubs Premium (3 000€/an) considèrent la marque blanche comme un must-have
- Le branding personnalisé augmente le sentiment d'appropriation du club (+NPS)
- Faible coût de développement (CSS variables + config)

**Coût estimé** : 8 SP (≈ 1 semaine dev)

**Bénéfice attendu**

- Argument de vente pour la formule Premium
- NPS club Premium : +10 points
- Réduction du churn Premium

**Indicateurs avancés** : Taux d'activation marque blanche, nombre de thèmes créés
**Indicateurs retardés** : Taux de rétention Premium, NPS club Premium

**MVP** : Logo + couleurs + écran d'accueil personnalisé par club
**Go/No-Go** : Go si ≥ 5 clubs Premium actifs

---

### E-14 — Fonds de Solidarité Sport

| Champ                 | Détail                          |
| --------------------- | ------------------------------- |
| **Value Stream**      | Transverse                      |
| **Thème Stratégique** | TS3 — Acquisition & Déploiement |
| **WSJF**              | 5                               |

**Problème** : Le sport amateur manque de financement. Les clubs les plus modestes ne peuvent pas se payer NEOPRO. Pas de mécanisme de solidarité entre clubs riches et clubs modestes.

**Solution** : Fonds de solidarité alimenté par un % des revenus régie (1-2%). Les clubs éligibles (critères sociaux) reçoivent un abonnement NEOPRO subventionné. Dashboard de suivi des contributions et bénéficiaires.

**Hypothèses**

- 2% des revenus régie suffisent pour subventionner 2-3 clubs/an
- L'impact RSE est un argument commercial pour les annonceurs régionaux
- Le fonds de solidarité génère une couverture presse locale positive

**Coût estimé** : 5 SP (≈ 0.5 semaine dev)

**Bénéfice attendu**

- Impact RSE : différenciation vs concurrence
- Couverture presse locale → acquisition organique
- Fidélisation annonceurs (impact social prouvé)

**Indicateurs avancés** : Montant du fonds, nombre de candidatures reçues
**Indicateurs retardés** : Clubs subventionnés, couverture presse, ARR induit

**MVP** : Page "Fonds de Solidarité" + formulaire candidature + dashboard contributions
**Go/No-Go** : Go si ARR régie > 50K€

---

## Récapitulatif WSJF

| Rang | Epic                              | WSJF | PI   | Statut                    |
| ---- | --------------------------------- | ---- | ---- | ------------------------- |
| 1    | E-03 Analytics Sponsors Avancé    | 20   | PI-1 | ⚠️ Partiel (18/23 SP)     |
| 1    | E-06 Onboarding Automatisé        | 20   | PI-1 | Backlog                   |
| 3    | E-11 Régie Publicitaire Régionale | 18   | PI-2 | Backlog                   |
| 4    | E-01 Portail Sponsor Self-Service | 13   | PI-1 | Backlog                   |
| 5    | E-07 Résilience WiFi V2           | 12   | PI-1 | ⚠️ Partiel (F-07.3 reste) |
| 5    | E-22 Contenus Différenciés TV+LED | 12   | PI-2 | Backlog                   |
| 7    | E-02 Rotation Sponsors            | 10   | PI-1 | Backlog                   |
| 7    | E-08 Alertes Prédictives          | 10   | PI-1 | ✅ Done                   |
| 9    | E-04 Profils Config Match         | 8    | PI-1 | ✅ Done                   |
| 9    | E-10 Monitoring Fleet             | 8    | PI-1 | ⚠️ Partiel (F-10.1 reste) |
| 9    | E-12 Multi-Écrans Synchronisés    | 8    | PI-3 | Backlog                   |
| 12   | E-05 Motion Design Personnalisé   | 7    | PI-2 | Backlog                   |
| 13   | E-09 Architecture Audit           | 6    | PI-1 | ✅ Done                   |
| 13   | E-13 Marque Blanche Club          | 6    | PI-3 | Backlog                   |
| 15   | E-14 Fonds de Solidarité          | 5    | PI-3 | Backlog                   |

---

## PI-2 Epics (transférés du Legacy Backlog)

---

### E-15 — Score en Live Phase 2 (Table de Marque + API Fédérations)

| Champ                 | Détail                 |
| --------------------- | ---------------------- |
| **Value Stream**      | VS1 — Club to Screen   |
| **Thème Stratégique** | TS2 — Expérience Match |
| **WSJF**              | 12 (↑ depuis 9 — deal-breaker prospect) |

**Problème** : Le score en live (Phase 1) nécessite une saisie manuelle depuis la télécommande. Charge cognitive pour l'opérateur de table de marque, risque d'erreur, double saisie avec la console officielle du club. **Deal-breaker confirmé pour plusieurs prospects** : sans lecture automatique, pas de signature. Par ailleurs, la douleur côté clubs amateurs est bien documentée : aujourd'hui, les membres des clubs doivent s'envoyer des messages pour savoir où en est un match — aucune source officielle live n'existe.

**Pivot Avr 2026** : F-15.1 (API fédérations) mis en veille — la recherche confirmée dans [PROP-003](../proposals/PROP-003-score-live-multi-vendor.md) a établi qu'aucune fédération amateur française n'expose d'API publique de scores. L'objectif bascule sur **F-15.2 — Lecture directe table de marque multi-constructeurs**, avec pattern `ScoreboardConnector` plugin et support Stramatel (RS-485 binaire), Bodet (Scorepad TCP + BT6000 série) et OCR fallback universel. Décision architecturale figée dans [ADR-049](../adr/ADR-049-score-live-multi-vendor-architecture.md).

**Solution F-15.2**

- Architecture plugin connecteur unifiée (Stramatel, Bodet, OCR, extensible à Favero/Mobatime/Daktronics)
- Produit physique **Neopro Scorebox** (Pi Zero 2 W + HAT RS-485) en 3 modes configurables selon la topologie du club :
  - **Mode cloud-push** : Scorebox → central-server (SaaS ou Pi en ligne)
  - **Mode local-AP** : Scorebox émet son propre mini-AP WiFi, le Pi s'y connecte via clé USB WiFi (gymnase offline)
  - **Mode lan-bridge** : S2E sur LAN club pour les gymnases connectés
- Fallback automatique sur saisie manuelle si connecteur déconnecté (override 30s)
- Persistance de tous les événements scoreboard avec audit trail (source, confidence, timestamps) — fondation pour l'API publique [F-21.2](#e-21--api-partenaires-oauth)

**Hypothèses**

- 50% du parc actuel est équipé Stramatel ou Bodet (deux leaders France)
- Le POC phase 0 (cf. [script standalone](../../raspberry/scripts/poc-stramatel/)) valide la lecture en < 3 jours
- La majorité des gymnases n'ont pas de WiFi/Ethernet (80% offline selon retour terrain) → le mode Scorebox local-AP est essentiel
- Les clubs SaaS ont internet par définition → mode cloud-push les couvre

**Coût estimé** : 48 SP (≈ 6-7 semaines dev) — 2 Features, 9 US (dont 2 en veille)

**Bénéfice attendu**

- **Déblocage commercial direct** : deal-breaker prospect levé, signature
- Suppression de la charge opérateur pour le score (-100% saisie manuelle)
- Données plus riches que la saisie Remote : chrono, fautes, temps morts, 24s
- **Upsell abonnement** : +15€/mois/site "Option Premium Score Live" (~30 sites pour amortir le dev, puis marge)
- **Fondation pour F-21.2** (API publique, PI-3) : sans F-15.2, pas de data fiable à exposer
- **Différentiateur commercial massif** : aucun concurrent ne propose cette intégration multi-constructeurs pour clubs amateurs

**Indicateurs avancés** : Taux de matchs avec score auto, latence de mise à jour, taux de connecteurs healthy dans la flotte
**Indicateurs retardés** : Signature prospect deal-breaker, NPS club, ARR upsell live score, taux d'adoption F-21.2 downstream

**MVP** : Phases 0-2 de PROP-003 = POC terrain + Stramatel connecteur + Bodet connecteur + config dashboard + scorebox firmware
**Go/No-Go** : Go confirmé — deal-breaker commercial, POC standalone disponible dans `raspberry/scripts/poc-stramatel/`

---

### E-16 — Rapports Email Automatiques

| Champ                 | Détail                          |
| --------------------- | ------------------------------- |
| **Value Stream**      | Transverse                      |
| **Thème Stratégique** | TS4 — Excellence Opérationnelle |
| **WSJF**              | 10                              |

**Problème** : Les rapports PDF existent mais doivent être téléchargés manuellement depuis le dashboard. Les clubs oublient de consulter leurs analytics. Le suivi mensuel est inexistant.

**Solution** : Envoi automatique du rapport PDF mensuel par email en début de mois. Liste de diffusion configurable par site avec opt-in/opt-out.

**Hypothèses**

- 80% des clubs consulteraient un rapport reçu par email (vs 30% qui le téléchargent)
- Le coût d'envoi (SendGrid) est négligeable (< 1€/mois pour 50 clubs)
- Le rapport mensuel augmente l'engagement et réduit le churn

**Coût estimé** : 8 SP (≈ 1 semaine dev)

**Bénéfice attendu**

- Consultation rapports : 30% → 80%
- Réduction churn : les clubs voient la valeur mensuelle
- Base pour E-16 (rapports sponsor automatiques)

**Indicateurs avancés** : Taux d'ouverture email, taux de clics sur le rapport
**Indicateurs retardés** : Churn mensuel, NPS club

**MVP** : Cron mensuel + PDF auto-généré + email avec pièce jointe
**Go/No-Go** : Go (dépendance légère, faible risque, fort impact)

---

### E-17 — A/B Testing Créas Sponsors

| Champ                 | Détail                      |
| --------------------- | --------------------------- |
| **Value Stream**      | VS2 — Sponsor to Impression |
| **Thème Stratégique** | TS1 — Monétisation          |
| **WSJF**              | 7                           |

**Problème** : Les sponsors diffusent un seul spot sans savoir s'il est efficace. Pas de moyen de comparer plusieurs créations. Les décisions sont prises au "feeling".

**Solution** : Système de campagnes A/B Testing permettant de tester 2-3 variantes d'un spot avec allocation de trafic configurable. Détermination statistique du gagnant (test χ²).

**Hypothèses**

- Les sponsors régionaux sont sensibles à l'optimisation de leurs créas
- Un test A/B nécessite ≥ 500 impressions par variante pour être significatif
- La feature justifie un surcoût de 50€/mois (option premium)

**Coût estimé** : 13 SP (≈ 1.5 semaines dev)

**Bénéfice attendu**

- Upsell A/B Testing : +600€/an par sponsor actif
- Augmentation taux de complétion moyen de 10-15%
- Argument commercial pour la régie (E-11)

**Indicateurs avancés** : Nombre de campagnes A/B créées, nombre de variantes testées
**Indicateurs retardés** : Amélioration taux de complétion moyen, ARR upsell

**MVP** : Campagne 2 variantes + allocation 50/50 + résultats
**Go/No-Go** : Go si ≥ 5 sponsors actifs et E-02 (rotation) livré

---

## PI-3 Epics (transférés du Legacy Backlog)

---

### E-18 — Intégrations Billetterie

| Champ                 | Détail                 |
| --------------------- | ---------------------- |
| **Value Stream**      | VS1 — Club to Screen   |
| **Thème Stratégique** | TS2 — Expérience Match |
| **WSJF**              | 6                      |

**Problème** : L'estimation d'audience est manuelle et approximative. Les sponsors veulent des chiffres d'audience fiables pour mesurer leur ROI.

**Solution** : Intégration des APIs de billetterie (Weezevent, Eventbrite) pour injecter automatiquement l'audience réelle (billets vendus) dans les analytics.

**Hypothèses**

- 30% des clubs amateurs utilisent une billetterie en ligne
- L'audience réelle est 15-20% différente de l'estimation manuelle
- L'audience certifiée augmente la confiance des sponsors (+renouvellement)

**Coût estimé** : 8 SP (≈ 1 semaine dev par intégration)

**Bénéfice attendu**

- Données d'audience fiables → meilleur argumentaire sponsor
- Automatisation complète du pipeline analytics

**Indicateurs avancés** : Nombre de clubs connectés à une billetterie
**Indicateurs retardés** : Précision audience, taux de renouvellement sponsor

**MVP** : Intégration Weezevent (leader français événementiel amateur)
**Go/No-Go** : Go si ≥ 3 clubs utilisent Weezevent

---

### E-19 — Capteurs Présence Hardware

| Champ                 | Détail                 |
| --------------------- | ---------------------- |
| **Value Stream**      | VS1 — Club to Screen   |
| **Thème Stratégique** | TS2 — Expérience Match |
| **WSJF**              | 4                      |

**Problème** : Les clubs sans billetterie n'ont aucun moyen fiable de compter les spectateurs. Le WiFi tracking est approximatif.

**Solution** : Capteur infrarouge ou caméra connecté au Pi pour compter les entrées/sorties. Comptage automatique avec calibration initiale.

**Hypothèses**

- Un capteur infrarouge coûte 30-50€ (compatible avec le budget club)
- La précision de comptage est > 90% après calibration
- 20% des clubs seraient intéressés par cette option

**Coût estimé** : 13 SP (≈ 2 semaines dev, inclut hardware)

**Bénéfice attendu**

- Audience 100% automatisée sans billetterie
- Upsell hardware : +10€/mois location capteur

**Indicateurs avancés** : Nombre de capteurs installés, précision comptage
**Indicateurs retardés** : Satisfaction clubs, réduction écart estimation/réel

**MVP** : Capteur infrarouge USB + driver Pi + dashboard
**Go/No-Go** : Go si ≥ 20 clubs actifs et ROI capteur validé

---

### E-20 — Analytics Prédictives ML

| Champ                 | Détail                          |
| --------------------- | ------------------------------- |
| **Value Stream**      | Transverse                      |
| **Thème Stratégique** | TS4 — Excellence Opérationnelle |
| **WSJF**              | 5                               |

**Problème** : Les alertes prédictives (E-08) détectent les dégradations techniques. Mais il n'y a pas de prédiction de l'engagement club ni de recommandations automatiques pour améliorer l'utilisation.

**Solution** : Modèle de machine learning (time-series forecasting) pour prédire l'engagement futur, détecter les anomalies, et générer des recommandations actionables.

**Hypothèses**

- 6 mois de données historiques suffisent pour un modèle fiable
- Les recommandations automatiques augmentent l'engagement de 20%
- Un modèle simple (ARIMA/Prophet) suffit pour le MVP

**Coût estimé** : 13 SP (≈ 2 semaines dev)

**Bénéfice attendu**

- Réduction churn proactif (identifier les clubs à risque)
- Augmentation engagement moyen (+20%)
- Feature premium différenciante

**Indicateurs avancés** : Précision du modèle, nombre de recommandations générées
**Indicateurs retardés** : Churn réduit, engagement moyen

**MVP** : Forecasting engagement 30j + anomaly detection + 3 recommandations types
**Go/No-Go** : Go si ≥ 15 clubs avec 6 mois d'historique

---

### E-21 — API Partenaires OAuth

| Champ                 | Détail             |
| --------------------- | ------------------ |
| **Value Stream**      | Transverse         |
| **Thème Stratégique** | TS1 — Monétisation |
| **WSJF**              | 8 (↑ depuis 5 — extension F-21.2 scores publics) |

**Problème** : Deux problématiques liées :

1. **F-21.1** — Les partenaires externes (agences, sponsors multi-clubs) n'ont pas d'accès programmatique aux données NEOPRO. Tout passe par le dashboard ou des exports manuels.
2. **F-21.2** — Les clubs amateurs français n'ont **aucune source officielle de scores live**. Aujourd'hui les membres s'envoient des messages pour savoir où en est un match. Les médias locaux, apps clubs, agrégateurs et fédérations n'ont pas de source fiable à intégrer. Avec F-15.2 livrée en PI-2, Neopro devient la seule entité capable de lire directement les tables de marque officielles de centaines de clubs — transformer cette donnée en API publique crée un **hub temps réel du sport amateur français**.

**Solution**

- **F-21.1** : API RESTful sécurisée par OAuth 2.0 avec scopes granulaires, rate limiting, et portail développeurs pour les agences/sponsors multi-clubs
- **F-21.2** : API publique dédiée aux scores live, REST v1 + WebSocket + webhooks, plans tarifaires segmentés par richesse de données (Free = Level 1 score/période/temps, Starter = + Level 2 fautes/TO/24s, Pro = + Level 3 contexte + Level 4 timeline, Enterprise = SLA sur-mesure). API keys séparées du système d'auth clubs. Portail développeur public avec doc interactive et sandbox.

**Hypothèses**

- F-21.1 : 3-5 agences/partenaires utiliseraient l'API dès le lancement
- **F-21.2** : 10-20 premiers clients API la première année (apps clubs, médias locaux, agrégateurs), avec effet réseau exponentiel une fois 100+ clubs équipés
- Le positionnement « plus jamais un membre du club à devoir appeler pour savoir où en est le match » résonne commercialement
- Les fédérations (FFHB, FFBB, FFVB) accepteraient un partenariat data même sans API publique de leur côté (elles reçoivent plus qu'elles ne donnent)

**Prérequis bloquant F-21.2** : F-15.2 livrée en PI-2 (sans elle, pas de data à exposer). Aussi : clause CGU « data licence » validée par un juriste sport/data avant premier contrat tier, stratégie RGPD (pas de noms de joueurs en v1).

**Coût estimé** : 34 SP total (13 SP F-21.1 + 21 SP F-21.2) ≈ 4-5 semaines dev

**Bénéfice attendu**

- Nouveau flux de revenus SaaS API (plans mensuels 0€ Free → 490€+ Enterprise)
- **Effet réseau** : plus de clubs équipés → plus de matchs couverts → plus de clients API → plus d'attractivité pour équiper de nouveaux clubs
- **Positionnement marché unique** : seule source officielle de scores amateurs live en France, concurrence nulle sur ce segment
- **Différenciateur commercial pour F-15.2** : « en installant Neopro, ton match est automatiquement visible sur toutes les apps partenaires »
- Lock-in positif des clubs (plus ils l'utilisent, plus leur data rayonne, plus ils ont intérêt à rester)
- Base pour partenariats stratégiques fédérations (remontée automatique des scores officiels)

**Indicateurs avancés** : Nombre de clients API, requêtes/jour, nombre de matchs couverts live
**Indicateurs retardés** : ARR API, nombre d'intégrations tierces, couverture territoriale (clubs équipés), NPS dev portal

**MVP F-21.2** : REST v1 `/scores/live` + `/matches/{id}` + plan Free (Level 1, 100 calls/j) + portail doc statique + 3 clients beta recrutés avant PI-3 S3
**Go/No-Go F-21.2** : Go en PI-3 si F-15.2 livrée + ≥ 3 intentions d'intégration d'apps tierces recueillies pendant PI-2 (teasing commercial à déclencher en fin PI-2)

---

### E-22 — Contenus Différenciés TV + LED

| Champ                 | Détail                 |
| --------------------- | ---------------------- |
| **Value Stream**      | VS1 — Club to Screen   |
| **Thème Stratégique** | TS2 — Expérience Match |
| **WSJF**              | 12                     |

**Problème** : Certains clubs disposent d'une TV classique ET d'un panneau LED (bandeau, mur LED, totem). Ils veulent diffuser des contenus différenciés adaptés au format de chaque support (16:9 pour la TV, format custom pour le LED) depuis un seul Raspberry Pi.

**Solution** : Utiliser les 2 sorties HDMI natives du Pi 5 avec 2 instances Chromium kiosk indépendantes (`/tv` et `/led`). Chaque instance interprète les mêmes événements Socket.IO (score, commandes, faits de jeu) selon son `displayType`. Un système de variantes vidéo permet d'uploader une version TV et une version LED de chaque contenu.

**Hypothèses**

- 10-15% des clubs cibles disposent d'un panneau LED en plus de la TV
- L'upsell LED justifie un supplément de 50€/mois par écran LED
- Le Pi 5 gère 2 flux vidéo simultanés (GPU 256MB, 1080p@30fps max)
- Les contrôleurs LED professionnels (Linsn, Novastar) acceptent un signal HDMI standard

**Coût estimé** : 39 SP (≈ 4-5 semaines dev, dont 3 SP spike hardware)

**Bénéfice attendu**

- Upsell : +600€/an par écran LED supplémentaire
- Pénétration du segment semi-pro et clubs multi-espaces
- Différenciation massive vs concurrence (aucun concurrent ne gère TV+LED)
- Attractivité pour les annonceurs (affichage multi-support = CPM plus élevé)

**Indicateurs avancés** : Nombre de clubs TV+LED, latence de synchronisation TV/LED, taux de couverture variantes LED
**Indicateurs retardés** : ARR upsell LED, NPS clubs semi-pro, CPM moyen annonceurs multi-support

**MVP** : 1 Pi avec 2 HDMI → TV + LED affichant contenus adaptés à chaque format + score overlay différencié
**Go/No-Go** : Go si ≥ 1 prospect confirme installation LED

**Référence technique** : [PROP-002 — TV + LED Dual Output](../proposals/PROP-002-tv-led-dual-output.md)

---

### E-23 — Résilience HDMI & Accès Navigateur

| Champ                 | Détail                                           |
| --------------------- | ------------------------------------------------ |
| **Value Stream**      | VS1 — Club to Screen + Transverse                |
| **Thème Stratégique** | TS4 — Excellence Opérationnelle + TS2 Expérience |
| **WSJF**              | 14                                               |

**Problème** : La gestion HDMI du Pi est fragile : polling 30s au lieu de hotplug instantané, HDMI-0 non surveillé, écran noir si branché sur la mauvaise prise, blackout de 4-8s lors des transitions dual-display, aucun failover quand l'écran principal est débranché, et les accès navigateur PC ne sont ni monitorés ni distingués dans les analytics. Score de fiabilité actuel : 64/100. C'est la source N°1 d'appels support terrain.

**Solution** : Refonte complète du cycle de vie HDMI en 7 axes : (1) détection udev temps réel remplaçant le polling, (2) feedback boot sans écran, (3) priorité kiosk au hotplug, (4) transition dual zéro coupure, (5) résilience mauvaise prise avec auto-swap, (6) failover automatique perte d'écran principal, (7) monitoring des accès navigateur PC avec analytics distinctes.

**Hypothèses**

- Le remplacement du polling 30s par udev réduit le temps de réaction HDMI de 30s à < 1s
- 80% des appels support "écran noir" sont liés à un branchement HDMI-1 sans HDMI-0 (mauvaise prise)
- L'auto-swap et le failover automatique éliminent 90% des interventions manuelles terrain
- 5-10% des clubs accèdent à `/tv` depuis un navigateur PC (usage non mesuré actuellement)

**Coût estimé** : 146 SP (≈ 18 semaines dev, décomposé en 7 Features — P0: 65 SP, P1: 60 SP, P2: 21 SP)

**Bénéfice attendu**

- Tickets support HDMI : -80% (source N°1 éliminée)
- Uptime perçu : 95% → 99.5% (transitions sans blackout)
- Temps de réaction HDMI : 30s → < 1s (udev vs polling)
- Score fiabilité HDMI : 64/100 → 95/100
- Enabler pour E-12 (Multi-Écrans) et E-22 (Dual Display) en conditions réelles

**Indicateurs avancés** : Temps moyen de détection HDMI, taux de succès transition dual, incidents "mauvaise prise"/mois
**Indicateurs retardés** : Tickets support HDMI/mois, MTTR incidents écran, uptime moyen flotte, NPS club (fiabilité)

**MVP** : F-23.1 (détection udev) + F-23.5 (auto-swap mauvaise prise) + F-23.6 (failover dual) — les 3 features P0 qui éliminent les cas les plus critiques
**Go/No-Go** : Go (prerequisite pour fiabilité terrain à l'échelle, dépendance E-22)

---

## Récapitulatif WSJF (mis à jour)

| Rang | Epic                              | WSJF | PI   | Statut                    |
| ---- | --------------------------------- | ---- | ---- | ------------------------- |
| 1    | E-03 Analytics Sponsors Avancé    | 20   | PI-1 | ⚠️ Partiel (18/23 SP)     |
| 1    | E-06 Onboarding Automatisé        | 20   | PI-1 | Backlog                   |
| 3    | E-11 Régie Publicitaire Régionale | 18   | PI-2 | Backlog                   |
| 4    | E-23 Résilience HDMI & Accès Nav. | 14   | PI-2 | Backlog (nouveau)         |
| 5    | E-01 Portail Sponsor Self-Service | 13   | PI-1 | Backlog                   |
| 5    | E-15 Score Live Phase 2 (pivot)   | 12   | PI-2 | Backlog (F-15.2 nouveau)  |
| 5    | E-07 Résilience WiFi V2           | 12   | PI-1 | ⚠️ Partiel (F-07.3 reste) |
| 5    | E-22 Contenus Différenciés TV+LED | 12   | PI-2 | Backlog                   |
| 9    | E-02 Rotation Sponsors            | 10   | PI-1 | Backlog                   |
| 9    | E-08 Alertes Prédictives          | 10   | PI-1 | ✅ Done                   |
| 9    | E-16 Rapports Email Auto          | 10   | PI-2 | Backlog                   |
| 12   | E-21 API OAuth (+ F-21.2 scores)  | 8    | PI-3 | Backlog (nouveau)         |
| 12   | E-04 Profils Config Match         | 8    | PI-1 | ✅ Done                   |
| 12   | E-10 Monitoring Fleet             | 8    | PI-1 | ⚠️ Partiel (F-10.1 reste) |
| 12   | E-12 Multi-Écrans Synchronisés    | 8    | PI-3 | Backlog                   |
| 16   | E-05 Motion Design Personnalisé   | 7    | PI-2 | Backlog                   |
| 16   | E-17 A/B Testing                  | 7    | PI-2 | Backlog                   |
| 18   | E-09 Architecture Audit           | 6    | PI-1 | ✅ Done                   |
| 18   | E-13 Marque Blanche Club          | 6    | PI-3 | Backlog                   |
| 18   | E-18 Billetterie                  | 6    | PI-3 | Backlog                   |
| 21   | E-14 Fonds de Solidarité          | 5    | PI-3 | Backlog                   |
| 21   | E-20 Analytics ML                 | 5    | PI-3 | Backlog                   |
| 23   | E-19 Capteurs Présence            | 4    | PI-3 | Backlog                   |

---

**Retour** : [SAFe Neopro](README.md) · [Portfolio](PORTFOLIO.md) · [Implemented Backlog](IMPLEMENTED-BACKLOG.md)
