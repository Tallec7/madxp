# PROP-014 — Pipeline contenu LED périmétrique

**Date** : 2026-05-30 (réécrite 2026-05-31 après validation visuelle complète)
**Statut** : Proposé — modèle validé visuellement de bout en bout, en attente SPIKE matériel
**Auteur** : Daisy / Claude
**Remplace l'hypothèse de** : ADR-029, PROP-002, PROP-010 ("LED = variant secondaire croppé" — invalidé)
**Intègre le besoin de** : PROP-011 (contenu par côté → zones)
**Redéfinit** : SPIKE-003 (cf. `SPIKE-003-protocole.md`)
**Maquettes** : `assets/led-mockups/01-profil-contenu-export.html`, `assets/led-mockups/02-panel-variantes-par-type.html`

---

## Sommaire

1. Le malentendu d'origine
2. Le modèle validé — 3 couches
3. Profil LED paramétrique (par site)
4. Règle de contenu : motif, espacement contraint, angles
5. Contenu par côté (zones)
6. Sources, contrats de livraison & validateur de format
7. TV et LED = sorties sœurs du même moteur
8. **Intégration dashboard (Option A)** — le cœur produit
9. Architecture technique cible
10. Mode A (plug & play) vs Mode B (pixel-perfect)
11. Inventaire existe / nouveau (vérifié)
12. Data model — changements concrets
13. Plan de build SPIKE-free
14. SPIKE matériel (le seul bloquant)
15. Phases & positionnement
16. Questions ouvertes & références

---

## 1. Le malentendu d'origine (à ne pas reproduire)

Les docs existantes encodaient un **modèle faux** du LED périmétrique :

- **ADR-029** a renommé "LED" → "écran secondaire" (jugé "trop restrictif") → a noyé la spécificité du ruban dans un fourre-tout "2ᵉ écran 16:9".
- **PROP-002 / PROP-010** : contenu LED = crop 16:9 → 1920×384. Faux : surface dédiée, pas un recadrage.
- **PROP-011** : périmètre = N zones indépendantes stitchées. Le _besoin_ (contenu par côté) est juste ; le _mécanisme_ est remplacé.

**Réalité (validée 2026-05-31 sur fichiers réels d'un club handball + rendus)** : un ruban LED périmétrique est **une seule surface continue ultra-wide**, parfois branchée en **HDMI primaire** (pas "secondaire"), alimentée par un **fichier vidéo standard "plié en bandes"** que le processeur LED (Novastar/Colorlight) **déplie** sur les dalles.

> **Méta-leçon** : sur un sujet spatial/visuel, MONTRER un rendu (image/MP4) AVANT d'écrire docs/code. Le déclic est venu des mockups, pas du texte.

---

## 2. Le modèle validé — 3 couches distinctes

La confusion de ces 3 couches faisait échouer tout le monde (freelance inclus) :

| Couche                  | Quoi                                                                 | Exemple (club 80 m)                                                                      |
| ----------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Contenu (logique)**   | Le ruban "déroulé à plat", motif répété                              | 8× logo, 1 tous les 10 m → **13 344 × 160 px**                                           |
| **Transport (fichier)** | Le contenu **plié en bandes** à la résolution d'entrée du processeur | **1920 × 1200, 7 bandes empilées** (illisible pour un humain, normal pour le processeur) |
| **Physique (mapping)**  | Le processeur **déplie** les bandes sur les dalles                   | ruban continu lisible le long du terrain                                                 |

MadXP produit la **couche contenu**, génère la **couche transport** (pliage), le **processeur** gère la **couche physique**.

> Le fichier plié reste un **MP4 standard** à une résolution standard (ex. 1920×1200). Le mot "se continue" d'une bande à l'autre, comme du texte qui passe à la ligne — le processeur recolle.

---

## 3. Le profil LED paramétrique (par site)

La topologie varie tout le temps (1 côté, 2×4 m, 3 côtés 40/20/20, 4 côtés…). On ne code PAS par cas : on décrit le périmètre en données.

```
Profil LED du site = {
  côtés          : [40m, 20m, 20m]      // topologie (suppression possible par côté)
  pixel_pitch    : "P6"                  // ex. 6 mm → 166 px/m
  hauteur_px     : 160                   // hauteur dalle
  espacement     : "tous les 10 m"       // cadence de boucle — dropdown contraint (cf. §4)
  répartition    : "même partout" | "par côté"   // zones (cf. §5)
  diffusion      : "export" | "live"
  canvas_in      : { largeur_bande: 1920, nb_bandes: 7, ordre: [...], mode: "A"|"B" }
                   // ⏳ config processeur — LUE à l'install (SPIKE), pas saisie
}
```

Calcul : `largeur_ruban = Σ côtés (m) × (1000 / pitch_mm)`. Ex. 80 m × P6 = **13 344 px** × 160.

---

## 4. Règle de contenu : motif répété + espacement contraint + angles

- Le visuel se **répète** le long du ruban (chaque spectateur voit un visuel complet où qu'il soit).
- **Espacement = liste déroulante cohérente, JAMAIS saisie libre** (leçon anti-drift). MadXP ne propose que les espacements qui **divisent chaque côté** (→ angles alignés) ET donnent un nombre entier de répétitions.
  - Ex. côtés 40/20/20 → `{4 m (20×), 5 m (16×), 10 m (8×), 20 m (4×)}`.
  - `8 m` **exclu** (ne divise pas 20 → logo plié à 60 m). MadXP **avertit** ou suggère un espacement aligné.
- **Granularité du motif** (selon largeur du visuel) :

| Largeur visuel             | Modèle                      | Complexité                         |
| -------------------------- | --------------------------- | ---------------------------------- |
| Tient dans 1 dalle (icône) | 1 visuel / dalle            | simple, fold-agnostic ✅           |
| Mot/logo large             | cellule de N dalles répétée | moyenne ⚠️                         |
| Toute la longueur          | étalé, pas de répétition    | avancée (besoin pliage complet) ❗ |

---

## 5. Contenu par côté (zones)

Un périmètre multi-côtés peut afficher **le même contenu partout** (défaut) OU **un contenu différent par côté**. Les côtés étant séparés par des angles, chaque côté est une **zone naturelle** : le contenu ne traverse jamais un coin. Le ruban logique est composé **par segment**, puis plié comme un tout (un seul fichier).

→ Reprend le besoin de **PROP-011** ; le mécanisme "zones stitchées indépendantes" est remplacé par "composition par segment sur ruban continu".

---

## 6. Sources, contrats de livraison & validateur de format

Le contenu LED arrive de **deux sources** — gérer les deux :

| Source                        | Qui crée la créa | Ce que MadXP reçoit                                                     |
| ----------------------------- | ---------------- | ----------------------------------------------------------------------- |
| **Studio interne** (Remotion) | MadXP            | données / logo → génère la vidéo au bon format                          |
| **Vidéo propre du club**      | club / agence    | **une vidéo finie** (cas majoritaire à date — le studio n'est pas fini) |

Deux **contrats de livraison** pour la vidéo club :

- **Contrat A — la cellule** : le club livre 1 motif (ex. 10 m), MadXP **répète + plie**.
- **Contrat B — le ruban complet** : le club livre le déroulé entier, MadXP **plie seulement**.

**Validateur à l'upload — il juge le FORMAT, pas la source** (l'inverse du `reencode.sh` qui cassait en silence) :

- ✅ dimensions = profil → on plie directement
- ⚠️ même ratio, autre taille → redimensionne + plie
- ℹ️ ratio incompatible → **note informative non bloquante** ("ta vidéo 6:1 sur un ruban ~83:1 → blocs/espaces ; refais en 13344×160 ou via le studio")

### Exemple réel vérifié : `LED_ENTREE_28_CORENTIN_BOY.mp4`

Source club = **4800×800 (6:1)**, "#28 CORENTIN BOY #28".

- Plié au profil (80 m → 13344×160, 7 bandes) : **ça fonctionne** — leur vrai visuel, lisible, répété le long du ruban.
- Limite esthétique : leur cadre 6:1 ne remplit pas un ruban ~83:1 → **espaces entre répétitions** + fond texturé → léger contour. **Acceptable, pas un bug.**
- Pour du plein-cadre sans trou : **re-créer** la créa au format ruban (club via la spec, ou studio avec leurs assets). On ne "répare" pas un MP4 aplati.

**Principe produit** : MadXP n'est pas un convertisseur magique. Il **plie toute vidéo** (la créa club fonctionne telle quelle), **donne la spec** pour un rendu optimal, **génère** via le studio quand on part des assets. On ne bloque jamais un club.

---

## 7. TV et LED = sorties SŒURS du même moteur

La TV n'est **pas** une bande du fichier LED. Ce sont **deux sorties séparées**, pilotées par le **même moteur d'événements** (match/remote existant) :

```
Événement "BUT #14" (1 clic télécommande)
  ├─ Sortie TV  → fichier 1920×1080 normal ("BUT ! #14 PIRES")
  └─ Sortie LED → fichier 1920×1200 plié (le ruban "BUT #14" répété)
```

Les fichiers `LED_ENTREE_*`, `LED_BUT_*`, `LED_JINGLE_*` du club = exactement le modèle événementiel TV. **On réutilise le cœur de MadXP.**

---

## 8. Intégration dashboard — Option A (le cœur produit)

### Constat (✅ vérifié dans le code)

Aujourd'hui la page **Contenu** gère le contenu **indépendamment du display** :
`Vidéos → Boucles (par phase) → Télécommande (catégories) → Analytics`.
La dimension display vit **ailleurs** : `sites.displays[]` (Paramètres) + **variantes par `display_type`** dans le **panel variantes** (par vidéo). Le Pi réconcilie au playback (`resolveDisplayVariant`).

### Décision : Option A — la mise en page vit sur la VARIANTE, les réglages globaux sur le DISPLAY

| Concept                                   | Où il vit                                            | Portée                |
| ----------------------------------------- | ---------------------------------------------------- | --------------------- |
| **Mise en page** (répété/défilant/étalé)  | sur la **variante** (`video_variants`)               | par vidéo × par écran |
| **Cadence, zones, géométrie, processeur** | sur le **display** (`sites.displays[]`)              | par écran             |
| **Boucle, ordre, poids (1-10), 3 temps**  | **inchangé** (page Contenu actuelle, `loop-manager`) | partagé tous écrans   |

→ **La page Contenu actuelle ne bouge pas.** On étend le **panel variantes** (un champ `layout`) + on ajoute un **bloc réglages** sur le display LED.

### Règle d'or : tout contenu cible un DISPLAY prédéfini, piloté par TYPE (pas par index)

Le panel variantes **itère sur `site.displays[]`** et adapte ses contrôles selon **`display.type`** — l'index #1 peut être une 2ᵉ TV, un totem, un LED… :

| `display.type`   | Contrôles dans le panel                              |
| ---------------- | ---------------------------------------------------- |
| `tv` (même #1)   | variante 16:9 standard — **pas de mise en page LED** |
| `led-perimeter`  | variante + **mise en page** + **aperçu ruban**       |
| `totem`/portrait | variante à son ratio                                 |
| `secondary`      | variante à son format                                |

Les extras LED (mise en page, ruban ; et côté display : cadence/zones/processeur) n'apparaissent **que pour le type `led-perimeter`**. Une 2ᵉ TV reste exactement comme aujourd'hui.

### Événements

Les "événements" (entrée joueur, but, jingle) **ne sont pas un système séparé** : ce sont les **catégories** existantes déclenchées par la télécommande. Leur variante LED se gère dans le **même panel variantes**, par vidéo de catégorie.

### Maquettes de référence

- `assets/led-mockups/01-profil-contenu-export.html` — profil, contenu (extension loop-manager), export.
- `assets/led-mockups/02-panel-variantes-par-type.html` — panel variantes multi-types (#0 TV, #1 2ᵉ TV, #2 LED).

---

## 9. Architecture technique cible

**Temps réel (le vrai besoin, ~50 % de la flotte cible)** :

```
MadXP (moteur événements) → Pi/mini-PC
   ├─ HDMI 0 → TV (1920×1080)
   └─ HDMI 1 → Processeur LED (canvas plié 1920×1200) → ruban
```

Le Pi sort exactement le canvas attendu par le processeur (≤ 1920×1200, limites HDMI). Bascule but/entrée en direct = même moteur que la TV.

**Export fichier (fallback)** : sites sans Pi câblé au LED, ou clubs avec leur player ViPlex → MadXP génère le MP4 plié, le club l'uploade. Cloud-only.

**Hors scope MVP** : API processeur (ViPlex/VNNOX), `:8080` (LED = cloud + Pi-output, pas admin local).

---

## 9bis. Marché, modèle économique & faisabilité HDMI (absorbé de PROP-011)

### Marché LED bord de terrain (France)

| Constructeur        | Spécialité                 | Entrée signal       | Contrôleur typique       |
| ------------------- | -------------------------- | ------------------- | ------------------------ |
| **JSG Technologie** | Panneaux LED sportifs      | HDMI via contrôleur | Novastar / Colorlight    |
| **Stramatel**       | Tableaux d'affichage + LED | HDMI via contrôleur | Propriétaire ou Novastar |
| **Bodet Sport**     | Tableaux d'affichage + LED | HDMI via contrôleur | Propriétaire ou Novastar |
| **Daktronics**      | LED pro (stades)           | HDMI via contrôleur | Propriétaire             |

MadXP est **agnostique du fabricant des dalles** : le signal passe toujours par un **contrôleur LED** (sending card) qui accepte du HDMI standard.

### Qui achète quoi (important pour le pricing)

| Hardware                        | Acheteur            | Moment                    |
| ------------------------------- | ------------------- | ------------------------- |
| Dalles LED                      | Club                | souvent pré-installées    |
| **Contrôleur LED** (Novastar…)  | **Intégrateur LED** | livré **avec** les dalles |
| Raspberry Pi 5 + câbles         | **MadXP**           | produit vendu             |
| Installation HDMI Pi↔contrôleur | Intégrateur/tech    | setup terrain             |

→ **MadXP n'achète PAS de contrôleur côté client.** Seul le SPIKE R&D en a besoin (emprunt intégrateur / occasion 150-250 € / neuf 300-500 €).

### Contrôleurs (référence pour le SPIKE)

| Contrôleur           | HDMI | Largeur max | Zone mapping      | Prix      |
| -------------------- | ---- | ----------- | ----------------- | --------- |
| **Novastar MCTRL4K** | 2.0  | **7680 px** | Oui (NovaLCT)     | 300-500 € |
| **Colorlight Z6**    | 2.0  | 8192 px     | Oui (crop/splice) | 300-500 € |
| **Linsn TS901**      | 1.x  | 2048 px     | Cascade requise   | 100-200 € |

Reco SPIKE : **Novastar MCTRL4K** (doc accessible, EDID custom). Le contrôleur est configuré **une fois à l'install** (NovaLCT), jamais piloté dynamiquement par MadXP — sa config doit matcher `sites.displays` pixel à pixel (cf. PV d'installation, `guides/RUNBOOK_LED_INSTALLATION.md`).

### Faisabilité HDMI Pi 5 (pixel clock, limite ~600 MHz)

| Résolution      | Pixels | Pixel clock | Verdict                        |
| --------------- | ------ | ----------- | ------------------------------ |
| 7680×384 @60Hz  | ~3M    | ~185 MHz    | OK théorique — à valider SPIKE |
| 5760×384 @60Hz  | ~2.2M  | ~140 MHz    | OK                             |
| 1920×1200 @60Hz | ~2.3M  | ~155 MHz    | OK (notre canvas plié cible)   |
| 3840×2160 @60Hz | ~8.3M  | ~594 MHz    | limite — dual HDMI à risque    |

→ Notre canvas plié visé (≤ 1920×1200) est **confortablement sous la limite**. ⚠️ Contrainte GPU : le double-buffer (4 `<video>`) × N zones peut saturer — dégrader en mono-player par zone si besoin (non validé SPIKE).

---

## 10. Mode A (plug & play) vs Mode B (pixel-perfect)

Les processeurs varient. "Brancher juste un HDMI" ne garantit pas un rendu propre (preuve : KBC 1920×1080 fragmenté). Deux modes — **LA décision à trancher au SPIKE** :

|                      | **Mode A — plug & play**                | **Mode B — pixel-perfect**           |
| -------------------- | --------------------------------------- | ------------------------------------ |
| MadXP envoie         | signal **standard** (1920×1080)         | fichier **plié** au canvas exact     |
| Qui mappe            | le **processeur** (scaler)              | **MadXP** (le processeur déplie 1:1) |
| Connaissance requise | aucune par club (ou réglage 1× install) | config processeur lue 1× à l'install |
| Avantage             | universel, simple                       | net, maîtrisé                        |
| Inconvénient         | qualité variable / déformation possible | étape de calibrage                   |

La décision A/B fera l'objet d'un **ADR léger dédié** après le SPIKE.

---

## 11. Inventaire existe / nouveau (vérifié 2026-05-31)

NOW (export) et LATER (live) = **un moteur de génération + deux sorties**. Beaucoup existe déjà.

### Existe déjà (✅ vérifié dans le code)

| Brique                                                   | Où                                                                                       |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Render Remotion serveur → MP4 + upload FTP + queue async | `studio-render-worker.service.ts` (`renderMedia` l.249, table `render_requests`)         |
| Moteur supporte n'importe quelle résolution              | `selectComposition`/`renderMedia` (dimension déclarée par la compo)                      |
| 2ᵉ sortie HDMI / écran secondaire                        | `kiosk-watchdog.sh` (chromium secondaire, xrandr), route `/secondary → /display/1`       |
| Variants par display + config displays                   | `video_variants(display_type,width,height)`, `resolveDisplayVariant()`, `sites.displays` |
| Panel variantes (UI, par display_type)                   | `video-variant-panel.component.ts` (itère `effectiveSiteDisplays`)                       |
| Loop-manager (4 onglets, poids 1-10, pin, Bresenham)     | `loop-manager.component.ts` (≈725 l.)                                                    |
| Phases (3 temps)                                         | `timeCategories` (`before/during/after` + défaut)                                        |
| Événements = catégories via télécommande                 | `CategoryConfig`, remote                                                                 |
| Sync TV ↔ écran secondaire                               | `tv-sync.service` (master/slave)                                                         |
| Rotation sponsors pondérée + storage/FTP                 | Bresenham, `storage.service`                                                             |

### Nouveau à construire (🔨)

| Brique                                                  | Effort       | Note                                                                  |
| ------------------------------------------------------- | ------------ | --------------------------------------------------------------------- |
| **Moteur "déroulé → pliage"** `fold()`                  | moyen        | LE vrai IP. Fonction pure paramétrique. Dans la compo ou post-ffmpeg. |
| Profil LED paramétrique (DB + form)                     | faible       | données ; `canvas_in` lu au SPIKE                                     |
| Composition LED Remotion + dimensions dynamiques        | faible-moyen | `calculateMetadata` piloté par le profil ; tuilage                    |
| Champ `layout` sur la variante + UI panel (type-driven) | faible       | extension du panel existant                                           |
| Aperçu ruban + bloc réglages display + validateur       | faible       | branchements                                                          |

⚠️ Caveat build : cache webpack `@remotion/bundler` sensible en parallèle (incident connu) → guard `NODE_ENV` au boot.

---

## 12. Data model — changements concrets

```sql
-- video_variants : ajouter le layout (display_type accepte déjà un slug libre ; documenter 'led-perimeter')
ALTER TABLE video_variants
  ADD COLUMN IF NOT EXISTS layout VARCHAR(16);   -- 'repeated' | 'scrolling' | 'stretched' (NULL pour TV)

-- sites.displays[] (JSONB) : la config LED vit sur le display de type led-perimeter
-- display = {
--   index, name, type: 'led-perimeter',
--   led: { sides:[40,20,20], pitch:'P6', height:160, spacing_m:10,
--          zones:'uniform'|'per-side',
--          canvas_in:{ band_width:1920, band_count:7, order:[...], mode:'A'|'B' } }  // ⏳ SPIKE
-- }
```

- `LoopVideoConfig.weight` (1-10) : **inchangé**, partagé.
- `timeCategories` : **inchangé**, partagés (le LED suit les 3 temps via les variantes des vidéos de chaque phase).
- Migration : nouvelle migration `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (ne jamais toucher une migration en prod).

---

## 13. Plan de build SPIKE-free

Le SPIKE ne bloque que `canvas_in` (3 valeurs) + le mode A/B + le live HDMI. **Tout l'amont est constructible maintenant**, avec une config provisoire, derrière une **couture isolée** : `fold(rubanPlat, { bandWidth, bandCount, order })`.

Ordre de build (cible NOW / export) :

1. **Module `fold()`** — pur, **unit-testable sans matériel**, le vrai IP → en premier.
2. **Profil LED** (DB + form dashboard, sans `canvas_in` confirmé).
3. **Composition LED Remotion** (dimensions dynamiques + tuilage + alignement angles).
4. **Champ `layout` sur la variante** + UI panel (type-driven).
5. **Validateur de format** à l'upload + aperçu ruban + bloc réglages display.
6. **Export** : render plat → `fold()` → MP4 → download (réutilise le worker existant).

→ Un club peut **déjà** saisir son profil, voir l'aperçu, exporter (config de pliage provisoire). Le SPIKE remplit `canvas_in` → tout devient correct **sans refonte**.

---

## 14. SPIKE matériel (le seul bloquant)

Protocole détaillé : **`SPIKE-003-protocole.md`**.

Objectif : lever 3 inconnues sur **une install réelle** — (1) `canvas_in` (largeur bande, nb bandes, ordre), (2) mode A vs B, (3) le Pi alimente-t-il le processeur. Sortie : **go/no-go** + valeurs + mode.

> ⚠️ Un SPIKE valide **un club**. `canvas_in`/mode sont **par club**. Le SPIKE produit donc surtout une **procédure d'onboarding répétable** + des **défauts** pour le cas courant — pas une constante globale. Idéalement couvrir 2-3 processeurs différents. Certains processeurs n'accepteront pas le live → **export-only** (dégradation propre).

---

## 15. Phases & positionnement

| Phase         | Contenu                                                         | Prérequis            |
| ------------- | --------------------------------------------------------------- | -------------------- |
| **0**         | SPIKE sur install réelle (les validations §14)                  | accès matériel       |
| **1**         | Module `fold()` + profil LED + composition LED + champ `layout` | — (SPIKE-free)       |
| **2**         | Export fichier + preview ruban + validateur                     | Phase 1              |
| **3**         | Live : Pi 2ᵉ HDMI → processeur, bascule événementielle          | Phase 1 + SPIKE vert |
| **4** _(av.)_ | Spanning pleine longueur + zones avancées                       | Phase 3              |

**Positionnement** : concurrent frontal **Bodet Sport** (VIDEOSPORT = déclenchement à l'action ; VIDEOMEDIA = boucle pub + compta temps de diffusion). MadXP a déjà l'équivalent côté TV (moteur match + Bresenham + proof-of-play) → l'étendre au LED est une **extension du cœur**, pas un nouveau produit.

---

## 16. Questions ouvertes & références

### Questions ouvertes

1. Récupération de `canvas_in` : screenshot NovaLCT à l'onboarding ? assistant ? reconfiguration "à plat" du processeur à l'install ?
2. Granularité du motif par défaut (1 dalle vs N dalles) selon les logos sponsors réels.
3. Segment < cellule (2×4 m) : réduire la cellule automatiquement.
4. Limites réelles modeline Pi 5 → processeur (à mesurer au SPIKE).
5. Contrat A vs B par défaut pour la vidéo club.

### Références

- Découverte + validation : sessions Claude 2026-05-30 / 2026-05-31 (fichiers club handball, recherche web LED processors, rendus, maquettes).
- Maquettes versionnées : `assets/led-mockups/`.
- Recherche web : architecture Novastar/Colorlight, canvas plié, specs delivery sport, faisabilité Pi HDMI.
- Docs annotées (modèle revu → voir PROP-014) : ADR-029, PROP-002, PROP-010, PROP-011, SPIKE-003.
- Code existant clé : `studio-render-worker.service.ts`, `loop-manager.component.ts`, `video-variant-panel.component.ts`, `tv.component.ts` (`resolveDisplayVariant`), `kiosk-watchdog.sh`.
