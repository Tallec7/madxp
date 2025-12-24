# Guide : Personnaliser l'overlay du score

Ce guide explique comment modifier l'apparence de l'overlay du score affiché sur les TV pendant les matchs.

---

## Prérequis

- Accès au **Central Dashboard** (https://neopro-central.onrender.com)
- Le site doit avoir l'option **"Score en Live"** activée

---

## Étapes

### 1. Accéder au site

1. Se connecter au Central Dashboard
2. Aller dans **Sites**
3. Cliquer sur le site à modifier

### 2. Activer le Score en Live (si pas déjà fait)

Dans la section **"Options Premium"**, activer le toggle **"Score en Live"**.

### 3. Ouvrir les paramètres d'apparence

Cliquer sur le bouton **"Personnaliser l'apparence"** qui apparaît sous le toggle.

### 4. Modifier les paramètres

| Paramètre                | Description                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| **Position**             | Coin de l'écran où afficher l'overlay (Haut droite, Haut gauche, Bas droite, Bas gauche) |
| **Distance horizontale** | Espace entre l'overlay et le bord gauche/droit (en pixels)                               |
| **Distance verticale**   | Espace entre l'overlay et le bord haut/bas (en pixels)                                   |
| **Arrondi des coins**    | Courbure des coins de l'overlay (0 = carré, 20+ = très arrondi)                          |
| **Couleur du score**     | Couleur des chiffres du score                                                            |
| **Taille du score**      | Taille des chiffres du score (en pixels)                                                 |
| **Couleur des équipes**  | Couleur des noms d'équipe                                                                |
| **Taille noms équipes**  | Taille des noms d'équipe (en pixels)                                                     |

### 5. Vérifier l'aperçu

L'aperçu en bas du formulaire montre en temps réel à quoi ressemblera l'overlay.

### 6. Déployer

Cliquer sur **"Déployer sur le boîtier"** pour envoyer la configuration au Raspberry Pi.

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
