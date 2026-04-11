# POC Stramatel Listener

> Script standalone pour valider la lecture d'une console Stramatel. Rattaché à [PROP-003](../../../docs/proposals/PROP-003-score-live-multi-vendor.md).

## Objectif

Démontrer en conditions réelles qu'on peut :

1. Lire le flux RS-485 d'une console Stramatel (série 452 : 7000, 7100, 7120, 3000, 7020, ME 800)
2. Détecter et décoder les trames binaires 54 octets (`0xF8` + message type + payload)
3. Mesurer le débit effectif (~10 Hz attendu) et le taux d'erreurs
4. Valider les deux modes de transport : **série direct** et **Serial-to-Ethernet**

Ce POC est le **go/no-go technique** de la phase 0 de PROP-003. Si les trames ne sont pas lisibles, tout le reste du projet est à revoir.

## Ce que ce script ne fait PAS

- Pas de push vers Socket.IO, pas d'intégration dashboard, pas de persistance DB
- Pas de fallback manuel, pas de reconnexion auto
- Pas de parsing multi-sport : cible le mapping Stramatel basket de référence

C'est un **script de diagnostic**, pas le connecteur final. Le connecteur final sera implémenté dans `raspberry/server/services/scoreboard/` lors de l'exécution de F-15.2 (cf. SAFe).

## Installation

```bash
cd raspberry/scripts/poc-stramatel
npm install
```

Seule dépendance : `serialport@^12`. Installe des bindings natifs, nécessite un compilateur C++ sur le Pi (`build-essential`, déjà dans l'image Neopro standard).

### Prérequis Raspberry Pi

```bash
# 1. Activer UART hardware
sudo raspi-config
#   Interface Options → Serial Port
#     Login shell over serial? NO
#     Serial port hardware enabled? YES

# 2. Ajouter dans /boot/firmware/config.txt
#    enable_uart=1
#    dtoverlay=disable-bt      # libère UART0 si besoin

# 3. Autoriser l'utilisateur courant à accéder au port série
sudo usermod -aG dialout $USER
# Se déconnecter/reconnecter ensuite

# 4. Vérifier que le device existe
ls -l /dev/serial0
```

## Utilisation

### Mode 1 : Série direct (Pi + HAT RS-485 Waveshare SN65HVD72)

```bash
# Par défaut : /dev/serial0 @ 19200 8N1
node test-stramatel-listener.js

# Autre port si nécessaire
node test-stramatel-listener.js --port /dev/ttyUSB0
```

Câblage attendu :

```
Console Stramatel (sortie Interface TV)   HAT RS-485     Raspberry Pi
  Rx+ (fil blanc)  ───────────────────→  A
  Rx- (fil gris)   ───────────────────→  B
  GND (fil bleu)   ───────────────────→  GND  ─────────→ GND (pin 6)
                                         3V3  ─────────→ 3V3 (pin 1)
                                         RXD  ─────────→ GPIO 15 / pin 10
```

### Mode 2 : Serial-to-Ethernet (Waveshare RS485 TO ETH, USR-TCP232, ...)

Le convertisseur expose le flux RS-485 comme un serveur TCP. C'est la topologie recommandée en production (cf. PROP-003 Topologie A).

```bash
node test-stramatel-listener.js --tcp 192.168.1.50:4001
```

Le convertisseur doit être configuré en :

- Mode : TCP Server
- Baud rate : 19200
- Data bits : 8
- Parity : None
- Stop bits : 1
- Pas de contrôle de flux

### Mode 3 : Dump brut hexa (debug)

Utile si le parser échoue et qu'on veut voir la trame brute pour comprendre ce que la console envoie vraiment.

```bash
node test-stramatel-listener.js --raw
```

## Sortie attendue

En conditions normales, tu dois voir apparaître ~10 lignes par seconde :

```
=== Stramatel POC Listener ===
Protocol: binary, 54 bytes, start=0xF8, ~10Hz
Mode: decoded
[INIT] Opening /dev/serial0 @ 19200 8N1
[OPEN] Listening on /dev/serial0
       [18:42] P2  23 - 21  fautes 3/5  TO 1/0  24s 14  [type 0x33]
       [18:42] P2  23 - 21  fautes 3/5  TO 1/0  24s 13  [type 0x33]
⚡ SCORE [18:41] P2  25 - 21  fautes 3/5  TO 1/0  24s 24  [type 0x33]
       [18:41] P2  25 - 21  fautes 3/5  TO 1/0  24s 23  [type 0x33]

[STATS] 98 trames / 10.0s = 9.8 Hz, erreurs 0 (0.0%)
```

Les lignes marquées `⚡ SCORE` signalent un changement de score entre deux trames consécutives — c'est ce qui déclenchera l'animation de but dans le connecteur final.

## Critères de réussite POC (cf. PROP-003)

- [ ] Trames 54 octets reçues sans erreur (erreurs < 1%)
- [ ] Fréquence mesurée entre 8 et 12 Hz
- [ ] Score domicile et visiteur cohérents avec l'affichage console
- [ ] Chronomètre qui décrémente correctement
- [ ] Période qui change aux bons moments
- [ ] Fautes et temps morts cohérents
- [ ] Shot clock 24s cohérent (basket uniquement)
- [ ] Détection automatique des changements de score (marker `⚡`)

## Dépannage

**`[FATAL] Cannot open /dev/serial0: EACCES`**
→ L'utilisateur n'est pas dans le groupe `dialout`. Voir Prérequis.

**`[FATAL] Cannot open /dev/serial0: ENOENT`**
→ L'UART hardware n'est pas activé. Voir `raspi-config` dans Prérequis.

**Rien ne s'affiche après `[OPEN] Listening...`**
→ 99% du temps : polarité A/B inversée sur le câble RS-485. Inverser les deux fils.
→ 1% du temps : GND non connecté. Brancher GND même si RS-485 est différentiel.
→ Sinon : console pas en mode "Interface TV" (menu Stramatel).

**Beaucoup d'erreurs `Invalid start byte: 0xXX`**
→ Baud rate incorrect. Par défaut Stramatel = 19200. Essayer 9600 si la console est configurée différemment.
→ Ou alors : 2 consoles sur le même bus RS-485 qui se télescopent.

**`[FATAL] serialport not installed`**
→ `npm install` n'a pas tourné ou a échoué (pas de build tools). Installer `sudo apt install build-essential`.

## Prochaine étape après POC OK

Une fois ce script validé sur le terrain chez un prospect, les trames enregistrées seront :

1. **Persistées dans `raspberry/scripts/poc-stramatel/fixtures/`** en tant que fichiers binaires
2. **Utilisées comme fixtures de test** pour le parser définitif du `StramatelConnector`
3. **Référencées dans RESEARCH.md** du milestone SAFe F-15.2

L'implémentation propre se fait ensuite dans `raspberry/server/services/scoreboard/stramatel.connector.ts` avec intégration au `ScoreboardManager` et au pipeline Socket.IO.
