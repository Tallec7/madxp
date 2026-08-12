# ADR-142: Le badge « vidéos manquantes » d'un site compte ce qui est diffusé

**Date** : 2026-08-11
**Statut** : Accepté
**Format** : Léger

---

## Contexte

La PR #1165 a branché l'alerting de l'audit FTP sur `config_profiles.configuration`,
en établissant que `site_videos` ne décrit pas la diffusion. La restitution qui reste
à l'écran, elle, n'a pas suivi : le badge du tab « Contenu » de `/sites/:id`, sa
bannière détaillée et le tri « impact » de la vue admin flotte continuaient de
compter via `site_videos`.

Mesuré en prod le 2026-08-11 sur les 51 lignes de `video_ftp_audit_warnings` :

| Site                          | Badge affiché | Fichiers réellement concernés |
| ----------------------------- | ------------- | ----------------------------- |
| Gymnase de la Bottière        | 2             | **20**                        |
| Gymnase Mangin-Beaulieu (NLF) | **0**         | **17**                        |
| Saas Lanester HB              | 1             | **15**                        |
| GLT Sport                     | **0**         | **14**                        |

`site_videos` ne voyait que **3 des 51 lignes**. Le tableau de bord ne se taisait
pas : il affichait un chiffre rassurant. C'est le mode d'échec le plus coûteux —
un écran vide invite à chercher ailleurs, un « 0 » clôt la question.

Deux conséquences en cascade, moins visibles :

- `findAllActive.reference_count` — le « nombre de sites impactés » qui **trie** la
  vue admin flotte — renvoyait 0 pour 48 des 51 lignes. Le tri « impact
  décroissant » ne triait donc rien, et rangeait les sponsors facturés diffusés
  derrière des orphelines sans effet.
- `findActiveForSite` sert aussi de **garde** à `unlinkSiteFtpOrphan`. Cet endpoint
  purge déjà le JSONB des profils et le mirror (son `DELETE FROM site_videos` n'est
  qu'une de ses cinq étapes, no-op sans lien), mais sa garde refusait les vidéos
  référencées en config seule — c'est-à-dire la quasi-totalité des cas réels.
  L'action « Retirer du site » était donc indisponible précisément là où elle
  servait.

## Décision

Le rattachement d'un fichier absent à un site devient l'**union** « présent dans la
bibliothèque du site (`site_videos`) **OU** référencé par un de ses profils de
config ». Le prédicat est factorisé (`LINKED_TO_SITE`) et partagé par
`countActiveForSite`, `findActiveForSite` et le `reference_count` de
`findAllActive`, pour que le chiffre du badge et le contenu de la liste ne puissent
pas diverger.

L'union, et non la config seule : restreindre à la config serait le symétrique de
l'erreur d'origine. Une vidéo assignée en bibliothèque mais pas encore dans la
boucle plantera quand même si la télécommande la déclenche — ce que le texte de la
bannière annonce explicitement.

Deux détails SQL portent la correction :

- **`strpos()` et non `LIKE`** : les noms de fichiers sont pleins de `_`, joker
  « n'importe quel caractère » en LIKE. `LIKE '%TV_PART03%'` matcherait `TVxPART03`.
- **`filename` ET `original_name`** : la config référence le nom d'origine
  (`TV_PART03_SPORT&WELNESS.mp4`) là où `storage_path` porte le nom assaini
  (`TV_PART03_SPORTWELNESS.mp4`).

## Alternatives rejetées

- **Restreindre le badge à `config_profiles` seul** : rejeté, cf. ci-dessus — une
  vidéo assignée et déclenchable à la télécommande reste un incident.
- **Corriger seulement le badge, pas la garde d'unlink** : rejeté. Montrer un
  problème sans permettre de le traiter est une demi-mesure ; les deux vues
  partagent volontairement la même méthode.
- **Changer le périmètre côté frontend** : rejeté, aucun changement n'y est
  nécessaire — l'endpoint d'unlink fait déjà le bon travail, seule sa garde le
  bloquait.

## Conséquences

- Les quatre écrans concernés afficheront d'un coup un volume d'anomalies qui
  existait déjà mais restait invisible. Ce n'est pas une régression.
- L'action « Retirer du site » redevient utilisable là où elle était bloquée.
- Deux jauges Prometheus (`madxp_video_ftp_missing_referenced_current` et
  `..._sites_current`) exposent le sous-ensemble diffusé, avec remise à zéro
  explicite quand plus rien n'est impacté. Ce sont elles qu'il faut superviser,
  pas `madxp_video_ftp_orphans_current` qui mélange 30 orphelines de ménage et les
  pannes réelles.
- Coût mesuré en prod : ~200 ms pour le badge d'un site, ~215 ms pour la vue admin
  (200 lignes corrélées sur 25 sites). Acceptable sur des endpoints admin, à
  réévaluer si le parc décuple.

## Suite identifiée, non traitée ici

Le croisement de l'alerting (#1165) porte sur `expected_path`, donc sur le nom
**assaini**. Or la config référence fréquemment le nom d'**origine**. Mesuré le
2026-08-11 :

| Croisement                               | Fichiers vus | Sites |
| ---------------------------------------- | ------------ | ----- |
| `expected_path` (alerting actuel, #1165) | 42           | 5     |
| `filename` + `original_name` (ce ADR)    | **70**       | **7** |

L'alerte sous-déclare donc l'incident — Lanester alerte sur 8 fichiers là où 15 de
ses vidéos diffusées sont absentes, et deux clubs (KALON BREIZH CUP-1, Demo SaaS)
ne déclenchent aucune alerte. Aligner `findMissingReferencedInProfiles` sur le même
critère est une correction d'une ligne, volontairement laissée hors de cet ADR :
elle change le périmètre d'un émetteur d'alertes fraîchement mergé, ce qui mérite sa
propre revue.

## Fichiers impactés

- `central-server/src/repositories/video-ftp-audit.repository.ts` — prédicat
  `LINKED_TO_SITE`, appliqué à `countActiveForSite()`, `findActiveForSite()` et au
  `reference_count` de `findAllActive()`
- `central-server/src/services/video-ftp-audit.service.ts` — publication des jauges
  à l'issue de `notifyMissingReferencedInProfiles()`
- `central-server/src/services/metrics.service.ts` — deux jauges
- `docker/grafana/provisioning/dashboards/json/cloud/madxp-blind-spots-cloud.json`
- `central-server/src/__tests__/smoke/smoke-video-ftp-badge-scope.test.ts`
