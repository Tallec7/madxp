# ADR-013: Score Live depuis Tables de Marque — Architecture Multi-Constructeurs

**Date** : 2026-02-11
**Statut** : Proposé
**Décideurs** : Équipe Neopro
**Lié à** : ADR-011 (Multi-TV), ADR-012 (TV + LED)

---

## Contexte

Les clubs sportifs utilisent des **tables de marque électroniques** pour gérer le score officiel pendant les matchs. Le prospect actuel utilise Stramatel, mais les clubs en France sont équipés de **constructeurs variés**. Le besoin est de récupérer le score **automatiquement en temps réel** depuis la table de marque, quel que soit le constructeur, et de l'afficher en overlay sur les TV et écrans LED (cf. ADR-012), **sans double saisie manuelle**.

C'est un **deal breaker** pour le prospect : sans cette fonctionnalité, pas de signature.

### Marché des tables de marque en France

| Constructeur     | Origine             | Présence en clubs amateurs FR               | Interface de données                        | Protocole                    |
| ---------------- | ------------------- | ------------------------------------------- | ------------------------------------------- | ---------------------------- |
| **Bodet Sport**  | France (Cholet)     | **Très courant** — leader en clubs amateurs | RS-485 série + **TCP/IP réseau** (Scorepad) | ASCII 8 bits, port 4001      |
| **Stramatel**    | France (Le Cellier) | **Courant** — partenaire FIBA               | RS-485 série (Interface TV)                 | Binaire 54 octets, 19200 bps |
| **Mobatime**     | Suisse              | Présent                                     | RS-232 / RS-422 série                       | Supporté par Panel2Net       |
| **Favero**       | Italie              | Escrime, basket, water-polo                 | RS-422 série (RJ-45)                        | Protocole Rs422-FPA          |
| **Swiss Timing** | Suisse              | Haut niveau (rare en amateur)               | RS-485 + réseau                             | Propriétaire                 |
| **Daktronics**   | USA                 | Rare en France                              | RS-232 + TCP/UDP                            | RTD/ERTD, 19200 bps          |

**Constats clés** :

- **Aucun standard universel** — chaque constructeur a son protocole propriétaire
- **RS-485 / RS-232 série domine** pour les modèles courants
- **Bodet Scorepad** est le seul avec un protocole **TCP/IP réseau documenté** (PDF public : 608264-Network output and protocols-Scorepad.pdf)
- Le projet open-source **Panel2Net** (GitHub: tomkohler/Panel2Net) supporte déjà Stramatel, Bodet, Mobatime et Swiss Timing

### Contraintes

- **Temps réel** : le score doit apparaître sur les écrans en < 1 seconde après la saisie sur la console
- **Multi-constructeurs** : l'architecture doit supporter Bodet, Stramatel, et être extensible à d'autres
- **Fiabilité** : fonctionner pendant toute la durée d'un match sans interruption
- **Fallback** : en cas de panne du lien, retour automatique en saisie manuelle (système existant)
- **Données riches** : score + chrono + période + fautes + temps morts + chrono de possession (24s basket)
- **1 seul Pi** : le connecteur tourne sur le même Pi que l'affichage
- **Remote comme couche d'enrichissement** : le score vient de la table de marque automatiquement, mais l'opérateur via la Remote déclenche les **faits de jeu** (animation de but, breaking news, changement de phase) qui produisent des réactions différenciées sur TV et LED (cf. ADR-012)

### État actuel du système de score Neopro

Le système de score live est **100% implémenté** depuis décembre 2025 (Phase 1) :

- **Saisie manuelle** via Remote (télécommande sur tablette)
- **Broadcast dual-channel** : BroadcastChannel (local) + Socket.IO (réseau)
- **Overlay configurable** : 9 positions, 3 templates (sportif/élégant/minimal), multi-sport (6 sports)
- **Animation de but** : popup/fullscreen/slide avec son configurable — déclenchée automatiquement quand le score change
- **Chronomètre** : countdown/countup, intégré à l'overlay ou standalone
- **Point d'injection unique** : `broadcastScore()` dans `remote.component.ts`

Le système est **protocol-agnostic** — il accepte des scores depuis n'importe quelle source via `score-update` Socket.IO. L'architecture multi-constructeurs ne change pas le pipeline en aval.

### Projets open-source existants

| Projet                                                               | Techno                   | Constructeurs supportés                  |
| -------------------------------------------------------------------- | ------------------------ | ---------------------------------------- |
| **Panel2Net** (GitHub: tomkohler/Panel2Net)                          | Python/PHP + Pi          | Stramatel, Bodet, Mobatime, Swiss Timing |
| **BaSta-LedControl** (GitHub: christianduerselen/BaSta-LedControl)   | Arduino + MAX485         | Stramatel                                |
| **Favero_Repeater** (GitHub: vehemont/Favero_Repeater)               | Arduino                  | Favero                                   |
| **coloradoScoreboard** (GitHub: fabriziobertocci/coloradoScoreboard) | Node.js                  | Colorado Timing                          |
| **ScoreSight** (GitHub: royshil/scoresight)                          | Qt6 + OpenCV + Tesseract | Universel (OCR)                          |

## Décision

Développer un **système de connecteurs enfichables (plugin architecture)** avec une interface commune `ScoreboardConnector`, un premier connecteur Stramatel (RS-485), un deuxième Bodet (TCP/IP), et un fallback OCR universel. La Remote reste la couche de pilotage des faits de jeu.

### Architecture — Pattern Adapter multi-constructeurs

```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Console         │  │ Console         │  │ N'importe quel  │
│ Stramatel       │  │ Bodet Scorepad  │  │ tableau (caméra)│
│ (RS-485)        │  │ (TCP/IP)        │  │ (OCR)           │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                     │
    HAT RS-485          Ethernet/WiFi          Caméra USB
         │                    │                     │
         ↓                    ↓                     ↓
┌────────────────────────────────────────────────────────────┐
│                    Raspberry Pi 5                           │
│                                                            │
│  ┌──────────────┐ ┌──────────────┐ ┌───────────────────┐  │
│  │ Stramatel    │ │ Bodet        │ │ OCR               │  │
│  │ Connector    │ │ Connector    │ │ Connector         │  │
│  │ (serialport) │ │ (TCP client) │ │ (OpenCV+Tesseract)│  │
│  └──────┬───────┘ └──────┬───────┘ └────────┬──────────┘  │
│         │                │                    │             │
│         └────────────────┼────────────────────┘             │
│                          ↓                                  │
│              ┌───────────────────────┐                      │
│              │  ScoreboardManager    │                      │
│              │  (interface commune)  │                      │
│              │                       │                      │
│              │  • ScoreboardData     │                      │
│              │  • connect/disconnect │                      │
│              │  • health check       │                      │
│              └───────────┬───────────┘                      │
│                          │                                  │
│                          ↓                                  │
│              ┌───────────────────────┐                      │
│              │  score-update         │  (Socket.IO)         │
│              │  scoreboard-extended  │                      │
│              │  scoreboard-status    │                      │
│              └───────────┬───────────┘                      │
│                          │                                  │
│              ┌───────────┼───────────┐                      │
│              ↓           ↓           ↓                      │
│         BroadcastCh  Socket.IO    Remote                    │
│         (local)      (réseau)     (faits de jeu)           │
│              │           │           │                      │
│              ↓           ↓           ↓                      │
│         TV Overlay   LED Bandeau  Dashboard                 │
│         (ADR-012)    (ADR-012)    (monitoring)             │
└─────────────────────────────────────────────────────────────┘
```

### Interface commune — `ScoreboardConnector`

```typescript
// raspberry/server/services/scoreboard/connector.interface.ts

interface ScoreboardData {
  homeScore: number;
  awayScore: number;
  gameMinutes: string;
  gameSeconds: string;
  period: number;
  homeFouls: number;
  awayFouls: number;
  homeTimeouts: number;
  awayTimeouts: number;
  gameRunning: boolean;
  shotClock: string | null; // 24s basket (null si non applicable)
  timeoutActive: boolean;
  timeoutDuration: string | null;
  source: string; // 'stramatel' | 'bodet' | 'favero' | 'ocr' | 'manual'
}

interface ScoreboardConnector {
  readonly name: string; // 'Stramatel 452', 'Bodet Scorepad', etc.
  readonly type: 'serial' | 'network' | 'ocr';

  connect(config: ConnectorConfig): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  on(event: 'score', handler: (data: ScoreboardData) => void): void;
  on(event: 'connected', handler: () => void): void;
  on(event: 'disconnected', handler: () => void): void;
  on(event: 'error', handler: (err: Error) => void): void;
}

type ConnectorConfig =
  | { type: 'serial'; port: string; baudRate: number } // RS-485/RS-232
  | { type: 'network'; host: string; port: number } // TCP/IP
  | { type: 'ocr'; cameraDevice: string; region: OcrRegion }; // Caméra
```

### ScoreboardManager — Orchestrateur

```typescript
// raspberry/server/services/scoreboard/manager.ts

class ScoreboardManager {
  private connector: ScoreboardConnector | null = null;
  private fallbackToManual: boolean = false;

  // Sélectionne et instancie le bon connecteur selon la config du site
  async initialize(siteConfig: SiteScoreboardConfig): Promise<void> {
    switch (siteConfig.provider) {
      case 'stramatel':
        this.connector = new StramatelConnector();
        await this.connector.connect({
          type: 'serial',
          port: siteConfig.serialPort || '/dev/serial0',
          baudRate: 19200,
        });
        break;
      case 'bodet':
        this.connector = new BodetConnector();
        await this.connector.connect({
          type: 'network',
          host: siteConfig.host || '192.168.1.100',
          port: siteConfig.port || 4001,
        });
        break;
      case 'ocr':
        this.connector = new OcrConnector();
        await this.connector.connect({
          type: 'ocr',
          cameraDevice: '/dev/video0',
          region: siteConfig.ocrRegion,
        });
        break;
      case 'manual':
      default:
        // Pas de connecteur — saisie manuelle uniquement
        return;
    }

    // Écoute unifiée, quel que soit le connecteur
    this.connector.on('score', (data) => this.handleScore(data));
    this.connector.on('disconnected', () => this.handleDisconnect());
  }

  private handleScore(data: ScoreboardData): void {
    if (this.fallbackToManual) return; // Override manuel actif

    io.emit('score-update', {
      homeScore: data.homeScore,
      awayScore: data.awayScore,
      period: data.period,
      matchTime: `${data.gameMinutes}:${data.gameSeconds}`,
      source: data.source,
    });

    io.emit('scoreboard-extended', {
      ...data,
      timestamp: Date.now(),
    });
  }
}
```

### Connecteur 1 — Stramatel (RS-485)

**Protocole** : Binaire, 54 octets, octet de début `0xF8`, 19200 bps.

**Paramètres série** :

- Bus : **RS-485** (différentiel, half-duplex)
- Format : 8 bits, pas de parité, 1 stop bit (8N1)
- Fréquence : ~10 messages/seconde

**Structure d'un message (54 octets)** :

| Octet(s) | Donnée                            | Encodage                   |
| -------- | --------------------------------- | -------------------------- |
| 0        | Octet de début                    | `0xF8` (248)               |
| 1        | Type de message                   | `0x33`, `0x37`, ou `0x38`  |
| 2-3      | Minutes chrono match              | ASCII (`0x30`-`0x39`)      |
| 4-5      | Secondes chrono match             | ASCII                      |
| 6-8      | Score domicile                    | ASCII (3 chiffres)         |
| 9-11     | Score visiteur                    | ASCII (3 chiffres)         |
| 12       | Période / Quart-temps             | Entier                     |
| 13       | Fautes domicile                   | Entier                     |
| 14       | Fautes visiteur                   | Entier                     |
| 15       | Temps morts restants domicile     | Entier                     |
| 16       | Temps morts restants visiteur     | Entier                     |
| 18       | Statut match                      | 1 = STOP, autre = en cours |
| 19       | Indicateur timeout actif          | Entier                     |
| 44-45    | Durée timeout                     | ASCII                      |
| 46-47    | Chrono de possession (24s basket) | ASCII                      |

**Hardware requis** :

```
Console Stramatel              HAT RS-485              Raspberry Pi 5
(Sortie Interface TV)         (SN65HVD72)             (GPIO UART)

  Rx+ (fil blanc) ──────────→ A (RS-485+)
  Rx- (fil gris)  ──────────→ B (RS-485-)
  GND (fil bleu)  ──────────→ GND ─────────────────→ GND
                                RX ──────────────────→ GPIO 15 (RXD)
                                TX ──────────────────→ GPIO 14 (TXD)
```

**Consoles compatibles** : gamme Multisport 452 (séries 7000/7100/7120, 3000/7020, ME 800).

**Coût hardware** : HAT RS-485 (~30€) + câble PTT (~15€) = **~45€**

### Connecteur 2 — Bodet Sport (TCP/IP réseau OU RS-485 série)

Bodet Sport a **deux générations** de consoles avec des interfaces différentes :

#### Bodet Scorepad (modèles récents) — TCP/IP réseau

**Protocole** : ASCII 8 bits, TCP client → serveur, port 4001 par défaut.

Le Scorepad est la console tactile actuelle de Bodet. Elle dispose de **2 ports RJ-45 Ethernet** et communique via TCP/IP. Le protocole est **documenté publiquement** par Bodet (PDF 608264-Network output and protocols-Scorepad.pdf).

```
Console Bodet Scorepad          Raspberry Pi 5
(2x RJ-45 Ethernet)            (Ethernet ou WiFi)
        │                              │
        └──── Réseau local (LAN) ──────┘
              TCP port 4001
              ASCII 8 bits
```

**Avantages** :

- **Pas de hardware supplémentaire** — le Pi se connecte via le réseau local
- Protocole **documenté publiquement**
- Connexion sans fil possible (si le club a du WiFi)

**Coût hardware** : **0€** (connexion réseau uniquement)

#### Bodet BT6000 et anciennes consoles — RS-485 série

Les consoles plus anciennes (BT6000, BT6xxx, et modèles filaires) utilisent une **sortie RS-485 série** via connecteur RJ-45 pour communiquer avec les panneaux d'affichage. Ces consoles sont **très courantes** dans les clubs amateurs qui n'ont pas renouvelé leur équipement.

```
Console Bodet BT6000            HAT RS-485              Raspberry Pi 5
(Sortie RS-485 via RJ-45)      (SN65HVD72)             (GPIO UART)

  Data+ ───────────────────→ A (RS-485+)
  Data- ───────────────────→ B (RS-485-)
  GND   ───────────────────→ GND ─────────────────→ GND
                                RX ──────────────────→ GPIO 15 (RXD)
```

**Protocole** : Le protocole série Bodet est supporté par le projet **Panel2Net**. Le format est différent de Stramatel (ASCII vs binaire) mais les données extraites sont les mêmes (score, chrono, période, fautes).

**Coût hardware** : HAT RS-485 (~30€) + câble RJ-45 vers bornier (~10€) = **~40€**

#### Résumé Bodet

| Modèle                           | Interface            | Protocole                       | Hardware Pi | Coût     |
| -------------------------------- | -------------------- | ------------------------------- | ----------- | -------- |
| **Scorepad** (récent, tactile)   | TCP/IP Ethernet      | ASCII, port 4001 (doc publique) | Aucun       | **0€**   |
| **BT6000** et anciennes consoles | RS-485 série (RJ-45) | ASCII (supporté Panel2Net)      | HAT RS-485  | **~40€** |

Le `BodetConnector` doit donc supporter **les deux modes** (réseau et série), sélectionnables dans la configuration du site :

```typescript
case 'bodet':
  if (siteConfig.bodetMode === 'network') {
    this.connector = new BodetNetworkConnector();
    await this.connector.connect({
      type: 'network',
      host: siteConfig.host || '192.168.1.100',
      port: siteConfig.port || 4001,
    });
  } else {
    this.connector = new BodetSerialConnector();
    await this.connector.connect({
      type: 'serial',
      port: siteConfig.serialPort || '/dev/serial0',
      baudRate: 19200,
    });
  }
  break;
```

### Connecteur 3 — OCR (fallback universel)

**Principe** : Une caméra USB filme le tableau d'affichage. Un moteur OCR (Tesseract) extrait les chiffres en temps réel. Fonctionne avec **n'importe quel constructeur**, y compris les tableaux mécaniques ou les modèles sans sortie de données.

```
┌───────────────┐    USB     ┌─────────────────┐
│ Tableau       │  ← caméra →│ Raspberry Pi 5  │
│ d'affichage   │            │                 │
│ (n'importe    │            │ OpenCV capture  │
│  quel modèle) │            │ → Tesseract OCR │
│               │            │ → ScoreboardData│
└───────────────┘            └─────────────────┘
```

**Limites** :

- Latence plus élevée (~500ms-1s vs < 100ms pour série/réseau)
- Sensible aux conditions d'éclairage, reflets, angle de la caméra
- Charge CPU non négligeable sur Pi (30-50% CPU pour OCR continu)
- Données limitées : score + chrono visibles, mais pas les fautes/temps morts si non affichés
- Nécessite calibration initiale (zones de détection sur l'image)

**Intérêt** :

- **Universel** — fonctionne avec tout
- **Pas d'accès physique** à la console nécessaire (pas de câble)
- **Fallback** quand la marque du tableau est inconnue ou non supportée
- Projets open-source existants : ScoreSight (Qt6+OpenCV), Scoreboard OCR (commercial)

**Coût hardware** : Caméra USB (~20-30€)

### Rôle de la Remote — Faits de jeu et enrichissement

Avec un connecteur externe, le **score arrive automatiquement**. Mais la Remote reste **indispensable** pour les faits de jeu et l'enrichissement :

```
┌────────────────────────────────────────────────────────────┐
│                                                            │
│   Table de marque                    Remote (opérateur)    │
│   (automatique)                      (manuel)              │
│                                                            │
│   • Score ✅                         • Animation de but ✅  │
│   • Chrono ✅                        • Breaking news ✅     │
│   • Période ✅                       • Phase de match ✅    │
│   • Fautes ✅                        • Vidéo manuelle ✅    │
│   • Temps morts ✅                   • Override score ✅    │
│   • 24s basket ✅                    • Config overlay ✅    │
│                                                            │
│        ↓ automatique                    ↓ déclenché        │
│                                                            │
│   ┌─────────────────────────────────────────────────┐      │
│   │              Pipeline score-update               │      │
│   │         + événements faits de jeu                │      │
│   └──────────┬─────────────────────────┬─────────────┘      │
│              ↓                         ↓                    │
│         TV (ADR-012)             LED (ADR-012)              │
│         • Overlay score          • Bandeau score            │
│         • Animation but          • Flash LED but            │
│         • Vidéo sponsor 16:9     • Vidéo sponsor bandeau   │
│         • Breaking news          • Texte pleine largeur     │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

**Workflow type pendant un match** :

1. Le match commence → l'opérateur passe en phase "During" via la Remote
2. Le score arrive automatiquement de la table de marque → overlay mis à jour sur TV + LED
3. Quand le score change, le TV component **détecte automatiquement le but** et déclenche l'animation (popup/fullscreen/slide + son)
4. L'opérateur peut **enrichir** : lancer une vidéo de célébration, envoyer un breaking news ("⚽ But de Mbappé !"), etc.
5. Les TV et LED réagissent chacun à leur façon (cf. ADR-012)
6. En cas de timeout Stramatel détecté (`timeoutActive: true`), le système peut automatiquement lancer le contenu timeout configuré
7. La Remote affiche en permanence les données enrichies (fautes, temps morts, 24s) reçues du connecteur

**Mode hybride (connecteur + override manuel)** :

L'opérateur peut à tout moment **corriger le score manuellement** depuis la Remote (ex: erreur de saisie sur la console). Le système :

1. Accepte l'override manuel immédiatement
2. Ignore les données du connecteur pendant 30s (éviter que le score erroné de la console écrase la correction)
3. Reprend le flux automatique du connecteur après le délai

```
┌──────────────────────────────────────────────────────────┐
│                    Remote (Tablette)                      │
│                                                          │
│   Source: ● Bodet Scorepad (connecté)    ○ Manuel        │
│                                                          │
│   ┌────────────────────────────────────────────┐         │
│   │  PSG  [23]  -  [21]  OM                   │         │
│   │         ▲               ▲                  │         │
│   │    auto-connecteur   auto-connecteur       │         │
│   │    (cliquable pour override manuel)        │         │
│   └────────────────────────────────────────────┘         │
│                                                          │
│   Période: 2e mi-temps   Chrono: 18:42 (auto)          │
│   Fautes: 3 - 5          Temps morts: 1 - 0            │
│                                                          │
│   ⚡ Données enrichies :                                 │
│   • Chrono possession: 14s                              │
│   • Timeout actif: Non                                  │
│   • Source: Bodet Scorepad (TCP 192.168.1.100:4001)     │
│                                                          │
│   ┌────────────────────────────────────────────┐         │
│   │ 🎬 Faits de jeu (déclencher manuellement) │         │
│   │                                            │         │
│   │  [⚽ BUT !]  [🟨 Carton]  [📢 Annonce]    │         │
│   │  [⏸ Timeout] [🔄 Phase]  [📺 Vidéo]      │         │
│   └────────────────────────────────────────────┘         │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

## Alternatives Considérées

### 1. Connecteur unique Stramatel (version initiale de cet ADR)

**Principe** : Ne supporter que Stramatel RS-485.
**Avantages** : Plus simple à développer, périmètre réduit.
**Inconvénients** : Exclut tous les clubs équipés Bodet (le plus courant en France). Pas scalable. Chaque nouveau constructeur nécessite un refactoring.
**Verdict** : Rejeté — trop limitant pour le marché français.

### 2. OCR uniquement (approche universelle)

**Principe** : Ne pas intégrer de protocole propriétaire. Toujours utiliser l'OCR via caméra.
**Avantages** : Universel, fonctionne avec tout. Pas de câble physique.
**Inconvénients** : Latence (500ms-1s). Fragile (luminosité, angle). Données limitées (pas de fautes/temps morts). Charge CPU élevée. Nécessite calibration. Pas assez fiable pour un usage professionnel pendant un match.
**Verdict** : Rejeté comme solution principale — conservé comme **fallback universel**.

### 3. API fédérations sportives (FFHB, FFBB)

**Principe** : Récupérer le score depuis les apps fédérales (e-marquoir FFHB, etc.)
**Avantages** : Pas de hardware supplémentaire.
**Inconvénients** : Aucune API publique pour les clubs amateurs (recherche décembre 2025). Dépendance tiers. Latence réseau. Pas de données enrichies.
**Verdict** : Rejeté — pas d'API disponible.

### 4. Architecture multi-connecteurs enfichables (choisie) ✅

**Avantages** : Supporte les 2 leaders du marché français (Bodet + Stramatel) dès le départ. Extensible à d'autres constructeurs via un nouveau connecteur. Interface commune = pipeline en aval inchangé. OCR en fallback universel. Le bon connecteur est sélectionné par config du site dans le dashboard.
**Inconvénients** : Plus de code initial (interface + 2-3 connecteurs). Chaque nouveau constructeur nécessite un développement (mais cadré par l'interface).
**Verdict** : Accepté — architecture pérenne qui couvre le marché français et au-delà.

### 5. Saisie manuelle uniquement (statu quo)

**Avantages** : Déjà implémenté, zéro dev.
**Inconvénients** : Double saisie pour l'opérateur. Risque d'erreur/décalage. **Deal breaker pour le prospect.**
**Verdict** : Rejeté comme solution unique — conservé en fallback.

## Conséquences

### Positives

1. **Zéro double saisie** : score automatique depuis la table de marque officielle
2. **Multi-constructeurs** : Bodet (TCP/IP) + Stramatel (RS-485) couvrent la majorité des clubs français
3. **Données enrichies** : chrono, période, fautes, temps morts, 24s — bien au-delà de la saisie manuelle
4. **Latence < 100ms** pour les connecteurs série/réseau
5. **Fallback transparent** : si connecteur déconnecté → saisie manuelle automatique
6. **Extensible** : ajouter Favero, Mobatime, etc. = créer un nouveau connecteur implémentant `ScoreboardConnector`
7. **OCR universel** : même les clubs avec des tableaux sans sortie données sont couverts
8. **Différentiateur commercial** : aucun concurrent ne propose cette intégration multi-constructeurs pour clubs amateurs
9. **Remote enrichie** : l'opérateur voit les données complètes et peut déclencher les faits de jeu
10. **Pipeline existant inchangé** : overlay, animations, Socket.IO, TV+LED — tout réutilisé tel quel

### Négatives

1. **Câble physique** (connecteurs série) : il faut tirer un câble entre la console et le Pi
2. **Spécifique par constructeur** : chaque connecteur est un dev séparé (~2-3j chacun)
3. **OCR limité** : données partielles, latence, fragilité — acceptable uniquement en fallback
4. **Identification pré-vente** : il faut connaître le modèle exact de la console AVANT de vendre

### Risques

| Risque                                 | Mitigation                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| Club avec constructeur non supporté    | OCR en fallback + saisie manuelle. Ajouter un nouveau connecteur si récurrent |
| Protocole Bodet non conforme au PDF    | Tester avec un Scorepad réel lors du POC                                      |
| Protocole Stramatel varie selon modèle | Panel2Net couvre la série 452. POC obligatoire                                |
| Câble série trop long                  | RS-485 = 1200m max. Pas un problème                                           |
| Réseau du club instable (Bodet TCP)    | Reconnexion TCP auto + fallback saisie manuelle                               |
| HAT RS-485 incompatible Pi 5           | GPIO UART identique Pi 4/5. Tester lors du POC                                |
| Perte de connexion en cours de match   | Health check 5s + alerte Remote + basculement auto saisie manuelle            |
| Données corrompues                     | Validation par connecteur (checksum, plausibilité, longueur)                  |
| OCR imprécis                           | Seuil de confiance. Si confiance < 80% → ignorer la lecture                   |
| Conflit override manuel vs connecteur  | Timer 30s : override manuel prioritaire, puis reprise auto                    |

## Plan d'implémentation

### Phase 0 — POC terrain (2-3 jours)

**Objectif** : valider la lecture depuis la console du prospect (Stramatel) ET une console Bodet si accessible.

1. **Identifier les modèles exacts** chez le prospect et dans le parc client
2. **Commander le hardware** : HAT RS-485 + câble PTT (pour Stramatel)
3. **Déployer Panel2Net** sur un Pi de test pour capturer les trames brutes
4. **Valider** Stramatel : score, chrono, période lisibles
5. **Tester** Bodet Scorepad (TCP port 4001) si un club partenaire en dispose

**Critères de validation POC** :

- [ ] Stramatel : trames 54 octets reçues et décodées
- [ ] Stramatel : score, chrono, période corrects
- [ ] Bodet (si testable) : connexion TCP établie, messages ASCII reçus
- [ ] Latence mesurée < 200ms (série) / < 500ms (réseau)

### Phase 1 — Interface commune + connecteur Stramatel (3-4 jours)

1. **Créer l'interface `ScoreboardConnector`** et `ScoreboardData`
2. **Créer `ScoreboardManager`** (orchestrateur, sélection du connecteur par config)
3. **Implémenter `StramatelConnector`** :
   - Listener série `serialport` npm, buffer circulaire, détection `0xF8`
   - Parser 54 octets → `ScoreboardData`
   - Health check, reconnexion auto
4. **Intégrer au serveur Socket.IO** : émettre `score-update` et `scoreboard-extended`
5. **Remote** : indicateur de source (connecteur/manuel), toggle override, timer 30s

**Critères de validation** :

- [ ] Score overlay < 1s après saisie sur console Stramatel
- [ ] Reconnexion auto après débranchement/rebranchement câble
- [ ] Fallback saisie manuelle si déconnexion
- [ ] Override manuel fonctionne avec reprise auto après 30s
- [ ] Animation de but se déclenche automatiquement quand le score change

### Phase 2 — Connecteur Bodet TCP/IP (2-3 jours)

1. **Implémenter `BodetConnector`** :
   - Client TCP (port 4001, configurable)
   - Parser ASCII 8 bits selon doc Bodet (PDF 608264)
   - Mapping vers `ScoreboardData`
   - Reconnexion TCP automatique
2. **Tester** avec un Scorepad Bodet réel
3. **Dashboard** : sélecteur de constructeur par site (Stramatel / Bodet / OCR / Manuel)

**Critères de validation** :

- [ ] Score depuis Bodet affiché en overlay < 1s
- [ ] Reconnexion TCP auto après perte réseau
- [ ] Changement de constructeur dans le dashboard = changement de connecteur sans redémarrage

### Phase 3 — Remote enrichie + faits de jeu (2-3 jours)

1. **Remote** : affichage données enrichies en temps réel (fautes, temps morts, 24s)
2. **Remote** : boutons de faits de jeu (BUT, carton, annonce, timeout, phase, vidéo)
3. **Remote** : ces boutons déclenchent les réactions différenciées TV + LED (cf. ADR-012)
4. **Dashboard** : monitoring connecteur en temps réel par site
5. **Dashboard** : config hardware par site (port série, IP Bodet, type de connecteur)

**Critères de validation** :

- [ ] Remote affiche fautes/temps morts/24s depuis le connecteur
- [ ] Bouton "BUT !" → animation TV (popup) + flash LED simultanément
- [ ] Dashboard affiche statut connecteur vert/rouge par site

### Phase 4 — Connecteur OCR fallback (3-5 jours, optionnel)

1. **Implémenter `OcrConnector`** :
   - Capture caméra USB via `opencv4nodejs` ou `sharp`
   - OCR Tesseract via `tesseract.js`
   - Zones de détection configurables (score, chrono)
   - Seuil de confiance (ignorer si < 80%)
2. **UI de calibration** dans la Remote : pointer les zones score/chrono sur l'image caméra
3. **Tester** avec différents tableaux et conditions d'éclairage

**Critères de validation** :

- [ ] Score lu avec > 95% de précision dans conditions normales
- [ ] Latence < 1.5s
- [ ] Faux positifs < 2% (changements de score erronés)

### Phase 5 — Connecteurs additionnels (2-3 jours chacun, selon demande)

Par ordre de priorité :

1. **Mobatime** (RS-232/RS-422) — référence : Panel2Net
2. **Favero** (RS-422) — référence : Favero_Repeater
3. **Daktronics** (RS-232) — si clubs équipés

Chaque connecteur suit le même pattern : implémenter `ScoreboardConnector`, parser le protocole, émettre `ScoreboardData`.

## Budget estimé

### Par club (hardware)

| Configuration                  | Hardware                     | Coût     |
| ------------------------------ | ---------------------------- | -------- |
| Bodet Scorepad (TCP/IP réseau) | Aucun (réseau existant)      | **0€**   |
| Bodet BT6000 (RS-485 série)    | HAT RS-485 + câble RJ-45     | **~40€** |
| Stramatel (RS-485)             | HAT RS-485 + câble PTT       | **~45€** |
| Mobatime/Favero (RS-232/422)   | Adaptateur USB-série + câble | **~25€** |
| OCR fallback                   | Caméra USB                   | **~25€** |
| Manuel (statu quo)             | Aucun                        | **0€**   |

### Développement

| Phase                                    | Effort    | Cumulé             |
| ---------------------------------------- | --------- | ------------------ |
| Phase 0 — POC                            | 2-3 jours | 2-3j               |
| Phase 1 — Interface + Stramatel          | 3-4 jours | 5-7j               |
| Phase 2 — Bodet TCP                      | 2-3 jours | 7-10j              |
| Phase 3 — Remote enrichie + faits de jeu | 2-3 jours | 9-13j              |
| Phase 4 — OCR (optionnel)                | 3-5 jours | 12-18j             |
| Phase 5 — Chaque connecteur additionnel  | 2-3 jours | +2-3j/constructeur |

**MVP (Phases 0-3)** : **~9-13 jours** — Stramatel + Bodet + Remote enrichie
**Complet (Phases 0-4)** : **~12-18 jours** — + OCR fallback universel

## Références

- **Panel2Net** : https://github.com/tomkohler/Panel2Net — Multi-constructeurs (Stramatel, Bodet, Mobatime, Swiss Timing)
- **BaSta-LedControl** : https://github.com/christianduerselen/BaSta-LedControl — Stramatel Arduino
- **Favero_Repeater** : https://github.com/vehemont/Favero_Repeater — Favero Arduino
- **ScoreSight** : https://github.com/royshil/scoresight — OCR universel (Qt6+OpenCV)
- **Bodet Scorepad protocole réseau** : https://static.bodet-sport.com/images/stories/EN/support/Pdfs/manuals/Scorepad/608264-Network%20output%20and%20protocols-Scorepad.pdf
- `raspberry/src/app/components/tv/tv.component.ts` — Overlay score + goal animation
- `raspberry/src/app/components/remote/remote.component.ts` — Remote controller + broadcastScore()
- `raspberry/src/app/services/local-broadcast.service.ts` — BroadcastChannel dual-channel
- `raspberry/server/socket/handlers.js` — Score relay + state management
- `docs/technical/IMPLEMENTATION_GUIDE_AUDIENCE_SCORE.md` — Guide score existant
- `docs/changelog/2025-12-28_overlay-local-system.md` — Recherche API externes (résultats négatifs)
- ADR-011 — Multi-TV (combinaison avec splitter)
- ADR-012 — TV + LED (faits de jeu différenciés par support)

---

_Créé le 11 février 2026_
