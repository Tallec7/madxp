# SPEC-CORE-REGIE (détaillée) — Régie, inventaire & monétisation `[C]` (seed `[R]`) M

> **Statut** : v0.1 — moteur n°1 de la fusion. **Partiellement gelée** : tout ce qui dépend du modèle d'inventaire retail (Q1-Q5) est marqué ❄️ et n'a **pas** de critère d'acceptation tant que la grille n'est pas remplie (règle « pas de spec qui ment »).
> **Idée force** : le sport a déjà un **moteur de rotation pondérée (Bresenham)** et une **attribution de diffusion** — ce sont les 2 briques dures de toute régie. La régie retail n'ajoute pas un nouveau moteur, elle ajoute un **modèle de droits + de facturation + de booking** par-dessus.
> **Confiance** : ✅ sport (ADR-035, ADR-093) · ⚠️ hypothèse · ❄️ gelé (dépend grille) · ❌ inconnu.

---

## 1. Objectif & besoin couvert

BF-07. Permettre de **vendre, diffuser, attribuer et facturer** de l'espace écran sur la flotte — en réutilisant le moteur de rotation et l'attribution du sport, et en distinguant proprement **don/contrepartie** (`sponsor_local`) de **vente média** (`media_sold`).

**ROI direct** : apporter au **sport** la capacité de **monétiser son inventaire** (une campagne média par-dessus la boucle d'un club, cf. SPEC-CORE-PLANNING §13). C'est _la_ raison n°1 de la fusion côté sport.

## 2. Acteurs

| Acteur                       | Rôle régie                                             |
| ---------------------------- | ------------------------------------------------------ | ------------------------------ |
| **Régie média** `[R]`        | vend l'inventaire, booke les campagnes                 | ❌ Q1/Q2                       |
| **Annonceur / agence** `[C]` | fournit la créa, suit la diffusion/facturation         | ✅ sport (ADR-035) / ⚠️ retail |
| **Club** `[S]`               | gère ses **sponsors locaux** (contrepartie, pas vente) | ✅                             |
| **Enseigne** `[R]`           | propriétaire de l'inventaire magasin                   | ❌ Q7                          |
| **Noyau**                    | rotation + attribution + (post-Q) booking/facturation  | partiel                        |

## 3. Portée

`[commun]` avec **deux modèles de droits** qui partagent **un seul moteur de rotation**.

---

## 4. Le concept central : moteur unique, deux modèles de droits

```
        ┌─────────────────────────────┐
        │   MOTEUR DE ROTATION (unique)│  ← pondération Bresenham ✅ (réutilisé du sport)
        │   ordonne les items, applique│
        │   les poids / SoV            │
        └──────────────┬──────────────┘
                       │ chaque diffusion …
        ┌──────────────┴──────────────┐
        ▼                             ▼
  rights_model = sponsor_local   rights_model = media_sold
  (club, contrepartie)           (annonceur, vente)
  → attribution, PAS de facture  → attribution + PREUVE + FACTURE
```

**Règle R-CŒUR** : `rights_model` **n'altère jamais** l'algorithme de rotation (ordre, poids). Il change uniquement ce qui se passe **après** la diffusion : attribution simple vs attribution + preuve + facturation. _(invariant I-ROTATION-NEUTRE)_

**Pourquoi c'est juste** : sport et retail veulent le même comportement de boucle (« cet item passe X% du temps ») ; ils diffèrent sur le **contrat commercial** attaché. Mutualiser le moteur, séparer le contrat = anti-risque §I.4-1.

---

## 5. Le pont sport → régie (ce qu'on réutilise tel quel) ✅

| Brique sport existante                                 | Rôle dans la régie                           | Réutilisation                                |
| ------------------------------------------------------ | -------------------------------------------- | -------------------------------------------- |
| Pondération **Bresenham**                              | distribue la part de voix (SoV) sur la durée | **directe** — un SoV % EST un poids          |
| Attribution `video_plays` (+ `session_id`)             | preuve de diffusion par item                 | **directe** — base de la preuve `media_sold` |
| `site_sponsors` + dual `advertiser`/`agency` (ADR-035) | modèle d'acteurs annonceur/agence            | **étendre**, pas refaire                     |
| Rapports PDF mensuels + magic-link                     | livrable annonceur                           | **étendre** au reporting média               |
| Breakdown `event_type` (ADR-093)                       | filtrage période/contexte des diffusions     | **réutiliser** pour le reporting média       |

> **Conséquence** : si la grille révèle que le retail vend en **share-of-voice** (H-RÉGIE-1, option probable), la convergence est quasi gratuite — le moteur sport le fait déjà. Si le retail vend en **slots temporels absolus**, il faut ajouter une couche de **réservation de slot** (booking) que le sport n'a pas → effort réel. **C'est l'enjeu de Q1.**

## 6. Règles métier

| #     | Règle                                                                                     | Conf.                     |
| ----- | ----------------------------------------------------------------------------------------- | ------------------------- |
| R1    | Tout item diffusable porte un `rights_model ∈ {sponsor_local, media_sold}`                | ✅                        |
| R2    | `rights_model` n'altère pas l'ordre/poids de rotation (R-CŒUR)                            | ✅                        |
| R3    | Toute diffusion est **attribuée** (sponsor ou annonceur) — pas de diffusion média anonyme | ✅                        |
| R4    | `sponsor_local` ⇒ attribution **sans** ligne de facturation                               | ✅                        |
| R5    | `media_sold` ⇒ attribution **+ preuve de diffusion** (réutilise `video_plays`)            | ⚠️ (forme = Q5)           |
| R6 ❄️ | Unité d'inventaire (slot / SoV / impression / forfait)                                    | ❄️ Q1                     |
| R7 ❄️ | Politique de booking + conflits + sur-booking                                             | ❄️ Q2                     |
| R8 ❄️ | Pricing (CPM, forfait, slot)                                                              | ❄️ Q1/Q5                  |
| R9 ❄️ | Cycle de facturation + réconciliation                                                     | ❄️ Q5                     |
| R10   | Une campagne média peut cibler un display **sport** (monétisation inventaire sport)       | ⚠️ à acter (PLANNING §13) |

## 7. Invariants testables

| #                 | Invariant                                                     | Test                                | Conf. |
| ----------------- | ------------------------------------------------------------- | ----------------------------------- | ----- |
| I-ROTATION-NEUTRE | Boucle mixant les 2 modèles ⇒ même ordre qu'à modèle homogène | comparer séquences                  | ✅    |
| I-NO-ANONYMOUS    | Diffusion `media_sold` ⇒ enregistrement attribuable existe    | 0 diffusion média sans annonceur    | ✅    |
| I-BILLING-SPLIT   | `sponsor_local` ne génère **aucune** ligne de facturation     | facture(sponsor_local) = ∅          | ✅    |
| I-SOV-CONVERGE    | Un SoV cible se réalise sur la durée (Bresenham)              | 50/30/20 ⇒ distribution convergente | ✅    |
| I-PROOF ❄️        | `media_sold` ⇒ preuve conforme au contrat                     | —                                   | ❄️ Q5 |
| I-BOOKING ❄️      | Sur-booking rejeté/dégradé de façon déterministe              | —                                   | ❄️ Q2 |

## 8. Modèle de données + source de vérité

| Entité.champ               | Vérité                     | État            |
| -------------------------- | -------------------------- | --------------- |
| `item.rights_model`        | cloud                      | ✅              |
| `item.weight` / `sov_pct`  | config site (cloud)        | ✅              |
| `advertiser` / `agency`    | cloud (ADR-035)            | ✅ étendre      |
| `site_sponsors`            | cloud                      | ✅              |
| diffusion attribuée        | `video_plays` (edge→cloud) | ✅              |
| `campaign` (booking)       | cloud                      | ❄️ structure Q2 |
| `invoice` / `billing_line` | cloud                      | ❄️ Q5           |
| preuve de diffusion        | dérivée de `video_plays`   | ⚠️ format Q5    |

## 9. Parcours

- `[S]` **Sponsor local** ✅ : club ajoute sponsor → poids → rotation → attribution → PDF mensuel. _(aucune facturation)_
- `[R]` **Vente média** ❄️ : régie crée campagne (inventaire+ciblage+prix) → booking → diffusion (rotation) → attribution+preuve → facturation. _(structure Q1/Q2/Q5)_
- `[C]` **Monétisation inventaire sport** ⚠️ : régie vend une campagne `media_sold` ciblant des displays de clubs → insérée en L2 (PLANNING) → attribution+preuve → reversement éventuel au club. **ROI n°1, à acter.**

## 10. Cas limites

| Cas                            | Attendu                                                                | Conf.                  |
| ------------------------------ | ---------------------------------------------------------------------- | ---------------------- |
| Boucle 100% sponsors locaux    | aucune facturation, attribution complète                               | ✅                     |
| Mix sponsor_local + media_sold | rotation neutre, facturation seulement sur media_sold                  | ✅                     |
| Offline (`pi`)                 | diffusions bufferisées (`video_plays`) puis sync → preuve a posteriori | ✅                     |
| Campagne média sur club        | reversement/part club ?                                                | ❌ règle commerciale Q |
| Sur-booking                    | politique déterministe                                                 | ❄️ Q2                  |
| Annonceur multi-sites          | attribution par site, facture consolidée                               | ⚠️ Q5                  |

## 11. Critères d'acceptation (Given/When/Then)

- **AC1 (sponsor local)** ✅ — _Given_ un sponsor local, _When_ il tourne, _Then_ attribution **sans** facture.
- **AC2 (neutralité)** ✅ — _Given_ une boucle mixte, _When_ elle tourne, _Then_ l'ordre est identique à une boucle homogène (I-ROTATION-NEUTRE).
- **AC3 (pas d'anonyme)** ✅ — _Given_ une diffusion `media_sold`, _When_ elle a lieu, _Then_ un enregistrement attribuable existe.
- **AC4 (SoV)** ✅ — _Given_ un SoV 50/30/20, _When_ la boucle tourne longtemps, _Then_ la distribution converge.
- **AC5 (preuve)** ❄️ — _pas de critère avant Q5_ (forme de la preuve contractuelle inconnue).
- **AC6 (booking)** ❄️ — _pas de critère avant Q2_ (politique de conflit inconnue).

## 12. Ce qui débloque la spec (grille §I.5)

| Question                                          | Débloque                       | Effort selon réponse                                     |
| ------------------------------------------------- | ------------------------------ | -------------------------------------------------------- |
| **Q1** unité d'inventaire                         | R6, R8, AC pricing             | SoV = quasi gratuit ✅ / slot absolu = couche booking 🔴 |
| **Q2** booking & conflits                         | R7, I-BOOKING, AC6             | dépend de la complexité des règles                       |
| **Q4** audience                                   | lien preuve ↔ audience humaine | métrique séparée (SPEC-RETAIL-AUDIENCE)                  |
| **Q5** facturation                                | R5/R9, I-PROOF, AC5            | intégration compta/export                                |
| **Q (commercial)** part club sur inventaire sport | R10 monétisation sport         | règle de reversement                                     |

## 13. Hors périmètre

Algorithme de rotation (→ moteur de boucle, PLANNING/PLAYER), créa (→ templates), mesure d'audience humaine (→ SPEC-RETAIL-AUDIENCE), comptabilité aval (export only).

## 14. Questions ouvertes

- ❄️ Tout le modèle d'inventaire vendu (Q1-Q5).
- ⚠️ **R10 — monétiser l'inventaire sport** : voulu en v1 ? (ROI n°1) → décision séance.
- ⚠️ Reversement au club quand une campagne média tourne sur son écran : règle commerciale à définir.
- ❌ L'inventaire est-il vendu **par display**, **par site**, ou **par audience cible cross-sites** ? (impacte tout le modèle de booking).
