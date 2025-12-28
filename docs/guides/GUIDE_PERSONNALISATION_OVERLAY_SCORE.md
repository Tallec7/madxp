# Guide : Personnaliser l'overlay du score

Ce guide explique comment modifier l'apparence de l'overlay du score affiché sur les TV pendant les matchs.

---

## Deux modes de personnalisation

### Mode 1 : Via Central Dashboard (paramètres serveur)

Configuration centralisée, déployée sur le Raspberry Pi.

**Prérequis** :

- Accès au **Central Dashboard** (https://neopro-central.onrender.com)
- Le site doit avoir l'option **"Score en Live"** activée

**Étapes** :

1. Se connecter au Central Dashboard
2. Aller dans **Sites** → Cliquer sur le site
3. Activer **"Score en Live"** dans Options Premium
4. Cliquer sur **"Personnaliser l'apparence"**
5. Ajuster les paramètres, vérifier l'aperçu
6. Cliquer sur **"Déployer sur le boîtier"**

---

### Mode 2 : Via Télécommande (paramètres locaux) - NOUVEAU

Configuration locale depuis la télécommande, stockée en localStorage.

**Avantages** :

- ✅ Modification instantanée sans déploiement
- ✅ Fonctionne hors ligne
- ✅ Parfait pour ajustements rapides pendant un match

**Accès** :

1. Ouvrir la télécommande (http://neopro.local/remote)
2. Cliquer sur l'onglet **"Options"** (icône engrenage)

---

## Paramètres disponibles

### Paramètres communs (Central Dashboard + Télécommande)

| Paramètre               | Description                             |
| ----------------------- | --------------------------------------- |
| **Position**            | Coin de l'écran (9 positions possibles) |
| **Couleur du score**    | Couleur des chiffres du score           |
| **Taille du score**     | Taille des chiffres (16-72px)           |
| **Couleur des équipes** | Couleur des noms d'équipe               |
| **Taille noms équipes** | Taille des noms (10-36px)               |
| **Arrondi des coins**   | Courbure (0 = carré, 50 = très arrondi) |

### Paramètres exclusifs télécommande

| Paramètre         | Description                                             |
| ----------------- | ------------------------------------------------------- |
| **Template**      | Style prédéfini (Sportif, Élégant, Minimal)             |
| **Timer**         | Chronomètre intégré avec Start/Pause/Reset              |
| **Breaking News** | Bandeau info avec 3 modes (scroll, truncate, multiline) |

---

## Templates disponibles (télécommande)

| Template    | Style                                | Usage recommandé          |
| ----------- | ------------------------------------ | ------------------------- |
| **Sportif** | Gradient bleu, couleurs vives        | Matchs dynamiques         |
| **Élégant** | Gradient gris, épuré                 | Événements formels        |
| **Minimal** | Noir semi-transparent, ultra-discret | Contenu vidéo prioritaire |

---

## Fonctionnalités télécommande

### Timer / Chronomètre

- **Start** : Démarre le chronomètre
- **Pause** : Met en pause (garde le temps)
- **Reset** : Remet à zéro
- **Affichage** : Intégré à l'overlay score si actif, sinon overlay standalone
- **Sync** : Synchronisation TV automatique toutes les 5 secondes

### Breaking News

- **Mode scroll** : Texte défile horizontalement (animation 15s)
- **Mode truncate** : Texte tronqué avec "..."
- **Mode multiline** : Texte multi-lignes
- **Position** : Haut ou bas de l'écran

### Goal Popup

Quand vous cliquez sur "+1" pour le score :

- Animation centrale pendant 3 secondes
- Effet scale + pulse
- Affiche le nouveau score

---

## Valeurs recommandées

### Pour un affichage discret

- Position : Bas droite
- Distance horizontale : 30px
- Distance verticale : 30px
- Taille du score : 24px
- Taille noms équipes : 14px

### Pour un affichage bien visible

- Position : Haut droite
- Distance horizontale : 20px
- Distance verticale : 20px
- Taille du score : 36px
- Taille noms équipes : 20px

### Couleurs populaires pour le score

- Vert : `#4caf50`
- Jaune : `#ffc107`
- Rouge : `#f44336`
- Bleu : `#2196f3`
- Blanc : `#ffffff`

---

## Dépannage

### L'overlay ne change pas après le déploiement

- Vérifier que le site est **en ligne** (indicateur vert)
- Attendre quelques secondes, l'application peut prendre un moment à recharger

### Je ne vois pas le bouton "Personnaliser l'apparence"

- Activer d'abord le toggle **"Score en Live"** dans les Options Premium

### Le site est hors ligne

- Les modifications seront appliquées automatiquement à la prochaine connexion du site

---

## Questions ?

Contacter l'équipe technique NEOPRO.
