# sim-stramatel

Simulateur d'une console **Stramatel** en basketball FIBA. Il émule un **bridge Serial-to-Ethernet** (type Moxa NPort) : écoute en **TCP serveur** et pousse sur toute connexion cliente le flux binaire brut de trames `0x33` (54 octets, start byte `0xF8`) à ~10 Hz, exactement comme une vraie console Stramatel émettrait sur RS-485 19200 8N1 derrière un tel bridge.

Spec protocolaire : [`docs/proposals/SPEC-PROP-003-protocoles-scoreboards.md`](../../../docs/proposals/SPEC-PROP-003-protocoles-scoreboards.md), section 1 (Stramatel). Le layout 0-19 + 44-47 est **Haute confiance** (Panel2Net en production), 20-43 **Moyenne**, 17 + 48-53 **Basse** (padding hypothétique).

Le futur `StramatelConnector` côté Pi pourra brancher son parseur indifféremment sur `/dev/serial0` (prod) ou sur `net.connect('127.0.0.1', 5000)` (dev contre ce simulateur). Le flux émis est identique bit pour bit.

## Usage

```bash
cd raspberry/scripts/sim-stramatel
node src/index.js --host 127.0.0.1 --port 5000 --scenario basket-demo --time-scale 10 --verbose
```

Ou via npm :

```bash
npm start                  # serveur TCP 127.0.0.1:5000 en temps réel
npm run start:demo         # scénario démo compressé x10 avec hex dump 1/s
```

Tester sans connecteur Pi :

```bash
nc 127.0.0.1 5000 | xxd    # voir les 54 octets défiler à 10 Hz
```

## Flags CLI

| Flag                 | Default       | Rôle                                                        |
| -------------------- | ------------- | ----------------------------------------------------------- |
| `--host <ip>`        | `127.0.0.1`   | Adresse d'écoute TCP                                        |
| `--port <p>`         | `5000`        | Port TCP d'écoute                                           |
| `--scenario <name>`  | `basket-demo` | Scénario (seul `basket-demo` dispo en V1)                   |
| `--rate-hz <n>`      | `10`          | Fréquence d'émission des trames 0x33                        |
| `--time-scale <x>`   | `1`           | Accélère le temps simulé (10 = 1 min réelle = 10 min match) |
| `--transport <kind>` | `tcp-server`  | Mode de transport (tcp-server uniquement pour l'instant)    |
| `--verbose`, `-v`    | off           | Hex dump d'une trame par seconde (≈ 1/`rate-hz` trames)     |

## Scénarios

### `basket-demo`

Quart-temps scripté identique à `sim-bodet-scorepad` (pour comparaison A/B) :

1. T+0 s : tip-off, chrono démarre à 10:00, 0-0, période 1
2. T+3 s : panier Home 2pts (2-0), shot clock reset
3. T+7 s : panier Guest 3pts (2-3)
4. T+12-20 s : série de 5 fautes Home → bonus (byte 13 = `'5'`)
5. T+30 s : timeout Guest, byte 19 ≠ `0x20`, countdown sur bytes 44-45
6. T+45 s : chrono forcé à 0:55 → passage en encodage dernière minute (§ 1.4.1)
7. T+60 s : fin période 1 → période 2, chrono reset 10:00

## Résumé du protocole émis

Flux **continu**, sans framing applicatif, sans checksum. Chaque trame :

```
F8 33 MM MM SS SS H H H G G G P FH FG TH TG ? S TO [12 player fouls home] [12 guest] TT TT SS SS [6 padding]
 0  1  2     4     6     9    12 13 14 15 16 17 18 19 20..31              32..43     44    46    48..53
```

- Byte 0 = `0xF8` (re-sync marker)
- Byte 1 = `0x33` (type message principal)
- Bytes 2-5 = chrono MM:SS ASCII, ou **SS + space + dixièmes** en dernière minute (§ 1.4.1)
- Bytes 6-11 = scores Home + Guest (3 digits ASCII right-aligned)
- Byte 12 = période (`'1'..'9'` ASCII)
- Bytes 13-14 = fautes équipe H / G
- Bytes 15-16 = timeouts restants H / G
- Byte 17 = **réservé** (space, hypothèse)
- Byte 18 = statut binaire : `0x01` = STOP, autre = RUN
- Byte 19 = indicateur timeout (`0x20` = pas de timeout)
- Bytes 20-31 / 32-43 = fautes individuelles des 12 joueurs H / G
- Bytes 44-45 = countdown timeout (ou backup chrono hors timeout)
- Bytes 46-47 = **shot clock** 24s basket FIBA
- Bytes 48-53 = padding (space, hypothèse)

## Tests

```bash
cd raspberry/scripts/sim-stramatel
node --test
```

Tests : longueur 54 B, bytes 0-1, encodage chrono normal + dernière minute, scores, statut clock, timeout, shot clock, resync, period, réservés 17 + 48-53.

## Limitations connues (V1)

- Seul **basketball FIBA** est simulé. Les variantes multi-sport (hockey, handball, volley, foot) sont marquées "Inconnu" dans le SPEC § 1.7 — **non implémentées**. Le Stramatel émet probablement le même layout `0x33` avec champs non pertinents en espaces, mais c'est à valider.
- Seul le **message `0x33`** est émis. Les messages `0x37`/`0x38` (stats individuelles points joueurs), `0x77`/`0x62` (noms), `0x4D` (bandeau) ne sont pas produits.
- **Pas de jitter** : la cadence est un `setInterval(100ms)`. Une vraie console aura du jitter mesurable — à calibrer plus tard (§ 1.1 SPEC).
- Les octets `17` et `48-53` sont **présumés réservés** (émis `0x20` par défaut). Si la vraie console écrit autre chose, mettre à jour `frame-0x33.js`.
- L'heuristique **dernière minute** (§ 1.4.1) est fragile. On place les dixièmes en byte 5 et un space en byte 4 pour respecter le test `trim(bytes4-5).length == 1` de Panel2Net l.299-305. À recalibrer sur vraie console.

## Fichiers

- `src/frame-0x33.js` — builder unique `buildFrame0x33(state) → Buffer(54)`
- `src/match-state.js` — modèle pur du match basket (score, chrono, fautes, timeouts, shot clock)
- `src/emitter.js` — boucle tick 10 Hz + consommation scénario
- `src/scenarios/basket-demo.js` — scénario scripté (miroir de sim-bodet)
- `src/index.js` — entry CLI + TCP server
- `test/frame-0x33.test.js` — tests `node:test` natif
