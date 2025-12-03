# 🧪 Guide de Test - NEOPRO v2.0

## 🎯 Objectif
Ce guide vous permet de tester les deux nouvelles fonctionnalités de NEOPRO :
1. **Authentification globale** avec mot de passe
2. **Mode Programmation** pour playlists automatiques

---

## ⚙️ Prérequis

### Environnement de test local
```bash
# 1. Installer les dépendances
npm install

# 2. Démarrer le serveur de développement Angular
npm start
# L'application sera accessible sur http://localhost:4200

# 3. Dans un autre terminal, démarrer le serveur Socket.IO
cd server-render
node server.js
# Le serveur Socket.IO tournera sur http://localhost:3000
```

### Environnement de production
- URL : https://neopro.kalonpartners.bzh
- Serveur Socket.IO : https://neopro.onrender.com

---

## 🔐 Tests d'Authentification

### Test 1 : Accès sans authentification
**Objectif** : Vérifier la redirection vers la page de login

**Étapes :**
1. Ouvrir un navigateur en navigation privée
2. Accéder à `http://localhost:4200/tv`
3. **Résultat attendu** : Redirection automatique vers `/login`
4. Essayer d'accéder à `/remote`
5. **Résultat attendu** : Redirection automatique vers `/login`

✅ **Succès** : Impossible d'accéder aux pages sans authentification
❌ **Échec** : Accès direct aux pages TV ou Remote

---

### Test 2 : Login avec mot de passe correct
**Objectif** : Vérifier l'authentification réussie

**Étapes :**
1. Sur la page `/login`
2. Entrer le mot de passe : `GG_NEO_25k!`
3. Cliquer sur "Se connecter"
4. **Résultat attendu** :
   - Animation de chargement
   - Redirection vers `/tv` après ~300ms
   - Affichage de l'écran TV avec vidéos sponsors

✅ **Succès** : Authentification réussie et accès à l'application
❌ **Échec** : Message d'erreur ou pas de redirection

---

### Test 3 : Login avec mot de passe incorrect
**Objectif** : Vérifier le rejet des mauvais mots de passe

**Étapes :**
1. Sur la page `/login`
2. Entrer un mauvais mot de passe : `wrongpassword`
3. Cliquer sur "Se connecter"
4. **Résultat attendu** :
   - Message d'erreur rouge : "Mot de passe incorrect"
   - Animation de secousse du message
   - Champ mot de passe vidé
   - Reste sur la page `/login`

✅ **Succès** : Message d'erreur affiché, pas d'accès
❌ **Échec** : Authentification réussie ou pas de message d'erreur

---

### Test 4 : Persistance de la session
**Objectif** : Vérifier que la session reste active

**Étapes :**
1. Se connecter avec le bon mot de passe
2. Naviguer vers `/remote`
3. Rafraîchir la page (F5)
4. **Résultat attendu** : Toujours sur `/remote`, pas de redirection vers login
5. Fermer l'onglet
6. Rouvrir `http://localhost:4200`
7. **Résultat attendu** : Toujours authentifié, redirection vers `/tv`

✅ **Succès** : Session persistante pendant 8 heures
❌ **Échec** : Déconnexion après rafraîchissement

---

### Test 5 : Expiration de la session
**Objectif** : Vérifier la déconnexion automatique (test manuel difficile - 8h)

**Étapes :**
1. Se connecter
2. Ouvrir la console navigateur (F12)
3. Dans la console, exécuter :
```javascript
// Simuler une expiration immédiate
localStorage.setItem('neopro_auth_token', JSON.stringify({
  authenticated: true,
  expiresAt: Date.now() - 1000 // Expiré il y a 1 seconde
}));
```
4. Attendre 1 minute (vérification automatique)
5. **Résultat attendu** : Redirection automatique vers `/login`

✅ **Succès** : Déconnexion automatique détectée
❌ **Échec** : Reste authentifié malgré expiration

---

## 🎬 Tests du Mode Programmation

### Test 6 : Accès au Mode Programmation
**Objectif** : Vérifier l'accès depuis la télécommande

**Étapes :**
1. S'authentifier
2. Naviguer vers `/remote`
3. Vérifier la présence du bouton "Mode Programmation" (violet, avec icône playlist)
4. Cliquer sur "Mode Programmation"
5. **Résultat attendu** :
   - Redirection vers `/program`
   - Affichage de la sidebar avec 3 programmes par défaut
   - Zone principale affiche "Sélectionnez un programme"

✅ **Succès** : Accès au mode programmation fonctionnel
❌ **Échec** : Erreur 404 ou page blanche

---

### Test 7 : Programmes par défaut
**Objectif** : Vérifier la création des programmes par défaut

**Étapes :**
1. Sur `/program` (première visite)
2. Vérifier la sidebar
3. **Résultat attendu** :
   - 3 programmes présents :
     - 🏁 Avant-Match (0 vidéo)
     - ⏸️ Mi-Temps (0 vidéo)
     - 🏆 Fin de Match (0 vidéo)

✅ **Succès** : 3 programmes par défaut créés
❌ **Échec** : Programmes manquants ou mal nommés

---

### Test 8 : Sélection d'un programme
**Objectif** : Vérifier l'affichage d'un programme vide

**Étapes :**
1. Cliquer sur "Avant-Match"
2. **Résultat attendu** :
   - Card "Avant-Match" surlignée en violet
   - Zone principale affiche :
     - Titre "Avant-Match"
     - Checkboxes "Lecture auto" et "Boucle" (non cochées)
     - Bouton "✏️ Modifier"
     - Section "Playlist (0)" avec message "Aucune vidéo"
     - Section "Bibliothèque de vidéos"

✅ **Succès** : Programme sélectionné et affiché
❌ **Échec** : Pas de changement ou erreur

---

### Test 9 : Ajout d'une vidéo à la playlist
**Objectif** : Tester l'ajout de vidéo depuis la bibliothèque

**Étapes :**
1. Programme "Avant-Match" sélectionné
2. Dans "Bibliothèque de vidéos", cliquer sur catégorie "Match SM1"
3. **Résultat attendu** : Boutons de sous-catégories apparaissent (But, Jingle)
4. Cliquer sur sous-catégorie "But"
5. **Résultat attendu** : Liste de vidéos de joueurs s'affiche
6. Cliquer sur une vidéo (ex: "JOUEUR 1")
7. **Résultat attendu** :
   - Vidéo apparaît dans la section "Playlist (1)"
   - Format : "⋮⋮ 1. JOUEUR 1" avec boutons [↑][↓][✕]
   - Meta : "Match SM1 › But"

✅ **Succès** : Vidéo ajoutée à la playlist
❌ **Échec** : Vidéo non ajoutée ou erreur

---

### Test 10 : Ajout de plusieurs vidéos
**Objectif** : Construire une playlist complète

**Étapes :**
1. Ajouter 3 vidéos différentes au programme "Avant-Match"
2. **Résultat attendu** :
   - Playlist affiche "Playlist (3)"
   - 3 items numérotés 1, 2, 3
   - Card programme affiche "3 vidéos"

✅ **Succès** : Plusieurs vidéos ajoutées
❌ **Échec** : Doublon ou erreur

---

### Test 11 : Réorganisation avec boutons
**Objectif** : Tester le déplacement des vidéos

**Étapes :**
1. Playlist avec 3 vidéos : A, B, C
2. Cliquer sur bouton [↓] de la vidéo A
3. **Résultat attendu** : Ordre devient B, A, C
4. Cliquer sur bouton [↑] de la vidéo C
5. **Résultat attendu** : Ordre devient B, C, A

✅ **Succès** : Réorganisation fonctionnelle
❌ **Échec** : Ordre incorrect ou erreur

---

### Test 12 : Drag & Drop
**Objectif** : Tester le glisser-déposer

**Étapes :**
1. Playlist avec 3 vidéos : A, B, C
2. Glisser la vidéo A
3. Déposer entre B et C
4. **Résultat attendu** : Ordre devient B, A, C
5. Vérifier la sauvegarde (rafraîchir la page)
6. **Résultat attendu** : Ordre conservé

✅ **Succès** : Drag & drop fonctionnel et sauvegardé
❌ **Échec** : Ordre non modifié ou non sauvegardé

---

### Test 13 : Suppression d'une vidéo
**Objectif** : Retirer une vidéo de la playlist

**Étapes :**
1. Playlist avec 3 vidéos
2. Cliquer sur bouton [✕] de la vidéo du milieu
3. **Résultat attendu** :
   - Vidéo disparaît
   - Numérotation se réajuste : 1, 2
   - "Playlist (2)" mis à jour

✅ **Succès** : Vidéo supprimée
❌ **Échec** : Vidéo reste ou erreur

---

### Test 14 : Options du programme
**Objectif** : Tester lecture auto et boucle

**Étapes :**
1. Programme sélectionné
2. Cocher "Lecture auto"
3. **Résultat attendu** : Sauvegarde automatique (vérifier localStorage)
4. Cocher "Boucle"
5. **Résultat attendu** : Sauvegarde automatique
6. Rafraîchir la page
7. **Résultat attendu** : Checkboxes toujours cochées

✅ **Succès** : Options sauvegardées
❌ **Échec** : Options perdues après rafraîchissement

---

### Test 15 : Édition du nom du programme
**Objectif** : Renommer un programme

**Étapes :**
1. Programme "Avant-Match" sélectionné
2. Cliquer sur "✏️ Modifier"
3. **Résultat attendu** : Champ texte apparaît avec "Avant-Match"
4. Modifier le nom : "Échauffement"
5. Cliquer sur "✅ Enregistrer"
6. **Résultat attendu** :
   - Mode édition se ferme
   - Titre affiché : "Échauffement"
   - Card sidebar mise à jour

✅ **Succès** : Nom modifié
❌ **Échec** : Nom non sauvegardé

---

### Test 16 : Création d'un nouveau programme
**Objectif** : Ajouter un programme personnalisé

**Étapes :**
1. Cliquer sur "[+ Nouveau]" dans la sidebar
2. **Résultat attendu** :
   - Nouveau programme créé : "Nouveau Programme"
   - Mode édition activé automatiquement
3. Modifier le nom : "Test Custom"
4. Cliquer sur "✅ Créer"
5. **Résultat attendu** :
   - Programme ajouté à la liste
   - 4 programmes au total

✅ **Succès** : Nouveau programme créé
❌ **Échec** : Erreur ou programme non sauvegardé

---

### Test 17 : Suppression d'un programme
**Objectif** : Supprimer un programme personnalisé

**Étapes :**
1. Créer un programme "Test Suppression"
2. Survoler la card du programme
3. **Résultat attendu** : Icône 🗑️ apparaît en haut à droite
4. Cliquer sur 🗑️
5. **Résultat attendu** : Programme disparaît immédiatement
6. Essayer de supprimer "Avant-Match"
7. **Résultat attendu** : Popup de confirmation "Êtes-vous sûr..."

✅ **Succès** : Suppression avec confirmation pour défauts
❌ **Échec** : Pas de suppression ou pas de confirmation

---

### Test 18 : Lancement d'un programme (simulation)
**Objectif** : Tester la lecture d'une playlist

**Étapes :**
1. Créer une playlist avec 2 vidéos
2. Ouvrir un deuxième onglet sur `/tv`
3. Dans l'onglet `/program`, cliquer sur "▶️ Lancer"
4. **Résultat attendu** sur `/program` :
   - Indicateur "🟢 En lecture"
   - Bouton devient "⏹️ Arrêter"
   - Card programme affiche "En lecture"
5. **Résultat attendu** sur `/tv` :
   - Première vidéo commence à jouer
   - (Après durée estimée) Deuxième vidéo joue
6. Cliquer sur "⏹️ Arrêter"
7. **Résultat attendu** :
   - Indicateur disparaît
   - Retour boucle sponsors sur `/tv`

✅ **Succès** : Lecture séquentielle fonctionnelle
❌ **Échec** : Pas de lecture ou pas d'arrêt

---

### Test 19 : Persistance des programmes
**Objectif** : Vérifier la sauvegarde localStorage

**Étapes :**
1. Créer un programme "Persistance Test" avec 3 vidéos
2. Fermer complètement le navigateur
3. Rouvrir et se connecter
4. Aller sur `/program`
5. **Résultat attendu** :
   - Programme "Persistance Test" toujours présent
   - 3 vidéos dans la playlist
   - Même ordre

✅ **Succès** : Programmes persistants
❌ **Échec** : Programmes perdus

---

### Test 20 : Navigation retour
**Objectif** : Vérifier le bouton retour

**Étapes :**
1. Sur `/program`
2. Cliquer sur "[← Retour]" en haut à gauche
3. **Résultat attendu** : Redirection vers `/remote`

✅ **Succès** : Navigation fonctionnelle
❌ **Échec** : Erreur ou mauvaise redirection

---

## 🌐 Tests Multi-Devices

### Test 21 : Responsive Mobile
**Objectif** : Vérifier l'affichage mobile

**Étapes :**
1. Ouvrir DevTools (F12)
2. Activer mode responsive (Ctrl+Shift+M)
3. Sélectionner iPhone 12 Pro (390x844)
4. Tester la page `/login`
5. **Résultat attendu** : Card centrée, lisible
6. Tester `/program`
7. **Résultat attendu** :
   - Sidebar au-dessus (pas à gauche)
   - Boutons en pleine largeur
   - Défilement vertical

✅ **Succès** : Interface adaptée mobile
❌ **Échec** : Layout cassé ou illisible

---

### Test 22 : Tablette Paysage
**Objectif** : Tester sur iPad

**Étapes :**
1. Mode responsive : iPad Pro 11" (834x1194)
2. Rotation paysage
3. Tester `/program`
4. **Résultat attendu** : Layout desktop conservé

✅ **Succès** : Interface optimale tablette
❌ **Échec** : Layout cassé

---

## 🔌 Tests Socket.IO

### Test 23 : Connexion Socket
**Objectif** : Vérifier la communication temps réel

**Étapes :**
1. Ouvrir console navigateur (F12) sur `/tv`
2. Chercher : "Connecting to socket server"
3. **Résultat attendu** :
   ```
   Connecting to socket server: http://localhost:3000
   socket service : on action
   ```
4. Vérifier connexion établie (onglet Network → WS)

✅ **Succès** : Socket connecté
❌ **Échec** : Erreurs de connexion

---

### Test 24 : Communication Remote → TV
**Objectif** : Vérifier envoi de commandes

**Étapes :**
1. Onglet 1 : `/tv` avec console ouverte
2. Onglet 2 : `/remote`
3. Dans Remote, cliquer sur une vidéo
4. **Résultat attendu** dans console TV :
   ```
   socket service : on action
   Received command: {type: "video", data: {...}}
   ```
5. **Résultat attendu** visuel : Vidéo joue sur TV

✅ **Succès** : Communication bidirectionnelle
❌ **Échec** : Pas de réception ou erreur

---

## 🐛 Tests de Robustesse

### Test 25 : localStorage plein
**Objectif** : Gérer quota dépassé

**Étapes :**
1. Console navigateur :
```javascript
// Remplir le localStorage
for(let i = 0; i < 1000; i++) {
  try {
    localStorage.setItem('test_' + i, 'x'.repeat(10000));
  } catch(e) {
    console.log('Quota atteint', e);
    break;
  }
}
```
2. Essayer d'ajouter une vidéo à un programme
3. **Résultat attendu** : Erreur gérée gracieusement (pas de crash)

✅ **Succès** : Gestion d'erreur
❌ **Échec** : Crash de l'application

---

### Test 26 : Serveur Socket.IO down
**Objectif** : Comportement sans serveur

**Étapes :**
1. Arrêter le serveur Socket.IO
2. Accéder à `/tv`
3. **Résultat attendu** :
   - Console : "socket service : not initialized"
   - Boucle sponsors continue (pas de crash)
4. Sur `/remote`, cliquer sur une vidéo
5. **Résultat attendu** :
   - Console : "socket service : not called on due to not initialized"
   - Pas de crash, message d'erreur utilisateur serait mieux

✅ **Succès** : Dégradé gracieux
❌ **Échec** : Crash de l'application

---

## 📊 Checklist Complète

### Authentification
- [ ] Test 1 : Redirection sans auth
- [ ] Test 2 : Login réussi
- [ ] Test 3 : Login échoué
- [ ] Test 4 : Persistance session
- [ ] Test 5 : Expiration session

### Mode Programmation - Base
- [ ] Test 6 : Accès depuis remote
- [ ] Test 7 : Programmes par défaut
- [ ] Test 8 : Sélection programme
- [ ] Test 9 : Ajout vidéo
- [ ] Test 10 : Ajout multiple vidéos

### Mode Programmation - Édition
- [ ] Test 11 : Réorganisation boutons
- [ ] Test 12 : Drag & drop
- [ ] Test 13 : Suppression vidéo
- [ ] Test 14 : Options programme
- [ ] Test 15 : Édition nom
- [ ] Test 16 : Création programme
- [ ] Test 17 : Suppression programme

### Mode Programmation - Lecture
- [ ] Test 18 : Lancement programme
- [ ] Test 19 : Persistance
- [ ] Test 20 : Navigation retour

### Responsive
- [ ] Test 21 : Mobile
- [ ] Test 22 : Tablette

### Technique
- [ ] Test 23 : Connexion Socket
- [ ] Test 24 : Communication Remote/TV
- [ ] Test 25 : localStorage plein
- [ ] Test 26 : Serveur down

---

## 🚀 Tests de Non-Régression

### Fonctionnalités existantes à vérifier

#### Télécommande classique
- [ ] Navigation catégories/sous-catégories
- [ ] Lecture vidéo individuelle
- [ ] Bouton "Boucle partenaires"
- [ ] Bouton retour

#### TV Display
- [ ] Boucle sponsors au démarrage
- [ ] Lecture vidéo à la demande
- [ ] Retour boucle sponsors après vidéo
- [ ] Plein écran Video.js

---

## 📝 Rapport de Bug

Si vous rencontrez un bug, notez :

```markdown
### Bug #XX : [Titre court]

**Sévérité** : Critique / Haute / Moyenne / Basse

**Navigateur** : Chrome 120 / Firefox 121 / Safari 17 / etc.

**Étapes de reproduction :**
1. Aller sur /program
2. Cliquer sur...
3. Observer...

**Résultat attendu :**
[Ce qui devrait se passer]

**Résultat obtenu :**
[Ce qui se passe réellement]

**Console erreur :**
```
[Copier les erreurs de la console]
```

**Captures d'écran :**
[Joindre si pertinent]
```

---

## ✅ Validation Finale

Avant de déployer en production, vérifier que :

- [ ] Tous les tests sont ✅
- [ ] Aucun warning bloquant dans la console
- [ ] Build de production sans erreur : `npm run build`
- [ ] Taille bundle acceptable (< 2MB)
- [ ] Pas de fuite mémoire (DevTools → Memory)
- [ ] Performance acceptable (DevTools → Lighthouse)
- [ ] Tests sur Chrome, Firefox ET Safari
- [ ] Tests sur vraie tablette (pas juste émulateur)

---

**Temps estimé pour tests complets** : 2-3 heures
**Testeurs recommandés** : 2 personnes minimum
**Environnements** : Local + Production

Bon courage ! 🚀
