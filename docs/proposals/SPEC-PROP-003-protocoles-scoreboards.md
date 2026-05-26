# SPEC PROP-003 — Protocoles Tables de Marque (annexe technique)

> **Annexe à** [`PROP-003-score-live-multi-vendor.md`](./PROP-003-score-live-multi-vendor.md).
> **Objectif** : documenter au bit/octet près les protocoles **Stramatel** et **Bodet Scorepad** pour permettre (a) l'écriture d'un simulateur de console réaliste côté dev, (b) l'implémentation des connecteurs de parsing côté Raspberry Pi sans attendre l'accès à une vraie console.
> **Statut** : reverse-engineering (Stramatel) + documentation constructeur officielle (Bodet).
> **Dernière mise à jour** : 23 Avril 2026.

---

## 0. Convention de confiance

| Niveau      | Signification                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Haute**   | Documenté par le constructeur (PDF officiel) OU confirmé par du code qui a manifestement tourné en production (Panel2Net, live depuis 2017 sur des matchs suisses). |
| **Moyenne** | Déduit d'un code open-source par reverse-engineering, sans validation terrain connue.                                                                               |
| **Basse**   | Hypothèse ou extrapolation. À valider avec une vraie console avant toute décision.                                                                                  |
| **Inconnu** | Le protocole ne dit rien ou les sources se contredisent.                                                                                                            |

---

## 1. Stramatel

**Source de vérité principale** : aucun PDF public. Le protocole est reconstruit à partir du code `stramatel.php` de Panel2Net (auteur : Thomas Gervaise, 2017, en production sur des matchs de basket suisses) et d'Arduino `BaSta-LedControl`.

### 1.1 Couche physique

| Paramètre        | Valeur                                                               | Confiance                                                          |
| ---------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Bus              | **RS-485** half-duplex, paire différentielle A/B + GND               | Haute                                                              |
| Débit            | **19 200 bps**                                                       | Haute (repris de Panel2Net + docs communauté)                      |
| Format UART      | 8N1 (8 data, no parity, 1 stop)                                      | Haute                                                              |
| Câblage console  | Sortie « Interface TV » — fils Rx+ (blanc) / Rx- (gris) / GND (bleu) | Haute                                                              |
| Débit de trames  | ~10 Hz (une trame principale toutes les 100 ms)                      | Moyenne — dérivé du POC existant, à confirmer sur la vraie console |
| Consoles connues | Gamme Multisport 452 (séries 7000/7100/7120, 3000/7020, ME 800)      | Haute (liste constructeur)                                         |

> **Note** : la console Stramatel **émet seule**, elle ne reçoit rien. Le connecteur Pi est strictement en lecture (half-duplex mais un seul talker). Le driver DE/~RE du HAT RS-485 doit rester en mode réception permanente.

### 1.2 Structure générique d'un paquet

Stramatel n'émet pas des trames isolées mais un **flux continu** composé de plusieurs messages concaténés. Chaque message commence par :

```
0xF8  <type>  <payload…>
```

- **`0xF8`** (248 décimal) est le **byte de début** commun à tous les messages. Il sert de séparateur.
- **`<type>`** est un seul octet qui identifie la structure du payload (score principal, individual points, noms, message texte…).
- Le **payload** a une taille qui dépend du type. Pour le message principal `0x33`, le payload total (incluant start + type) fait **54 octets** et le suivant commence immédiatement après (octet 54 = `0xF8` du message suivant).

**Confiance** : Haute sur le start-byte et le principe de concaténation (confirmé par `explode(chr(248)."3", …)` dans `stramatel.php` lignes 272-275). Haute sur la longueur 54 du message principal (aligné avec POC MadXP). Moyenne sur la longueur exacte des autres types.

### 1.3 Types de messages observés

| Type (hex) | ASCII       | Contenu                                                                          | Taille     | Confiance                                                                                            |
| ---------- | ----------- | -------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------- |
| `0x33`     | `'3'`       | **Message principal** : chrono, score, période, fautes, timeouts, shot clock     | 54 octets  | Haute                                                                                                |
| `0x37`     | `'7'`       | Points individuels équipe visiteur (liste 13 joueurs)                            | ~54 octets | Moyenne                                                                                              |
| `0x38`     | `'8'`       | Points individuels équipe domicile (liste 13 joueurs)                            | ~54 octets | Moyenne                                                                                              |
| `0x77`     | `'w'` (119) | Noms domicile : n° de ligne + maillot (un joueur par trame)                      | Variable   | Moyenne                                                                                              |
| `0x62`     | `'b'` (98)  | Noms visiteur : un joueur par trame                                              | Variable   | Moyenne                                                                                              |
| `0x4D`     | `'M'` (77)  | Messages texte libres (bandeau), format multi-fragments avec index               | Variable   | Moyenne — format fragment reconstruit ligne 429-464 de `stramatel.php`, jamais validé hors Panel2Net |
| `0x25`     | `'%'` (37)  | Mentionné dans `stramatel.php` ligne 374 (`chr(38)` erroné, cf. § zones d'ombre) | Inconnu    | Basse                                                                                                |

**PROP-003 mentionne 0x33/0x37/0x38 comme "messages principaux". C'est inexact** : seul `0x33` est le message "état de match". `0x37` et `0x38` transportent les stats individuelles par joueur, pas un snapshot de match différent. Cette spec corrige ce point.

### 1.4 Layout du message `0x33` (54 octets) — la trame critique

Offset compté depuis le `0xF8` de début (offset 0).

| Offset | Lng | Champ                                             | Encodage                                                                        | Notes                                                                                                                     |
| ------ | --- | ------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 0      | 1   | `START`                                           | `0xF8`                                                                          | Début de trame                                                                                                            |
| 1      | 1   | `TYPE`                                            | `0x33` (`'3'`)                                                                  | Type message principal                                                                                                    |
| 2-3    | 2   | Chrono minutes (MM)                               | ASCII `'0'..'9'` (0x30-0x39) ou espace (0x20)                                   |                                                                                                                           |
| 4-5    | 2   | Chrono secondes (SS)                              | ASCII ou espace                                                                 | Si dernière minute : encodage spécial — voir § 1.4.1                                                                      |
| 6-8    | 3   | Score domicile                                    | ASCII 3 chiffres, right-aligned, espaces en tête                                |                                                                                                                           |
| 9-11   | 3   | Score visiteur                                    | ASCII 3 chiffres, right-aligned                                                 |                                                                                                                           |
| 12     | 1   | Période / quart-temps                             | 1 caractère ASCII (`'1'..'9'`)                                                  | `stramatel.php` ligne 292 : `substr($mainInfo,12,1)`                                                                      |
| 13     | 1   | Fautes domicile                                   | 1 caractère ASCII (0-5 sur basket FIBA)                                         |                                                                                                                           |
| 14     | 1   | Fautes visiteur                                   | 1 caractère ASCII                                                               |                                                                                                                           |
| 15     | 1   | Timeouts restants domicile                        | 1 caractère ASCII                                                               |                                                                                                                           |
| 16     | 1   | Timeouts restants visiteur                        | 1 caractère ASCII                                                               |                                                                                                                           |
| 17     | 1   | **Inconnu**                                       | —                                                                               | Non utilisé par Panel2Net ; **réservé — ne pas présumer zéro**                                                            |
| 18     | 1   | Statut match                                      | `0x01` = STOP, autre = RUN                                                      | `stramatel.php` l.293-298 : teste `== 1` donc c'est un **byte binaire** et non ASCII                                      |
| 19     | 1   | Indicateur timeout actif                          | `' '` (0x20) = pas de timeout ; autre = timeout en cours                        | `stramatel.php` l.315-320                                                                                                 |
| 20-31  | 12  | Fautes individuelles joueurs domicile (12 lignes) | 1 byte par ligne, offset `19+i` pour `i=1..12` (décompte `stramatel.php` l.477) | Utilisé couplé à `0x38` pour reconstituer les stats joueur                                                                |
| 32-43  | 12  | Fautes individuelles joueurs visiteur (12 lignes) | 1 byte par ligne (`stramatel.php` l.497)                                        | Idem côté visiteur                                                                                                        |
| 44-45  | 2   | Durée timeout en cours                            | ASCII MM ou SS                                                                  | En dehors d'un timeout, Panel2Net réutilise la valeur comme backup du chrono général (l.171-173)                          |
| 46-47  | 2   | **Shot clock** (24s basket)                       | ASCII 2 chiffres                                                                | Basket FIBA uniquement                                                                                                    |
| 48-53  | 6   | **Inconnu / padding**                             | —                                                                               | Non référencé dans `stramatel.php` ni BaSta ; hypothèse : padding pour aligner sur 54 octets + bytes réservés multi-sport |

**Niveau de confiance global du layout** : offsets 0-19 et 44-47 = **Haute** (utilisés par Panel2Net en production). Offsets 20-43 = **Moyenne** (utilisés pour stats joueur mais couplage fautes individuelles vs `0x38` pas entièrement clarifié). Offsets 48-53 = **Basse** (padding supposé).

#### 1.4.1 Encodage du chrono — minute vs dernière minute

Dans le code Panel2Net (`stramatel.php` l.299-305) :

```
$testCond = trim(substr($mainInfo, 4, 2));
if(strlen($testCond) == 1) {
    $timer = substr($mainInfo,2,2).'.'.substr($mainInfo,3,1);   // dernière minute : SS.1/10
} else {
    $timer = substr($mainInfo,2,2).':'.substr($mainInfo,4,2);   // MM:SS
}
```

**Interprétation** : pendant la dernière minute de jeu (< 60s), la console passe en affichage 1/10e de seconde. Les octets 2-5 ne représentent plus MM:SS mais **SS.d** (secondes.dixièmes), avec un formatage différent détectable au fait que le "champ secondes" ne contient qu'**un seul chiffre non-espace**. Cette heuristique est fragile (confiance **Moyenne**) — sur la vraie console, il faut mesurer quel offset bascule exactement et confirmer.

### 1.5 Trames/états spéciaux

Stramatel n'émet **pas** de trames dédiées pour les événements. Tous les changements d'état sont véhiculés par le flux continu de messages `0x33` et interprétés par différence entre deux snapshots.

| Événement                          | Détection                                                                                                        | Source                                                             | Confiance |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------- |
| **Panier marqué**                  | `homeScore(t) > homeScore(t-1)` (ou visiteur). Delta typique 1/2/3.                                              | Panel2Net compte `+1/+2/+3` et le laisse affiché 8 cycles (~0.8s). | Haute     |
| **Match arrêté (stop chrono)**     | Offset 18 passe à `0x01`                                                                                         | `stramatel.php` l.294                                              | Haute     |
| **Timeout démarré**                | Offset 19 ≠ 0x20 et offsets 44-45 se mettent à décompter                                                         | `stramatel.php` l.315-322                                          | Haute     |
| **Fin de période**                 | Offset 12 (période) s'incrémente, le chrono repart de la durée d'une période                                     | Déduction                                                          | Moyenne   |
| **Bonus (5 fautes)**               | Offset 13 ou 14 atteint `5`                                                                                      | `stramatel.php` switch ligne 50-53 : label "Bonus"                 | Haute     |
| **Reset complet / nouveau match**  | **Aucune trame dédiée**. Heuristique : période = 1, score = 0-0, chrono reset à la durée de période configurée.  | Déduction                                                          | Basse     |
| **Console OFF**                    | **Fin du flux**. La console cesse d'émettre ; le parser Pi doit basculer en mode "stale" après N ms sans `0xF8`. | Non documenté                                                      | Basse     |
| **Nom d'équipe / message bandeau** | Messages `0x77`/`0x62`/`0x4D`, indépendants du `0x33`                                                            | Panel2Net                                                          | Moyenne   |

### 1.6 Checksum / CRC

**Aucun** checksum, CRC, parité applicative ou octet de fin identifié. Le code Panel2Net n'en vérifie aucun (`stramatel.php` — grep négatif sur `crc`, `checksum`, `lrc`). La robustesse repose sur :

1. La resynchronisation sur `0xF8` en cas de désalignement (approche POC MadXP l.133-169).
2. La redondance temporelle (10 trames/s) : une trame corrompue est immédiatement écrasée par la suivante.

**Implication simulateur** : pas besoin de calculer de CRC. Émettre simplement le flux binaire au rythme nominal.

### 1.7 Variantes multi-sport

Le protocole est **fortement orienté basket FIBA**. La présence des champs shot clock (46-47), 5 fautes = bonus, timeouts par équipe, période 1-4 le reflète.

| Sport                 | Support | Mécanique                                                                                                                                 | Confiance |
| --------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **Basket FIBA**       | Complet | Tous les champs `0x33` utilisés                                                                                                           | Haute     |
| **Handball**          | Partiel | Chrono + score + période exploités ; fautes = pénalités 2 min ? (non vérifié)                                                             | Basse     |
| **Volleyball**        | Partiel | Score + set (mappé sur "période"?)                                                                                                        | Basse     |
| **Hockey sur glace**  | Inconnu | Les consoles multisport 452 supportent le hockey en interne, mais le mapping des champs sur `0x33` n'est **pas documenté** dans Panel2Net | Inconnu   |
| **Football / futsal** | Inconnu | Idem                                                                                                                                      | Inconnu   |

**Hypothèse de travail** : la console émet toujours le même layout `0x33` quel que soit le sport sélectionné. Les champs non pertinents (shot clock en handball, fautes en volley) sont probablement à `0x20` (espace) ou à zéro ASCII. **À valider sur la vraie console**.

### 1.8 Sources

- **`Panel2Net/stramatel.php`** — https://github.com/tomkohler/Panel2Net/blob/master/stramatel.php (531 lignes, auteur Thomas Gervaise, commentaire `// Stramatel Reader - 01/12/2017`). Toutes les références "l.XXX" dans cette section renvoient à ce fichier.
- **`Panel2Net/Stramatel_GEN_HEL_20171125.txt`** — dump hex brut d'un vrai match (GEN vs HEL, 25/11/2017), utile pour tests unitaires du décodeur.
- **`BaSta-LedControl`** — https://github.com/christianduerselen/BaSta-LedControl (Arduino, décodeur Stramatel pour bandes LED fautes). **N'a pas pu être inventorié fichier par fichier** (l'API GitHub n'a pas retourné l'arbre lors de la rédaction) — source à ouvrir manuellement pour valider le layout fautes individuelles (offsets 20-43).
- **POC MadXP** — `raspberry/scripts/poc-stramatel/test-stramatel-listener.js` dans ce repo.

---

## 2. Bodet Scorepad (TCP/IP)

**Source de vérité** : documentation officielle Bodet réf. **608264-Network output and protocols-Scorepad.pdf** (53 pages). Confiance **Haute** partout sauf mention contraire.

### 2.1 Couche transport

| Paramètre                | Valeur                                                                                | Réf PDF                                                             |
| ------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Rôle Scorepad            | **Client TCP** (se connecte vers le PC qui doit être serveur)                         | p.4 "@IP PC : 192.168.1.200 — The PC must run in 'TCP server' mode" |
| Port par défaut          | **4001** (configurable dans le menu technicien Scorepad, code `4934`)                 | p.4, p.7                                                            |
| Alternative série        | Via convertisseur RJ45↔RS232 (Moxa NPort 5150A) — 9600 bps, 8N1, no flow control      | p.10 (config Moxa)                                                  |
| Scope                    | **Seule la console MAIN émet** le protocole ; les keypads secondaires sont silencieux | p.3 note                                                            |
| Activation               | Nécessite Protocol Type = **"TV protocol"** dans le menu                              | p.7                                                                 |
| Keep-alive / reconnexion | Non documenté dans le PDF — comportement à observer                                   | Inconnu                                                             |

**Implication connecteur** : le Pi doit **écouter en TCP server** sur le port 4001, pas se connecter activement. C'est l'**inverse** de ce qui est implicite dans PROP-003 § "Connecteur 2" qui suggère `new net.Socket(); client.connect(host, port)`. **Correction à apporter dans PROP-003** : `net.createServer()` côté Pi, le Scorepad se connecte sortant.

### 2.2 Grammaire ASCII — framing commun

Toute trame émise par le Scorepad suit le format suivant (PDF p.14) :

```
<SOH> <Address> <STX> <CTRL> <Message…> <ETX> <LRC>
```

| Symbole     | Valeur         | Rôle                                                       |
| ----------- | -------------- | ---------------------------------------------------------- |
| **SOH**     | `0x01`         | Start Of Header                                            |
| **Address** | 1 octet        | **À ignorer** côté lecteur, mais inclus dans le calcul LRC |
| **STX**     | `0x02`         | Start Of Text                                              |
| **CTRL**    | 1 octet        | **À ignorer**, inclus dans LRC                             |
| **Message** | N octets ASCII | Payload (voir § 2.3/2.4/2.6)                               |
| **ETX**     | `0x03`         | End Of Text                                                |
| **LRC**     | 1 octet        | Checksum — voir § 2.5                                      |

**Paramètres UART (si passé par le Moxa RS232)** : 9600 bps, 8 data bits, 1 start, 1 stop, **no parity** (PDF p.14 + p.10). À noter : **9600 bps**, pas 19200 — c'est différent de Stramatel, **corriger PROP-003 qui mentionne `baudRate: 19200` pour Bodet ligne 506**.

### 2.3 Types de messages par ID

Dans le payload, le **message ID** est encodé comme **2 chiffres ASCII** concaténés au début (ex: "18" = bytes `'1' '8'` = `0x31 0x38`). Le **3e byte** identifie le sport :

| Sport byte | ASCII | Sport                            |
| ---------- | ----- | -------------------------------- |
| `0x30`     | `'0'` | Volleyball                       |
| `0x31`     | `'1'` | Tennis                           |
| `0x32`     | `'2'` | Table tennis                     |
| `0x33`     | `'3'` | Badminton                        |
| `0x34`     | `'4'` | Handball                         |
| `0x35`     | `'5'` | Basketball                       |
| `0x37`     | `'7'` | Ice Hockey / Floorball (partagé) |
| `0x38`     | `'8'` | Basketball 3x3                   |

Table des messages les plus utilisés (IDs cités dans le PDF) :

| ID   | Sport(s) concerné(s) | Contenu                                              | Réf p.       |
| ---- | -------------------- | ---------------------------------------------------- | ------------ |
| `01` | Handball             | Chrono + période + timeouts                          | 33           |
| `02` | Handball             | Scores Home/Guest                                    | 34           |
| `03` | Handball             | Temps de pénalité joueurs                            | 34-35        |
| `04` | Handball             | Indicateurs timeout + chrono timeout                 | 35           |
| `06` | Volleyball           | Snapshot complet set (scores, sets gagnés, timeouts) | 51           |
| `07` | Volleyball           | Chrono                                               | 52           |
| `08` | Volleyball           | Scores des sets terminés                             | 53           |
| `10` | Foot/rugby/beach     | Chrono + score + période                             | 45           |
| `11` | Hockey / Floorball   | Chrono + score + période                             | 37, 41       |
| `12` | Hockey / Floorball   | Pénalités joueurs 1 & 2 Home                         | 38, 42       |
| `13` | Hockey / Floorball   | Pénalités joueurs 1 & 2 Guest                        | 38, 42       |
| `14` | Hockey / Floorball   | Pénalités joueur 3 des deux équipes                  | 39, 43       |
| `15` | Hockey / Floorball   | Numéros des joueurs pénalisés                        | 40, 43       |
| `16` | Hockey / Floorball   | Timeouts + chrono timeout                            | 40, 44       |
| `18` | Basketball (+ 3x3)   | Chrono + période + nombre de timeouts                | 18-19, 28-29 |
| `19` | Basketball (+ 3x3)   | Chrono timeout + indicateurs timeout                 | 22, 32       |
| `20` | Basketball           | Heure locale (horloge murale)                        | 27           |
| `21` | Table tennis         | Sets + score set courant                             | 49           |
| `22` | Table tennis         | Chrono (heures+minutes)                              | 50           |
| `26` | Tennis               | Set courant + jeux + points                          | 47           |
| `27` | Tennis               | Scores des sets terminés                             | 48           |
| `30` | Basketball (+ 3x3)   | Scores Home/Guest                                    | 21, 31       |
| `31` | Basketball (+ 3x3)   | Fautes persos + fautes d'équipe                      | 21, 31       |
| `32` | Basketball           | Fautes persos tous joueurs Guest                     | 22-23        |
| `33` | Basketball           | Fautes persos tous joueurs Home                      | 24           |
| `34` | Basketball           | Fautes persos tous joueurs Guest (doublon 32)        | 24           |
| `36` | Basketball (+ 3x3)   | Chrono en 1/10e de seconde (dernière minute)         | 20, 30       |
| `37` | Basketball           | Numéros maillot joueurs Home (30 lignes)             | 25           |
| `38` | Basketball           | Numéros maillot joueurs Guest                        | 25-26        |
| `41` | Badminton            | Sets + scores courants                               | 15           |
| `42` | Badminton            | Chrono                                               | 16           |
| `43` | Badminton            | Sets précédents                                      | 17           |
| `45` | Futsal               | Chrono + période + scores (inclut 1/10e)             | 46           |
| `50` | Basketball (+ 3x3)   | **Shot clock** (possession 24s)                      | 20, 30       |
| `56` | Basketball           | Score individuel joueur                              | 24           |
| `60` | Basketball (+ 3x3)   | Indicateur bonus par équipe                          | 27, 32       |
| `98` | Tous sports équipe   | Nom équipe Home (18 chars + 4 chars trigramme)       | 26, 35       |
| `99` | Tous sports équipe   | Nom équipe Guest (18 chars + 4 chars trigramme)      | 26, 36       |

### 2.4 Encodage des valeurs

Règles universelles (PDF p.14) :

- **Nombres** : chaque chiffre décimal est transmis comme **un caractère ASCII séparé** (dizaines puis unités). Ex : score 127 = 3 bytes `'1' '2' '7'` = `0x31 0x32 0x37`.
- **Valeur vide / non affichée** : le byte vaut **`0x20`** (espace). Jamais `0x00`.
- **Statuts binaires** : regroupés dans un **"status word"** — 1 octet en début de payload où chaque bit a une sémantique propre (le bit 7 est **toujours à 1** pour éviter que le status word ne soit confondu avec un caractère de contrôle ASCII < 0x20). Détails §2.4.1.
- **Scores ≥ 100** : certains sports utilisent une représentation composite sur **3 bytes** où les centaines sont préfixées par un byte `0x31` ou `0x30`, puis dizaines+unités. Le PDF fournit des tables de correspondance par sport (basket p.21, hockey p.37). À reproduire telle quelle dans le simulateur.

#### 2.4.1 Status word — conventions communes

Le bit 7 est **toujours à 1** pour maintenir la valeur ≥ 0x80. Les bits 0-6 portent les drapeaux. Exemples typiques (basket msg 18, p.18) :

| Bit | Sémantique                                                     |
| --- | -------------------------------------------------------------- |
| b0  | Type d'horloge (0 = game clock, 1 = rest timer entre périodes) |
| b1  | État horloge (0 = ON, 1 = OFF)                                 |
| b2  | Klaxon (0 = OFF, 1 = ON)                                       |
| b4  | Unité du shot clock (0 = secondes, 1 = 1/10e)                  |
| b6  | Statut match (0 = en cours, 1 = nouveau match)                 |
| b7  | Toujours 1                                                     |

**Attention** : le bitmapping change par sport / par message ID (ex: msg 01 handball n'utilise que b0/b1/b2, msg 41 badminton utilise b1 et b4). Toujours re-consulter le PDF par couple (sport, msg ID).

#### 2.4.2 Fautes perso basket — encodage 7-segments (p.22-23)

Les messages 32/33/34 encodent les fautes d'un joueur sur un byte dont le layout correspond à un **afficheur 7-segments allumé** :

```
bit : B7 B6 B5 B4 B3 B2 B1 B0
rôle:  1  G  F  E  D  C  B  A
```

Chaque segment allumé indique une faute. La table exhaustive 0..6 fautes est p.23. **Le simulateur doit reproduire ces codes tel quel** (ex: 2 fautes = `0x8C`, 5 fautes = `0xAF`, 6 fautes = `0xBF`) — il ne s'agit **pas** d'un simple encodage binaire du nombre.

### 2.5 Checksum — LRC

Le LRC est défini p.14 :

```
LRC = XOR de tous les bytes entre SOH (exclu) et ETX (inclus)
LRC = LRC AND 0x7F
IF LRC < 32 (0x20) THEN LRC = LRC + 32
```

L'ajout `+32` si `< 0x20` évite que le LRC coïncide avec un caractère de contrôle ASCII (SOH, STX, ETX eux-mêmes, ou des valeurs qui casseraient des parsers textuels en amont).

**Implication** : le LRC Bodet **n'est pas un XOR standard** — la transformation `AND 0x7F` puis `+32 si < 32` doit être appliquée exactement à l'émission et vérifiée à la réception. Un XOR brut ferait passer ~12 % des trames en faux-négatif.

### 2.6 Trames spéciales

| Événement                       | Représentation Bodet                                                                                                                                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Prolongation**                | Le byte "période" devient `'O'` (lettre O, 0x4F) en basket 3x3 (p.18 note **), `'E'` en handball/hockey/futsal/floorball (p.33, 37, 41, 46 notes **).                                                                   |
| **Dernière minute (< 60s)**     | Le Scorepad commence à émettre le msg **36** (chrono 1/10e) en plus du msg 18. Le msg 18 passe en format alternatif (p.19) où l'offset "secondes" devient SS.d et un byte `0x44` (`'D'`) sert de séparateur décimal.    |
| **Timeout démarré**             | Msg 19 (basket) ou msg 04 (handball) : les indicateurs timeout `Home`/`Guest` alternent entre `0x30 + n` et `0x2F + n` (n = nombre de timeouts restants) pendant le countdown. Timeout arrêté : valeur fixe `0x30 + n`. |
| **Reset match / nouveau match** | Pas de trame dédiée. Le bit **b6 du status word msg 18** passe à 1 (`new match`). Période revient à 1, scores à 0.                                                                                                      |
| **Console OFF / fin de match**  | Pas de trame "fin". Le Scorepad **ferme la connexion TCP** (observation empirique à confirmer — le PDF ne le dit pas).                                                                                                  |
| **Shot clock blanked**          | Msg 50, bit **b3 status word** = 1 (p.20) — le shot clock doit être masqué sur l'overlay.                                                                                                                               |
| **Advantage au tennis**         | Msg 26 bytes 11-12 (home advantage) : `20H 41H` = `' ' 'A'`. Bytes 13-14 pour guest advantage (p.47 note \*\*).                                                                                                         |
| **Fautes persos à effacer**     | Msg 32 avec byte 4 = `0x20` + bytes 5-6 = `0x20 0x20` : signifie "re-initialiser le panneau des fautes" (p.22).                                                                                                         |
| **Indicateur bonus**            | Msg 60, bits b0/b1/b2 du status report par équipe (basket : 5 fautes = bonus ; basket 3x3 : b1 et b2 = bonus 1 / bonus 2).                                                                                              |

### 2.7 Multi-sport — couverture

Couverture officielle (table des matières PDF p.2) :

| Sport                           | Pages | Msgs principaux                                                         |
| ------------------------------- | ----- | ----------------------------------------------------------------------- |
| Badminton                       | 15-17 | 41, 42, 43                                                              |
| Basketball                      | 18-27 | 18, 19, 20, 30, 31, 32, 33, 34, 36, 37, 38, 50, 56, 60, 98, 99          |
| Basketball 3x3                  | 28-32 | 18, 19, 30, 31, 36, 50, 60                                              |
| Handball                        | 33-36 | 01, 02, 03, 04, 98, 99                                                  |
| Ice Hockey                      | 37-40 | 11, 12, 13, 14, 15, 16                                                  |
| Floorball                       | 41-44 | 11, 12, 13, 14, 15, 16 (mêmes IDs que hockey, sport byte `'7'` partagé) |
| Football / Rugby / Beach soccer | 45    | 10                                                                      |
| Futsal                          | 46    | 45                                                                      |
| Tennis                          | 47-48 | 26, 27                                                                  |
| Table tennis                    | 49-50 | 21, 22                                                                  |
| Volleyball                      | 51-53 | 06, 07, 08                                                              |

**Point d'attention** : Hockey et Floorball partagent **le même sport byte `'7'`** (0x37) et les mêmes IDs de messages. **Le connecteur Pi ne peut pas distinguer les deux** depuis le flux seul — la configuration doit être faite côté site (préférence déclarative dans la config du connecteur).

### 2.9 Layouts basket byte-par-byte (extraits PDF officiel 608264 J)

Confiance **Haute** sur tous les layouts ci-dessous : ils sont issus de l'extraction directe du PDF Bodet (p.18-27). Les offsets sont comptés **à partir du byte 0 = premier caractère du message ID ASCII**, c'est-à-dire le premier byte du payload (ce qui suit le CTRL et précède l'ETX).

#### Message 18 — Chrono + période + nombre de timeouts (format normal)

Utilisé tant que chrono ≥ 60s. 13 bytes de payload.

| Offset | Lng | Champ                   | Encodage                                                                                 |
| ------ | --- | ----------------------- | ---------------------------------------------------------------------------------------- |
| 0      | 1   | ID digit 1              | `'1'` (0x31)                                                                             |
| 1      | 1   | ID digit 2              | `'8'` (0x38)                                                                             |
| 2      | 1   | Status word             | voir § 2.4.1 (b7=1, b0 game/rest, b1 ON/OFF, b2 horn, b4 unité shot clock, b6 new match) |
| 3      | 1   | Sport                   | `'5'` (0x35) basket — `'8'` (0x38) pour basket 3x3                                       |
| 4      | 1   | Minutes ×10             | ASCII digit ou `' '` si non-affiché                                                      |
| 5      | 1   | Minutes ×1              | ASCII digit                                                                              |
| 6      | 1   | Secondes ×10            | ASCII digit                                                                              |
| 7      | 1   | Secondes ×1             | ASCII digit                                                                              |
| 8      | 1   | Timeouts restants Home  | ASCII digit                                                                              |
| 9      | 1   | Timeouts restants Guest | ASCII digit                                                                              |
| 10     | 1   | Réservé                 | `' '` (0x20)                                                                             |
| 11     | 1   | Réservé                 | `' '` (0x20)                                                                             |
| 12     | 1   | Période                 | ASCII digit (`'1'..'9'`) ou `'O'` (0x4F) en prolongation                                 |

#### Message 18 — Format alternatif dernière minute (chrono < 60s)

Émis en **parallèle** du msg 36. Même longueur 13 bytes ; les offsets 4-7 sont redéfinis, l'offset 6 devient un séparateur littéral `'D'` (0x44).

| Offset | Lng | Champ                         | Encodage            |
| ------ | --- | ----------------------------- | ------------------- |
| 0-3    | 4   | ID + status + sport           | comme ci-dessus     |
| 4      | 1   | Secondes ×10                  | ASCII digit         |
| 5      | 1   | Secondes ×1                   | ASCII digit         |
| 6      | 1   | Séparateur décimal            | `'D'` (0x44)        |
| 7      | 1   | Secondes ×0.1 (dixièmes)      | ASCII digit         |
| 8-12   | 5   | Timeouts + réservés + période | comme format normal |

#### Message 30 — Scores Home/Guest

9 bytes. Scores encodés sur 3 bytes chacun (centaines/dizaines/unités). Les zéros non-significatifs sont remplacés par `' '` (0x20).

| Offset | Lng | Champ           | Encodage                         |
| ------ | --- | --------------- | -------------------------------- |
| 0      | 1   | ID digit 1      | `'3'` (0x33)                     |
| 1      | 1   | ID digit 2      | `'0'` (0x30)                     |
| 2      | 1   | Sport           | `'5'` (0x35)                     |
| 3      | 1   | Home centaines  | `' '` si <100, sinon ASCII digit |
| 4      | 1   | Home dizaines   | `' '` si <10, sinon ASCII digit  |
| 5      | 1   | Home unités     | ASCII digit                      |
| 6      | 1   | Guest centaines | idem                             |
| 7      | 1   | Guest dizaines  | idem                             |
| 8      | 1   | Guest unités    | ASCII digit                      |

#### Message 31 — Fautes perso + fautes d'équipe (1 joueur à la fois)

11 bytes. Émis à chaque changement de faute. Pour effacer (timeout affichage ~10s), bytes 8-10 passent à `0x20`.

| Offset | Lng | Champ                | Encodage                              |
| ------ | --- | -------------------- | ------------------------------------- |
| 0      | 1   | ID digit 1           | `'3'` (0x33)                          |
| 1      | 1   | ID digit 2           | `'1'` (0x31)                          |
| 2      | 1   | Sport                | `'5'` (0x35)                          |
| 3      | 1   | Réservé              | `0x20` (ignore)                       |
| 4      | 1   | Fautes équipe Home   | ASCII digit 0-9                       |
| 5      | 1   | Réservé              | `0x20` (ignore)                       |
| 6      | 1   | Fautes équipe Guest  | ASCII digit 0-9                       |
| 7      | 1   | N° ligne joueur ×10  | ASCII digit ou `0x20` si blanking     |
| 8      | 1   | N° ligne joueur ×1   | ASCII digit ou `0x20`                 |
| 9      | 1   | Nombre fautes joueur | ASCII digit ou `0x20`                 |
| 10     | 1   | Équipe joueur        | `'1'` (0x31) Home, `'2'` (0x32) Guest |

#### Message 36 — Chrono 1/10e (dernière minute)

5 bytes seulement (pas de status word, pas de sport byte — exception au format général).

| Offset | Lng | Champ         | Encodage     |
| ------ | --- | ------------- | ------------ |
| 0      | 1   | ID digit 1    | `'3'` (0x33) |
| 1      | 1   | ID digit 2    | `'6'` (0x36) |
| 2      | 1   | Secondes ×10  | ASCII digit  |
| 3      | 1   | Secondes ×1   | ASCII digit  |
| 4      | 1   | Secondes ×0.1 | ASCII digit  |

#### Message 50 — Shot clock (possession)

5 bytes. Format varie selon b4 du status word (secondes vs 1/10e).

| Offset | Lng | Champ             | Encodage (b4=0)                                | Encodage (b4=1)      |
| ------ | --- | ----------------- | ---------------------------------------------- | -------------------- |
| 0      | 1   | ID digit 1        | `'5'` (0x35)                                   | idem                 |
| 1      | 1   | ID digit 2        | `'0'` (0x30)                                   | idem                 |
| 2      | 1   | Status word       | b1 ON/OFF, b2 horn, b3 blanked, b4 unité, b7=1 | idem                 |
| 3      | 1   | Sec ×10 / Sec ×1  | ASCII digit dizaines                           | ASCII digit unités   |
| 4      | 1   | Sec ×1 / Sec ×0.1 | ASCII digit unités                             | ASCII digit dixièmes |

Quand `b3=1` (shot clock blanked), bytes 3-4 = `0x20`.

#### Message 19 — Chrono timeout + indicateurs timeout

7 bytes.

| Offset | Lng | Champ               | Encodage                                                                  |
| ------ | --- | ------------------- | ------------------------------------------------------------------------- |
| 0      | 1   | ID digit 1          | `'1'` (0x31)                                                              |
| 1      | 1   | ID digit 2          | `'9'` (0x39)                                                              |
| 2      | 1   | Sport               | `'5'` (0x35)                                                              |
| 3      | 1   | Indicateur TO Home  | pendant countdown, alterne `0x2F + n` et `0x30 + n` ; arrêté : `0x30 + n` |
| 4      | 1   | Indicateur TO Guest | idem                                                                      |
| 5      | 1   | Secondes ×10        | ASCII digit (countdown 60→0)                                              |
| 6      | 1   | Secondes ×1         | ASCII digit                                                               |

#### Message 60 — Indicateur bonus par équipe

5 bytes.

| Offset | Lng | Champ        | Encodage                               |
| ------ | --- | ------------ | -------------------------------------- |
| 0      | 1   | ID digit 1   | `'6'` (0x36)                           |
| 1      | 1   | ID digit 2   | `'0'` (0x30)                           |
| 2      | 1   | Sport        | `'5'` (0x35)                           |
| 3      | 1   | Status Home  | status word ; b0=1 si bonus (5 fautes) |
| 4      | 1   | Status Guest | idem                                   |

Note : le PDF ne précise pas explicitement si le status word bonus a b7=1 comme les autres. **Hypothèse retenue** (confiance Moyenne) : b7=1 aussi, pour cohérence avec les autres status words du protocole. À valider en capture.

### 2.8 Sources

- **PDF officiel Bodet** : https://static.bodet-sport.com/images/stories/EN/support/Pdfs/manuals/Scorepad/608264-Network%20output%20and%20protocols-Scorepad.pdf (réf: 608264J, 53 pages). Copie utilisée pendant la rédaction : récupérée via WebFetch, présente dans le cache local (sha256 à recalculer à chaque session).
- **Mobatime.php de Panel2Net** (https://github.com/tomkohler/Panel2Net/blob/master/mobatime.php) — `Mobatime` est en réalité la **marque distribuée par Bodet en Suisse** ; le format décodé est quasi-identique au Scorepad Bodet. Utile pour corroborer l'interprétation du status word et le mapping ID↔sport.

---

## 3. Bodet BT6000 (RS-485 série)

### 3.1 Couche physique

| Paramètre   | Valeur                                               | Confiance                   |
| ----------- | ---------------------------------------------------- | --------------------------- |
| Bus         | RS-485 2 fils sur RJ-45 (paire Data+/Data-)          | Haute (mention communautés) |
| Débit       | Probablement **9600 bps** (aligné Scorepad via Moxa) | Moyenne                     |
| Format UART | 8N1                                                  | Moyenne                     |

### 3.2 Protocole

**Le PDF officiel Scorepad ne documente pas le BT6000**. L'hypothèse de travail (confiance **Moyenne**) est que le BT6000 émet **le même framing applicatif** que le Scorepad (SOH/Address/STX/CTRL/Message/ETX/LRC) sur un canal série physique au lieu de TCP, car :

1. Bodet a historiquement mutualisé ses formats entre générations de consoles.
2. Panel2Net (`mobatime.php`) décode un flux Bodet série avec exactement les mêmes séparateurs `01 7F 02 47` (= SOH + address 0x7F + STX + CTRL 0x47 — voir p.14 du PDF Scorepad).

**À valider avec une vraie console BT6000 avant implémentation**. Si l'hypothèse est fausse, `mobatime.php` reste la seule référence de parsing de masse en production.

### 3.3 Sources

- **Panel2Net/mobatime.php** (https://github.com/tomkohler/Panel2Net/blob/master/mobatime.php) — 641 lignes. Les sous-séquences citées (`33 30 35` = scores, `31 38` = chrono+status+période, `35 30` = shot clock) sont la **projection du message Bodet sur un stream série** où le séparateur applicatif est `01 7F 02 47`. Chaque segment correspond à un message ID ASCII (ex: `31 38` = "18" = chrono basket).
- Pas de PDF BT6000 public trouvé à date.

---

## 4. Zones d'ombre restantes

À valider impérativement sur matériel réel avant déploiement en production client :

### Stramatel

1. **Longueur exacte et layout des messages `0x37`/`0x38`** (points individuels) — actuellement une hypothèse basée sur le parsing indirect de Panel2Net (`substr($homePoints, 19+($i*2)-1, 2)` l.478).
2. **Comportement en hockey/volley/foot** — aucun dump connu pour ces sports. Le layout `0x33` est supposé identique avec champs non pertinents en espaces, mais pas prouvé.
3. **Cadence réelle** — 10 Hz est l'ordre de grandeur, pas une valeur mesurée. Peut impacter le dimensionnement du buffer.
4. **Octets 17, 48-53** — probablement réservés/padding, mais pas confirmé. Un simulateur doit émettre des valeurs plausibles (espaces / zéros) sans présumer qu'elles ne seront jamais lues.
5. **Détection console OFF** — absence de flux vs trame finale ? Nécessite un watchdog côté Pi (timeout N secondes sans `0xF8`).
6. **Encodage "dernière minute"** — l'heuristique `strlen(trim(bytes4-5)) == 1` est fragile. Mesurer sur la vraie console quel champ bascule en format dixième.

### Bodet Scorepad

1. **Keep-alive TCP et comportement de reconnexion** — non documenté dans le PDF. Est-ce que le Scorepad reprend automatiquement si le Pi redémarre ?
2. **Comportement à la fermeture de match** — le Scorepad ferme-t-il la connexion TCP ? Change-t-il de mode ?
3. **Ordre et cadence d'émission des messages** — le PDF liste les messages mais ne dit pas : "à chaque changement d'état, Scorepad émet 18, 19, 30 dans cet ordre à XXms d'intervalle". À mesurer avec un vrai Scorepad.
4. **Status word bits ignorés** — beaucoup de bits notés "ignore" dans le PDF. Certains pourraient en réalité porter de l'information utile (firmware récent, usage non-standard).
5. **Byte "Address"** — le PDF dit "à ignorer". Mais certaines installations multi-consoles pourraient s'en servir pour router (si 2 keypads sur le même réseau). À clarifier.

### Bodet BT6000

1. **Tout est à valider**. Le protocole est supposé similaire au Scorepad mais c'est un reverse-engineering indirect via Panel2Net.
2. **Paramètres série exacts** (débit, parité) — non confirmé.
3. **Existence éventuelle de messages propres au BT6000** absents du Scorepad.

---

## 5. Implications pour le simulateur

### 5.1 Ce qui peut être simulé avec haute fidélité

- **Flux Stramatel `0x33` en basket** — layout de 54 octets, 10 Hz, byte de début `0xF8`. Tous les champs critiques (score, chrono, période, fautes, timeouts, shot clock) sont documentés. Un simulateur peut être fidèle à > 95 % pour du basket FIBA.
- **Flux Bodet Scorepad basket + handball + volley + hockey + tennis** — le framing et tous les messages sont documentés byte par byte dans le PDF officiel. Le simulateur peut être **exhaustif** sur la fidélité protocole.
- **Calcul LRC Bodet** — formule explicite (§ 2.5). Le simulateur peut produire des trames que de vrais consommateurs (logiciels tiers) accepteront sans modification.
- **Trames spéciales Bodet** — tous les cas spéciaux (prolongation, shot clock blanked, bonus, advantage tennis, re-init fautes) sont spécifiés. Simulables telles quelles.

### 5.2 Ce qui restera approximatif

- **Stramatel multi-sport** (hockey/foot/volley) — le simulateur devra faire des hypothèses (ex: "en volley, le champ période encode le numéro de set"). Ces hypothèses doivent être **marquées explicitement** dans la config du simulateur pour pouvoir être corrigées dès qu'on a accès à une vraie console.
- **Cadence et timing Stramatel** — "environ 10 Hz" mais avec du jitter. Le simulateur peut émettre à cadence fixe, la vraie console aura du jitter.
- **Keep-alive TCP Bodet** — comportement à inventer. Choisir un par défaut raisonnable (pas de keep-alive, close-on-match-end) et documenter l'hypothèse.
- **Séquencement Bodet** (quel message après quel autre, à quelle fréquence) — inconnu. Le simulateur doit proposer une stratégie configurable : "ronde complète toutes les 200 ms" vs "push sur événement uniquement".
- **BT6000** — toute la simulation est spéculative tant qu'on n'a pas une vraie console.

### 5.3 Recommandation

Construire le simulateur en **deux couches** :

1. **Couche "protocole pur"** — génère exactement les bytes décrits par une table de champs (source of truth = cette spec). Cette couche peut atteindre la haute fidélité sur les sections marquées "Haute".
2. **Couche "comportement de console"** — modélise les transitions (panier marqué → shot clock reset à 24, timeout → 60s countdown, etc.). Cette couche a une fidélité moindre ; **la marquer "best-effort"** et prévoir un hook pour re-calibrer après capture sur console réelle.

Un premier simulateur focalisé sur **Stramatel basket + Bodet Scorepad basket** couvre > 80 % du besoin PROP-003 avec une fidélité acceptable pour développer et tester les connecteurs Pi sans matériel.

---

## 6. Références

### GitHub — code source

- **Panel2Net** (tomkohler, PHP/Python, en production 2017+) :
  - `stramatel.php` — https://github.com/tomkohler/Panel2Net/blob/master/stramatel.php
  - `mobatime.php` — https://github.com/tomkohler/Panel2Net/blob/master/mobatime.php
  - `listener.py` — https://github.com/tomkohler/Panel2Net/blob/master/listener.py (listener TCP port 4000 qui forwarde en HTTP ; **n'implémente pas** la lecture série — démenti PROP-003 qui le citait)
  - Dumps de trames réelles : `Stramatel_GEN_HEL_20171125.txt`, `mobatime_lausanne_massagno.txt`
  - Spec basketball (Word) : `2017-10-09 Spec Basketball Panel Data Handling V9.docx`
- **BaSta-LedControl** (christianduerselen, Arduino, Stramatel uniquement) : https://github.com/christianduerselen/BaSta-LedControl — à ouvrir manuellement pour détail du layout fautes individuelles.
- **Favero_Repeater** (vehemont, non utilisé dans cette spec) : https://github.com/vehemont/Favero_Repeater.

### Documentation constructeur

- **Bodet Scorepad Network Protocol PDF** (réf 608264J) : https://static.bodet-sport.com/images/stories/EN/support/Pdfs/manuals/Scorepad/608264-Network%20output%20and%20protocols-Scorepad.pdf. **Source principale** de toute la section 2.

### Interne MadXP

- `docs/proposals/PROP-003-score-live-multi-vendor.md` — proposition dont cette spec est l'annexe.
- `raspberry/scripts/poc-stramatel/test-stramatel-listener.js` — POC listener fonctionnel, incorpore le layout § 1.4 partiellement.

### Corrections à reporter dans PROP-003

1. Ligne ~506 : `baudRate: 19200` pour Bodet série → devrait être **`9600`** (aligné config Moxa officielle et mobatime.php).
2. Ligne ~249-251 : `BodetConnector` appelant `net.Socket().connect(host, port)` → **inverser**, le Scorepad est client TCP, le Pi doit être **server** (`net.createServer()` en écoute sur 4001).
3. Description des types Stramatel `0x37`/`0x38` comme "messages principaux alternatifs" → ce sont en fait des **messages stats individuelles joueur**, pas des variantes de `0x33`. Le seul message "état de match" est `0x33`.
