# ADR-112 : Intégration panneaux LED Bodet P10 V2 USB2 (mode mass storage emulation)

**Date** : 2026-05-07
**Statut** : Investigation (à confirmer après test terrain Lanester 2026-05-09)
**Format** : Léger

---

## Contexte

Prospect Lanester (++) équipé d'un panneau LED Bodet **P10 V2 USB2** (modèle `MOD VIDEO BDT P10 V2 USB2 IND`, réf 915949) — 8 modules organisés en 2×4, dimensions totales **400 × 80 cm** (≈ 400 × 80 px en pitch P10).

**Contraintes hardware** confirmées par le prospect :

- **1 seul port USB-A** sur le module maître (1.1)
- **Pas de HDMI** ni autre connectique vidéo
- Modules esclaves connectés via **RJ45** (duplication propriétaire Bodet, hors périmètre)
- Clé USB en **FAT32** préparée par un "vieux logiciel Bodet" qui prend en entrée largeur × hauteur du panneau
- Usage actuel : boucle vidéo statique → **zéro pilotage à distance, zéro rotation pondérée, zéro stats de diffusion**

L'archi MadXP standard (Pi → HDMI → TV) est **incompatible** : pas de HDMI sur le Bodet. Les adaptateurs USB ↔ HDHI standards vont dans le mauvais sens (PC → écran HDMI). Le Bodet ne lit pas un flux vidéo, il lit des **fichiers** sur un système de fichiers FAT32.

## Décision (provisoire — pending test terrain)

**Piste retenue** : Pi en mode **USB gadget mass storage** (`g_mass_storage`) qui se présente au panneau Bodet comme une fausse clé USB FAT32, dont le contenu est régénéré dynamiquement par les déploiements MadXP.

Topologie cible :

```
Cloud MadXP ──WS──> Pi (sync-agent) ──USB-C(gadget mode)──> Bodet maître 1.1 ──RJ45──> 7 modules esclaves
                          │
                          └─ /var/neopro/bodet-loop.img (image FAT32 régénérée à chaque déploiement)
```

**Limitations acceptées** :

- Pas de pilotage **temps réel** (le panneau ne re-scanne la clé qu'au remount → un changement = `umount` + régénération image + `mount` côté gadget, latence ~5–10 s)
- Pas de score live ni remote temps réel sur le panneau Bodet (à monetiser via TV MadXP standard si demandé plus tard)
- Encodage vidéo contraint à la résolution/format que le panneau attend (probablement 400×80 px, codec à déterminer)

**Risque #1 (à valider samedi) — structure proprio Bodet** : leur "vieux logiciel" pourrait écrire un manifeste / playlist / convention de nommage spécifique sur la clé. Si oui, on doit reverse engineer cette structure avant le POC. C'est l'objet principal du test terrain.

## Plan de test terrain — Samedi 2026-05-09 matin (Lanester)

### Kit à apporter

- [ ] **Clé USB vierge FAT32 32 GB** (formatée Windows avec étiquette `NEOPRO_TEST`)
- [ ] **2 MP4 de test** copiés en racine de la clé :
  - `test01.mp4` : 400×80 px, 10 s, H.264, mire de couleur claire
  - `test02.mp4` : 400×80 px, 10 s, H.264, autre mire (pour valider le passage 1→2)
- [ ] **Pi 4 ou 5** avec micro-SD bootée (Raspberry Pi OS Lite, sync-agent installé en mode dégradé OK)
- [ ] **Câble USB-C ↔ USB-A** standard (côté Pi : USB-C alim/data du Pi 4/5 ; côté Bodet : USB-A mâle dans le port du module maître)
- [ ] **Clé USB préparée par leur logiciel Bodet** (demander au prospect de la garder telle quelle après leur dernière prépa — c'est le matériau de reverse engineering)
- [ ] **Laptop** + lecteur de cartes / USB pour dumper la clé Bodet sur place
- [ ] **Photo détaillée du dos du module maître 1.1** (toutes les connectiques, étiquettes, références)

### Séquence de test (45–60 min)

#### Phase 1 — Constat de l'existant (10 min)

1. Photographier le dos du module maître + étiquettes de chaque module
2. Noter le **logiciel Bodet** utilisé (nom + version) et demander si une doc PDF traîne quelque part
3. Récupérer la **clé USB Bodet actuelle** du prospect (avec leur boucle de pubs en place)
4. Sur laptop : **dump complet de la clé Bodet** :
   - Sur Mac/Linux : `dd if=/dev/diskX of=~/bodet-prospect.img bs=4M`
   - Sur Windows : Win32 Disk Imager → "Read"
   - **Ne pas reformater, ne pas modifier** — on veut le contenu byte-by-byte
5. Lister tous les fichiers (y compris cachés) : `ls -laR /Volumes/BODET_USB`

#### Phase 2 — Test mass storage standard (15 min) — **HYPOTHÈSE A**

6. Débrancher la clé Bodet, brancher la **clé NEOPRO_TEST** (notre clé vierge avec 2 MP4 quelconques)
7. **Observer** le panneau pendant 60 s :
   - ✅ Si les MP4 jouent en boucle → **mass storage standard, pas de manifeste requis** → la piste Pi-en-gadget marche en l'état
   - ⚠️ Si écran noir / clignotement / "no media" → **structure spécifique requise** → passer à phase 3
8. Si phase 2 ✅ : tester aussi **3 MP4** pour vérifier l'ordre de lecture (alphabétique ? par date ?)

#### Phase 3 — Reverse engineering rapide sur place (15 min) — **SI HYPOTHÈSE A KO**

9. Re-brancher la clé Bodet (qui marche). Sur laptop, examiner le dump :
   - Cherche un **manifeste/playlist** : fichiers `.cfg`, `.xml`, `.txt`, `.json`, `.lst`, `.m3u`, `.bin`
   - Note la **convention de nommage** des MP4 (`video01.mp4` ? `clip_001.mp4` ? avec préfixe ?)
   - Inspecte les **propriétés vidéo** d'un MP4 Bodet : `ffprobe video01.mp4` → résolution, codec, framerate, profile H.264
10. Reproduit la structure sur la clé **NEOPRO_TEST** :
    - Re-encode les MP4 test à la résolution/codec extraits (`ffmpeg -i test.mp4 -vf scale=400:80 -c:v libx264 -profile:v baseline ...`)
    - Renomme selon la convention
    - Copie le manifeste s'il y en a un (tel quel, ou modifié pour pointer vers nos 2 fichiers)
11. Re-test → si ça joue, **on a la structure**. Documenter immédiatement dans un mémo terrain.

#### Phase 4 — POC Pi en gadget mode (15 min) — **VALIDATION FINALE**

12. Sur le Pi, créer une image disque FAT32 contenant la structure validée en phase 2 ou 3 :
    ```bash
    dd if=/dev/zero of=/var/neopro/bodet-loop.img bs=1M count=128
    mkfs.vfat -F 32 /var/neopro/bodet-loop.img
    sudo mount -o loop /var/neopro/bodet-loop.img /mnt/bodet
    cp test01.mp4 test02.mp4 /mnt/bodet/
    # + manifeste si phase 3 nécessaire
    sudo umount /mnt/bodet
    ```
13. Activer le module gadget :
    ```bash
    sudo modprobe g_mass_storage file=/var/neopro/bodet-loop.img stall=0 ro=1
    ```
14. Brancher Pi → port USB-A du module maître Bodet
15. **Observer** le panneau :
    - ✅ Si les MP4 jouent → **POC validé, on peut industrialiser** → fin du test terrain victorieux
    - ❌ Si rien → noter le comportement exact (LED diagnostic du panneau ? message ?), stopper, on tombe sur le **plan B**

### Plan B (si POC samedi KO)

Proposer au prospect une **TV MadXP standard à côté** du panneau Bodet :

- Bodet garde sa boucle USB primitive existante
- TV 55"/65" + Pi standard MadXP à côté → toute la valeur MadXP (pilotage, sponsors, score, monétisation) sur la TV, le Bodet reste sur scoreboard/ambiance
- Devis simple, déploiement classique en 1 semaine

### Données à ramener (pour rédiger l'ADR final lundi)

- [ ] Photos panneau (face, dos, étiquettes des 8 modules)
- [ ] Image disque dump de la clé Bodet (`bodet-prospect.img`) — à stocker hors-repo, secret prospect
- [ ] Liste fichiers + structure de la clé Bodet
- [ ] Specs vidéo Bodet : résolution, codec, framerate, profile (sortie `ffprobe`)
- [ ] Verdict phase 2 (mass storage standard ou pas)
- [ ] Si phase 3 : structure du manifeste Bodet
- [ ] Verdict phase 4 (POC gadget mode validé ou pas)
- [ ] Photos / vidéos du panneau pendant les tests (preuve visuelle)

## Alternatives rejetées

- **Adaptateur USB-A → HDMI passif** : n'existe pas dans le bon sens. Les adaptateurs commerciaux convertissent USB (source PC) → HDMI (sink écran), pas l'inverse.
- **Capture HDMI → USB streaming** : les capture sticks (type Elgato) émettent un flux UVC vers un PC hôte ; le Bodet n'est pas un PC, il attend un système de fichiers, pas un flux UVC.
- **Reverse engineering du protocole RJ45 Bodet** (pour driver les esclaves directement) : effort démesuré (RE de protocole proprio sur lien physique), aucun ROI vs piste USB qui devrait suffire.
- **Reverse engineering du logiciel Bodet sous Windows** : envisageable en plan C si toutes les autres pistes échouent. Effort estimé semaines, pas jours.
- **Demander un SDK officiel à Bodet** : option ouverte (acteur français, partenariat possible), mais délai commercial incompatible avec un prospect ++ à closer rapidement. À garder pour un éventuel deal multi-clubs Bodet.
- **Remplacer le panneau Bodet par une TV** : le prospect a investi ~10 k€ dans le panneau, hors discussion sans signal très fort de leur part.

## Conséquences

**Si POC samedi ✅** :

- Deal Lanester déblocable en ~1 mois (industrialisation gadget mode + intégration sync-agent + tests)
- **Levier fleet-wide** : Bodet est très installé en France, surtout en Bretagne → cette intégration devient un **différenciateur commercial** pour tous les prospects équipés Bodet (à mentionner explicitement dans le pricing : R&D mutualisé, on amortit sur les futurs deals)
- Nouveau pattern dans `sync-agent` : _"sortie LED via USB gadget"_ en plus de _"sortie HDMI standard"_. À encadrer côté code (feature flag, mode dégradé documenté).
- ADR final à rédiger lundi 2026-05-11 (statut Accepté, plan d'industrialisation chiffré)

**Si POC samedi ❌** :

- Plan B (TV à côté) → deal Lanester reste closable mais moins ambitieux côté valeur perçue
- ADR-112 à statuer "Rejeté" + ouvrir ADR-113 _"Stratégie multi-écran pour clubs équipés panneau LED tiers"_

**Risque résiduel commercial** :

- Pricing à cadrer : si on s'engage sur le R&D Bodet, prévoir un **forfait setup** (ex: 1 500–2 500 €) sur le premier deal pour amortir le R&D, ou l'absorber sur un commit pluriannuel d'abonnement.

## Fichiers impactés (à venir, post-POC)

Aucun changement de code committé tant que le POC n'est pas validé. Si POC ✅, ouvrir une PR séparée avec :

- `raspberry/sync-agent/src/services/bodet-usb-loop.service.js` — nouveau service de génération d'image FAT32
- `raspberry/sync-agent/src/agent.js` — handler de déploiement en mode "Bodet USB" (feature flag `BODET_USB_MODE`)
- `central-server/src/scripts/migrations/add-site-output-mode.sql` — colonne `sites.output_mode` (`hdmi` | `bodet_usb`)
- `central-dashboard/src/app/sites/site-form.component.ts` — selecteur output mode
- `docs/specs/integrations/bodet-usb.spec.md` — spec intégration (résolution, codec, structure clé)
- `.claude/rules/bodet-integration.md` — invariants smoke-enforced
- Smoke test `central-server/src/__tests__/smoke/smoke-bodet-integration.test.ts`

## Suivi

- 2026-05-09 (samedi) : test terrain Lanester
- 2026-05-11 (lundi) : mise à jour de cet ADR avec verdict + plan d'industrialisation chiffré, ou ouverture ADR-113 plan B
- À surveiller : retours d'autres prospects équipés Bodet (NLF connaît la marque, demander en réunion suivante)

## Références

- Conversation prospect Lanester (mail 2026-05-07) : _"L'écran 1.1 est le maître, ... aucune autre connectique exceptée la prise RJ45 ... clé USB FAT32 ... vieux logiciel"_
- ADR-029 : Dual HDMI TV + LED (panneau LED HDMI-driven, scénario incompatible avec Bodet USB)
- Linux USB Gadget Mass Storage : https://www.kernel.org/doc/html/latest/usb/mass-storage.html
- `g_mass_storage` module Raspberry Pi : disponible nativement sur Pi 4/5 via port USB-C en mode device
