# Guide : Personnaliser l'overlay du score

Ce guide explique comment modifier l'apparence de l'overlay du score affiché sur les TV pendant les matchs.

---

## Deux modes de personnalisation

### Mode 1 : Via Central Dashboard (paramètres serveur)

Configuration centralisée, déployée sur le Raspberry Pi.

**Prérequis** :

- Accès au **Central Dashboard** (https://neopro-central-production.up.railway.app)
- Le site doit avoir l'option **"Score en Live"** activée

**Étapes** :

1. Se connecter au Central Dashboard
2. Aller dans **Sites** → Cliquer sur le site
3. Activer **"Score en Live"** dans Options Premium
4. Cliquer sur **"Personnaliser l'apparence"**
5. Choisir le **thème** (Broadcast ou Minimal) et la **position** (6 positions)
6. Cliquer sur **"Déployer sur le boîtier"**

---

### Mode 2 : Via Télécommande (paramètres locaux)

Configuration locale depuis la télécommande, stockée en localStorage.

**Avantages** :

- Modification instantanée sans déploiement
- Fonctionne hors ligne
- Parfait pour ajustements rapides pendant un match
- Support multi-sport avec périodes automatiques
- Logos d'équipes

**Accès** :

1. Ouvrir la télécommande (http://neopro.local/remote)
2. Cliquer sur l'onglet **"Options"** (icône engrenage)

---

## Paramètres disponibles

### Paramètres communs (Central Dashboard + Télécommande)

| Paramètre    | Description                                         |
| ------------ | --------------------------------------------------- |
| **Thème**    | Broadcast (style TV pro) ou Minimal (score discret) |
| **Position** | 6 positions (haut/bas × gauche/centre/droite)       |

### Paramètres exclusifs télécommande

| Paramètre            | Description                                               |
| -------------------- | --------------------------------------------------------- |
| **Sport**            | Football, Basketball, Handball, Volleyball, Rugby, Hockey |
| **Période**          | Automatique selon le sport (mi-temps, quarts, sets...)    |
| **Logos équipes**    | Upload depuis la télécommande (max 500KB)                 |
| **Animation de but** | 3 styles : Popup, Fullscreen, Slide + son                 |
| **Timer**            | Chronomètre intégré au score ou standalone                |
| **Breaking News**    | Bandeau info défilant (scroll)                            |

---

## Thèmes disponibles

| Thème         | Style                                             | Usage recommandé          |
| ------------- | ------------------------------------------------- | ------------------------- |
| **Broadcast** | Style TV pro (ESPN/BeIN), fond sombre, grille CSS | Matchs en live, streaming |
| **Minimal**   | Score discret, fond semi-transparent, ultra-léger | Contenu vidéo prioritaire |

### Thème Broadcast

Structure broadcast professionnelle en CSS Grid :

- **Barre principale** : Nom domicile | Score | Nom extérieur
- **Barre info** (sous le score) : Période + Timer
- Logos d'équipes intégrés (si définis)
- Fond `rgba(15,15,20,0.92)` avec backdrop-filter
- Typographie tabular-nums pour alignement stable des chiffres

### Thème Minimal

Score ultra-discret :

- Affichage `score - score` uniquement
- Timer optionnel à côté du score
- Fond semi-transparent `rgba(0,0,0,0.55)`

---

## Positions disponibles

L'overlay peut être placé sur 6 positions de l'écran :

| Position    | Code CSS        |
| ----------- | --------------- |
| Haut gauche | `top-left`      |
| Haut centre | `top-center`    |
| Haut droite | `top-right`     |
| Bas gauche  | `bottom-left`   |
| Bas centre  | `bottom-center` |
| Bas droite  | `bottom-right`  |

**Priorité** : Position télécommande > Position Central Dashboard > Défaut (`top-right`)

---

## Fonctionnalités télécommande

### Timer / Chronomètre

- **Start** : Démarre le chronomètre
- **Pause** : Met en pause (garde le temps)
- **Reset** : Remet à zéro
- **Affichage** : Intégré à l'overlay score si actif, sinon overlay standalone
- **Sync** : Synchronisation TV automatique toutes les 5 secondes

### Breaking News

- **Mode** : Texte défilant horizontalement (animation 15s)
- **Position** : Haut ou bas de l'écran
- **Messages rapides** : Messages prédéfinis pour envoi en un clic

### Animation de But (Goal Animation)

Quand le score change, une animation se déclenche automatiquement :

**3 styles disponibles** :

| Style          | Description                               |
| -------------- | ----------------------------------------- |
| **Popup**      | Animation centrale avec effet scale       |
| **Fullscreen** | Plein écran spectaculaire avec "BUUUUT !" |
| **Slide**      | Bandeau glissant depuis la gauche         |

**Options** :

- **Durée** : 2 à 6 secondes
- **Son** : Activable (son différent par sport)
- L'équipe qui marque est mise en surbrillance (jaune)

---

## Sports supportés

| Sport      | Périodes                                       | Durée timer |
| ---------- | ---------------------------------------------- | ----------- |
| Football   | 1ère/2ème mi-temps, Prolongations, Tirs au but | 45 min      |
| Basketball | 4 quart-temps + Prolongation                   | 10 min      |
| Handball   | 1ère/2ème mi-temps, Prolongations              | 30 min      |
| Volleyball | 5 Sets                                         | 25 min      |
| Rugby      | 1ère/2ème mi-temps, Prolongations              | 40 min      |
| Hockey     | 3 périodes + Prolongation + Tirs au but        | 20 min      |

Changer le sport met automatiquement à jour les périodes et la durée du timer.

---

## Migration depuis l'ancienne version

Si vous aviez configuré l'overlay avec l'ancienne version (v1), vos paramètres sont automatiquement migrés :

| Ancien paramètre                  | Migration                        |
| --------------------------------- | -------------------------------- |
| Template `sportif` ou `elegant`   | → `broadcast`                    |
| Template `minimal`                | Conservé tel quel                |
| Couleurs personnalisées (overlay) | Supprimées (thèmes CSS intégrés) |
| Présets sauvegardés               | Supprimés (plus nécessaires)     |
| Mode breaking news `truncate`     | → `scroll`                       |
| Positions `middle-*`              | → `top-right` (défaut)           |

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
