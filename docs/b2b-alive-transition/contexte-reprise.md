# Contexte de reprise — B2B Alive / Gwenvael

_À coller en début d'une nouvelle session Claude Code pour reprendre ce fil sans tout reconstruire. Dernière mise à jour : 07/09/2026._

## Statut de ce travail

**Transitoire, volontairement hors du repo `madxp`** (qui est public — n'y jamais committer d'analyse concurrentielle B2B Alive ni de stratégie de transition personnelle). MadXP sert de **banque de comparaison** qu'on interroge au fil de l'eau, jamais de support de stockage pour ce travail. Persistance = les artefacts claude.ai + ce fichier, rien d'autre pour l'instant.

## Le mandat, en une phrase

Gwenvael rejoint **B2B Alive** comme Head of Sport (BO/PO/PM) sur l'équipe **Broadcaster**. Il vient de **MadXP**, un concurrent/futur partenaire dont il connaît le code et les specs (repo `Tallec7/madxp`, attaché). Deux devs en face : **Florent** (lead dev, tout le carnet lui appartient), **Amine** (second dev, sous-employé). **Mandat explicite : lecture seule dans Linear, aucune écriture, tant que rien d'autre n'est décidé.**

## Ce qui existe déjà (dossier de 13 documents, publiés sur claude.ai)

Index : **https://claude.ai/code/artifact/1df0ae10-4a62-4f61-9b54-b24103f365fb**

Ouvrir l'index en premier dans toute nouvelle session (`Artifact action:"read"` sur cette URL) — il liste les 13 documents avec liens et résumés à jour. Ne pas les recréer.

Les deux à projeter en priorité si peu de temps : **Avant/Après** (09→13 dans l'index) et **Linear rangé** (maquette sur tickets réels) — ce dernier contient encore des chiffres et une structure de projets datés du 03/09, voir section suivante.

## Nouvel artefact du 07/09 : classeur Excel de migration

`linear-broadcaster-rangement.xlsx` (12 onglets) — export live des 469 issues, structure finale à 18 projects (5 paris retenus + fusions/scission vérifiées + 2 nouveaux projects proposés), colonnes Voie/Classe/Apport/Site calculées ticket par ticket avec confiance explicite. Rien écrit dans Linear. À rouvrir/régénérer plutôt que refaire ce travail de zéro — le script Python qui le génère est réutilisable (`build_excel.py`, scratchpad de session).

**Décisions actées dans ce classeur, en écart avec les documents 04/13 d'origine (datés du 02-03/09)** :

- Structure à **18 projects**, pas les ~20-26 d'origine : Multi-scènes & câblage → fusionné dans Playlists ; Poids des médias + Studio de templates → fusionnés dans Templates ouverts ; UX contenus → scindé (Médiathèque & catalogue de modèles / Cloud-Portail) ; les 2 projects Compositeur (100% clos) → un nouveau project "Compositeur d'écran — suite" créé pour les 7 tickets de continuation, sans rouvrir les clos.
- **Réforme, Stock, Dépannage, Préparation à archiver** (0 usage réel sur 469 tickets — la doctrine du document 04 les décrivait comme "une vraie trouvaille" sans avoir vérifié, cf. leçon de méthode ci-dessous).
- **Site restreint à Guingamp seul** pour l'instant — Strasbourg pas créé tant que l'enceinte n'est pas revenue au calendrier.
- **Exploitation à traiter comme un essai** (revue à 4-6 semaines), pas comme un label acquis.

## Sources d'information et leurs règles d'usage

- **Linear (`b2b-alive`, équipe Broadcaster)** — accès MCP, lecture seule. Seule source pour un **état courant**. Le carnet bouge vite (~15 tickets/jour) : **tout chiffre cité doit être revérifié le jour où on l'utilise**, jamais réutilisé d'une session à l'autre sans recompter.
- **Notion (espace B2B-Broadcast)** — accès MCP. Contient de la doctrine (comment le système marche) et un **journal** (récaps de match, briefs d'intervention) qui sont des **instantanés datés, jamais des états courants**. Erreur commise et corrigée dans cette session : avoir affirmé « pas de ticket » sur un sujet en se basant sur un récap du 15/08, alors que 7 tickets existaient déjà début septembre. **Toujours croiser une affirmation de manque du Notion avec une recherche Linear avant de l'utiliser.**
- **Repo `apps/b2b-broadcast`** et son dossier `plans/` (28 plans de chantier) — **hors d'accès à cette session**, pas dans les repos attachés. Toute réserve du dossier qui dit « je n'ai pas pu vérifier dans plans/ » reste ouverte.
- **Espace Notion « Documentation B2B Alive »** (base _Installations_, parc matériel) — mentionné mais **jamais consulté**, accès non disponible.
- **b2b-alive.com** — bloqué (EGRESS_BLOCKED), tout ce qui vient du site public est via résumés de recherche seulement, pas vérifié en direct.

## Faits établis à ce jour (à reconfirmer avant réutilisation, surtout les chiffres)

- B2B Alive : fabricant/intégrateur LED (Londres 2013), le logiciel Broadcaster est venu après. Aucun client payant sur le logiciel — 2 sites en démo (Guingamp, Rhénus Strasbourg), 1 prospect (Mosson).
- Goulot du flux d'adoption : ni l'installation, ni la qualification matériel (≈1h, mesurée), mais la **préparation des médias** (transferts manuels, pas de dédoublonnage, ré-encodage) — désignée par l'équipe elle-même comme premier poste de temps. La plupart des tickets qui la couvrent existent déjà (vérifié le 03/09) ; une seule étape (pré-pliage à la source) n'a aucun ticket.
- **137 tickets sans propriétaire ouverts** (relevé 07/09, export complet 469 issues — le chiffre du 03/09, 113, est obsolète, ne pas le réutiliser).
- 3 flux de valeur retenus comme futures initiatives Linear : _Du LED installé à l'écran qui vit_ / _De l'annonceur à la preuve_ / _Du constat au correctif_. Confirmé le 07/09 sur 469 tickets : le déséquilibre est encore plus marqué qu'estimé le 03/09 — quasiment tout le travail non-jalon sert le flux adoption.
- Le flux revenu (annonceur → preuve) est très sous-représenté dans les projets en cours par rapport au flux adoption.
- **La taxonomie matérielle (Réforme/Stock/Dépannage/Préparation) a 0 usage réel sur 469 tickets** — vérifié le 07/09, question restée ouverte dans le document 04 depuis le 02/09.

## Ce qui reste à faire (le vrai prochain pas, pas un document de plus)

1. Recalculer les chiffres cités dans les docs 03, 12, 13 avant tout usage — **fait le 07/09 dans `linear-broadcaster-rangement.xlsx`**, à ne pas refaire depuis zéro.
2. Caler la réunion d'arbitrage avec Florent (trame prête : document 04) — **document 04 à corriger avant envoi** (réglage 12 affirme sans preuve que l'axe matériel est "une vraie trouvaille" ; réglage 7 traite encore Guingamp/Strasbourg à égalité).
3. Faire trancher les 5 tickets d'Amine, la limite d'encours, l'attribution des paris aux initiatives — tout est proposé, rien n'est décidé.
4. Coller les documents 10 et 11 dans Notion (page d'accueil + en-têtes), une fois validés.
5. **Nouveau** : faire trancher par Florent le nom/portée de "Compositeur d'écran — suite" et si "Tests de la remote" doit être élargi (aujourd'hui : dette de test seulement, la feature remote est éclatée sur 7 projects).

## Une leçon de méthode à ne pas reperdre

Sur ce sujet, j'ai eu tort à plusieurs reprises en confondant une source excellente mais **datée** avec un **état courant** (le métier d'origine de B2B Alive, le coût de qualification matériel, l'existence de tickets sur l'ingest média). Dans une nouvelle session : **vérifier avant d'affirmer un manque**, ne pas prendre un document Notion pour argent comptant sur l'état présent.

**Exemple concret du 07/09** : le document 04 (`regime-de-travail.html`) posait lui-même la question _"la taxonomie [matérielle] est-elle réellement portée par les tickets, ou existe-t-elle sans être utilisée ? Je ne l'ai pas vérifié"_ — et la décrivait pourtant comme _"une vraie trouvaille"_ sans attendre la réponse. Vérifié le 07/09 sur les 469 tickets : 0 usage sur 4 des 6 labels de cet axe. La leçon n'est pas seulement "vérifier avant d'affirmer un manque" (le cas Notion) — c'est aussi **vérifier avant de complimenter une structure qu'on n'a pas mesurée**, dans son propre document.

## Ce que je n'ai jamais fait, et qu'il ne faut pas faire sans instruction explicite nouvelle

Aucune écriture dans Linear (ticket, priorité, assignation, étiquette, initiative). Aucune écriture dans Notion. Tout le dossier est en propositions à valider par Gwenvael et/ou Florent.
