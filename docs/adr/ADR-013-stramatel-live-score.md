# ADR-013: Score Live depuis Table de Marque Stramatel via RS-485

**Date** : 2026-02-11
**Statut** : Proposé
**Décideurs** : Équipe Neopro
**Lié à** : ADR-011 (Multi-TV), ADR-012 (TV + LED)

---

## Contexte

Un prospect (club sportif) utilise une **table de marque Stramatel** pour gérer le score officiel pendant les matchs. Il souhaite que le score affiché sur la table soit **automatiquement récupéré en temps réel** et affiché en overlay sur les TV et écrans LED, **sans double saisie manuelle**. C'est un **deal breaker** : sans cette fonctionnalité, le prospect ne signe pas.

### Contraintes

- **Temps réel** : le score doit apparaître sur les écrans en moins de 1 seconde après la saisie sur la console Stramatel
- **Fiabilité** : le système doit fonctionner pendant toute la durée d'un match (2×30min handball, 4×10min basket, etc.) sans interruption
- **Fallback** : en cas de panne du lien Stramatel, l'opérateur doit pouvoir saisir manuellement (système existant)
- **Données riches** : pas seulement le score, mais aussi le chrono, la période, les fautes, les temps morts, le chrono de possession (24s basket)
- **1 seul Pi** : le connecteur Stramatel tourne sur le même Pi que l'affichage

### État actuel du système de score Neopro

Le système de score live est **100% implémenté** depuis décembre 2025 (Phase 1) :

- **Saisie manuelle** via Remote (télécommande sur tablette)
- **Broadcast dual-channel** : BroadcastChannel (local, prioritaire) + Socket.IO (cloud, backup)
- **Overlay configurable** : 9 positions, 3 templates (sportif/élégant/minimal), multi-sport (6 sports)
- **Animation de but** : popup/fullscreen/slide avec son configurable
- **Chronomètre** : countdown/countup, intégré à l'overlay ou standalone
- **Point d'injection unique** : `broadcastScore()` dans `remote.component.ts` ligne 719

Le système est **protocol-agnostic** — il accepte des scores depuis n'importe quelle source. Seule la source d'entrée change.

### Recherche Stramatel

Des projets open-source ont **prouvé la faisabilité** de l'intégration :

| Projet                                                             | Techno           | Résultat                                            |
| ------------------------------------------------------------------ | ---------------- | --------------------------------------------------- |
| **Panel2Net** (GitHub: tomkohler/Panel2Net)                        | Python/PHP + Pi  | Capture et parse le protocole Stramatel avec succès |
| **BaSta-LedControl** (GitHub: christianduerselen/BaSta-LedControl) | Arduino + MAX485 | Lit le protocole en temps réel, contrôle des LEDs   |

## Décision

Développer un **service Node.js `StramatelConnectorService`** qui tourne sur le Pi, lit le flux RS-485 de la console Stramatel, parse le protocole binaire 54 octets, et injecte les scores dans le pipeline existant via `broadcastScore()`.

### Architecture

```
┌──────────────────┐     RS-485      ┌──────────────────────────────┐
│ Console Stramatel │   (câble PTT)  │       Raspberry Pi 5         │
│ Multisport 452   ├───────────────→│                              │
│                  │  19200 bps      │  ┌──────────────────┐       │
│ Sortie "Interface│  54 octets/msg  │  │  HAT RS-485      │       │
│ TV" (RS-485)     │                 │  │  (SN65HVD72)     │       │
└──────────────────┘                 │  └────────┬─────────┘       │
                                     │           │ UART            │
                                     │  ┌────────▼─────────┐       │
                                     │  │ StramatelService  │       │
                                     │  │ (Node.js)         │       │
                                     │  │                   │       │
                                     │  │ • Serial listener │       │
                                     │  │ • Protocol parser │       │
                                     │  │ • Score extractor │       │
                                     │  └────────┬─────────┘       │
                                     │           │                  │
                                     │           ▼                  │
                                     │  broadcastScore()            │
                                     │      │           │           │
                                     │      ▼           ▼           │
                                     │  BroadcastCh  Socket.IO     │
                                     │  (local)      (cloud)       │
                                     │      │           │           │
                                     │      ▼           ▼           │
                                     │  TV Overlay   Dashboard     │
                                     │  (4 TV + LED) (monitoring)  │
                                     └──────────────────────────────┘
```

### Protocole Stramatel détaillé

**Paramètres série** :

- Bus : **RS-485** (différentiel, half-duplex)
- Débit : **19 200 bps**
- Format : 8 bits, pas de parité, 1 stop bit (8N1)
- Messages : **54 octets** à trame fixe
- Fréquence : ~10 messages/seconde (selon le modèle)

**Structure d'un message (54 octets)** :

| Octet(s) | Donnée                            | Encodage                        |
| -------- | --------------------------------- | ------------------------------- |
| 0        | Octet de début                    | `0xF8` (248)                    |
| 1        | Type de message                   | `0x33`, `0x37`, ou `0x38`       |
| 2-3      | Minutes chrono match              | ASCII (`0x30`-`0x39` = '0'-'9') |
| 4-5      | Secondes chrono match             | ASCII                           |
| 6-8      | Score domicile                    | ASCII (3 chiffres)              |
| 9-11     | Score visiteur                    | ASCII (3 chiffres)              |
| 12       | Période / Quart-temps             | Entier                          |
| 13       | Fautes domicile                   | Entier                          |
| 14       | Fautes visiteur                   | Entier                          |
| 15       | Temps morts restants domicile     | Entier                          |
| 16       | Temps morts restants visiteur     | Entier                          |
| 18       | Statut match                      | 1 = STOP, autre = en cours      |
| 19       | Indicateur timeout actif          | Entier                          |
| 44-45    | Durée timeout                     | ASCII                           |
| 46-47    | Chrono de possession (24s basket) | ASCII                           |

**Encodage des valeurs horloge** :

- Zéro : `0x30` ('0') et `0x40` ('.')
- Chiffres non-zéro : `0x31`-`0x39` ('1'-'9') et `0x41`-`0x49`
- Padding : `0x20` (espace) et `0x00` (NUL)

### Branchement hardware

**Console Stramatel → Pi** (câble PTT, paire torsadée) :

```
Console Stramatel              HAT RS-485              Raspberry Pi 5
(Sortie Interface TV)         (SN65HVD72)             (GPIO UART)

  Rx+ (fil blanc) ──────────→ A (RS-485+)
  Rx- (fil gris)  ──────────→ B (RS-485-)
  GND (fil bleu)  ──────────→ GND ─────────────────→ GND
                                RX ──────────────────→ GPIO 15 (RXD)
                                TX ──────────────────→ GPIO 14 (TXD)
```

**Consoles compatibles** (gamme Multisport 452) :

- 452 MB 7000 / 7100 / 7120 (série Pro)
- 452 MS 3000 / 7020 (série Compact)
- 452 ME 800 (série Eco)
- Toutes disposent de la sortie "Interface TV" RS-485

### Scénario A — Intégration directe RS-485 (recommandé) ✅

**Principe** : Le Pi lit directement le flux série RS-485 via un HAT dédié. Un service Node.js parse les trames en temps réel et alimente le système de score existant.

**Service principal** (`raspberry/server/services/stramatel.service.ts`) :

```typescript
// Architecture du service
import { SerialPort } from 'serialport';
import { EventEmitter } from 'events';

interface StramatelData {
  gameMinutes: string;
  gameSeconds: string;
  homeScore: number;
  awayScore: number;
  period: number;
  homeFouls: number;
  awayFouls: number;
  homeTimeouts: number;
  awayTimeouts: number;
  gameRunning: boolean;
  shotClock: string; // 24s basket
  timeoutActive: boolean;
  timeoutDuration: string;
}

class StramatelService extends EventEmitter {
  private port: SerialPort;
  private buffer: number[] = [];
  private readonly MESSAGE_LENGTH = 54;
  private readonly START_BYTE = 0xf8;

  // Connexion série
  // Accumulation buffer circulaire
  // Détection 0xF8 → collecte 54 octets → parse → emit 'score'
  // Health check : si aucun message reçu depuis 5s → emit 'disconnected'
  // Reconnexion automatique si port série perdu
}
```

**Intégration avec le pipeline existant** :

```typescript
// Dans le serveur Socket.IO du Pi (raspberry/server/)
const stramatel = new StramatelService('/dev/serial0', 19200);

stramatel.on('score', (data: StramatelData) => {
  // Injection dans le pipeline existant (même format que saisie manuelle)
  io.emit('score-update', {
    homeScore: data.homeScore,
    awayScore: data.awayScore,
    homeTeam: matchConfig.homeTeam, // Depuis la config du match
    awayTeam: matchConfig.awayTeam,
    period: data.period,
    matchTime: `${data.gameMinutes}:${data.gameSeconds}`,
    source: 'stramatel', // Nouveau champ pour identifier la source
  });

  // Données enrichies (optionnel, pour le dashboard)
  io.emit('stramatel-extended', {
    ...data,
    timestamp: Date.now(),
  });
});

stramatel.on('disconnected', () => {
  io.emit('stramatel-status', { connected: false });
  // La Remote affiche "Stramatel déconnecté — saisie manuelle activée"
});
```

### Scénario B — Bridge UDP/TCP (consoles réseau)

Certains modèles Stramatel récents (notamment ceux avec l'app mobile Stramatel Multisport) disposent d'une **connectivité réseau**. Si la console est sur le même réseau que le Pi :

```
Console Stramatel (WiFi/Ethernet)
         │
         │  UDP broadcast ou TCP
         ↓
   Raspberry Pi
   StramatelNetworkService
   (listener UDP/TCP)
```

**Avantage** : pas de HAT RS-485, pas de câble physique.
**Limite** : dépend du modèle de console. Protocole réseau non documenté publiquement. Nécessiterait un reverse-engineering ou un partenariat Stramatel.

### Scénario C — Partenariat Stramatel (API officielle)

Contacter Stramatel directement pour :

- Obtenir la **documentation officielle** du protocole RS-485
- Explorer l'existence d'une **API réseau** non publique
- Négocier un **partenariat technique** (intégration certifiée)

Stramatel est basé au Cellier (Loire), entreprise française — contact direct possible.

### Mode hybride (Stramatel + Override manuel)

Le système doit supporter un **mode hybride** où :

1. Le score vient de Stramatel automatiquement
2. L'opérateur sur la Remote voit le score en temps réel
3. L'opérateur **peut corriger manuellement** si divergence
4. Après correction manuelle, le système reprend le flux Stramatel après 30s

```
┌──────────────────────────────────────────────────────────┐
│                    Remote (Tablette)                      │
│                                                          │
│   Source: ● Stramatel (connecté)    ○ Manuel             │
│                                                          │
│   ┌────────────────────────────────────────────┐         │
│   │  PSG  [23]  -  [21]  OM                   │         │
│   │         ▲               ▲                  │         │
│   │    auto-Stramatel   auto-Stramatel         │         │
│   │    (cliquable pour override manuel)        │         │
│   └────────────────────────────────────────────┘         │
│                                                          │
│   Période: 2e mi-temps   Chrono: 18:42 (auto)          │
│   Fautes: 3 - 5          Temps morts: 1 - 0            │
│                                                          │
│   ⚡ Données enrichies Stramatel :                       │
│   • Chrono possession: 14s                              │
│   • Timeout actif: Non                                  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

## Alternatives Considérées

### 1. OCR sur sortie vidéo du tableau d'affichage

**Principe** : Capturer l'image du tableau Stramatel avec une caméra/carte de capture et faire de l'OCR en temps réel pour extraire le score.
**Avantages** : Universel — fonctionne avec n'importe quel tableau (Stramatel, Bodet, etc.)
**Inconvénients** : Fragile (luminosité, angle, reflets). Latence OCR (500ms-2s). Charge CPU élevée sur Pi. Nécessite caméra + positionnement précis. Taux d'erreur non négligeable.
**Verdict** : Rejeté — trop fragile et trop de latence pour un usage professionnel en match.

### 2. Intégration API fédérations (FFHB, FFBB)

**Principe** : Récupérer le score depuis les apps fédérales (e-marquoir FFHB, etc.)
**Avantages** : Pas de hardware supplémentaire
**Inconvénients** : Aucune API publique pour les clubs amateurs (recherche effectuée en décembre 2025). Dépendance à un service tiers non maîtrisé. Latence réseau. Pas de données enrichies (fautes, chrono possession).
**Verdict** : Rejeté — pas d'API disponible pour les clubs amateurs.

### 3. Connecteur RS-485 direct (choisi) ✅

**Avantages** : Protocole documenté et validé par des projets open-source. Données riches (score + chrono + fautes + temps morts + 24s). Latence < 100ms. Fonctionne offline (pas besoin d'internet). Compatible avec toute la gamme Stramatel Multisport 452. Coût matériel minimal (~30€).
**Inconvénients** : Nécessite un câble physique entre la console et le Pi. Spécifique Stramatel (Bodet = protocole différent). HAT RS-485 occupe les GPIO UART du Pi.
**Verdict** : Accepté — seule solution prouvée, fiable et temps réel.

### 4. Saisie manuelle uniquement (statu quo)

**Avantages** : Déjà implémenté, zéro dev
**Inconvénients** : Double saisie pour l'opérateur. Risque d'erreur/décalage. **Deal breaker pour le prospect.**
**Verdict** : Rejeté comme solution unique — conservé en fallback.

## Conséquences

### Positives

1. **Zéro double saisie** : le score s'affiche automatiquement depuis la table de marque officielle
2. **Données enrichies** : chrono, période, fautes, temps morts, chrono 24s — bien au-delà de la saisie manuelle
3. **Latence < 100ms** : quasi temps réel
4. **Fiabilité** : source officielle du match, pas d'erreur humaine
5. **Fallback transparent** : si Stramatel déconnecté, retour automatique en saisie manuelle
6. **Différentiateur commercial** : aucun concurrent ne propose cette intégration pour les clubs amateurs
7. **Pipeline existant inchangé** : overlay, animations, Socket.IO — tout est réutilisé tel quel

### Négatives

1. **Câble physique** : il faut tirer un câble entre la console Stramatel et le Pi (ou adapter son emplacement)
2. **Spécifique Stramatel** : les clubs avec Bodet nécessiteraient un second parser (même architecture, protocole différent)
3. **GPIO UART occupé** : le HAT RS-485 utilise GPIO 14/15 — pas de conflit connu avec les autres composants
4. **Dépendance hardware** : si le HAT RS-485 tombe en panne, fallback manuel uniquement

### Risques

| Risque                                         | Mitigation                                                                                         |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Protocole différent selon modèle Stramatel     | Tester avec le modèle exact du prospect lors du POC. Les projets open-source couvrent la série 452 |
| Câble trop long (console loin du Pi)           | RS-485 supporte jusqu'à 1200m — pas un problème                                                    |
| Console Stramatel pas équipée de sortie RS-485 | Vérifier le modèle avant vente. Toute la gamme 452 l'a                                             |
| Interférence électrique sur le bus RS-485      | Câble blindé (STP) + terminaison 120Ω si nécessaire                                                |
| HAT RS-485 incompatible Pi 5                   | Tester avec les modèles courants (AB Electronics, Waveshare). GPIO UART identique sur Pi 4/5       |
| Perte de connexion série en cours de match     | Health check (heartbeat 5s). Alerte visuelle sur Remote. Basculement auto vers saisie manuelle     |
| Données corrompues (trame partielle)           | Validation : vérifier octet de début `0xF8` + longueur 54 + plausibilité des valeurs               |
| Prospect a un autre modèle que la série 452    | Identifier le modèle exact AVANT le POC                                                            |

## Plan d'implémentation

### Phase 0 — POC terrain (1-2 jours)

**Objectif** : valider que le Pi lit correctement les trames de la console du prospect.

1. **Identifier le modèle exact** de console Stramatel chez le prospect
2. **Commander le hardware** : HAT RS-485 (AB Electronics ou Waveshare) + câble 2 paires
3. **Déployer Panel2Net** (projet open-source) sur un Pi de test
4. **Brancher** à la console Stramatel et capturer les trames brutes
5. **Valider** : score, chrono, période lisibles correctement

**Critères de validation POC** :

- [ ] Trames de 54 octets reçues correctement
- [ ] Score domicile/visiteur décodé et correct
- [ ] Chrono match décodé et correct
- [ ] Période/quart-temps correct
- [ ] Latence mesurée < 200ms

### Phase 1 — Service StramatelConnector (3-4 jours)

1. **Créer `stramatel.service.ts`** dans `raspberry/server/services/`
   - Listener série avec `serialport` npm
   - Buffer circulaire, détection `0xF8`
   - Parser 54 octets → `StramatelData`
   - EventEmitter : `score`, `disconnected`, `error`

2. **Intégrer au serveur Socket.IO** du Pi
   - Écouter les événements `score` du StramatelService
   - Émettre via le pipeline existant (`score-update`)
   - Ajouter champ `source: 'stramatel' | 'manual'`

3. **Health monitoring**
   - Heartbeat : si aucun message depuis 5s → `disconnected`
   - Reconnexion auto si port série perdu
   - Log Winston des événements connexion/déconnexion

**Critères de validation** :

- [ ] Score affiché en overlay < 1s après saisie sur la console
- [ ] Reconnexion automatique après débranchement/rebranchement du câble
- [ ] Fallback vers saisie manuelle si Stramatel déconnecté
- [ ] Aucune fuite mémoire sur 5h de match

### Phase 2 — UI Remote et Dashboard (2-3 jours)

1. **Remote** : indicateur de source (Stramatel/Manuel), toggle override
2. **Remote** : affichage des données enrichies (fautes, temps morts, 24s)
3. **Dashboard** : configuration Stramatel par site (port série, activation)
4. **Dashboard** : monitoring connexion Stramatel en temps réel

**Critères de validation** :

- [ ] Remote affiche "Stramatel connecté" avec indicateur vert
- [ ] Override manuel fonctionnel avec reprise auto après 30s
- [ ] Dashboard montre le statut de connexion Stramatel par site

### Phase 3 — Données enrichies overlay (2-3 jours)

1. **Overlay TV enrichi** : chrono match intégré (auto depuis Stramatel, pas de saisie)
2. **Overlay TV** : fautes, temps morts (optionnel, configurable)
3. **Overlay LED** : bandeau avec score + chrono + 24s
4. **Animation** : trigger automatique sur changement de score

**Critères de validation** :

- [ ] Chrono overlay synchronisé avec chrono Stramatel (< 500ms d'écart)
- [ ] Fautes et temps morts affichables en option
- [ ] Chrono 24s visible sur l'overlay LED (si basket)

## Budget estimé

| Composant                                   | Prix estimé     |
| ------------------------------------------- | --------------- |
| HAT RS-485 Pi (AB Electronics ou Waveshare) | 25-40€          |
| Câble PTT 2 paires (console → Pi)           | 10-20€          |
| **Total hardware par club**                 | **35-60€**      |
| **Développement total (Phases 0-3)**        | **~8-12 jours** |

## Références

- **Panel2Net** : https://github.com/tomkohler/Panel2Net — Projet open-source Pi + Stramatel
- **BaSta-LedControl** : https://github.com/christianduerselen/BaSta-LedControl — Arduino + Stramatel
- `raspberry/src/app/components/tv/tv.component.ts` — Overlay score (lignes 83-92, 340-404)
- `raspberry/src/app/services/local-broadcast.service.ts` — BroadcastChannel (lignes 86-88, 205-211)
- `central-server/src/handlers/score-update.handler.ts` — Handler Socket.IO score (lignes 36-143)
- `raspberry/server/socket/handlers.js` — Score relay local (lignes 58-73)
- `docs/technical/IMPLEMENTATION_GUIDE_AUDIENCE_SCORE.md` — Guide d'implémentation score
- `docs/changelog/2025-12-28_overlay-local-system.md` — Recherche API externes (résultats négatifs)
- ADR-011 — Multi-TV (combinaison avec splitter)
- ADR-012 — TV + LED (overlay adapté par support)

---

_Créé le 11 février 2026_
