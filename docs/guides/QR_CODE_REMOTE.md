# QR Code Telecommande

Ce guide explique comment generer et utiliser le QR code permettant aux utilisateurs d'acceder facilement a la telecommande du boitier Neopro.

## Fonctionnalite

Le QR code permet aux utilisateurs (staff du club, spectateurs) de scanner directement pour acceder a la telecommande sans avoir a taper l'URL manuellement.

**URL encodee** : `http://neopro.local/remote`

## Generer le QR Code

### Depuis le Dashboard Central

1. Connectez-vous au dashboard central
2. Allez sur la page d'un site (club)
3. Cliquez sur l'onglet **Parametres**
4. Dans la carte **QR Code Telecommande**, cliquez sur **Generer le QR Code**

### Options disponibles

- **Telecharger PNG** : Genere une image haute resolution (format A6 paysage, ~624x500px) prete a imprimer
- **Imprimer** : Ouvre directement la boite de dialogue d'impression du navigateur

## Contenu du document

Le document genere contient :

```
┌─────────────────────────────────┐
│                                 │
│         NOM DU CLUB             │
│        ─────────────            │
│                                 │
│         ┌─────────┐             │
│         │ QR CODE │             │
│         └─────────┘             │
│                                 │
│   Scannez pour la telecommande  │
│                                 │
│   1. Connectez-vous au WiFi     │
│      "NEOPRO-NOMCLUB"           │
│   2. Scannez ce QR code         │
│                                 │
│              NEOPRO             │
└─────────────────────────────────┘
```

## Installation dans le club

### Recommandations

1. **Imprimer en couleur** pour une meilleure lisibilite du QR code
2. **Plastifier** le document pour le proteger
3. **Placer pres de la TV** ou dans un endroit visible (comptoir, bar, entree)
4. **Format A6 ou A5** recommande (pas besoin de plus grand)

### Emplacements suggeres

- A cote de la TV principale
- Sur le comptoir d'accueil
- Dans les vestiaires (si acces autorise)
- Sur un chevalet de table au bar

## Fonctionnement pour l'utilisateur

1. **Se connecter au WiFi** du boitier (SSID affiche sur le document)
2. **Scanner le QR code** avec l'appareil photo du telephone
3. **Ouvrir le lien** dans le navigateur
4. **Utiliser la telecommande** pour controler la TV

### Compatibilite

| Appareil         | Support                      |
| ---------------- | ---------------------------- |
| iPhone (iOS 11+) | Camera native                |
| Android (8+)     | Camera native ou Google Lens |
| Anciens Android  | App QR scanner (gratuite)    |

### Note Android

Depuis la version 2.5.0, le captive portal est configure sur les boitiers. Android accepte automatiquement le reseau WiFi et `neopro.local` fonctionne correctement.

Si un utilisateur rencontre des problemes, il peut utiliser l'URL alternative : `http://192.168.4.1/remote`

## SSID WiFi

### Recuperation automatique du SSID reel

Depuis la version 2.21, le dashboard recupere automatiquement le **vrai SSID** configure sur le boitier :

1. Quand vous cliquez sur "Generer le QR Code", le dashboard interroge le Pi
2. Le Pi lit le fichier `/etc/hostapd/hostapd.conf` et renvoie le SSID reel
3. Le QR code affiche ce SSID avec un badge **(reel)** en vert

**Prerequis** : Le site doit etre connecte (online) pour recuperer le SSID reel.

### Fallback : SSID genere

Si le site est offline ou si la recuperation echoue, un SSID est genere automatiquement :

- Format : `NEOPRO-{NOM_CLUB}`
- Caracteres speciaux et accents supprimes
- Limite a 20 caracteres
- Badge **(genere)** en orange

**Exemples** :

- "FC Marseille" → `NEOPRO-FC-MARSEILLE`
- "AS Saint-Etienne" → `NEOPRO-AS-SAINT-ETIENNE`
- "Racing Club de Lens" → `NEOPRO-RACING-CLUB-DE-L`

> **Important** : Si le SSID genere ne correspond pas au SSID reel du boitier, assurez-vous que le site est connecte avant de generer le QR code, ou modifiez le SSID du hotspot via l'onglet Parametres.

## Personnalisation

Le QR code utilise les informations du site :

- **Nom du club** : `club_name` ou `site_name` du site
- **SSID** : Genere depuis le nom du club

Pour modifier ces informations, editez le site dans le dashboard central.

## Depannage

### Le QR code ne scanne pas

- Verifiez que l'image est nette et non deformee
- Essayez avec une autre application de scan
- Augmentez la luminosite de l'ecran si affiche numeriquement

### L'URL ne fonctionne pas apres scan

- Verifiez que l'utilisateur est bien connecte au WiFi du boitier
- Sur Android, desactiver les donnees mobiles peut aider
- Utiliser l'URL alternative `http://192.168.4.1/remote`

### Le WiFi n'apparait pas

- Verifiez que le boitier est allume et operationnel
- Le hotspot peut mettre quelques secondes a apparaitre apres le demarrage

## Voir aussi

- [Configuration Hotspot](./CONFIGURATION.md#hotspot-wifi)
- [Problemes Android](./ANDROID_HOTSPOT_FIX.md)
- [Guide Utilisateur](./GUIDE_UTILISATEUR.md)
