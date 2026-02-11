# ADR-011: Multi-TV — Diffusion sur Plusieurs Écrans depuis un Seul Raspberry Pi

**Date** : 2026-02-11
**Statut** : Proposé
**Décideurs** : Équipe Neopro
**Lié à** : ADR-008 (Double-Buffer Vidéo), ADR-001 (Edge-Cloud Architecture)

---

## Contexte

Un prospect (club sportif) souhaite diffuser du contenu Neopro sur **4 écrans TV simultanément** depuis un seul boîtier Raspberry Pi. Les TV sont réparties dans différentes zones du club (hall d'accueil, buvette, tribunes, vestiaires) et peuvent être **espacées de 5 mètres ou plus** les unes des autres.

### Contraintes

- **1 seul Pi** par club (coût, simplicité de gestion flotte)
- **Même contenu** sur toutes les TV (playlist identique + overlay de score)
- **Distance** entre TV : 5-20m typiquement
- **Raspberry Pi 4/5** : seulement 2 ports micro-HDMI natifs
- **Qualité vidéo** : 1080p minimum sur chaque TV
- **Score live** : l'overlay de score (ADR-013) doit être visible sur toutes les TV
- **Fiabilité** : le système tourne en autonomie pendant les matchs (5h+)

### État actuel

- Architecture 1 site = 1 Pi = 1 écran (mapping 1:1)
- 1 seule instance Chromium kiosk (watchdog `kiosk-watchdog.sh`)
- 1 sortie HDMI utilisée, la seconde ignorée
- Le signal HDMI est un flux vidéo standard duplicable par matériel

## Décision

Adopter une **distribution HDMI matérielle** via splitter, avec 3 scénarios selon la distance et le nombre de TV.

### Scénario A — Splitter HDMI 1→4 direct (distance < 10m) ✅

```
┌─────────────┐    HDMI     ┌──────────────┐
│ Raspberry Pi │───────────→│ Splitter 1→4 │
│  (HDMI 1)   │            │  HDMI actif   │
└─────────────┘            └──┬──┬──┬──┬───┘
                              │  │  │  │
                    HDMI      │  │  │  │  HDMI (max ~10-15m)
                              ↓  ↓  ↓  ↓
                            TV1 TV2 TV3 TV4
```

**Principe** : Le Pi sort 1 signal HDMI. Un splitter actif 1→4 duplique le signal identiquement vers 4 sorties HDMI. Chaque TV reçoit une copie exacte du flux (vidéo + audio + overlay).

**Hardware requis** :
| Composant | Référence type | Prix estimé |
|-----------|---------------|-------------|
| Splitter HDMI 1→4 actif (4K@30Hz / 1080p@60Hz) | OREI HD-104 ou equiv. | 30-50€ |
| Câbles HDMI (selon distance) | HDMI 2.0 High Speed | 5-15€/câble |

**Limites** :

- Distance max ~10-15m par câble HDMI
- Au-delà : dégradation du signal, artefacts possibles

### Scénario B — Splitter HDMI over Cat6/HDBaseT (distance > 10m) ✅

```
┌─────────────┐    HDMI     ┌─────────────────┐
│ Raspberry Pi │───────────→│ Émetteur HDBaseT│
│  (HDMI 1)   │            │  1 entrée HDMI  │
└─────────────┘            └──┬──┬──┬──┬──────┘
                              │  │  │  │
                    Cat6      │  │  │  │  (jusqu'à 70-100m chacun)
                              ↓  ↓  ↓  ↓
                           ┌────┐┌────┐┌────┐┌────┐
                           │ Rx ││ Rx ││ Rx ││ Rx │  (récepteurs HDBaseT)
                           └──┬─┘└──┬─┘└──┬─┘└──┬─┘
                              │     │     │     │
                           HDMI  HDMI  HDMI  HDMI
                              ↓     ↓     ↓     ↓
                            TV1   TV2   TV3   TV4
```

**Principe** : Le signal HDMI est converti en signal numérique transporté sur câble Ethernet Cat6. Chaque TV a un petit récepteur (boîtier ~taille carte de crédit) qui reconvertit en HDMI. Standard HDBaseT utilisé en intégration AV professionnelle.

**Hardware requis** :
| Composant | Référence type | Prix estimé |
|-----------|---------------|-------------|
| Matrice/Splitter HDBaseT 1→4 | Monoprice Blackbird ou equiv. | 150-250€ |
| 4× Récepteurs HDBaseT | Inclus ou séparés | 30-50€/pièce |
| Câbles Cat6 (longueur selon site) | Cat6 blindé (STP) | 1-2€/m |

**Avantages** :

- Jusqu'à **70-100m** par liaison
- Câblage Ethernet standard (souvent déjà tiré dans les clubs)
- Signal numérique = zéro perte de qualité
- Certains modèles passent le PoE (alimentation du récepteur via le câble)

### Scénario C — Architecture évolutive (contenus différenciés par TV)

Si le prospect évolue vers des **contenus différents par TV**, le splitter ne suffit plus. On passe sur une architecture réseau :

```
                          WiFi Hotspot du Pi maître
                                    │
            ┌───────────┬───────────┼───────────┐
            ↓           ↓           ↓           ↓
      Pi maître     Pi Zero 2W  Pi Zero 2W  Pi Zero 2W
      HDMI → TV1    HDMI → TV2  HDMI → TV3  HDMI → TV4
      /tv?d=1       /tv?d=2     /tv?d=3     /tv?d=4

      Serveur         Clients kiosk légers
      + stockage      Chromium → http://neopro.local/tv?d=N
      + Stramatel     Score reçu via Socket.IO
      + API           Vidéos servies par le Pi maître
```

**Principe** : Le Pi principal reste le maître (serveur, stockage, Stramatel). Des Pi Zero 2W (~20€ pièce) sont placés derrière chaque TV supplémentaire. Ils se connectent au hotspot WiFi du maître et affichent chacun une URL avec un paramètre `display` qui détermine la playlist.

**Hardware requis** :
| Composant | Référence type | Prix estimé |
|-----------|---------------|-------------|
| 3× Raspberry Pi Zero 2W | Pi Zero 2W | 20€/pièce |
| 3× Alimentation USB-C | Officielle Pi | 10€/pièce |
| 3× Câble mini-HDMI → HDMI | Standard | 5€/pièce |
| 3× Carte microSD (16GB min) | Classe A1 | 8€/pièce |

**Le master/slave existe déjà partiellement** dans `tv.component.ts` :

```typescript
private tvRole: 'master' | 'slave' | null = null;
private isSlaveMode = false;
// Socket event: 'tv-role-assigned'
```

**Développements nécessaires (Scénario C uniquement)** :

| Tâche                                         | Fichiers impactés                             | Effort |
| --------------------------------------------- | --------------------------------------------- | ------ |
| Image OS minimale pour Pi Zero (kiosk-only)   | `raspberry/scripts/install-zero.sh` (nouveau) | Faible |
| Route `/tv?display=N` avec playlist par écran | `tv.component.ts`, routing module             | Faible |
| Auto-discovery des Zeros sur hotspot (mDNS)   | `raspberry/server/`                           | Faible |
| Dashboard : assigner contenu par display      | `central-dashboard/src/app/features/sites/`   | Modéré |
| Étendre master/slave pour N esclaves          | `raspberry/server/socket/handlers.js`         | Faible |

## Alternatives Considérées

### 1. Adaptateurs USB→HDMI (DisplayLink)

**Principe** : Ajouter 2 adaptateurs USB3→HDMI pour obtenir 4 sorties depuis le Pi.
**Avantages** : 4 sorties indépendantes, contenus différents possibles
**Inconvénients** : Pas d'accélération GPU sur les sorties USB — vidéo saccadée. Drivers DisplayLink instables sur ARM/Linux. Consommation USB importante.
**Verdict** : Rejeté — qualité vidéo insuffisante pour un affichage professionnel.

### 2. Pi Compute Module 5 + IO Board custom

**Principe** : Le CM5 expose plus d'interfaces display (HDMI + DSI + DPI).
**Avantages** : Jusqu'à 3 sorties display natives
**Inconvénients** : Toujours limité à 3 (pas 4). IO board custom = coût et complexité. Pas de boîtier standard. Maintenance complexe pour les clubs.
**Verdict** : Rejeté — surcoût et complexité disproportionnés.

### 3. Distribution HDMI matérielle (choisie) ✅

**Avantages** : Zéro développement logiciel (scénarios A/B). Signal identique garanti. Fiabilité matérielle éprouvée (standard AV). Compatible avec l'overlay de score. Évolutif vers contenus différenciés (scénario C).
**Inconvénients** : Coût matériel additionnel (30-250€ selon scénario). Même contenu sur toutes les TV (scénarios A/B).
**Verdict** : Accepté — rapport coût/fiabilité/simplicité optimal.

## Conséquences

### Positives

1. **Zéro changement logiciel** pour le scénario standard (A/B) — le Pi ne sait même pas qu'il y a 4 TV
2. **Overlay de score visible partout** — c'est le même signal HDMI dupliqué
3. **Fiabilité maximale** — un splitter actif n'a aucune pièce mobile, pas de logiciel, pas de crash
4. **Installation simple** — un technicien AV standard peut câbler
5. **Évolutif** — passage au scénario C possible sans remplacer le Pi maître

### Négatives

1. **Coût hardware** : 30-250€ selon la distance (scénarios A/B)
2. **Même contenu** sur toutes les TV (scénarios A/B) — limitation acceptée par le prospect
3. **Câblage** : nécessite de tirer des câbles HDMI ou Cat6 jusqu'à chaque TV

### Risques

| Risque                                     | Mitigation                                                  |
| ------------------------------------------ | ----------------------------------------------------------- |
| Signal HDMI dégradé sur longue distance    | Utiliser HDBaseT (scénario B) au-delà de 10m                |
| Splitter incompatible avec certaines TV    | Acheter un splitter actif avec gestion EDID                 |
| Panne du splitter = toutes les TV éteintes | Garder un splitter de rechange (~30€)                       |
| HDCP bloque la duplication                 | Désactivé côté Pi (pas de contenu protégé) — non applicable |
| Évolution vers contenus différents         | Scénario C prévu, migration transparente                    |

## Plan d'implémentation

### Scénarios A/B (même contenu) — Immédiat

1. **Identifier les distances** entre le Pi et chaque TV au club
2. **Choisir** scénario A (< 10m) ou B (> 10m)
3. **Commander le matériel** (splitter + câbles)
4. **Installer** : Pi → splitter → câbles → TV
5. **Tester** : vérifier la qualité d'image et l'overlay de score sur chaque TV

**Critères de validation** :

- [ ] 4 TV affichent le même contenu simultanément
- [ ] Overlay de score visible et lisible sur chaque TV
- [ ] Aucune latence perceptible entre les TV
- [ ] Stabilité sur 5h de fonctionnement continu

### Scénario C (contenus différents) — Si besoin futur

1. Créer image OS minimale Pi Zero (kiosk-only Chromium)
2. Ajouter route `/tv?display=N` dans l'app Angular
3. Étendre le système master/slave Socket.IO pour N esclaves
4. Ajouter gestion multi-display dans le dashboard central
5. Tests sur site réel avec 4 TV + contenus différenciés

**Critères de validation** :

- [ ] Chaque TV affiche sa playlist dédiée
- [ ] Score Stramatel visible sur toutes les TV
- [ ] Pi Zero se reconnecte automatiquement après coupure WiFi
- [ ] Bande passante WiFi suffisante pour 3 flux vidéo simultanés

## Budget estimé

| Scénario                              | Matériel | Dev logiciel | Total          |
| ------------------------------------- | -------- | ------------ | -------------- |
| A — Splitter HDMI direct (< 10m)      | 50-80€   | 0            | 50-80€         |
| B — HDBaseT Cat6 (> 10m)              | 250-400€ | 0            | 250-400€       |
| C — Pi Zero esclaves (contenus diff.) | 130-180€ | ~3-5 jours   | 130-180€ + dev |

## Références

- `raspberry/scripts/kiosk-watchdog.sh` — Watchdog kiosk actuel
- `raspberry/src/app/components/tv/tv.component.ts` — Système master/slave (lignes 179-181)
- `raspberry/server/socket/handlers.js` — Gestion rôles TV (lignes 120-143)
- ADR-008 — Double-Buffer Vidéo (contraintes GPU Pi)
- ADR-001 — Architecture Edge-Cloud

---

_Créé le 11 février 2026_
