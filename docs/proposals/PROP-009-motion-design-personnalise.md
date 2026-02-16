# PROP-009: Motion Design Personnalisé — Vidéos dynamiques avec données joueur

> _Anciennement ADR-023_

**Date** : Février 2026
**Statut** : Proposé
**Décideurs** : Guillaume Le Tallec
**Lié à** : [PROP-004](./PROP-004-video-template-engine.md) (Moteur de Templates Vidéo — templates sponsors, cas différent)

---

## Contexte

Un designer externe crée des animations motion design dans After Effects (annonces de but, événements match, etc.). Neopro veut permettre à un opérateur de **personnaliser ces animations** (nom du joueur, numéro, couleur d'équipe) **depuis le dashboard, sans coder**, puis de déployer la vidéo personnalisée sur les Pi des clubs.

**Cas d'usage principal** : Le designer livre un template "annonce de but" → l'opérateur saisit "DUPONT #7" en bleu → une vidéo personnalisée est générée → déployée sur le Pi du club.

**Contraintes identifiées** :

- Le designer travaille dans After Effects (licence Adobe existante, PC de Gabin)
- Les animations utilisent des effets 3D et avancés non supportés par tous les formats d'export
- L'opérateur ne doit pas coder — interface formulaire dans le dashboard
- Le volume estimé est faible au départ (quelques dizaines de rendus/mois)
- Les templates changent ~1 fois par an (début de saison)
- Les personnalisations sont fréquentes (nouveaux joueurs, transferts, matchs)

**Différence avec PROP-004** : Le PROP-004 traite de l'habillage d'images sponsors (image statique → vidéo avec logo club). Ici, on parle d'animations motion design complètes avec texte dynamique et effets riches sur les lettres.

## Décision

**À prendre.** Deux options sur la table : Lottie (gratuit, léger) vs Plainly (SaaS, fidélité AE 100%). La décision dépend d'un test de faisabilité avec le designer (voir Plan d'action).

## Options

### Option A : Lottie (Bodymovin) — Export AE → JSON → lecture navigateur

**Principe** : Le designer exporte ses animations AE en fichier JSON via le plugin Bodymovin. Le JSON est joué directement dans le navigateur (dashboard pour preview, Pi pour lecture) via la librairie `lottie-web`. Le texte est remplacé dynamiquement dans le JSON.

```
Designer (AE) → export Bodymovin → .json
Dashboard → remplace texte/couleur dans le JSON → preview instantanée
Pi → lottie-web dans Angular → lecture directe (pas de .mp4)
```

**Ce que Lottie supporte** :

- Animations 2D (formes, masques, transitions, mouvements)
- Texte dynamique (remplacement dans le JSON à la volée)
- Changement de couleurs dynamique
- Animations de texte (fondu, slide, scale, rotation 2D)
- Pseudo-3D (rotations de calques sur un axe)

**Ce que Lottie ne supporte PAS** :

- Caméra 3D, extrusion 3D (Element 3D, Cinema 4D)
- Ray-traced 3D
- Certains effets (blur gaussien avancé, turbulences, distorsions)
- Certaines expressions AE complexes
- Calques vidéo embarqués
- Audio

**Avantages** :

- **Gratuit** — open-source, zéro coût par rendu, zéro abonnement
- **Preview instantanée** dans le dashboard (temps réel, pas d'attente)
- **Fichier ultra-léger** — quelques Ko vs plusieurs Mo pour un .mp4
- **Lecture directe sur le Pi** via Angular + lottie-web (pas besoin de générer un .mp4)
- **Zéro infra** — pas de serveur de rendu, pas de dépendance externe
- **Interactivité possible** — l'animation peut réagir en temps réel (score live, etc.)

**Inconvénients** :

- **Fidélité AE ~70-80%** — les effets 3D et avancés ne passent pas
- **Contrainte pour le designer** — doit créer dans les limites de Bodymovin
- **Pas d'audio** — Lottie est visuel uniquement
- **Allers-retours potentiels** — le designer livre un template → certains effets disparaissent → il doit adapter

**Estimation effort** : Moyen (intégration lottie-web dans dashboard + Pi, UI de personnalisation, gestion templates JSON)

**Coût** : 0€

### Option B : Plainly (SaaS) — Import .aep → API → rendu AE cloud → .mp4

**Principe** : Le designer uploade son projet After Effects (.aep) sur Plainly. L'opérateur personnalise via le dashboard. Le central-server appelle l'API Plainly qui rend la vidéo avec After Effects dans le cloud. Le .mp4 résultant entre dans le pipeline vidéo existant.

```
Designer (AE) → uploade .aep sur Plainly (1 fois)
Dashboard → opérateur saisit nom/numéro/couleur → appel API
Plainly → rendu AE cloud (30s-5min) → .mp4
Central-server → télécharge .mp4 → FTP → déploie sur Pi
```

**Avantages** :

- **Fidélité AE 100%** — c'est After Effects qui tourne dans le cloud
- **Aucune contrainte pour le designer** — il travaille librement dans AE
- **Import direct du .aep** — pas de conversion, pas de perte
- **Zéro infra** à gérer
- **Audio supporté** — si présent dans le .aep

**Inconvénients** :

- **Coût mensuel** — à partir de $69/mois (Starter, 50 min/mois) ou $48/mois en annuel
- **Pas de preview instantanée** — il faut lancer un rendu (30s-5min) pour voir le résultat
- **Dépendance SaaS** — si Plainly ferme, il faut migrer
- **Latence** — le rendu prend du temps, pas de temps réel
- **Vidéo .mp4 lourde** — plusieurs Mo vs quelques Ko pour un JSON Lottie

**Tarifs Plainly (février 2026)** :

| Plan     | Prix/mois | Annuel    | Minutes vidéo/mois | Vidéos 10s estimées |
| -------- | --------- | --------- | ------------------ | ------------------- |
| Starter  | $69       | $48/mois  | 50 min             | ~300/mois           |
| Explorer | $134      | $94/mois  | 100 min            | ~600/mois           |
| Team     | $259      | $182/mois | 200 min            | ~1200/mois          |

Source : [plainlyvideos.com/pricing](https://www.plainlyvideos.com/pricing)

**Estimation effort** : Faible-Moyen (intégration API REST, UI de personnalisation, cron polling statut)

**Coût** : ~576€/an minimum (Starter annuel)

### Option C (écartée) : Nexrender — Self-hosted, AE sur un PC local

**Principe** : Open-source, pilote After Effects en CLI sur une machine locale (PC de Gabin).

**Pourquoi écartée** :

- Le PC de Gabin doit être allumé et le worker en fonctionnement → dépendance humaine
- L'objectif est de tout gérer depuis le dashboard sans intervention externe
- Intéressant uniquement si le volume justifie d'éviter les coûts SaaS ET qu'on a un serveur dédié toujours allumé

**Reste une option de migration future** si le volume augmente significativement (> 400 rendus/mois → un serveur dédié + AE devient plus rentable que Plainly).

### Option D (écartée) : Remotion — Code React → vidéo

**Principe** : Le dev re-code les animations du designer en React/TypeScript. Remotion rend le code en .mp4.

**Pourquoi écartée** :

- Le dev doit **re-coder chaque animation** du designer → temps dev significatif par template
- La fidélité dépend de la capacité du dev à reproduire les effets AE en CSS/WebGL (~90%)
- Les effets 3D complexes sont très difficiles à reproduire en code
- Le designer livre juste une "référence visuelle", pas un fichier exploitable directement

**Reste une option si** les templates deviennent simples (pas de 3D) et qu'on veut 0 coût récurrent.

### Option E (écartée) : FFmpeg — Overlay texte sur vidéo

**Principe** : Le designer livre un .mp4 avec des zones réservées, FFmpeg incruste le texte.

**Pourquoi écartée** : Le texte ajouté par FFmpeg est plat (pas d'effets, pas d'animations sur les lettres). Ne répond pas au besoin d'effets riches.

## Critères de décision

| Critère                       | Poids | Option A (Lottie)           | Option B (Plainly) |
| ----------------------------- | ----- | --------------------------- | ------------------ |
| Coût                          | 25%   | ✅ 0€                       | ❌ ~576€/an min    |
| Fidélité AE                   | 25%   | ⚠️ ~70-80%                  | ✅ 100%            |
| Preview live                  | 15%   | ✅ Instantanée              | ❌ 30s-5min        |
| Autonomie (pas de dépendance) | 15%   | ✅ Open-source              | ⚠️ SaaS tiers      |
| Effort dev                    | 10%   | ⚠️ Moyen                    | ✅ Faible          |
| Contrainte designer           | 10%   | ⚠️ Doit respecter Bodymovin | ✅ Aucune          |

## Recommandation

**Tester Lottie d'abord** (Option A). Si le rendu est acceptable → Lottie. Sinon → Plainly.

Justification : Lottie est gratuit, instantané, léger, sans dépendance. Plainly est le fallback garanti si la fidélité Lottie n'est pas suffisante.

**Approche hybride possible à terme** : Lottie pour les templates simples (annonces textuelles, scores) + Plainly pour les templates premium avec effets 3D.

## Plan d'action

### Phase 1 : Test de faisabilité Lottie (avant décision)

| #   | Action                                                         | Qui                  | Durée     |
| --- | -------------------------------------------------------------- | -------------------- | --------- |
| 1   | Designer crée un template "annonce de but" de test dans AE     | Designer             | 1-2 jours |
| 2   | Designer exporte via Bodymovin en .json                        | Designer             | 1h        |
| 3   | Comparer la vidéo AE originale vs le rendu Lottie (lottie-web) | Guillaume + Designer | 1h        |
| 4   | Tester le remplacement de texte dynamique dans le JSON         | Guillaume            | 2h        |
| 5   | **Verdict** : le rendu Lottie est-il acceptable ?              | Guillaume + Designer | —         |

**Si oui → Lottie (Option A).** Passer à la Phase 2A.
**Si non → Plainly (Option B).** Passer à la Phase 2B.

### Phase 2A : Implémentation Lottie

| Priorité | Items                                                                             | Scope            |
| -------- | --------------------------------------------------------------------------------- | ---------------- |
| P0       | Migration DB (video_templates, template_renders) + types + repository             | Backend          |
| P1       | Service de gestion templates (CRUD JSON Lottie, remplacement texte/couleur)       | Backend          |
| P1       | Controller + routes API templates                                                 | Backend          |
| P2       | Composant dashboard "Templates" (liste, formulaire dynamique, preview lottie-web) | Frontend         |
| P2       | Intégration lottie-web sur le Pi (option lecture directe) OU export .mp4 serveur  | Frontend/Backend |
| P3       | Tests, polish, batch rendering (générer tout l'effectif d'un coup)                | Full stack       |

### Phase 2B : Implémentation Plainly

| Priorité | Items                                                                            | Scope      |
| -------- | -------------------------------------------------------------------------------- | ---------- |
| P0       | Créer un compte Plainly, uploader le template .aep de test                       | Ops        |
| P0       | Migration DB (video_templates, template_renders) + types + repository            | Backend    |
| P1       | Service Plainly (appels API REST) + service de rendu (orchestration)             | Backend    |
| P1       | Cron polling statut rendus (30s)                                                 | Backend    |
| P1       | Controller + routes API templates + validation Joi                               | Backend    |
| P2       | Composant dashboard "Templates" (liste, formulaire dynamique, historique rendus) | Frontend   |
| P3       | Tests, monitoring coûts, alertes quota Plainly                                   | Full stack |

### Phase 3 : Évolutions futures (quelle que soit l'option)

- Gestion d'effectif (roster) par club → génération batch de toutes les vidéos joueurs
- Nouveaux types de templates : carton, remplacement, début de match, victoire, anniversaire
- Export clip pour réseaux sociaux (partage Instagram/Twitter par le club)
- Migration Nexrender si le volume justifie un serveur dédié (> 400 rendus/mois)

## Conséquences

### Positives

1. Les clubs disposent de vidéos motion design personnalisées sans passer par un graphiste à chaque joueur
2. L'opérateur est autonome pour personnaliser les templates
3. Le designer livre un template une fois par saison, pas une vidéo par joueur

### Négatives

1. (Lottie) Le designer doit adapter son workflow aux limites Bodymovin
2. (Plainly) Coût récurrent ~576€/an minimum + dépendance SaaS

### Risques

| Risque                                                 | Probabilité | Impact | Mitigation                                                                                   |
| ------------------------------------------------------ | ----------- | ------ | -------------------------------------------------------------------------------------------- |
| Lottie : rendu trop dégradé vs AE                      | Moyenne     | Élevé  | Phase 1 = test avant engagement. Fallback Plainly.                                           |
| Plainly : fermeture du service                         | Faible      | Élevé  | Architecture agnostique (interface backend commune). Migration vers Nexrender ou Creatomate. |
| Plainly : dépassement quota / coût imprévu             | Moyenne     | Moyen  | Monitoring consommation + alertes. Starter suffit pour le volume actuel.                     |
| Designer ne veut pas adapter ses templates pour Lottie | Moyenne     | Moyen  | Discussion en amont. Plainly en alternative.                                                 |

## Références

- [PROP-004: Moteur de Templates Vidéo](./PROP-004-video-template-engine.md) — Templates sponsors (cas différent)
- [Bodymovin — Fonctionnalités supportées](https://airbnb.io/lottie/#/supported-features)
- [Plainly — Tarifs](https://www.plainlyvideos.com/pricing)
- [Plainly — API Documentation](https://docs.plainlyvideos.com/)
- [lottie-web (GitHub)](https://github.com/airbnb/lottie-web)
- [Nexrender (GitHub)](https://github.com/inlife/nexrender) — Option future self-hosted
- [image-to-video.service.ts](../../central-server/src/services/image-to-video.service.ts) — Pattern existant de rendu vidéo serveur
- [content.controller.ts](../../central-server/src/controllers/content.controller.ts) — Pipeline upload vidéo existant
- [deployment.service.ts](../../central-server/src/services/deployment.service.ts) — Déploiement vidéo vers Pi

---

_Créé le 16 février 2026_
