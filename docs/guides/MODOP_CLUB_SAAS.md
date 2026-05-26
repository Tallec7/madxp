# Mode opératoire — Club MadXP (offre SaaS)

> **Pour qui** : Responsable communication / animateur club + Opérateur matchday
> **Offre couverte** : SaaS (sans boîtier Raspberry Pi — votre TV affiche une page web cloud)
> **Prérequis** : identifiants fournis par MadXP + connexion internet active sur l'écran et sur votre téléphone

---

## Comment fonctionne l'offre SaaS

Avec l'offre SaaS, votre TV affiche simplement une **page web** hébergée par MadXP. Pas de boîtier à brancher, pas de mise à jour matérielle — tout se passe dans le navigateur.

```
Votre navigateur (dashboard)
        ↓ vous gérez le contenu
   Serveur MadXP
        ↓ diffuse en temps réel
   TV du gymnase (navigateur ouvert sur l'URL TV)
        ↑ pilotée par
   Télécommande (smartphone de l'opérateur)
```

**Implication principale** : sans connexion internet sur le poste qui affiche la TV, l'écran est muet. Vérifiez toujours la connexion avant un match.

---

## Sommaire

### Partie A — Gestion quotidienne (Responsable com)

1. [Se connecter au dashboard](#1-se-connecter-au-dashboard)
2. [Vue d'ensemble du portail club](#2-vue-densemble-du-portail-club)
3. [Mon club — tableau de bord et actions rapides](#3-mon-club--tableau-de-bord-et-actions-rapides)
4. [Ouvrir la TV et la télécommande](#4-ouvrir-la-tv-et-la-télécommande)
5. [Gérer le PIN de la télécommande](#5-gérer-le-pin-de-la-télécommande)
6. [Ma boucle — la bibliothèque vidéo](#6-ma-boucle--la-bibliothèque-vidéo)
7. [Gérer les catégories](#7-gérer-les-catégories)
8. [Organiser et activer la boucle](#8-organiser-et-activer-la-boucle)
9. [Mes sponsors](#9-mes-sponsors)
10. [Mes analytics](#10-mes-analytics)
11. [Diagnostic](#11-diagnostic)
12. [Préparer un jour de match](#12-préparer-un-jour-de-match)

### Partie B — Jour du match (Opérateur matchday)

13. [Accéder à la télécommande](#13-accéder-à-la-télécommande)
14. [Créer un raccourci sur le téléphone](#14-créer-un-raccourci-sur-le-téléphone)
15. [Démarrer une session match](#15-démarrer-une-session-match)
16. [Mettre à jour le score en live](#16-mettre-à-jour-le-score-en-live)
17. [Changer ce qui s'affiche à l'écran](#17-changer-ce-qui-saffiche-à-lécran)

### Partie C — Problèmes fréquents

18. [Dépannage](#18-dépannage)

---

# PARTIE A — Gestion quotidienne (Responsable com)

## 1. Se connecter au dashboard

**Adresse** : `https://neopro-admin.kalonpartners.bzh`

1. Ouvrez un navigateur (Chrome ou Safari recommandé)
2. Entrez votre **email** et **mot de passe** fournis par MadXP
3. Cliquez sur **Se connecter** → vous arrivez directement sur **Mon club**

> **Mot de passe oublié ?** Cliquez sur « Mot de passe oublié » sur la page de connexion. Un email de réinitialisation vous sera envoyé.

---

## 2. Vue d'ensemble du portail club

Après connexion, le menu de gauche donne accès à 5 sections :

| Section          | Ce qu'on y fait                                                            |
| ---------------- | -------------------------------------------------------------------------- |
| **Mon club**     | Tableau de bord, KPIs du jour, accès rapide TV + télécommande, gestion PIN |
| **Ma boucle**    | Bibliothèque vidéo, catégories, ordre de diffusion, enregistrement         |
| **Mes sponsors** | Liste des partenaires actifs, impressions, portail sponsor                 |
| **Analytics**    | Historique de diffusion, courbes, performances par vidéo                   |
| **Diagnostic**   | État de l'écran, alertes actives                                           |

---

## 3. Mon club — tableau de bord et actions rapides

La page **Mon club** est votre point d'entrée. Pour un site SaaS elle affiche :

### KPIs en temps réel

| Indicateur                    | Ce que ça signifie                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| **Clients connectés**         | Nombre de navigateurs qui diffusent actuellement votre TV (0 = l'écran est fermé ou hors ligne) |
| **Vidéos jouées aujourd'hui** | Lectures depuis minuit, avec tendance vs hier (↑ ↓ →)                                           |
| **Temps écran aujourd'hui**   | Durée cumulée de diffusion depuis minuit                                                        |
| **Performance semaine**       | Taux de complétion des vidéos + nombre de sponsors affichés                                     |

Sous ces cartes, une **courbe 7 jours** montre l'activité de la semaine. Plus bas : le **profil actif**, le **top 3 vidéos** et les **sponsors actifs**.

> **Rien ne s'affiche ?** Votre boucle est peut-être vide. Cliquez sur **Ma boucle** ou sur le bouton **Gérer la boucle** en bas de la page.

---

## 4. Ouvrir la TV et la télécommande

En haut de **Mon club**, quatre boutons d'action rapide :

| Bouton                        | Action                                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **📺 Ouvrir la TV**           | Ouvre l'URL de votre écran TV dans un nouvel onglet — à utiliser pour configurer ou reconfigurer le poste qui diffuse |
| **🎮 Ouvrir la télécommande** | Ouvre la télécommande dans un nouvel onglet — pratique pour tester                                                    |
| **📱 QR Codes**               | Affiche les QR codes TV et télécommande à scanner ou à imprimer                                                       |
| **👁️ Prévisualiser**          | Affiche un aperçu miniature de l'écran en direct dans le dashboard                                                    |

### Configurer la TV sur votre écran de gymnase

1. Sur le PC ou la tablette branchée à l'écran du gymnase, ouvrez un navigateur
2. Cliquez sur **📺 Ouvrir la TV** dans votre dashboard pour voir l'URL (ou scannez le QR code TV)
3. Ouvrez cette URL sur l'écran du gymnase
4. Passez en **plein écran** (touche F11 sur Windows/Linux, ⌃⌘F sur Mac)
5. Laissez cette page ouverte en permanence — ne la fermez pas

> L'URL TV ressemble à : `https://neopro-admin.kalonpartners.bzh/saas/tv?site=[ID]`
> Vous pouvez aussi utiliser le **QR code TV** pour transférer l'URL sur le poste depuis votre téléphone.

---

## 5. Gérer le PIN de la télécommande

En bas de **Mon club**, la section **Télécommande** vous permet de gérer les accès de l'opérateur matchday.

### Voir et copier le PIN

Le PIN à 4 chiffres est affiché dans cette section. C'est le code que l'opérateur saisit pour accéder à la télécommande.

### Changer le PIN

1. Dans la section **Télécommande**, cliquez sur **Modifier le PIN**
2. Saisissez le nouveau PIN (4 chiffres)
3. Confirmez — le changement est immédiat

### Partager la télécommande

- **Par QR code** : cliquez sur **📱 QR Codes** en haut de la page → le QR code de la télécommande contient l'URL + le PIN encapsulé
- **Par lien direct** : copiez l'URL de la télécommande et envoyez-la par SMS ou email à l'opérateur

> **Bonne pratique** : changez le PIN en début de saison et à chaque changement d'opérateur.

---

## 6. Ma boucle — la bibliothèque vidéo

La page **Ma boucle** regroupe deux choses : la **bibliothèque** (toutes vos vidéos) et la **boucle** (ce qui passe à l'écran). Elles sont deux espaces distincts.

### La bibliothèque

La bibliothèque liste toutes les vidéos disponibles pour votre club. Elle se situe dans la partie **supérieure** de la page.

**Filtrer la bibliothèque**

- Utilisez la barre de recherche pour trouver une vidéo par nom
- Utilisez les onglets de catégories pour filtrer par type de contenu (Sponsors, Animations, etc.)

**Ajouter une vidéo**

1. Cliquez sur **+ Ajouter du contenu** (bouton en haut de la bibliothèque)
2. Glissez votre fichier dans la zone ou cliquez pour parcourir
3. Donnez un titre, choisissez une catégorie
4. Attendez le statut **Prête** (quelques secondes à quelques minutes selon la taille)

**Formats et limites**

|                        |                                                       |
| ---------------------- | ----------------------------------------------------- |
| Formats acceptés       | MP4 (recommandé), MOV                                 |
| Résolution recommandée | 1920 × 1080 (Full HD)                                 |
| Taille maximum         | 500 Mo par fichier                                    |
| Quota total            | Selon votre abonnement (indiqué dans la bibliothèque) |

**Remplacer une vidéo**

Si un fichier est obsolète (logo modifié, date dépassée) sans changer sa place dans la boucle :

1. Survolez la vidéo dans la bibliothèque → cliquez sur les **⋮ trois points**
2. Choisissez **Remplacer**
3. Importez le nouveau fichier — l'ancien est remplacé à l'identique

**Supprimer une vidéo**

1. Cliquez sur les **⋮ trois points** à côté de la vidéo
2. Choisissez **Supprimer** et confirmez

> Une vidéo supprimée de la bibliothèque est retirée automatiquement de la boucle.

---

## 7. Gérer les catégories

Les catégories organisent vos vidéos et définissent comment elles sont déclenchées sur l'écran. Le gestionnaire de catégories se trouve dans **Ma boucle**, en onglet ou section dédiée.

### Les 3 types de catégories

| Type               | Icône | Comportement                                                                                                                    |
| ------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Boucle**         | 🔄    | Les vidéos tournent automatiquement en continu sur l'écran                                                                      |
| **Action**         | 🎬    | Les vidéos sont déclenchées manuellement depuis la télécommande                                                                 |
| **Phase de match** | ⚽    | Associées à une phase du match (échauffement, mi-temps, après-match) — activées depuis la télécommande lors de la session match |

**Exemple concret** :

- Catégorie "Sponsors" → type **Boucle** → tourne en fond toute la journée
- Catégorie "Célébration but" → type **Action** → l'opérateur la déclenche à la main
- Catégorie "Mi-temps" → type **Phase de match** → s'active quand l'opérateur déclare la mi-temps

### Créer une catégorie

1. Dans **Ma boucle**, cliquez sur **+ Nouvelle catégorie**
2. Donnez un nom (ex : "Sponsors", "Mi-temps", "Animations entrée")
3. Choisissez le type (**Boucle**, **Action** ou **Phase de match**)
4. Validez — la catégorie est disponible immédiatement dans la bibliothèque

### Modifier une catégorie

1. Cliquez sur le nom ou l'icône crayon à côté de la catégorie
2. Modifiez le nom ou le type
3. Enregistrez

### Supprimer une catégorie

1. Cliquez sur l'icône de suppression à côté de la catégorie
2. Confirmez — les vidéos de cette catégorie ne sont **pas** supprimées, elles deviennent sans catégorie

### Associer une vidéo à une catégorie

Lors de l'upload : choisissez la catégorie dans le formulaire.

Pour une vidéo existante : cliquez sur les **⋮ trois points** → **Modifier** → changez la catégorie.

---

## 8. Organiser et activer la boucle

La **boucle** (partie inférieure de **Ma boucle**) est la liste ordonnée des vidéos qui défilent sur votre écran. Seules les vidéos activées dans la boucle sont diffusées.

### Activer ou désactiver une vidéo dans la boucle

- Cochez ou décochez la case à côté d'une vidéo dans la boucle
- Les vidéos décochées restent dans la bibliothèque mais ne passent pas à l'écran

### Réordonner la boucle

- Glissez-déposez les vidéos pour les réordonner
- L'ordre de la liste = l'ordre de diffusion à l'écran

### Enregistrer les modifications

Pour un site SaaS, cliquez sur **Enregistrer** (pas "Déployer") — la modification est prise en compte **immédiatement** sur l'écran sans délai.

> Le bouton s'appelle **Enregistrer** et non "Déployer" car il n'y a pas de boîtier Pi à synchroniser : la config est mise à jour directement dans le cloud.

---

## 9. Mes sponsors

La page **Mes sponsors** liste tous vos partenaires actifs avec :

- Le **logo** de chaque sponsor
- Le nombre d'**impressions cette semaine**
- Un lien vers le **portail sponsor** — une page personnalisée que vous pouvez partager à votre partenaire pour qu'il consulte ses statistiques sans compte MadXP

> **Ajouter ou modifier un sponsor ?** La gestion des contrats sponsors est réalisée par l'équipe MadXP en coordination avec vous. Contactez votre interlocuteur MadXP.

---

## 10. Mes analytics

La page **Analytics** donne accès à l'historique de diffusion sur plusieurs semaines.

### Ce qu'on y trouve

- **Courbes de lectures** par jour sur 7 / 30 jours
- **Temps d'écran** cumulé par période
- **Taux de complétion** (proportion de vidéos regardées jusqu'au bout)
- **Performance par vidéo** : nombre de lectures, durée moyenne, taux de complétion

### Filtrer

- Par période (7 jours, 30 jours, personnalisé selon votre abonnement)
- Par catégorie de vidéo

> Certaines fonctionnalités (historique long, export CSV/PDF) sont disponibles selon votre tier d'abonnement.

---

## 11. Diagnostic

La page **Diagnostic** indique l'état de votre écran en temps réel :

| Indicateur                 | Signification                                                      |
| -------------------------- | ------------------------------------------------------------------ |
| **Connecté** (vert)        | Au moins un navigateur affiche votre TV en ce moment               |
| **Hors ligne** (rouge)     | Aucun navigateur n'est connecté à votre TV                         |
| **Alertes actives**        | Problèmes détectés (ex : vidéo introuvable, erreur de lecture)     |
| **Erreurs de lecture 24h** | Si > 0, une bannière d'avertissement apparaît aussi sur "Mon club" |

> **L'écran est "Hors ligne" ?** Le PC ou la tablette qui affiche votre TV est peut-être éteint ou a perdu internet. Vérifiez qu'il est bien allumé et connecté, et que la page TV est ouverte.

---

## 12. Préparer un jour de match

Checklist à faire **la veille ou le matin du match** :

```
CONTENU
□ Boucle à jour (sponsors actifs, vidéos de mi-temps configurées)
□ Catégories "Phase de match" créées (échauffement, mi-temps, après-match)
□ Catégories "Action" créées pour les animations spéciales (but, temps fort)

ÉCRAN
□ Le PC / la tablette du gymnase est allumé
□ La page TV est ouverte en plein écran
□ La connexion internet du gymnase est opérationnelle
□ "Clients connectés" affiche 1+ dans "Mon club"

OPÉRATEUR
□ L'opérateur a le lien ou QR code de la télécommande sur son téléphone
□ L'opérateur connaît le PIN
□ Raccourci télécommande ajouté à l'écran d'accueil (voir §14)
```

---

# PARTIE B — Jour du match (Opérateur matchday)

## 13. Accéder à la télécommande

La télécommande est une **page web** — aucune application à installer.

**Lien** : fourni par le resp com sous forme de lien direct ou de QR code.

L'URL ressemble à : `https://neopro-admin.kalonpartners.bzh/saas/remote?site=[ID]`

### Se connecter

1. Ouvrez le lien dans votre navigateur (ou scannez le QR code)
2. Saisissez votre **PIN** (4 chiffres)
3. La télécommande s'affiche

> **Pas de PIN ?** Demandez-le à votre resp com. Il se trouve dans **Mon club** → section Télécommande.

---

## 14. Créer un raccourci sur le téléphone

Pour accéder à la télécommande en un tap sans chercher le lien :

**iPhone (Safari) :**

1. Ouvrez le lien dans Safari
2. Icône de partage (carré avec flèche) → **Sur l'écran d'accueil**
3. Nommez-le **Télécommande Match** et confirmez

**Android (Chrome) :**

1. Ouvrez le lien dans Chrome
2. Trois points → **Ajouter à l'écran d'accueil**
3. Nommez-le **Télécommande Match** et confirmez

---

## 15. Démarrer une session match

Démarrer une session enregistre le match (équipes, score, durée) pour les rapports sponsors.

1. Dans la télécommande, appuyez sur **Démarrer un match**
2. Saisissez le nom de l'**équipe à domicile** et de l'**équipe adverse**
3. Appuyez sur **Lancer** — la session est active

> La session se ferme automatiquement après 4 heures d'inactivité ou 24 heures maximum.

---

## 16. Mettre à jour le score en live

Le score s'affiche sur l'écran du gymnase en temps réel.

1. Repérez le **tableau de score** dans la télécommande
2. Appuyez sur **+1** à côté de l'équipe qui marque
3. Le score se met à jour immédiatement sur l'écran

Pour corriger une erreur : appuyez sur **−1**.

> **Le score n'apparaît pas ?** Vérifiez que la session match est bien démarrée (§15) et que votre internet est actif.

---

## 17. Changer ce qui s'affiche à l'écran

### Changer de catégorie

La télécommande liste les catégories configurées pour votre club.

- Appuyez sur une catégorie **Boucle** → les vidéos de cette catégorie défilent en continu
- Appuyez sur une catégorie **Action** → la vidéo est jouée une fois puis la boucle reprend
- Activez une **Phase de match** (ex : Mi-temps) → les vidéos de mi-temps s'affichent automatiquement

### Passer à la vidéo suivante / précédente

Utilisez les boutons **⏭ Suivant** et **⏮ Précédent**.

### Mettre en pause

**⏸ Pause** — l'écran reste figé. **▶ Reprendre** pour relancer.

### Guide des phases recommandées

| Moment                        | Catégorie recommandée                              |
| ----------------------------- | -------------------------------------------------- |
| 30 min avant (accueil public) | Boucle "Sponsors"                                  |
| Entrée des équipes            | Action "Animations entrée" ou phase "Échauffement" |
| Pendant le match              | Boucle "Sponsors"                                  |
| But / Temps fort              | Action "Célébration but"                           |
| Mi-temps                      | Phase "Mi-temps" (audience maximale → sponsors)    |
| Fin de match, sortie          | Boucle "Sponsors"                                  |

---

# PARTIE C — Problèmes fréquents

## 18. Dépannage

### L'écran du gymnase est noir ou figé

**Cause la plus fréquente** : la page TV a été fermée ou le poste s'est mis en veille.

**Solution** :

1. Vérifiez que le PC / la tablette est allumé et a une connexion internet
2. Si la page TV a été fermée, rouvrez l'URL TV (voir **Mon club** → bouton 📺 Ouvrir la TV)
3. Si l'image est figée, rechargez la page (F5 ou Ctrl + R)
4. Repassez en plein écran (F11)

---

### La télécommande ne répond plus / les boutons ne font rien

**Vérifications** :

1. Votre téléphone est-il connecté à internet ?
2. La page TV est-elle toujours ouverte côté écran ?

**Solution** : tirez la page vers le bas pour recharger la télécommande. Si l'écran est déconnecté, rechargez aussi la page TV.

---

### "Clients connectés" affiche 0 sur Mon club

L'écran n'est pas en ligne. La page TV est fermée ou le poste n'a plus internet. Vérifiez et rouvrez la page TV.

---

### Une vidéo uploadée n'apparaît pas dans la bibliothèque

La vidéo est peut-être encore en vérification. Attendez que le statut passe à **Prête** (icône verte). Si après 5 minutes le statut est **Échoué** : supprimez et réessayez en vérifiant que le fichier est en MP4 et fait moins de 500 Mo.

---

### Le score ne s'affiche pas à l'écran

Vérifiez que la session match est bien démarrée (§15) et que l'internet est actif sur votre téléphone.

---

### Internet coupé pendant le match

**Impact** : la télécommande est inactive, le score ne peut pas être mis à jour.

**À faire** :

1. L'écran continue de diffuser la dernière boucle chargée en cache
2. Rétablissez internet le plus vite possible (redémarrez la box/routeur)
3. Une fois reconnecté, la télécommande se reconnecte automatiquement

> Sans internet, le pilotage temps réel est impossible. Si la résilience offline est indispensable pour votre club, renseignez-vous sur l'offre **Pi**.

---

### Contacter le support

Si le problème persiste après les vérifications ci-dessus :

**Email** : support@neopro.fr

**Dans votre message**, précisez : nom de votre club, description du problème, actions déjà tentées.

---

_Neopro — Mode opératoire club SaaS — Mai 2026_
