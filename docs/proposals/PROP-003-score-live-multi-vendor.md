# PROP-003: Score Live depuis Tables de Marque — Architecture Multi-Constructeurs

> _Anciennement ADR-013. Patch profond le 2026-04-11 suite à la session d'architecture (cf. ADR-049 Score Live Multi-Vendor Architecture). Cette proposition reste un document long-form ; les décisions courtes et figées sont consignées dans ADR-049._

**Date** : 2026-02-11 (créé) · 2026-04-11 (patch profond après ADR-049)
**Statut** : Proposé → en cours d'exécution via [F-15.2](../safe/FEATURES.md)
**Décideurs** : Équipe Neopro
**Rattachement SAFe** : [E-15 Score Live Hardware](../safe/EPICS.md), [F-15.2 Score Live multi-vendor MVP](../safe/FEATURES.md), [F-21.2 Public Score API](../safe/FEATURES.md) (PI-3, vision)
**ADR de référence** : [ADR-049 Score Live Multi-Vendor Architecture](../adr/ADR-049-score-live-multi-vendor-architecture.md)
**Lié à** : [PROP-001](./PROP-001-multi-tv-single-pi.md) (Multi-TV), [PROP-002](./PROP-002-tv-led-dual-output.md) (TV + LED)

---

## Architecture figée — Synthèse ADR-049

Trois décisions ont été figées en session le 2026-04-11. Elles s'appliquent à tous les connecteurs et toutes les topologies décrites ci-dessous.

| # | Décision | Conséquence |
|---|----------|-------------|
| **D1** | **Pattern plugin connecteur** avec interface `ScoreboardConnector` unique | Tous les protocoles (Stramatel, Bodet, Mobatime, Favero, OCR) émettent le même `ScoreboardData`. Le pipeline aval est inchangé. |
| **D2** | **Contrat de données ScoreboardData v1** avec **taxonomie d'enrichissement Level 1 → Level 5** | Chaque connecteur déclare son `enrichmentLevel`. Le dashboard, la Remote et l'API publique adaptent l'UI selon le niveau disponible. |
| **D3** | **Topologies multiples** : A1 (Pi unique club LAN), A3 (Pi unique club WiFi cellulaire), B (Scorebox dédié + Pi affichage) — toutes derrière la même interface | Aucun couplage entre topologie installation et logique applicative. La topologie est choisie à la commande, jamais au runtime. |

> **Détail des décisions, contexte de session et options écartées** : voir ADR-049.

---

## Contexte

Les clubs sportifs utilisent des **tables de marque électroniques** pour gérer le score officiel pendant les matchs. Le prospect actuel utilise Stramatel, mais les clubs en France sont équipés de **constructeurs variés**. Le besoin est de récupérer le score **automatiquement en temps réel** depuis la table de marque, quel que soit le constructeur, et de l'afficher en overlay sur les TV et écrans LED (cf. PROP-002), **sans double saisie manuelle**.

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
- **Remote comme couche d'enrichissement** : le score vient de la table de marque automatiquement, mais l'opérateur via la Remote déclenche les **faits de jeu** (animation de but, breaking news, changement de phase) qui produisent des réactions différenciées sur TV et LED (cf. PROP-002)

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

Développer un **système de connecteurs enfichables (plugin architecture)** avec :

1. **Une interface commune `ScoreboardConnector`** (D1 ADR-049) que tous les connecteurs implémentent.
2. **Un contrat de données `ScoreboardData v1`** (D2 ADR-049) avec une **taxonomie d'enrichissement à 5 niveaux** : chaque connecteur déclare ce qu'il sait fournir (score seul → score+chrono → +période → +fautes/timeouts → +shot clock/possession), et l'UI s'adapte automatiquement.
3. **Trois topologies d'installation** (D3 ADR-049) : A1 (Pi unique LAN), A3 (Pi unique WiFi cellulaire), B (Scorebox dédié + Pi affichage), toutes derrière la même interface.
4. **Un premier connecteur Stramatel (RS-485)**, deuxième Bodet (TCP/IP + RS-485 série), troisième OCR fallback universel.
5. **La Remote reste la couche de pilotage des faits de jeu** (animations, breaking news, override manuel).
6. **Une persistance optionnelle** des événements scoreboard côté Central Server (table `scoreboard_events`) pour audit, replay et alimentation d'une **API publique** (vision F-21.2).

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
│         (PROP-002)    (PROP-002)    (monitoring)             │
└─────────────────────────────────────────────────────────────┘
```

### Interface commune — `ScoreboardConnector` & taxonomie d'enrichissement

Tous les champs `ScoreboardData` au-delà du score brut sont **optionnels**. Chaque connecteur déclare son **`enrichmentLevel`** (1 à 5) lors de sa connexion. L'UI (overlay TV, Remote, Dashboard, API publique) lit ce niveau pour activer/désactiver des sections — pas de "champ vide" à l'écran, pas d'erreur.

#### Taxonomie Level 1 → Level 5

| Level | Données fournies | Connecteurs typiques | Usage UI |
|-------|------------------|----------------------|----------|
| **L1 — Score nu** | `homeScore`, `awayScore`, `source` | OCR basique, saisie manuelle minimale, certains tableaux mécaniques | Bandeau LED simple, overlay TV minimal |
| **L2 — Score + Chrono** | L1 + `gameMinutes`, `gameSeconds`, `gameRunning` | OCR calibré, Mobatime simple, Daktronics RTD partiel | Overlay sportif standard |
| **L3 — Score + Chrono + Période** | L2 + `period`, `periodLabel?` | Bodet Scorepad de base, Stramatel `0x33` | Overlay multi-périodes (mi-temps, quart-temps) |
| **L4 — + Fautes & Temps morts** | L3 + `homeFouls`, `awayFouls`, `homeTimeouts`, `awayTimeouts`, `homePenalties?`, `awayPenalties?` | Stramatel `0x37`, Bodet Scorepad complet | Remote enrichie, overlay basket/handball pro |
| **L5 — + Shot Clock & Possession** | L4 + `shotClock`, `possession?`, `timeoutActive`, `timeoutDuration` | Stramatel `0x38` (basket FIBA), Bodet Scorepad basket complet | Overlay FIBA, déclenchement auto contenu timeout, animations possession |

> **Règle UI** : un overlay configuré pour Level 4 mais alimenté par un connecteur Level 2 dégrade gracieusement (les champs fautes/timeouts sont masqués, pas affichés à zéro). Cette règle est appliquée par le composant `tv.component.ts` côté Pi et par le dashboard côté central.

#### Contrat TypeScript v1

```typescript
// raspberry/server/services/scoreboard/connector.interface.ts

type EnrichmentLevel = 1 | 2 | 3 | 4 | 5;

interface ScoreboardData {
  // Level 1 — toujours présent
  homeScore: number;
  awayScore: number;
  source: 'stramatel' | 'bodet' | 'mobatime' | 'favero' | 'daktronics' | 'ocr' | 'manual';
  enrichmentLevel: EnrichmentLevel;
  capturedAt: number; // epoch ms côté Pi/Scorebox

  // Level 2 — optionnel
  gameMinutes?: string;
  gameSeconds?: string;
  gameRunning?: boolean;

  // Level 3 — optionnel
  period?: number;
  periodLabel?: string; // ex: 'Q3', '2T', 'Set 4'

  // Level 4 — optionnel
  homeFouls?: number;
  awayFouls?: number;
  homeTimeouts?: number;
  awayTimeouts?: number;
  homePenalties?: number; // hockey, water-polo
  awayPenalties?: number;

  // Level 5 — optionnel
  shotClock?: string | null;     // 24s basket
  possession?: 'home' | 'away' | null;
  timeoutActive?: boolean;
  timeoutDuration?: string | null;
}

interface ScoreboardConnector {
  readonly name: string;             // 'Stramatel 452', 'Bodet Scorepad', etc.
  readonly type: 'serial' | 'network' | 'ocr' | 'cloud-push';
  readonly enrichmentLevel: EnrichmentLevel; // déclaré statiquement par le connecteur

  connect(config: ConnectorConfig): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  on(event: 'score', handler: (data: ScoreboardData) => void): void;
  on(event: 'connected', handler: () => void): void;
  on(event: 'disconnected', handler: () => void): void;
  on(event: 'error', handler: (err: Error) => void): void;
}

type ConnectorConfig =
  | { type: 'serial'; port: string; baudRate: number }                   // RS-485/RS-232
  | { type: 'network'; host: string; port: number }                      // TCP/IP
  | { type: 'ocr'; cameraDevice: string; region: OcrRegion }             // Caméra
  | { type: 'cloud-push'; siteApiKey: string; webhookSecret: string };   // Variante SaaS (cf. plus bas)
```

> **Versionnage** : le contrat est versionné `v1`. Toute évolution non rétro-compatible créera un `ScoreboardDataV2` et un nouveau topic Socket.IO `score-update-v2`. Les connecteurs continuent de pousser en `v1` jusqu'à migration explicite.

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

### Topologies d'installation (D3 ADR-049)

L'interface unique cache trois topologies physiques d'installation. Le choix se fait **à la commande** (selon contraintes du club et type de console), jamais au runtime.

#### Topologie A1 — Pi unique, club avec LAN

```
┌─────────────┐                ┌──────────────┐                ┌─────────────┐
│ Console     │  RS-485 ou     │ Raspberry Pi │  HDMI / LAN /  │ TV / LED    │
│ Stramatel/  │ ── Ethernet ──→│ (connecteur  │   Ethernet  ──→│ Affichage   │
│ Bodet       │   du club      │  + affichage)│                │             │
└─────────────┘                └──────┬───────┘                └─────────────┘
                                      │
                                      └──── Internet club (LAN) ──→ Central Server
```

- **Cas d'usage** : club équipé d'un réseau local, console et zone TV proches (< 30 m).
- **Coût matériel additionnel** : 0–45 € (HAT RS-485 si Stramatel/Bodet série).
- **Avantage** : 1 seul boîtier sur site, configuration la plus simple.
- **Limite** : exige du LAN partout (pas toujours dispo dans les vieux gymnases).

#### Topologie A3 — Pi unique, WiFi cellulaire (clé 4G/5G)

```
┌─────────────┐    RS-485     ┌──────────────┐  HDMI    ┌─────────────┐
│ Console     │ ───────────── │ Raspberry Pi │ ────────→│ TV / LED    │
│             │  câble local  │ + clé 4G/5G  │          │             │
└─────────────┘               └──────┬───────┘          └─────────────┘
                                     │
                                     └─── 4G/5G ──→ Central Server
```

- **Cas d'usage** : club sans LAN fiable. Le Pi embarque une clé cellulaire (cf. `docs/guides/WIFI_USB_GUIDE.md`).
- **Coût matériel additionnel** : 0–45 € + clé 4G + abonnement data (~10 €/mois inclus dans l'offre).
- **Avantage** : 100 % autonome côté connectivité, fonctionne dans n'importe quel gymnase.
- **Limite** : latence Central Server légèrement plus élevée (négligeable pour le score local — Socket.IO local).

#### Topologie B — Scorebox dédié + Pi affichage

```
┌─────────────┐  RS-485   ┌──────────────────┐  WiFi/LAN  ┌──────────────┐  HDMI  ┌────────┐
│ Console     │ ─────────→│ Neopro Scorebox  │ ──────────→│ Raspberry Pi │ ──────→│ TV/LED │
│             │           │ (Pi Zero 2 W)    │  Socket.IO │ d'affichage  │        │        │
└─────────────┘           └────────┬─────────┘            └──────────────┘        └────────┘
                                   │
                                   └── 4G/LAN ──→ Central Server (push direct)
```

- **Cas d'usage** : la console est **loin** de la zone d'affichage (> 30 m), ou le club veut la donnée score **sans déployer de TV** (pure intégration data → application club / API publique).
- **Hardware Scorebox** : Pi Zero 2 W + boîtier + HAT RS-485 + clé 4G optionnelle ≈ **80 €**.
- **Avantage** :
  - Découple la **collecte** de l'**affichage** — le Scorebox peut survivre à un changement de TV ou à une coupure d'affichage.
  - Permet de vendre la donnée **sans matériel d'affichage** (mode SaaS-pur, cf. plus bas).
  - Peut alimenter plusieurs Pi d'affichage simultanément (multi-TV — cf. PROP-001).
- **Limite** : 2 boîtiers à maintenir au lieu d'1.

#### Tableau de décision topologie

| Critère club                              | A1 (Pi LAN) | A3 (Pi 4G) | B (Scorebox) |
|-------------------------------------------|:-----------:|:----------:|:------------:|
| LAN fiable disponible                     | ✅          | ✅         | ✅           |
| Pas de LAN, gymnase isolé                 | ❌          | ✅         | ✅           |
| Console < 30 m de la TV                   | ✅          | ✅         | ✅ (overkill)|
| Console > 30 m ou cloisons               | ⚠️ câble    | ⚠️ câble  | ✅           |
| Pas de TV — on veut juste la donnée score| ❌          | ❌         | ✅           |
| Multi-TV depuis une seule console         | ⚠️ splitter | ⚠️ splitter| ✅           |
| Budget minimal                            | ✅          | ✅         | ❌ (+80 €)   |

### Neopro Scorebox unifié (3 modes logiciels)

Le **Neopro Scorebox** est un Pi Zero 2 W flashé avec **une seule image** qui supporte trois modes logiciels, sélectionnés au provisioning depuis le dashboard central :

| Mode | Rôle | Pousse vers | Topologie |
|------|------|-------------|-----------|
| **Scorebox-Local** | Lit la console + sert le score en LAN local (Socket.IO) à un ou plusieurs Pi d'affichage | LAN local | B (avec affichage Pi) |
| **Scorebox-Cloud** | Lit la console + pousse direct vers Central Server (HTTPS + WebSocket sécurisé) | Central Server | B (avec ou sans affichage) |
| **Scorebox-Hybrid** | Les deux à la fois : LAN local pour latence + Central pour persistance | LAN + Central | B (recommandé) |

Le mode est défini par une variable `SCOREBOX_MODE=local|cloud|hybrid` dans `/etc/neopro-scorebox.env`, modifiable à distance via le dashboard (re-provisioning OTA). **Aucun rebuild d'image n'est nécessaire** pour changer de mode.

```
┌────────────────────────────────────────────────────────────┐
│         Neopro Scorebox — image unique, 3 modes            │
│                                                            │
│  ┌──────────────┐    ┌────────────────┐   ┌─────────────┐  │
│  │ Connector    │ →  │ ScoreboardData │ → │ Mode router │  │
│  │ (Stramatel/  │    │      v1        │   │             │  │
│  │  Bodet/OCR)  │    └────────────────┘   └──────┬──────┘  │
│  └──────────────┘                                 │         │
│                                ┌──────────────────┼──────┐  │
│                                ↓                  ↓      ↓  │
│                          ┌──────────┐      ┌──────────┐  ┌──────────┐
│                          │ Local    │      │ Cloud    │  │ Hybrid   │
│                          │ (LAN)    │      │ (HTTPS)  │  │ (les 2)  │
│                          └──────────┘      └──────────┘  └──────────┘
└────────────────────────────────────────────────────────────┘
```

> **Pourquoi un boîtier dédié plutôt que le Pi d'affichage** ? Découplage matériel : la collecte de score doit survivre à une panne TV, à un reboot OS d'affichage, à un changement de média player. C'est aussi la base technique de la **vente data-only** (mode SaaS-pur, cf. plus bas).

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

### Variante SaaS — Option SaaS-1 (cloud-push direct)

Le mode SaaS de Neopro (ADR-037 — sites `site_type='saas'`, navigateur uniquement, pas de Pi d'affichage) crée un cas particulier : **comment recevoir le score d'une console physique sur un site qui n'a pas de matériel Neopro côté affichage** ?

#### Option SaaS-1 retenue : Scorebox + push direct Central Server

```
┌─────────────┐  RS-485   ┌────────────────┐   HTTPS/WSS    ┌──────────────────┐
│ Console     │ ─────────→│ Neopro Scorebox│ ──────────────→│  Central Server  │
│ (club)      │           │ mode "cloud"   │  (mTLS + JWT)  │  /scoreboard/    │
└─────────────┘           └────────────────┘                │   ingest/v1      │
                                                            └────────┬─────────┘
                                                                     │
                                                                     ↓
                                                            ┌──────────────────┐
                                                            │ scoreboard_events│
                                                            │     (PG)         │
                                                            └────────┬─────────┘
                                                                     │
                                              ┌──────────────────────┼─────────────────┐
                                              ↓                      ↓                 ↓
                                       Dashboard SaaS         Browser overlay     API publique
                                       (operator view)       (site_type='saas')   (vision F-21.2)
```

- **Le Scorebox pousse** les `ScoreboardData v1` directement vers Central Server via une API d'ingestion authentifiée.
- **Le navigateur du site SaaS** s'abonne à un canal Socket.IO côté Central et reçoit les mises à jour en quasi-temps réel.
- **Aucun Pi d'affichage** n'est nécessaire — le site SaaS affiche le score dans son propre browser overlay.
- **Compatible Topologie B uniquement** (le Scorebox est obligatoire ; pas de variante "PC du club lit la console" pour des raisons de support).

#### Pourquoi ce choix vs alternatives écartées

| Option | Description | Verdict |
|--------|-------------|---------|
| **SaaS-1 (retenue)** | Scorebox dédié pousse vers Central | ✅ Découplé, supportable, identique au mode Pi |
| SaaS-2 | App Windows installée sur le PC du club | ❌ Cauchemar de support multi-OS, antivirus, droits admin |
| SaaS-3 | Plugin navigateur Web Serial API | ❌ Pas de RS-485 dans Web Serial, dépend du navigateur, pas de service en background |
| SaaS-4 | OCR depuis webcam navigateur | ❌ Dégrade trop la donnée (Level 1-2 max), pas fiable pendant un match |

> **Détail des options écartées** : voir ADR-049 § "Variante SaaS".

#### API d'ingestion (esquisse)

```
POST /api/v1/scoreboard/ingest
Authorization: Bearer <site_api_key>
X-Webhook-Signature: <hmac-sha256(body, webhook_secret)>
Content-Type: application/json

{
  "siteId": "uuid",
  "data": { /* ScoreboardData v1 */ },
  "scoreboxId": "uuid",
  "scoreboxFirmware": "1.2.3"
}

→ 202 Accepted (pas de body, ack rapide)
```

- **Auth** : `api_key` du site (déjà existant) + signature HMAC du body avec un `webhook_secret` provisionné lors de l'enrôlement du Scorebox.
- **Idempotence** : `(siteId, capturedAt)` comme clé d'idempotence (le Scorebox peut rejouer en cas de coupure réseau sans dupliquer l'événement).
- **Rate limit** : 50 req/s par site (plafond généreux ; un connecteur typique pousse 5-10 msg/s).

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
│         TV (PROP-002)             LED (PROP-002)              │
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
5. Les TV et LED réagissent chacun à leur façon (cf. PROP-002)
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

## Persistance et audit trail — `scoreboard_events`

Pour permettre le replay d'un match, l'audit, le debug à distance et **l'alimentation de l'API publique** (vision F-21.2), Central Server persiste les événements scoreboard dans une table dédiée :

```sql
-- central-server/src/db/migrations/2026XX_scoreboard_events.sql (à créer dans F-15.2)
CREATE TABLE scoreboard_events (
  id              BIGSERIAL PRIMARY KEY,
  site_id         UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  source          TEXT NOT NULL,                       -- 'stramatel' | 'bodet' | ...
  enrichment_level SMALLINT NOT NULL CHECK (enrichment_level BETWEEN 1 AND 5),
  captured_at     TIMESTAMPTZ NOT NULL,                -- horodatage Pi/Scorebox
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- horodatage Central
  payload         JSONB NOT NULL,                      -- ScoreboardData v1 brut
  scorebox_id     UUID NULL REFERENCES scoreboxes(id),
  match_id        UUID NULL REFERENCES matches(id),    -- F-15.2 — rattachement match
  CONSTRAINT scoreboard_events_idempotency UNIQUE (site_id, captured_at)
);

CREATE INDEX scoreboard_events_site_captured ON scoreboard_events (site_id, captured_at DESC);
CREATE INDEX scoreboard_events_match ON scoreboard_events (match_id) WHERE match_id IS NOT NULL;
```

**Stratégie de rétention** :

- **30 jours** complet en hot storage (PG)
- **90 jours** : downsample à 1 événement / 5 secondes (sufficient pour replay)
- **> 90 jours** : agrégat final du match uniquement (`final_score`, `match_duration`, `events_count`) dans une table `match_summaries`

**Raison de la persistance** : sans cette table, on ne peut pas (a) reconstruire un match a posteriori, (b) déboguer un connecteur défaillant en production, (c) servir une API publique aux clients tiers (média, fédérations, app club). Les trois cas d'usage sont demandés par F-15.2 et F-21.2.

> **Décision rétention** : la durée exacte (30/90 jours) sera figée lors du plan de F-15.2 selon le coût Supabase et la volumétrie observée.

## Vision — API Score Publique (F-21.2, PI-3)

L'investissement matériel + logiciel de PROP-003 ouvre la voie à un produit additionnel positionné en **PI-3** : une **API publique de score live** que Neopro peut commercialiser auprès de :

- **Fédérations sportives** régionales (compétitions amateurs non couvertes par les diffuseurs)
- **Médias locaux** (Ouest France, presse régionale) qui veulent un widget score live sur leur site
- **Apps de clubs** qui veulent embarquer leur propre score sans payer un développement custom
- **Bookmakers et apps de stats** (sports amateurs, niches)

### Contrat API esquissé

```
GET  /api/public/v1/sites/{siteId}/score/live           → SSE / WebSocket — flux temps réel
GET  /api/public/v1/sites/{siteId}/matches/{matchId}    → snapshot final + métadonnées
GET  /api/public/v1/sites/{siteId}/matches?from=&to=    → liste paginée des matchs récents
```

- **Auth** : `Bearer <api_key>` par client tiers, avec quotas par tier (free / pro / enterprise).
- **Format** : ScoreboardData v1 + métadonnées match (équipes, horaires, sport).
- **Latence cible** : < 2 secondes côté client externe (capture Pi → ingestion Central → push SSE).
- **Modèle commercial** : freemium (1 match/jour gratuit, > 100 €/mois pour pro). Détail dans F-21.2.

> **Statut** : F-21.2 reste **en vision** tant que F-15.2 n'a pas livré la collecte fiable. Aucun engagement de date avant fin PI-2.

## Offre commerciale & pricing

### Vente Score Live à un club

| Composant | Mode | Coût Neopro | Prix client (HT) |
|-----------|------|-------------|------------------|
| **Identification console** (pré-vente) | Visite ou photo | 30 min commercial | Inclus dans le devis |
| **Connecteur Stramatel/Bodet série** | HAT RS-485 + câble | ~45 € | **149 € one-shot** |
| **Connecteur Bodet réseau** | 0 € (LAN club) | 0 € | **49 € one-shot** (config) |
| **OCR fallback** | Caméra USB | ~25 € | **99 € one-shot** |
| **Neopro Scorebox** (Topologie B) | Pi Zero 2 W + boîtier | ~80 € | **249 € one-shot** |
| **Abonnement Score Live** | API + persistance + monitoring | 0 € (déjà couvert par infra) | **+15 €/mois** sur l'abonnement de base |
| **Installation sur site** (1ère) | 1 déplacement technicien | 1 j-h | **350 € one-shot** (ou inclus dans pack premium) |

**Justification du pricing** :

- Le **one-shot hardware** couvre le matériel + l'effort d'intégration (configurer le connecteur, tester avec la console, calibrer si OCR).
- Le **+15 €/mois** finance la maintenance des connecteurs, les évolutions de protocoles, l'API publique partagée, et l'astreinte (panne en plein match = appel critique).
- Le **Scorebox dédié à 249 €** est positionné comme un **upgrade premium** pour clubs avec contraintes physiques. Marge brute > 60 %.

### Vente Score Live SaaS-pur (sans matériel d'affichage Neopro)

Pour les clubs qui veulent **uniquement** la donnée score (intégration dans leur propre app, leur site web, leur affichage non-Neopro) :

- **Pack SaaS Score** : Scorebox installé chez le club + API publique (F-21.2) → **149 €/mois** (engagement 12 mois) + **349 €** d'installation.
- C'est aussi l'offre de pénétration pour entrer dans des clubs déjà équipés d'un autre fournisseur d'affichage (sans cannibaliser leur stack actuel).

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

> **Aligné sur F-15.2** (PI-2). La phase 0 est en cours d'exécution (POC terrain). Les phases 1-3 forment le MVP F-15.2. Les phases 4-5 sont des extensions PI-3 (F-15.3+).

### Phase 0 — POC terrain Stramatel (en cours)

**Objectif** : valider la lecture binaire 54 octets depuis la console Stramatel du prospect avant tout investissement de développement.

1. **Identifier les modèles exacts** chez le prospect et dans le parc client (Multisport 452, série exacte)
2. **Commander le hardware** : HAT RS-485 SN65HVD72 + câble PTT (~45 €)
3. **Utiliser le script POC** `raspberry/scripts/poc-stramatel/test-stramatel-listener.js` (créé en avr. 2026, standalone, dépendance unique `serialport@^12`) pour capturer et décoder les trames brutes en mode série direct ou Serial-to-Ethernet, sans toucher au code Pi de production. Voir `raspberry/scripts/poc-stramatel/README.md` pour le câblage, la configuration UART et les critères d'acceptation.
4. **Valider** Stramatel : score, chrono, période, fautes lisibles sur 30 minutes consécutives
5. **Tester** Bodet Scorepad (TCP port 4001) si un club partenaire en dispose — sinon repoussé en phase 2

**Critères de validation POC** :

- [ ] Stramatel : trames 54 octets reçues, octet de début `0xF8` détecté de manière fiable (taux de re-sync < 1%)
- [ ] Stramatel : score, chrono, période corrects pendant un match complet
- [ ] Stramatel : aucune perte de trame > 1s pendant 30 min de capture continue
- [ ] Latence mesurée < 200ms (réception trame → log)
- [ ] Compatibilité confirmée HAT RS-485 ↔ Pi 5 (GPIO UART activé via `raspi-config`)

> **Output du POC** : un dump JSON des trames + un rapport court (`docs/poc/POC-stramatel-2026-04.md` à créer) qui débloquera la planification F-15.2.

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
3. **Remote** : ces boutons déclenchent les réactions différenciées TV + LED (cf. PROP-002)
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

### Phase 6 — Persistance & Scorebox dédié (3-5 jours, F-15.2)

1. **Migration `scoreboard_events`** côté Central (+ repository + tests Jest)
2. **Endpoint d'ingestion** `POST /api/v1/scoreboard/ingest` avec auth `api_key` + signature HMAC + idempotence
3. **Pipeline Pi → Central** : forward des `ScoreboardData v1` du Pi vers Central (en plus du broadcast Socket.IO local), avec buffer disque en cas de coupure réseau
4. **Image Neopro Scorebox** : Pi Zero 2 W flashé avec l'image Pi standard + flag `SCOREBOX_MODE=local|cloud|hybrid` + script de provisioning OTA
5. **Dashboard** : nouvelle entité "scorebox" rattachée à un site, monitoring statut + dernière mise à jour reçue
6. **Tests E2E** Playwright : ingest → persistance → restitution overlay sur navigateur SaaS

**Critères de validation** :

- [ ] Score d'une console arrive dans `scoreboard_events` < 2s après capture
- [ ] Site SaaS (browser overlay) reçoit le score via Central en < 2s
- [ ] Coupure réseau 5 min → buffer Scorebox → flush au retour, 0 perte
- [ ] Idempotence : rejouer un événement = même clé `(site_id, captured_at)` = pas de doublon

### Phase 7 — API Score Publique (vision F-21.2, PI-3)

> **Conditionnée** au succès de F-15.2 et à la validation commerciale (au moins 3 prospects API signés ou en LOI). Pas de développement avant fin PI-2.

1. **Spec OpenAPI** publique `/api/public/v1/sites/{siteId}/score/*`
2. **Auth API key + quotas** par tier (free / pro / enterprise)
3. **SSE / WebSocket public** pour le flux temps réel
4. **Portail développeur** (doc, sandbox, dashboard d'usage)
5. **Facturation** : intégration avec le module abonnement existant

## Budget estimé

### Par club (hardware)

| Configuration                       | Hardware                     | Coût Neopro | Topologie |
| ----------------------------------- | ---------------------------- | -----------:| --------- |
| Bodet Scorepad (TCP/IP réseau)      | Aucun (réseau existant)      | **0 €**     | A1        |
| Bodet BT6000 (RS-485 série)         | HAT RS-485 + câble RJ-45     | **~40 €**   | A1/A3     |
| Stramatel (RS-485)                  | HAT RS-485 + câble PTT       | **~45 €**   | A1/A3     |
| Mobatime/Favero (RS-232/422)        | Adaptateur USB-série + câble | **~25 €**   | A1/A3     |
| OCR fallback                        | Caméra USB                   | **~25 €**   | A1/A3     |
| **Neopro Scorebox dédié**           | Pi Zero 2 W + boîtier + HAT  | **~80 €**   | B         |
| Clé 4G/5G (sites sans LAN)          | Dongle USB cellulaire        | **~30 €**   | A3 ou B   |
| Manuel (statu quo)                  | Aucun                        | **0 €**     | n/a       |

### Développement

| Phase                                          | Effort     | Cumulé             | Rattachement |
| ---------------------------------------------- | ---------- | ------------------ | ------------ |
| Phase 0 — POC Stramatel                        | 2-3 jours  | 2-3 j              | F-15.2 (en cours) |
| Phase 1 — Interface + Stramatel                | 3-4 jours  | 5-7 j              | F-15.2       |
| Phase 2 — Bodet TCP                            | 2-3 jours  | 7-10 j             | F-15.2       |
| Phase 3 — Remote enrichie + faits de jeu      | 2-3 jours  | 9-13 j             | F-15.2       |
| Phase 4 — OCR (optionnel)                      | 3-5 jours  | 12-18 j            | F-15.3 ou backlog |
| Phase 5 — Chaque connecteur additionnel        | 2-3 jours  | +2-3j/constructeur | backlog       |
| **Phase 6 — Persistance + Scorebox dédié**     | 3-5 jours  | 15-23 j            | F-15.2 (extension) |
| **Phase 7 — API Score Publique (vision)**      | 8-12 jours | 23-35 j            | F-21.2 (PI-3) |

**MVP F-15.2 (Phases 0-3 + 6)** : **~12-18 jours** — Stramatel + Bodet + Remote enrichie + Scorebox/persistance
**Étendu (Phases 0-6)** : **~15-23 jours** — + OCR fallback universel
**Vision PI-3 (Phase 7)** : **+8-12 jours** — API publique commercialisée

> **Hypothèse charge** : ces estimations supposent qu'un seul développeur senior travaille en focus. Avec la charge actuelle multi-projets, prévoir un facteur 1.5-2 calendaire.

## Annexe — Checklist pré-installation Score Live

À utiliser lors de la qualification commerciale d'un club, **avant** d'envoyer un devis Score Live. Sans ces réponses, le devis n'est pas fiable.

### Identification de la console

- [ ] **Marque exacte** (Bodet / Stramatel / Mobatime / Favero / Daktronics / autre / inconnu)
- [ ] **Modèle exact** (ex: Bodet Scorepad, Stramatel Multisport 452, BT6000…) — photo de l'étiquette si possible
- [ ] **Année d'achat approximative** (pour repérer les générations sans sortie data)
- [ ] **Sport(s) gérés** par la console (impact niveau d'enrichissement requis : basket Level 5, foot Level 3 suffit)
- [ ] La console est-elle **partagée** avec d'autres systèmes (panneau LED de score existant) ? Risque d'arbitrer un bus série déjà utilisé.

### Connectique disponible

- [ ] **Sortie data documentée** ? (RS-485 / RS-232 / RJ-45 Ethernet / aucune)
- [ ] **Connecteur physique** disponible côté console (PTT / DB9 / RJ-45 / borne à vis)
- [ ] **Documentation constructeur** du protocole (PDF Bodet, manuel Stramatel) : Neopro a-t-il déjà la doc ou faut-il la demander au club ?
- [ ] Si Bodet Scorepad : le **port 4001 TCP** est-il déjà utilisé par un afficheur tiers ? (le Scorepad limite parfois à 1 client)

### Topologie physique du gymnase

- [ ] **Distance** entre la console et la zone d'affichage TV (< 30 m → A1/A3 OK, > 30 m → B recommandé)
- [ ] **Cheminement de câble** possible entre console et Pi (gaines existantes, plafond suspendu, plinthe)
- [ ] **Alimentation 230 V** disponible à proximité du futur emplacement Pi/Scorebox
- [ ] **Présence d'un local technique** sécurisé pour le boîtier (vs zone publique exposée au vandalisme)

### Connectivité Internet

- [ ] **LAN Ethernet** disponible côté console **et/ou** côté affichage ?
- [ ] **WiFi** : SSID couvre-t-il la zone d'installation ? Force du signal mesurée ?
- [ ] **Pas de WiFi** : prévoir clé 4G/5G (Topologie A3 ou Scorebox cloud)
- [ ] **Restrictions firewall** côté club (ports sortants 443 obligatoires pour Central Server) ?

### Cas d'usage métier

- [ ] **Quel niveau d'enrichissement** veut le club : score seul (L1) / score+chrono (L2) / complet basket (L5) ?
- [ ] **Mode hybride remote** souhaité ? (override manuel + connecteur)
- [ ] **Affichage TV uniquement**, ou **TV + LED** (cf. PROP-002), ou **multi-TV** (cf. PROP-001) ?
- [ ] **Mode SaaS-pur** demandé (pas d'affichage Neopro, juste la donnée API) ?
- [ ] **Persistance / replay** demandée pour audit fédéral ou rejeu vidéo ?

### Validation finale

- [ ] **Identification du modèle** confirmée par photo ou visite technique
- [ ] **Topologie A1 / A3 / B** choisie et justifiée
- [ ] **Estimation matérielle** validée (one-shot HT)
- [ ] **Devis abonnement** mensuel validé
- [ ] **Date d'installation** proposée + dépendances (présence club, accès gymnase, etc.)

> **Si une seule case "identification" ou "connectique" reste vide → ne pas envoyer de devis ferme**, planifier une visite technique d'1 h.

## Références

### Décisions & gouvernance interne

- [ADR-049 — Score Live Multi-Vendor Architecture](../adr/ADR-049-score-live-multi-vendor-architecture.md) — décisions courtes figées en session
- [F-15.2 — Score Live multi-vendor MVP](../safe/FEATURES.md) — Feature SAFe portant l'exécution
- [F-21.2 — Public Score API (vision PI-3)](../safe/FEATURES.md) — Vision API publique
- [E-15 — Score Live Hardware](../safe/EPICS.md) — Epic parent
- [PROP-001 — Multi-TV single Pi](./PROP-001-multi-tv-single-pi.md)
- [PROP-002 — TV + LED dual output](./PROP-002-tv-led-dual-output.md)
- [ADR-037 — Site type SaaS (browser-only)](../adr/ADR-037-site-type-saas.md)

### Code & docs Neopro

- `raspberry/scripts/poc-stramatel/test-stramatel-listener.js` — Script POC Phase 0 (lecture standalone trames Stramatel, série direct ou Serial-to-Ethernet)
- `raspberry/scripts/poc-stramatel/README.md` — Câblage RS-485, prérequis UART, critères d'acceptation POC
- `raspberry/scripts/poc-stramatel/package.json` — Dépendance `serialport@^12`
- `raspberry/src/app/components/tv/tv.component.ts` — Overlay score + goal animation
- `raspberry/src/app/components/remote/remote.component.ts` — Remote controller + `broadcastScore()`
- `raspberry/src/app/services/local-broadcast.service.ts` — BroadcastChannel dual-channel
- `raspberry/server/socket/handlers.js` — Score relay + state management
- `docs/technical/IMPLEMENTATION_GUIDE_AUDIENCE_SCORE.md` — Guide score existant
- `docs/changelog/2025-12-28_overlay-local-system.md` — Recherche API externes (résultats négatifs)
- `docs/guides/WIFI_USB_GUIDE.md` — Configuration clé 4G/5G (Topologie A3)

### Projets open-source de référence

- **Panel2Net** : https://github.com/tomkohler/Panel2Net — Multi-constructeurs (Stramatel, Bodet, Mobatime, Swiss Timing)
- **BaSta-LedControl** : https://github.com/christianduerselen/BaSta-LedControl — Stramatel Arduino
- **Favero_Repeater** : https://github.com/vehemont/Favero_Repeater — Favero Arduino
- **coloradoScoreboard** : https://github.com/fabriziobertocci/coloradoScoreboard — Colorado Timing Node.js
- **ScoreSight** : https://github.com/royshil/scoresight — OCR universel (Qt6+OpenCV)

### Documentation constructeurs

- **Bodet Scorepad protocole réseau** : https://static.bodet-sport.com/images/stories/EN/support/Pdfs/manuals/Scorepad/608264-Network%20output%20and%20protocols-Scorepad.pdf

---

_Créé le 11 février 2026 — Patch profond le 11 avril 2026 (post ADR-049)_
