# OBS Studio

> **Pitch en 1 phrase** : Logiciel open-source de production vidéo / streaming, gratuit, ultra-populaire, parfois détourné par des clubs débrouillards comme "solution maison" pour afficher score et sponsors sur une TV.
>
> **Priorité concurrentielle** : 🔴 Haute — combat psychologique du "pourquoi payer quand c'est gratuit".
> **Date de collecte** : 2026-04-23

## Identité

- **Nom complet** : Open Broadcaster Software (OBS)
- **Type** : Open-source (GPL), 100% gratuit
- **Site** : https://obsproject.com/
- **Communauté** : massive, mondiale (millions d'utilisateurs)
- **Cas d'usage principal** : streaming Twitch/YouTube, enregistrement vidéo

## Pourquoi c'est un concurrent de MadXP

Confirmation utilisateur : des clubs sportifs débrouillards utilisent OBS pour bricoler une solution d'affichage TV. Le scénario typique :

1. Un bénévole technique du club installe OBS sur un PC
2. Il crée des "scènes" avec : sources vidéo (caméra match), images logos sponsors, textes de score saisis manuellement
3. Sortie HDMI vers une TV du hall ou de la buvette
4. Il switche manuellement les scènes pendant les matchs

**Coût pour le club : 0 €** — d'où la concurrence.

## Capacités OBS pertinentes

- **Multi-source** : caméras, captures d'écran, images, textes, navigateurs web (= overlays HTML possibles)
- **Multi-scène** : 8 scènes minimum visibles via Multiview
- **Filtres / effets** : chroma key, transitions
- **Gratuité totale**, multi-plateforme (Win/Mac/Linux)
- **Plugins** : énorme écosystème (overlays score, automations basiques)

## Limites concrètes en usage "TV club"

| Limite OBS                                                         | Impact pour le club                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------ |
| ❌ **Pas de gestion à distance**                                   | Quelqu'un doit physiquement être devant le PC à chaque match |
| ❌ **Pas de multi-écran flotte**                                   | Si le club a 2 écrans (hall + buvette), il faut 2 PC + 2 OBS |
| ❌ **Pas de mise à jour OTA contenu**                              | Tout changement de sponsor = manipulation manuelle           |
| ❌ **Pas de rotation pondérée sponsors**                           | Aucune logique métier sponsoring                             |
| ❌ **Pas de reporting impressions**                                | Le sponsor n'a aucune preuve de diffusion                    |
| ❌ **Pas de monitoring**                                           | Si OBS plante en plein match, personne n'est alerté          |
| ❌ **Pas de templates dynamiques data-driven**                     | Tout est hardcodé dans la scène                              |
| ❌ **Pas de multi-tenant**                                         | Pas de séparation club / sponsor / agency                    |
| ❌ **Saisie manuelle du score**                                    | Erreurs humaines, charge bénévole                            |
| ❌ **Pas de support**                                              | Forum communautaire, aucun SLA                               |
| ❌ **Pas de mobile**                                               | OBS desktop uniquement                                       |
| ❌ **Pas de cloud sync**                                           | Si le PC change, tout est à refaire                          |
| ❌ **Pas d'intégration data sport** (scores fédéraux, calendriers) | Saisie manuelle 100%                                         |
| ❌ **Pas de hardware embedded**                                    | Nécessite un PC complet (vs Pi à 80€)                        |

## Pricing & TCO réel

| Élément                     | Coût apparent | Coût réel                                                 |
| --------------------------- | ------------- | --------------------------------------------------------- |
| Logiciel                    | **0 €**       | 0 €                                                       |
| PC requis                   | non chiffré   | **400-1000 €** (PC dédié obligatoire pour ne pas planter) |
| Temps bénévole installation | "gratuit"     | **20-40h** (config initiale + apprentissage)              |
| Temps bénévole par match    | "gratuit"     | **2-4h** (préparation + opération + débriefing)           |
| Mise à jour sponsors        | "gratuit"     | **30 min/sponsor** × N sponsors × N changements/an        |
| Risque de panne en match    | invisible     | **Image club dégradée** + perte sponsors                  |
| Pas de reporting sponsors   | invisible     | **Impossible de monétiser correctement**                  |

**TCO estimé an 1** pour un club avec 30 matchs et 5 sponsors : **PC 600€ + 200h bénévole** ≈ équivalent 4-6k€ de coût caché si on valorise le bénévolat à 20-30€/h.

## Positionnement vs MadXP

| Dimension                  | OBS bricolé             | MadXP              |
| -------------------------- | ----------------------- | ------------------ |
| Coût licence               | 0 €                     | OpEx mensuel       |
| TCO réel an 1              | 4-6k€ caché (bénévolat) | Tarif transparent  |
| Mise en service            | 20-40h bénévole         | Plug & play Pi     |
| Gestion à distance         | ❌                      | ✅ Dashboard cloud |
| Multi-écran flotte         | ❌                      | ✅ Native          |
| Régie pub multi-annonceurs | ❌                      | ✅                 |
| Reporting sponsors         | ❌                      | ✅                 |
| Monitoring temps réel      | ❌                      | ✅                 |
| Support pro                | ❌                      | ✅                 |
| Robustesse en match        | 🟡 dépend du bénévole   | 🔴 Pi watchdog     |

## Pitch différenciateur MadXP vs OBS (draft)

> \*\*"OBS est gratuit, c'est vrai. Et excellent pour streamer un match sur YouTube.
> Mais pour piloter votre TV de hall pendant 30 matchs par saison, avec 5 sponsors
> à faire tourner et un reporting à fournir à vos partenaires, OBS coûte en réalité
> plus cher que MadXP :
>
> - Le bénévole technique passe 200h/an dessus (quel est le coût réel ?)
> - Vous ne pouvez pas prouver à vos sponsors que leur logo a tourné X fois
> - Si OBS plante en finale de coupe, vous n'avez personne à appeler
> - Vous ne pouvez pas gérer 2 écrans depuis le même endroit
>
> MadXP vous coûte un abonnement mensuel transparent, et libère votre bénévole
> pour ce qu'il fait le mieux : faire vivre le club."\*\*

**Stratégie** : ne pas dénigrer OBS (excellent outil dans son domaine). Mettre en avant le **coût caché du bricolage** + la **monétisation sponsor impossible sans reporting**.

## Risques pour MadXP

1. **OBS + plugin score communautaire** : un plugin malin pourrait combler une partie du gap
2. **Streamlabs / vMix** : versions semi-pro d'OBS, pourraient évoluer vers du multi-écran
3. **Effet "ça marche déjà"** : un club déjà équipé OBS aura du mal à passer à du payant

## Actions recommandées

1. **Étude de cas** : interviewer 2-3 clubs qui ont fait la transition OBS → MadXP (ROI bénévole)
2. **Calculateur de TCO** sur le site MadXP : "Combien vous coûte vraiment OBS ?"
3. **Argumentaire commercial dédié** : kit de réponse "OBS objection"
4. **Veille** sur les plugins OBS dédiés au sport (potentielle commoditisation)

## Notes sur les outils adjacents (Singular.live, vMix, Wirecast)

- **Singular.live** : graphics overlay broadcast SaaS — concurrent UX direct du Template Studio v2 → analyse session 2
- **vMix / Wirecast** : OBS pro, payants, mêmes limites pour le use-case TV club
- **Streamlabs** : OBS rebrandé + monétisation streaming, pas pertinent pour la TV club

## Sources

- [OBS Project — site officiel](https://obsproject.com/) (2026-04-23)
- [Tutoriel OBS multi-écran — Monte Ton Cab](https://montetoncab.fr/utilisation-dobs-studio-pour-streamer-ou-enregistrer-vos-videos-multi-screen/) (2026-04-23)
- [OBS Forum — Multi-écran](https://obsproject.com/forum/threads/enregistrer-sur-multi-%C3%A9cran-ou-un-seul-%C3%A9cran.181490/) (2026-04-23)
- [Tutoriel OBS Studio — Own3D](https://www.own3d.tv/fr/blog/tutoriels/tutoriel-obs/) (2026-04-23)
