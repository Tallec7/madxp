# SPEC-CORE-PLAYER (détaillée) — Modèle de player & boucle de diffusion `[C]` M

> **Statut** : v0.1 — approfondissement du chemin critique du noyau commun.
> **Pourquoi cette spec en premier** : c'est **la seule abstraction qui rend le noyau réellement commun**. Si elle est juste, sport et retail partagent le moteur de diffusion sans se polluer. Si elle est bancale, on retombe sur « 2 produits déguisés ». C'est aussi le test grandeur nature de C8 (« sport prêt en 3 mois » = **re-câbler** le sport existant sur ce port, pas le réécrire).
> **Confiance** : ✅ vérifié côté sport (codebase/ADR) · ⚠️ hypothèse · ❌ inconnu (retail).
> **Réf sport** : `sites.displays` JSONB (PROP-001/002), ADR-114 (write-through), ADR-120 (ownership Pi vs cloud), tv.component (filtrage `target`), kiosk Chromium.

---

## 1. Objectif & besoin couvert

BF-02. Fournir **un modèle unique de “player”** que les deux verticaux exécutent, pour que **planification, ciblage, médias, régie et reporting vivent dans le noyau** et que chaque vertical n'apporte qu'un **adaptateur de substrat** (Pi-kiosk pour le sport, écran magasin pour le retail).

**Anti-objectif** (ce que cette spec refuse) : un `if (vertical === 'sport')` dans le moteur de boucle. Toute spécificité substrat vit **derrière le port**, jamais dans le noyau.

## 2. Acteurs

- **Operator / club / enseigne** : éditent la boucle et le ciblage (via le noyau).
- **Noyau** : résout la **config effective** d'un player et la pousse.
- **Adaptateur de substrat** : traduit la config effective en commandes concrètes (kiosk, écran).
- **Player physique** : exécute (Pi-kiosk `[S]` ✅ / écran retail `[R]` ❌).

## 3. Portée

`[commun]` — le **contrat de port** et le **moteur de boucle** sont communs. Les **adaptateurs** sont verticaux.

---

## 4. Concepts & vocabulaire (figés)

| Terme                | Définition                                                                               | Vérité                              |
| -------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------- |
| **Site**             | Unité tenant (club `[S]` / magasin `[R]`)                                                | cloud                               |
| **Player**           | Une instance de diffusion rattachée à un site + un substrat                              | cloud (déclaratif)                  |
| **Display**          | Une surface de sortie d'un player (1 écran). Un player a ≥1 display.                     | edge(`pi`) / cloud(`saas`,`retail`) |
| **Boucle (loop)**    | Liste ordonnée d'**items pondérés** jouée en continu sur un display                      | dérivée de la config site           |
| **Item**             | Média ou template + métadonnées (poids, droits, fenêtre)                                 | cloud                               |
| **Config effective** | Résultat figé de la résolution (profil + ciblage + droits) pour un display, à un instant | calculée                            |

⚠️ **Décision de modélisation** : on sépare **player** (déclaratif, cloud) et **display** (exécution, vérité variable). Côté sport, `sites.displays` (JSONB) fournit déjà la liste des displays — **le re-câblage = exposer `sites.displays` derrière le port, pas migrer la donnée.** ✅

---

## 5. Le contrat de port (interface noyau ↔ adaptateur)

Le noyau **ne connaît que ce port**. Tout substrat (Pi-kiosk, écran retail, et futurs verticaux) l'implémente.

```
PlayerSubstrateAdapter (port)
─────────────────────────────
  capabilities(): SubstrateCapabilities
    → { supportsOffline, maxConcurrentHdDecoders, supportsMultiDisplay,
        supportsRealtimePush, ownsTruth: 'edge' | 'cloud' }

  applyEffectiveConfig(displayId, effectiveConfig): Result
    → pousse/affiche la config résolue. Idempotent.

  health(displayId): DisplayHealth
    → { online, lastSeenAt, playing, currentItemId }

  onPushback(cb)            // edge uniquement : le substrat remonte un changement local
```

**Règles du port**

1. ✅ `applyEffectiveConfig` est **idempotent** : ré-appliquer la même config ne produit aucun effet visible (rejouabilité offline/reconnect).
2. ✅ Le noyau **n'appelle jamais** d'API spécifique substrat ; il ne lit que `capabilities()` pour adapter sa stratégie (ex. ne pas tenter de push temps réel si `supportsRealtimePush=false`).
3. ✅ `ownsTruth` détermine la résolution de conflit (cf. §8). `pi` → `'edge'` ; `saas`/`retail` → `'cloud'` (Décision D).
4. ⚠️ `maxConcurrentHdDecoders` existe **parce que** le Pi5 ne peut allouer qu'**un** SharedImage HD à la fois (saturation GPU V3D connue) — le noyau s'en sert pour ne pas planifier 2 vidéos HD simultanées sur un substrat contraint. Le retail le déclarera (probablement plus permissif).

**Pourquoi un port et pas un flag** : ajouter un vertical = écrire **un** adaptateur, **zéro** modif du moteur (invariant I-COUPLAGE, §7). C'est ce qui matérialise « noyau + adaptateurs » de la Décision A.

---

## 6. Modèle de données + source de vérité de chaque champ

| Entité.champ                       | Type                                | Vérité                        | Note                                                                                                                                           |
| ---------------------------------- | ----------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `player.id`                        | uuid                                | cloud                         |                                                                                                                                                |
| `player.site_id`                   | fk                                  | cloud                         |                                                                                                                                                |
| `player.substrate`                 | enum (`pi-kiosk`,`retail-screen`,…) | cloud                         | **étendre l'enum sans casser**                                                                                                                 |
| `player.displays[]`                | jsonb                               | **edge si `pi`**, sinon cloud | re-câble `sites.displays` ✅                                                                                                                   |
| `display.target_index`             | int                                 | cloud                         | filtrage commande (`target: number[]`) ✅                                                                                                      |
| `display.resolution / orientation` | obj                                 | cloud                         | défaut hérité substrat                                                                                                                         |
| `loop.items[].media_id`            | fk                                  | cloud                         |                                                                                                                                                |
| `loop.items[].weight`              | int                                 | **config site**               | pondération Bresenham `[S]` ✅                                                                                                                 |
| `loop.items[].rights_model`        | enum (`sponsor_local`,`media_sold`) | cloud                         | cf. SPEC-CORE-REGIE                                                                                                                            |
| `loop.items[].window`              | obj (start/end/daypart)             | cloud                         | ⚠️ campagne datée = besoin retail (Q2)                                                                                                         |
| `effective_config`                 | calculé                             | dérivé                        | jamais persisté comme vérité                                                                                                                   |
| `local_config_mirror`              | jsonb                               | **reflet** (≠ vérité)         | 🔴 **colonne orpheline : jamais écrite au commit HEAD** (`site.repository.ts:135`, 0 UPDATE). Censée refléter le profil actif TV — non câblée. |

**Invariant de vérité** : `effective_config` est **toujours recalculable** depuis (profil actif + items + ciblage + droits). On ne lit jamais un miroir comme source de vérité — le miroir sert au diagnostic/diff, et côté multi-profils il peut diverger du profil édité (piège connu à documenter dans l'UI).

---

## 7. Règles métier & invariants testables

| #                | Règle / invariant                                                                           | Test                                                                 | Conf.                 |
| ---------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------- |
| R1               | Un player exécute **une boucle active par display**                                         | 2 displays ⇒ 2 boucles indépendantes possibles                       | ✅                    |
| R2               | Le moteur de boucle est **agnostique au substrat**                                          | `grep` : 0 référence substrat-spécifique hors adaptateurs            | ✅ cible              |
| **I-COUPLAGE**   | Ajouter un adaptateur **ne modifie aucune table/route noyau**                               | nouvel adaptateur `retail-screen` ⇒ suite noyau verte sans migration | ⚙️ à enforcer (smoke) |
| **I-OFFLINE**    | `capabilities.supportsOffline=true` ⇒ le display **continue sa dernière boucle** sans cloud | couper cloud, TV continue                                            | ✅ (`pi`)             |
| **I-IDEMPOTENT** | Ré-appliquer la même `effective_config` = no-op visible                                     | double apply, 0 reflow/flash                                         | ✅ cible              |
| **I-GPU**        | Le planificateur ne dépasse jamais `maxConcurrentHdDecoders` sur un display                 | 2 médias HD simultanés refusés sur substrat=1                        | ✅ (Pi5)              |
| **I-TARGET**     | Une commande ciblée n'affecte que les displays de `target: number[]`                        | `target=[1]` ⇒ display 0 inchangé                                    | ✅                    |
| R8               | `rights_model` n'altère **pas** l'algo de rotation, seulement attribution/facturation       | sponsor_local vs media_sold ⇒ même ordre de rotation                 | ✅ (lien régie)       |

> ⚠️ **Piège anti-régression à garder** : côté sport, `displayIndex` sur un payload `command` est **ignoré** ; seul `target: number[]` filtre (tv.component). L'adaptateur Pi-kiosk doit conserver ce comportement — ne pas “corriger” en réintroduisant `displayIndex`.

---

## 8. Résolution de conflit (cœur du modèle dual)

Deux écritures concurrentes sur la config d'un display : qui gagne ?

| Substrat              | `ownsTruth` **cible** | Gagnant **cible** | Réalité code (HEAD)                                                                                                                                                                                                          |
| --------------------- | --------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pi-kiosk` `[S]`      | `edge` (objectif)     | édition locale Pi | 🔴 **NON implémenté. Aujourd'hui = cloud-wins** (`config-merge.js:269-342`). Le push-back Pi→cloud (ADR-120) n'existe pas. Seuls les `LOCAL_ONLY_SETTINGS` (auth/settings/hotspot) sont préservés (`config-merge.js:21-35`). |
| `retail-screen` `[R]` | `cloud`               | édition cloud     | ⚠️ cohérent avec le cloud-wins actuel — donc **gratuit** côté retail.                                                                                                                                                        |

**Règle R-CONFLIT (design cible)** : le noyau lit `capabilities().ownsTruth` pour choisir la stratégie de merge — pas de politique codée en dur, elle est **déduite du substrat**. C'est ce qui permettrait à un vertical edge-autoritaire et un always-connected de cohabiter sans `if vertical`.

> 🔴 **État réel à acter en séance** : l'edge-autoritaire (ADR-120 : Pi-owned + push-back + 3-way merge + table `config_conflicts`) est une **décision proposée, NON codée** (ni table, ni route `POST /api/sites/:id/pi-config-sync`, ni 3-way). **Aujourd'hui, le sport ET le SaaS sont cloud-wins.** Conséquence convergence : (a) le retail cloud-wins est _déjà_ le modèle réel ; (b) un edge **éditable localement** (Pi offline OU retail offline) reste un **chantier noyau à faire une fois** — pas un acquis. L'autonomie de **diffusion** (le Pi joue sa dernière config sans cloud), elle, est bien réelle ✅.

**Cas limite multi-profils `[S]`** ✅ : `local_config_mirror` reflète le profil **diffusé sur la TV**, pas le profil **édité au dashboard**. Sur un site multi-profils, un diff naïf miroir↔édité affiche une « différence inter-profils » trompeuse. → le diff doit comparer **même profil**, pas miroir vs sélection dashboard.

---

## 9. Parcours nominal

1. Operator édite la boucle / le ciblage d'un site (noyau, cloud).
2. Le noyau **résout la config effective** par display (profil actif + items éligibles + fenêtres + droits + contrainte GPU).
3. Le noyau appelle `adapter.applyEffectiveConfig(displayId, cfg)`.
4. L'adaptateur traduit en commandes substrat (kiosk Chromium `[S]` / écran retail `[R]`).
5. `adapter.health()` remonte l'état ; les diffusions sont attribuées (→ reporting/régie).

## 10. Cas limites

| Cas                              | Comportement attendu                                                                                          | Conf.      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------- |
| Player offline (`pi`)            | Continue la dernière boucle ; commandes mises en file (`command-queue`, `sendOrQueue`) ; rejeu au reconnect   | ✅         |
| Reconnexion                      | Le noyau ré-applique la config effective (idempotent ⇒ pas de flash)                                          | ✅ cible   |
| Conflit cloud↔Pi                 | 🔴 **cloud-wins aujourd'hui** (push-back ADR-120 non codé) ; seuls `LOCAL_ONLY_SETTINGS` préservés            | ⚠️ roadmap |
| 2 médias HD simultanés sur Pi5   | Refusé / séquencé (I-GPU) — libérer l'ancien `<video>` (`removeAttribute('src')+load()`) avant le suivant     | ✅         |
| Asset manquant (race FTP→config) | Pas de `Cache-Control: immutable` sur `.mp4` (sinon 404 caché 30j) ; fallback div noire avant 1er frame paint | ✅         |
| Multi-tenant                     | Operator ne voit/édite que ses sites (RBAC, SPEC-CORE-TENANT-RBAC I1)                                         | ✅         |
| Retail multi-écrans synchronisés | ❓ sync inter-écrans temps réel = hors noyau, à arbitrer                                                      | ❌ Q6      |

## 11. Critères d'acceptation (Given/When/Then)

- **AC1 (offline)** — _Given_ un player `pi-kiosk` qui joue une boucle, _When_ le cloud devient injoignable, _Then_ le display continue sa boucle **et** `:8080` reste éditable. ✅
- **AC2 (couplage)** — _Given_ un nouvel adaptateur `retail-screen`, _When_ on l'enregistre et lance la suite noyau, _Then_ **aucune** migration de schéma n'est requise et tous les tests noyau passent. (I-COUPLAGE)
- **AC3 (idempotence)** — _Given_ une config effective déjà appliquée, _When_ on la ré-applique, _Then_ aucun flash/reflow visible. (I-IDEMPOTENT)
- **AC4 (GPU)** — _Given_ un substrat `maxConcurrentHdDecoders=1`, _When_ la boucle voudrait jouer 2 vidéos HD en même temps, _Then_ le planificateur en séquence une seule. (I-GPU)
- **AC5 (ciblage)** — _Given_ `target=[1]` sur 3 displays, _When_ la commande passe, _Then_ seul le display d'index 1 réagit. (I-TARGET)
- **AC6 (conflit) — ⚠️ cible, non testable aujourd'hui** — _Given_ une édition locale Pi et une édition cloud concurrentes sur un `pi`, _When_ les deux arrivent, _Then_ (cible ADR-120) l'état local Pi est conservé. 🔴 **Réalité HEAD** : cloud-wins, sauf `LOCAL_ONLY_SETTINGS`. Le critère « push-back » n'est pas atteignable tant qu'ADR-120 n'est pas codé.
- **AC7 (droits)** — _Given_ une boucle mixant `sponsor_local` et `media_sold`, _When_ elle tourne, _Then_ l'ordre de rotation est identique à droits homogènes ; seules attribution/facturation diffèrent. (R8)

## 12. Stratégie de re-câblage du sport (C8) — comment on tient 3 mois

> Objectif : **le sport devient un adaptateur**, on ne réécrit pas son cœur.

| Brique sport existante                               | Devient                                                                                     | Effort                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------ |
| `sites.displays` (JSONB)                             | source des `displays[]` derrière le port (vérité edge)                                      | **faible** ✅                  |
| kiosk Chromium + HDMI                                | `pi-kiosk` adapter (`applyEffectiveConfig`)                                                 | **moyen** (wrapper)            |
| `command-queue` / `sendOrQueue` / `pending_commands` | mécanisme de transport offline du port (edge)                                               | **faible** (déjà offline-safe) |
| write-through sync-agent (ADR-114)                   | transport cloud→Pi (`applyEffectiveConfig`) — **déjà codé** ✅                              | **faible**                     |
| `onPushback` (Pi→cloud)                              | 🔴 **n'existe pas** (ADR-120 non implémenté) — à concevoir dans le noyau, pour Pi ET retail | **moyen/élevé**                |
| pondération Bresenham                                | reste dans le moteur de boucle **commun** (pas dans l'adaptateur)                           | **faible**                     |
| scoreboard / remote / match                          | **vertical sport pur**, hors port player (overlays au-dessus de la boucle)                  | inchangé                       |

**Conséquence assumée** : « sport prêt en 3 mois » = écrire l'**adaptateur `pi-kiosk`** + brancher le moteur de boucle commun sur `sites.displays`, **pas** reconstruire scoreboard/sync-agent/hotspot. Si la séance veut une vraie réécriture, **les 3 mois sautent** — à acter explicitement.

## 13. Ce que le retail doit révéler pour finir cette spec

| Inconnu               | Question           | Impact sur la spec                                  |
| --------------------- | ------------------ | --------------------------------------------------- |
| Substrat retail       | Q6 (grille)        | définit `capabilities()` de `retail-screen`         |
| Offline retail ?      | Q6                 | fige `supportsOffline` + `ownsTruth`                |
| Multi-écrans / murs ? | grille Q (display) | `supportsMultiDisplay`, sync                        |
| Campagne datée        | Q2                 | active `loop.items[].window` (fenêtres temporelles) |
| Volume/perf           | Q9                 | dimensionne le planificateur cloud                  |

## 14. Hors périmètre

Rendu pixel, codecs, overlays temps réel (scoreboard = vertical sport), créa/templates (moteur séparé), sync inter-écrans retail (à arbitrer).

## 15. Questions ouvertes

- ❌ Substrat + offline retail (Q6).
- ❌ Sync multi-écrans retail temps réel : noyau ou vertical ?
- ⚠️ `effective_config` : recalcul cloud à chaque édition vs cache invalidé — perf à valider sous volume retail (Q9).
- ⚠️ Faut-il un smoke `I-COUPLAGE` dès P1 pour empêcher tout `if (vertical)` de fuiter dans le moteur ? (recommandé).
