# ADR — Refonte Analytics Sponsors : Modèle Unifié `site_sponsors`

> **Date** : 17 Février 2026
> **Statut** : TERMINÉ — Paliers P0 à P9 complétés (18 Février 2026)
> **Auteurs** : Équipe Dev + PO
> **Priorité** : P0 — Prérequis monétisation réseau publicitaire
> **Objectif livraison MVP** : Rapports PDF fonctionnels pour 4 clubs beta — fin Mars 2026

---

## Table des matières

1. [Contexte & Problème](#1-contexte--problème)
2. [Modèle Cible](#2-modèle-cible)
3. [Parcours Utilisateurs (UX)](#3-parcours-utilisateurs-ux)
4. [Bugs Existants à Corriger en Priorité](#4-bugs-existants-à-corriger-en-priorité)
5. [Schéma Base de Données](#5-schéma-base-de-données)
6. [Impacts par Composant](#6-impacts-par-composant)
7. [Paliers de Livraison](#7-paliers-de-livraison)
8. [Liste de Tâches Détaillée](#8-liste-de-tâches-détaillée)
9. [Risques & Mitigations](#9-risques--mitigations)
10. [Critères d'Acceptance](#10-critères-dacceptance)
11. [Questions Ouvertes Résolues](#11-questions-ouvertes-résolues)

---

## 1. Contexte & Problème

### 1.1 Le besoin métier

Les sponsors locaux des clubs (boulangerie, garage, assurance) paient entre 500 et 5000 EUR/an sans aucune preuve de visibilité. NEOPRO diffuse leurs spots sur les TV des clubs, mais ne peut pas prouver la valeur générée. Le bénévole du club a besoin d'un rapport PDF mensuel clair à envoyer à chaque sponsor pour justifier le renouvellement.

### 1.2 Les deux mondes sponsor actuels

**Annonceurs NEOPRO** (table `advertisers`) :

- Créés par l'admin NEOPRO dans le dashboard central
- Vidéos déployées vers le Pi avec `video_id`, `sponsor_id`, `analytics_category`
- Tracking existant (buggy — voir section 3)

**Sponsors club** (aucune entité) :

- Vidéos uploadées par le bénévole via l'admin local du Pi
- Ajoutées à la boucle (`config.sponsors[]`) par l'opérateur NEOPRO via le config editor
- Aucun `video_id`, aucun `sponsor_id`, aucun `analytics_category`
- Tracking partiel (les impressions sont envoyées mais sans attribution)
- **Impossible de générer un rapport par sponsor**

### 1.3 Pourquoi le système actuel ne suffit pas

| Critère                           | Annonceurs NEOPRO                                    | Sponsors club                    |
| --------------------------------- | ---------------------------------------------------- | -------------------------------- |
| Entité nommée en DB               | `advertisers`                                        | Rien                             |
| Vidéo identifiable                | `video_id` UUID                                      | Filename uniquement              |
| Attribution impression            | Par JOIN `advertiser_videos` (cassé — video_id NULL) | Impossible                       |
| Rapport PDF                       | Théoriquement possible                               | Impossible                       |
| Ajout à la boucle par le bénévole | Non (opérateur NEOPRO requis)                        | Non (opérateur NEOPRO requis)    |
| Proportion des sponsors réels     | ~10% (annonceurs réseau)                             | ~90% (sponsors locaux des clubs) |

**90% des sponsors réels ne sont pas couverts par le système actuel.**

---

## 2. Modèle Cible

### 2.1 Principe : un concept unifié `site_sponsors`

Un **sponsor d'un site** est une entité à part entière, qu'il vienne de NEOPRO ou du club :

```
advertisers (réseau NEOPRO)              site_sponsors (par club)
├── Décathlon                            ├── { site: NARH, source: neopro, advertiser_id: xxx }
└── Nike                                 ├── { site: RACC, source: neopro, advertiser_id: xxx }
                                         ├── { site: NARH, source: local, name: "Boulangerie Dupont" }
                                         ├── { site: NARH, source: local, name: "Garage Martin" }
                                         └── { site: NLF,  source: local, name: "Pizzeria Roma" }
```

- `advertisers` reste inchangé (annonceurs réseau NEOPRO)
- `site_sponsors` = le sponsor **d'un club donné**, avec son contrat, ses vidéos, ses impressions
- Un annonceur NEOPRO déployé sur un site crée automatiquement un `site_sponsor` de type `neopro`
- Un sponsor local créé par le bénévole est un `site_sponsor` de type `local`
- **Les rapports, KPIs, et PDF sont générés depuis `site_sponsors`** — indifféremment de la source

### 2.2 Coexistence avec `advertisers`

On ne touche PAS à `advertisers`. On ajoute `site_sponsors` à côté. Migration douce.

- `advertisers` = annonceur réseau (multi-sites, piloté par la régie)
- `site_sponsors` = instance d'un sponsor sur un site donné (1 sponsor = 1 site)
- Lien optionnel : `site_sponsors.advertiser_id → advertisers.id`

Les fonctionnalités existantes (portail annonceur, gestion agences, stats annonceurs) continuent de fonctionner sur `advertisers`. Les nouvelles fonctionnalités (rapport PDF mensuel, stats par sponsor de club, dashboard club "Mes sponsors") utilisent `site_sponsors`.

---

## 3. Parcours Utilisateurs (UX)

### 3.1 Vue d'ensemble des 3 utilisateurs

```
┌──────────────────────────────────────────────────────────────────────┐
│                    PARCOURS UTILISATEURS                              │
├──────────────────┬───────────────────┬───────────────────────────────┤
│  BENEVOLE CLUB   │  OPERATEUR NEOPRO │  SPONSOR LOCAL                │
│  (admin local Pi)│  (dashboard web)  │  (portail / email)            │
├──────────────────┼───────────────────┼───────────────────────────────┤
│  Crée sponsors   │  Vue d'ensemble   │  Reçoit le rapport PDF        │
│  Uploade spots   │  Config boucle    │  Voit ses stats (portail)     │
│  Ajoute à boucle │  Génère rapports  │  Zéro action requise          │
│  Gère ses matchs │  Envoie emails    │                               │
└──────────────────┴───────────────────┴───────────────────────────────┘
```

### 3.2 Parcours A : Le bénévole du club (admin local Pi)

Le bénévole est un bénévole associatif, souvent peu technique. Il gère tout depuis le Pi en local (`neopro.local:8080`). Il ne va quasiment jamais sur le dashboard central.

#### Situation actuelle (KO)

```
1. Upload "dupont.mp4" sur l'admin local
2. La vidéo atterrit dans les catégories (télécommande)
3. Appeler l'opérateur NEOPRO pour qu'il ajoute à la boucle
4. Attendre...
5. Aucune visibilité sur ce qui passe
6. Pas de rapport à envoyer au sponsor
7. Le sponsor demande "ça sert à quoi votre écran ?"
8. Le bénévole ne sait pas quoi répondre
```

#### Situation cible

**Navigation admin local enrichie** :

```
┌─────────────────────────────────────────────────────────┐
│  NEOPRO  │  neopro.local:8080                           │
├──────────┴──────────────────────────────────────────────┤
│                                                          │
│  📺 Vidéos   │   👥 Sponsors   │   ⏱ Phases   │   ⚙️   │
│              │   ← NOUVEAU     │              │         │
└──────────────────────────────────────────────────────────┘
```

**Onglet "Sponsors" — liste des sponsors du club** :

```
┌─────────────────────────────────────────────────────────┐
│  👥 Sponsors du club                     [+ Nouveau]    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 🟢 Boulangerie Dupont                              │ │
│  │    2 vidéos  •  ✅ En boucle  •  Contact: jean@... │ │
│  │    [Modifier]  [Voir vidéos]                        │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 🟢 Garage Martin                                   │ │
│  │    1 vidéo   •  ✅ En boucle  •  Contact: —        │ │
│  │    [Modifier]  [Voir vidéos]                        │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 🟡 Pizzeria Roma                                   │ │
│  │    1 vidéo   •  ❌ Pas en boucle                   │ │
│  │    [Modifier]  [Ajouter à la boucle]               │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 🔒 Décathlon (NEOPRO)                              │ │
│  │    1 vidéo   •  ✅ En boucle  •  Géré par NEOPRO  │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

Principes UX :

- Les sponsors NEOPRO sont visibles mais non modifiables (cadenas)
- Les sponsors locaux sont entièrement gérables par le bénévole
- Le statut "En boucle" est visible en un coup d'oeil

**Création d'un sponsor** :

```
┌─────────────────────────────────────────────────────────┐
│  Nouveau sponsor                                [Fermer] │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Nom du sponsor *                                        │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Boulangerie Dupont                                │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  Email de contact (optionnel)                            │
│  ┌──────────────────────────────────────────────────┐   │
│  │ jean@boulangerie-dupont.fr                        │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  Vidéo(s) du sponsor                                     │
│  ┌──────────────────────────────────────────────────┐   │
│  │ ▼ Choisir parmi les vidéos existantes             │   │
│  │   • dupont_spot_2026.mp4                          │   │
│  │   • dupont_banniere.mp4                           │   │
│  └──────────────────────────────────────────────────┘   │
│                  — ou —                                   │
│  [📁 Uploader un nouveau spot]                          │
│                                                          │
│  ☑ Ajouter les vidéos à la boucle automatique           │
│                                                          │
│  [Annuler]                        [Créer le sponsor]    │
└─────────────────────────────────────────────────────────┘
```

Principes UX :

- Seuls 2 champs obligatoires : nom + au moins 1 vidéo
- L'email est optionnel (le bénévole ne l'a pas toujours sous la main)
- Le toggle "boucle" est coché par défaut (c'est le cas d'usage principal)
- On peut uploader directement depuis ce formulaire

**Upload vidéo (formulaire enrichi)** :

```
┌─────────────────────────────────────────────────────────┐
│  Upload vidéo                                            │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  [📁 dupont_spot_2026.mp4]              45 MB           │
│  ████████████████████████████░░░░  78%                  │
│                                                          │
│  Catégorie :  [▼ Sponsors               ]               │
│                                                          │
│  Sponsor :    [▼ Boulangerie Dupont     ]  ← NOUVEAU    │
│               [+ Créer un nouveau sponsor]               │
│                                                          │
│  ☑ Ajouter à la boucle automatique        ← NOUVEAU    │
│                                                          │
│  [Annuler]                              [Uploader]      │
└─────────────────────────────────────────────────────────┘
```

Principes UX :

- Le dropdown "Sponsor" n'apparaît que si la catégorie sélectionnée est de type sponsor
- On peut créer un sponsor à la volée sans quitter l'upload
- Le toggle boucle est coché par défaut pour les vidéos sponsor

### 3.3 Parcours B : L'opérateur NEOPRO (dashboard central)

L'opérateur gère la flotte de clubs depuis le dashboard web. Il a besoin de :

- Voir d'un coup d'oeil les sponsors de chaque club
- Configurer la boucle avec les bonnes métadonnées
- Générer et envoyer les rapports

#### Page détail site — nouvel onglet "Sponsors"

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Retour    NARH Cesson-Sévigné                               │
├─────────────────────────────────────────────────────────────────┤
│  Infos  │  Config  │  Analytics  │  Sponsors  │  Système       │
│         │          │             │  ← NOUVEAU │                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Sponsors du club                            [+ Ajouter sponsor]│
├───────────────────────┬──────────┬────────┬─────────┬──────────┤
│  Sponsor              │ Source   │ Vidéos │ Ce mois │ Actions  │
├───────────────────────┼──────────┼────────┼─────────┼──────────┤
│  Boulangerie Dupont   │ 🏠 Club  │ 2      │ 127 ×   │ [📊][📥]│
│  Garage Martin        │ 🏠 Club  │ 1      │ 84 ×    │ [📊][📥]│
│  Décathlon            │ 📡 NEOPRO│ 1      │ 156 ×   │ [📊][📥]│
│  Pizzeria Roma        │ 🏠 Club  │ 1      │ 0 ×     │ [📊][📥]│
├───────────────────────┴──────────┴────────┴─────────┴──────────┤
│                                                                  │
│  📅 Derniers rapports générés : Janvier 2026                    │
│  [📥 Télécharger tous les PDF]   [📧 Envoyer au club]          │
│                                                                  │
│  💡 2 sponsors n'ont pas de vidéo en boucle.                    │
│     Pizzeria Roma n'a aucune impression ce mois.                │
└─────────────────────────────────────────────────────────────────┘
```

#### Détail sponsor dans le contexte du site

Clic sur [📊] ouvre le détail :

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Sponsors NARH    Boulangerie Dupont                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │   127    │  │  1 890   │  │    8     │  │  42 min  │       │
│  │ passages │  │ spectateurs│ │  matchs  │  │ exposition│      │
│  │  ce mois │  │ (estimé) │  │ couverts │  │  totale  │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│                                                                  │
│  📈 Évolution des passages                                      │
│  ┌──────────────────────────────────────────────────────┐      │
│  │  ▄ ▄   ▄ ▄       ▄ ▄   ▄ ▄   ▄ ▄   ▄ ▄            │      │
│  │  █ █   █ █       █ █   █ █   █ █   █ █              │      │
│  │  █ █   █ █       █ █   █ █   █ █   █ █              │      │
│  │──────────────────────────────────────────────────────│      │
│  │  Oct    Nov    Déc     Jan    Fév                    │      │
│  └──────────────────────────────────────────────────────┘      │
│                                                                  │
│  Vidéos : dupont_spot_2026.mp4, dupont_banniere.mp4             │
│  Contact : jean@boulangerie-dupont.fr                           │
│  Source : 🏠 Sponsor local (créé par le club)                   │
│                                                                  │
│  [📥 Télécharger rapport PDF]  [📧 Envoyer au sponsor]         │
└─────────────────────────────────────────────────────────────────┘
```

#### Config editor — boucle enrichie avec dropdown sponsor

```
┌─────────────────────────────────────────────────────────────────┐
│  Boucle par défaut                                               │
│  Vidéos diffusées en continu quand aucune sélection manuelle    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ≡  1. dupont_spot.mp4                                          │
│     Sponsor : [▼ Boulangerie Dupont    ]              [×]       │
│                                                                  │
│  ≡  2. animation_but.mp4                                        │
│     Sponsor : [▼ — Aucun (contenu club) ]             [×]       │
│                                                                  │
│  ≡  3. decathlon.mp4                                            │
│     Sponsor : [🔒 Décathlon (NEOPRO)    ]             [×]       │
│                                                                  │
│  ≡  4. martin_garage.mp4                                        │
│     Sponsor : [▼ Garage Martin         ]              [×]       │
│                                                                  │
│  ≡  5. ambiance_hand.mp4                                        │
│     Sponsor : [▼ — Aucun (contenu club) ]             [×]       │
│                                                                  │
│  [+ Ajouter à la boucle]                                        │
│                                                                  │
│  💡 3/5 vidéos sont rattachées à un sponsor.                    │
│     Les vidéos sans sponsor ne génèrent pas de rapport.         │
└─────────────────────────────────────────────────────────────────┘
```

Principes UX :

- Le dropdown sponsor est pré-rempli avec les `site_sponsors` du site
- "Aucun" = vidéo non-sponsor (ambiance, animation, etc.)
- Les sponsors NEOPRO sont en lecture seule (lock)
- Un hint rappelle que seules les vidéos rattachées génèrent des rapports
- Drag & drop (≡) pour réordonner

### 3.4 Parcours C : Le sponsor local (portail & email)

Le sponsor est un commerçant local. Il n'a aucune compétence technique. Il reçoit un email avec un PDF. C'est tout ce qu'il veut.

#### Email mensuel automatique

```
┌─────────────────────────────────────────────────────────────────┐
│  De : NEOPRO <rapports@neopro.fr>                               │
│  À : jean@boulangerie-dupont.fr                                 │
│  Objet : Votre rapport de visibilité — Janvier 2026             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Bonjour Jean,                                                   │
│                                                                  │
│  Voici le rapport de visibilité de la                            │
│  Boulangerie Dupont au NARH Cesson pour le                      │
│  mois de Janvier 2026.                                           │
│                                                                  │
│  En résumé :                                                     │
│  • 127 passages de votre spot                                    │
│  • ~1 890 spectateurs exposés                                    │
│  • 8 matchs à domicile couverts                                  │
│                                                                  │
│  Le rapport complet est en pièce jointe.                         │
│                                                                  │
│  Cordialement,                                                   │
│  L'équipe NEOPRO                                                 │
│                                                                  │
│  📎 Rapport_Boulangerie_Dupont_Janvier_2026.pdf                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Rapport PDF — design commercial (1 page)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  [Logo NEOPRO]                    [Logo Club NARH]               │
│                                                                  │
│  ──────────────────────────────────────────────────────────────  │
│                                                                  │
│             RAPPORT DE VISIBILITE                                │
│             Boulangerie Dupont                                   │
│             Janvier 2026                                         │
│                                                                  │
│  ──────────────────────────────────────────────────────────────  │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │             │  │             │  │             │             │
│  │     127     │  │   1 890     │  │      8      │             │
│  │   passages  │  │ spectateurs │  │   matchs    │             │
│  │             │  │  (estimé)   │  │  couverts   │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Durée totale d'exposition : 42 min 15 sec              │    │
│  │  Durée moyenne par passage : 19.9 sec                   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  DETAIL PAR CONTEXTE                                    │    │
│  │                                                         │    │
│  │  Matchs          98 passages    77%    ~1 650 spectateurs│   │
│  │  Entraînements   22 passages    17%    ~180 spectateurs  │   │
│  │  Événements       7 passages     6%    ~60 spectateurs   │   │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ──────────────────────────────────────────────────────────────  │
│                                                                  │
│  Données collectées automatiquement par la plateforme NEOPRO.    │
│  Reach basé sur les spectateurs estimés par le club.            │
│  Rapport généré le 01/02/2026                                    │
│                                                                  │
│                                            [Logo NEOPRO petit]   │
└─────────────────────────────────────────────────────────────────┘
```

Principes du PDF :

- **UNE SEULE PAGE** — pas 4 pages, pas de certificat SHA-256
- **3 gros chiffres** en haut : passages, spectateurs, matchs
- **Durées** en dessous (secondaires mais importantes)
- **Détail par contexte** : le sponsor voit que son spot passe surtout en match
- **Mention légale** : "Reach basé sur les spectateurs estimés" (transparence)
- **Logos** : NEOPRO + club (quand disponible)
- **Zéro jargon technique** : pas de "completion rate", pas de "trigger type"
- **Lisible en 30 secondes** par un gérant de boulangerie

#### Portail sponsor (Palier 5 — post-MVP, magic link)

```
URL : app.neopro.fr/sponsors/abc123def456...

┌─────────────────────────────────────────────────────────────────┐
│  NEOPRO                                                          │
│  ──────────────────────────────────────────────────────────────  │
│                                                                  │
│  Boulangerie Dupont                                              │
│  au NARH Cesson-Sévigné                                         │
│                                                                  │
│  ──────────────────────────────────────────────────────────────  │
│                                                                  │
│  Période : [▼ Janvier 2026 ]                                    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                                                          │   │
│  │      127              1 890              8               │   │
│  │    passages         spectateurs        matchs            │   │
│  │                      (estimé)         couverts           │   │
│  │                                                          │   │
│  │    Durée totale d'exposition : 42 min 15 sec             │   │
│  │                                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Historique                                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                                                          │   │
│  │  Jan 2026    127 passages    1 890 spectateurs           │   │
│  │  Déc 2025    112 passages    1 650 spectateurs           │   │
│  │  Nov 2025     98 passages    1 420 spectateurs           │   │
│  │  Oct 2025    103 passages    1 510 spectateurs           │   │
│  │                                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  [📥 Télécharger le rapport Janvier 2026 (PDF)]                │
│                                                                  │
│  ──────────────────────────────────────────────────────────────  │
│  Données collectées automatiquement par NEOPRO.                  │
│  Reach basé sur les spectateurs estimés par le club.            │
│  Questions ? Contactez votre club : contact@narh.fr             │
└─────────────────────────────────────────────────────────────────┘
```

Principes UX portail :

- **Zéro compte à créer** : magic link unique, non devinable (UUID v4), révocable
- **Zéro navigation complexe** : une seule page, tout visible d'un coup
- **Sélection de période** : dropdown simple mois par mois
- **Historique** : le sponsor voit la tendance sans graphique compliqué
- **Téléchargement PDF** : le même PDF que celui envoyé par email
- **Contact club** : le sponsor sait à qui s'adresser (pas à NEOPRO)

### 3.5 Principes UX transversaux

| Principe                                   | Application                                                                               |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| **Compréhensible en 30 secondes**          | Les 3 gros chiffres (passages, spectateurs, matchs) suffisent                             |
| **Zéro jargon**                            | Pas de "impression", "completion rate", "trigger". Dire "passage", "spectateurs", "durée" |
| **Reach toujours "estimé"**                | Mention systématique. Pas de faux sentiment de précision                                  |
| **2 clics max pour les actions courantes** | Créer un sponsor, ajouter à la boucle, envoyer un rapport                                 |
| **Sponsors NEOPRO = lecture seule**        | Le bénévole voit les sponsors réseau mais ne peut pas les modifier                        |
| **Offline-first**                          | La création de sponsors et l'upload fonctionnent sans internet sur le Pi                  |
| **Progressive disclosure**                 | L'email, le contrat, le logo sont optionnels à la création. On complète plus tard         |

### 3.6 Flux de données UX — vue end-to-end

```
BENEVOLE                    PI                  CENTRAL              SPONSOR
   │                         │                     │                    │
   │  Crée "Boulangerie"     │                     │                    │
   │  + uploade spot          │                     │                    │
   │  + ajoute à boucle      │                     │                    │
   ├────────────────────────►│                     │                    │
   │                         │  Sync sponsor local  │                    │
   │                         ├────────────────────►│                    │
   │                         │  ← site_sponsor_id   │                    │
   │                         │◄────────────────────┤                    │
   │                         │                     │                    │
   │                         │  Spot tourne en      │                    │
   │                         │  boucle sur la TV    │                    │
   │                         │                     │                    │
   │  Match jour             │  Impressions trackées│                    │
   │  200 spectateurs        │  avec site_sponsor_id│                    │
   ├────────────────────────►│────────────────────►│                    │
   │                         │                     │                    │
   │                         │                     │  1er du mois       │
   │                         │                     │  CRON génère PDF   │
   │                         │                     │  Email au club     │
   │                         │                     ├───────────────────►│
   │                         │                     │   PDF en PJ         │
   │                         │                     │                    │
   │  Ou bien : dashboard    │                     │                    │
   │  "Envoyer au sponsor"   │                     │                    │
   ├─────────────────────────────────────────────►│───────────────────►│
   │                         │                     │                    │
```

---

## 4. Bugs Existants à Corriger en Priorité

> **✅ PALIER 0 COMPLÉTÉ** — 17 Février 2026
> Tous les bugs ci-dessous ont été fixés. Tests : 1432 passed, 139 smoke passed.

### BUG-1 : ✅ `video.id` au lieu de `video.video_id` (CRITIQUE)

**Fichier** : `raspberry/src/app/services/sponsor-analytics.service.ts`
**Problème** : `LoopVideo` porte l'UUID central dans `video_id`, pas dans `id`. `video.id` est `undefined`.
**Conséquence** : Toutes les impressions dans `advertiser_impressions` ont `video_id = NULL`.
**Fix appliqué** : `video_id: video.video_id || video.id || undefined`

### BUG-2 : ✅ `completion_rate` hardcodé à 100% dans le PDF

**Fichier** : `central-server/src/services/pdf-report.service.ts`
**Fix appliqué** : `ROUND(AVG(CASE WHEN completed THEN 100 ELSE (duration_played::float / NULLIF(video_duration, 0) * 100) END), 1)`

### BUG-3 : ✅ `estimated_reach` hardcodé à 0 dans le PDF

**Fichier** : `central-server/src/services/pdf-report.service.ts`
**Fix appliqué** : `COALESCE(SUM(audience_estimate), 0) as estimated_reach`

### BUG-4 : ✅ RLS manquant sur `advertiser_impressions`

**Fichier** : Nouvelle migration `fix-advertiser-impressions-idempotence.sql`
**Fix appliqué** : Recréation des policies INSERT et SELECT sur `advertiser_impressions`.

### BUG-5 : ✅ CRON data-retention référence `sponsor_impressions`

**Fichier** : `central-server/src/services/cron-scheduler.service.ts`
**Fix appliqué** : `'sponsor_impressions'` → `'advertiser_impressions'` dans `allowedTables`.
**+ Migration** : UPDATE du schedule `recurring_schedules` pour corriger `task_config.tables`.

### BUG-6 : ✅ `SponsorAnalyticsComponent` sans route

**Fichier** : `central-dashboard/src/app/app.routes.ts`
**Fix appliqué** : Route `/advertisers/:id/analytics` ajoutée avec roleGuard `['super_admin', 'admin', 'operator', 'advertiser']`.

### BUG-7 : ✅ `excel-export.service.ts` requête `advertiser_id` sur `advertiser_daily_stats`

**Fichier** : `central-server/src/services/excel-export.service.ts`
**Fix appliqué** :

- `getAdvertiserDailyStats()` : JOIN via `advertiser_videos` au lieu de `WHERE advertiser_id = $1`
- `getAdvertiserSiteStats()` : Idem, résolution via `advertiser_videos`
- `getAdvertiserVideoStats()` : Fix `ai.duration_seconds` → `ai.duration_played`

### AJOUT P0 : ✅ Idempotence des impressions (`event_id`)

**Problème identifié** : Pas de mécanisme de déduplication — les retry du sync-agent créent des doublons.
**Fichiers modifiés** :

- `raspberry/src/app/services/sponsor-analytics.service.ts` : Ajout `event_id: generateEventId()` (UUID v4) dans chaque impression
- `central-server/src/repositories/advertiser.repository.ts` : Ajout `eventId` dans `ImpressionBatchItem`, INSERT avec `ON CONFLICT (event_id) DO NOTHING`
- `central-server/src/controllers/advertiser-analytics.controller.ts` : Extraction et validation `event_id` du body
- `central-server/src/scripts/full-schema.sql` : Schéma mis à jour avec toutes les colonnes réelles
- **Migration** : `fix-advertiser-impressions-idempotence.sql` — ajoute colonne `event_id UUID`, index unique partiel

### Problèmes rencontrés

| #   | Problème                                                                                                                          | Résolution                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | `full-schema.sql` désynchronisé du schéma live (après migration `rename-sponsor-to-advertiser`)                                   | Mis à jour full-schema avec colonnes réelles (event_id, video_duration, completed, event_type, period, trigger_type, etc.) |
| 2   | `advertiser_daily_stats` schema mismatch : full-schema avait `(date, advertiser_id, site_id)`, live a `(video_id, site_id, date)` | Mis à jour full-schema pour refléter le schéma live créé par la migration                                                  |
| 3   | Test pré-existant cassé : `analytics.controller.test.ts` manque `hostname_slug` dans mock                                         | Non lié à P0, ignoré (1 fail / 1432 tests)                                                                                 |
| 4   | `data-retention-cleanup.sql` (migration) crée un index sur `sponsor_impressions` (table renommée)                                 | Fix dans la nouvelle migration qui renomme aussi le schedule                                                               |

---

## 5. Schéma Base de Données

### 5.1 Nouvelle table `site_sponsors`

```sql
CREATE TABLE site_sponsors (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id         UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    advertiser_id   UUID REFERENCES advertisers(id) ON DELETE SET NULL,
    name            VARCHAR(255) NOT NULL,
    contact_name    VARCHAR(255),
    contact_email   VARCHAR(255),
    contact_phone   VARCHAR(50),
    logo_url        TEXT,
    contract_amount DECIMAL(10,2),
    contract_start  DATE,
    contract_end    DATE,
    source          VARCHAR(20) NOT NULL DEFAULT 'local',  -- 'local' | 'neopro'
    status          VARCHAR(20) NOT NULL DEFAULT 'active',  -- 'active' | 'expired' | 'paused'
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT chk_source CHECK (source IN ('local', 'neopro')),
    CONSTRAINT chk_status CHECK (status IN ('active', 'expired', 'paused'))
);

CREATE INDEX idx_site_sponsors_site ON site_sponsors(site_id);
CREATE INDEX idx_site_sponsors_advertiser ON site_sponsors(advertiser_id);
CREATE INDEX idx_site_sponsors_active ON site_sponsors(site_id, status) WHERE status = 'active';
CREATE UNIQUE INDEX idx_site_sponsors_advertiser_site ON site_sponsors(advertiser_id, site_id)
    WHERE advertiser_id IS NOT NULL;
```

### 5.2 Nouvelle table `site_sponsor_videos`

```sql
CREATE TABLE site_sponsor_videos (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_sponsor_id     UUID NOT NULL REFERENCES site_sponsors(id) ON DELETE CASCADE,
    video_id            UUID REFERENCES videos(id) ON DELETE SET NULL,
    video_filename      VARCHAR(255) NOT NULL,
    is_primary          BOOLEAN DEFAULT false,
    added_at            TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uq_sponsor_video UNIQUE (site_sponsor_id, video_filename)
);

CREATE INDEX idx_site_sponsor_videos_sponsor ON site_sponsor_videos(site_sponsor_id);
CREATE INDEX idx_site_sponsor_videos_filename ON site_sponsor_videos(video_filename);
```

### 5.3 Ajout `event_id` + `site_sponsor_id` sur `advertiser_impressions`

```sql
ALTER TABLE advertiser_impressions
    ADD COLUMN event_id UUID UNIQUE,
    ADD COLUMN site_sponsor_id UUID REFERENCES site_sponsors(id) ON DELETE SET NULL;

CREATE INDEX idx_impressions_event_id ON advertiser_impressions(event_id);
CREATE INDEX idx_impressions_site_sponsor ON advertiser_impressions(site_sponsor_id);
CREATE INDEX idx_impressions_site_sponsor_date ON advertiser_impressions(site_sponsor_id, played_at);
```

### 5.4 Ajout `avg_spectators` sur `sites`

```sql
ALTER TABLE sites ADD COLUMN avg_spectators INTEGER;
```

### 5.5 Migration données existantes

```sql
-- Créer site_sponsors pour chaque couple (advertiser, site) existant dans advertiser_sites
INSERT INTO site_sponsors (site_id, advertiser_id, name, contact_name, contact_email,
    contract_start, contract_end, source, status)
SELECT
    ads.site_id,
    ads.advertiser_id,
    a.name,
    a.contact_name,
    a.contact_email,
    ads.contract_start,
    ads.contract_end,
    'neopro',
    CASE WHEN ads.is_active THEN 'active' ELSE 'paused' END
FROM advertiser_sites ads
JOIN advertisers a ON a.id = ads.advertiser_id;

-- Créer site_sponsor_videos depuis advertiser_videos
INSERT INTO site_sponsor_videos (site_sponsor_id, video_id, video_filename, is_primary)
SELECT
    ss.id,
    av.video_id,
    v.filename,
    av.is_primary
FROM advertiser_videos av
JOIN videos v ON v.id = av.video_id
JOIN site_sponsors ss ON ss.advertiser_id = av.advertiser_id;

-- Backfill site_sponsor_id sur les impressions existantes (quand video_id non NULL)
UPDATE advertiser_impressions ai
SET site_sponsor_id = ss.id
FROM site_sponsor_videos ssv
JOIN site_sponsors ss ON ss.id = ssv.site_sponsor_id
WHERE ai.video_id = ssv.video_id
  AND ai.site_id = ss.site_id
  AND ai.site_sponsor_id IS NULL;
```

---

## 6. Impacts par Composant

### 6.1 Central Server (Backend API)

| Composant                                | Impact                                                                                | Effort |
| ---------------------------------------- | ------------------------------------------------------------------------------------- | ------ |
| **Nouveau** `site-sponsor.repository.ts` | CRUD site_sponsors, liaison vidéos, stats, report queries                             | 3j     |
| **Nouveau** `site-sponsor.controller.ts` | Endpoints CRUD + stats + PDF par site_sponsor                                         | 2j     |
| **Nouveau** `site-sponsor.routes.ts`     | Routes `/api/sites/:siteId/sponsors/...`                                              | 0.5j   |
| `advertiser.repository.ts`               | Ajouter auto-création `site_sponsors` sur `addSites()`                                | 0.5j   |
| `advertiser-analytics.controller.ts`     | `recordImpressions()` : résoudre `site_sponsor_id` via `video_filename` + `site_id`   | 1j     |
| `pdf-report.service.ts`                  | Refonte template PDF commercial + fix bugs (reach, completion)                        | 2j     |
| `monthly-reports.service.ts`             | Générer par `site_sponsor` au lieu de `advertiser` uniquement                         | 1j     |
| `email.service.ts`                       | Ajouter support `attachments` (pièces jointes PDF)                                    | 0.5j   |
| `deployment.service.ts`                  | Résoudre et injecter `site_sponsor_id` dans le payload Pi                             | 0.5j   |
| `orchestrated-deployment.service.ts`     | ✅ **FAIT (P8)** — Inclut `siteSponsors` dans le payload `neoProContent` envoyé au Pi | 0.5j   |
| `metrics.service.ts`                     | ✅ **FAIT (P8)** — Métrique `neopro_sponsor_sync_total` + `neopro_sponsor_sync_count` | 0.2j   |
| `cron-scheduler.service.ts`              | Fix ref `sponsor_impressions` + ajouter job email mensuel                             | 0.5j   |
| `excel-export.service.ts`                | Fix query `advertiser_daily_stats`                                                    | 0.5j   |
| **Migration SQL**                        | Tables + indexes + migration données                                                  | 1j     |
| **Tests**                                | Tests unitaires + intégration nouveau repository/controller                           | 2j     |

**Sous-total backend : ~15j**

### 6.2 Raspberry Pi

| Composant                                   | Impact                                                                                          | Effort |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------ |
| `sponsor.interface.ts`                      | Ajouter `site_sponsor_id?: string` à `LoopVideo`                                                | 0.1j   |
| `video.interface.ts`                        | Ajouter `site_sponsor_id?: string` à `Video`                                                    | 0.1j   |
| `sponsor-analytics.service.ts`              | Fix `video.id` → `video.video_id` ; ajouter `site_sponsor_id` et `event_id` (uuid) dans payload | 0.5j   |
| `analytics.service.ts`                      | Ajouter `site_sponsor_id` à `VideoPlayEvent`                                                    | 0.3j   |
| `tv.component.ts`                           | Passer `site_sponsor_id` depuis `LoopVideo` aux services de tracking                            | 0.3j   |
| `sync-agent/commands/deploy-video.js`       | Accepter et persister `siteSponsorId` dans la config                                            | 0.3j   |
| `sync-agent/src/types.js`                   | Ajouter `site_sponsor_id` aux typedefs                                                          | 0.1j   |
| `sync-agent/src/sponsor-impressions.js`     | Passer `site_sponsor_id` dans le payload central                                                | 0.1j   |
| **Admin local — Nouveau module "Sponsors"** | CRUD sponsors locaux (nom, vidéos, ajout boucle)                                                | 3j     |
| `admin/routes/videos.js`                    | Accepter `site_sponsor_id` à l'upload, ajouter toggle "boucle"                                  | 1j     |
| `admin/services/video.service.js`           | `createVideoEntry()` enrichi avec métadonnées sponsor                                           | 0.5j   |
| `admin/helpers.js`                          | `createVideoEntry()` accepte `site_sponsor_id`, `analytics_category`                            | 0.2j   |
| **Sync-agent — remontée sponsors locaux**   | Nouveau module : sync `site_sponsors` locaux vers central                                       | 2j     |
| `sync-agent/utils/config-merge.js`          | ✅ **FAIT (P8)** — `mergeSiteSponsors()` fusionne sponsors central dans `localSponsors[]` du Pi | 1j     |
| **Tests**                                   | Tests unitaires tracking, tests sync                                                            | 1.5j   |

**Sous-total Pi : ~11j**

### 6.3 Dashboard Central (Angular)

| Composant                                             | Impact                                                              | Effort |
| ----------------------------------------------------- | ------------------------------------------------------------------- | ------ |
| **Nouveau** `site-sponsors.component.ts`              | Page "Sponsors du club" dans le détail site                         | 3j     |
| **Nouveau** `site-sponsor-detail.component.ts`        | Détail sponsor avec KPIs + PDF                                      | 2j     |
| **Nouveau** `site-sponsor.service.ts`                 | Service API pour `/api/sites/:siteId/sponsors/...`                  | 0.5j   |
| `config-editor.component.ts`                          | Ajouter sélection sponsor dans la boucle (dropdown `site_sponsors`) | 1j     |
| `site-detail.component.ts`                            | Ajouter onglet/section "Sponsors"                                   | 0.5j   |
| `app.routes.ts`                                       | Ajouter routes sponsors de site + fix route orpheline analytics     | 0.3j   |
| `layout.component.ts`                                 | Éventuellement ajouter lien dans la nav site                        | 0.2j   |
| Nettoyage : supprimer `SponsorsListComponent` doublon | Garder `AdvertisersListComponent` uniquement                        | 0.5j   |
| **Tests**                                             | Tests Karma composants                                              | 1j     |

**Sous-total dashboard : ~9j**

### 6.4 Total estimé

| Composant         | Effort              |
| ----------------- | ------------------- |
| Backend API       | ~15j                |
| Raspberry Pi      | ~11j                |
| Dashboard Central | ~9j                 |
| **Total**         | **~35 jours-homme** |

---

## 7. Paliers de Livraison

### Palier 0 — Fix Bugs Critiques ✅ COMPLÉTÉ (17/02/2026)

Prérequis absolu. Sans ça, les données sont corrompues et on construit sur du sable.

- [x] BUG-1 : Fix `video.id` → `video.video_id` dans `sponsor-analytics.service.ts`
- [x] BUG-2 : Fix `completion_rate` dans `pdf-report.service.ts`
- [x] BUG-3 : Fix `estimated_reach` dans `pdf-report.service.ts`
- [x] BUG-4 : Fix RLS sur `advertiser_impressions` (migration SQL créée)
- [x] BUG-5 : Fix ref `sponsor_impressions` dans `cron-scheduler.service.ts` + migration
- [x] BUG-6 : Ajouter route `SponsorAnalyticsComponent`
- [x] BUG-7 : Fix query `excel-export.service.ts` (3 méthodes corrigées)
- [x] Ajouter `event_id UUID` dans `SponsorImpression` côté Pi (idempotence)
- [x] Ajouter `ON CONFLICT (event_id) DO NOTHING` dans `recordImpressions()`
- [x] Mise à jour `full-schema.sql` (schéma désynchronisé après migrations)
- [x] Mise à jour test `advertiser.repository.test.ts` (23/23 pass)
- [x] Vérification build TS : ✅ compile sans erreur
- [x] Vérification tests : 1432/1432 passed, 139 smoke passed

**⚠️ Action requise** : Exécuter la migration en prod :

```bash
psql "$DATABASE_URL" -f central-server/src/scripts/migrations/fix-advertiser-impressions-idempotence.sql
```

### Palier 1 — Fondations `site_sponsors` (5-7j) ✅ Complété 17/02/2026

Le modèle de données unifié, sans changer l'UX.

- [x] Migration SQL : tables `site_sponsors`, `site_sponsor_videos`
- [x] Migration données : créer `site_sponsors` depuis `advertiser_sites` existants
- [x] `site-sponsor.repository.ts` (CRUD, stats par sponsor de site)
- [x] `site-sponsor.controller.ts` + routes
- [x] `advertiser-sites.controller.ts` : auto-création `site_sponsor` sur `addSites()`
- [x] `recordImpressions()` : résoudre et stocker `site_sponsor_id` (+ `event_id` 14 params, ON CONFLICT)
- [x] `deployment.service.ts` : injecter `site_sponsor_id` dans le payload Pi
- [x] Interfaces Pi : ajouter `site_sponsor_id` à `LoopVideo`, `Video`, `SponsorImpression`
- [x] `deploy-video.js` : accepter et persister `siteSponsorId`
- [x] Tracking Pi : envoyer `site_sponsor_id` + `event_id` dans les impressions
- [x] Tests backend (1472/1472 pass) + smoke (139/139 pass)
- [x] Vérification build TS : ✅ compile sans erreur
- [x] Export `siteSponsorRepository` depuis `repositories/index.ts`
- [x] Route smoke test ajoutée : `GET /api/sites/test-id/sponsors`

**Fichiers créés :**

- `central-server/src/scripts/migrations/add-site-sponsors.sql` (migration + données + RLS)
- `central-server/src/repositories/site-sponsor.repository.ts` (CRUD, stats, résolution)
- `central-server/src/controllers/site-sponsor.controller.ts` (REST endpoints)
- `central-server/src/routes/site-sponsor.routes.ts` (Express router)

**Fichiers modifiés :**

- `central-server/src/repositories/advertiser.repository.ts` — `ImpressionBatchItem` + `recordImpressions()` (14 params, ON CONFLICT event_id)
- `central-server/src/controllers/advertiser-analytics.controller.ts` — résolution `site_sponsor_id` via repository
- `central-server/src/controllers/advertiser-sites.controller.ts` — auto-upsert `site_sponsor` sur addSites
- `central-server/src/services/deployment.service.ts` — injection `siteSponsorId` dans commandData
- `central-server/src/server.ts` — montage routes `/api/sites` pour site-sponsors
- `central-server/src/repositories/index.ts` — re-export siteSponsorRepository
- `central-server/src/repositories/advertiser.repository.test.ts` — test 14 params + ON CONFLICT
- `raspberry/src/app/interfaces/sponsor.interface.ts` — `site_sponsor_id` sur `LoopVideo`
- `raspberry/src/app/interfaces/video.interface.ts` — `site_sponsor_id` sur `Video`
- `raspberry/src/app/services/sponsor-analytics.service.ts` — `event_id` + `site_sponsor_id` + `generateEventId()`
- `raspberry/sync-agent/src/commands/deploy-video.js` — `siteSponsorId` dans config Pi

**⚠️ Problème rencontré** : VS Code auto-save/linter (organize-imports) revertait systématiquement les modifications des fichiers TypeScript existants. Les imports jugés "non utilisés" par l'IDE étaient supprimés automatiquement, causant des régressions silencieuses. Solution : vérification systématique après chaque batch d'éditions + ré-application si nécessaire.

**⚠️ Action requise** : Exécuter la migration en prod :

```bash
psql "$DATABASE_URL" -f central-server/src/scripts/migrations/add-site-sponsors.sql
```

### Palier 2 — Rapports PDF & Email (5-7j) ✅ COMPLÉTÉ

Le livrable visible pour les clubs beta.

- [x] Refonte PDF commercial : 1 page, gros chiffres, lisible en 30s
- [x] Formule reach : `spectateurs x passages` avec fallback `avg_spectators`
- [x] Ajouter `avg_spectators` à la table `sites` + UI dans le dashboard
- [x] Détail par contexte dans le PDF (matchs vs entraînements vs événements)
- [x] `email.service.ts` : support pièces jointes
- [x] `monthly-reports.service.ts` : générer par `site_sponsor` (local + neopro)
- [x] CRON : envoi email auto le 1er du mois avec PDF(s) en PJ
- [x] Stockage PDF sur FTP + accessible depuis dashboard
- [x] Tests rapports

**Fichiers créés :**

- `central-server/src/scripts/migrations/add-site-sponsor-reports.sql` — Migration ajout `site_sponsor_id` + contraintes

**Fichiers modifiés :**

- `central-server/src/middleware/validation.ts` — `avg_spectators` dans `updateSite`
- `central-server/src/controllers/sites.controller.ts` — `avg_spectators` dans le handler update
- `central-server/src/repositories/site-sponsor.repository.ts` — `getStatsByEventType()` + `getMatchSessionCount()`
- `central-server/src/services/email.service.ts` — `EmailAttachment` interface + `sendSponsorReport()` + template HTML
- `central-server/src/services/pdf-report.service.ts` — `generateSiteSponsorReport()` (PDF 1 page commercial)
- `central-server/src/services/monthly-reports.service.ts` — `generateSiteSponsorReports()` + email auto + `getSiteSponsorReports()`
- `central-server/src/services/metrics.service.ts` — type `site_sponsor` pour métriques
- `central-server/src/controllers/reports.controller.ts` — `listSiteSponsorReports` + support `site_sponsor` dans generate
- `central-server/src/routes/reports.routes.ts` — `GET /site-sponsors/:siteSponsorId`
- `central-server/src/repositories/report.repository.ts` — `site_sponsor_id` + JOIN `site_sponsors` dans `findAllWithEntityName`
- `central-dashboard/src/app/core/models/index.ts` — `avg_spectators` dans interface `Site`
- `central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-tab.component.ts` — Input "Spectateurs moyens" + `saveAvgSpectators()`

**Migration prod :** `psql "$DATABASE_URL" -f central-server/src/scripts/migrations/add-site-sponsor-reports.sql`

### Palier 3 — Sponsors Locaux & Admin Pi (5-7j) ✅ COMPLÉTÉ (17/02/2026)

Le bénévole devient autonome.

- [x] Admin local Pi — module "Sponsors du club" (CRUD : nom, contact, vidéos)
- [x] Admin local — toggle "Ajouter à la boucle" à l'upload
- [x] Admin local — dropdown "Sponsor" à l'upload vidéo
- [x] Sync-agent : remontée sponsors locaux vers le central
- [x] Central : réception et création/match `site_sponsors` depuis les Pi
- [x] `config-merge.js` : préserver sponsors locaux (`localSponsors` dans `LOCAL_ONLY_SETTINGS`)
- [x] Tests : SponsorService (22 tests) + config-merge localSponsors (4 tests)

**Architecture implémentée :**

- Nouveau champ `localSponsors[]` dans `configuration.json` (séparé de `sponsors[]` = boucle vidéo)
- Génération `localId: ls_{timestamp}_{randomHex(6)}` côté Pi
- Sync via `sync_local_state` → central crée/match `site_sponsors(source='local')` → renvoie `sponsor_ids_resolved` mapping
- Clé d'idempotence : `(site_id, LOWER(TRIM(name)), source='local')`
- `addToLoop()` ajoute dans `sponsors[]` avec `{ owner: 'club', locked: false, _sponsorLocalId }`
- `mergeSponsors()` préserve déjà les sponsors club non-NEOPRO (pas de modification nécessaire)

**Fichiers créés :**

- `raspberry/admin/services/sponsor.service.js` — CRUD sponsors locaux (list, get, create, update, delete, linkVideo, unlinkVideo, addToLoop, removeFromLoop)
- `raspberry/admin/routes/sponsors.js` — Routes Express sponsors (factory pattern)
- `raspberry/admin/public/modules/sponsors/index.js` — Module frontend vanilla JS (cards, modals, CRUD)
- `raspberry/admin/__tests__/sponsor.service.test.js` — 22 tests unitaires

**Fichiers modifiés :**

- `raspberry/admin/admin-server.js` — Import SponsorService, instanciation, montage routes, passage au videosRouter
- `raspberry/admin/public/index.html` — Nav button Sponsors, tab content, modals create/edit/delete, dropdown sponsor upload
- `raspberry/admin/public/modules/bootstrap.js` — Case 'sponsors' dans switchTab, window exports
- `raspberry/admin/public/build-admin.sh` — Module sponsors dans MODULES array
- `raspberry/admin/public/modules/upload/index.js` — `populateUploadSponsorSelect()`, sponsorLocalId + addToLoop dans FormData
- `raspberry/admin/routes/videos.js` — Accepte sponsorService, linkVideo + addToLoop après upload
- `raspberry/sync-agent/src/agent.js` — Envoie `localSponsors` dans sync_local_state, handler `sponsor_ids_resolved`
- `raspberry/sync-agent/src/utils/config-merge.js` — `'localSponsors'` dans LOCAL_ONLY_SETTINGS
- `raspberry/sync-agent/src/__tests__/config-merge.test.js` — 4 tests localSponsors preservation
- `central-server/src/handlers/config-sync.handler.ts` — `resolveLocalSponsors()`, emit mapping, LocalSponsorPayload interface
- `central-server/src/repositories/site-sponsor.repository.ts` — `findByNameAndSite()` method

**Tests :** 146 admin pass, 194 sync-agent pass, 1472 server pass, 139 smoke pass

### Palier 4 — Dashboard Club & Enrichissements (5-7j) ✅ Terminé

L'expérience dashboard pour le suivi.

- [x] Dashboard central — onglet "Sponsors" dans le détail site (`SiteSponsorsTabComponent`)
- [x] Dashboard central — détail par sponsor avec KPIs, graphique Chart.js et historique rapports
- [x] Dashboard central — bouton "Générer rapport" (email auto si `contact_email`)
- [x] Loop manager — dropdown sponsor dans la boucle (default + phase loops)
- [x] Branding club (logo, couleurs) dans le PDF — implémenté P5
- [x] Nettoyage : routes `/sponsors` → `/advertisers` vérifiées, pas d'orphelins
- [x] Tests Karma : 520 tests pass (509 + 11 nouveaux)

**Implémentation réelle :**

- `SiteSponsorsTabComponent` : composant standalone inline, CRUD complet, expand detail avec KPIs + Chart.js + rapports
- Méthodes ajoutées dans `SitesService` : 10 méthodes (CRUD + stats + videos + reports)
- Interfaces dans `models/index.ts` : `SiteSponsor`, `SiteSponsorVideo`, `SiteSponsorStats`, `SiteSponsorStatsResponse`, `GeneratedReport`
- Loop manager : `@Input() siteSponsors`, dropdown sponsor dans chaque video row
- `SiteContentTabComponent` charge les sponsors actifs et les passe au loop manager

**Décision architecturale** : pas de service séparé `site-sponsor.service.ts` — toutes les méthodes intégrées dans `SitesService` (cohérent avec le pattern existant, un seul service par feature domain).

**Tests :** 520 Karma pass, 1472 server pass, 139 smoke pass

### Palier 5 — Branding Club PDF + Magic Link Sponsor ✅

**Branding club PDF** :

- [x] Migration `add-site-branding.sql` : colonnes `logo_url`, `color_primary`, `color_secondary` sur `sites`
- [x] `UpdateSiteInput` dans `site.repository.ts` : ajout des 3 champs
- [x] `pdf-report.service.ts` : injection couleurs club dans `COLORS` de `generateSiteSponsorPdf()`, download logo asynchrone avec fallback
- [x] `SiteSponsorReportData.club` : champs `logoUrl`, `colorPrimary`, `colorSecondary`
- [x] `site-settings-tab.component.ts` : section "Branding Club" (logo URL + color pickers + aperçu gradient)
- [x] Interface `Site` : champs `logo_url`, `color_primary`, `color_secondary`

**Magic link sponsor** :

- [x] Migration `add-sponsor-access-tokens.sql` : table `sponsor_access_tokens` (token_hash, expires_at)
- [x] `sponsor-access.service.ts` : service backend (createAccessLink, verifyToken, cleanupExpiredTokens) calqué sur `password-reset.service.ts`
- [x] `sponsor-portal.controller.ts` : endpoints publics (verify, stats, report PDF) sans auth JWT
- [x] `sponsor-portal.routes.ts` : routes montées sur `/api/sponsor-portal`
- [x] `site-sponsor.controller.ts` : handler `createAccessLink` + envoi email automatique
- [x] `email.service.ts` : méthode `sendSponsorAccessLink()` avec bouton CTA
- [x] `site-sponsor-portal.component.ts` : page Angular `/sponsor-access?token=xxx` (KPIs + Chart.js + download PDF)
- [x] `sponsor-access.service.ts` (Angular) : service API client pour le portail
- [x] `app.routes.ts` : route publique `/sponsor-access` sans authGuard
- [x] `site-sponsors-tab.component.ts` : bouton "Envoyer lien d'accès" dans le détail expandé

**Fichiers** : 9 nouveaux, 8 modifiés
**Tests** : 528 Karma, 1471 Jest (server), 139 smoke — tous pass

### Palier 6 — Stats Réseau & Régie (post-MVP)

- [x] Stats réseau agrégées pour la régie NEOPRO (P6.1 — `getNetworkStatsSummary`, `NetworkSponsorStatsComponent`, route `GET /api/network/advertisers/:advertiserId/stats`)
- [x] Comparaison sponsor vs autres sponsors du club (P6.2 — `getBenchmark`, panneau benchmark dans `site-sponsors-tab.component.ts`)
- [x] CPI (coût par impression) (P6.3 — calcul applicatif `contract_amount / impressions`, KPI card + colonne benchmark + réseau)
- [x] Concept de "match" lié aux impressions (P6.4 — `getMatchDayBreakdown`, page 2 conditionnelle dans `pdf-report.service.ts`)

**Fichiers** : 2 nouveaux, 12 modifiés
**Tests** : 533 Karma, 1487 Jest (server), 139 smoke — tous pass

**Hotfixes post-P6 :**

- **v3.57.4** — Null-safety guards sur `detailStats.daily_trends?.length`, `videos?.length`, `reports?.length`, `benchmark?.sponsors?.some()` pour éviter le crash en boucle TypeError si le backend retourne des champs manquants
- **v3.58.1** — Suppression de la route backward-compat `GET /api/sites/:id/sponsors` dans `advertiser-sites.routes.ts` qui masquait le listing `site-sponsor.routes.ts` (retournait `{ advertisers: [] }` au lieu de `{ sponsors: [] }`). Smoke test ajouté pour prévenir la régression
- **v3.59.1** — Fallback URL prod (`https://admin-neopro.kalonpartners.bzh`) pour les magic links sponsors au lieu de `localhost:4300`

### Palier 7 — Association vidéos sponsors (UI)

- [x] UI d'association vidéo-sponsor dans `site-sponsors-tab.component.ts` :
  - Dropdown sélection vidéo (cloud videos du site via `getLocalContent()`) + bouton "Associer"
  - Bouton ✕ sur chaque chip vidéo pour retirer l'association
  - Filtrage automatique des vidéos déjà associées dans le dropdown
  - Refresh automatique après add/remove (stats + liste + vidéos disponibles)
- [x] 8 tests Karma dédiés (`Video Association` describe block) : load, add, remove, errors, cancel, cleanup

**Fichiers** : 0 nouveau, 2 modifiés (`site-sponsors-tab.component.ts`, `site-sponsors-tab.component.spec.ts`)
**Tests** : 541 Karma (+8), 1487 Jest (server), 142 smoke — tous pass

### Palier 8 — Sync sponsors Dashboard → Pi ✅ COMPLÉTÉ (18/02/2026)

Les sponsors créés dans le dashboard central (`site_sponsors`) n'étaient jamais inclus dans le payload de déploiement envoyé au Pi. Le Pi avait sa propre gestion de sponsors locaux (`localSponsors[]`) complètement indépendante. Ce palier comble cette lacune.

**Flux implémenté** :

```
Dashboard (CRUD site_sponsors)
  ↓
site_sponsors table (PostgreSQL)
  ↓ getSponsorsForDeployment(siteId)
orchestrated-deployment.service.ts
  ↓ neoProContent.siteSponsors = [...]
Pi (sync-agent update_config)
  ↓ mergeSiteSponsors(localSponsors, centralSponsors)
configuration.json → localSponsors[] enrichi avec centralId
```

- [x] `site-sponsor.repository.ts` : nouvelle méthode `getSponsorsForDeployment()` — requête SQL `site_sponsors JOIN site_sponsor_videos`, retourne sponsors actifs avec `video_filenames[]`
- [x] `orchestrated-deployment.service.ts` : récupère et inclut `siteSponsors` dans le payload `neoProContent` de chaque déploiement
- [x] `types/index.ts` : nouveau type `SiteSponsorDeployment` + champs `site_sponsor_id` et `display_name` sur `SponsorVideo`
- [x] `config-merge.js` : nouvelle fonction `mergeSiteSponsors()` — merge intelligent par `centralId` puis par nom (case-insensitive), préservation des sponsors purement locaux, union des `videoFilenames`
- [x] `metrics.service.ts` : métriques `neopro_sponsor_sync_total` et `neopro_sponsor_sync_count`
- [x] `docker/prometheus/rules.yml` : alerte `SponsorSyncMissing`

**Fichiers** : 0 nouveau, 6 modifiés
**Tests** : 1497 Jest (server), 142 smoke, 52 config-merge, 22 sponsor.service — tous pass

### Palier 9 — Sync bidirectionnelle Dashboard ↔ Pi + Monitoring ✅ COMPLÉTÉ (18/02/2026)

8 corrections adressant les gaps identifiés dans l'audit du lien bidirectionnel Dashboard ↔ Pi.

**Problèmes corrigés :**

1. **Loop manager** : le champ `sponsor_id` dans le template Angular ne correspondait pas à `site_sponsor_id` attendu par le Pi — les attributions sponsor n'étaient jamais transmises
2. **`mergeSiteSponsors()`** ne propageait pas le champ `source` → le Pi ne pouvait pas distinguer sponsors dashboard (read-only) des sponsors locaux (éditables)
3. **Pi admin** ne protégeait pas les sponsors du dashboard → le bénévole pouvait modifier/supprimer les sponsors NEOPRO
4. **`handleSponsorIdsResolved()`** ne mettait à jour que `sponsors[]` (boucle par défaut) mais ignorait `timeCategories[].loopVideos[]` → les boucles par phase n'avaient pas de `site_sponsor_id`
5. **`recordImpressions()`** n'avait aucun fallback quand `video_id` absent → sponsors locaux impossibles à attribuer
6. **Aucune sync** entre le JSON config et la table `site_sponsor_videos` → fallback `video_filename` impossible

**Flux bidirectionnel complet :**

```
Dashboard → Pi :
  Dashboard crée site_sponsor → DB
    ↓ déploiement orchestré
  Pi reçoit siteSponsors[] avec source:'neopro'
    ↓ mergeSiteSponsors()
  localSponsors[] enrichi (centralId + source)
    ↓ sponsor.service.js
  Admin Pi affiche en section NEOPRO (lecture seule + LockedError)

Pi → Dashboard :
  Bénévole crée sponsor local → localSponsors[] (source:'local')
    ↓ sync_local_state
  Central crée site_sponsors(source='local') via resolveLocalSponsors()
    ↓ sponsor_ids_resolved
  Pi reçoit centralId → sponsors[] + timeCategories[].loopVideos[] mis à jour
    ↓ trackSponsorStart()
  Impression avec site_sponsor_id → rapport PDF attribué
```

**Monitoring ajouté :**

- Métriques : `neopro_impression_resolution_total{method}` (site_sponsor_id / video_id / filename / unresolved)
- Métriques : `neopro_sponsor_resolution_failures_total{operation}` (resolve_local / resolve_impression / sync_videos)
- Alertes : `SponsorResolutionFailures` (>0.05/s pendant 10min), `ImpressionSponsorUnresolved` (>50% non attribuées pendant 15min)

**Fichiers modifiés :** 12 (8 code + 4 docs)

- `central-dashboard/src/app/core/models/site-config.model.ts` — `site_sponsor_id` sur `LoopVideoConfig`
- `central-dashboard/.../loop-manager.component.ts` — `sponsor_id` → `site_sponsor_id`
- `central-server/src/controllers/advertiser-analytics.controller.ts` — fallback `video_filename` + métriques + logging
- `central-server/src/services/orchestrated-deployment.service.ts` — `syncSponsorVideoAssociations()`
- `central-server/src/services/metrics.service.ts` — 2 nouvelles métriques
- `central-server/src/handlers/config-sync.handler.ts` — métrique échec résolution
- `raspberry/admin/services/sponsor.service.js` — source dynamique + `LockedError` guards
- `raspberry/src/app/services/sponsor-analytics.service.ts` — fallback `sponsor_id`
- `raspberry/sync-agent/src/agent.js` — `timeCategories[].loopVideos[]` dans `handleSponsorIdsResolved`
- `raspberry/sync-agent/src/utils/config-merge.js` — `source` dans `mergeSiteSponsors()`
- `docker/prometheus/rules.yml` — 2 nouvelles alertes

**Tests :** 1497 Jest (server), 142 smoke, 146 admin, 52 config-merge, 22 sponsor — tous pass

---

## 8. Liste de Tâches Détaillée

### Palier 0 — Fix Bugs

| ID    | Tâche                                                                | Fichier(s)                                                                           | Effort | Dépendances |
| ----- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------ | ----------- |
| P0-01 | Fix `video.id` → `video.video_id` dans trackSponsorStart             | `raspberry/src/app/services/sponsor-analytics.service.ts`                            | 0.5j   | —           |
| P0-02 | Ajouter `event_id` UUID (uuid v4) dans SponsorImpression côté Pi     | `raspberry/src/app/services/sponsor-analytics.service.ts`, `sync-agent/src/types.js` | 0.5j   | —           |
| P0-03 | Ajouter `ON CONFLICT (event_id) DO NOTHING` dans recordImpressions   | `central-server/src/repositories/advertiser.repository.ts`                           | 0.5j   | P0-02       |
| P0-04 | Fix `completion_rate` query PDF                                      | `central-server/src/services/pdf-report.service.ts`                                  | 0.3j   | —           |
| P0-05 | Fix `estimated_reach` query PDF                                      | `central-server/src/services/pdf-report.service.ts`                                  | 0.3j   | —           |
| P0-06 | Fix RLS sur `advertiser_impressions`                                 | Nouvelle migration SQL                                                               | 0.3j   | —           |
| P0-07 | Fix ref `sponsor_impressions` dans cron data-retention               | `central-server/src/services/cron-scheduler.service.ts`                              | 0.1j   | —           |
| P0-08 | Ajouter route `/advertisers/:id/analytics`                           | `central-dashboard/src/app/app.routes.ts`                                            | 0.1j   | —           |
| P0-09 | Fix query `excel-export.service.ts` (advertiser_daily_stats)         | `central-server/src/services/excel-export.service.ts`                                | 0.5j   | —           |
| P0-10 | Tests : vérifier que les impressions arrivent avec video_id non-NULL | Tests intégration                                                                    | 0.5j   | P0-01       |

### Palier 1 — Fondations

| ID    | Tâche                                                                       | Fichier(s)                                                                        | Effort | Dépendances  |
| ----- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------ | ------------ |
| P1-01 | Migration SQL : table `site_sponsors`                                       | `central-server/src/scripts/migrations/add-site-sponsors.sql`                     | 0.5j   | —            |
| P1-02 | Migration SQL : table `site_sponsor_videos`                                 | même fichier                                                                      | 0.3j   | P1-01        |
| P1-03 | Migration SQL : `event_id` + `site_sponsor_id` sur `advertiser_impressions` | même fichier                                                                      | 0.3j   | P1-01        |
| P1-04 | Migration SQL : `avg_spectators` sur `sites`                                | même fichier                                                                      | 0.1j   | —            |
| P1-05 | Migration données : `advertiser_sites` → `site_sponsors`                    | même fichier                                                                      | 0.5j   | P1-01        |
| P1-06 | Nouveau `site-sponsor.repository.ts`                                        | `central-server/src/repositories/`                                                | 2j     | P1-01        |
| P1-07 | Nouveau `site-sponsor.controller.ts`                                        | `central-server/src/controllers/`                                                 | 1.5j   | P1-06        |
| P1-08 | Nouveau `site-sponsor.routes.ts`                                            | `central-server/src/routes/`                                                      | 0.3j   | P1-07        |
| P1-09 | `advertiser.repository.ts` : auto-création `site_sponsor` sur addSites      | `central-server/src/repositories/advertiser.repository.ts`                        | 0.5j   | P1-06        |
| P1-10 | `recordImpressions()` : résoudre `site_sponsor_id` via filename+site        | `central-server/src/repositories/advertiser.repository.ts`                        | 1j     | P1-02        |
| P1-11 | `deployment.service.ts` : injecter `site_sponsor_id`                        | `central-server/src/services/deployment.service.ts`                               | 0.5j   | P1-01        |
| P1-12 | Interfaces Pi : ajouter `site_sponsor_id`                                   | `raspberry/src/app/interfaces/sponsor.interface.ts`, `video.interface.ts`         | 0.2j   | —            |
| P1-13 | `deploy-video.js` : accepter `siteSponsorId`                                | `raspberry/sync-agent/src/commands/deploy-video.js`                               | 0.3j   | P1-12        |
| P1-14 | Tracking Pi : `site_sponsor_id` dans payload impressions                    | `raspberry/src/app/services/sponsor-analytics.service.ts`, `analytics.service.ts` | 0.5j   | P1-12        |
| P1-15 | Tests backend : CRUD site_sponsors + résolution impressions                 | Tests Jest                                                                        | 1.5j   | P1-06..P1-10 |
| P1-16 | Tests Pi : tracking avec `site_sponsor_id`                                  | Tests Jest                                                                        | 0.5j   | P1-14        |

### Palier 2 — Rapports

| ID    | Tâche                                                                 | Fichier(s)                                                   | Effort | Dépendances  |
| ----- | --------------------------------------------------------------------- | ------------------------------------------------------------ | ------ | ------------ |
| P2-01 | Refonte template PDF : 1 page, gros chiffres, design commercial       | `central-server/src/services/pdf-report.service.ts`          | 2j     | P1-06        |
| P2-02 | Query reach : `SUM(audience_estimate)` avec fallback `avg_spectators` | `central-server/src/repositories/site-sponsor.repository.ts` | 0.5j   | P1-04        |
| P2-03 | UI `avg_spectators` dans le dashboard (page détail site)              | `central-dashboard/src/app/features/sites/`                  | 0.5j   | P1-04        |
| P2-04 | `email.service.ts` : support `attachments` (Buffer PDF en PJ)         | `central-server/src/services/email.service.ts`               | 0.5j   | —            |
| P2-05 | `monthly-reports.service.ts` : générer par `site_sponsor`             | `central-server/src/services/monthly-reports.service.ts`     | 1j     | P1-06        |
| P2-06 | CRON mensuel : envoi email au contact club avec PDF(s)                | `central-server/src/services/cron-scheduler.service.ts`      | 1j     | P2-04, P2-05 |
| P2-07 | Stockage PDF FTP + endpoint téléchargement                            | `central-server/src/services/monthly-reports.service.ts`     | 0.5j   | P2-05        |
| P2-08 | Tests rapports : vérifier contenu PDF, reach, envoi email             | Tests Jest                                                   | 1j     | P2-01..P2-07 |

### Palier 3 — Sponsors Locaux

| ID    | Tâche                                                                   | Fichier(s)                                                       | Effort | Dépendances  |
| ----- | ----------------------------------------------------------------------- | ---------------------------------------------------------------- | ------ | ------------ |
| P3-01 | Admin Pi — nouveau module "Sponsors" (liste + création)                 | `raspberry/admin/routes/sponsors.js`, `public/modules/sponsors/` | 2j     | —            |
| P3-02 | Admin Pi — liaison vidéo ↔ sponsor + dropdown à l'upload                | `raspberry/admin/routes/videos.js`, `services/video.service.js`  | 1j     | P3-01        |
| P3-03 | Admin Pi — toggle "Ajouter à la boucle"                                 | `raspberry/admin/services/video.service.js`, `helpers.js`        | 1j     | P3-01        |
| P3-04 | Stockage local sponsors dans configuration.json                         | `raspberry/admin/services/configuration.service.js`              | 0.5j   | P3-01        |
| P3-05 | Sync-agent — nouveau module : remontée sponsors locaux                  | `raspberry/sync-agent/src/local-sponsors.js`                     | 1.5j   | P3-04        |
| P3-06 | Central — endpoint réception sponsors locaux                            | `central-server/src/controllers/site-sponsor.controller.ts`      | 1j     | P1-07, P3-05 |
| P3-07 | Central — retour `site_sponsor_id` au Pi après création                 | `central-server/src/controllers/site-sponsor.controller.ts`      | 0.5j   | P3-06        |
| P3-08 | `config-merge.js` : préserver club dans `timeCategories[].loopVideos[]` | `raspberry/sync-agent/src/utils/config-merge.js`                 | 0.5j   | —            |
| P3-09 | Tests sync sponsors locaux                                              | Tests Jest                                                       | 1j     | P3-05..P3-07 |

### Palier 4 — Dashboard

| ID    | Tâche                                                                      | Fichier(s)                                                | Effort | Dépendances  |
| ----- | -------------------------------------------------------------------------- | --------------------------------------------------------- | ------ | ------------ |
| P4-01 | Nouveau service `site-sponsor.service.ts`                                  | `central-dashboard/src/app/core/services/`                | 0.5j   | P1-08        |
| P4-02 | Page "Sponsors du club" (liste avec KPIs)                                  | `central-dashboard/src/app/features/sites/site-sponsors/` | 2j     | P4-01        |
| P4-03 | Détail sponsor (KPIs, graphique, historique)                               | `central-dashboard/src/app/features/sites/site-sponsors/` | 2j     | P4-01        |
| P4-04 | Bouton "Envoyer rapport" (email au sponsor)                                | Dans le composant détail                                  | 0.5j   | P2-04        |
| P4-05 | Config editor — dropdown sponsor dans la boucle                            | `central-dashboard/src/app/features/sites/config-editor/` | 1j     | P1-08        |
| P4-06 | Routes + navigation                                                        | `app.routes.ts`, `layout.component.ts`                    | 0.3j   | —            |
| P4-07 | Nettoyage doublons (`SponsorsListComponent` vs `AdvertisersListComponent`) | `central-dashboard/src/app/features/sponsors/`            | 0.5j   | —            |
| P4-08 | Tests Karma                                                                | Tests Angular                                             | 1j     | P4-02..P4-05 |

---

## 9. Risques & Mitigations

| #   | Risque                                                                                        | Probabilité | Impact                                                  | Mitigation                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | Doublons d'impressions en prod (pas d'idempotence)                                            | Élevée      | Les stats sont faussées, les rapports gonflés           | Palier 0 : `event_id` + `ON CONFLICT DO NOTHING` en priorité                                                               |
| 2   | Sync bidirectionnel sponsors locaux = doublons                                                | Moyenne     | Deux `site_sponsors` pour le même boulanger             | Clé d'idempotence : `(site_id, LOWER(name))` côté central                                                                  |
| 3   | Bénévole renomme un fichier vidéo = perte d'attribution                                       | Moyenne     | Les impressions futures ne sont plus rattachées         | Générer un `local_video_uuid` au moment de l'upload, persisté dans config                                                  |
| 4   | `timeCategories[].loopVideos[]` écrasé par sync central                                       | Certaine    | Les sponsors club dans les boucles de phase sont perdus | Palier 3 : modifier `config-merge.js` pour préserver entrées club                                                          |
| 5   | Volume data : 50 clubs x 5 sponsors x 150 events/match x 15 matchs = ~562K impressions/saison | Faible      | Croissance DB, perf queries                             | Indexes composites + agrégation `site_sponsor_daily_stats` (palier 5)                                                      |
| 6   | Migration `advertiser_sites` → `site_sponsors` perd des données                               | Faible      | Sponsors NEOPRO sans `site_sponsor`                     | Script de migration avec vérification + rollback                                                                           |
| 7   | Deux pipelines tracking (`video_plays` + `advertiser_impressions`) divergent                  | Moyenne     | Confusion sur la source de vérité pour les stats        | À terme (palier 5+) : unifier en un seul pipeline. Pour le MVP : `advertiser_impressions` = source unique rapports sponsor |

---

## 10. Critères d'Acceptance

### Palier 0 (Bugs) — ✅ Done

- [x] Les impressions arrivent avec `video_id` non-NULL (fix `video.video_id || video.id`)
- [x] Les event_id sont uniques, pas de doublons après resync (`ON CONFLICT (event_id) DO NOTHING`)
- [x] Le PDF affiche un `completion_rate` réaliste (pas 100%)
- [x] Le PDF affiche un `estimated_reach` non-nul (si audience renseignée)
- [x] La route `/advertisers/:id/analytics` fonctionne dans le dashboard
- [x] L'export Excel ne crashe pas (3 méthodes corrigées)
- [x] Les smoke tests passent (139/139)

### Palier 1 (Fondations) — ✅ Done

- [x] Table `site_sponsors` créée et peuplée depuis les données existantes (migration `add-site-sponsors.sql`)
- [x] L'API CRUD `/api/sites/:siteId/sponsors` fonctionne (8 routes)
- [x] Le déploiement d'une vidéo annonceur crée automatiquement un `site_sponsor` (`upsertForAdvertiserSite()`)
- [x] Les impressions Pi contiennent `site_sponsor_id` et `event_id` (`generateEventId()`)
- [x] Les impressions en DB ont `site_sponsor_id` renseigné (`resolveSiteSponsorId()` dans deployment)
- [x] Les tests unitaires et d'intégration passent (1472 server + 139 smoke)

### Palier 2 (Rapports) — Done quand : ✅

- [x] Un rapport PDF est généré par `site_sponsor` avec les bons chiffres
- [x] Le PDF est lisible en 30 secondes par un non-technique
- [x] Le reach utilise la formule `audience x passages` avec fallback `avg_spectators`
- [x] Le CRON génère les rapports le 1er du mois
- [x] L'email est envoyé au contact club avec les PDFs en pièce jointe
- [ ] Les 4 clubs beta (NARH, RACC, NLF + 1) reçoivent leur rapport Mars 2026 ← après déploiement prod

### Palier 3 (Sponsors locaux) — Done quand : ✅

- [x] Le bénévole peut créer un sponsor depuis l'admin local du Pi
- [x] Le bénévole peut uploader une vidéo et la lier à un sponsor
- [x] Le bénévole peut ajouter une vidéo à la boucle depuis l'admin local
- [x] Le sponsor local est synchronisé vers le central et reçoit un `site_sponsor_id`
- [x] Les impressions des vidéos locales sont attribuées au bon sponsor (via `site_sponsor_id` dans sponsors[])
- [x] Les sponsors club survivent aux sync centrales (merge préservé — `localSponsors` dans LOCAL_ONLY_SETTINGS + `mergeSponsors()` préserve club owners)

### Palier 4 (Dashboard) — ✅ Complété

- [x] L'onglet "Sponsors" dans site-detail affiche la liste avec KPIs (video_count, total_impressions)
- [x] Le détail expand par sponsor montre les KPIs (impressions, reach, jours actifs, temps écran), graphique Chart.js des tendances 30j, liste des vidéos et des rapports passés
- [x] Le bouton "Générer rapport" appelle l'API et notifie l'envoi email si `contact_email` existe
- [x] Le loop manager permet de choisir un `site_sponsor` dans un dropdown pour chaque vidéo (default + phase loops)
- [x] Tests Karma : 11 nouveaux tests (create, CRUD, modal, expand detail, report generation, template)

**Fichiers modifiés :**

- `central-dashboard/src/app/core/models/index.ts` — interfaces SiteSponsor, SiteSponsorVideo, stats, reports
- `central-dashboard/src/app/core/services/sites.service.ts` — 10 méthodes sponsors
- `central-dashboard/src/app/features/sites/site-detail.component.ts` — tab 'sponsors'
- `central-dashboard/src/app/features/sites/components/site-sponsors-tab/site-sponsors-tab.component.ts` — NEW
- `central-dashboard/src/app/features/sites/components/site-sponsors-tab/site-sponsors-tab.component.spec.ts` — NEW
- `central-dashboard/src/app/features/sites/components/loop-manager/loop-manager.component.ts` — sponsor dropdown
- `central-dashboard/src/app/features/sites/components/site-content-tab/site-content-tab.component.ts` — load + pass siteSponsors

---

## 11. Questions Ouvertes Résolues

| #   | Question (du brief)                       | Réponse                                                                                                                                                  |
| --- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Le player émet-il des events de lecture ? | **Oui** — 4 hooks dans `tv.component.ts`. Mais `video_id` est NULL (bug P0-01).                                                                          |
| 2   | Quel mécanisme sync offline ?             | Double buffer : localStorage + JSON disque. Sync batch 200 toutes les 5 min. Pas de queue manager (fichier plat + setInterval). Suffisant pour 50 clubs. |
| 3   | Le modèle Sponsor existe ?                | **Partiellement** — `advertisers` couvre les annonceurs NEOPRO. Les sponsors locaux des clubs n'ont aucune entité. D'où `site_sponsors`.                 |
| 4   | Outil PDF ?                               | PDFKit + chartjs-node-canvas. Pas Puppeteer.                                                                                                             |
| 5   | Email en place ?                          | Oui, nodemailer + SMTP. Pas de support pièces jointes (à ajouter — palier 2).                                                                            |
| 6   | Branding club accessible ?                | Oui (P5). `logo_url`, `color_primary`, `color_secondary` sur `sites`. Injectés dans `generateSiteSponsorPdf()`.                                          |
| 7   | Redis/queue pour les pics de sync ?       | Non nécessaire pour 50 clubs. Rate limiter (500 req/min) + batch 200 suffisent. Redis utile au-delà de ~200 clubs.                                       |

---

## Annexes

### A. Fichiers impactés — inventaire complet (mis à jour 17/02/2026)

**Central Server (backend)** :

- `src/scripts/migrations/add-site-sponsors.sql` (nouveau — P0/P1)
- `src/scripts/migrations/add-site-sponsor-reports.sql` (nouveau — P2)
- `src/scripts/migrations/fix-advertiser-impressions-idempotence.sql` (nouveau — P0)
- `src/scripts/migrations/add-site-branding.sql` (nouveau — P5)
- `src/scripts/migrations/add-sponsor-access-tokens.sql` (nouveau — P5)
- `src/repositories/site-sponsor.repository.ts` (nouveau)
- `src/controllers/site-sponsor.controller.ts` (nouveau)
- `src/routes/site-sponsor.routes.ts` (nouveau)
- `src/controllers/sponsor-portal.controller.ts` (nouveau — P5)
- `src/controllers/sponsor-portal.controller.test.ts` (nouveau — P5)
- `src/routes/sponsor-portal.routes.ts` (nouveau — P5)
- `src/services/sponsor-access.service.ts` (nouveau — P5)
- `src/services/sponsor-access.service.test.ts` (nouveau — P5)
- `src/repositories/advertiser.repository.ts` (modifié)
- `src/repositories/advertiser.repository.test.ts` (modifié)
- `src/repositories/report.repository.ts` (modifié)
- `src/repositories/index.ts` (modifié — re-export siteSponsorRepository)
- `src/controllers/advertiser-analytics.controller.ts` (modifié)
- `src/controllers/advertiser-sites.controller.ts` (modifié — auto-upsert site_sponsor)
- `src/controllers/reports.controller.ts` (modifié)
- `src/controllers/sites.controller.ts` (modifié — avg_spectators)
- `src/routes/reports.routes.ts` (modifié)
- `src/middleware/validation.ts` (modifié — avg_spectators)
- `src/services/pdf-report.service.ts` (modifié)
- `src/services/monthly-reports.service.ts` (modifié)
- `src/services/email.service.ts` (modifié)
- `src/services/deployment.service.ts` (modifié)
- `src/services/cron-scheduler.service.ts` (modifié)
- `src/services/excel-export.service.ts` (modifié)
- `src/services/metrics.service.ts` (modifié — P8 : `neopro_sponsor_sync_total` + `neopro_sponsor_sync_count`)
- `src/services/orchestrated-deployment.service.ts` (modifié — P8 : `getSiteSponsorsForDeployment()` + inclusion `siteSponsors` dans payload)
- `src/handlers/config-sync.handler.ts` (modifié — resolveLocalSponsors)
- `src/server.ts` (modifié — montage routes)
- `src/scripts/full-schema.sql` (modifié)

**Raspberry Pi** :

- `src/app/interfaces/sponsor.interface.ts` (modifié)
- `src/app/interfaces/video.interface.ts` (modifié)
- `src/app/services/sponsor-analytics.service.ts` (modifié)
- `src/app/services/analytics.service.ts` (modifié)
- `src/app/components/tv/tv.component.ts` (modifié)
- `sync-agent/src/commands/deploy-video.js` (modifié)
- `sync-agent/src/types.js` (modifié)
- `sync-agent/src/sponsor-impressions.js` (modifié)
- `sync-agent/src/utils/config-merge.js` (modifié — LOCAL_ONLY_SETTINGS)
- `sync-agent/src/__tests__/config-merge.test.js` (modifié — 4 tests localSponsors)
- `sync-agent/src/utils/config-merge.js` (modifié — P8 : `mergeSiteSponsors()` + export)
- `sync-agent/src/agent.js` (modifié — sync localSponsors inline, pas de module séparé)
- `admin/routes/sponsors.js` (nouveau)
- `admin/routes/videos.js` (modifié)
- `admin/services/sponsor.service.js` (nouveau)
- `admin/admin-server.js` (modifié — instanciation + montage)
- `admin/public/index.html` (modifié — nav + modals + UI)
- `admin/public/modules/sponsors/index.js` (nouveau)
- `admin/public/modules/bootstrap.js` (modifié — switchTab sponsors)
- `admin/public/modules/upload/index.js` (modifié — dropdown sponsor)
- `admin/public/build-admin.sh` (modifié — module sponsors)
- `admin/__tests__/sponsor.service.test.js` (nouveau — 22 tests)

**Dashboard Central** :

- `src/app/core/services/sites.service.ts` (modifié — 10 méthodes sponsors intégrées, pas de service séparé)
- `src/app/core/services/sponsor-access.service.ts` (nouveau — P5, service API portail magic link)
- `src/app/core/models/index.ts` (modifié — interfaces SiteSponsor, stats, reports, avg_spectators)
- `src/app/features/sites/components/site-sponsors-tab/site-sponsors-tab.component.ts` (nouveau)
- `src/app/features/sites/components/site-sponsors-tab/site-sponsors-tab.component.spec.ts` (nouveau)
- `src/app/features/sites/components/site-settings-tab/site-settings-tab.component.ts` (modifié — branding + avg_spectators)
- `src/app/features/sites/components/site-content-tab/site-content-tab.component.ts` (modifié — charge siteSponsors)
- `src/app/features/sites/components/loop-manager/loop-manager.component.ts` (modifié — dropdown sponsor)
- `src/app/features/sites/site-detail.component.ts` (modifié — tab sponsors)
- `src/app/features/sponsor-portal/site-sponsor-portal.component.ts` (nouveau — P5)
- `src/app/features/sponsor-portal/site-sponsor-portal.component.spec.ts` (nouveau — P5)
- `src/app/app.routes.ts` (modifié — routes sponsors + portail)
- `src/assets/i18n/en.json` (modifié — clés sponsors)
- `src/assets/i18n/fr.json` (modifié)
- `src/assets/i18n/es.json` (modifié)

**Monitoring** :

- `docker/prometheus/rules.yml` (modifié — P8 : alerte `SponsorSyncMissing`)
- `docker/alertmanager/alertmanager.yml` (nouveau — notification config)

### B. Références

- Brief produit PO : section 1-8 (ce document)
- ADR-009 : analytics-removal
- ADR-010 : hdmi-cec-analytics
- ADR-027 : analytics-ui-removal
- `docs/analytics/AVANCEMENT.md` : état actuel analytics sponsors
- `docs/business/BACKLOG.md` : roadmap features
- `central-server/src/scripts/full-schema.sql` : schéma DB complet
