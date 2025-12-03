# 🆕 Nouvelles Fonctionnalités NEOPRO

## 🔐 1. Authentification Globale

### Description
Toute personne accédant à `neopro.kalonpartners.bzh` doit maintenant s'authentifier avec un mot de passe avant d'accéder à l'application.

### Mot de passe
```
GG_NEO_25k!
```

### Fonctionnement
- **Page de connexion** : Tous les utilisateurs sont redirigés vers `/login` s'ils ne sont pas authentifiés
- **Session de 8 heures** : Une fois connecté, l'utilisateur reste authentifié pendant 8 heures
- **Stockage local** : Le token d'authentification est stocké dans le `localStorage` du navigateur
- **Vérification automatique** : La session est vérifiée toutes les minutes pour déconnecter automatiquement si expirée
- **Protection de toutes les routes** : `/tv`, `/remote`, et `/program` sont protégées par le guard d'authentification

### Fichiers créés
- `src/app/services/auth.service.ts` - Service d'authentification
- `src/app/guards/auth.guard.ts` - Guard pour protéger les routes
- `src/app/components/login/login.component.ts` - Composant de connexion
- `src/app/components/login/login.component.html` - Template de connexion
- `src/app/components/login/login.component.scss` - Styles de connexion

### Sécurité
⚠️ **Important** : Le mot de passe est actuellement hardcodé dans le code. Pour une sécurité renforcée en production, il faudrait :
- Utiliser un backend pour vérifier les credentials
- Hacher le mot de passe côté serveur
- Utiliser JWT ou OAuth pour l'authentification
- Implémenter une limitation des tentatives de connexion

---

## 🎬 2. Mode Programmation (Playlist Automatique)

### Description
Le Mode Programmation permet de créer et gérer des playlists de vidéos pour automatiser la diffusion lors de différents moments du match :
- **Avant-Match** 🏁
- **Mi-Temps** ⏸️
- **Fin de Match** 🏆

### Accès
Depuis la page `/remote`, cliquer sur le bouton **"Mode Programmation"** (violet avec icône playlist).

### Fonctionnalités

#### 📋 Gestion des programmes
- **3 programmes par défaut** : Avant-Match, Mi-Temps, Fin de Match
- **Programmes personnalisés** : Possibilité de créer des programmes supplémentaires
- **Édition** : Modifier le nom, activer la lecture automatique ou la boucle
- **Suppression** : Supprimer un programme (avec confirmation pour les programmes par défaut)

#### 🎥 Construction de playlist
1. **Sélectionner un programme** dans la liste de gauche
2. **Choisir une catégorie** (ex: Match SM1, Match SF, Focus partenaires)
3. **Choisir une sous-catégorie** (ex: But, Jingle)
4. **Cliquer sur une vidéo** pour l'ajouter à la playlist
5. **Réorganiser** les vidéos par glisser-déposer ou avec les boutons ↑ ↓
6. **Retirer** une vidéo avec le bouton ✕

#### ▶️ Lecture de programme
- **Lancer** : Bouton "▶️ Lancer" pour démarrer la lecture de la playlist
- **Arrêter** : Bouton "⏹️ Arrêter" pour interrompre et revenir aux sponsors
- **Lecture automatique** : Option pour démarrer automatiquement le programme à un moment précis (à implémenter)
- **Boucle** : Option pour répéter la playlist en boucle

#### 💾 Sauvegarde
- Les programmes sont **sauvegardés automatiquement** dans le `localStorage`
- Persistance entre les sessions
- Aucun besoin de serveur backend

### Interface utilisateur

```
┌─────────────────────────────────────────────────────────────┐
│  ← Retour         Mode Programmation                        │
├─────────┬───────────────────────────────────────────────────┤
│         │                                                    │
│ Progs   │  📝 Avant-Match                   ✏️  ▶️ Lancer   │
│ +Nouveau│  ☑ Lecture auto  ☑ Boucle                        │
│         │                                                    │
│ 🏁      │  Playlist (3)                                     │
│ Avant-  │  ┌──────────────────────────────────────────┐    │
│ Match   │  │ ⋮⋮ 1. Video BUT Joueur 1      ↑ ↓ ✕    │    │
│ 3 vid   │  │ ⋮⋮ 2. Jingle 2min             ↑ ↓ ✕    │    │
│         │  │ ⋮⋮ 3. Video Info Club         ↑ ↓ ✕    │    │
│ ⏸️      │  └──────────────────────────────────────────┘    │
│ Mi-Temps│                                                    │
│ 0 vid   │  Bibliothèque de vidéos                           │
│         │  Catégorie: [Match SM1] [Match SF] [Info club]   │
│ 🏆      │  Sous-cat: [But] [Jingle]                        │
│ Fin de  │  🎬 Video 1  [+Ajouter]                          │
│ Match   │  🎬 Video 2  [+Ajouter]                          │
│ 2 vid   │                                                    │
│         │                                                    │
└─────────┴───────────────────────────────────────────────────┘
```

### Cas d'usage

#### Scénario 1 : Avant-Match
1. Créer une playlist "Avant-Match" avec :
   - Vidéo de présentation du club
   - Focus sur les partenaires
   - Présentation des joueurs
2. **15 minutes avant le match**, lancer le programme
3. La playlist tourne en boucle jusqu'au coup d'envoi

#### Scénario 2 : Mi-Temps
1. Créer une playlist "Mi-Temps" avec :
   - Jingle mi-temps
   - Meilleurs buts de la première période
   - Publicités partenaires
2. **Au signal de la mi-temps**, lancer le programme
3. Arrêt manuel à la reprise du jeu

#### Scénario 3 : Fin de Match
1. Créer une playlist "Fin de Match" avec :
   - Jingle victoire
   - Résumé des meilleurs moments
   - Remerciements partenaires
   - Annonce prochain match
2. **Au coup de sifflet final**, lancer le programme
3. Retour automatique aux sponsors après la dernière vidéo

### Fichiers créés
- `src/app/components/program/program.component.ts` - Composant principal (378 lignes)
- `src/app/components/program/program.component.html` - Template (177 lignes)
- `src/app/components/program/program.component.scss` - Styles (504 lignes)

### Modifications apportées
- `src/app/app.routes.ts` - Ajout de la route `/program`
- `src/app/components/remote/remote.component.html` - Ajout du bouton "Mode Programmation"
- `src/app/components/remote/remote.component.ts` - Ajout méthode `goToProgram()`
- `src/app/components/remote/remote.component.scss` - Style du bouton
- `src/app/services/socket.service.ts` - Ajout méthode `sendCommand()`

### Améliorations futures possibles

1. **Timer automatique**
   - Définir une heure de déclenchement
   - Lancement automatique à l'heure programmée

2. **Durée des vidéos**
   - Détecter automatiquement la durée réelle des vidéos
   - Afficher durée totale précise du programme
   - Attendre vraiment la fin de chaque vidéo avant de passer à la suivante

3. **Événements Socket.IO**
   - Événement `video-ended` depuis le composant TV
   - Synchronisation précise entre Remote et TV
   - Affichage temps réel de la vidéo en cours

4. **Aperçu vidéo**
   - Preview de la vidéo avant ajout
   - Thumbnail dans la liste

5. **Export/Import**
   - Sauvegarder un programme en JSON
   - Importer un programme depuis un fichier
   - Partager entre opérateurs

6. **Statistiques**
   - Historique des programmes lancés
   - Nombre de lectures par vidéo
   - Durée totale de diffusion

---

## 🚀 Déploiement

### Build
```bash
npm run build
```

### Fichiers à déployer
Les fichiers buildés se trouvent dans `dist/neopro/` :
- `index.html`
- `main-*.js`
- `styles-*.css`
- `polyfills-*.js`

### Configuration Apache
Aucun changement nécessaire dans la configuration Apache. Le routage Angular gère les nouvelles routes `/login` et `/program`.

---

## 📝 Notes de développement

### TypeScript
- Utilisation de `any` pour contourner temporairement les problèmes de typage avec `Configuration`
- À améliorer : Créer une interface plus flexible pour `Configuration` permettant l'indexation dynamique

### Performance
- Le composant Program ajoute ~40KB au bundle (7.49KB SCSS)
- Le localStorage est utilisé pour la persistance (limite ~5-10MB selon navigateurs)
- Drag & Drop natif HTML5 (pas de bibliothèque externe)

### Compatibilité
- ✅ Chrome/Edge (dernières versions)
- ✅ Firefox (dernières versions)
- ✅ Safari (dernières versions)
- ✅ Mobile/Tablette (avec design responsive)

---

## 🎯 Prochaines étapes recommandées

1. **Tester en production** sur `neopro.kalonpartners.bzh`
2. **Former les opérateurs** à l'utilisation du Mode Programmation
3. **Créer des programmes types** pour les matchs standards
4. **Collecter les retours** des utilisateurs sur le terrain
5. **Itérer** sur les fonctionnalités selon les besoins réels

---

## ❓ Questions / Support

Pour toute question ou problème :
1. Vérifier les logs de la console navigateur (F12)
2. Vérifier que le serveur Socket.IO sur Render est actif
3. Tester d'abord en local avec `npm start`
4. Contacter le développeur avec captures d'écran si besoin

---

**Date de création** : 3 décembre 2025
**Version NEOPRO** : 2.0.0 (avec authentification et mode programmation)
