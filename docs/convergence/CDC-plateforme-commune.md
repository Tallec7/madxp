# CDC — Plateforme commune (Retail × Sport)

> **Statut** : v0.2 — kit de préparation de la séance de convergence (Daisy × lead dev retail). **Mis à jour après audit code (15 domaines).**
>
> ⚡ **Faits code-verified à connaître avant de lire** (détails : [findings 1-3](MADXP-code-verified-findings.md), plan : [RECETTE-extension-retail.md](RECETTE-extension-retail.md)) :
>
> - 🟢 **Le retail ≈ 80% extension + 20% chantiers transverses.** Le backend ET le frontend MadXP sont massivement réutilisables.
> - 🟢 Le « port player » existe (**Delivery Strategy Registry**, ADR-069) ; **SaaS est déjà le modèle retail** ; dashboard/realtime/lecture sont vertical-agnostiques.
> - 🔴 **Le sport est cloud-wins aujourd'hui** ; l'ownership edge (ADR-120 push-back) est **non codé**. L'autonomie offline de _diffusion_ est réelle.
> - ⚠️ **6 chantiers transverses** (ni sport ni retail ne les a) = le vrai sujet d'archi : push-back, hiérarchie tenant, config par écran, supervision agnostique, audience+CDN, auth kiosk.
>   **Objet** : poser le **vertical sport** sur la table, **cadrer le noyau commun**, préparer l'**arbitrage stack**, et **structurer l'interview du lead dev retail**.
>   **Audience** : les deux lead devs (séance de conception commune), puis l'équipe d'implémentation.
>   **Tags** : `[C]` commun · `[R]` retail · `[S]` sport. **MoSCoW** : M/S/C/W.
>   **Confiance** : ✅ vérifié (lu dans le code/ADR sport) · ⚠️ hypothèse à valider · ❌ inconnu (question ouverte).
>   **Règle d'or** : aucune spec retail inventée. Tout `[R]` non vérifié est une **question** ou une **hypothèse ⚠️** balisée.

---

## Cadre verrouillé (relevé de décisions, Phase 1)

| #   | Sujet                | Décision                                                                                                                                                                                              | Conf.           |
| --- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| C1  | Casting              | **Retail** = plateforme mature en prod (autre lead dev). **Sport** (MadXP, codebase actuel) = mature, **re-câblé** sur le socle commun (le code actuel = référence + base à adapter, pas réécriture). | ✅              |
| C2  | Nature de l'exercice | Pas une fusion de codebases. C'est le **kit de prep** de Daisy pour la séance de conception commune.                                                                                                  | ✅              |
| C3  | Job du doc           | (a) Poser le sport, lisible sans le code · (b) cadrer le noyau commun + positionnement · (c) préparer l'arbitrage stack.                                                                              | ✅              |
| C4  | Vérité retail        | **Personne ne la connaît encore** → zéro spec retail inventée. La colonne retail = grille d'interview.                                                                                                | ✅              |
| C5  | Branding             | **Une marque unique neuve** ; retail + sport = 2 déclinaisons. (nom = question ouverte §14)                                                                                                           | ✅              |
| C6  | Horizon              | **3 mois, propre.**                                                                                                                                                                                   | ✅              |
| C7  | Moteurs              | Régie média→sport · Edge autonome→retail · Plateforme unique · Mutualiser la tech.                                                                                                                    | ✅              |
| C8  | « Sport prêt »       | Le vertical sport est un livrable **complet de 1ʳᵉ classe**. Tenable à 3 mois **uniquement** en re-câblage (adaptateurs), pas réécriture.                                                             | ⚠️ reco assumée |

---

# PARTIE I — ANALYSE DE CONVERGENCE

## I.1 Matrice de capacités (Retail × Sport)

Verdict : **🟰 commun identique** · **⚙️ commun à paramétrer** · **🔱 spécifique vertical** · **➖ absent d'un côté**.
Sport : ✅ lu dans le code. Retail : ❌ inconnu → reformulé en **question** (= grille §I.5).

| #   | Capacité                        | SPORT (✅ codebase)                                                                                                     | RETAIL (❌ → question)                                                       | Verdict                           |
| --- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------- |
| 1   | Gestion de contenu (médias)     | Upload cloud → déploiement Pi _ou_ service direct URL FTP (SaaS). Stockage FTP Hostinger unifié (`storage.service.ts`). | Où vivent les médias ? CDN ? formats/poids ? versioning campagne ?           | ⚙️                                |
| 2   | Planification temporelle        | `cron-scheduler` + `recurring_schedules`, profils par site, auto-close match. Pas de « campagne datée ».                | Campagnes datées (début/fin) ? dayparting ? priorités ? conflits de slots ?  | ⚙️ (retail + riche)               |
| 3   | Ciblage                         | Par site + profil + catégorie + `timeCategories`. Granularité = club.                                                   | Magasin/zone/rayon/heure/trafic ? audience cible ?                           | ⚙️ (retail + fin)                 |
| 4   | Flotte & edge (players)         | Pi edge par site, `sync-agent` write-through (ADR-114), `command-queue` (`sendOrQueue`/`pending_commands`), OTA+canary. | Y a-t-il un edge ? players ? parc homogène ? (« on s'en fiche » → confirmer) | 🔱 sport                          |
| 5   | Autonomie hors-ligne            | **Non négociable** : Pi autonome entre 2 reconnexions. Vérité **locale** pour `site_type=pi`.                           | Offline toléré ? ou toujours connecté (vérité cloud) ?                       | 🔱 sport                          |
| 6   | Rendu écran / multi-display     | Kiosk Chromium, HDMI multi-sortie, `sites.displays` JSONB (N-display PROP-001/002), contraintes GPU Pi5.                | 1 écran ou murs/zones ? orientation ? résolutions ? sync inter-écrans ?      | ⚙️                                |
| 7   | Régie publicitaire / inventaire | **Sponsors locaux** (club) + dual advertiser/agency (ADR-035). **Pas** de vente d'inventaire à des marques tierces.     | **Cœur retail** — unité d'inventaire ? booking ? SoV ? prix ? (grille)       | 🔱 retail → à importer côté sport |
| 8   | Mesure d'audience / analytics   | `video_plays` (compteur diffusions), stats sponsors, match sessions. Mesure = diffusions, pas humains.                  | Comptage trafic ? capteurs ? impressions estimées ? preuve contractuelle ?   | 🔱 (sources ≠)                    |
| 9   | Interactivité temps réel        | Scoreboard live (HTTP consoles Bodet/Stramatel), télécommande staff, `socket-service`, match sessions.                  | Du temps réel côté retail ? (probable : non)                                 | 🔱 sport                          |
| 10  | Animations / templates          | Templates Studio (Remotion code-driven), animations but/joueur, render async.                                           | Gabarits créatifs ? qui produit la créa ?                                    | ⚙️ (moteur créa mutualisable)     |
| 11  | Multi-tenant & rôles            | `super_admin>admin>operator>viewer\|advertiser\|agency\|club`. `site_type` pi/saas/demo.                                | Hiérarchie enseigne→magasin→zone ? rôle régie ?                              | ⚙️ (noyau à étendre)              |
| 12  | Auth & sécurité                 | JWT HttpOnly + Bearer + MFA TOTP.                                                                                       | SSO enseigne ? exigences sécu ?                                              | 🟰                                |
| 13  | Réseau / connectivité           | Hotspot Pi, captive portal, PSK rotation (ADR-074), DNS fallback (ADR-126).                                             | Sans objet si pas d'edge retail.                                             | 🔱 sport pur                      |
| 14  | Reporting & facturation         | Rapports PDF sponsors mensuels, portail magic-link. Pas de facturation média.                                           | Facturation annonceurs ? cycles ? preuve de diffusion ?                      | 🔱 retail → mutualiser format     |
| 15  | Source de vérité config         | `pi` : Pi local = vérité, cloud reflète. `saas` : cloud = vérité.                                                       | Retail = cloud vérité toujours ?                                             | 🔱 (modèle dual à étendre)        |

## I.2 Découpage : noyau commun vs verticaux

**🟦 NOYAU COMMUN** : médias + bibliothèque + versioning · planification (le retail tire le standard, + riche) · ciblage paramétrique (site→zone→écran→horaire) · **modèle de player abstrait** · multi-tenant/RBAC · auth/MFA · moteur templates/créa · **brique régie & inventaire** · reporting/export · observabilité.

**🔱 VERTICAL SPORT** (ne pas mutualiser) : autonomie offline Pi · sync-agent/command-queue · hotspot/captive/PSK/DNS · scoreboard live + consoles · télécommande staff · match sessions + auto-close · animations but/joueur.

**🔱 VERTICAL RETAIL** (à révéler) : modèle d'inventaire média · ciblage magasin/zone fin · mesure d'audience/trafic · facturation annonceurs · workflow campagne datée.

**Test du noyau** : une capacité va au noyau **seulement si** les deux verticaux la veulent **ET** qu'un paramétrage suffit. Sinon → vertical. (anti-abstraction-prématurée)

## I.3 Positionnement retenu

**1 plateforme à noyau commun, 2 verticaux, 1 marque neuve.** ✅ (validé)

| Option                        | Verdict    | Pourquoi                                                     |
| ----------------------------- | ---------- | ------------------------------------------------------------ |
| Retail étendu au sport        | ❌ éliminé | Marque neuve + sport = vertical complet, pas une feature.    |
| 2 produits, cœur partagé      | ⚠️ écarté  | Contredit « 1 marque neuve » + « sport re-câblé sur socle ». |
| **1 plateforme, 2 verticaux** | ✅ retenu  | Colle C1+C5+C6.                                              |

**Arbitrage stack (C3c) — lean renforcé par l'audit.** Socle = stack MadXP (Node/Express + PostgreSQL + Socket.IO + Remotion + FTP/proxy). Raison code-verified : **MadXP gère déjà edge offline (`pi`) ET cloud-vérité (`saas`)** via strategy registry (ADR-069) → le retail = **3ᵉ stratégie**, additif. **Bloquants** : stack retail (Q8), volume (Q9), équipes (Q10) — mais le défaut « stack MadXP » est désormais étayé. Ne pas figer avant la séance.

## I.4 Risques de convergence — ce qu'il NE faut PAS mutualiser

1. 🔴 Fusionner « sponsor local club » et « espace média vendu » → acteurs/propriété/facturation différents. **Un moteur de rotation, deux modèles de droits.**
2. 🔴 Imposer l'edge/offline au retail, ou stripper l'autonomie du sport → l'autonomie Pi est un **invariant sport**.
3. 🟠 Unifier « audience » : sport = diffusions ; retail = humains/trafic → **2 métriques, 1 format de rapport**.
4. 🟠 Abstraire le temps réel (scoreboard/remote) « au cas où » → YAGNI tant que le retail n'en a pas besoin.
5. 🟢 Hotspot/captive/PSK → sport-Pi pur, jamais dans le noyau.

## I.5 Grille d'interview du lead dev retail (artefact de séance)

1. Modèle d'inventaire : on vend **quoi** ? (slot / share-of-voice / impression / forfait campagne)
2. Unité de booking : conflits de slots, priorités, sur-booking ?
3. Ciblage : dimensions réelles (magasin, zone, rayon, daypart, autre) ?
4. Audience : mesurée comment ? (capteur, comptage, estimation, preuve contractuelle)
5. Facturation annonceurs : cycle, réconciliation, preuve de diffusion ?
6. Edge : des players ? offline toléré ? (confirmer le hors-scope)
7. Hiérarchie tenant : enseigne→magasin→zone ? rôle régie interne ?
8. **Stack** : langage/DB/front/temps réel ? maturité ? dette ?
9. Volume : nb écrans, campagnes/mois, pics ?
10. Taille & compétences de l'équipe retail ?
11. Ce qui _fait mal_ aujourd'hui (à ne pas reporter dans le noyau) ?
12. Réglementaire pub : RGPD ciblage, affichage prix, mentions ?

## I.6 Hypothèses (⚠️) et contradiction résiduelle

- ⚠️ H1 : retail sans edge offline (« on s'en fiche ») — confirmer.
- ⚠️ H2 : la régie média est le seul apport unidirectionnel retail→sport à fort ROI.
- ⚠️ H3 : le socle penche techniquement vers le sport — non tranchable sans Q8/Q9/Q10.
- 🟡 « Sport prêt en 3 mois » tenable **uniquement** en re-câblage (C8).

---

# PARTIE II — CAHIER DES CHARGES

## 1. Vision & objectifs

Une seule plateforme pour **piloter des contenus sur une flotte d'écrans distants**, déclinée en 2 verticaux (sport, retail), noyau partagé, marque neuve.

Proposition de valeur (moteurs C7) :

- `[C]` un socle au lieu de deux (coût ↓).
- `[S]` le sport hérite d'une **régie média** mature (monétisation d'inventaire — capacité absente aujourd'hui). ✅
- `[R]` le retail hérite (si pertinent) du **modèle edge autonome** du sport. ⚠️ (H1).
- `[C]` pitch unique, cross-sell.

Objectif 3 mois : **noyau commun opérationnel + vertical sport prêt** ; retail démarre en parallèle, cadencé par la grille §I.5.

## 2. Positionnement retenu

Cf. §I.3. **1 plateforme, noyau commun, 2 verticaux, marque neuve.** Alternatives écartées documentées.

## 3. Cibles & personae

| Persona                        | Vertical | Besoin clé                                 | Conf.                |
| ------------------------------ | -------- | ------------------------------------------ | -------------------- |
| Super admin / operator flotte  | C        | Piloter N sites/écrans à distance, support | ✅                   |
| Club (resp. partenaires)       | S        | Gérer sponsors locaux, consulter rapports  | ✅                   |
| Staff club (terrain)           | S        | Télécommande locale, scoreboard, offline   | ✅                   |
| Annonceur / agence             | C        | Uploader créa, suivre diffusion/audience   | ✅ sport / ⚠️ retail |
| Enseigne / responsable magasin | R        | Programmer contenu magasin/zone            | ❌ Q7                |
| Régie média                    | R        | Vendre/booker de l'inventaire écran        | ❌ grille            |

## 4. Périmètre

- **IN noyau `[C]`** : médias, player abstrait, planif, ciblage, tenant/RBAC, auth/MFA, templates/créa, régie/inventaire, reporting, observabilité.
- **IN sport `[S]`** (M) : offline Pi, sync-agent/command-queue, hotspot/captive/PSK, scoreboard+consoles, télécommande, match sessions+auto-close, animations but/joueur.
- **IN retail `[R]`** : inventaire média, ciblage magasin/zone, audience, facturation, campagne datée (via grille §I.5).
- **OUT** : `[S]` rien retiré du sport. `[R]` edge/offline **hors-scope jusqu'à H1**. `[C]` pas d'abstraction temps-réel « au cas où ».

## 5. Architecture (ADR léger)

**A — Topologie noyau + adaptateurs verticaux.** `[C]` M
Cœur (médias, players, tenant, planif, régie) + modules verticaux branchés par **ports/adaptateurs**. Alternatives rejetées : monolithe paramétré par `vertical_type` (couplage), 2 apps + lib (= « 2 produits »). Pourquoi : isole les invariants durs sans les imposer à l'autre vertical.

**B — Player unifié.** `[C]` M — abstraire « player » = surface qui exécute une boucle planifiée, quel que soit le substrat (Pi-kiosk / écran retail). Seul point qui rend le noyau réellement commun. → SPEC-CORE-PLAYER.

**C — Stack du noyau.** ⚠️ **arbitrage séance — lean renforcé.** Socle = stack MadXP (Node/Express/PG/Socket.IO/Remotion) : elle gère **déjà** edge `pi` + cloud `saas` (strategy registry ADR-069), retail = 3ᵉ stratégie. Bloquants Q8/Q9/Q10. On reprend `[S]` la mécanique sport **re-câblée** ; `[C]` registry/SaaS/entitlement/analytics/stockage/alerting/dashboard/realtime/lecture (cf. [RECETTE §A](RECETTE-extension-retail.md)) ; `[R]` le **modèle métier** régie.

**D — Source de vérité duale.** `[C]` M ⚠️ **(corrigé après audit code)** — _cible_ : `pi` → vérité edge ; `saas`/retail-connecté → vérité cloud. 🔴 **Réalité HEAD : le sport ET le SaaS sont cloud-wins** ; l'edge-autoritaire (ADR-120 : Pi-owned + push-back + 3-way merge) est **proposé, non codé** (cf. [MADXP-code-verified-findings.md](MADXP-code-verified-findings.md) §0/C1). Conséquences : (a) le cloud-wins retail est _déjà_ le modèle réel ; (b) un edge **éditable localement** (Pi ou retail offline) = **chantier noyau à faire une fois**, pas un acquis ; (c) l'autonomie de **diffusion** offline est, elle, réelle ✅. Étendre l'enum `site_type` (`+retail`), ne pas le casser.

## 6. Acteurs & rôles (RBAC cross-vertical) `[C]`

| Rôle                   | Médias     | Planif | Players      | Régie           | Reporting | Scope                                                                                                                                       |
| ---------------------- | ---------- | ------ | ------------ | --------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| super_admin            | ✔          | ✔      | ✔            | ✔               | ✔         | global (bypass total `auth.ts:108`)                                                                                                         |
| operator               | ✔          | ✔      | ✔            | lecture         | ✔         | 🔴 **non scopé aujourd'hui** : voit TOUS les sites (pas de table d'assignation, `auth.ts`). Le scoping operator↔sites est **à construire**. |
| advertiser/agency      | ✔ (créas)  | –      | –            | ✔ (campagnes)   | ✔         | cross-vertical                                                                                                                              |
| club `[S]`             | ✔ (vidéos) | profil | déploie Pi   | sponsors locaux | ✔         | site                                                                                                                                        |
| staff club `[S]`       | –          | –      | télécommande | –               | –         | local, sans compte                                                                                                                          |
| enseigne/magasin `[R]` | ❓         | ❓     | ❓           | ❓              | ❓        | ❌ Q7                                                                                                                                       |
| régie média `[R]`      | –          | –      | –            | ❓              | ❓        | ❌ grille                                                                                                                                   |

⚠️ Invariant : `advertiser`/`agency` = sémantiques différentes selon vertical. Ne pas collapser.

## 7. Parcours clés

- `[S]` Match live ✅ · Sponsor local ✅ · `[C]` Déploiement flotte ✅ · `[R]` Vendre un espace média ❌ (grille).

## 8. Besoins fonctionnels (priorisés)

| ID    | Besoin                                   | Tag       | MoSCoW | Conf.     |
| ----- | ---------------------------------------- | --------- | ------ | --------- |
| BF-01 | Bibliothèque médias + versioning         | C         | M      | ✅        |
| BF-02 | Modèle player abstrait + boucle          | C         | M      | ✅        |
| BF-03 | Planification (profils + campagne datée) | C         | M      | ⚠️        |
| BF-04 | Ciblage site→zone→écran→horaire          | C         | M      | ⚠️        |
| BF-05 | Multi-tenant + RBAC                      | C         | M      | ✅        |
| BF-06 | Auth JWT+MFA                             | C         | M      | ✅        |
| BF-07 | Régie & inventaire                       | C(seed R) | M      | ❌ grille |
| BF-08 | Reporting/export + magic-link            | C         | S      | ✅        |
| BF-10 | Offline Pi (sync-agent, command-queue)   | S         | M      | ✅        |
| BF-11 | Scoreboard live + consoles               | S         | M      | ✅        |
| BF-12 | Télécommande staff                       | S         | M      | ✅        |
| BF-13 | Match sessions + auto-close              | S         | M      | ✅        |
| BF-14 | Hotspot/captive/PSK/DNS                  | S         | S      | ✅        |
| BF-15 | Animations but/joueur                    | S         | S      | ✅        |
| BF-20 | Audience humaine/trafic                  | R         | M      | ❌ Q4     |
| BF-21 | Facturation annonceurs + preuve          | R         | S      | ❌ Q5     |
| BF-22 | Ciblage magasin/zone/rayon               | R         | M      | ❌ Q3     |

## 9. Régie publicitaire & monétisation `[C]` (seed `[R]`)

**Non spécifiable aujourd'hui** (C4). Squelette + hypothèses :

- 🟢 **Le moteur d'entitlement existe déjà** (audit code) : paliers `sites.subscription_plan` + `feature_overrides` JSONB + export billing (`require-site-tier.ts`, `feature-gate.service.ts`, cf. [findings-2 §2](MADXP-code-verified-findings-2.md)). → la **régie/audience/multi-écran** sont des **features gatées** à ajouter au catalogue, PAS un greenfield. La régie n'apporte que le **versant vente d'inventaire** (booking/preuve/facture), pas le packaging.
- ⚠️ H-RÉGIE-1 : inventaire = slot OU share-of-voice (le sport a déjà le SoV via Bresenham → pont). → Q1.
- ⚠️ H-RÉGIE-2 : 2 modèles de droits (sponsor_local vs media_sold), **même moteur de rotation, facturation séparée**.
- ⚠️ H-RÉGIE-3 : audience = diffusions prouvées (sport ✅) + trafic/impressions (retail ❌). 2 métriques, 1 rapport.
- Bloquants : grille Q1-Q5. Sans réponses → spec gelée.

## 10. Edge / cloud / hors-ligne

| Donnée              | Vérité                 | Offline                    | Tag | Conf. |
| ------------------- | ---------------------- | -------------------------- | --- | ----- |
| Config player       | Pi (pi) / cloud (saas) | Pi autonome                | S/C | ✅    |
| Médias              | cloud → cache Pi       | lecture locale             | C   | ✅    |
| Inventaire/booking  | cloud                  | ⚠️ retail always-connected | R   | ❌ Q6 |
| Audience/diffusions | edge buffer → cloud    | bufferise puis sync        | C   | ✅    |
| Scoreboard live     | edge                   | local                      | S   | ✅    |

**Invariant `[S]`** : le noyau ne doit **jamais** rendre un player dépendant du cloud en lecture (offre « sans dépendance internet en live »).

## 11. Exigences non-fonctionnelles

`[C]` sécurité JWT/MFA, SQL paramétré, secrets hors repo ✅ · observabilité Prometheus par vertical ✅ · perf flotte 50+ ✅ · i18n FR ✅ / multi-langue ⚠️ · accessibilité dashboard ⚠️.
`[S]` OTA + canary, dédup alertes (ADR-111), tolérance offline ✅.
`[R]` scalabilité campagnes/impressions ❌ Q9 · SLA diffusion contractuel ❌ Q5.

## 12. Contraintes

- `[S]` matériel : Pi5 (saturation GPU — 1 décodeur HD à la fois), HDMI multi-display, hotspot wlan1. ✅
- `[C]` réglementaire : RGPD (audience retail = donnée sensible ⚠️), mentions pub/prix `[R]` Q12.
- `[C]` orga : 2 équipes / 2 lead devs, stacks hétérogènes → Décision C.
- `[C]` budget : hébergement contenu (réf sport Railway ≤ $10/mois) ⚠️ retail inconnu.

## 13. Trajectoire (3 mois)

| Phase      | Contenu                                                                              | Tag | Risque                               |
| ---------- | ------------------------------------------------------------------------------------ | --- | ------------------------------------ |
| P0 (s1-2)  | Séance : remplir grille §I.5, **trancher stack (Décision C)**                        | C   | bloquant si lead retail indispo      |
| P1 (s2-6)  | Noyau : médias, **player abstrait**, tenant/RBAC, planif, auth                       | C   | abstraction player = chemin critique |
| P2 (s5-9)  | **Vertical sport re-câblé** (adaptateurs Pi/scoreboard/sponsors/remote) → sport prêt | S   | ⚠️ re-câblage, pas réécriture (C8)   |
| P3 (s7-12) | Brique régie + **retail MVP** (selon grille)                                         | R   | dépend des réponses P0               |

## 14. Hypothèses, risques & questions ouvertes

- ❌ **Nom de la marque neuve.**
- ⚠️ H1 edge retail hors-scope · H3 stack penche sport · C8 « sport prêt » = re-câblage.
- ❌ Tout le vertical retail (grille §I.5).
- 🔴 Risques §I.4.

## 15. Glossaire (mots qui divergent)

| Terme               | Sport `[S]`                                | Retail `[R]`                                   |
| ------------------- | ------------------------------------------ | ---------------------------------------------- |
| Sponsor / annonceur | partenaire local du club, géré par le club | marque tierce qui **achète** de l'espace média |
| Diffusion           | une lecture vidéo (`video_plays`)          | une impression contractuelle facturable        |
| Audience            | nb de diffusions                           | nb d'humains exposés (trafic)                  |
| Player              | Pi-kiosk + displays                        | écran magasin (substrat ❓)                    |
| Site                | club (Pi/SaaS)                             | magasin / point de vente                       |
| Boucle              | rotation pondérée Bresenham                | ❓ rotation / slots planifiés                  |

---

# PARTIE III — SPÉCIFICATIONS

> Format par spec : Objectif/besoin · Acteurs · Portée · Règles · Invariants testables · Modèle de données + vérité · Parcours + cas limites · Critères d'acceptation Given/When/Then · Hors périmètre · Questions ouvertes.

## SPEC-CORE-PLAYER — Modèle de player & boucle `[C]` M

**Objectif/besoin** : BF-02. Abstraire un player pour que sport (Pi-kiosk) et retail (écran magasin) partagent le noyau de diffusion. **Acteurs** : operator, noyau, adaptateurs. **Portée** : commun.

**Règles**

1. `player ∈ {site_id, vertical, substrate, displays[]}` ; exécute **une boucle active** par display.
2. Boucle = liste ordonnée d'items pondérés (médias/templates) résolus depuis la config effective du site.
3. Substrat branché par adaptateur (`pi-kiosk` ✅, `retail-screen` ❌ Q6) ; le noyau ignore le substrat.
4. Vérité config player : edge si `pi`, cloud sinon (Décision D).

**Invariants testables**

- I1 ✅ : player `pi` sans cloud **continue** sa dernière boucle.
- I2 : changer d'adaptateur ne modifie **aucune** table noyau (couplage = 0).
- I3 ✅ : 2 displays d'un site peuvent avoir des boucles distinctes (`sites.displays`).

**Modèle de données + vérité**

| Champ                 | Vérité               | Note                      |
| --------------------- | -------------------- | ------------------------- |
| `player.substrate`    | cloud                | enum, étendre sans casser |
| `player.displays[]`   | edge(pi)/cloud(saas) | JSONB existant sport      |
| `loop.items[].weight` | config site          | Bresenham côté sport      |

**Parcours** : operator édite boucle → noyau calcule config effective → push adaptateur → player applique.
**Cas limites** : offline (I1) ; conflit edit cloud vs Pi → **push-back Pi gagne** pour `pi` (ADR-120) ✅ ; multi-tenant : operator ne voit que ses sites.

**Critères d'acceptation**

- _Given_ player `pi` offline, _When_ cloud injoignable, _Then_ boucle locale continue. ✅
- _Given_ adaptateur `retail-screen`, _When_ enregistré, _Then_ tests noyau passent sans modif schéma. (I2)
- _Given_ 2 displays, _When_ 2 boucles assignées, _Then_ chacun joue la sienne.

**Hors périmètre** : rendu pixel, sync inter-écrans temps réel (vertical).
**Questions** : substrat retail (Q6), sync multi-écrans retail.

## SPEC-CORE-REGIE — Régie & inventaire `[C]` (seed `[R]`) M

**Objectif/besoin** : BF-07, moteur n°1. **Acteurs** : annonceur, agence, régie `[R]`, club `[S]`. **Portée** : commun, 2 modèles de droits.

**Règles**

1. ✅ Tout item diffusable porte un **modèle de droits** : `sponsor_local` (club) **ou** `media_sold` (annonceur facturé).
2. ✅ Rotation = **un seul moteur** (pondération) ; le modèle de droits ne change que l'attribution + facturation.
3. ⚠️ Inventaire vendu = slot **ou** share-of-voice → Q1 (gèle R5-R7).
4. ✅ Chaque diffusion est attribuée (`video_plays` sport).
5. ❌ R5 booking/conflits, R6 pricing, R7 preuve contractuelle → Q2/Q5.

**Invariants testables**

- I1 ✅ : diffusion `media_sold` ⇒ enregistrement attribuable (pas de média anonyme).
- I2 ✅ : `sponsor_local` et `media_sold` **ne partagent pas** le modèle de facturation (risque §I.4-1).
- I3 ⚠️ : (post-Q1) sur-booking rejeté/dégradé selon politique — non spécifiable avant Q2.

**Critères d'acceptation**

- _Given_ sponsor local, _When_ il tourne, _Then_ diffusion attribuée **sans** facturation. ✅
- _Given_ espace média vendu, _When_ il tourne, _Then_ diffusion **facturable + prouvable**. ⚠️ (forme dépend Q4/Q5)
- ❌ booking/pricing : **pas de critère avant Q1-Q5** (pas de spec qui ment).

**Hors périmètre** : créa (templates), audience humaine (SPEC-RETAIL-AUDIENCE).
**Questions** : grille Q1-Q5.

## SPEC-CORE-TENANT-RBAC — Multi-tenant & rôles `[C]` M

**Objectif/besoin** : BF-05. **Acteurs** : tous. **Portée** : commun (à étendre par vertical).

**Règles**

1. ✅ Hiérarchie : `super_admin > admin > operator > viewer | advertiser | agency | club`.
2. ✅ `site_type` ∈ `{pi, saas, demo}` → étendre pour retail (ex `retail`), **sans casser** l'enum existant (Décision D).
3. ✅ Scope : operator limité à ses sites assignés ; club limité à son site ; advertiser/agency à leurs campagnes.
4. ⚠️ Hiérarchie tenant retail (enseigne→magasin→zone) = extension à modéliser → Q7.

**Invariants testables**

- I1 ✅ : un operator ne lit/écrit **que** ses sites assignés (refus 403 sinon).
- I2 ✅ : `advertiser`/`agency` ont une sémantique distincte par vertical — **pas de collapse** (deux modèles de droits, cf. SPEC-CORE-REGIE).
- I3 : ajouter `site_type='retail'` ne casse aucun test des `site_type` existants.

**Modèle de données + vérité** : `users.role` (cloud), `sites.site_type` (cloud), assignations operator↔site (cloud).
**Parcours** : super_admin crée tenant → assigne operator → operator gère ses sites.
**Cas limites** : utilisateur multi-rôle ; advertiser cross-vertical ; tenant retail imbriqué (Q7).

**Critères d'acceptation**

- _Given_ operator A, _When_ il requête le site de B, _Then_ 403. ✅
- _Given_ un advertiser sport et un annonceur retail, _When_ on liste leurs droits, _Then_ modèles de facturation distincts. ✅
- _Given_ enum étendu `retail`, _When_ tests `site_type`, _Then_ tous verts.

**Hors périmètre** : SSO enseigne (Q8). **Questions** : Q7 hiérarchie retail, SSO.

## SPEC-CORE-MEDIA-LIBRARY — Bibliothèque médias `[C]` M

**Objectif/besoin** : BF-01. **Acteurs** : operator, club, advertiser. **Portée** : commun.

**Règles**

1. ✅ Médias uploadés au cloud (stockage objet/FTP unifié), puis **déployés vers Pi** (`pi`) **ou servis par URL** (`saas`).
2. ✅ Dédup par `storage_path` : plusieurs rows DB peuvent partager un même fichier physique → **toute suppression/replace doit `GROUP BY storage_path`** (sinon impacte les rows sœurs).
3. ✅ `generateUniqueFilename` ajoute un suffixe `_N` au re-upload → risque de variants stale (auditer drift `video_variants` ↔ `sites.displays`).
4. ⚠️ Versioning campagne (retail) = extension → Q2.

**Invariants testables**

- I1 ✅ : supprimer une row partagée **ne supprime pas** le fichier tant qu'une autre row le référence.
- I2 ✅ : la suppression FTP **passe par l'API** (jamais hors-API → cascade orpheline, cf. CRON audit FTP).
- I3 : un upload retail ne crée pas de `_N` orphelin (dropdown contraint, pas texte libre — pattern `getAllowedDisplayTypes`).

**Modèle de données + vérité** : `videos`/médias (cloud) ; fichier physique (FTP/objet) ; cache local (Pi, dérivé).
**Parcours** : upload → validation → stockage → déploiement/serve.
**Cas limites** : race FTP→config (404 caché 30j si `immutable` sur `.mp4` → ne pas mettre `immutable`/`always` sur assets à nom fixe) ; offline Pi (lecture cache).

**Critères d'acceptation**

- _Given_ 2 rows partageant `storage_path`, _When_ on en supprime une, _Then_ le fichier reste et l'autre row joue. ✅
- _Given_ un asset `.mp4` servi au Pi, _When_ 404 transitoire, _Then_ pas de `Cache-Control: immutable` (évite le cache 404 30j). ✅

**Hors périmètre** : créa/templates. **Questions** : versioning campagne retail (Q2), CDN retail (Q1 grille).

## SPEC-SPORT-OFFLINE-EDGE — Autonomie Pi `[S]` M

**Objectif/besoin** : BF-10. **Acteurs** : Pi, sync-agent, cloud, operator. **Portée** : sport.

**Règles**

1. ✅ Pi **pleinement autonome** entre 2 reconnexions ; internet requis seulement pour bootstrap + reconnexion (cf. pi-connectivity-model.spec).
2. ✅ Pour `site_type=pi` : **Pi = source de vérité** de sa config locale ; cloud reflète/orchestre (ADR-120). Push-back Pi sur conflit.
3. ✅ Commandes cloud→Pi via `command-queue` : `sendOrQueue` met en file (`pending_commands`) si Pi offline, rejoué à la reconnexion.
4. ✅ Write-through sync-agent (ADR-114) : les écritures cloud sur `displays` se propagent en préservant l'auth.

**Invariants testables**

- I1 ✅ : Pi offline ⇒ diffusion ininterrompue (lecture config + médias locaux).
- I2 ✅ : commande émise Pi offline ⇒ **mise en file**, pas perdue ⇒ rejouée au reconnect.
- I3 ✅ : édition locale `:8080` (catégories/sponsors/profils/displays) possible **sans cloud**.

**Modèle de données + vérité** : config locale (Pi, vérité pour `pi`) ; `local_config_mirror` (reflet, ≠ profil édité dashboard) ; `pending_commands` (cloud).
**Parcours** : operator pousse → `sendOrQueue` → Pi applique (ou file) → push-back miroir.
**Cas limites** : conflit cloud vs Pi (push-back gagne) ; multi-profils (`local_config_mirror` reflète le profil **actif TV**, pas l'édité — diff trompeur possible) ; Pi offline > 24h (alerte mesh-only).

**Critères d'acceptation**

- _Given_ Pi offline, _When_ on coupe le cloud, _Then_ TV continue + `:8080` reste éditable. ✅
- _Given_ commande pendant offline, _When_ Pi revient, _Then_ commande rejouée une fois. ✅

**Hors périmètre** : retail offline (Q6). **Questions** : —

## SPEC-SPORT-SCOREBOARD-MATCH — Sessions & scoreboard `[S]` M

**Objectif/besoin** : BF-13, BF-11. **Acteurs** : staff club, dashboard, consoles marque. **Portée** : sport. **Réf** : ADR-088, ADR-093, ADR-097.

**Règles**

1. ✅ Sessions persistées dans `club_sessions` (pas de table parallèle) → préserve le pipeline analytics (`video_plays.session_id`).
2. ✅ Colonnes ADR-093 obligatoires : `home_team`, `away_team`, `home_score`, `away_score`, `profile_id`, `event_type`, `ended_by`.
3. ✅ `match-config.handler` UPDATE équipes/profil/event au démarrage ; `score-update.handler` UPDATE scores (gèle les finaux).
4. ✅ Auto-close CRON (`match_session_autoclose`) ferme les sessions oubliées avec `ended_by='timeout'` (badge ⏲️) ; métrique `recordMatchSessionAutoclosed`.
5. ✅ Dashboard : `COALESCE(match_name, home_team || ' vs ' || away_team)` (sessions pré-ADR-093).

**Invariants testables**

- I1 ✅ : sans UPDATE `score-update`, scores finaux jamais gelés ⇒ historique vide → **interdit**.
- I2 ✅ : `'match_session_autoclose'` présent dans le CHECK `check_task_type` (sinon `recurring_schedules` casse au boot).
- I3 ✅ : route `/api/sites/:id/match-history` valide `from`/`to` (`validateQuery(querySchemas.matchHistory)`).

**Modèle de données + vérité** : `club_sessions` (cloud, vérité) ; scoreboard live (edge, transient).
**Parcours** : staff lance match (remote) → `match-config` → scores live → `score-update` → fin/auto-close → rapport.
**Cas limites** : session oubliée (auto-close) ; console Bodet/Stramatel (canal HTTP) ; session legacy (`match_name`).

**Critères d'acceptation**

- _Given_ un match terminé, _When_ l'historique est lu, _Then_ équipes + scores finaux présents. ✅
- _Given_ une session ouverte oubliée, _When_ le CRON tourne, _Then_ `ended_at` set + `ended_by='timeout'`. ✅

**Hors périmètre** : retail. **Questions** : —

## SPEC-SPORT-SPONSORS-ROTATION — Sponsors & rapports `[S]` M

**Objectif/besoin** : BF-07 (versant sport), BF-08. **Acteurs** : club, advertiser/agency. **Portée** : sport. **Réf** : ADR-035, ADR-093.

**Règles**

1. ✅ Rotation pondérée **Bresenham** dans la boucle de chaque club.
2. ✅ Modèle dual : **sponsor local** (club) vs **advertiser/agency** (ADR-035).
3. ✅ Chaque diffusion attribuée au bon sponsor (`video_plays`).
4. ✅ Rapports PDF mensuels via **portail magic-link**, période-filtrés (jointure `club_sessions`).

**Invariants testables**

- I1 ✅ : la pondération respecte la part cible sur la durée (distribution Bresenham).
- I2 ✅ : une diffusion sponsor est toujours attribuée (pas d'anonyme).
- I3 ✅ : rapport période-filtré cohérent avec `event_type` (breakdown ADR-093).

**Modèle de données + vérité** : `site_sponsors`, `advertisers`, `agencies` (cloud) ; `video_plays` (edge→cloud).
**Parcours** : club ajoute sponsor → rotation → diffusions → PDF mensuel.
**Cas limites** : multi-profils (attribution par profil actif) ; magic-link expiré.

**Critères d'acceptation**

- _Given_ 3 sponsors pondérés 50/30/20, _When_ la boucle tourne longtemps, _Then_ la distribution converge. ✅
- _Given_ un mois, _When_ le PDF est généré, _Then_ diffusions attribuées + période exacte. ✅

**Hors périmètre** : régie média vendue (SPEC-CORE-REGIE). **Questions** : pont SoV sport ↔ inventaire retail (Q1).

## SPEC-SPORT-REMOTE — Télécommande staff `[S]` M

**Objectif/besoin** : BF-12. **Acteurs** : staff club. **Portée** : sport. **Réf** : remote.spec, remote-v2-preview-sync.

**Règles**

1. ✅ Remote Pi + Remote SaaS ; payload `command` avec `commandId`/`target`/`localBroadcast`.
2. ✅ Options match (équipes, profil, event) émises par `saveMatchInfo()` → alimente `match-config.handler`.
3. ⚠️ Piège : `displayIndex` sur payload `command` ignoré ; le filtrage TV se fait sur `target: number[]`.

**Invariants testables**

- I1 ✅ : `homeTeam`/`awayTeam`/`profileId`/`eventType` présents dans le payload `saveMatchInfo` (sinon colonnes ADR-093 non renseignées).
- I2 ✅ : `currentProfileId` peuplé dans `onClubSelected` (audit + reports multi-profil).

**Modèle de données + vérité** : commande (transient socket) ; effet persisté (`club_sessions`, cloud).
**Parcours** : staff agit → socket relay → Pi/TV applique.
**Cas limites** : offline (relay local) ; multi-display (`target`).

**Critères d'acceptation**

- _Given_ un démarrage de match via remote, _When_ le payload arrive, _Then_ équipes/profil persistés. ✅
- _Given_ `target=[1]`, _When_ la commande passe, _Then_ seul le display 1 réagit. ✅

**Hors périmètre** : retail. **Questions** : —

## SPEC-SPORT-HOTSPOT-NETWORK — Hotspot, PSK, DNS `[S]` S

**Objectif/besoin** : BF-14. **Acteurs** : Pi, opérateur terrain. **Portée** : sport-Pi pur. **Réf** : ADR-074, ADR-126.

**Règles**

1. ✅ Source de vérité PSK = **DB cloud** (`sites.wifi_psk_encrypted`, AES-256-GCM) ; le Pi **consomme** (`syncHotspotFromCloud`), ne dicte jamais.
2. ✅ Rotation : UPDATE DB + `commandQueueService.sendOrQueue(id,'rotate_psk',{})`.
3. ✅ Écriture `hostapd.conf` uniquement dans `services/hotspot-sync.js`, PSK via `shellEscape()`.
4. ✅ Filet DNS `resolv.conf.head` (ADR-126) : préfixe Cloudflare/Google à chaque bail dhcpcd, sinon hijack par le wildcard captive `address=/#/192.168.4.1`.
5. ✅ Ne jamais rediriger apple.com / google captive endpoints (réseau marqué « captive bloqué »).

**Invariants testables**

- I1 ✅ : `rotate_psk` ∈ `DEFAULT_ALLOWED_COMMANDS`.
- I2 ✅ : `ensure_resolv_conf_head()` présent dans `install.sh` (`setup_hotspot`).
- I3 ✅ : ip_forward=1 + NAT masquerade sur **wlan1** (uplink) sinon DHCP OK mais pas d'internet.

**Modèle de données + vérité** : PSK chiffré (cloud, vérité) ; cache Pi `.hotspot-cache` (0600, dérivé).
**Parcours** : rotation cloud → commande → Pi réécrit hostapd → reconnexion clients.
**Cas limites** : outage dhcpcd (resolv.conf.head sauve) ; Fire Stick captive (wildcard nécessaire mais couplé au pinning DNS).

**Critères d'acceptation**

- _Given_ une rotation PSK cloud, _When_ le Pi reçoit `rotate_psk`, _Then_ hostapd mis à jour. ✅
- _Given_ dhcpcd vide resolv.conf, _When_ un bail se renouvelle, _Then_ DNS publics re-préfixés. ✅

**Hors périmètre** : retail. **Questions** : —

## SPEC-RETAIL-INVENTORY — Inventaire média `[R]` M — **questions seules** ❌

**Objectif/besoin** : BF-07/BF-22. **Acteurs** : régie, annonceur, enseigne. **Portée** : retail.
**État** : non spécifiable (C4). **À remplir via grille Q1-Q3, Q9.**
**Hypothèses ⚠️ à challenger** : unité = slot OU SoV (H-RÉGIE-1) ; ciblage magasin/zone/daypart (Q3) ; conflits de booking gérés par priorité (⚠️).
**Critères d'acceptation** : ❌ aucun tant que Q1-Q3 non répondues (pas de spec qui ment).

## SPEC-RETAIL-AUDIENCE — Mesure d'audience `[R]` M — **questions seules** ❌

**Objectif/besoin** : BF-20. **Portée** : retail.
**À remplir via Q4.** **Hypothèses ⚠️** : audience = trafic estimé OU capteur OU preuve de diffusion contractuelle. Métrique **distincte** des diffusions sport (1 rapport, 2 métriques — §I.4-3).
**Critères d'acceptation** : ❌ avant Q4.

## SPEC-RETAIL-BILLING — Facturation annonceurs `[R]` S — **questions seules** ❌

**Objectif/besoin** : BF-21. **Portée** : retail.
**À remplir via Q5.** **Hypothèses ⚠️** : facturation à l'impression/slot/forfait ; preuve de diffusion = log attribuable (réutilise l'attribution noyau, SPEC-CORE-REGIE I1).
**Critères d'acceptation** : ❌ avant Q5.

---

## Traçabilité spec → besoin CDC

| Spec                         | Besoins         |
| ---------------------------- | --------------- |
| SPEC-CORE-PLAYER             | BF-02           |
| SPEC-CORE-REGIE              | BF-07           |
| SPEC-CORE-TENANT-RBAC        | BF-05           |
| SPEC-CORE-MEDIA-LIBRARY      | BF-01           |
| SPEC-SPORT-OFFLINE-EDGE      | BF-10           |
| SPEC-SPORT-SCOREBOARD-MATCH  | BF-11, BF-13    |
| SPEC-SPORT-SPONSORS-ROTATION | BF-07(S), BF-08 |
| SPEC-SPORT-REMOTE            | BF-12           |
| SPEC-SPORT-HOTSPOT-NETWORK   | BF-14           |
| SPEC-RETAIL-INVENTORY        | BF-07, BF-22    |
| SPEC-RETAIL-AUDIENCE         | BF-20           |
| SPEC-RETAIL-BILLING          | BF-21           |

## Prochaines actions

1. **Séance P0** : dérouler la grille §I.5 avec le lead dev retail ; trancher la **stack du noyau** (Décision C).
2. Lever la contradiction **« sport prêt 3 mois » = re-câblage** (C8).
3. Compléter les 3 specs retail dès la grille remplie.
4. Trancher le **nom de la marque** (§14).
