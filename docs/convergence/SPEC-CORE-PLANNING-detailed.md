# SPEC-CORE-PLANNING (détaillée) — Planification & programmation `[C]` M

> **Statut** : v0.1 — l'autre moitié du noyau, là où sport et retail se rencontrent vraiment.
> **Pourquoi** : le sport planifie par **profils** (config nommée diffusée) ; le retail planifie par **campagnes datées/ciblées**. Les deux doivent **résoudre vers la même boucle** consommée par le player (SPEC-CORE-PLAYER). C'est le point où il faut **étendre le modèle sport sans le casser** et **importer la richesse retail sans la coder en dur**.
> **Confiance** : ✅ sport (code/ADR) · ⚠️ hypothèse · ❌ retail inconnu.
> **Réf sport** : profils par site, `categories`, `timeCategories`, `cron-scheduler.service` + `recurring_schedules` (ADR-097), ADR-116 (merge profils), ADR-120 (ownership).

---

## 1. Objectif & besoin couvert

BF-03. Fournir **un seul moteur de résolution de planification** qui produit, pour un display à un instant T, la **boucle effective** — quelle que soit l'origine de la programmation (profil sport, campagne retail, ou les deux).

**Anti-objectif** : deux moteurs de planif parallèles (un « profils », un « campagnes ») qui se marchent dessus. Une seule résolution, deux **sources de programmation** qui s'y injectent.

## 2. Acteurs

Operator, club `[S]` (édite profils/catégories), enseigne/régie `[R]` (édite campagnes datées), noyau (résout), CRON scheduler (déclenche les transitions temporelles).

## 3. Portée

`[commun]`. Le **moteur de résolution** et le **scheduler** sont communs. Les **sources de programmation** (profil vs campagne) sont des contributeurs paramétrés, pas des branches `if vertical`.

---

## 4. Le modèle unifié : 3 couches de programmation

La boucle effective d'un display = **superposition résolue** de 3 couches, par priorité croissante :

| Couche                  | Définition                                                     | Origine                                          | Vérité           | Conf.   |
| ----------------------- | -------------------------------------------------------------- | ------------------------------------------------ | ---------------- | ------- |
| **L0 — Base (profil)**  | Config persistante par défaut (catégories, sponsors, displays) | profil sport ✅ / config magasin retail ❓       | edge(`pi`)/cloud | ✅ / ❌ |
| **L1 — Daypart**        | Variation selon plage horaire/jour                             | `timeCategories` sport ✅ / dayparting retail ⚠️ | cloud            | ✅ / ⚠️ |
| **L2 — Campagne datée** | Insertion bornée début/fin, ciblée                             | ❌ retail (campagne média)                       | cloud            | ❌ Q2   |

**Pont clé ✅** : le sport a **déjà** une primitive de dayparting (`timeCategories` = catégories qui changent selon l'heure). Le retail apportera la version riche (fenêtres datées + priorités). → **on généralise `timeCategories` en L1/L2, on ne réinvente pas.**

**Règle de résolution R-RESOLVE** : `boucle_effective = résoudre(L0) ⊕ appliquer(L1 actif) ⊕ insérer(L2 actifs)`, où `⊕` respecte la pondération (Bresenham `[S]`) et les **droits** (`rights_model`, cf. SPEC-CORE-REGIE). La sortie alimente directement `SPEC-CORE-PLAYER.effective_config`.

---

## 5. Règles métier

1. ✅ Un site a **≥1 profil** ; **un seul profil actif** par display à un instant T (le profil **diffusé TV**, pas l'édité dashboard).
2. ✅ Le **merge de profils** doit **zeroing `categories`/`sponsors`/`timeCategories` avant merge** lors d'un switch (sinon l'ancien profil fuit — bug ADR-116, ex. 4+3=7 catégories fantômes).
3. ✅ Les transitions temporelles (L1) sont déclenchées par le **CRON scheduler** (`recurring_schedules`), pas par un timer client.
4. ⚠️ Une **campagne datée** (L2) a `start`/`end`/`ciblage`/`priorité` → **modèle à confirmer** (Q2/Q3). Hors de ces réponses : pas de critère testable.
5. ❌ **Conflits de campagnes** (2 campagnes se disputent le même slot) : politique inconnue (priorité ? éviction ? share ?) → Q2.
6. ✅ Offline (`pi`) : la résolution L0+L1 doit être **calculable localement** (le Pi connaît son profil + ses timeCategories). L2 (campagnes) **peut** exiger le cloud → à cadrer si le retail a de l'edge (Q6).

## 6. Invariants testables

| #              | Invariant                                                                                                            | Test                                                  | Conf.        |
| -------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------ |
| I-ONE-ACTIVE   | Exactement **un** profil actif par display à T                                                                       | activer un 2ᵉ ⇒ l'ancien se désactive                 | ✅           |
| I-MERGE-ZERO   | Switch de profil ⇒ pas de catégorie/sponsor de l'ancien profil résiduelle                                            | switch A→B ⇒ count(B), pas count(A)+count(B)          | ✅           |
| I-CRON-TRUTH   | La santé du daypart se lit sur `recurring_schedules.last_run_at`, **pas** sur `MAX(timestamp)` d'une table alimentée | CRON arrêté ⇒ alerte, même si table vide légitimement | ✅           |
| I-OFFLINE-L0L1 | L0+L1 résolus sans cloud (`pi`)                                                                                      | couper cloud ⇒ daypart continue de basculer           | ✅           |
| I-L2-WINDOW    | Une campagne hors fenêtre `[start,end]` n'apparaît **jamais** dans la boucle                                         | T avant start / après end ⇒ absente                   | ⚠️ (post-Q2) |
| I-PRIORITY     | (post-Q2) un conflit de slot est résolu de façon **déterministe**                                                    | 2 campagnes même slot ⇒ ordre stable                  | ❌ avant Q2  |

> ⚠️ **Piège diff multi-profils ✅** : `local_config_mirror` reflète le profil **actif TV**. Sur un site multi-profils, comparer le miroir au **profil édité** au dashboard produit une « différence inter-profils » trompeuse — comparer **même profil** (cf. SPEC-CORE-PLAYER §8).

## 7. Modèle de données + source de vérité

| Entité.champ                                           | Vérité           | Note                                         |
| ------------------------------------------------------ | ---------------- | -------------------------------------------- |
| `profile.id / name`                                    | cloud            |                                              |
| `profile.categories[] / sponsors[] / timeCategories[]` | edge(`pi`)/cloud | L0+L1                                        |
| `display.active_profile_id`                            | **edge (`pi`)**  | profil **diffusé**, ≠ sélection dashboard ✅ |
| `recurring_schedule.last_run_at`                       | cloud            | **signal de santé CRON** (pas MAX(table))    |
| `campaign.start / end / target / priority / weight`    | cloud            | ❌ structure à confirmer Q2/Q3               |
| `campaign.rights_model`                                | cloud            | `media_sold` par défaut (régie)              |

## 8. Parcours nominal

- `[S]` : club édite profil + timeCategories → CRON bascule le daypart à l'heure → résolution L0+L1 → player.
- `[R]` : régie/enseigne crée campagne datée+ciblée → à T∈[start,end] et ciblage OK → insérée en L2 → résolution → player. ❌ (à confirmer)
- `[C]` : un display sport **pourrait** recevoir une campagne média L2 (régie) **par-dessus** son profil sport — c'est le **pont de monétisation** (§moteur n°1). ⚠️ à valider comme cas d'usage voulu.

## 9. Cas limites

| Cas                   | Attendu                                                 | Conf.   |
| --------------------- | ------------------------------------------------------- | ------- |
| Switch de profil      | zeroing avant merge (I-MERGE-ZERO)                      | ✅      |
| CRON arrêté           | alerte via `last_run_at`, daypart figé sur dernier état | ✅      |
| Offline Pi            | L0+L1 continuent ; L2 dépend de l'edge retail           | ✅ / ❌ |
| 2 campagnes même slot | résolution déterministe (politique Q2)                  | ❌      |
| Campagne expirée      | retirée de la boucle au prochain recalcul               | ⚠️      |
| Multi-tenant          | operator/régie ne planifient que leur scope             | ✅      |

## 10. Critères d'acceptation (Given/When/Then)

- **AC1 (un actif)** — _Given_ 2 profils sur un display, _When_ on en active un, _Then_ l'autre est inactif. ✅
- **AC2 (merge)** — _Given_ profil A (4 cat.) actif, _When_ on switch vers B (3 cat.), _Then_ le display montre 3 catégories, pas 7. ✅
- **AC3 (CRON santé)** — _Given_ le scheduler arrêté, _When_ on lit la santé, _Then_ alerte basée sur `last_run_at` même si la table cible est vide. ✅
- **AC4 (offline daypart)** — _Given_ un `pi` offline, _When_ l'heure de bascule arrive, _Then_ le daypart change sans cloud. ✅
- **AC5 (fenêtre campagne)** — _Given_ une campagne `[10h,12h]`, _When_ T=13h, _Then_ elle n'est pas dans la boucle. ⚠️ (testable une fois Q2 répondue)
- ❌ **AC conflits** — pas de critère avant la politique de priorité (Q2).

## 11. Ce que le retail doit révéler pour finir cette spec

| Inconnu                       | Question  | Débloque                           |
| ----------------------------- | --------- | ---------------------------------- |
| Structure campagne (champs)   | Q2 grille | L2, I-L2-WINDOW                    |
| Politique de conflit de slots | Q2        | I-PRIORITY, AC conflits            |
| Dimensions de ciblage         | Q3        | `campaign.target`                  |
| Edge retail ?                 | Q6        | offline L2                         |
| Volume campagnes              | Q9        | stratégie recalcul (cache vs live) |

## 12. Hors périmètre

Rendu (player), modèle d'inventaire/pricing (régie), créa (templates), audience (retail).

## 13. Questions ouvertes

- ❌ Tout L2 (campagnes datées) — Q2/Q3.
- ⚠️ **Cas d'usage « campagne média L2 sur display sport »** : est-ce voulu (monétiser l'inventaire sport) ou hors-scope v1 ? → **à trancher en séance**, c'est le ROI direct du moteur n°1.
- ⚠️ Recalcul de la boucle effective : à chaque édition (live) vs cache invalidé — perf sous volume retail (Q9).
