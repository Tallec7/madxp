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

### La Remote (télécommande) — Élément critique

La Remote est une page web servie par le Pi (`http://neopro.local/remote`), accessible depuis n'importe quel smartphone connecté au **hotspot WiFi** du Pi (`NEOPRO_xxx`). Elle permet au staff du club de :

- Lancer des vidéos manuellement (sponsors, jingles, ambiance)
- Gérer le score en live (saisie manuelle ou Stramatel, cf. ADR-013)
- Changer les phases de match (avant/pendant/après)
- Envoyer des breaking news en overlay
- Piloter le chronomètre
- Configurer l'overlay (position, couleurs, template)

**Communication dual-channel** :

1. **BroadcastChannel** (`neopro-local`) : communication directe navigateur-à-navigateur, **uniquement sur le même Pi** (Remote ↔ TV kiosk). Zéro latence, fonctionne offline.
2. **Socket.IO** (port 3000) : communication réseau pour les appareils connectés au hotspot WiFi (tablettes, smartphones) **et** pour le monitoring cloud.

Chaque action de la Remote émet sur **les deux canaux** simultanément :

```typescript
// Exemple : lancer une vidéo sponsors
this.localBroadcast.emitCommand({ type: 'sponsors' }); // BroadcastChannel (local)
this.socketService.emit('command', { type: 'sponsors' }); // Socket.IO (réseau)
```

**Limitation actuelle** : La Remote broadcast à **tous les écrans** sans distinction. Aucun mécanisme de ciblage par display n'existe.

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

**Impact Remote** : **Aucun.** Le splitter duplique le signal HDMI — la Remote contrôle 1 TV et les 4 affichent la même chose. Aucune modification de la Remote nécessaire. BroadcastChannel et Socket.IO fonctionnent comme avant.

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

**Impact Remote** : **Aucun.** Identique au scénario A — c'est le même signal HDMI transporté sur Cat6 au lieu de câble HDMI. La Remote ne change pas.

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

#### Impact Remote — Scénario C (critique)

Dans ce scénario, les Pi Zero sont des **appareils séparés** connectés au hotspot WiFi du Pi maître. Cela a des conséquences majeures sur la communication :

**Problème 1 — BroadcastChannel ne traverse pas le réseau :**
Le BroadcastChannel (`neopro-local`) est une API navigateur qui fonctionne **uniquement entre onglets/fenêtres du même navigateur sur le même appareil**. Les Pi Zero esclaves, étant des appareils physiquement séparés, ne reçoivent pas les messages BroadcastChannel. Seul Socket.IO les atteint.

```
Remote (smartphone)
   ├── BroadcastChannel → TV maître (même Pi) ✅
   ├── BroadcastChannel → Pi Zero 1 ❌ (appareil séparé)
   └── Socket.IO → tous les appareils sur le hotspot ✅ (y compris Zeros)
```

**Solution** : Pour les Pi Zero esclaves, **Socket.IO devient le canal primaire**. Le serveur Socket.IO du Pi maître relaie les commandes à tous les clients connectés. Les Pi Zero kiosk se connectent en Socket.IO au Pi maître et reçoivent les événements normalement. Pas de changement nécessaire sur le protocole Socket.IO existant — il broadcast déjà à tous les clients.

**Problème 2 — Pas de ciblage par display :**
Aujourd'hui la Remote broadcast toutes les commandes à **tous les écrans** sans distinction. Si les 4 TV ont des playlists différentes, il faut pouvoir :

- Lancer une vidéo sur **une TV spécifique** (ex: sponsors uniquement sur TV buvette)
- Envoyer le score sur **toutes les TV** (broadcast global)
- Changer la phase de match sur **toutes les TV** (broadcast global)

**Solution** : Ajouter un champ `targetDisplay` aux événements Socket.IO et un **sélecteur de display** dans la Remote :

```typescript
// Commande ciblée (nouvelle)
this.socketService.emit('command', {
  type: 'play-video',
  videoId: '...',
  targetDisplay: 2, // TV spécifique (null = toutes)
});

// Commande broadcast (inchangée, score visible partout)
this.socketService.emit('score-update', {
  homeScore: 23,
  awayScore: 21,
  targetDisplay: null, // null = broadcast à tous
});
```

**UI Remote — Sélecteur de display :**

```
┌──────────────────────────────────────────────┐
│ 📺 Écran cible :                             │
│                                              │
│  [🔵 Tous]  [TV1 Hall]  [TV2 Buvette]       │
│             [TV3 Tribune]  [TV4 Vestiaire]   │
│                                              │
│ Vidéos disponibles :                         │
│  ▶ Sponsor Decathlon                         │
│  ▶ Jingle mi-temps                           │
│  ▶ Ambiance pré-match                        │
│                                              │
│ ⚡ Score : s'affiche sur TOUS les écrans     │
│ 📢 Breaking news : s'affiche sur TOUS       │
└──────────────────────────────────────────────┘
```

**Problème 3 — Vidéos servies par le Pi maître :**
Les Pi Zero n'ont pas de stockage local des vidéos (carte microSD 16GB = OS + Chromium uniquement). Les vidéos sont chargées depuis le Pi maître via HTTP sur le hotspot WiFi. Cela implique :

- **Bande passante WiFi** : 3 flux vidéo 1080p@30fps simultanés (~15 Mbps total) — dans les capacités du WiFi 802.11n du Pi 5 (~100 Mbps réels)
- **Latence** : les vidéos sont bufferisées par Chromium, pas de streaming live — acceptable
- **Serveur HTTP** : nginx sur le Pi maître sert déjà les fichiers statiques — aucune modification

**Problème 4 — Authentification Remote et Pi Zero :**
Les Pi Zero kiosk n'utilisent pas l'`authGuard` (ils chargent directement `/tv?d=N`). Mais la Remote doit rester protégée par mot de passe. Pas de changement nécessaire : l'auth ne concerne que la route `/remote`.

**Développements nécessaires (Scénario C uniquement)** :

| Tâche                                                    | Fichiers impactés                               | Effort |
| -------------------------------------------------------- | ----------------------------------------------- | ------ |
| Image OS minimale pour Pi Zero (kiosk-only)              | `raspberry/scripts/install-zero.sh` (nouveau)   | Faible |
| Route `/tv?display=N` avec playlist par écran            | `tv.component.ts`, routing module               | Faible |
| Auto-discovery des Zeros sur hotspot (mDNS)              | `raspberry/server/`                             | Faible |
| Dashboard : assigner contenu par display                 | `central-dashboard/src/app/features/sites/`     | Modéré |
| Étendre master/slave pour N esclaves                     | `raspberry/server/socket/handlers.js`           | Faible |
| **Sélecteur de display dans la Remote**                  | `remote.component.ts`, `remote.component.html`  | Modéré |
| **Champ `targetDisplay` dans les événements Socket.IO**  | `raspberry/server/socket/handlers.js`           | Faible |
| **Filtrage côté TV : ignorer les commandes non ciblées** | `tv.component.ts`                               | Faible |
| **Registry des displays connectés sur le Pi maître**     | `raspberry/server/services/display-registry.ts` | Modéré |
| **Indicateur de statut des displays dans la Remote**     | `remote.component.ts`, `remote.component.html`  | Faible |

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

| Risque                                             | Mitigation                                                                                                                                         |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signal HDMI dégradé sur longue distance            | Utiliser HDBaseT (scénario B) au-delà de 10m                                                                                                       |
| Splitter incompatible avec certaines TV            | Acheter un splitter actif avec gestion EDID                                                                                                        |
| Panne du splitter = toutes les TV éteintes         | Garder un splitter de rechange (~30€)                                                                                                              |
| HDCP bloque la duplication                         | Désactivé côté Pi (pas de contenu protégé) — non applicable                                                                                        |
| Évolution vers contenus différents                 | Scénario C prévu, migration transparente                                                                                                           |
| **(C)** BroadcastChannel inopérant vers Pi Zero    | Socket.IO devient le canal primaire pour les esclaves. Le BroadcastChannel reste actif pour le TV maître (même Pi). Aucune perte de fonctionnalité |
| **(C)** Remote sans ciblage par display            | Sélecteur de display ajouté à la Remote. Score et breaking news restent en broadcast global. Seules les commandes vidéo sont ciblables             |
| **(C)** Bande passante WiFi insuffisante           | 3 flux 1080p = ~15 Mbps. WiFi Pi 5 = ~100 Mbps. Marge confortable. Réduire à 720p si Pi 4                                                          |
| **(C)** Pi Zero perd la connexion WiFi             | Reconnexion Socket.IO automatique (déjà implémenté). TV affiche la dernière frame en attendant. Indicateur de statut dans la Remote                |
| **(C)** Conflit de commandes Remote (2 opérateurs) | Last-write-wins (comportement actuel). Pas de verrouillage — acceptable pour un club                                                               |

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

**Phase C1 — Infrastructure réseau (2-3 jours)**

1. Créer image OS minimale Pi Zero (kiosk-only Chromium, auto-connect hotspot)
2. Ajouter route `/tv?display=N` dans l'app Angular
3. Étendre le système master/slave Socket.IO pour N esclaves
4. Créer `display-registry.ts` sur le Pi maître (enregistrement/heartbeat des Zeros)
5. Auto-discovery des Zeros sur hotspot (mDNS `zero-N.local`)

**Phase C2 — Adaptation Remote (3-4 jours)**

1. Ajouter un **sélecteur de display** dans la Remote (UI + logique)
2. Ajouter le champ `targetDisplay` dans les événements Socket.IO du serveur
3. Côté TV : filtrer les commandes non ciblées (`targetDisplay !== myDisplayId`)
4. Indicateur de statut des displays dans la Remote (connecté/déconnecté, ping)
5. Logique de ciblage : score/phase/breaking news → broadcast global ; vidéos → ciblable par display

**Phase C3 — Dashboard et gestion de contenu (2-3 jours)**

1. Dashboard : assigner un contenu/playlist par display dans la fiche site
2. Dashboard : monitoring des displays connectés en temps réel
3. Dashboard : nommage des displays (ex: "TV1 Hall", "TV2 Buvette")

**Critères de validation** :

- [ ] Chaque TV affiche sa playlist dédiée
- [ ] Score Stramatel visible sur **toutes** les TV simultanément
- [ ] Remote : sélecteur de display permet de lancer une vidéo sur une TV spécifique
- [ ] Remote : score/phase/breaking news s'affichent sur tous les écrans (broadcast)
- [ ] Remote : indicateur vert/rouge par display (connecté/déconnecté)
- [ ] Pi Zero se reconnecte automatiquement après coupure WiFi (< 10s)
- [ ] Bande passante WiFi suffisante pour 3 flux vidéo 1080p simultanés
- [ ] Pas de régression sur le fonctionnement de la Remote en mode 1 seul écran

## Budget estimé

| Scénario                              | Matériel | Dev logiciel                             | Total          |
| ------------------------------------- | -------- | ---------------------------------------- | -------------- |
| A — Splitter HDMI direct (< 10m)      | 50-80€   | 0                                        | 50-80€         |
| B — HDBaseT Cat6 (> 10m)              | 250-400€ | 0                                        | 250-400€       |
| C — Pi Zero esclaves (contenus diff.) | 130-180€ | ~7-10 jours (infra + Remote + dashboard) | 130-180€ + dev |

## Références

- `raspberry/scripts/kiosk-watchdog.sh` — Watchdog kiosk actuel
- `raspberry/src/app/components/tv/tv.component.ts` — Système master/slave (lignes 179-181)
- `raspberry/src/app/components/remote/remote.component.ts` — Remote controller (1595 lignes)
- `raspberry/src/app/components/remote/remote.component.html` — Remote UI (1807 lignes)
- `raspberry/src/app/services/local-broadcast.service.ts` — BroadcastChannel dual-channel (274 lignes)
- `raspberry/server/socket/handlers.js` — Gestion rôles TV + relay événements (234 lignes)
- `raspberry/src/app/guards/auth.guard.ts` — Protection route `/remote`
- ADR-008 — Double-Buffer Vidéo (contraintes GPU Pi)
- ADR-001 — Architecture Edge-Cloud

---

_Créé le 11 février 2026_
