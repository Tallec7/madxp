# Session 2 — Concurrents secondaires

> **Date de collecte** : 2026-04-23
> **Périmètre** : sport-spécialistes (B), SaaS généralistes (C), open-source (E)
> **Méthode** : WebFetch sur sites officiels (pricing pages prioritaires) + Singular.live, Yodeck, ScreenCloud, OptiSigns directement sourcés ; sources non publiées explicitement signalées.

---

## Segment B — Sport spécialistes

### DigitalSport.fr

- **Identité réelle** : marque de **WEB Stratégies** (agence de communication digitale, Bordeaux + Paris)
- **Modèle** : **agence de service**, pas une plateforme produit
- **Offre** : développement web Drupal/WordPress/PrestaShop, community management, e-commerce
- **Références sport** : Paris FC, Team Cofidis, Voile Banque Populaire, Esprit Basket
- ⚠️ **Verdict** : **PAS UN CONCURRENT DE NEOPRO** — c'est une agence web qui fait des sites pour des entités sportives, pas une solution d'affichage TV. À retirer du benchmark.
- Source : [digitalsport.fr](https://www.digitalsport.fr/) (2026-04-23)

### Bizplay (NL)

- **Identité** : société néerlandaise (Utrecht), KvK 77757289
- **Modèle** : SaaS digital signage généraliste, hardware-agnostic, "no installation required"
- **Verticaux** : santé, bureaux, bibliothèques, éducation, restaurants, hôtels, **sports clubs & gyms** (1 vertical sur 9), industrie, retail
- **Présence** : "customers in over 80 countries", milliers d'écrans
- **Capacités sport** : très limité — "track scores and celebrate wins", entertainment, cross-sales. **Pas de feature sport spécifique** (pas de chronométrage, pas d'intégration fédérale, pas de régie pub multi-tenant)
- **Catalogue** : 20+ apps (Facebook, Instagram, LinkedIn, YouTube, TikTok, météo, maps, RSS, calendars, QR, PowerBI)
- **Multi-tenant / sponsoring / mobile** : non détaillé sur la home
- **Pricing** : non public en home (page pricing référencée mais non extraite)
- **Verdict** : 🟢 menace faible — **généraliste qui mentionne le sport sans l'adresser sérieusement**. Pas de différenciateur fonctionnel pour un club sportif vs MadXP.
- Source : [bizplay.com](https://www.bizplay.com) (2026-04-23)

### SportMember (DK/EU) — surprise positive

- **Identité** : leader EU de la **gestion de club sportif** (DK origin, déployé FR)
- **Volume** : **44 720 clubs · 270 131 équipes · 2,4 millions de membres**
- **Cible** : administrateurs club, trésoriers, coachs, membres, parents
- **Sports** : 50+ disciplines (rugby, tennis, cyclisme, foot, danse…)
- **Features** : gestion membres, calendrier, encaissement cotisations, chat interne, réservations, website builder, billetterie, compositions tactiques, comptes-rendus de match, stats
- ⚠️ **Module "écran dynamique"** : mentionné comme module disponible pour communication membres — **MAIS pas un concurrent affichage TV au sens MadXP** (pas de régie pub, pas de templates Remotion, pas de pilotage match)
- **Pricing** : Basic gratuit · **Pro €0.18/membre/mois (min €22/mois)** · add-ons (Website €25, Widgets €10, Compta €12)
- **Mobile** : iOS + Android natif
- **Verdict** : 🟡 **complémentaire plutôt que concurrent** — un club peut utiliser MadXP pour la TV + SportMember pour la gestion. **Opportunité partenariat** (intégration calendrier SportMember → écran MadXP). À explorer commercialement.
- Source : [sportmember.fr](https://www.sportmember.fr) (2026-04-23)

### ClubTV (FR) / FanCloud

- **ClubTV.fr** : URL renvoie ECONNREFUSED — **probablement abandonné ou pivoté**, à vérifier manuellement
- **FanCloud (.live)** : URL non résolue — pas de présence stable identifiée
- **Verdict** : 🟢 menace nulle à date — pas d'acteurs vivants identifiables sur ces marques

### Synthèse Segment B

- **Aucun concurrent FR/EU sport-spécialiste ne fait mieux que MadXP sur le multi-tenant + régie pub native + edge offline**
- **SportMember = opportunité partenariat** (gestion club + MadXP affichage TV = stack complète club)
- **Bizplay = signal faible** : généraliste avec vertical sport mou
- **Digital Sport** à retirer du benchmark (agence, pas concurrent)

---

## Segment C — SaaS généralistes

### Yodeck (GR) — concurrent architectural le plus proche

- **Identité** : société grecque, filiale de Flipnode
- **Modèle** : SaaS multi-tenant + **hardware Pi bundlé gratuitement** (Pi 4 1GB en Basic annuel, Pi 4 4GB en Premium/Enterprise)
- **Pricing 2026** :
  - Free : 1 écran, basic
  - Basic : **€8/écran/mois** (€96/an)
  - Premium : **€11/écran/mois** (€132/an)
  - Enterprise : **€15/écran/mois** (€180/an)
  - Enterprise+ : custom
- **Free trial** : 30 jours full feature, jusqu'à 5 écrans
- **Capacité flotte** : "tens of thousands of monitors under a single account"
- **Multi-tenant** : **Workspaces + Custom User Roles disponibles uniquement en Enterprise** (€15/écran/mois)
- **API** : disponible Premium+
- **Apps** : 80+ (Power BI, Teams, Grafana, Tableau, SharePoint…)
- **Sport** : ❌ **aucune feature sport spécifique**
- **Verdict** : 🔴 **architecture la plus proche de MadXP** (Pi + SaaS). Différenciation MadXP = **verticalisation club sportif + régie pub native sponsor weighted rotation + mode SaaS pur ADR-037 + portail club self-service + templates Remotion data-driven**. Yodeck est généraliste, ne fait ni régie pub ni sport.
- Source : [yodeck.com/pricing](https://www.yodeck.com/pricing/) (2026-04-23)

### ScreenCloud (UK) — leader EU SaaS

- **Pricing 2026** :
  - Core : **$20/écran/mois + VAT**
  - Pro : **$30/écran/mois + VAT**
  - Enterprise : custom
- **Hardware** : agnostic (Chromebox, FireTV, leur propre boîtier). **Pas de Pi natif**
- **Apps** : 100+ Core, "Premium apps" en Pro
- **Multi-tenant / agency** : non détaillé sur pricing page
- **API** : non mentionnée sur pricing page
- **Sport** : ❌ aucune feature sport
- **Verdict** : 🟡 leader EU mais hardware-agnostic enterprise-oriented. **Pas de menace directe sur le segment club sportif** mais **étalon de référence UX & app catalog** (100+ apps = table-stake 2026).
- Source : [screencloud.com/pricing](https://screencloud.com/pricing) (2026-04-23)

### OptiSigns (US) — pricing agressif

- **Pricing 2026** :
  - Free : 3 écrans, 25 basic apps
  - Standard : **$9-10/écran/mois**
  - Pro : **$11.25-12.50/écran/mois**
  - Pro Plus : **$13.50-15/écran/mois**
  - Engage : **$27-30/écran/mois**
  - Enterprise : **$40.50-45/écran/mois** (25 écrans min)
- **Hardware** : OptiSigns Devices, Windows, Linux, Raspberry Pi
- **Multi-tenant** : Separate Team Workspaces, custom roles, folder security
- **API** : **GraphQL en Enterprise**, OptiSync API-to-Screen en Pro Plus+
- **Apps** : 25 Free / **100+ payant**
- **Sport** : ❌
- **Verdict** : 🟡 **acteur le plus pricing-agressif du segment**. Free 3 écrans = vraie pression sur l'entrée de gamme. Mais pas de spécialisation sport. Référence prix bas pour le pitch MadXP.
- Source : [optisigns.com/pricing](https://www.optisigns.com/pricing) (2026-04-23)

### Synthèse Segment C

- **Pricing benchmark SaaS généraliste 2026** : entrée de gamme **$9-20/écran/mois**, premium **$15-30/écran/mois**, enterprise **$40-45/écran/mois**
- **Catalogue 100+ apps = table-stake** (Yodeck 80+, ScreenCloud 100+, OptiSigns 100+)
- **Multi-tenant Workspaces = barrière haute payante** (Enterprise tier chez tous)
- **API publique = Premium+/Enterprise** (Yodeck Premium, OptiSigns Enterprise GraphQL)
- **Aucun n'a de spécialisation sport** → angle de marché ouvert pour MadXP

---

## Segment E — Open-source

### Xibo (UK) — référence open-source

- **Modèle** : dual-license (open-source AGPLv3 + Xibo Cloud commercial)
- **Players supportés** : Windows (open-source AGPLv3), Android, Linux, Tizen, webOS, ChromeOS, **pas de Pi natif officiel**
- **Self-hosted** : utilisateur gère web server, DB, backups, maintenance (TCO caché élevé)
- **Cloud** : 14 jours trial, 2 players, helpdesk best-effort
- **Pricing exact 2026** : ❌ non extrait via WebFetch — à vérifier manuellement sur xibosignage.com/pricing
- **Maturité** : >15 ans, CMS très complet
- **Sport** : ❌
- **Verdict** : 🟡 **TCO réel élevé pour un club** (compétences sysadmin requises pour self-hosted). Cloud commercial = pricing comparable aux SaaS. Pas de différenciateur sport. **Pas une vraie alternative low-cost pour un club amateur**.
- Source : [xibosignage.com/pricing](https://xibosignage.com/pricing) (2026-04-23)

### Anthias (ex-Screenly OSE, UK)

- **Modèle** : 100 % gratuit, open-source, GitHub
- **Hardware** : **Pi 1 → Pi 5** + 64-bit x86 (futur)
- **Capacités** : images, web pages, vidéo 1080p, **single-screen / individual management**
- **Multi-tenant / cloud / multi-screen** : ❌ **absent** — l'éditeur Screenly recommande explicitement sa version commerciale pour cela
- **Maintenance** : projet actif maintenu par Screenly Inc.
- **Pricing** : gratuit
- **Sport** : ❌
- **Verdict** : 🟢 **menace faible** sur le segment cible MadXP. Anthias = solution mono-écran ultra-minimaliste. **Aucun club ne peut bricoler une régie pub multi-tenant + reporting sponsors avec Anthias**. Ne couvre pas le besoin.
- Source : [anthias.screenly.io](https://anthias.screenly.io) (2026-04-23)

### Synthèse Segment E

- **Open-source = TCO caché élevé** : Xibo demande compétences sysadmin (web server, DB, backups), Anthias est mono-écran
- **Aucune alternative open-source crédible** ne reproduit la pile multi-tenant + régie pub MadXP
- **Argument pour MadXP** : "le coût caché de l'open-source = un bénévole technique compétent + risque de panne en match sans support"

---

## Segment D bis — Singular.live (UX templates benchmark)

### Singular.live (UK) — benchmark UX du Template Studio v2

- **Cible** : "federations, clubs, broadcasters" (sports, esports, news, betting, corporate)
- **Modèle** : SaaS broadcast graphics overlays (live TV, scoreboards, lower-thirds)
- **Pricing 2026** :
  - Free : $0, 1 user, **output watermarké**
  - Professional : **$150/mois** (3 users, 1 output) ou $1500/an
  - Enterprise : **$350+/mois** (3+ users, 2+ outputs) ou $3500/an
  - Event-based : 3/7/30 jours ($250-$750)
- **API** : REST avec rate limits (Free 5k calls, Pro 20k, Enterprise 100k+)
- **Composer (template editor)** : version control, **HTML/JavaScript scripting**, Script Buddy AI assistant
- **Verdict** : 🟢 **pas un concurrent direct** (broadcasters, pas affichage hall club) MAIS **inspiration UX majeure** pour Template Studio v2 :
  - **Composer = data-driven editor avec scripting HTML/JS** → modèle pour évolution Template Studio v2
  - **AI Script Buddy** → opportunité d'intégrer un assistant IA pour création template
  - **REST API rate-limited par tier** → modèle économique pour API publique MadXP
  - **Tarification événementielle (3/7/30j)** → modèle pour clubs qui n'organisent que quelques matchs/an
- Source : [singular.live/pricing](https://www.singular.live/pricing) (2026-04-23)

---

## Synthèse transverse Session 2

### Features "table-stakes" 2026 chez les SaaS signage

1. **100+ apps catalog** (Yodeck 80, ScreenCloud 100, OptiSigns 100+)
2. **Free trial 14-30 jours** sans CB (Yodeck, OptiSigns, Xibo)
3. **Multi-tenant Workspaces** (mais réservé Enterprise tier)
4. **API REST/GraphQL** (Premium+/Enterprise)
5. **Hardware Pi bundlé gratuit** (Yodeck en annuel — référence à matcher si MadXP veut concurrencer)
6. **Pricing transparent en ligne** (tous sauf TVTools, Bodet, Stramatel, A2Display, ClubTV)

### Lacunes MadXP à corriger en priorité (vs SaaS généralistes)

1. ❌ **Catalogue apps faible** vs 80-100+ chez Yodeck/ScreenCloud/OptiSigns → roadmap apps marketplace
2. ❌ **Free tier non publié** (Yodeck a 1 écran free permanent, OptiSigns 3 écrans free)
3. ❌ **Multi-tenant Workspaces** : MadXP a la techno, mais doit le packager comme tier différencié

### Opportunités MadXP confirmées

1. ✅ **Aucun concurrent SaaS généraliste n'a de spécialisation sport** → angle de marché ouvert
2. ✅ **Régie pub native + reporting sponsors = différenciateur unique** (aucun SaaS généraliste ne le fait)
3. ✅ **Verticalisation club sportif** = défensable car niche pour les généralistes
4. ✅ **Partenariat SportMember** (44k clubs DB) = opportunité de canal massive
5. ✅ **Inspiration Singular.live** : Composer + AI Script Buddy + tarification événementielle = pistes Template Studio v3

### Acteurs à creuser en priorité Session 3+ (futur)

- **Yodeck** : architecture la plus proche, surveillance churn et features sport éventuelles
- **SportMember** : approche partenariat commercial (intégration calendrier ↔ MadXP)
- **Singular.live** : pas un concurrent mais inspiration produit pour Template Studio v3

### Acteurs à retirer du benchmark

- **DigitalSport.fr** (agence web, pas plateforme)
- **ClubTV.fr** (URL morte)
- **FanCloud** (pas trouvé)
