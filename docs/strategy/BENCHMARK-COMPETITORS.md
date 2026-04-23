# Benchmark concurrentiel Neopro — Affichage dynamique sportif

> **Statut** : en cours — Session 1 terminée (2026-04-23). Sessions 2 & 3 à venir.
> **Dernière mise à jour** : 2026-04-23
> **Périmètre** : France + Europe
> **Objectifs** : (1) roadmap produit (2) stratégie commerciale

## 1. Executive Summary (préliminaire)

### Positionnement de Neopro

Neopro est une **solution hybride SaaS + edge** (Pi) de TV interactive multi-tenant pour clubs sportifs, avec **régie pub native** (sponsor weighted rotation) et **Template Studio v2 data-driven** (Remotion). Architecture résiliente offline depuis ADR-037 (mode SaaS pur ajouté).

### Concurrence terrain confirmée

Les concurrents que les **prospects clubs citent spontanément** sont :

1. **Afficheurs LED hardware** : Bodet Sport, Stramatel, A2Display
2. **Solutions "maison" gratuites** : OBS Studio + bricolage TV
3. **Concurrent direct identifié pendant la recherche** : **TVTools** (FR, depuis 1987) — affichage dynamique stade SaaS/On-Premise avec sponsoring auto

### Hypothèses de positionnement (révisées 2026-04-23 après analyse logiciels)

| Concurrent    | Type de combat                                                            | Pitch Neopro à construire                                                         |
| ------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Bodet**     | Hardware LED + suite logicielle complète (VIDEOSPORT/VIDEOMEDIA/SCOREAPP) | "Cloud-native multi-tenant, régie pub multi-clubs, déploiement flotte centralisé" |
| **Stramatel** | Hardware + apps Android (Outsport/Multisport) + suite SL                  | "Plateforme cloud unifiée vs apps fragmentées, multi-tenant agency/club"          |
| **A2Display** | Logiciel + LED multi-secteur                                              | "Spécialisé club, pas généraliste, intégrations sport natives"                    |
| **TVTools**   | SaaS/On-Premise affichage stade pro                                       | **⚠️ Concurrent le plus dangereux** — analyse approfondie session 2               |
| **OBS**       | Gratuit, bricolage bénévole                                               | "Coût caché du gratuit : temps, fragilité, pas de support flotte"                 |

### ⚠️ Révision majeure (2026-04-23)

L'analyse approfondie des **logiciels** Bodet (VIDEOSPORT, VIDEOMEDIA, SCOREAPP, SCOREPAD multi-controller) et Stramatel (SL Video System, SL Box, Easy Click, apps Android Outsport/Multisport/Icesport, console hybride Android 452) montre que ces deux acteurs sont **bien plus outillés** que ne le laissait penser leur image "fabricant LED hardware" :

- ✅ Bodet **a une régie pub** avec tracking temps de diffusion par budget annonceur (VIDEOMEDIA)
- ✅ Bodet **a des templates personnalisables** par sport et niveau (VIDEOSPORT)
- ✅ Bodet **innove côté UX** avec SCOREAPP (auto-arbitrage par smartphone/montre connectée)
- ✅ Stramatel **a 3 apps Android publiques** sur Google Play
- ✅ Stramatel **partage social media natif** (SMS, email, RS) depuis l'app
- ✅ Tous deux **certifiés/recommandés FFBB + FIBA** côté Bodet/Stramatel
- ✅ Stramatel a **service terrain** (formation, intervention week-end)

**Ce qui RESTE différenciateur Neopro** (à confirmer en session 3) :

1. **SaaS Cloud multi-tenant true** : workflow agency/advertiser/club avec approbation, monitoring de flotte centralisé multi-sites
2. **Edge Pi résilient** : Bodet/Stramatel restent en console locale/serveur local
3. **Templates Remotion data-driven** : VIDEOSPORT propose des "skins de score", pas une composition vidéo paramétrique réelle
4. **Mode SaaS pur sans hardware** (ADR-037) : Bodet/Stramatel ne savent pas vendre sans hardware
5. **Régie pub multi-clubs / multi-annonceurs** avec reporting transparent (VIDEOMEDIA reste mono-club / mono-événement)

### Top 3 menaces (révisées 2026-04-23 après chat officiel Stramatel)

1. **TVTools** : 38 ans d'expertise, périmètre très proche, à investiguer urgemment
2. **Stramatel SL Video Scoreboard** : revisé à la baisse — afficheur lourd (82 kg), piloté par **radio**, garantie 3 ans, module media (MPA) en option. Le chatbot officiel Stramatel a confirmé (2026-04-23) **aucun dashboard cloud, aucune app smartphone, aucune gestion multi-sites à distance, chargement initial des médias en accès physique obligatoire**. Menace réelle mais cadrée au segment indoor collectif/raquette/glace.
3. **Lock-in fédéral Bodet/Stramatel** : recommandation FFBB + partenariat FIBA = biais d'achat fort. Les deux acteurs sont plus outillés que leur image hardware ne le suggère, mais leur **transmission radio + installation lourde + absence de cloud** reste un handicap face à un SaaS moderne.

### ⚠️ Confirmations PDF officiels Bodet (2026-04-23)

Catalogue vidéo FR (16 p.) + brochure Sports Display EN. Faits saillants :

- **180 salariés Trémentines + bureau d'études 30 personnes** + ISO 9001/14001 + EcoVadis CSR + UN Global Compact
- **VIDEOSPORT certifié FIBA niveau 1 ET 2**, pilote 1 à 7 supports simultanés, **animations auto sur action de jeu** (but, pénalité, 3-points, temps forts), **social media intégré avec modération** (hashtags + comptes)
- **VIDEOMEDIA reporting = export tableur Excel**, pas de dashboard cloud → confirmé : pas de plateforme analytics moderne
- **SCOREPAD** : 40+ sports, 15+ langues, écran tactile 7", **Ethernet ou USB uniquement** (pas de WiFi pupitre), **mises à jour règlements par clé USB** (pas d'OTA)
- **SCOREAPP** : WiFi dédié SCOREAPP BOX (pas Internet), apps Android + iOS, appariement par QR code
- **Player Vidéo Autonome** mentionne explicitement la **sauvegarde sur le Cloud** (file storage, pas plateforme multi-tenant)
- **Garantie hardware 2 ans** (révision : pas 10 ans), durée de vie LED ≥ 10 ans
- **Références prestigieuses** : Betclic Élite, FIBA EuroBasket/World Cup, Turkish Airlines EuroLeague, EHF, CEV, France Handball 2017, Disneyland Paris Leaders Cup, Olympiad Colombia
- **3 catégories sport VIDEOSPORT** : salle (basket, hand, volley, badminton, basket 3x3, rink hockey), stade (foot, rugby, field hockey, netball), autres (waterpolo, hockey glace, tennis, combat)

**Implications stratégiques** :

1. ✅ **Lacune Neopro confirmée** : animations auto sur action de jeu + sync social media intégré avec modérateur — à intégrer roadmap
2. ✅ **Avantage Neopro confirmé** : pas de dashboard cloud chez Bodet (Excel export VIDEOMEDIA), pas d'OTA (USB SCOREPAD), pas de multi-tenant agency/club
3. ⚠️ **Vigilance** : un bureau d'études de 30 personnes peut bâtir une plateforme cloud Bodet Sport rapidement — la techno Cloud existe déjà chez Bodet pour Kelio (SIRH)
4. ⚠️ **Garantie révisée** : 2 ans hardware (pas 10), seul l'amortissement LED dépasse 10 ans

### ⚠️ Confirmations officielles chatbot Stramatel (2026-04-23)

Admis explicitement par le chatbot commercial Stramatel sur le SL Video Scoreboard :

- ❌ **Aucun dashboard cloud**
- ❌ **Aucune app smartphone pour ce produit**
- ❌ **Aucune gestion multi-sites à distance**
- ✅ **Accès physique obligatoire** pour le chargement initial des médias
- ✅ Pilotage du score uniquement en **radio**
- ✅ Garantie 3 ans (matériel + LED)

Non confirmables par le chatbot (= probablement absents) : reporting sponsor (impressions/durée par logo), multi-tenant, intégration régie pub externe, mise à jour à distance Internet, formats vidéo acceptés, compatibilité pupitre hors basket (FIBA), portée radio / tolérance aux interférences gymnase.

**Implication stratégique** : le SL Video Scoreboard est un afficheur LED moderne mais architecturé comme un équipement autonome on-premise des années 2010. Neopro dispose d'un **avantage technologique structurel majeur** (cloud-native, multi-tenant, OTA, multi-sites) — à articuler clairement dans le pitch commercial.

### Top 3 opportunités (révisées)

1. **Vraie plateforme cloud multi-tenant** : aucun des 3 acteurs FR (Bodet, Stramatel, A2Display) n'a ça aujourd'hui — leurs solutions restent **mono-club / mono-installation**
2. **API REST publique + intégrations data fédérales** : ni Bodet ni Stramatel n'exposent d'API publique documentée — Neopro peut devenir la plateforme d'intégration calendrier/résultats fédéraux
3. **Mode SaaS pur low-CapEx (ADR-037)** : segment des petits clubs amateurs / SaaS sans matériel — angle mort des fabricants LED qui vendent du hardware

## 1bis. Matrice fonctionnelle détaillée Neopro vs Bodet vs Stramatel

Légende : ✅ présent / ⚠️ partiel / ❌ absent / 🟡 différent (à qualifier)

### Affichage de score (cœur historique des concurrents)

| Fonction                                      | Bodet                 | Stramatel               | Neopro           |
| --------------------------------------------- | --------------------- | ----------------------- | ---------------- |
| Tableau de score réglementaire homologué      | ✅ FIBA niv 1&2, FFBB | ✅ FIBA, FFBB           | ❌ Hors scope    |
| Multi-sport (15+ sports)                      | ✅ VIDEOSPORT         | ✅ Multisport           | ⚠️ via templates |
| Multi-terrains simultanés                     | ✅ SCOREPAD           | ⚠️ à confirmer          | ❌               |
| Auto-arbitrage par joueur (smartphone/montre) | ✅ SCOREAPP           | ❌                      | ❌               |
| Pupitre tactile dédié                         | ✅ SCOREPAD           | ✅ Sportab, 452 Android | N/A              |

### Pilotage & contrôle

| Fonction                        | Bodet                            | Stramatel                         | Neopro                  |
| ------------------------------- | -------------------------------- | --------------------------------- | ----------------------- |
| Console hardware physique       | ✅ SCOREPAD                      | ✅ console 452 Android            | ❌                      |
| App mobile pilotage             | ✅ via SCOREPAD multi-controller | ✅ Outsport, Multisport, Icesport | ✅ Dashboard responsive |
| Préview avant diffusion         | ✅ VIDEOSPORT                    | ⚠️                                | ✅ Template Studio      |
| Multi-écran simultané           | ✅ jusqu'à 7 sorties             | ✅ multi-écran                    | ✅ flotte Pi            |
| Pilotage à distance multi-sites | ❌ local                         | ❌ local                          | ✅ ADR-037              |

### Régie publicitaire / sponsoring

| Fonction                                           | Bodet                                        | Stramatel                           | Neopro                  |
| -------------------------------------------------- | -------------------------------------------- | ----------------------------------- | ----------------------- |
| Diffusion logos/vidéos sponsors                    | ✅ VIDEOMEDIA                                | ✅ SL Box, SL Video Scoreboard      | ✅                      |
| Playlists par moment de match                      | ✅ pré-match, mi-temps, time-out, faute, but | ⚠️ playlists temporelles génériques | ✅                      |
| Tracking temps de diffusion par pub                | ✅ VIDEOMEDIA                                | ⚠️                                  | ✅                      |
| Reporting par budget annonceur                     | ✅ revendique                                | ⚠️                                  | ✅                      |
| **Multi-tenant agency/advertiser/club**            | ❌ mono-club                                 | ❌ mono-club                        | ✅ DIFFÉRENCIATEUR FORT |
| **Workflow d'approbation contenu**                 | ❌                                           | ❌                                  | ✅ DIFFÉRENCIATEUR      |
| **Sponsor weighted rotation**                      | ⚠️ playlists basiques                        | ⚠️ playlists basiques               | ✅ DIFFÉRENCIATEUR      |
| **Inventaire publicitaire centralisé multi-sites** | ❌                                           | ❌                                  | ✅ DIFFÉRENCIATEUR FORT |
| **Mesure interaction spectateur**                  | ✅ revendique (à creuser)                    | ❌                                  | ⚠️ à développer         |

### Contenu / templates

| Fonction                             | Bodet                                                                                     | Stramatel                        | Neopro                         |
| ------------------------------------ | ----------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------ |
| Templates personnalisables par sport | ✅ VIDEOSPORT                                                                             | ⚠️ via SL Box                    | ✅ Template Studio v2          |
| Animations sur action de jeu (auto)  | ✅ **VIDEOSPORT** : but, pénalité, 3-points, temps forts (média associé déclenché auto)   | ⚠️                               | ❌ **lacune Neopro confirmée** |
| **Templates data-driven Remotion**   | ❌ "skins" de score                                                                       | ❌                               | ✅ ADR-086 layers + safe-zones |
| **Composition vidéo paramétrique**   | ❌                                                                                        | ❌                               | ✅ DIFFÉRENCIATEUR             |
| Bibliothèque pré-faite               | ✅                                                                                        | ✅                               | ✅                             |
| Sync social media (Twitter/RSS)      | ✅ **VIDEOSPORT** : Twitter + RSS, hashtags ou comptes prédéfinis, **modérateur intégré** | ✅ Outsport partage SMS/email/RS | ❌ **lacune Neopro confirmée** |

### Architecture & déploiement

| Fonction                                      | Bodet                                                                   | Stramatel                                        | Neopro                        |
| --------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------- |
| Hardware propriétaire LED                     | ✅ catalogue complet                                                    | ✅ catalogue complet (SL Video Scoreboard 82 kg) | ❌ utilise TV existante       |
| **Connectivité Internet/WiFi**                | ⚠️ partielle                                                            | ❌ **Radio sur SL Video Scoreboard**             | ✅ WiFi/Ethernet Pi           |
| **Mises à jour OTA contenu**                  | ⚠️ Player autonome (WiFi + Cloud storage), SCOREPAD règles via USB only | ❌ (radio, accès physique requis)                | ✅ DIFFÉRENCIATEUR FORT       |
| Edge resilient (fonctionne offline)           | ⚠️ console locale autonome                                              | ⚠️ console locale autonome                       | ✅ Pi watchdog ADR-074        |
| **SaaS Cloud multi-tenant true**              | ❌                                                                      | ❌                                               | ✅ DIFFÉRENCIATEUR MAJEUR     |
| **Mode SaaS pur sans hardware**               | ❌                                                                      | ❌                                               | ✅ ADR-037                    |
| **Gestion de flotte centralisée multi-sites** | ❌                                                                      | ❌                                               | ✅ DIFFÉRENCIATEUR MAJEUR     |
| Garantie hardware                             | **2 ans** (LED ≥ 10 ans durée de vie)                                   | **3 ans** sur SL Video Scoreboard                | N/A (SaaS)                    |
| **Installation**                              | Lourde (rack ou flight case)                                            | **Murale 82 kg** sur SL Video Scoreboard         | ✅ TV existante               |
| Onduleur intégré système vidéo                | ✅ flight case                                                          | ⚠️                                               | N/A (Pi low-power)            |
| **API REST publique**                         | ❌                                                                      | ❌                                               | ✅ DIFFÉRENCIATEUR            |
| Intégration calendriers fédéraux              | ❌                                                                      | ❌                                               | ⚠️ à développer (opportunité) |

### Streaming / production vidéo

| Fonction                                    | Bodet                            | Stramatel                                   | Neopro |
| ------------------------------------------- | -------------------------------- | ------------------------------------------- | ------ |
| Streaming live match social media           | ❌ (pas trouvé)                  | ✅ SL Stream Box                            | ❌     |
| **Score auto intégré dans live stream**     | ❌                               | ✅ SL Stream Box                            | ❌     |
| Innovation hybride score + vidéo all-in-one | ⚠️ via cubes vidéo grands stades | ✅ **SL Video Scoreboard** (cible amateurs) | ❌     |

### Business model & service

| Fonction                                     | Bodet             | Stramatel           | Neopro                    |
| -------------------------------------------- | ----------------- | ------------------- | ------------------------- |
| Modèle CapEx hardware                        | ✅ ticket 4-50k€+ | ✅ ticket variable  | ❌                        |
| Modèle OpEx SaaS mensuel                     | ❌                | ❌                  | ✅                        |
| Garantie LED 10 ans                          | ✅                | ✅                  | N/A                       |
| Service terrain (formation, intervention WE) | ⚠️ via revendeurs | ✅ explicite        | ⚠️ à structurer           |
| Recommandation/partenariat fédéral           | ✅ FFBB, FIBA     | ✅ FFBB, FIBA       | ❌ à construire           |
| Made in France assumé                        | ✅ Trémentines    | ✅ La Roche-sur-Yon | ⚠️ R&D FR mais Pi importé |

### Synthèse de la matrice — vrais différenciateurs Neopro qui résistent à l'analyse

🟢 **Différenciateurs forts confirmés** (5) :

1. **SaaS Cloud multi-tenant true** (workflow agency/advertiser/club avec approbation)
2. **Gestion de flotte centralisée multi-sites** (Bodet/Stramatel = console locale par installation)
3. **Mode SaaS pur sans hardware** (ADR-037) — angle mort total des fabricants LED
4. **Inventaire publicitaire centralisé multi-clubs** + sponsor weighted rotation
5. **Templates Remotion data-driven** (vs "skins de score" Bodet ou playlists basiques Stramatel)

🟡 **Avantages secondaires** (3) : 6. API REST publique = plateforme intégrable 7. Edge Pi watchdog résilient (vs console locale) 8. Workflow d'approbation contenu multi-rôles

🔴 **Lacunes Neopro vs concurrents à corriger** :

- ❌ Pas d'auto-arbitrage joueur (Bodet SCOREAPP — innovation unique)
- ❌ Pas de streaming live avec score auto (Stramatel SL Stream Box)
- ❌ Pas d'animation auto sur action de jeu (Bodet VIDEOSPORT)
- ❌ Pas de tableau de score homologué fédération (à acter : on n'y va pas)
- ❌ Pas de service terrain structuré (formation, intervention WE)
- ❌ Pas de recommandation fédérale FFBB/FIBA

## 2. Cartographie du marché

### Schéma de positionnement

```
                   Sport/Club spécialisé
                          |
          Bodet ──────────┼──────────── Neopro
          Stramatel       |             TVTools
          DigitalSport    |
                          |
Hardware LED ─────────────┼─────────── SaaS Cloud
                          |
          A2Display       |             ScreenCloud
          Daktronics      |             Yodeck
                          |             OptiSigns
                          |
                   Généraliste
```

### Tableau récapitulatif — Concurrents identifiés

| #   | Concurrent               | Pays        | Segment                        | Type                                  | Priorité analyse              |
| --- | ------------------------ | ----------- | ------------------------------ | ------------------------------------- | ----------------------------- |
| 1   | **Bodet Sport**          | FR          | A — LED hardware sport         | Hardware + logiciel VIDEOSPORT        | 🔴 Haute                      |
| 2   | **Stramatel**            | FR          | A — LED hardware sport         | Hardware (partenaire FIBA)            | 🔴 Haute                      |
| 3   | **A2Display**            | FR          | A — LED hardware multi-secteur | Logiciel + matériel LED               | 🔴 Haute                      |
| 4   | **TVTools**              | FR          | A/B — SaaS sport stade         | SaaS ou On-Premise + scoring          | 🔴 Haute (découvert en cours) |
| 5   | **OBS Studio**           | Open-source | D — Production vidéo           | Gratuit, desktop                      | 🔴 Haute                      |
| 6   | **Daktronics**           | US          | A — LED hardware               | Hardware pro/stade                    | 🟡 Comparative                |
| 7   | **DigitalSport.fr**      | FR          | B — Spécialiste sport          | SaaS                                  | 🟡 Session 2                  |
| 8   | **Bizplay**              | FR          | B/C — Affichage clubs          | SaaS                                  | 🟡 Session 2                  |
| 9   | **SportMember**          | EU          | B — Logiciel club              | SaaS info screens                     | 🟡 Session 2                  |
| 10  | **ClubTV / FanCloud**    | UK          | B — TV club                    | SaaS                                  | 🟡 Session 2                  |
| 11  | **ScreenCloud**          | UK          | C — SaaS généraliste           | SaaS leader EU                        | 🟡 Session 2                  |
| 12  | **Yodeck**               | GR          | C — SaaS généraliste Pi        | SaaS + Pi inclus                      | 🟡 Session 2                  |
| 13  | **OptiSigns**            | US          | C — SaaS généraliste           | SaaS                                  | 🟢 Mention                    |
| 14  | **Rise Vision**          | CA          | C — SaaS généraliste           | SaaS éducation                        | 🟢 Mention                    |
| 15  | **Xibo CMS**             | UK          | E — Open-source                | Dual-license                          | 🟡 Session 2                  |
| 16  | **Anthias**              | UK          | E — Open-source Pi             | Open-source (Screenly)                | 🟡 Session 2                  |
| 17  | **Info-Beamer**          | DE          | E — Open-source Pi             | Open-source technique                 | 🟢 Mention                    |
| 18  | **Singular.live**        | UK          | D — Graphics overlay           | SaaS broadcast                        | 🟡 Session 2 (UX templates)   |
| 19  | **vMix / Wirecast**      | US          | D — Production pro             | Logiciel desktop                      | 🟢 Mention                    |
| 20  | **Spectrio / Raydiant**  | US          | F — Retail signage             | SaaS                                  | 🟢 Mention                    |
| 21  | **Casalsport**           | FR          | Distrib.                       | Revendeur Bodet/Stramatel             | 🟢 Canal                      |
| 22  | **Kalisport**            | FR          | Adjacent                       | Logiciel gestion club (pas affichage) | 🟢 Mention                    |
| 23  | **Samsung Business**     | KR          | Hardware écran                 | TV + apps signage                     | 🟢 Mention                    |
| 24  | **LEDCAST / Winlight**   | FR          | A — LED sur mesure             | Intégrateur LED                       | 🟢 Mention                    |
| 25  | **Favero / Alge-Timing** | IT/AT       | A — Chronométrage              | Hardware spécialisé                   | 🟢 Mention                    |

## 3. Fiches détaillées

### Concurrents prioritaires (Session 1 — terminée)

- **[Bodet Sport](competitors/bodet-sport.md)** — Leader européen LED sportif, hardware + VIDEOSPORT
- **[Stramatel](competitors/stramatel.md)** — Made in France, partenaire FIBA, vidéo LED
- **[A2Display](competitors/a2display.md)** — Éditeur logiciel + matériel LED multi-secteur
- **[TVTools](competitors/tvtools.md)** — ⚠️ Concurrent direct découvert pendant la recherche
- **[OBS Studio](competitors/obs-studio.md)** — Concurrent gratuit "solution maison"

### Concurrents secondaires (Session 2 — à venir)

DigitalSport.fr, Bizplay, ClubTV, FanCloud, SportMember, ScreenCloud, Yodeck, Xibo, Anthias, Singular.live

## 4. Analyses transverses (Session 3 — à venir)

- Pricing benchmark consolidé (€/écran/mois)
- Feature matrix (25 features × 12 acteurs)
- SWOT Neopro
- Recommandations roadmap produit
- Recommandations stratégie commerciale

## 5. Annexes

### Méthodologie

- Sources : sites officiels, Casalsport (revendeur), recherches web 2026-04-23
- Pas de trial pratique sur cette session — à faire en session 2 pour ScreenCloud/Yodeck
- Données pricing : collectées quand publiques, sinon "non collecté"

### Sources principales consultées (2026-04-23)

- bodet-sport.com, stramatel.com, a2display.fr, tvtools.fr, tvtools.eu, obsproject.com
- casalsport.com (revendeur officiel hardware FR)
- bizplay.com, sportmember.com (concurrents secondaires identifiés)

### Limites connues

- Recherche 100% web, pas d'interviews terrain
- Pricing Bodet/Stramatel/A2Display/TVTools non publics au-delà de quelques références Casalsport
- Pas de test pratique des solutions concurrentes
- Vision 2026-04-23 — à rafraîchir tous les 6 mois
