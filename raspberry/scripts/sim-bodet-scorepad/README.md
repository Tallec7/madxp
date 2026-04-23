# sim-bodet-scorepad

Simulateur d'une console **Bodet Scorepad** en basketball FIBA. Il se connecte en **client TCP** vers un serveur de test (le futur `BodetNetworkConnector` côté Pi) et émet les trames framées SOH/STX/ETX/LRC conformes à la doc constructeur **608264 J**.

Spec protocolaire : [`docs/proposals/SPEC-PROP-003-protocoles-scoreboards.md`](../../../docs/proposals/SPEC-PROP-003-protocoles-scoreboards.md), surtout § 2.9 (layouts basket byte-par-byte).

## Usage

```bash
cd raspberry/scripts/sim-bodet-scorepad
node src/index.js --host 127.0.0.1 --port 4001 --scenario basket-demo --time-scale 10 --verbose
```

Ou via npm :

```bash
npm start                  # connexion 127.0.0.1:4001 en temps réel
npm run start:demo         # scénario démo compressé x10 avec hex dump
```

Pour tester sans serveur, lance un `nc -l 4001` ou `ncat -l -k 4001` dans un autre terminal.

## Flags CLI

| Flag                | Default       | Rôle                                                           |
| ------------------- | ------------- | -------------------------------------------------------------- |
| `--host <ip>`       | `127.0.0.1`   | Adresse du serveur TCP cible                                   |
| `--port <p>`        | `4001`        | Port TCP cible                                                 |
| `--scenario <name>` | `basket-demo` | Scénario à jouer (seul `basket-demo` dispo en V1)              |
| `--no-scenario`     | off           | Démarre sans scénario (état vierge, pour `--repl`)             |
| `--rate <ms>`       | `200`         | Intervalle entre rondes d'émission (messages 18/30/31/50/60)   |
| `--time-scale <x>`  | `1`           | Accélère le temps simulé (10 = 1 minute réelle = 10 min match) |
| `--verbose`, `-v`   | off           | Hex dump byte-par-byte des trames émises                       |
| `--repl`            | off           | Mode interactif clavier (voir § REPL)                          |
| `--web`             | off           | UI web sur `:4100` (voir § UI Web)                             |
| `--web-port <p>`    | `4100`        | Port de l'UI web                                               |

## UI Web — mode graphique

Pour comprendre visuellement le protocole et tester les scénarios :

```bash
node src/index.js --no-scenario --web
# → http://127.0.0.1:4100
```

L'UI affiche en live :

- Score / chrono / fautes / timeouts / shot clock / bonus
- Boutons pour toutes les actions (panier +1/+2/+3, faute par joueur, timeout, period, chrono play/pause, shot reset, tip-off, reset match)
- **Hex dump des dernières trames de chaque type** (msg 18, 30, 31, 50, 60 + 36/19 conditionnels) avec framing colorisé (SOH/STX/ETX verts, LRC jaune)

Cumulable avec `--repl` (clavier) et l'écriture TCP vers `--host/--port`. Le web UI écoute par défaut sur `127.0.0.1` uniquement (local-only).

## REPL — mode interactif clavier

Pour tester manuellement des edge cases (faute à 4.9s de fin, timeout pendant shot clock <5s, etc.), utiliser `--repl` :

```bash
node src/index.js --no-scenario --repl --verbose
```

Touches disponibles :

| Touche         | Action                                  |
| -------------- | --------------------------------------- |
| `1 2 3`        | Panier **home** +1 / +2 / +3            |
| `7 8 9`        | Panier **guest** +1 / +2 / +3           |
| `f` / `F`      | Faute **home** / **guest** (joueur n°4) |
| `t` / `T`      | Timeout **home** / **guest** (60s)      |
| `e`            | Fin du timeout en cours                 |
| `space`        | Chrono play/pause                       |
| `p`            | Fin de période (reset chrono + fautes)  |
| `o` / `i`      | Reset shot clock 24s / 14s              |
| `r`            | Tip-off (démarre le match)              |
| `s`            | Affiche le status courant               |
| `?` ou `h`     | Affiche l'aide                          |
| `x` / `Ctrl-C` | Quitte                                  |

Chaque action affiche une ligne de status `[P1] ▶ 09:58 | H 2-0 G | fautes H0/G0 | shot 22s | TO H3/G3`.

## Scénarios

### `basket-demo`

Quart-temps scripté d'environ 60 s (en réel à `--time-scale 10`) :

1. T+0 s : tip-off, chrono démarre à 10:00, 0-0, période 1
2. T+3 s : panier Home 2pts (2-0), shot clock reset à 24s
3. T+7 s : panier Guest 3pts (2-3)
4. T+12-20 s : série de fautes Home, 5 fautes équipe au T+20 → bonus msg 60
5. T+30 s : timeout Guest, 60 s de countdown sur msg 19
6. T+45 s : chrono forcé à 0:55 → passage en msg 18 format dernière minute + msg 36 1/10e
7. T+60 s : fin période 1 → période 2, chrono reset 10:00

## Résumé du protocole émis

Chaque trame suit le framing :

```
SOH(0x01) Address(0x7F) STX(0x02) CTRL(0x47) <payload> ETX(0x03) LRC
```

LRC = XOR de `Address..ETX` inclus, puis `AND 0x7F`, puis `+0x20` si < 0x20 (règle PDF p.14).

Messages émis à chaque ronde (toutes les ~200 ms) :

- **18** — chrono + période + nombre de timeouts (format normal 13 B ou "dernière minute" 13 B avec séparateur `'D'`)
- **30** — scores Home/Guest (9 B)
- **31** — fautes du dernier joueur fauté + fautes d'équipe (11 B)
- **50** — shot clock (5 B)
- **60** — indicateur bonus par équipe (5 B)
- **36** — chrono 1/10e (5 B, émis uniquement quand `chrono < 60s` ET horloge qui tourne)
- **19** — countdown timeout + indicateurs (7 B, émis uniquement pendant un timeout actif)

## Tests

```bash
cd raspberry/scripts/sim-bodet-scorepad
node --test
```

Tests : LRC de référence, règle `+0x20 si < 0x20`, layouts msg 18/30/31/36/50/60/19 byte-par-byte.

## Limitations connues (V1)

- Seul le sport **basketball FIBA** (sport byte `'5'`) est implémenté. Basket 3x3, handball, volley, tennis, etc. ne sont pas encore couverts.
- **Pas de keep-alive** TCP explicite. Le simulateur s'appuie sur le keep-alive OS par défaut. Reconnexion auto simple toutes les 2 s.
- Le **status word msg 60** assume `b7=1` par cohérence avec les autres messages — le PDF ne l'explicite pas pour le bonus (`TODO:VERIFY` en capture réelle).
- Les **messages 32/33/34** (fautes persos par joueur, encodage 7-segments) ne sont pas émis : cette V1 utilise msg 31 (snapshot single-player) qui suffit pour le connecteur Pi.
- L'**address** (0x7F) et le **CTRL** (0x47) sont figés. Les valeurs viennent du dump Panel2Net/mobatime.php. Le PDF dit qu'elles sont à ignorer côté lecteur.
- La **cadence** 200 ms est arbitraire (non documentée par Bodet). Configurable via `--rate`.

## Fichiers

- `src/framing.js` — SOH/Address/STX/CTRL/ETX + calcul LRC
- `src/messages-basket.js` — builders msg 18/19/30/31/36/50/60
- `src/match-state.js` — modèle pur du match basket
- `src/emitter.js` — moteur qui combine state + scénario + rondes périodiques
- `src/scenarios/basket-demo.js` — scénario scripté
- `src/repl.js` — mode REPL clavier (keybinds basket)
- `src/web-ui.js` + `public/index.html` — UI web (HTTP vanilla + HTML/JS, zéro dép)
- `src/index.js` — entry CLI + connexion TCP client + reconnexion
- `test/` — tests `node:test` natif
