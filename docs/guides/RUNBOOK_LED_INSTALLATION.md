# Runbook — Installation LED (panneau unique & multi-zone)

> Procédure terrain pour raccorder un Raspberry Pi MadXP à un contrôleur LED. Couvre le mode **LED unique** (produit vendable dès 2026-04-22, zéro dev) et le mode **multi-zone** (après GO SPIKE-003, cf. [PROP-011 v2](../proposals/PROP-011-multi-zone-led.md)).

**Date** : 2026-04-22
**Version** : 1.0
**Public cible** : installateur MadXP, technicien intégrateur LED, admin super_admin

---

## Contrat en 1 phrase

> La config `sites.displays` dans le dashboard MadXP DOIT matcher pixel à pixel la config NovaLCT du contrôleur LED, faute de quoi l'affichage est cassé silencieusement (zones fantômes) sans erreur technique détectable.

Le PV d'installation (§6) scelle ce contrat. Sans PV signé, ne pas mettre en production.

---

## 1. Prérequis avant déplacement

### Côté MadXP (atelier)

- [ ] Raspberry Pi 5 flashé image MadXP à jour (`npm run build:raspberry` récent)
- [ ] Site créé côté dashboard central (`site_type='pi'`, `api_key` générée)
- [ ] `sites.displays` **laissé à `null`** jusqu'à validation sur place (évite de pousser une config incohérente)
- [ ] Câble micro-HDMI → HDMI standard × 2 (un pour TV, un pour contrôleur)
- [ ] Alimentation Pi 5 officielle 27W USB-C + ventilateur actif (critique en sortie été)

### Côté client (à confirmer en amont)

- [ ] Dalles LED installées et alimentées, receiving cards configurées
- [ ] Contrôleur LED présent dans une baie technique accessible
- [ ] Référence précise du contrôleur (ex : `Novastar MCTRL4K`, `Colorlight Z6`, `Linsn TS901`)
- [ ] Résolution **native** de chaque bandeau (ex : 1920×384, 2048×256). **Exiger la fiche constructeur des dalles.**
- [ ] Nombre de panneaux physiques réellement câblés (peut différer du nombre de ports contrôleur si phasing)
- [ ] Accès réseau (Ethernet ou WiFi) pour le Pi
- [ ] Câble HDMI de la baie contrôleur vers l'emplacement Pi (longueur à confirmer)

### Outils à emporter

- [ ] PC portable Windows (pour NovaLCT / LEDVision / équivalent propriétaire)
- [ ] Câble USB du PC vers contrôleur LED (USB-B classique pour Novastar)
- [ ] Clé USB contenant NovaLCT (ou l'équivalent fabricant) + pilote USB du contrôleur
- [ ] Clé USB de secours avec image Pi flashable
- [ ] Multimètre / testeur HDMI (optionnel mais utile)
- [ ] Smartphone pour photos PV

---

## 2. Mode LED unique — installation standard (zéro dev)

Cas le plus simple : 1 bandeau LED couvre un ou plusieurs côtés, **une seule source** de contenu (pas de différenciation par zone). C'est le produit MadXP vendable dès maintenant.

### 2.1 Câblage

```
Pi 5 ──micro-HDMI 0──> TV principale (ou rien si pas de TV)
Pi 5 ──micro-HDMI 1──> Contrôleur LED ──Ethernet──> Dalles
```

### 2.2 Négociation EDID — vérifications obligatoires

1. Brancher uniquement le HDMI 1 (Pi ↔ contrôleur). Laisser le contrôleur sous tension.
2. Booter le Pi.
3. Après boot (30s), vérifier :

```bash
# Détection DRM
cat /sys/class/drm/card1-HDMI-A-2/status
# → doit retourner "connected"

# EDID lu par le Pi
cat /sys/class/drm/card1-HDMI-A-2/edid | edid-decode | head -40
# → vérifier qu'au moins une résolution proche de la cible bandeau est listée

# Résolution effectivement négociée
DISPLAY=:0 xrandr --display :0 | grep HDMI
# → doit afficher la résolution native du bandeau (ou 1920×1080 fallback)

# État watchdog
cat /home/pi/neopro/data/kiosk-status.json | jq '.dual'
# → DUAL_DISPLAY_ACTIVE doit être true après 1 min
```

### 2.3 Si l'EDID est mauvais

3 voies, par ordre de préférence (cf. PROP-011 v2 §"Si l'EDID n'est pas bon") :

**Voie 1 — Reprogrammation EDID via NovaLCT (propre)**

1. Brancher le PC au contrôleur via USB.
2. Ouvrir NovaLCT → `Screen Config` → `Sending Card` → `Custom Resolution`.
3. Ajouter un mode personnalisé (ex : 1920×384 @60Hz).
4. Flasher dans la mémoire du contrôleur. Débrancher.
5. Rebrancher le Pi et rebooter. Vérifier EDID de nouveau.

**Voie 2 — Forcer côté Pi (workaround si intégrateur non dispo)**
Éditer `/boot/firmware/cmdline.txt` :

```
video=HDMI-A-2:1920x384M@60D
```

Le `D` force le mode en ignorant l'EDID. Reboot. Attention : si le contrôleur est débranché ensuite, `xrandr --addmode` échouera au prochain boot.

**Voie 3 — Accepter le fallback**
Si le contrôleur ne sait qu'accepter du 1920×1080 et que le bandeau est 1920×384, il y aura du letterbox ou du crop côté contrôleur. Le rendu reste utilisable si le client accepte la qualité.

### 2.4 Configuration MadXP

Une fois la résolution validée :

```json
// sites.displays via SQL ou UI super_admin
[
  { "index": 0, "name": "TV", "type": "tv", "resolution": "1920x1080" },
  { "index": 1, "name": "Bandeau", "type": "secondary", "resolution": "1920x384" }
]
```

Si le site n'a **pas** de TV (LED seule), mettre `null` sur l'index 0 ou omettre l'entrée `tv`.

### 2.5 Variante bandeau test

Avant le premier vrai contenu client :

```bash
# Uploader via le dashboard une vidéo 1920×384 "mire de test MadXP"
# display_type = 'secondary'
# Vérifier qu'elle apparaît sur le bandeau dans les 5 min après déploiement
```

### 2.6 Checklist régie — LED unique

| #   | Vérification                                               | ✅ / ❌ |
| --- | ---------------------------------------------------------- | ------- |
| 1   | Pi 5 avec câbles micro-HDMI des deux côtés                 |         |
| 2   | Contrôleur LED configuré (EDID native du bandeau acceptée) |         |
| 3   | Résolution native du bandeau connue et documentée          |         |
| 4   | `detect_hdmi1_status()` retourne `connected` au boot       |         |
| 5   | `DUAL_DISPLAY_ACTIVE=true` dans `kiosk-status.json`        |         |
| 6   | 2ᵉ Chromium visible (`pgrep -c chromium` = 2)              |         |
| 7   | Variante secondary uploadée et affichée sur bandeau        |         |
| 8   | Test 1h sans crash ni tearing                              |         |
| 9   | Photo du bandeau en fonctionnement prise et archivée       |         |

**GO production** si les 9 lignes sont ✅. Sinon, documenter le blocage et ne pas remettre les clés au client.

---

## 3. Mode multi-zone — installation après GO SPIKE-003

⚠️ **Ne pas exécuter avant GO SPIKE-003 et merge des Phases 1-3 PROP-011 v2.** Cette section est la procédure cible.

### 3.1 Préparation atelier élargie

En plus de §1, ajouter :

- [ ] Schéma du terrain avec numéros de zone (Nord = zone-1, Est = zone-2, etc.) validé par le commercial
- [ ] Résolution **identique** sur tous les bandeaux (contrainte géométrie framebuffer — cf. PROP-011 v2 contrainte #3)
- [ ] Nombre de zones = nombre de panneaux physiques **réellement câblés** (pas de "on en ajoutera plus tard" dans le dashboard)

### 3.2 Configuration contrôleur (intégrateur LED)

NovaLCT, pour un terrain 4 zones × 1920×384 :

| Port Ethernet | Crop (x₁, y₁) → (x₂, y₂) | Destination physique |
| ------------- | ------------------------ | -------------------- |
| Port 1        | (0, 0) → (1920, 384)     | Côté Nord            |
| Port 2        | (1920, 0) → (3840, 384)  | Côté Est             |
| Port 3        | (3840, 0) → (5760, 384)  | Côté Sud             |
| Port 4        | (5760, 0) → (7680, 384)  | Côté Ouest           |
| Input HDMI    | 7680×384 @60Hz           | —                    |

**Flasher** la config dans le contrôleur. **Exporter le PDF NovaLCT** (source de vérité).

### 3.3 Configuration MadXP (admin super_admin uniquement)

```json
[
  { "index": 0, "name": "TV", "type": "tv", "resolution": "1920x1080", "x": 0 },
  { "index": 1, "name": "Nord", "type": "zone-1", "resolution": "1920x384", "x": 0 },
  { "index": 2, "name": "Est", "type": "zone-2", "resolution": "1920x384", "x": 1920 },
  { "index": 3, "name": "Sud", "type": "zone-3", "resolution": "1920x384", "x": 3840 },
  { "index": 4, "name": "Ouest", "type": "zone-4", "resolution": "1920x384", "x": 5760 }
]
```

**Les coordonnées `x` doivent matcher exactement les coordonnées de crop du contrôleur.** Tout décalage = pubs tronquées, logos coupés.

### 3.4 Mire de test au boot

Après reboot du Pi, la mire MadXP affiche 5 secondes :

```
┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│                 │                 │                 │                 │
│   ZONE 1        │   ZONE 2        │   ZONE 3        │   ZONE 4        │
│   NORD          │   EST           │   SUD           │   OUEST         │
│   1920×384      │   1920×384      │   1920×384      │   1920×384      │
│   (rouge)       │   (vert)        │   (bleu)        │   (jaune)       │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┘
```

**Validation terrain** :

- [ ] Chaque côté affiche bien son numéro et sa couleur attendus ?
- [ ] Aucun texte tronqué aux bords ?
- [ ] Couleurs correctes (pas de channel inversé) ?
- [ ] Synchronisation parfaite entre côtés (aucun retard visible) ?

Si NON → retour étape 3.2 (mismatch coordonnées).

### 3.5 Checklist régie — multi-zone

| #   | Vérification                                                              | ✅ / ❌ |
| --- | ------------------------------------------------------------------------- | ------- |
| 1   | Contrôleur LED accepte largeur cible (7680px pour 4 zones)                |         |
| 2   | Custom EDID flashé (NovaLCT, nouvelle résolution acceptée)                |         |
| 3   | Hauteur identique sur toutes les dalles physiques                         |         |
| 4   | PDF NovaLCT exporté et archivé                                            |         |
| 5   | `sites.displays` configuré par super_admin (coordonnées matchent NovaLCT) |         |
| 6   | Watchdog applique `xrandr --newmode` au boot (pas de fallback 1080p)      |         |
| 7   | Mire de test : 4 zones correctes, numéros, couleurs                       |         |
| 8   | Aucune alerte `edid_mismatch` dans le dashboard (sync-agent)              |         |
| 9   | Test 2h avec contenu réel (RAM < 2GB, CPU < 70%, 0 crash)                 |         |
| 10  | Photo du terrain en fonctionnement, 4 côtés visibles                      |         |
| 11  | PV d'installation signé (cf. §6)                                          |         |

---

## 4. Diagnostic rapide — cas fréquents

### 4.1 Écran noir sur le bandeau

```bash
cat /sys/class/drm/card1-HDMI-A-2/status
```

- `disconnected` → câble HDMI débranché ou contrôleur éteint.
- `connected` mais écran noir → négociation EDID OK, problème côté contrôleur (mauvais port Ethernet, receiving card HS).

### 4.2 Image déformée / étirée

Mismatch EDID vs résolution native. Vérifier :

```bash
DISPLAY=:0 xrandr --display :0 | grep "*"
```

Si la résolution affichée n'est pas la native du bandeau → voie 1 §2.3 (reprogrammer EDID).

### 4.3 Seule la première zone fonctionne, les autres noires

Cas C du doc audit : `sites.displays` = 1 zone, contrôleur = N zones câblé. Les ports 2-N cropent du vide.

```bash
# Vérifier la résolution effective
DISPLAY=:0 xrandr --display :0 | grep HDMI-A-2
```

Si la largeur est 1920 au lieu de 7680 → mettre à jour `sites.displays` avec les N zones et rebooter.

### 4.4 Watchdog reste en single-display alors que le câble est branché

Après 2 min de boot :

```bash
tail -50 /home/pi/neopro/data/logs/kiosk-watchdog.log | grep -i "setup_secondary_xrandr"
```

Chercher la ligne d'erreur `xrandr --addmode`. Si `BadMatch` → le mode custom n'est pas dans l'EDID du contrôleur. Appliquer voie 2 §2.3.

### 4.5 Zones fantômes (cas A — le plus toxique)

`sites.displays` = 4 zones, contrôleur = 4 zones, mais seulement 1 panneau physique câblé → zones 2-4 rendues mais invisibles.

**Aucune détection automatique.** Seules garanties : PV d'installation signé (§6) + photo terrain. Si découvert post-install, modifier `sites.displays` pour ne déclarer que les panneaux physiquement présents.

---

## 5. Mise en production & transfert

### 5.1 Signatures requises

- [ ] PV d'installation signé intégrateur LED + admin MadXP
- [ ] Photos terrain archivées (dashboard admin → onglet site → `installation_photos/`)
- [ ] PDF NovaLCT archivé côté MadXP
- [ ] Compte admin/operator créé côté client si applicable

### 5.2 Monitoring post-installation

72h de surveillance active :

- Alertes dashboard (RAM > 2GB, crashes Chromium, `edid_mismatch`, watchdog restarts)
- Vérification quotidienne du heartbeat Pi
- Contact client J+1, J+3, J+7 pour retour qualitatif

### 5.3 Rollback

Si le multi-zone ne tient pas la charge terrain :

1. Modifier `sites.displays` pour ne déclarer que 1 zone `secondary`
2. Reboot Pi → retour mode LED unique
3. Le contrôleur LED reste configuré N zones (ports 2-N affichent du noir, inoffensif)
4. Programmer retour technicien pour reconfiguration NovaLCT en 1 zone si durable

---

## 6. PV d'installation — template

```
═══════════════════════════════════════════════════════════════════════
  PV D'INSTALLATION LED MADXP
═══════════════════════════════════════════════════════════════════════

Date d'installation   : ________________________________________________
Site / Club           : ________________________________________________
Site ID MadXP        : ________________________________________________
Adresse               : ________________________________________________

─── INTERVENANTS ──────────────────────────────────────────────────────

Intégrateur LED       : ________________________________________________
Société               : ________________________________________________
Admin MadXP          : ________________________________________________

─── MATÉRIEL INSTALLÉ ─────────────────────────────────────────────────

Raspberry Pi 5        : Série n° _______________________________________
Contrôleur LED        : Modèle _____________________ S/N _______________
Dalles LED            : Fabricant ______________ Modèle _______________
Nombre de panneaux    : _____  (Nord [ ]  Est [ ]  Sud [ ]  Ouest [ ]  Autres : _____)

─── CONFIGURATION CONTRÔLEUR (NOVALCT) ────────────────────────────────

Résolution input      : ________ × ________ @ 60Hz
Custom EDID flashé    : [ ] OUI   [ ] NON (forçage cmdline.txt)
Nombre de zones       : _____

Port 1 → crop (___, ___) → (___, ___)  → Destination : __________________
Port 2 → crop (___, ___) → (___, ___)  → Destination : __________________
Port 3 → crop (___, ___) → (___, ___)  → Destination : __________________
Port 4 → crop (___, ___) → (___, ___)  → Destination : __________________

PDF NovaLCT export    : [ ] fourni à MadXP   [ ] non fourni

─── CONFIGURATION MADXP (sites.displays) ─────────────────────────────

[ ] sites.displays saisi par super_admin et validé
[ ] Coordonnées x match les crops NovaLCT ci-dessus
[ ] Résolution totale : ________ × ________

─── VALIDATION TERRAIN ────────────────────────────────────────────────

[ ] Mire de test affichée : chaque zone correctement identifiée
[ ] Aucune zone tronquée ou écrasée
[ ] Hauteurs de dalles uniformes (ou padding noir documenté)
[ ] Test 2h avec contenu réel : 0 crash, 0 tearing
[ ] Photo terrain 4 côtés archivée
[ ] Alerte `edid_mismatch` : [ ] absente   [ ] présente (détail : ________)

─── ENGAGEMENT ────────────────────────────────────────────────────────

Les deux parties confirment que la configuration NovaLCT du contrôleur
et la configuration sites.displays du dashboard MadXP décrivent la
MÊME réalité physique (nombre de panneaux et coordonnées). Toute
modification ultérieure (ajout/retrait de zones) nécessite une
intervention terrain conjointe.

Signature intégrateur LED :           Signature admin MadXP :

_____________________________         _____________________________

Date : _______________                Date : _______________
═══════════════════════════════════════════════════════════════════════
```

---

## 7. Références

- [PROP-011 v2](../proposals/PROP-011-multi-zone-led.md) — Décision architecturale multi-zone
- [SPIKE-001](../proposals/SPIKE-001-dual-hdmi-hardware-validation.md) — Validation dual HDMI (fait, GO)
- [SPIKE-003](../proposals/SPIKE-003-multi-zone-ultra-wide-validation.md) — Validation multi-zone ultra-wide (pré-requis Phase 1)
- [ADR-029](../adr/ADR-029-dual-hdmi-tv-led.md) — Dual HDMI
- [ADR-032](../adr/ADR-032-secondary-variants-restore.md) — Restore variantes secondary
- [ADR-033](../adr/ADR-033-secondary-variants-nginx-race-condition.md) — Nginx variantes
- [.claude/rules/raspberry.md](../../.claude/rules/raspberry.md) — Invariants watchdog dual-display

---

_Runbook v1.0 — 2026-04-22_
