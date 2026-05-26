# PROP-011 v2: Multi-Zone LED — Contenus Différenciés par Côté de Terrain depuis un Seul Pi

**Date v1** : 2026-03-01
**Date v2** : 2026-04-22
**Statut** : Proposé — spike Phase 0 pré-requis avant engagement commercial
**Décideurs** : Équipe MadXP
**Lié à** : [PROP-002](./PROP-002-tv-led-dual-output.md), [ADR-029](../adr/ADR-029-dual-hdmi-tv-led.md), [SPIKE-001](./SPIKE-001-dual-hdmi-hardware-validation.md), [SPIKE-003](./SPIKE-003-multi-zone-ultra-wide-validation.md), [ADR-086](../adr/ADR-086-template-studio-n-layers-safe-zones-reversible-animations.md)

---

## Changelog v2 (2026-04-22)

Audit 52 jours après la v1. Mises à jour :

- ❌ **Section "Extension du modèle de variantes vidéo" supprimée** — la migration `n-display-model.sql` a déjà été appliquée : `video_variants.display_type` accepte `^[a-z0-9-]+$` (1-20 chars) et `sites.displays JSONB` existe avec repository prêt (`siteRepository.getDisplays/updateDisplays`). Socket event `displays-changed` déjà émis.
- ✅ **Contrainte GPU ajoutée** : le double-buffer ADR-042 (4 `<video>` par zone) × 4 zones = 16 flux simultanés. Non validé par SPIKE-001. Décision CTO requise : dégrader en mono-player pour les zones (option A, recommandée) ou limiter N≤2 (option B).
- ✅ **7 nouvelles contraintes** listées (EDID custom, hauteur uniforme bandeaux, alerte mismatch, PV installation, mire de test, dégradation double-buffer, budget réel LED).
- ✅ **Budget clarifié** : MadXP **n'achète pas** le contrôleur LED côté client. L'intégrateur LED du club livre le contrôleur avec les dalles. Seul le spike R&D nécessite un contrôleur (0-250€ via emprunt ou occasion).
- ⚠️ **Découplage de PROP-010** : l'auto-génération de variantes reste proposal. PROP-011 v1 s'appuyait dessus comme pré-requis implicite. En v2, on accepte l'upload manuel en premier palier et on pointe **ADR-086 Template Studio v2** comme voie d'auto-génération privilégiée.
- ✅ **SPIKE-003 ouvert** pour valider Pi 5 + 7680×384 + N flux vidéo avant engagement Phase 1.
- ✅ **Effort révisé** : 9-13 jours (au lieu de 11-16j), la Phase 2 étant partiellement retirée (BD déjà prête).

---

## Contexte

Certains clubs sportifs disposent de **panneaux LED sur plusieurs côtés du terrain** (bandeaux Nord, Sud, Est, Ouest). Chaque côté peut être un annonceur différent ou un contenu différent (score côté tribunes, pub côté caméra TV, infos latérales).

Aujourd'hui, PROP-002 / ADR-029 gèrent **2 contenus simultanés** via les 2 HDMI du Pi (TV + secondaire). Un terrain à 4 côtés avec 4 contenus différents dépasse cette limite.

### Marché des panneaux LED bord de terrain en France

| Constructeur        | Spécialité                 | Entrée signal       | Contrôleur typique       |
| ------------------- | -------------------------- | ------------------- | ------------------------ |
| **JSG Technologie** | Panneaux LED sportifs      | HDMI via contrôleur | Novastar / Colorlight    |
| **Stramatel**       | Tableaux d'affichage + LED | HDMI via contrôleur | Propriétaire ou Novastar |
| **Bodet Sport**     | Tableaux d'affichage + LED | HDMI via contrôleur | Propriétaire ou Novastar |
| **Daktronics**      | LED pro (stades)           | HDMI via contrôleur | Propriétaire             |

MadXP est agnostique du fabricant des dalles. Le signal d'entrée passe toujours par un **contrôleur LED** (sending card) qui accepte du HDMI standard. MadXP envoie du HDMI, le contrôleur distribue.

### Modèle économique — Qui achète quoi

| Hardware                        | Acheteur         | Moment                                  |
| ------------------------------- | ---------------- | --------------------------------------- |
| Dalles LED (JSG/Stramatel/etc.) | Club             | Installation pré-existante le + souvent |
| Contrôleur LED (Novastar, etc.) | Intégrateur LED  | Livré **avec** les dalles               |
| Raspberry Pi 5 + câbles         | **MadXP**        | Produit vendu                           |
| Installation HDMI Pi↔contrôleur | Intégrateur/tech | Setup terrain                           |

**MadXP n'achète pas de contrôleur LED côté client.** Pour le spike R&D interne, un seul contrôleur suffit (emprunt partenaire intégrateur, occasion 150-250€, ou neuf 300-500€).

### Contraintes

- **1 seul Pi** pour piloter TV + tous les côtés LED
- **Contenus différents** par côté (pub ciblée côté caméra, score côté tribunes, etc.)
- **2 HDMI max** sur le Pi → HDMI 0 pour TV, HDMI 1 pour le contrôleur LED
- **Synchronisation** : tous les côtés changent en même temps (même framebuffer garantit la sync gratuitement)
- **GPU Pi 5** : doit composer le framebuffer multi-zone en temps réel — ⚠️ **non validé sur N flux simultanés**
- **Hauteur uniforme** : tous les bandeaux d'un même terrain doivent avoir la même hauteur en pixels (contrainte géométrie framebuffer)

### État actuel post-migration n-display (2026-04-22)

- `video_variants.display_type` ouvert à `^[a-z0-9-]+$` (1-20 chars) → accepte `tv`, `secondary`, `zone-1`, `zone-N`
- `sites.displays JSONB` existe avec `siteRepository.getDisplays/updateDisplays` (site.repository.ts:702-720)
- Socket event `displays-changed` émis au site room (socket.service.ts:395-812)
- Composant Angular `/secondary` rend un seul flux plein écran
- Variantes secondary servies via `/videos-secondary/` (ADR-033) et survivent aux merge/replace config (ADR-032)

## Décision

Envoyer une **image ultra-large composée de N zones côte à côte** sur le HDMI secondaire du Pi. Le contrôleur LED découpe (crop) chaque zone et la distribue au côté de terrain correspondant.

### Architecture — Image composite multi-zone

```
Ce que le Pi rend sur HDMI 1 (1 seule fenêtre Chromium) :
┌───────────┬───────────┬───────────┬───────────┐
│  Zone 1   │  Zone 2   │  Zone 3   │  Zone 4   │
│  Pub A    │  Score    │  Pub B    │  Infos    │
│  1920×384 │  1920×384 │  1920×384 │  1920×384 │
└───────────┴───────────┴───────────┴───────────┘
              Image totale : 7680 × 384 pixels

Ce que le contrôleur LED distribue physiquement :

              Côté Nord - Zone 1 (Pub A)
         ┌──────────────────────────┐
         │                          │
  Côté   │                          │  Côté
  Ouest  │        TERRAIN           │  Est
  Zone 4 │                          │  Zone 2
 (Infos) │                          │ (Score)
         │                          │
         └──────────────────────────┘
              Côté Sud - Zone 3 (Pub B)
```

⚠️ Le schéma physique est une représentation logique : les 4 côtés ne sont **pas alignés** dans le framebuffer (ils sont perpendiculaires dans le réel). Le framebuffer reste une image 2D plate ; c'est le contrôleur LED qui fait la gymnastique physique port → câble → côté.

### Faisabilité Pi 5 — Bande passante HDMI

| Résolution                 | Pixels | Pixel clock estimé | Limite Pi 5 | Verdict                            |
| -------------------------- | ------ | ------------------ | ----------- | ---------------------------------- |
| 7680×384 @60Hz             | ~3M    | ~185 MHz           | 600 MHz     | OK théorique — **à valider spike** |
| 5760×384 @60Hz (3 zones)   | ~2.2M  | ~140 MHz           | 600 MHz     | OK                                 |
| 3840×384 @60Hz (2 zones)   | ~1.5M  | ~95 MHz            | 600 MHz     | OK                                 |
| 3840×2160 @60Hz (fallback) | ~8.3M  | ~594 MHz           | 600 MHz     | Limite — dual HDMI à risque        |

### Contrôleurs LED compatibles multi-zone

| Contrôleur           | HDMI | Largeur max | Ports  | Zone mapping      | Prix estimé |
| -------------------- | ---- | ----------- | ------ | ----------------- | ----------- |
| **Novastar MCTRL4K** | 2.0  | **7680px**  | 16     | Oui (NovaLCT)     | 300-500€    |
| **Colorlight Z6**    | 2.0  | 8192px      | Multi  | Oui (crop/splice) | 300-500€    |
| **Linsn TS901**      | 1.x  | 2048px      | Limité | Cascade requise   | 100-200€    |

**Recommandation spike** : Novastar MCTRL4K (7680px, documentation accessible, custom EDID).

### Configuration contrôleur — contrat statique à 3 acteurs

Le contrôleur LED est configuré **une fois à l'installation** via NovaLCT, jamais piloté dynamiquement par MadXP. La config doit matcher pixel à pixel `sites.displays` côté cloud. Voir [RUNBOOK_LED_INSTALLATION.md](../guides/RUNBOOK_LED_INSTALLATION.md) pour le PV d'installation signé intégrateur ↔ MadXP.

### Implémentation MadXP (delta réel à 2026-04-22)

| Brique                                        | État         | Travail restant                                                   |
| --------------------------------------------- | ------------ | ----------------------------------------------------------------- |
| BD `video_variants.display_type` ouvert       | ✅           | Rien                                                              |
| BD `sites.displays JSONB` + repository        | ✅           | Rien                                                              |
| Détection HDMI + xrandr dynamique             | ✅           | Tester résolutions custom ultra-larges (SPIKE-003)                |
| Composant Angular `<app-zone>`                | ❌           | Phase 1 — 3-4j                                                    |
| Sync inter-zones (même Pi)                    | ⚠️ à adapter | ADR-031 = inter-Pi. Inter-zone = sync "gratuite" même framebuffer |
| Dashboard : UI multi-zone                     | ❌           | Phase 2 — 2-3j                                                    |
| Upload variantes `zone-N`                     | ⚠️ API OK    | Étendre onglet zones dans content-editor                          |
| `deploySecondaryVariant()` sync-agent         | ✅ secondary | Étendre pour `zone-N`                                             |
| `restoreSecondaryVariants()` ADR-032          | ✅ secondary | **Doit** inclure `zone-N` (sinon régression)                      |
| Watchdog `setup_secondary_xrandr` ultra-large | ✅ base      | Calculer total_width depuis `sites.displays`                      |

### Décision GPU requise avant Phase 1

Le double-buffer ADR-042 (`DoubleBufferVideoService`) instancie 4 `<video>` par zone pour le cross-fade. 4 zones × 4 players = **16 éléments `<video>` simultanés** sur le Chromium secondaire. Non validé par SPIKE-001.

**Option A — Dégrader en mono-player pour les zones (RECOMMANDÉ)**

- Les zones bandeau affichent des pubs statiques ou animations courtes (pas de vidéo 4K complexe)
- Transitions plus brutes (pas de cross-fade parfait) mais acceptable sur bandeau
- Pas de charge GPU excessive

**Option B — Conserver double-buffer mais limiter N≤2 zones**

- 2 zones × 4 players = 8 `<video>` (comparable à dual-TV actuel)
- Impose un 2ᵉ contrôleur LED en cascade au-delà de 2 zones
- Qualité visuelle préservée

→ Décision à prendre après SPIKE-003.

### Fallback intelligent (inchangé v1)

Cascade de résolution de variante par zone :

1. Variante `zone-N` présente → l'utiliser
2. Sinon variante `secondary` → l'utiliser
3. Sinon variante `tv` → object-fit: cover

Un sponsor qui livre 1 variante bandeau est auto-dupliqué sur les 4 zones. Un sponsor qui livre 4 variantes a du contenu différencié.

## 7 contraintes ajoutées en v2

1. **EDID custom obligatoire** côté contrôleur LED pour les résolutions ultra-larges. Sans reprogrammation NovaLCT, le Pi fallback en 1920×1080 et la négociation échoue. Manip 5 min en atelier avec PC Windows.
2. **GPU V3D Pi 5 non validé** pour N flux vidéo simultanés. SPIKE-001 a testé 2 Chromium × 1 flux, pas 1 Chromium × 16 flux. SPIKE-003 à livrer avant Phase 1.
3. **Hauteur uniforme des bandeaux** : tous les côtés d'un même terrain doivent partager la même hauteur pixel. Un Nord 1920×384 + Est 1920×160 casse la géométrie framebuffer. Alternative : 2 contrôleurs LED ou padding noir.
4. **Alerte `edid_mismatch`** côté sync-agent : lire l'EDID réel du contrôleur, comparer à `sites.displays`, lever une alerte si divergence. Évite la dérive silencieuse (cas A du doc audit).
5. **PV d'installation signé** intégrateur LED ↔ admin MadXP qui fige les coordonnées de crop et le nombre de panneaux physiques. Source de vérité commerciale contre les zones fantômes.
6. **Mire de test au boot** : 3-5 secondes d'affichage numéros de zone + couleurs distinctes avant de basculer sur le contenu réel. Permet à l'installateur de valider visuellement.
7. **Verrou `super_admin`** sur `sites.displays` : modification impossible depuis le dashboard standard avec warning explicite sur la nécessité d'une intervention terrain parallèle.

## Alternatives considérées (inchangées)

1. **Multi-Pi (1 Pi par côté)** : coût × 4, sync inter-Pi non garantie. Fallback recevable.
2. **4K tuilé 2×2 (3840×2160)** : pixel clock 594 MHz, proche limite Pi 5. Sous-optimal pour bandeaux 5:1. Fallback si ultra-wide échoue au SPIKE-003.
3. **Image ultra-large composée (choisie)** : 1 Pi + 1 contrôleur, sync gratuite (même framebuffer), rétrocompatible via cascade de variantes.

## Plan d'implémentation v2

### Phase 0 — SPIKE-003 (2-3 jours) — PRÉ-REQUIS

Référence : [SPIKE-003](./SPIKE-003-multi-zone-ultra-wide-validation.md).

Objectifs :

- Valider Pi 5 + 7680×384 @60Hz stable via `xrandr --newmode`
- Mesurer charge GPU avec 4 `<video>` h264 simultanés dans un Chromium `--app` secondaire
- Tester custom EDID Novastar (NovaLCT) et workaround `cmdline.txt` avec flag `D`
- Valider stabilité 2h minimum sans tearing ni memory leak

**GO Phase 1** si :

- [ ] Mode custom négocié sans fallback 1080p
- [ ] 4 flux vidéo jouent sans drop frame > 5%
- [ ] RAM stable, CPU < 70%, 0 GPU error

**NO-GO** → fallback option A (mono-player) ou B (N≤2 zones) ou 4K tuilé.

### Phase 1 — Composant Angular multi-zone (3-4 jours)

1. Créer `ZoneComponent` (mono-player ou double-buffer selon décision SPIKE-003)
2. Route `/secondary` lit `sites.displays` au boot et rend N `<app-zone>` côte à côte
3. Chaque zone résout sa variante via cascade `zone-N` → `secondary` → `tv`
4. Sync implicite via même `requestAnimationFrame` (même framebuffer)
5. Tests unitaires + E2E dual-display multi-zone

### Phase 2 — Dashboard + extensions sync-agent (2-3 jours)

Note : la partie BD (CHECK constraint + JSONB) est **déjà faite**. Phase réduite par rapport à v1.

1. Dashboard : configurateur graphique qui écrit dans `sites.displays` (verrou `super_admin`)
2. Content-editor : onglet "Zones" pour uploader variantes `zone-N` par sponsor
3. Sync-agent : `deploySecondaryVariant()` étendu pour déployer N variantes `zone-N`
4. Sync-agent : `restoreSecondaryVariants()` whitelist étendue à `zone-[0-9]+`
5. Mire de test au boot (composant Angular dédié, 5s affichage avant contenu)

### Phase 3 — Watchdog + alerting (1-2 jours)

1. `setup_secondary_xrandr()` calcule `total_width` depuis `sites.displays`
2. Application via `xrandr --newmode` + `--addmode` au démarrage
3. Recovery après hot-plug perdant la résolution custom
4. Sync-agent : lecture EDID réel + alerte `edid_mismatch` si divergence avec `sites.displays`
5. Smoke tests watchdog pour les nouvelles contraintes

### Phase 4 — Validation terrain (2-3 jours)

1. Premier déploiement pilote chez un prospect avec panneaux LED multi-côtés
2. PV d'installation signé intégrateur ↔ MadXP
3. Validation mire de test
4. Monitoring post-déploiement 72h (RAM, GPU errors, crashs Chromium)

## Budget v2

### Hardware — rôles clarifiés

| Rôle               | Hardware                     | Acheteur                 | Coût                           |
| ------------------ | ---------------------------- | ------------------------ | ------------------------------ |
| Déploiement client | Pi 5 + câbles HDMI           | MadXP (produit)          | Déjà dans le BOM               |
| Déploiement client | Contrôleur LED + dalles      | **Client / intégrateur** | Hors budget MadXP              |
| Spike R&D interne  | Contrôleur Novastar MCTRL4K  | MadXP (one-off)          | 0-500€ (emprunt/occasion/neuf) |
| Spike R&D interne  | Panneau LED ou moniteur test | Emprunt partenaire       | 0€                             |

### Développement

| Phase                            | Effort    | Cumulé         | Delta v1            |
| -------------------------------- | --------- | -------------- | ------------------- |
| Phase 0 — SPIKE-003              | 2-3 jours | 2-3j           | =                   |
| Phase 1 — Composant multi-zone   | 3-4 jours | 5-7j           | =                   |
| Phase 2 — Dashboard + sync-agent | 2-3 jours | 7-10j          | -1j (BD déjà prête) |
| Phase 3 — Watchdog + alerting    | 1-2 jours | 8-12j          | =                   |
| Phase 4 — Validation terrain     | 2-3 jours | 10-15j         | =                   |
| **Total v2**                     |           | **9-13 jours** | -2j                 |

## Conséquences

### Positives

1. 1 Pi = 1 terrain complet (TV + 4 côtés)
2. Coût matériel : 1 contrôleur LED client au lieu de 4
3. Sync parfaite (même framebuffer)
4. Rétrocompatible (cascade de variantes)
5. Extensible de 2 à N zones
6. Auto-génération future via ADR-086 Template Studio v2 (alternative propre à PROP-010 FFmpeg)

### Négatives

1. Résolution HDMI custom nécessite validation SPIKE-003
2. Config contrôleur LED = passage technicien one-shot
3. Upload variantes par zone = effort éditorial annonceur (mitigé par cascade)
4. Contrat statique BD ↔ contrôleur : toute désync = affichage cassé silencieusement (mitigé par PV d'install + alerte `edid_mismatch`)

### Risques (révisés)

| Risque                                              | Probabilité | Mitigation                                      |
| --------------------------------------------------- | ----------- | ----------------------------------------------- |
| Pi 5 ne gère pas 7680px                             | Faible      | SPIKE-003. Fallback 4K tuilé                    |
| **GPU saturé par N flux vidéo simultanés**          | **Moyenne** | **SPIKE-003 + option A mono-player**            |
| Contrôleur refuse la résolution custom              | Moyenne     | EDID custom NovaLCT. Fallback `cmdline.txt D`   |
| Hot-plug perd la résolution custom                  | Moyenne     | Script watchdog de recovery                     |
| Dérive silencieuse BD ↔ contrôleur (zones fantômes) | Élevée      | PV install + alerte `edid_mismatch` + mire test |
| Clubs veulent > 4 zones                             | Faible      | Extensible tant que largeur ≤ 7680px            |
| Annonceurs ne fournissent pas N variantes           | Élevée      | Cascade `zone-N` → `secondary` → `tv`           |
| Hauteurs bandeaux non uniformes                     | Moyenne     | Spec contractuelle client ou 2 contrôleurs      |

## Recommandations stratégiques

1. **Vendre le panneau LED unique dès maintenant** — zéro dev, tout est en place (ADR-029, ADR-031, ADR-032, ADR-033). Premier déploiement avec technicien présent (cf. runbook). Pas besoin de PROP-011.
2. **Ne pas vendre de multi-zone avant SPIKE-003** — risque planning/qualité 30-40% sinon. Après spike GO, risque <15%.
3. **Pricing multi-zone en 2 tiers** : LED Basic (modèle A, 1 variante bandeau partout), LED Pro (modèle B, variantes par zone). Justifie surcoût abonnement.
4. **Éviter les presets contrôleur** (API propriétaire par fabricant) pour le MVP. Garder la config statique install.

## Références

- [PROP-002](./PROP-002-tv-led-dual-output.md) — TV + LED Dual Output
- [ADR-029](../adr/ADR-029-dual-hdmi-tv-led.md) — Dual HDMI
- [ADR-031](../adr/ADR-031-master-slave-video-loop-sync.md) — Sync master-slave
- [ADR-032](../adr/ADR-032-secondary-variants-restore.md) — Restore variantes secondary
- [ADR-033](../adr/ADR-033-videos-secondary-serving.md) — Secondary variant serving + race condition fixes
- [ADR-042](../adr/ADR-042-extract-tv-component-services.md) — Extraction tv.component en 3 services
- [ADR-086](../adr/ADR-086-template-studio-n-layers-safe-zones-reversible-animations.md) — Template Studio v2
- [SPIKE-001](./SPIKE-001-dual-hdmi-hardware-validation.md) — Validation dual HDMI
- [SPIKE-003](./SPIKE-003-multi-zone-ultra-wide-validation.md) — Validation multi-zone ultra-wide
- [RUNBOOK_LED_INSTALLATION](../guides/RUNBOOK_LED_INSTALLATION.md) — Procédure installation LED
- Novastar MCTRL4K : [Spécifications](https://oss.novastar.tech/uploads/2024/11/MCTRL4K-LED-Display-Controller-Specifications-V1.2.1.pdf)

---

_v1 créée le 1 mars 2026 — v2 révisée le 22 avril 2026_
