# Pack convergence — Plateforme commune (Retail × Sport)

> Kit de préparation de la séance de conception commune (Daisy × lead dev retail).
> Positionnement retenu : **1 plateforme à noyau commun, 2 verticaux, 1 marque neuve**.
> Horizon : **3 mois propre** ; « sport prêt » = **re-câblage** sur le noyau, pas réécriture.

## Par où commencer

1. **[MEMO-seance-convergence.md](MEMO-seance-convergence.md)** — à lire 5 min avant la séance : ce que je défends / ce que je concède, les 3 décisions à sortir, la phrase d'ouverture.
2. **[RECETTE-extension-retail.md](RECETTE-extension-retail.md)** — ⭐ **le plan actionnable** : 10 étapes d'extension (réutilise l'existant) + 6 chantiers transverses, avec effort. Dérivé de l'audit code.
3. **[CDC-plateforme-commune.md](CDC-plateforme-commune.md)** (v0.2) — analyse de convergence + CDC complet (15 sections) + 12 specs condensées + la **grille d'interview retail (§I.5)**.

## Audit code (à lire — corrige le CDC)

**[MADXP-code-verified-findings.md](MADXP-code-verified-findings.md)** — partie 1 (player & contenu). Corrige 3 points du CDC + 4 actifs réutilisables :

- 🔴 **C1** : le sport est **cloud-wins aujourd'hui** ; l'edge-autoritaire Pi (ADR-120) est **non codé**. L'autonomie offline de _diffusion_ est réelle, l'ownership edge non.
- 🟢 **C2** : le « port player » existe déjà = **Delivery Strategy Registry** (ADR-069). Retail = 3ᵉ stratégie.
- 🟢 **C3** : **SaaS est déjà le modèle retail** (backend 100% réutilisable).
- 🟢 4 actifs : SaaS-mode, Templates Studio V1 (créa), web-live-content (prix/promo live), LED-geometry (murs/gondoles).

**[MADXP-code-verified-findings-2.md](MADXP-code-verified-findings-2.md)** — partie 2 (couche commerciale & flotte) :

- 🟢 **Moteur d'entitlement déjà là** : paliers + `feature_overrides` + billing export → régie/audience = features gatées.
- ✅ **Design analytics « 2 métriques, 1 rapport » validé** : `video_plays` = diffusions, pas humains → table audience retail séparée.
- 🔴 **Correction CDC §6** : les `operator` ne sont **pas scopés** (voient tous les sites).
- ⚠️ Chantiers retail chiffrés : hiérarchie enseigne→magasin→zone (~3-5j), supervision SaaS/retail (absente), CDN volume (absent).
- 🔴 Drift rebrand : métriques = **`madxp_*`** (pas `neopro_*`).

**[MADXP-code-verified-findings-3.md](MADXP-code-verified-findings-3.md)** — partie 3 (provisioning, realtime, frontend, edge admin, lecture) :

- 🟢 **3 actifs de plus réutilisables** : dashboard shell vertical-agnostique, realtime rooms-par-siteId, moteur de lecture client partagé Pi/SaaS.
- 🟢 Retail dashboard = nouveau module + rôle, **zéro impact cœur**. Realtime = renommer phase/score.
- ⚠️ **Nouveau gap** : config de contenu **par-site, pas par-écran** → magasin N écrans = contenus distincts non modélisables.
- 🔴 Cloud-wins re-confirmé (`sync-profiles.js:164-170`).
- **Bilan 15 domaines** : retail ≈ 80% extension + 20% chantiers transverses (6 listés).

## Specs détaillées (noyau commun)

| Spec                                                             | Rôle                                                                         | État                |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------- |
| [SPEC-CORE-PLAYER-detailed.md](SPEC-CORE-PLAYER-detailed.md)     | **Chemin critique** : le port/adaptateur qui rend le noyau commun            | ✅                  |
| [SPEC-CORE-PLANNING-detailed.md](SPEC-CORE-PLANNING-detailed.md) | Rencontre des 2 mondes : profils sport + campagnes datées retail (3 couches) | ✅                  |
| [SPEC-CORE-REGIE-detailed.md](SPEC-CORE-REGIE-detailed.md)       | **Moteur n°1** : 1 rotation, 2 modèles de droits                             | ✅ (retail ❄️ gelé) |

## Specs détaillées (vertical sport)

| Spec                                                                                                                                | État |
| ----------------------------------------------------------------------------------------------------------------------------------- | ---- |
| [SPECS-SPORT-detailed.md](SPECS-SPORT-detailed.md) — OFFLINE-EDGE · SCOREBOARD-MATCH · SPONSORS-ROTATION · REMOTE · HOTSPOT-NETWORK | ✅   |

## À finir AVEC le lead dev retail (volontairement non écrit)

| Spec                  | Débloquée par         |
| --------------------- | --------------------- |
| SPEC-RETAIL-INVENTORY | grille Q1, Q2, Q3, Q9 |
| SPEC-RETAIL-AUDIENCE  | grille Q4             |
| SPEC-RETAIL-BILLING   | grille Q5             |

> Ces 3 specs sont **gelées en questions**, pas inventées (règle « pas de spec qui ment »). Elles s'écriront à la table — c'est la bonne façon.

## Les 3 décisions à sortir de la séance

1. **Stack du noyau** (Décision C) — lean ⚠️ proche du sport ; bloquants Q8/Q9/Q10.
2. **Périmètre retail** — grille §I.5 remplie (au moins Q1, Q6, Q8).
3. **« Sport prêt en 3 mois » = re-câblage** acté, ou horizon rallongé.

## Décision business à ne pas oublier

**R10 (RÉGIE §6/§14)** — vendre une campagne média sur les écrans des clubs sportifs (monétiser l'inventaire sport). C'est le ROI n°1 de la fusion côté sport, et ça soulève une règle commerciale absente : **quel reversement au club ?**
