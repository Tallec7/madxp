# ADR-141 — Plafonner les rendus Studio en DB, et réviser « le parallélisme est souhaitable »

**Statut** : Accepté
**Date** : Août 2026
**Contexte** : ADR-054 (rendus async, `SKIP LOCKED`), ADR-124 (rendu in-process), ADR-128 (concurrence Chrome interne réduite à 1), incident pliage LED du 2026-08-11

## Contexte

ADR-054 a posé la file de rendus asynchrone et en a tiré une conclusion explicite :

> « Si Railway scale à N replicas, chacun démarrera son propre worker. Le claim
> `SKIP LOCKED` garantit qu'un seul traitera un job donné, mais plusieurs jobs
> peuvent tourner en parallèle sur des replicas différents — à l'échelle actuelle,
> c'est un **trait souhaitable**. »

ADR-118 reprend la même idée pour la montée en charge (« bump replicas Railway, le
`SKIP LOCKED` gère »). Cette lecture est **fausse sur le mécanisme** et **démentie par
la production**.

**Fausse sur le mécanisme** : `FOR UPDATE SKIP LOCKED` garantit que deux workers ne
claim pas la _même_ ligne. Il ne dit rien du nombre de lignes _différentes_ traitées
simultanément. Ce n'est pas un plafond de concurrence, et il n'a jamais prétendu l'être.

**Démentie par la production**, deux fois :

- **Templates Studio, 2026-05-15** — deux rendus terminés en `Compositor quit with
signal SIGKILL`. SIGKILL sur le compositor Remotion, c'est le conteneur qui tue le
  processus faute de mémoire.
- **Pliage LED, 2026-08-11** — même schéma, autre ressource : 24 pliages perdus sur 52
  en « Error while opening decoder : Resource temporarily unavailable ». Le correctif
  (plafond en DB) est décrit dans `.claude/rules/led.md`.

S'y ajoute, côté Studio, un défaut que la mesure a révélé : **le worker n'avait aucune
garde de réentrance**. `setInterval` relançait un tick toutes les 2 secondes alors qu'un
rendu observé en production dure **9 à 16 minutes**. Une file de N demandes lançait donc
N Chromium en 2N secondes. Ce n'est pas un risque théorique de scale-up : un seul process
suffisait.

Et un troisième défaut, indépendant mais couplé : le seuil d'orphelin valait **10 minutes**,
soit _moins_ que la durée normale d'un rendu. Un redémarrage en cours de rendu remettait en
file un travail vivant.

## Décision

**1. Un plafond de concurrence en DB**, dans `renderRequestRepository.claimNextQueued()` :
comptage des lignes `rendering` sous `pg_try_advisory_xact_lock`, qui rend
compter-puis-claim indivisible. `SKIP LOCKED` est conservé — les deux mécanismes sont
complémentaires, pas concurrents.

Verrou de **transaction** et non de session : derrière PgBouncer en mode transaction
(`DATABASE_URL` sur `:6543`), une session Node ne garde pas la même connexion serveur d'une
requête à l'autre. Un `pg_advisory_lock` de session serait pris sur un backend et relâché
sur un autre — **inopérant, et sans erreur**.

**2. Défaut à 1, réglable par `STUDIO_RENDER_MAX_CONCURRENCY`.** Le plafond est une
décision d'exploitation qui se prend avec la mémoire du conteneur sous les yeux ; en faire
une constante compilée obligerait à un déploiement pour l'ajuster. Attention à ne pas le
confondre avec `STUDIO_RENDER_CONCURRENCY` (ADR-128), qui règle le nombre d'onglets Chrome
_à l'intérieur_ d'un rendu : le coût réel est le **produit des deux**.

**3. Un battement de cœur, et un seuil d'orphelin au-dessus de la durée réelle** (30 min).
`touchRendering()` repousse `updated_at` chaque minute pendant le rendu. Sans lui, le seuil
réévalué à chaque claim remettrait en file un rendu _encore en train de tourner_, qu'un
autre worker relancerait aussitôt — le garde-fou fabriquerait le bug qu'il prévient.

**4. Une garde de réentrance in-process** (`ticking`), qui n'est pas le garde-fou mais
évite d'interroger la base toutes les 2 secondes pendant un rendu local.

## Conséquences

**Ce qui change pour un utilisateur** : deux rendus lancés en même temps sont désormais
servis l'un après l'autre. Vu les durées (9–16 min), le second attend le premier. C'est le
compromis assumé : un rendu qui attend est lent, un rendu tué par le conteneur est perdu —
et il emporte parfois son voisin.

**Le volume rend ce compromis peu coûteux** : 21 demandes de rendu _en tout_ depuis
mai 2026, la dernière le 1er juillet. Si l'usage décolle, le bon geste est de relever
`STUDIO_RENDER_MAX_CONCURRENCY` **après avoir mesuré la mémoire du conteneur**, pas de
retirer le plafond.

**ADR-054 et ADR-118 restent valides sur tout le reste** ; seule leur affirmation « le
`SKIP LOCKED` gère la concurrence » est révisée ici. Elle décrivait une propriété que ce
mécanisme n'a jamais eue.

**Ce qui n'est pas résolu** : la cause racine de la mémoire. Chromium reste coûteux, et un
seul rendu peut encore approcher la limite du conteneur. Le plafond empêche N rendus de
s'additionner ; il ne rend pas un rendu moins gourmand.

## Alternatives écartées

**Garder la garde `ticking` seule.** Elle vit dans la mémoire d'un process : deux replicas
en ont chacun une, toutes deux à `false`. C'est précisément le correctif partiel qui a été
posé côté LED avant d'être complété.

**Un sémaphore applicatif (Redis, `p-limit`).** `p-limit` a le défaut de `ticking`. Redis
ajouterait un service à facturer et à superviser pour un état que Postgres tient déjà — la
ligne `rendering` _est_ le compteur.

**Refuser le rendu (429) quand un autre tourne.** Reporte le problème sur l'utilisateur,
qui devrait réessayer à l'aveugle. La file existe pour ça.

**Découper le worker en service séparé avec son propre conteneur.** Répond au vrai problème
(l'isolation mémoire) mais coûte un service Railway, contre l'objectif de coût ≤ $10/mois —
et ne dispense pas d'un plafond dans ce conteneur.

## Références

- Implémentation : `central-server/src/repositories/templates-studio.repository.ts` (`claimNextQueued`, `touchRendering`)
- Worker : `central-server/src/services/studio-render-worker.service.ts`
- Tests : `central-server/src/repositories/render-request-concurrency.repository.test.ts`
- Garde-fou : `central-server/src/__tests__/smoke/smoke-templates-studio.test.ts`
- Précédent LED : `.claude/rules/led.md` (section concurrence du pliage)
