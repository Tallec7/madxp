# SPEC PRODUIT — Page "Création de Contenu"

## Dashboard Central NEOPRO — Module Lottie V1

**Version :** 1.1
**Date :** 1er avril 2026
**Statut :** Draft — À valider par Gwenvael & Gabin
**Scope :** Usage interne admin NEOPRO uniquement
**Réf. technique :** [PROP-009](./PROP-009-motion-design-personnalise.md) (analyse Lottie vs Plainly)

---

## 1. Pourquoi cette feature ?

Aujourd'hui, créer une animation personnalisée pour un club prend 2 heures : Gabin ouvre After Effects, intègre les données du club, exporte, déploie manuellement. Ce processus fonctionne à 3 clubs. Il ne fonctionnera pas à 30.

L'objectif de cette page est simple : permettre à n'importe quel admin NEOPRO de créer et déployer un contenu personnalisé en moins de 5 minutes, sans toucher à After Effects.

C'est aussi la brique fondatrice du self-service club — quand les clubs pourront faire ça eux-mêmes en V2.

---

## 2. Qui utilise cette page ?

Uniquement les deux fondateurs NEOPRO dans un premier temps.

**Gwenvael** (super_admin) — prépare les contenus avant match, supervise les déploiements à distance.
**Gabin** (admin) — valide le rendu visuel, déploie après avoir créé un nouveau template.

Usage sur desktop uniquement. Contexte : en amont des matchs, lors de la configuration d'un nouveau club.

---

## 3. Ce que fait la page — vue d'ensemble

La page se déroule en 5 étapes naturelles :

**Étape 1 — Choisir un site**
L'admin sélectionne le club cible dans un menu déroulant en haut de la page. Ce sélecteur affiche le nom du club, son statut (en ligne / hors ligne) et la date de dernière connexion. C'est ce choix qui détermine vers quel Raspberry Pi le contenu sera envoyé et quelles informations seront pré-remplies dans le formulaire.

> Note : il n'existe pas de notion de "club actif" global dans le dashboard aujourd'hui. Chaque page travaille sur un site spécifique. Cette page suit le même principe avec son propre sélecteur.

**Étape 2 — Choisir un template**
L'admin choisit dans une bibliothèque d'animations disponibles (Buteur, Carton, Temps-mort, Intro match...). Chaque template est présenté avec une image de prévisualisation et le nom des informations qu'il faut renseigner.

**Étape 3 — Remplir les informations**
Un formulaire simple apparaît avec uniquement les champs nécessaires au template choisi. Le nom du club et sa couleur sont déjà pré-remplis depuis les données du site sélectionné. L'admin n'a plus qu'à entrer les données spécifiques au match (nom du joueur, numéro de maillot, etc.).

**Étape 4 — Vérifier le rendu**
L'animation se joue en temps réel dans la page, au format exact de l'écran gymnase (16:9, fond noir). L'admin voit exactement ce que verra le public. Il peut rejouer autant de fois que nécessaire.

**Étape 5 — Déployer sur le boîtier**
Un bouton envoie le contenu sur le Raspberry Pi du club sélectionné. Si le boîtier est connecté, c'est immédiat. Sinon, le contenu est mis en attente et se synchronise automatiquement dès que le boîtier se reconnecte.

---

## 4. Les templates disponibles au lancement

Gabin a déjà produit certains templates, d'autres sont à venir. Au lancement de la feature, voici l'état prévu :

| Template       | Événement          | Infos nécessaires                   | Disponible |
| -------------- | ------------------ | ----------------------------------- | ---------- |
| Annonce Buteur | But marqué         | Nom, prénom, numéro, club, couleur  | Oui        |
| Carton Jaune   | Sanction           | Nom, prénom, numéro, club           | Oui        |
| Carton Rouge   | Exclusion          | Nom, prénom, numéro, club           | Oui        |
| Temps-Mort     | Pause de jeu       | Nom du club, couleur                | Oui        |
| Intro Match    | Entrée des équipes | Nom du club, adversaire, couleur    | Oui        |
| Spot Sponsor   | Diffusion pub      | Nom sponsor, accroche, couleur club | A venir    |
| Mi-Temps       | Pause mi-match     | Clubs, score                        | A venir    |

Les templates "A venir" apparaissent dans la bibliothèque mais ne sont pas activables.

---

## 5. Les informations personnalisables

Voici l'ensemble des variables que les templates peuvent utiliser. Chaque template n'en utilise qu'une partie.

| Information                | Exemple                      | Remarque                               |
| -------------------------- | ---------------------------- | -------------------------------------- |
| Nom du joueur              | DUPONT                       | Majuscules automatiques                |
| Prénom du joueur           | Lucas                        |                                        |
| Numéro de maillot          | 7                            | Entre 1 et 99                          |
| Nom du club                | NARH                         | Pré-rempli depuis le site sélectionné  |
| Couleur principale du club | #E63946                      | Pré-remplie depuis le site, modifiable |
| Nom de l'équipe adverse    | RACC                         | Optionnel selon template               |
| Score domicile / extérieur | 2 / 1                        | Optionnel selon template               |
| Nom du sponsor             | Garage Dupont                | Pour les templates sponsors            |
| Accroche sponsor           | Votre garagiste de confiance | 60 caractères max                      |

Le nom et la couleur du club sont pré-remplis depuis les données du site sélectionné à l'étape 1. L'admin peut les modifier manuellement pour les cas particuliers (tournoi avec une équipe invitée par exemple).

---

## 6. Règles importantes

**Le formulaire bloque si incomplet.**
Impossible de déployer tant que tous les champs obligatoires ne sont pas remplis ET qu'un site est sélectionné. La prévisualisation, elle, fonctionne même avec des champs vides (elle affiche des placeholders).

**Chaque déploiement est indépendant.**
L'admin peut déployer plusieurs contenus du même type sur un boîtier. Pendant un match de handball, il y a plusieurs buteurs — chaque "Annonce Buteur" est un contenu distinct. Pas de remplacement automatique.

**Boîtier hors ligne = pas de blocage.**
L'admin peut préparer et envoyer un contenu même si le boîtier du club est hors ligne. Le contenu attend dans la file d'attente existante du système et se synchronise à la prochaine connexion. L'interface indique clairement cet état.

**Usage admin uniquement.**
Les clubs n'ont pas accès à cette page en V1. Seuls les rôles `super_admin` et `admin` y accèdent.

---

## 7. Comment le contenu s'affiche sur le Pi

Une fois déployé, le contenu Lottie est stocké localement sur le Pi. Mais comment est-il joué sur l'écran du gymnase ?

**C'est une décision technique à prendre avant le développement.** Deux options existent :

**Option A — Le Pi joue l'animation directement (recommandée)**
Le fichier JSON Lottie est joué dans le navigateur du Pi via la librairie lottie-web, comme dans la prévisualisation du dashboard. L'avantage : c'est léger (quelques Ko), instantané, et le rendu est identique à la preview. L'inconvénient : le Pi ne joue aujourd'hui que des vidéos MP4 — il faut ajouter un nouveau type de contenu dans le player.

**Option B — Le serveur génère une vidéo MP4**
Le serveur convertit le Lottie en vidéo classique avant de l'envoyer au Pi. Avantage : zéro changement côté Pi (il reçoit un MP4 comme d'habitude). Inconvénient : il faut une infrastructure de rendu côté serveur et un délai de génération.

> PROP-009 (doc technique existante) détaille ces deux options. Le test de faisabilité prévu en Phase 1 de PROP-009 (Gabin exporte un template, on teste le rendu lottie-web) tranchera.

---

## 8. Comment la lecture est déclenchée

Le déploiement met le contenu à disposition sur le Pi. Mais quand est-ce que l'animation s'affiche à l'écran ?

**En V1, la lecture est déclenchée manuellement par l'admin via la télécommande cloud.** Le flux est :

1. L'admin déploie le contenu "Annonce Buteur — DUPONT #7" sur le Pi du NARH
2. Pendant le match, au moment du but, l'admin ouvre la télécommande cloud du NARH
3. Il sélectionne l'animation à jouer parmi les contenus disponibles
4. L'animation se joue à l'écran (par-dessus ou à la place de la boucle en cours)
5. À la fin de l'animation (ex: 5 secondes), la boucle normale reprend automatiquement

L'intégration dans la boucle automatique de vidéos (diffusion programmée sans intervention) est prévue pour la V2.

> Point ouvert : faut-il un nouveau bouton dans la télécommande cloud pour les contenus Lottie, ou les intégrer dans la liste des actions existantes ? À trancher au sprint 1.

---

## 9. Ce que cette page ne fait pas (V1)

Pour garder la V1 simple et livrable rapidement, plusieurs fonctionnalités sont volontairement exclues.

- Les admins ne peuvent pas uploader ou modifier des templates depuis la page
- Il n'y a pas d'historique des contenus déployés
- Il n'est pas possible de créer plusieurs contenus en une seule fois (un par un uniquement)
- Il n'y a pas de planification (programmer un déploiement à une heure donnée)
- Remotion (génération de vraies vidéos MP4 avec photos) n'est pas inclus — c'est la V2
- Pas de support du double écran (le Lottie ne s'affiche que sur l'écran principal en V1)

---

## 10. Ce qu'il faut avoir avant de démarrer le développement

Avant de confier cette spec à un développeur, voici les prérequis et leur état actuel :

### Prérequis 1 — Les fichiers Lottie de Gabin

**Statut : A fournir par Gabin**

Gabin doit fournir les 5 fichiers d'animation (.json exportés via Bodymovin depuis After Effects) avec une documentation des "zones modifiables" dans chaque fichier. Concrètement, un tableau comme :

| Zone dans l'animation | Nom technique du layer | Ce qu'on y met     |
| --------------------- | ---------------------- | ------------------ |
| Texte du nom          | `text_layer_nom`       | Le nom du joueur   |
| Couleur du bandeau    | `color_layer_primary`  | La couleur du club |

Sans cette documentation, le développeur ne peut pas relier le formulaire à l'animation. La convention de nommage des layers doit être définie avec le dev avant l'export.

### Prérequis 2 — Les images de prévisualisation

**Statut : A fournir par Gabin**

Une image fixe représentative par template, au format 16:9 (ex: 640x360), pour l'affichage dans la bibliothèque.

### Prérequis 3 — La couleur du club en base de données

**Statut : A créer (migration simple)**

Le champ `primary_color` n'existe pas aujourd'hui dans les données d'un site. Il faut l'ajouter dans le champ `metadata` existant (pas besoin de modifier le schéma de la base). Il faut aussi un champ de saisie dans les réglages du site pour que l'admin puisse renseigner la couleur de chaque club.

### Prérequis 4 — Le pipeline de déploiement Lottie

**Statut : A construire (travail dev)**

Le système de synchronisation actuel déploie des vidéos MP4 via FTP + Socket.IO. Le Lottie est un nouveau type de contenu — il faut un nouveau canal de déploiement : stockage du JSON, nouvel événement Socket.IO (`deploy_lottie`), handler côté Pi pour réceptionner et stocker le fichier.

En revanche, la **file d'attente pour les boîtiers hors ligne existe déjà** (table `pending_commands` avec priorité et expiration). Il suffit d'ajouter un nouveau type de commande.

### Prérequis 5 — Décision Option A ou B (§7)

**Statut : A trancher après le test PROP-009 Phase 1**

Le test de faisabilité Lottie (Gabin exporte, on teste le rendu dans un navigateur) doit être fait avant de démarrer le dev. Il conditionne l'architecture côté Pi.

---

## 11. Critères de succès

La feature est considérée comme livrée quand :

- Un admin peut passer de "aucun template sélectionné" à "contenu déployé sur le boîtier" en moins de 5 minutes
- L'animation prévisualisée dans la page est identique à ce qui s'affiche sur l'écran du gymnase
- Un contenu peut être préparé et mis en file d'attente même quand le boîtier est hors ligne
- Le contenu déployé en file d'attente se synchronise automatiquement à la reconnexion du Pi
- Aucune intervention de Gabin dans After Effects n'est nécessaire pour les templates disponibles
- La lecture du contenu est déclenchable depuis la télécommande cloud

---

_Document vivant. Toute évolution de périmètre doit être validée avant le démarrage du développement._
