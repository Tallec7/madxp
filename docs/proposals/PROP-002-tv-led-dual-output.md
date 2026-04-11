# PROP-002: Multi-Display — Contenus Différenciés par Écran depuis un Seul Pi

> _Anciennement ADR-012. Mise à jour majeure le 11 avril 2026 (audit implémentation + modèle N-display)._

**Date** : 2026-02-11
**Dernière révision** : 2026-04-11
**Statut** : Partiellement implémenté (Phase 1 + 2 done, Phase 3+ à venir)
**Décideurs** : Équipe Neopro
**Epic SAFe** : [E-22 — Contenus Différenciés TV + LED](../safe/FEATURES.md#e-22--contenus-différenciés-tv--led) (PI-2)
**ADR** : [ADR-029](../adr/ADR-029-dual-hdmi-tv-led.md) (décision architecturale)
**Lié à** : [PROP-001](./PROP-001-multi-tv-single-pi.md) (Multi-TV), [ADR-008](../adr/ADR-008-double-buffer-video-pi.md) (Double-Buffer Vidéo)

---

## Contexte

Un club sportif dispose de **TV classiques** et d'**écrans additionnels** (panneau LED bandeau, mur LED, totem, TV tribunes, écran géant). Il souhaite diffuser des **contenus différents adaptés au format de chaque support** depuis un seul Raspberry Pi :

- **Écran principal (HDMI 0)** : format 16:9, vidéos sponsors/ambiance, overlay score
- **Écran secondaire (HDMI 1)** : format spécifique (bandeau horizontal, portrait, résolution custom), contenu adapté
- **Écrans futurs (WiFi/USB-HDMI)** : N écrans additionnels avec contenus ciblés

Un même sujet (ex: sponsor X) peut avoir **N versions** : une optimisée par type d'écran.

> **Terminologie** : le terme initial "LED" a été abandonné au profit de "secondary display" car le HDMI secondaire peut alimenter n'importe quel type d'écran (LED, TV, totem, écran géant). Le modèle évolue vers **N displays**.

### Contraintes

- **1 seul Pi** pour piloter les écrans (2 HDMI natifs, extensible via WiFi hotspot PROP-001)
- **Contenus différents** sur chaque écran simultanément
- **Formats vidéo différents** : résolution, ratio, orientation par écran
- **Score live** ([PROP-003](./PROP-003-score-live-multi-vendor.md)) visible sur tous les supports, formaté différemment
- **Multi-TV possible** ([PROP-001](./PROP-001-multi-tv-single-pi.md)) : un signal peut être splitté vers N écrans identiques
- **GPU limité** : 2 flux vidéo simultanés sur Pi = contrainte forte (cf. [ADR-008](../adr/ADR-008-double-buffer-video-pi.md))

### État implémenté (avril 2026)

| Élément                         | Statut        | Détail                                                             |
| ------------------------------- | ------------- | ------------------------------------------------------------------ |
| 2 ports HDMI natifs (Pi 4/5)    | ✅ Utilisés   | HDMI 0 = primary, HDMI 1 = secondary                               |
| Dual kiosk Chromium             | ✅ Implémenté | `kiosk-watchdog.sh` avec `start_chromium_secondary()`              |
| Route `/secondary`              | ✅ Implémenté | `app.routes.ts` avec `data: { displayType: 'secondary' }`          |
| `displayType` dans TvComponent  | ✅ Implémenté | `'tv' \| 'secondary'` via route data                               |
| Table `video_variants`          | ✅ Implémenté | `display_type IN ('tv', 'secondary')`                              |
| Colonnes sites                  | ✅ Implémenté | `secondary_display_enabled`, `secondary_display_resolution`        |
| Dashboard upload variantes      | ✅ Implémenté | Badge `📺 2nd`, feature gate Premium                               |
| Détection hardware HDMI         | ✅ Implémenté | DRM sysfs + udev hotplug + EDID parsing                            |
| GPU fallback                    | ✅ Implémenté | `GPU_DECODE_FALLBACK_FILE` (auto hardware→software après 2 crashs) |
| Indicateur displays dans Remote | ❌ À faire    | Phase 3                                                            |
| Override ciblé (Remote)         | ❌ À faire    | Phase 4                                                            |
| Modèle N-display                | ❌ À faire    | Phase 5                                                            |
| Dashboard preview secondaire    | ❌ À faire    | Phase 3                                                            |

### La Remote et les faits de jeu — Élément critique

La Remote (télécommande sur smartphone/tablette) permet au staff du club de déclencher des **faits de jeu** pendant un match. Avec le multi-display, un même fait de jeu doit produire des **réactions visuelles différentes** sur chaque écran **simultanément** :

| Fait de jeu (Remote)       | Réaction écran principal                                       | Réaction écran secondaire                         |
| -------------------------- | -------------------------------------------------------------- | ------------------------------------------------- |
| **BUT / Point marqué**     | Animation fullscreen/popup + jingle + overlay score mis à jour | Flash bandeau + score clignotant + couleur équipe |
| **Lancer vidéo sponsor**   | Variante TV du sponsor (16:9)                                  | Variante secondaire du sponsor (format adapté)    |
| **Breaking news**          | Bandeau texte défilant en overlay                              | Texte pleine largeur dans le bandeau              |
| **Changement de phase**    | Switch vers boucle vidéo de la phase                           | Switch vers contenu secondaire de la phase        |
| **Timeout / Temps mort**   | Vidéo sponsor timeout + chrono                                 | Bandeau "TEMPS MORT" + chrono décompte            |
| **Score Stramatel** (auto) | Overlay score mis à jour + animation                           | Score mis à jour + flash                          |

**Communication** : Socket.IO est le **seul canal fiable** entre la Remote et les instances kiosk. Les 2 instances Chromium utilisent des `--user-data-dir` différents → BroadcastChannel ne traverse pas.

**Point clé** : Chaque instance Chromium écoute les mêmes événements Socket.IO (`score-update`, `command`, `breaking-news`, `phase-change`) mais les **interprète différemment** selon son `displayType`. Avec l'override ciblé (Phase 4), un champ `target` optionnel permettra de cibler un écran spécifique.

## Décision

Utiliser les **2 sorties HDMI natives du Pi** avec **N instances Chromium kiosk**, chacune chargeant une route Angular différente, et un **système de variantes vidéo N-display** dans le modèle de données.

### Architecture matérielle (implémentée)

```
┌──────────────────────────────────────────────────────┐
│                   Raspberry Pi 5                      │
│                                                        │
│  Chromium 1                Chromium 2                  │
│  /display/0                /display/1                  │
│  Playlist primary 16:9     Playlist secondary custom   │
│  + overlay score           + score format adapté       │
│  + double-buffer           + double-buffer             │
│                                                        │
│  ┌─────────┐               ┌─────────┐                │
│  │ HDMI 0  │               │ HDMI 1  │                │
│  └────┬────┘               └────┬────┘                │
└───────┼──────────────────────────┼─────────────────────┘
        │                          │
        ↓                          ↓
  ┌───────────┐           ┌────────────────┐
  │ Splitter  │           │  TV, LED, ou   │
  │ 1→N HDMI  │           │  tout écran    │
  └┬──┬──┬──┬┘           │  HDMI          │
   │  │  │  │            └────────────────┘
   ↓  ↓  ↓  ↓
  TV TV TV TV
  (même contenu)
```

### Scénario principal — Dual kiosk natif (implémenté) ✅

**Principe** : Le Pi est configuré en bureau étendu (extended desktop). Deux instances Chromium kiosk tournent en parallèle, chacune positionnée sur son écran.

**Détection hardware-driven** (pas de flag config) : le watchdog détecte automatiquement la présence d'un écran sur HDMI 1 via DRM sysfs (`/sys/class/drm/card1-HDMI-A-2/status`). Si un écran est détecté, le mode dual-display est activé automatiquement. La résolution est configurée par `secondary_display_resolution` dans la table `sites`.

**Points d'implémentation clés** :

- `setup_secondary_xrandr()` gère la configuration du bureau étendu
- `start_chromium_secondary()` / `stop_chromium_secondary()` gèrent le cycle de vie
- `DUAL_DISPLAY_ACTIVE` est positionné **uniquement** par le résultat de `setup_secondary_xrandr`
- Le Chromium secondaire utilise `--app=URL` (pas `--kiosk`) + `xprop _MOTIF_WM_HINTS`
- Fallback GPU automatique : `GPU_DECODE_FALLBACK_FILE` bascule hardware→software après 2 crashs

### Scénario B — Écran via WiFi hotspot (PROP-001 scénario E)

Pour les écrans au-delà des 2 HDMI natifs, les devices WiFi (Fire Stick, Smart TV, mini PC) connectés au hotspot du Pi chargent l'app Angular avec une route `/display/:id`. Voir PROP-001 pour les détails.

### Système de variantes vidéo (implémenté)

**Modèle de données actuel** :

```sql
-- Table video_variants (implémentée)
CREATE TABLE video_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  display_type VARCHAR(20) NOT NULL CHECK (display_type IN ('tv', 'secondary')),
  filename VARCHAR(500) NOT NULL,
  storage_path VARCHAR(1000) NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  width INTEGER,
  height INTEGER,
  mime_type VARCHAR(100) DEFAULT 'video/mp4',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(video_id, display_type)
);

-- Colonnes sites (implémentées, renommées depuis led_*)
-- sites.secondary_display_enabled BOOLEAN DEFAULT false
-- sites.secondary_display_resolution VARCHAR(20) -- ex: '1920x384'
```

**Logique de déploiement** :

```
Upload vidéo sponsor "Decathlon"
  ├── Version TV (1920×1080, 16:9) → video_variants (display_type='tv')
  └── Version secondaire (1920×384) → video_variants (display_type='secondary')

Déploiement vers site :
  → Playlist primary = vidéos avec variant 'tv' (ou vidéo principale si pas de variant)
  → Playlist secondary = vidéos avec variant 'secondary' (filtré par display_type)
```

**Résolution des variantes (TvComponent)** : `resolveSecondaryVariant()` sélectionne la variante adaptée au `displayType`. Fallback : `object-fit: cover` sur la version TV si pas de variante secondaire.

### Routes Angular (implémentées + évolution N-display)

**État actuel** :

| Route        | Display                   | Contenu                             |
| ------------ | ------------------------- | ----------------------------------- |
| `/tv`        | HDMI 0 → écran principal  | Playlist TV (16:9) + overlay score  |
| `/secondary` | HDMI 1 → écran secondaire | Playlist secondaire + score compact |
| `/remote`    | Smartphone opérateur      | Télécommande                        |

**Évolution prévue — Modèle N-display** :

| Route         | Display                   | Contenu                 |
| ------------- | ------------------------- | ----------------------- |
| `/display/0`  | HDMI 0 → écran principal  | Playlist display 0      |
| `/display/1`  | HDMI 1 → écran secondaire | Playlist display 1      |
| `/display/:n` | WiFi/USB → écran N        | Playlist display N      |
| `/tv`         | Redirect → `/display/0`   | Rétrocompatibilité      |
| `/secondary`  | Redirect → `/display/1`   | Rétrocompatibilité      |
| `/remote`     | Smartphone opérateur      | Télécommande (inchangé) |

Le `displayIndex` est injecté via route param `:n`. Le TvComponent résout le `displayType` (format de contenu) et le `displayId` (identifiant d'instance) depuis la configuration site :

```typescript
// Modèle cible N-display
interface DisplayConfig {
  index: number;        // 0, 1, 2... — correspond au :n de la route
  displayType: string;  // 'tv', 'led-banner', 'led-wall', 'totem', 'scoreboard'...
  resolution: string;   // '1920x1080', '1920x384', '1080x1920'...
  name: string;         // 'TV Hall', 'Bandeau LED', 'TV Buvette'...
  connection: 'hdmi' | 'wifi'; // comment l'écran est connecté
}

// Configuration site (table sites, JSONB)
displays: DisplayConfig[]
```

### Alignement avec PROP-001 : displayType + displayId

Le modèle unifié (défini dans PROP-001) utilise deux dimensions :

| Dimension     | Rôle                                       | Exemples                                 | Source      |
| ------------- | ------------------------------------------ | ---------------------------------------- | ----------- |
| `displayType` | **Format** du contenu (résolution, layout) | `'tv'`, `'led-banner'`, `'totem'`        | Config site |
| `displayId`   | **Instance** spécifique (ciblage)          | `0` (hall), `1` (bandeau), `2` (buvette) | Route param |

Le `displayIndex` de la route `/display/:n` **est** le `displayId`. Le `displayType` est résolu depuis la configuration site.

### Override ciblé — Commandes manuelles ciblées par écran

**Principe** : par défaut, toutes les commandes sont broadcast à tous les écrans (chacun interprète selon son `displayType`). L'opérateur peut optionnellement cibler un ou plusieurs écrans spécifiques pour les commandes manuelles.

**UX Remote** — Toggle 3 états (dual-display) ou sélecteur (N-display) :

```
┌─────────────────────────────────────────────┐
│  Cible : [Tous] [📺 TV] [🖥️ 2nd]           │ ← dual (actuel)
│─────────────────────────────────────────────│
│  Cible : [Tous] [📺 Hall] [🖥️ LED] [📺 Buv] │ ← N-display (futur)
│─────────────────────────────────────────────│
│  ▶ Vidéo Decathlon                          │
│  ▶ Vidéo Nike                               │
└─────────────────────────────────────────────┘
```

**Protocole Socket.IO** — champ `target` optionnel dans les commandes :

```typescript
// Commande broadcast (défaut, pas de target)
socket.emit('command', { type: 'video', data: { id: 'sponsor-decathlon' } });

// Commande ciblée vers display 1 uniquement
socket.emit('command', { type: 'video', data: { id: 'sponsor-decathlon' }, target: [1] });

// Commande ciblée vers displays 0 et 2
socket.emit('command', { type: 'video', data: { id: 'sponsor-decathlon' }, target: [0, 2] });
```

**Comportement côté récepteur** :

| Champ `target`                 | Comportement display N                              |
| ------------------------------ | --------------------------------------------------- |
| Absent ou `undefined`          | Traite la commande (broadcast, comportement actuel) |
| `[1, 2]` et N est dedans       | Traite la commande                                  |
| `[1, 2]` et N n'est pas dedans | **Ignore** la commande, continue sa boucle en cours |

**Scope de l'override** : uniquement les commandes manuelles (vidéo, breaking news, sponsors). Le score broadcast **toujours** à tous les écrans — la cohérence du score en temps réel est non-négociable.

**Comportement variantes avec ciblage** :

| Cible    | Vidéo a variant TV | Vidéo a variant 2nd | Résultat TV        | Résultat 2nd                                |
| -------- | ------------------ | ------------------- | ------------------ | ------------------------------------------- |
| Tous     | ✅                 | ✅                  | Joue variant TV    | Joue variant 2nd                            |
| Tous     | ✅                 | ❌                  | Joue variant TV    | Fallback `object-fit: cover` sur variant TV |
| TV seul  | ✅                 | ✅/❌               | Joue variant TV    | **Continue sa boucle**                      |
| 2nd seul | ✅/❌              | ✅                  | Continue sa boucle | Joue variant 2nd                            |
| 2nd seul | ✅                 | ❌                  | Continue sa boucle | Fallback `object-fit: cover` sur variant TV |

### Overlay de score adapté par support

**Écran principal** (overlay classique, existant) :

```
┌──────────────────────────────────────────┐
│                                          │
│    ┌────────────────────────┐            │
│    │ PSG  2 - 1  OM        │            │
│    │      Mi-temps 1       │            │
│    └────────────────────────┘            │
│                                          │
│          [Vidéo sponsor]                 │
│                                          │
└──────────────────────────────────────────┘
```

**Écran secondaire bandeau** (score permanent, texte défilant) :

```
┌──────────────────────────────────────────────────────────────┐
│  PSG 2 - 1 OM  │  MT1 - 23:45  │  ★ Prochain : PSG vs OL  │
└──────────────────────────────────────────────────────────────┘
```

> **Note** : les templates de score/animation spécifiques par `displayType` sont en stand-by. Les visuels sont créés en externe et intégrés comme vidéos. Le score overlay par type sera implémenté quand le besoin se confirme, en s'appuyant sur l'override ciblé pour choisir quel écran affiche quoi.

### Événements et comportement par display

| Événement Socket.IO  | Ciblable ?                   | Écran principal                      | Écran secondaire           |
| -------------------- | ---------------------------- | ------------------------------------ | -------------------------- |
| `score-update`       | **Non** (toujours broadcast) | Overlay score + goal animation + son | Score adapté au format     |
| `command` (video)    | **Oui**                      | Joue variante TV (16:9)              | Joue variante secondaire   |
| `command` (sponsors) | **Oui**                      | Boucle sponsors TV                   | Boucle sponsors secondaire |
| `breaking-news`      | **Oui**                      | Bandeau texte en overlay             | Texte adapté au format     |
| `phase-change`       | **Non** (toujours broadcast) | Switch boucle de phase               | Switch contenu de phase    |
| `timer-update`       | **Non** (toujours broadcast) | Chrono dans overlay                  | Chrono adapté au format    |
| `score-reset`        | **Non** (toujours broadcast) | Reset overlay                        | Reset score                |

### Impact Remote

La Remote reste l'interface unique. Ajouts prévus :

1. **Indicateur displays** (Phase 3) : dans le menu header (dropdown `☰`), une ligne d'état compacte :

```
┌──────────────────────────────────┐
│  ☰  Club PSG                    │
│──────────────────────────────────│
│  📺 TV: ●          🖥️ 2nd: ●    │  ← dans le dropdown menu uniquement
│──────────────────────────────────│
│  🌙 Mode sombre                 │
│  🔄 Recharger                   │
│  ...                             │
└──────────────────────────────────┘
```

Pastille verte = connecté, grise = pas d'écran. Pas de bruit sur l'interface principale.

2. **Override ciblé** (Phase 4) : toggle dans la section vidéos/sponsors — voir section "Override ciblé" ci-dessus.

### Dashboard — Gestion des écrans secondaires (implémenté)

Le dashboard central gère déjà :

- **Video Library** : badge `📺 2nd` sur les vidéos ayant une variante secondaire, gated `secondary_display` (Premium)
- **Video Manager** : upload/association de variantes secondaires, événement `secondaryVariantChanged`
- **Config Editor** : indicateur `📺` dans les dropdowns vidéo, badge `📺 2nd` sur les vidéos assignées, input `secondaryDisplayEnabled`
- **Deployment Status** : badge `📺 2nd` sur les déploiements incluant une variante secondaire
- **Site Settings** : feature toggle "Double écran" (tier Premium)
- **Debug Tab / Health Monitor** : section `secondaryDisplayInfo` avec résolution, type d'écran, EDID détaillé, catégorie display

**À ajouter** (Phase 3) : preview du contenu secondaire dans le dashboard (ce que l'écran affiche en ce moment), alimenté par les données de configuration et déploiement existantes.

## Alternatives Considérées

### 1. Un seul HDMI splitté + conversion format

**Rejeté** — ne répond pas au besoin de contenus différenciés. Le scaler dégrade la qualité.

### 2. Pi Compute Module avec 3+ sorties display

**Rejeté** — IO board custom coûteuse, pas de boîtier standard, DSI/DPI incompatibles contrôleurs LED.

### 3. Dual Chromium kiosk natif + variantes vidéo (choisi et implémenté) ✅

Utilise les 2 HDMI natifs. Contenus indépendants par écran. Extensible vers N displays via WiFi (PROP-001) et route `/display/:n`.

## Conséquences

### Positives

1. **Contenus adaptés** à chaque support (format, résolution, ratio)
2. **Score visible partout** mais formaté par type d'écran
3. **Combinable avec PROP-001** : HDMI 0 → splitter → N TV, HDMI 1 → tout écran
4. **Un seul Pi** gère tout : TV + secondaire + Stramatel
5. **Modèle N-display** : route `/display/:n` permet un nombre illimité d'écrans avec contenus ciblés
6. **Override ciblé** : l'opérateur peut envoyer du contenu à un écran spécifique sans perturber les autres
7. **Détection hardware-driven** : pas de config manuelle, le Pi s'adapte au matériel branché

### Négatives

1. **Performance GPU** : 2 décodages vidéo simultanés — Pi 5 recommandé (mitigé par le GPU fallback automatique)
2. **Complexité upload** : l'opérateur doit fournir N versions (mitigé : fallback `object-fit: cover`)
3. **Stockage multiplié** : N fichiers par vidéo (mitigé : les variantes non-TV sont souvent plus petites)

### Risques

| Risque                                  | Mitigation                                        | Statut     |
| --------------------------------------- | ------------------------------------------------- | ---------- |
| GPU surchargé avec 2 flux vidéo         | Pi 5 recommandé + `GPU_DECODE_FALLBACK_FILE` auto | ✅ Mitigé  |
| Chromium crash sur une instance         | Watchdog surveille les 2 instances indépendamment | ✅ Mitigé  |
| Opérateur oublie la variante secondaire | Fallback `object-fit: cover` automatique          | ✅ Mitigé  |
| Résolution secondaire non standard      | `secondary_display_resolution` par site           | ✅ Mitigé  |
| Contrôleur LED incompatible HDMI        | À tester terrain (Linsn MC100, Novastar MX40 Pro) | ⏳ Phase 3 |
| N-display > 2 HDMI physiques            | WiFi hotspot (PROP-001 scénario E)                | ⏳ Phase 5 |

## Plan d'implémentation

### Phase 1 — Dual kiosk + routing ✅ Done

- Watchdog `kiosk-watchdog.sh` : dual Chromium avec `start_chromium_secondary()`
- Route `/secondary` dans `app.routes.ts` avec `data: { displayType: 'secondary' }`
- `TvComponent` : `displayType: 'tv' | 'secondary'`, `resolveSecondaryVariant()`
- Socket.IO comme canal unique (BroadcastChannel non fiable entre user-data-dir)
- Détection hardware HDMI via DRM sysfs + udev hotplug + EDID

### Phase 2 — Variantes vidéo ✅ Done

- Table `video_variants` avec `display_type IN ('tv', 'secondary')`
- Colonnes `secondary_display_enabled`, `secondary_display_resolution` sur `sites`
- Migration `rename-led-to-secondary-display.sql` (généralisation LED → secondary)
- Dashboard : upload variantes, badges `📺 2nd`, feature gate Premium
- Déploiement : `deployment.service.ts` + `config-secondary-variants.ts`
- Repository : `video-variant.repository.ts`
- Debug : `secondaryDisplayInfo` dans Health Monitor

### Phase 3 — Remote + Dashboard awareness (à faire)

1. **Indicateur displays dans la Remote** : pastille d'état dans le menu header (dropdown `☰`)
2. **Dashboard preview secondaire** : visualisation du contenu prévu sur l'écran secondaire
3. **Validation terrain** : tester avec contrôleurs LED (Linsn MC100, Novastar MX40 Pro)
4. **Guide d'installation** : documentation câblage et configuration contrôleur

**Critères de validation** :

- [ ] Remote affiche l'état de connexion de chaque écran dans le menu
- [ ] Dashboard montre le contenu prévu pour l'écran secondaire
- [ ] Test terrain réussi avec au moins 1 modèle de contrôleur LED

### Phase 4 — Override ciblé (à faire)

1. **Champ `target` dans les commandes Socket.IO** : `target?: number[]` (liste de displayId)
2. **Filtrage côté récepteur** : chaque instance ignore les commandes non ciblées
3. **Toggle Remote** : sélecteur "Tous / TV / 2nd" dans la section vidéos
4. **Score toujours broadcast** : le `target` ne s'applique pas aux événements score/timer/phase

**Critères de validation** :

- [ ] Vidéo lancée avec target=[0] → seul display 0 réagit, display 1 continue sa boucle
- [ ] Vidéo lancée sans target → les deux displays réagissent (rétrocompat)
- [ ] Score update → toujours broadcast aux deux, indépendamment du toggle

### Phase 5 — Modèle N-display (à faire)

1. **Route `/display/:n`** dans `app.routes.ts` avec redirects `/tv` → `/display/0`, `/secondary` → `/display/1`
2. **Config site `displays: DisplayConfig[]`** (JSONB) : index, displayType, resolution, name, connection
3. **DB** : `video_variants.display_type` → contrainte ouverte (pas d'enum fermé), ou table `display_types`
4. **Watchdog** : boucle sur N displays détectés (HDMI + WiFi registered)
5. **Remote** : sélecteur multi-display dynamique basé sur `displays[]`
6. **Dashboard** : gestion N variantes par vidéo, config N écrans par site

**Critères de validation** :

- [ ] 3 écrans affichent des contenus différents simultanément (2 HDMI + 1 WiFi)
- [ ] Remote sélecteur dynamique s'adapte au nombre d'écrans configurés
- [ ] Rétrocompat : `/tv` et `/secondary` continuent de fonctionner

## Budget estimé

| Composant                                   | Prix estimé  |
| ------------------------------------------- | ------------ |
| Contrôleur LED (Linsn MC100 ou equiv.)      | 150-300€     |
| Câble HDMI (Pi → contrôleur)                | 5-10€        |
| Pi 5 8GB (si upgrade depuis Pi 4)           | 80-100€      |
| Adaptateur USB-HDMI (3ème écran, optionnel) | 30-50€       |
| **Total hardware additionnel**              | **235-460€** |

(Hors écrans/panneaux LED eux-mêmes — matériel du club)

## Convergence avec PROP-001 (Multi-TV Pi hub WiFi)

PROP-002 et [PROP-001](./PROP-001-multi-tv-single-pi.md) convergent vers un **modèle unifié multi-écran**. Le Pi 5 devient un hub multi-sortie :

```
┌──────────────────────────────────────────────────────────┐
│                    Raspberry Pi 5                         │
│                                                            │
│  HDMI 0 → Splitter → N TV identiques  [displayId=0]      │
│  HDMI 1 → LED / TV / Totem            [displayId=1]      │
│  WiFi   → N devices navigateur         [displayId=2,3...] │
└──────────────────────────────────────────────────────────┘
```

Le modèle `displayType` (format) + `displayId` (ciblage) couvre les deux PROP avec un seul dev. Voir [PROP-001 § Convergence](./PROP-001-multi-tv-single-pi.md#convergence-avec-prop-002-tv--led-dual-output).

## Références

### Code implémenté

- `raspberry/scripts/kiosk-watchdog.sh` — Dual kiosk : `start_chromium_secondary()`, `setup_secondary_xrandr()`, `DUAL_DISPLAY_ACTIVE`
- `raspberry/src/app/app.routes.ts` — Routes `/tv`, `/secondary` avec `displayType` data
- `raspberry/src/app/components/tv/tv.component.ts` — `displayType`, `resolveSecondaryVariant()`
- `raspberry/deploy/server/services/hdmi.service.js` — HDMI detection, EDID parsing, dual-port
- `raspberry/src/app/services/hdmi-status.service.ts` — Angular HDMI monitoring
- `raspberry/config/udev/99-neopro-hdmi-hotplug.rules` — HDMI hotplug events
- `raspberry/scripts/neopro-led-status.sh` — LED status feedback
- `central-server/src/repositories/video-variant.repository.ts` — CRUD variantes
- `central-server/src/utils/config-secondary-variants.ts` — Résolution variantes config
- `central-server/src/services/deployment.service.ts` — Déploiement avec variantes
- `central-dashboard/src/app/features/sites/components/video-library/video-library.component.ts` — Badge `📺 2nd`
- `central-dashboard/src/app/features/sites/components/site-content-tab/config-editor/config-editor.component.ts` — Indicateur secondaire
- `central-dashboard/src/app/features/sites/components/site-debug-tab/health-monitor/health-monitor.component.ts` — `secondaryDisplayInfo`

### Migrations DB

- `central-server/src/scripts/migrations/add-led-support-and-video-variants.sql` — Création initiale
- `central-server/src/scripts/migrations/rename-led-to-secondary-display.sql` — Renommage LED → secondary
- `central-server/src/scripts/migrations/add-has-secondary-variant-to-deployments.sql` — Flag déploiement

### Documents liés

- [ADR-008](../adr/ADR-008-double-buffer-video-pi.md) — Double-Buffer Vidéo (contraintes GPU)
- [ADR-029](../adr/ADR-029-dual-hdmi-tv-led.md) — Décision architecturale dual HDMI
- [PROP-001](./PROP-001-multi-tv-single-pi.md) — Multi-TV + Pi hub WiFi (modèle unifié displayType + displayId)
- [PROP-003](./PROP-003-score-live-multi-vendor.md) — Score Live multi-constructeurs (source automatique des score-update)

---

_Créé le 11 février 2026 — Révisé le 11 avril 2026 (audit implémentation, modèle N-display, override ciblé, convergence PROP-001)_
