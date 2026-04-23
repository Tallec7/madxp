# TVTools

> **Pitch en 1 phrase** : Éditeur français d'une plateforme d'affichage dynamique SaaS/On-Premise multi-vertical, dont le module **Scoring** équipe quelques stades L1 (Stade de France, LOSC, OM, Hainaut, Reims) — concurrent crédible côté infrastructures pro mais **absent du segment clubs amateurs**.
>
> **Priorité concurrentielle révisée 2026-04-23** : 🟡 Moyenne (révisé à la baisse depuis 🔴🔴 Haute+).
> **Date de collecte** : 2026-04-23 (deep-dive complet)

## Identité

- **Raison sociale** : TECSOFT SARL (marque commerciale TVTools)
- **Siège** : Metz (57000), 27 rue Rabelais
- **Création société** : TECSOFT immatriculée 25/06/1986 ; marque "TV TOOLS" déposée 13/04/2001 ; communication "depuis 1987"
- **Dirigeant** : Rémy CERF (gérant depuis 2005)
- **Taille équipe** : **4 collaborateurs déclarés sur LinkedIn** (catégorie "11-50"). INSEE 2015 : 10-19 salariés. **Très petite équipe** vs 9 verticaux annoncés
- **Financier** : CA ~1,49 M€ (2015), ~1,86 M€ il y a ~4 ans (Manageo). **Résultat net négatif (-31 k€ en 2015)**. Capital 150 k€. **Autofinancé, pas de levée de fonds connue**
- **Sites** : tvtools.fr (tvtools.eu redirige 301 vers .fr depuis peu)

## Offre — Catalogue

### Plateforme WebAccess

- **Déploiement dual** : SaaS (Cloud Edition, datacenter France) ET On-Premise (vrai dual mode, rare)
- **Architecture** : 100 % web, datacenter français, 100 Mb/s garantis, 150 Go disque évolutif
- **Sécurité** : 2FA, Google Authenticator, **SSO/ADFS, Office 365**, HTTPS, RGPD
- **Multi-tenant / rôles** : "**6 niveaux d'utilisateurs**" (créateur, validateur, superviseur). Workflow d'approbation implicite. ⚠️ **Pas de concepts agency/advertiser/club** comme Neopro — orienté entreprise/collectivité
- **Edge offline** : ✅ "Fonctionnement résilient hors ligne, écrans continuent de diffuser en cas de coupure réseau"
- **API publique / webhooks** : ❌ **Non documentés / non publiés** — intégration data tiers en mode projet sur mesure
- **Hardware player** : mini-PC ou format industriel, Android/Windows, 4G/5G, PoE, plug & play. Compatible aussi écrans system-on-chip. **Hardware-agnostic mais TVTools vend ses propres players** (modèle hybride)
- **Templates** : 250+ templates prêts à l'emploi + widgets dynamiques (météo, news, scores sportifs génériques) + connecteurs vers 200+ types de bases de données

### Module TVTools Scoring (sport stade)

- **Positionnement officiel** : "centralise, synchronise et automatise la communication visuelle, du terrain aux tribunes" — **stade pro / grande enceinte**
- **Sports supportés** : ❌ **non publié** (pas de mention basket/hand/foot/rugby spécifique). Présenté comme **agnostique sport**, branché sur les chronos/scoring officiels via "interopérabilité complète" — **mais aucune liste de standards FIBA/FFBB/Microplex/Bodet/Stramatel publiée**
- **Tableau réglementaire** : ❌ **TVTools n'est pas fabricant de scoreboards homologués** — ils s'**interfacent** avec ceux-ci pour rediffuser les données sur murs LED, totems, écrans secondaires
- **Pilotage temps réel** : non détaillé, **pas de mention d'app mobile pour table de marque**
- **Vidéo (replay/ralenti/stats)** : ❌ **non documenté** — pas de capacité broadcast type EVS/Slomo.tv
- **Sponsoring** : ⚠️ **module positionné "valoriser les sponsors"** mais aucune fonctionnalité publiée sur rotation pondérée, reporting d'impressions, dashboard analytics, multi-annonceur. Probablement diffusion programmée classique (playlist + scheduling)

### 7 solutions produit (multi-vertical)

Roombooking · Légal (collectivités) · Touch (kiosk) · Wall (mur LED) · Menuboard · Wayfinding · **Scoring (stade)**

### 9 verticaux adressés

Entreprise · Industrie/Logistique · Retail · Collectivités · Immobilier · Santé · Restauration · Centres de formation · Tourisme · **Sport stade = 1/9**, **probablement <20 % du CA**

## Pricing

- ❌ **Aucun pricing public sur tvtools.fr** — modèle 100 % devis
- 🔍 **Indice marché public** : "Licence TVTools SaaS renouvellement 3 ans" listée sur Manutan Collectivités (réf. ITG7347382). **Prix non extrait** (page protégée)
- **Modèle implicite** : CapEx hardware (players + écrans) + licence logicielle (perpétuelle on-prem ou abonnement SaaS). Pas de pricing OpEx mensuel transparent

## Références clients sport (logos affichés)

**LOSC (Lille), Olympique de Marseille, Stade de France, Stade de Reims, Stade du Hainaut (Valenciennes)** — le Hainaut est la référence historique (depuis 2011, 120 points de diffusion).

⚠️ **Aucune référence FFR/FFBB/FFF/LFP** au niveau fédéral identifiée.

**Hors sport** : Bouygues, Dell, Orange Cyberdefense, Geodis, collectivités via Manutan.

## Forces

1. **39 ans d'existence**, marque installée, **références prestige** (Stade de France, LOSC, OM)
2. **Vrai dual SaaS/On-Premise** (rassure DSI grandes structures sensibles à la souveraineté)
3. **Catalogue hardware complet** (players, totems, murs LED outdoor IP65 >3000 cd/m²)
4. **250+ templates + 200 connecteurs DB + SSO enterprise** = réponse RFP solide pour grands comptes
5. **6 niveaux utilisateurs, 2FA, RGPD** = conformité enterprise-ready
6. **Multi-vertical** = diversification revenus, moins exposé au churn d'un secteur

## Faiblesses exploitables par Neopro

1. 🔴 **Équipe minuscule (4-19 personnes)** vs ambitions multi-vertical → vélocité produit faible, support probablement saturé
2. 🔴 **Pas de pricing public** → friction commerciale, **exclut le self-service / clubs amateurs**
3. 🔴 **Pas d'API REST / webhooks documentés** → intégration data live (FFBB, FFR, Opta) **custom-only et coûteuse**
4. 🔴 **Pas de régie pub native sophistiquée** : pas de rotation pondérée, pas de reporting impressions/annonceur, pas de portail advertiser → **Neopro a 2-3 ans d'avance fonctionnelle**
5. 🔴 **Pas de portail club self-service** (upload vidéo + déploiement Pi par le club lui-même)
6. **Sport = vertical secondaire (1/9)**, pas de roadmap dédiée visible
7. **Aucun module replay/ralenti/stats avancées**
8. **Marque franco-française**, pas d'expansion EU visible (tvtools.eu redirige .fr)
9. **Hardware player propriétaire** = CapEx élevé, frein vs Neopro Pi <500 €
10. **Pas de templates Remotion / motion design programmable** : 250 templates statiques
11. 🔴 **Croissance organique lente, autofinancée, résultat net négatif récent** → fenêtre de marché ouverte

## Positionnement vs Neopro

| Dimension                 | TVTools                               | Neopro                                        |
| ------------------------- | ------------------------------------- | --------------------------------------------- |
| Cible primaire            | Stade L1 / grande enceinte            | Club amateur → semi-pro                       |
| Modèle                    | SaaS ou On-Premise + hardware proprio | SaaS + Pi edge low CapEx                      |
| Spécialisation sport      | 1 vertical sur 9                      | Cœur de métier 100 %                          |
| Régie pub native          | ❌ Playlist scheduling basique        | ✅ Sponsor weighted rotation, multi-annonceur |
| API REST publique         | ❌                                    | ✅                                            |
| Portail club self-service | ❌                                    | ✅                                            |
| Templates data-driven     | ❌ 250 statiques                      | ✅ Remotion ADR-086                           |
| Edge Pi <500€             | ❌ player proprio                     | ✅                                            |
| Pricing public            | ❌ devis                              | ✅ transparent SaaS                           |
| Références prestige       | ✅ Stade de France, LOSC, OM          | 🟡 À construire                               |
| Vélocité R&D (équipe)     | 🔴 4-19 personnes                     | 🟢 Plus agile                                 |

## Pitch différenciateur Neopro vs TVTools

> **"TVTools est solide pour équiper le Stade de France ou un club de Ligue 1.
> Pour un club amateur ou semi-pro qui veut un portail self-service, une régie pub
> multi-annonceur avec reporting transparent, et une mise en route en 30 minutes
> sans devis ni installateur, Neopro est conçu pour ça — TVTools ne s'adresse pas
> à votre segment."**

## Synthèse stratégique

TVTools verrouille le **haut de pyramide stade L1** mais :

- ❌ N'adresse **pas les clubs amateurs**
- ❌ N'a **pas de régie pub data-driven**
- ❌ N'a **pas de portail self-service multi-tenant**

Neopro doit :

1. **Éviter la confrontation frontale** sur les stades L1 où les références TVTools pèsent
2. **Cibler agressivement** L2/National/clubs amateurs/SaaS = zone blanche TVTools
3. **Sur-investir la régie pub native + analytics sponsors + multi-annonceur** car c'est le différenciateur le plus difficilement rattrapable par TVTools (équipe trop petite pour rebâtir cette stack)

## Risques résiduels

- **Acquisition par un acteur plus gros** (Spectrio, Bodet, ScreenCloud) qui voudrait absorber le portefeuille stade L1
- **Pivot tarifaire low-cost** vers le bas du marché (peu probable vu structure & équipe)

## Sources consultées (2026-04-23)

- [TVTools — accueil](https://www.tvtools.fr) (2026-04-23)
- [TVTools — solutions stade](https://www.tvtools.fr/solutions/affichage-dynamique-stade/) (2026-04-23)
- [TVTools — produits](https://www.tvtools.fr/produits-tvtools/) (2026-04-23)
- [TVTools — à propos logiciel](https://www.tvtools.fr/a-propos/logiciel-affichage-dynamique/) (2026-04-23)
- [TVTools — LinkedIn](https://fr.linkedin.com/company/tvtools) (2026-04-23)
- [Societe.com — TECSOFT 338105018](https://www.societe.com/societe/tecsoft-338105018.html) (2026-04-23)
- [Manageo — TECSOFT](https://www.manageo.fr/entreprises/338105018.html) (2026-04-23)
- [Manutan Collectivités — Licence TVTools SaaS 3 ans (page protégée)](https://www.manutan-collectivites.fr/product/licence-tvtools-saas-renouvellement-3-ans-itg7347382.html) (2026-04-23)

**Données non collectées / à confirmer** : prix exact licence Manutan, liste des sports/standards de chronométrage supportés par Scoring, existence d'une API REST publique, CA 2023-2025, effectif réel actualisé, contrats fédérations.
