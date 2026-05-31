# PROP-014 — Pipeline contenu LED périmétrique

**Date** : 2026-05-30 (réécrite 2026-05-31 après validation visuelle)
**Statut** : Proposé — modèle validé visuellement avec Daisy, en attente SPIKE matériel
**Auteur** : Daisy / Claude
**Remplace l'hypothèse de** : ADR-029, PROP-002, PROP-010 (modèle "LED = variant secondaire croppé" — invalidé)
**Suspend** : PROP-011 (modèle multi-zones), SPIKE-003 (à redéfinir, cf. plan ci-dessous)

---

## 1. Le malentendu d'origine (à documenter pour ne pas y retomber)

Les docs existantes encodaient un **modèle faux** du LED périmétrique :

- **ADR-029** a renommé "LED" → "écran secondaire" (jugé "trop restrictif") → a noyé la spécificité du ruban périmétrique dans un fourre-tout "2ᵉ écran 16:9".
- **PROP-002 / PROP-010** : contenu LED = crop 16:9 → 1920×384. Faux : c'est une surface dédiée, pas un recadrage de la TV.
- **PROP-011** : périmètre = N zones indépendantes. Faux : c'est un **ruban continu**, replié pour le transport, avec un **motif répété**.

Réalité (validée 2026-05-31 sur fichiers réels d'un club handball + rendus) : un ruban LED périmétrique est **une seule surface continue ultra-wide**, parfois branchée en **HDMI primaire** (pas "secondaire"), alimentée par un **fichier vidéo standard "plié en bandes"** que le processeur LED (Novastar/Colorlight) **déplie** sur les dalles.

---

## 2. Le modèle validé — 3 couches distinctes

C'est la confusion de ces 3 couches qui faisait échouer tout le monde (freelance inclus) :

| Couche                  | Quoi                                                                 | Exemple (club 80 m)                                       |
| ----------------------- | -------------------------------------------------------------------- | --------------------------------------------------------- |
| **Contenu (logique)**   | Le ruban "déroulé à plat" : motif répété                             | 8× INTERSPORT, 1 tous les 10 m → 13 333 × 160 px          |
| **Transport (fichier)** | Le contenu **plié en bandes** à la résolution d'entrée du processeur | 1920 × 1200, 7 bandes empilées (= 80 m découpé en lignes) |
| **Physique (mapping)**  | Le processeur **déplie** les bandes sur les dalles                   | ruban continu lisible le long du terrain                  |

MadXP produit la couche **contenu**, génère automatiquement la couche **transport** (pliage), et le **processeur** gère la couche physique.

---

## 3. Le profil LED paramétrique (par site)

La topologie varie tout le temps (1 côté, 2×4 m, 3 côtés 40/20/20, 4 côtés…). On ne code donc PAS par cas : on décrit le périmètre en données et le moteur s'adapte.

```
Profil LED du site = {
  côtés          : [40m, 20m, 20m]      // topologie
  pixel_pitch    : "P6"                  // ex. 6 mm
  hauteur_px     : 160                   // hauteur dalle
  espacement     : "tous les 10 m"       // règle de répétition du motif (choix contenu)
  canvas_in      : { largeur_bande: 1920, hauteur: 1200, nb_bandes: 7, ordre: [...] }
                                         // config processeur, lue 1× à l'install
}
```

À partir de ça MadXP calcule : résolution native, nombre de répétitions, pliage, alignement des angles.

---

## 4. Règle de contenu : motif répété + alignement des angles

- Le visuel se **répète** le long du ruban (chaque spectateur voit un visuel complet où qu'il soit assis).
- **Espacement paramétrique** : 8×/10 m, 10×/8 m, etc. — choix libre par club/contenu.
- **Alignement des angles** : si l'espacement divise les longueurs cumulées des côtés, les angles tombent **entre** deux visuels → aucun logo plié dans un coin.
  - Ex. côtés 40/20/20 + espacement 10 m → angles à 40 m et 60 m = multiples de 10 → propre. ✅
  - Ex. espacement 8 m → angle à 60 m (÷8 = 7,5) → un logo serait plié. ⚠️ MadXP doit **avertir** ou **suggérer** un espacement aligné.

### Granularité du motif (3 cas, selon largeur du visuel)

| Largeur visuel             | Modèle                      | Complexité                         |
| -------------------------- | --------------------------- | ---------------------------------- |
| Tient dans 1 dalle (icône) | 1 visuel / dalle            | simple, fold-agnostic ✅           |
| Mot/logo large             | cellule de N dalles répétée | moyenne ⚠️                         |
| Toute la longueur          | étalé, pas de répétition    | avancée (besoin pliage complet) ❗ |

Cas par défaut pour un logo-texte : **cellule de N dalles répétée**.

---

## 5. TV et LED = sorties SŒURS du même moteur

Point clé : la TV n'est **pas** une bande du fichier LED. Ce sont **deux sorties séparées**, pilotées par le **même moteur d'événements** (le moteur match/remote existant) :

```
Événement "BUT #14" (1 clic télécommande)
  ├─ Sortie TV (HDMI 0)  → fichier 1920×1080 normal ("BUT ! #14 PIRES")
  └─ Sortie LED (HDMI 1) → fichier 1920×1200 plié (le ruban "BUT #14" répété)
```

Les fichiers `LED_ENTREE_*`, `LED_BUT_*`, `LED_JINGLE_*` du club analysé = exactement le modèle événementiel TV. **On réutilise le cœur de MadXP.**

---

## 6. Architecture cible

**Temps réel (le vrai besoin, ~50 % de la flotte cible)** :

```
MadXP (moteur événements) → Pi/mini-PC
   ├─ HDMI 0 → TV (1920×1080)
   └─ HDMI 1 → Processeur LED (canvas plié 1920×1200) → ruban
```

Le Pi sort exactement le canvas attendu par le processeur (≤ 1920×1200, dans les limites HDMI). Bascule "but/entrée" en direct = même moteur que la TV.

**Export fichier (fallback)** : pour les sites sans Pi câblé au LED, ou clubs avec leur propre player ViPlex → MadXP génère le MP4 plié, le club l'uploade. Cloud-only.

**Hors scope MVP** : pilotage via API processeur (ViPlex/VNNOX), `:8080` (LED = cloud + Pi-output, pas admin local).

---

## 5bis. Inventaire existe / nouveau / partagé (vérifié 2026-05-31)

NOW (export) et LATER (live) ne sont pas deux chantiers : c'est **un moteur de génération + deux sorties**. Une grande partie existe déjà.

### Existe déjà (✅ vérifié dans le code)

| Brique                                                   | Où                                                                                 |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Render Remotion serveur → MP4 + upload FTP + queue async | `studio-render-worker.service.ts` (`renderMedia` l.249, `render_requests`)         |
| Moteur supporte n'importe quelle résolution              | `selectComposition`/`renderMedia` (dimension déclarée par la compo)                |
| 2ᵉ sortie HDMI / écran secondaire                        | `kiosk-watchdog.sh` (chromium secondaire, xrandr), route `/secondary → /display/1` |
| Variants par display + config displays                   | `video_variants`, `resolveDisplayVariant()`, `sites.displays`                      |
| Sync TV ↔ 2ᵉ écran                                       | `tv-sync.service` (master/slave)                                                   |
| Moteur événementiel match (but, entrée, jingles)         | remote/match, `club_sessions`, handlers                                            |
| Rotation sponsors pondérée + storage/FTP                 | Bresenham, `storage.service`                                                       |

### Nouveau à construire (🔨)

| Brique                                                 | Effort       | Note                                                              |
| ------------------------------------------------------ | ------------ | ----------------------------------------------------------------- |
| **Moteur "déroulé → pliage"**                          | moyen        | LE vrai IP. Dans la compo Remotion ou post-ffmpeg.                |
| **Profil LED paramétrique**                            | faible       | données (côtés/pitch/hauteur/espacement/canvas_in/mode)           |
| **Composition LED + dimensions dynamiques**            | faible-moyen | `calculateMetadata` piloté par le profil ; layout ruban + tuilage |
| Preview "ruban" dashboard, bouton export, bascule live | faible       | branchements sur l'existant                                       |

### Partagé NOW ↔ LATER

Même moteur de génération ; seule la **sortie** diffère : EXPORT = render-to-file (réutilise le worker existant) · LIVE = 2ᵉ HDMI → processeur (réutilise écran secondaire + moteur événementiel).

⚠️ Caveat build : cache webpack `@remotion/bundler` sensible en parallèle (cf. incident connu) — guard `NODE_ENV` au boot.

## 5ter. Sources de contenu, contrats de livraison & validateur de format

Le contenu LED arrive de **deux sources** — MadXP doit gérer les deux :

| Source                        | Qui crée la créa | Ce que MadXP reçoit                                         |
| ----------------------------- | ---------------- | ----------------------------------------------------------- |
| **Studio interne** (Remotion) | MadXP            | données / logo → MadXP génère la vidéo direct au bon format |
| **Vidéo propre du club**      | club / agence    | une **vidéo finie**                                         |

Pour la vidéo propre du club, **deux contrats de livraison** (décision à acter) :

- **Contrat A — la cellule** : le club livre 1 motif (ex. 10 m), MadXP **répète + plie**.
- **Contrat B — le ruban complet** : le club livre le déroulé entier, MadXP **plie seulement**.

**Validateur de format à l'upload** (l'inverse du `reencode.sh` qui cassait en silence) :

- ✅ dimensions = spec du profil → on plie directement
- ⚠️ même ratio, autre taille → redimensionne + plie
- ❌ ratio incompatible → **avertit** ("ta vidéo est en 6:1, ton ruban attend ~83:1")

### Exemple réel vérifié : `LED_ENTREE_28_CORENTIN_BOY.mp4`

Vidéo fournie par un club (handball). Source = **4800×800 (6:1)**, contenu "#28 CORENTIN BOY #28".

- Appliqué au profil de SON ruban (80 m, P6, 160 px → **13344×160**), MadXP la met à hauteur 160 (→ bloc 960×160), la **répète tous les 10 m**, et **plie en 7 bandes** (→ 1920×1120). **→ ça fonctionne** : on voit leur vrai visuel, lisible, répété le long du ruban.
- Limite esthétique : leur cadre 6:1 ne remplit pas toute la longueur → **espaces entre répétitions** ; et leur fond étant **texturé**, le remplissage uni ne se fond pas parfaitement (léger contour visible). **Acceptable**, pas un bug.
- Pour un rendu **plein-cadre sans espace**, il faut **re-créer la créa** au format ruban (par le club via la spec, ou via le studio avec leurs assets) — on **ne peut pas** "réparer" un MP4 aplati au mauvais format sans le redessiner.

**Principe produit** : MadXP n'est **pas** un convertisseur magique de MP4. Il **plie toute vidéo** (la créa club fonctionne telle quelle), **donne la spec** pour un rendu optimal, et **génère** via le studio quand on part des assets. On ne bloque jamais un club parce que sa vidéo n'est pas "parfaite".

## 6bis. LA décision centrale : mode A (plug & play) vs mode B (pixel-perfect)

Les processeurs LED **varient** d'un club à l'autre. L'objectif idéal est "on branche juste un HDMI". Mais brancher un signal standard **ne garantit pas** un rendu propre (preuve : le fichier KBC 1920×1080 branché en HDMI s'affichait fragmenté "sur plusieurs lignes"). Il y a donc **deux modes de fonctionnement** — c'est LA décision à trancher (via SPIKE) :

|                      | **Mode A — Plug & play**                              | **Mode B — Pixel-perfect**                                  |
| -------------------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| Ce qu'on envoie      | Signal **standard** (ex. 1920×1080 pensé "ruban")     | Fichier **plié** au canvas exact du processeur              |
| Qui mappe            | Le processeur scale/mappe lui-même                    | MadXP génère le pliage, le processeur déplie                |
| Connaissance requise | Aucune par club (ou réglage 1× à l'install)           | Config processeur lue 1× à l'install (largeur bande, ordre) |
| Avantage             | Universel, simple, "on branche"                       | Rendu net, maîtrisé, sans déformation                       |
| Inconvénient         | Qualité variable, risque de déformation/fragmentation | Étape de calibrage à l'install                              |

**Ce n'est pas "décoder chaque processeur".** C'est choisir un **modèle d'opération** :

- Soit le mode A suffit (rendu acceptable partout) → MVP très simple.
- Soit il faut un **petit réglage standardisé à l'install** (mode B léger) pour garantir le rendu.

Le SPIKE (§7) tranche A vs B sur 1-2 installs réelles. Cette décision → **ADR dédié** une fois le SPIKE fait.

## 7. Plan de SPIKE (obligatoire avant tout code de prod)

Sur **une vraie install** (idéalement un club 3 côtés) :

1. **Lire la config processeur** (NovaLCT/ViPlex → Screen Connection) : largeur de bande, nb bandes, ordre, taille dalle. → on connaît enfin la couche transport réelle.
2. **Brancher un Pi/mini-PC** et vérifier qu'il sort le canvas plié et que le processeur l'accepte (EDID/modeline custom).
3. **Afficher une boucle sponsor tuilée** → valider que le rendu tombe juste (motif + angles).
4. **Tester une bascule événement en direct** (boucle → "BUT" → boucle).

Si les 4 passent → on chiffre le build. Sinon → on a évité le mur.

---

## 8. Phases proposées

| Phase         | Contenu                                                                                 | Prérequis                  |
| ------------- | --------------------------------------------------------------------------------------- | -------------------------- |
| **0**         | SPIKE sur install réelle (les 4 validations §7)                                         | accès matériel             |
| **1**         | Profil LED paramétrique (DB + dashboard : côtés, pitch, hauteur, espacement, canvas_in) | SPIKE OK                   |
| **2**         | Génération contenu : moteur "déroulé → pliage" (Remotion), templates tuilés sponsors    | Phase 1                    |
| **3**         | Export fichier + preview "ruban" dans le dashboard                                      | Phase 2                    |
| **4**         | Temps réel : Pi 2ᵉ sortie HDMI → processeur, bascule événementielle                     | Phase 2 + SPIKE temps réel |
| **5** _(av.)_ | Cas "spanning" pleine longueur + alignement angles avancé                               | Phase 4                    |

---

## 9. Positionnement

Concurrent frontal : **Bodet Sport** (VIDEOSPORT = déclenchement à l'action, VIDEOMEDIA = boucle pub + compta temps de diffusion). MadXP a déjà l'équivalent côté TV (moteur match + rotation Bresenham + proof-of-play sponsors) → l'étendre au LED est une **extension du cœur**, pas un nouveau produit.

---

## 10. Questions ouvertes

1. Récupération de `canvas_in` : screenshot NovaLCT à l'onboarding ? Outil d'aide ? Reconfiguration "à plat" du processeur à l'install ?
2. Granularité du motif par défaut (1 dalle vs N dalles) selon les logos réels des sponsors.
3. Cas segment < cellule (2×4 m) : réduire la cellule automatiquement.
4. Limites réelles modeline Pi 5 → processeur (à mesurer au SPIKE).

---

## Références

- Découverte + validation : sessions Claude 2026-05-30 / 2026-05-31 (analyse fichiers club handball, recherche web LED processors, rendus visuels validés)
- Mockups de validation : `~/Downloads/led_mockups/` (demo_voyage_80m, demo_fichier_LED_plie, ex8/ex11/ex12/ex13)
- Recherche web : architecture Novastar/Colorlight, canvas plié, specs delivery sport, faisabilité Pi HDMI
- Docs corrigées par cette PROP : ADR-029, PROP-002, PROP-010, PROP-011, SPIKE-003
