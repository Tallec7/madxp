# Mode Démo

Le mode démo permet de présenter l'application avec différentes configurations de clubs sans avoir besoin de déployer sur un Raspberry Pi spécifique.

## Activation

Le mode démo est contrôlé par la variable `demoMode` dans les fichiers d'environnement :

| Environnement | Fichier | Valeur |
|--------------|---------|--------|
| Développement | `src/environments/environment.ts` | `true` |
| Production | `src/environments/environment.prod.ts` | `false` |
| Raspberry | `src/environments/environment.raspberry.ts` | `false` |

## Fonctionnement

### En mode démo (`demoMode: true`)

1. L'utilisateur accède à `/remote`
2. Un écran de sélection de club s'affiche
3. L'utilisateur sélectionne un club
4. La configuration du club est chargée
5. La boucle partenaires du club est automatiquement lancée sur `/tv`
6. L'utilisateur accède à la télécommande configurée pour ce club

### En mode normal (`demoMode: false`)

Comportement standard : la configuration est chargée depuis `/configuration.json`.

## Configurations de clubs

Les configurations sont stockées dans `src/assets/demo-configs/`.

### Ajouter un nouveau club

1. Créer le fichier de configuration :
   ```
   src/assets/demo-configs/monclub.json
   ```

2. Utiliser la même structure que `configuration.json` :
   ```json
   {
     "remote": { "title": "Télécommande Néopro - MON CLUB" },
     "auth": { "clubName": "MON CLUB", ... },
     "sync": { "clubName": "MON CLUB", ... },
     "version": "1.0",
     "sponsors": [...],
     "categories": [...]
   }
   ```

3. Ajouter l'entrée dans le service `src/app/services/demo-config.service.ts` :
   ```typescript
   private readonly availableClubs: ClubInfo[] = [
     // ... clubs existants
     { id: 'monclub', name: 'Mon Club', city: 'Ville', sport: 'Sport' }
   ];
   ```

## Architecture

```
src/
├── assets/
│   └── demo-configs/           # Configurations JSON des clubs
│       ├── nlfhandball.json
│       └── demo-club.json
├── app/
│   ├── components/
│   │   └── club-selector/      # Composant de sélection de club
│   │       ├── club-selector.component.ts
│   │       ├── club-selector.component.html
│   │       └── club-selector.component.scss
│   └── services/
│       └── demo-config.service.ts  # Service de gestion des configs
└── environments/
    ├── environment.ts          # demoMode: true
    ├── environment.prod.ts     # demoMode: false
    └── environment.raspberry.ts # demoMode: false
```

## Interface utilisateur

### Écran de sélection de club

- Design sombre avec dégradé bleu
- Cards pour chaque club disponible
- Affichage : nom, ville, sport
- Indicateur de chargement lors de la sélection

### Navigation

- Bouton retour visible sur la télécommande pour revenir à la sélection de club
- Le nom du club sélectionné est affiché sous le titre "Télécommande"

## Notes

- Ce mode est exclusivement destiné aux démonstrations
- En production (Raspberry Pi), le mode démo est désactivé
- Les vidéos référencées dans les configs de démo doivent exister dans le dossier `videos/`
