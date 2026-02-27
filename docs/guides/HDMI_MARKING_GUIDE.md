# Guide de marquage physique des ports HDMI

> E-23 US-23.5.6 — Guide d'installation pour les techniciens terrain

## Objectif

Les Raspberry Pi 4 et 5 disposent de deux sorties HDMI. Le port **HDMI-0** (le plus proche du port USB-C / alimentation) est le port principal. Brancher l'ecran sur le mauvais port provoque un mode degrade avec auto-swap.

Ce guide decrit comment marquer physiquement les ports pour eviter les erreurs d'installation.

## Identification des ports

### Raspberry Pi 5

```
       ╔═══════════════════════════════════════╗
       ║                                       ║
USB-C  ║   [HDMI-0]    [HDMI-1]    [USB] [USB]║
(alim) ║   PRINCIPAL    SECONDAIRE             ║
       ║                                       ║
       ╚═══════════════════════════════════════╝
```

- **HDMI-0** : Port le plus proche de l'alimentation USB-C (a gauche)
- **HDMI-1** : Port suivant (a droite de HDMI-0)

### Raspberry Pi 4

```
       ╔═══════════════════════════════════════╗
       ║                                       ║
USB-C  ║  [micro-HDMI-0] [micro-HDMI-1]       ║
(alim) ║  PRINCIPAL       SECONDAIRE           ║
       ║                                       ║
       ╚═══════════════════════════════════════╝
```

- **micro-HDMI-0** : Port le plus proche de l'alimentation USB-C
- **micro-HDMI-1** : Port suivant

## Materiel de marquage recommande

| Materiel                              | Usage                            | Reference              |
| ------------------------------------- | -------------------------------- | ---------------------- |
| Etiquettes autocollantes vertes (8mm) | Port HDMI-0 (principal)          | Dymo / Brother P-touch |
| Etiquettes autocollantes orange (8mm) | Port HDMI-1 (secondaire)         | Dymo / Brother P-touch |
| Marqueur indelebile vert              | Alternative si pas d'etiqueteuse | Staedtler Lumocolor    |
| Gaine thermoretractable verte         | Sur le cable HDMI principal      | 6mm diametre           |

## Procedure de marquage

### 1. Marquer le boitier Pi

1. Coller une etiquette **verte** a cote du port HDMI-0 avec le texte `TV`
2. Coller une etiquette **orange** a cote du port HDMI-1 avec le texte `2nd` (optionnel, seulement si dual-display actif)

### 2. Marquer les cables

1. Enfiler une gaine thermoretractable **verte** (3 cm) sur le cable HDMI principal
2. Chauffer la gaine pour la fixer a 10 cm du connecteur
3. Si dual-display : utiliser une gaine **orange** pour le cable secondaire

### 3. Marquer le boitier/coffret

Si le Pi est installe dans un coffret :

1. Coller une etiquette sur l'exterieur du coffret :
   ```
   NEOPRO - [Nom du club]
   HDMI VERT = TV PRINCIPALE
   HDMI ORANGE = ECRAN 2 (optionnel)
   ```

## Verification apres installation

1. Brancher le cable marque **vert** sur le port marque **vert** (HDMI-0)
2. Demarrer le Pi et verifier sur `neopro.local` :
   - HDMI-0 : Connecte (vert)
   - Pas d'alerte "mauvais port"
3. Si dual-display active, brancher le cable **orange** sur le port **orange** (HDMI-1)

## Comportement en cas d'erreur

Si l'ecran est branche sur le mauvais port (HDMI-1 au lieu de HDMI-0) :

1. La LED du Pi clignote rapidement (200ms on/off)
2. Un message s'affiche a l'ecran : "Ecran branche sur le mauvais port HDMI"
3. Apres 10 secondes, le Pi bascule automatiquement sur HDMI-1
4. Une alerte est envoyee au dashboard central

Le systeme fonctionne quand meme, mais les performances sont optimales avec HDMI-0.

## Photos de reference

> A completer avec des photos des installations terrain

- Photo 1 : Pi 5 avec etiquettes vertes/oranges
- Photo 2 : Cables marques avec gaines thermoretractables
- Photo 3 : Coffret avec etiquette exterieure
