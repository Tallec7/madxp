# Session 3 — SWOT, Pricing benchmark & Recommandations

> **Date de synthèse** : 2026-04-23
> **Sources** : `BENCHMARK-COMPETITORS.md`, `competitors/bodet-sport.md`, `competitors/stramatel.md`, `competitors/tvtools.md`, `competitors/obs-studio.md`, `competitors/session-2-secondaires.md`
> **Périmètre** : 25+ concurrents identifiés, 12 analysés en profondeur, 5 segments couverts.

---

## 1. SWOT MadXP consolidé

### 🟢 Forces (différenciateurs confirmés vs marché)

| #   | Force                                                                                                          | Preuve concurrentielle                                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | **Régie pub multi-tenant native** (advertiser/agency/club + sponsor weighted rotation + reporting impressions) | Aucun concurrent analysé n'offre la stack complète. Bodet=playlist statique. TVTools=playlist scheduling. Yodeck/ScreenCloud=apps génériques sans logique sponsoring sport. |
| F2  | **Architecture hybride Pi edge + SaaS pur** (ADR-037)                                                          | Yodeck = Pi only. ScreenCloud = cloud only. Bodet = LED hardware only. MadXP = seul à offrir les 2 modes.                                                                   |
| F3  | **Template Studio v2 data-driven** (Remotion, ADR-086, layers + safe-zones + animations réversibles)           | Singular.live = équivalent broadcast mais €€ et hors sport amateur. Bodet/Stramatel = templates statiques.                                                                  |
| F4  | **Portail club self-service multi-tenant** (ADR-082 Video Club Grants)                                         | Aucun concurrent : tous orientés admin central → club consommateur passif.                                                                                                  |
| F5  | **Edge offline résilient + Pi <500€**                                                                          | Bodet=15-30k€, TVTools=hardware proprio CapEx élevé. Yodeck Pi seul équivalent technique mais sans verticalisation sport.                                                   |
| F6  | **Spécialisation sport 100%**                                                                                  | Aucun généraliste (ScreenCloud, Yodeck, OptiSigns, Xibo, TVTools) n'a de catalogue d'apps sport.                                                                            |
| F7  | **Pricing public transparent**                                                                                 | Bodet/Stramatel/TVTools = devis only → friction commerciale.                                                                                                                |

### 🔴 Faiblesses (lacunes confirmées par benchmark)

| #   | Faiblesse                                                                                                          | Concurrent qui le fait                                     |
| --- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| W1  | **Pas d'animations automatiques sur action de jeu** (but, pénalité, 3-points, temps fort)                          | ✅ Bodet VIDEOSPORT                                        |
| W2  | **Pas de sync social media** (Twitter/RSS avec hashtag + modération)                                               | ✅ Bodet VIDEOSPORT (modérateur intégré)                   |
| W3  | **Catalogue d'apps faible** vs 80-100 chez ScreenCloud/Yodeck (météo, news, finance, transports, RSS, calendriers) | ScreenCloud, Yodeck, OptiSigns                             |
| W4  | **Pas de free tier publié** (1-3 écrans gratuit pour acquisition virale)                                           | Yodeck (free 1 screen), Xibo (open-source)                 |
| W5  | **Pas de références prestige fédéral** (FFR/FFBB/FFF/LFP)                                                          | Bodet (FFBB officiel), TVTools (Stade de France, LOSC, OM) |
| W6  | **Pas de capacité broadcast vidéo native** (replay, ralenti, stats avancées)                                       | EVS, Slomo.tv, vMix (segments adjacents)                   |
| W7  | **Pas d'AI Script Buddy / assistant IA template**                                                                  | Singular.live                                              |

### 🟡 Opportunités (zones blanches marché)

| #   | Opportunité                                                                                                                         | Justification benchmark                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| O1  | **Segment club amateur / L2 / National** = zone blanche TVTools (cible L1), Bodet (CapEx prohibitif), Stramatel (chronométrage pro) | TVTools déclare ne pas adresser ce segment. Bodet ticket 15-30k€ exclut amateurs.                      |
| O2  | **Régie pub data-driven + portail advertiser self-service** = 2-3 ans d'avance fonctionnelle                                        | Aucun concurrent n'a entamé ce chantier. Équipes trop petites (TVTools 4-19) pour rebâtir cette stack. |
| O3  | **Partenariat SportMember** (44k clubs, 270k équipes, €0.18/membre/mois) → cross-sell affichage TV club                             | Identifié session 2. SportMember = gestion club sans hardware affichage.                               |
| O4  | **Dashboard cloud absent chez Bodet/Stramatel** : VIDEOMEDIA = reporting Excel                                                      | Confirmé PDF officiels Bodet 2026. Lacune structurelle.                                                |
| O5  | **Marketplace de templates sport** ouverte aux designers (UGC modéré)                                                               | Inspiration Singular.live + Remotion. Rien d'équivalent côté sport.                                    |
| O6  | **Multi-tenant Workspaces packaging** (cf. agencies ScreenCloud) → cible agences sponsoring sportif                                 | Pricing tier "Agency" séparé non exploité.                                                             |

### 🔴 Menaces (révisées post-Session 2)

| #   | Menace                                                                                                             | Probabilité × Impact                                  |
| --- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| T1  | **Bodet pivote vers cloud SaaS + régie pub** (force commerciale fédérale énorme)                                   | Moyen × Élevé                                         |
| T2  | **OBS + plugin sport communautaire** comble le gap "good enough gratuit"                                           | Moyen × Moyen                                         |
| T3  | **Acquisition TVTools / Stramatel par acteur global** (Spectrio, Bodet, ScreenCloud) → consolidation hardware+SaaS | Faible × Élevé                                        |
| T4  | **Yodeck lance un vertical sport** (architecture déjà compatible : Pi + SaaS + apps)                               | Faible × Élevé                                        |
| T5  | ~~TVTools attaque le segment amateur~~                                                                             | **Retiré** — équipe 4-19, autofinancée, R-net négatif |

---

## 2. Pricing benchmark consolidé

| Acteur               | Modèle                       | Prix entry-level       | Prix moyen €/écran/mois   | Public/Devis   |
| -------------------- | ---------------------------- | ---------------------- | ------------------------- | -------------- |
| **Bodet Sport**      | CapEx hardware + maintenance | 15 000 € (LED basique) | 30-50k€ TCO 5 ans         | 🔴 Devis       |
| **Stramatel**        | CapEx hardware + maintenance | ~15 000 €              | Similaire Bodet           | 🔴 Devis       |
| **TVTools**          | SaaS ou On-Prem + hardware   | non publié             | non publié                | 🔴 Devis       |
| **A2Display**        | CapEx LED + intégration      | non collecté           | —                         | 🔴 Devis       |
| **Yodeck**           | SaaS + Pi bundle             | **0 €** (1 écran free) | **8-15 €/mois**           | 🟢 Public      |
| **ScreenCloud**      | SaaS pur                     | $20/écran/mois         | **20-30 $/mois**          | 🟢 Public      |
| **OptiSigns**        | SaaS pur                     | $9/écran/mois          | **9-45 $/mois**           | 🟢 Public      |
| **Xibo CMS**         | Dual-license                 | 0 € (self-host)        | varie cloud               | 🟡 Hybride     |
| **Anthias**          | Open-source Pi               | 0 €                    | 0 €                       | 🟢 Gratuit     |
| **OBS Studio**       | Open-source                  | 0 €                    | 4-6k€ TCO caché bénévolat | 🟢 Gratuit     |
| **SportMember**      | SaaS membres                 | freemium               | 0,18 €/membre/mois        | 🟢 Public      |
| **Singular.live**    | SaaS broadcast               | freemium               | 99-999 $/mois             | 🟢 Public      |
| **MadXP** _(actuel)_ | SaaS + Pi                    | À cadrer               | À cadrer                  | 🟢 Public visé |

### Recommandation pricing MadXP

- **Entry / Club amateur** : **15-25 €/écran/mois** (positionnement entre Yodeck et ScreenCloud, premium justifié par spec sport + régie pub)
- **Free tier** : **1 écran SaaS gratuit** (acquisition virale type Yodeck) — non disponible pour Pi
- **Pro / L2-National** : **40-60 €/écran/mois** + Pi inclus en location
- **Agency** : tier dédié avec multi-workspace + reporting consolidé
- **Enterprise / Stade L1** : devis (concurrence frontale TVTools/Bodet à éviter)

---

## 3. Roadmap produit — 5 recommandations prioritaires

### R1 — Animations automatiques sur action de jeu 🔴 P0

**Lacune confirmée** vs Bodet VIDEOSPORT.

- Trigger automatique : but, pénalité, 3-points, temps fort, faute
- Templates Remotion data-driven (cf. ADR-086, layers + animations réversibles)
- Hook depuis chronométrage / table de marque (intégration Microplex/Bodet/Stramatel via API ou serial)
- **Effort** : 2-3 sprints. **Impact** : ferme la principale lacune face à Bodet, démontre spécialisation sport.

### R2 — Sync social media + modération 🔴 P0

**Lacune confirmée** vs Bodet VIDEOSPORT.

- Connecteur X/Twitter, Instagram, RSS
- Filtrage par hashtag ou compte prédéfini
- Modérateur intégré (whitelist mots, blacklist users, validation manuelle)
- **Effort** : 1-2 sprints. **Impact** : parité fonctionnelle Bodet sur fanzone.

### R3 — Catalogue d'apps sport (50+ apps cible) 🟡 P1

**Lacune** vs ScreenCloud/Yodeck (80-100 apps généralistes).

- Calendrier fédéral (FFBB, FFR, FFF, FFHB)
- Classements live (intégration Opta, Sportradar)
- Météo terrain, qualité air, alertes
- RSS clubs, pages Facebook, YouTube channel
- Templates événementiels (anniversaires, recrutement bénévoles)
- **Effort** : 3-4 sprints continu. **Impact** : feature parity table-stakes 2026.

### R4 — Free tier SaaS 1 écran 🟡 P1

**Lacune** vs Yodeck/Xibo. Acquisition virale.

- 1 écran SaaS gratuit, watermark MadXP discret
- Limites : 5 vidéos, 1 sponsor, 0 multi-tenant
- Conversion path clair vers payant à 15 €/mois
- **Effort** : 1 sprint pricing + dashboard. **Impact** : top of funnel 10x.

### R5 — AI Template Assistant + Marketplace 🟢 P2

**Inspiration** Singular.live AI Script Buddy.

- Assistant IA : "génère un template but avec couleurs club X" → Remotion JSON
- Marketplace UGC : designers proposent templates, modération admin, revenue share
- **Effort** : 4-6 sprints. **Impact** : moat long terme + UGC viral.

---

## 4. Stratégie commerciale — 3 recommandations

### S1 — Cible primaire : Club amateur N3/N2/Régional/Départemental

**Pitch** :

> "La seule plateforme TV sport conçue pour le club amateur : 30 minutes pour démarrer, sponsoring multi-annonceur avec reporting transparent, sans devis ni installateur. À partir de 15 €/mois."

- **Pricing** : 15-25 €/écran/mois SaaS, Pi 199 € one-shot OU location 10 €/mois
- **Channel** : self-service web + partenariat fédérations régionales + influenceurs club (dirigeants Linkedin)
- **Concurrents écartés** : Bodet (CapEx prohibitif), TVTools (ne cible pas ce segment), OBS (TCO bénévolat caché)

### S2 — Cible secondaire : Agence sponsoring sportif

**Pitch** :

> "Pilotez 50 clubs depuis un seul dashboard. Multi-workspace, reporting consolidé pour vos annonceurs, rotation pondérée native. La régie pub sport en marque blanche."

- **Pricing** : tier Agency à partir de 250 €/mois (10 clubs inclus) + 15 €/club additionnel
- **Channel** : direct (Sport Stratégies, salons, prospection LinkedIn agences)
- **Concurrents écartés** : aucun n'offre cette stack multi-tenant + sport

### S3 — Partenariat distribution : SportMember (FR/EU)

**Pitch interne SportMember** :

> "Vos 44k clubs gèrent leurs membres avec vous. Offrez-leur l'affichage TV de la buvette en cross-sell — vous gardez le membership, on gère la TV. Revenue share 20%."

- **Modèle** : intégration login OAuth + bundle "SportMember + MadXP TV" à 25 €/mois
- **Bénéfice** : accès distribution massif sans CAC commercial
- **Risque** : dilution marque, dépendance partenaire — à cadrer juridiquement

---

## 5. Top 3 menaces × Top 3 opportunités (executive summary)

### Top 3 menaces

1. 🔴 **Bodet pivote SaaS** (probabilité moyenne, impact élevé) → moat fédéral à construire vite
2. 🟡 **OBS + plugin sport** (good enough gratuit) → calculateur TCO + études de cas conversion
3. 🟡 **Yodeck lance vertical sport** (architecture compatible) → vitesse d'exécution = défense

### Top 3 opportunités

1. 🟢 **Zone blanche club amateur** : Bodet trop cher, TVTools ne cible pas, OBS bricolage → MadXP seul positionné
2. 🟢 **Régie pub multi-tenant** : 2-3 ans d'avance, lacune structurelle équipes concurrentes trop petites
3. 🟢 **Partenariat SportMember** : 44k clubs accessibles via cross-sell, CAC quasi-nul

---

## 6. Plan d'action 90 jours

| Semaine | Action                                                                | Owner suggéré        |
| ------- | --------------------------------------------------------------------- | -------------------- |
| S1-S2   | Décision Go/No-Go free tier 1 écran (R4)                              | Produit + commercial |
| S2-S4   | Spec animations actions de jeu (R1)                                   | Produit + Remotion   |
| S3-S6   | Spec sync social media + modération (R2)                              | Produit              |
| S4-S8   | Build & launch free tier (R4)                                         | Tech + marketing     |
| S5-S10  | Build animations actions de jeu (R1)                                  | Tech                 |
| S6      | Premier contact SportMember (S3)                                      | CEO / Bizdev         |
| S8      | Calculateur TCO "OBS vs MadXP" sur site (anti-T2)                     | Marketing            |
| S10-S12 | Pricing tier Agency (S2) live                                         | Produit + commercial |
| S12     | Bilan : KPI free tier conversion, pipeline Agency, retour SportMember | Direction            |

---

## 7. Risques résiduels & questions ouvertes

- **Pricing Bodet/Stramatel/TVTools/A2Display** : non publics, à confirmer via devis prospect ou benchmark fédération
- **Effectif réel TVTools/Stramatel** : LinkedIn pas toujours à jour
- **API VIDEOMEDIA Bodet** : reporting Excel confirmé mais existe-t-il une intégration BI cachée ?
- **Plugins OBS sport** : veille trimestrielle à mettre en place
- **A2Display deep-dive** : non disponible (utilisateur n'a rien trouvé), à reprendre si rencontré sur le terrain

---

## Sources transverses

- `BENCHMARK-COMPETITORS.md` — vue d'ensemble 25+ acteurs
- `competitors/bodet-sport.md` — fiche détaillée + PDF officiels 2026
- `competitors/stramatel.md` — confirmations chatbot officiel 2026
- `competitors/tvtools.md` — deep-dive 2026-04-23
- `competitors/obs-studio.md` — analyse "concurrent gratuit"
- `competitors/session-2-secondaires.md` — Yodeck/ScreenCloud/OptiSigns/Xibo/Anthias/Singular.live/SportMember
