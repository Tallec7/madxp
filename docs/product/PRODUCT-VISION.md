# Product Vision — MadXP

> **Version** : 1.0 — Avril 2026
> **Audience** : Investisseurs, partenaires, nouveaux collaborateurs

---

## Our Vision

D'ici 2031, MadXP est le réseau de diffusion sportif amateur de référence en France — chaque gymnase équipé transforme ses écrans en média professionnel générant des revenus passifs pour le club et des impressions mesurables pour ses sponsors.

---

## The Problem We Solve

- **Les clubs amateurs n'ont pas de média professionnel.** Leurs écrans affichent des logos figés pendant 90 minutes, les sponsors ne reçoivent aucune preuve de diffusion, et le churn annuel atteint 30-40% faute de données — soit €6K-9K perdus par an pour un club N2 avec 5 partenaires.

- **Les sponsors locaux n'ont pas accès à l'audience sportive captive.** Il n'existe aucun réseau publicitaire sportif amateur en France. Acheter de la visibilité dans un gymnase passe encore par un appel téléphonique, un virement manuel, et zéro rapport de ROI.

- **Un marché de €6,4M est inexploité.** 13 000 clubs sportifs amateurs en France, 150 annonceurs régionaux potentiels — aucune solution combinant affichage dynamique, analytics et marketplace two-sided n'existe sur ce segment.

---

## Our Solution

MadXP fournit aux clubs sportifs amateurs un boîtier Raspberry Pi branché sur leur TV (installation 10 minutes) couplé à une plateforme cloud. Le club pilote son écran depuis son smartphone pendant le match (score en direct, vidéos joueurs, phases avant/pendant/après), ses sponsors voient leurs spots tourner automatiquement avec analytics en temps réel, et reçoivent un rapport PDF mensuel signé. Côté marché, MadXP agrège les clubs en réseau publicitaire : un annonceur régional signe un seul contrat pour être diffusé dans tous les gymnases partenaires, avec CPM attractif (€8-12 vs €15-25 digital). Le modèle est une two-sided marketplace avec effet réseau vertueux : plus de clubs = audience plus large = CPM plus attractif = plus d'annonceurs = revenus passifs pour les clubs.

---

## North Star Metric

**Heures de contenu diffusées par mois sur la flotte active**

Ce KPI capture simultanément la valeur livrée aux deux côtés du marché : des heures de diffusion élevées signifient des clubs actifs (Pi allumés, matchs joués), une plateforme fiable (uptime), et des spots sponsors vus (valeur annonceurs). Une baisse de la NSM déclenche une investigation cross-domaine — elle est l'indicateur de santé unique de la marketplace.

| Horizon              | Cible NSM       |
| -------------------- | --------------- |
| Fin 2026 (35 clubs)  | > 1 500 h/mois  |
| Fin 2028 (300 clubs) | > 15 000 h/mois |

---

## Why We Win (différenciateurs)

1. **Solution complète match day** — Seul acteur combinant score en direct, vidéos joueurs, rotation sponsors et analytics en une seule plateforme clé-en-main. Les concurrents (solutions DOOH génériques, tableaux d'affichage) n'intègrent aucune couche analytics ni télécommande match.

2. **Premier réseau publicitaire sportif amateur en France** — Marché vierge. Un annonceur régional peut aujourd'hui atteindre 15 000 spectateurs/mois via un seul contrat. Ce levier n'existait pas avant MadXP.

3. **Proof of play SHA-256 certifiée** — Chaque diffusion est horodatée et certifiée. Le sponsor reçoit une preuve irréfutable, pas une estimation. C'est le différenciateur qui réduit le churn de 40% à <20%.

4. **Résilience edge native** — Le Pi fonctionne hors-ligne avec file d'attente locale, watchdog réseau 6 phases, sync bidirectionnel. Un gymnase avec WiFi instable reste opérationnel. Les solutions cloud-only tombent lors des matchs.

5. **Barrière à l'entrée par l'effet réseau** — Chaque club ajouté augmente l'attractivité pour les annonceurs (CPM). Chaque annonceur ajouté réduit le coût net pour les clubs (revenus passifs €1 800/an). Copier la technologie ne suffit pas — il faut reconstruire le réseau.

---

## Target Market

| Segment                                         | Taille France           | Besoins clés                                                  |
| ----------------------------------------------- | ----------------------- | ------------------------------------------------------------- |
| Clubs sportifs N1-N3 (handball, basket, volley) | ~2 000 clubs structurés | Image pro, valorisation sponsors, gestion match simple        |
| Clubs amateurs régionaux (3+ sponsors actifs)   | ~5 000 clubs            | Preuves ROI sponsors, renouvellements sans négociation        |
| Annonceurs régionaux (banques, auto, GMS)       | ~150 cibles France      | Audience captive locale, achat média simplifié, CPM attractif |
| Agences pub régionales                          | ~50 agences             | Gestion multi-clients, reporting consolidé                    |

---

## Business Model Canvas (simplifié)

| Bloc                      | Contenu                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| **Segments clients**      | Clubs sportifs amateurs (N1-N3) · Annonceurs régionaux · Agences pub                            |
| **Proposition de valeur** | TV interactive clé-en-main + analytics sponsors prouvés + réseau publicitaire sportif           |
| **Canaux**                | Bouche-à-oreille sportif · Démos gratuites 30j · Ligues et fédérations · Tournois               |
| **Relations clients**     | Dashboard self-service · Rapports PDF auto · Support chat · Onboarding wizard                   |
| **Sources de revenus**    | Abonnements clubs €50-120/mois · Régie annonceurs €250/mois · Hardware boîtier €350 (€150 coût) |
| **Ressources clés**       | Plateforme cloud (Railway/Supabase) · Flotte Pi · Proof of play SHA-256 · Équipe 2 associés     |
| **Activités clés**        | Développement produit · Onboarding clubs · Vente annonceurs · Support flotte                    |
| **Partenaires clés**      | Hostinger FTP · Railway (API) · Supabase (DB) · Ligues sportives (distribution)                 |
| **Structure de coûts**    | Infrastructure cloud (~€200/mois) · Hardware Pi (€150/boîtier) · 2 associés bootstrap           |

---

## Success in 3 Years

En avril 2029, MadXP équipe 300 clubs sportifs amateurs en France. Chaque week-end de championnat, 15 000 heures de contenu tournent sur nos écrans — scores en direct, vidéos joueurs, spots de 25 annonceurs régionaux. Les clubs membres touchent en moyenne €1 800/an de revenus passifs, leurs sponsors renouvellent à 85% grâce aux rapports PDF automatiques. L'ARR atteint €420K avec deux value streams équilibrées (clubs et régie). Une première levée de €500K est en cours pour accélérer le déploiement en Belgique et en Suisse, marchés identifiés avec des partenaires ligues locaux. L'équipe est passée de 2 à 10 personnes.

---

## Product Principles (comment on prend les décisions)

1. **Edge-first, cloud-second.** Un gymnase doit fonctionner même avec une connexion WiFi défaillante. Toute décision d'architecture priorise la résilience sur le Pi avant la feature cloud.

2. **La preuve prime sur la promesse.** Aucun sponsoring ne se renouvelle sans données. Chaque feature touchant les impressions doit produire une trace certifiable. Si ce n'est pas mesurable, ce n'est pas livré.

3. **Simplicité bénévole.** L'utilisateur final est souvent un bénévole qui gère le match en même temps. Toute interface doit s'utiliser en 1-2 clics. La complexité s'absorbe côté plateforme, pas côté utilisateur.

4. **Les deux côtés du marché grandissent ensemble.** Aucune feature ne doit favoriser clubs ou annonceurs en isolement. Chaque amélioration doit augmenter la valeur perçue des deux côtés simultanément ou au moins ne pas dégrader l'autre.

5. **Scalabilité opérationnelle d'abord.** Au-delà de 15 clubs, l'onboarding SSH manuel est un bloquant. Chaque nouvelle capacité doit être automatable et ne pas nécessiter d'intervention humaine pour fonctionner.

6. **Données clients isolées, jamais mutualisées.** Multi-tenant avec isolation RLS PostgreSQL. Un bug de sécurité exposant les données d'un club à un autre est un incident critique niveau P0.

7. **Décider sur les métriques, pas les opinions.** La NSM (heures diffusées/mois) est l'arbitre final des priorisations produit. Si une feature n'augmente pas la NSM à 90 jours, elle passe après.
