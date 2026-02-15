# ADR-021: Timer d'inactivite recording

**Date** : Fevrier 2026
**Statut** : Propose
**Decideurs** : Guillaume Le Tallec

---

## Contexte

Les analytics video (lectures, impressions sponsors) ne sont enregistrees que lorsque `RecordingStateService.isRecording === true` sur le Raspberry Pi. Actuellement :

1. **Au boot** : recording = OFF
2. **Changement de phase** (neutral -> before/during/after) : recording = ON automatiquement
3. **Retour en neutral** : timer de 15 min, puis recording = OFF (silencieusement)
4. **Override manuel** : le club peut forcer ON/OFF via la telecommande

**Problemes identifies** :

- Les clubs qui restent en phase match (before/during/after) sans toucher la telecommande pendant longtemps n'ont aucun feedback -- le recording continue indefiniment et ne s'arrete jamais
- Le timer de 15 min ne se declenche que sur retour en neutral, pas dans les autres phases
- L'arret du recording est silencieux : aucune notification au club staff
- Si les clubs ne configurent pas de boucles temporelles et restent sur la boucle par defaut, aucune analytics n'est jamais collectee

**Objectif** : Rendre l'arret du recording visible et controlable pour les clubs.

## Decision

### Timer d'inactivite universel avec popup d'avertissement

Remplacer le timer "retour neutral" par un **timer d'inactivite universel** qui fonctionne dans toutes les phases. Apres 15 minutes sans interaction sur la telecommande, une popup d'avertissement apparait avec un decompte de 3 minutes. Le club peut prolonger ou arreter le recording.

> **Note** : La "boucle NEOPRO par defaut" est un sujet separe gere cote dashboard/central server via le systeme owner/lock existant dans `sponsors[]`. Ce n'est pas un champ Pi — c'est le central qui pousse les videos NEOPRO verrouillees dans la boucle par defaut lors du deploiement.

## Alternatives Considerees

### 1. Garder le timer neutral-only + ajouter un toast

**Avantages** : Changement minimal, pas de refonte du timer
**Inconvenients** : Ne resout pas l'absence de timeout en phase match, un toast est facilement rate
**Verdict** : Rejete -- ne couvre pas le cas des clubs qui restent en phase match

### 2. Timer d'inactivite universel avec popup (choisie)

**Avantages** :

- Couvre toutes les phases (neutral, before, during, after)
- Popup modale = impossible a rater pour le club staff
- Decompte visuel donne le temps de reagir
- Reset automatique sur toute interaction significative
- Le recording manuel (override) n'est pas affecte

**Inconvenients** :

- Changement de comportement pour les clubs existants (le timer se declenche aussi en phase match)
- Necessite d'instrumenter les methodes d'interaction de la telecommande

**Verdict** : Accepte -- meilleur compromis UX/collecte de donnees

## Consequences

### Positives

1. Les clubs voient quand le recording va s'arreter et peuvent prolonger
2. Les analytics sont collectees de maniere plus fiable en match
3. Le recording manuel (override) n'est pas affecte par le timer d'inactivite

### Negatives

1. Les clubs habitues au recording indefini en phase match verront une popup apres 15 min d'inactivite
2. L'instrumentation des methodes d'interaction ajoute un couplage entre `RemoteComponent` et `RecordingStateService`

### Risques

| Risque                                           | Mitigation                                                            |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| Popup jugee intrusive par les clubs              | Le bouton "Continuer" est un seul clic, reset complet du cycle        |
| Timer d'inactivite mal calibre (trop court/long) | 15 min est deja la valeur en prod, les clubs sont habitues            |
| Interactions non detectees (scrolling, etc.)     | On instrumente uniquement les actions significatives, pas les scrolls |

## Plan d'implementation

1. Modifier `RecordingStateService` : remplacer le timer neutral-only par un timer d'inactivite universel + warning countdown
2. Ecrire les tests unitaires (~10 cas)
3. Modifier `RemoteComponent` : subscription au warning, appels `notifyUserActivity()` dans les methodes d'interaction
4. Ajouter la popup HTML + styles SCSS (avec dark mode)

### Criteres de validation

- Tous les tests existants passent (`npm run test:central`)
- La popup apparait apres 15 min d'inactivite dans toutes les phases
- Le bouton "Continuer" reset le cycle complet (15+3 min)
- Le decompte de 0 arrete le recording
- Le recording manuel n'est pas affecte

## References

- [recording-state.service.ts](../../raspberry/src/app/services/recording-state.service.ts) - Service de gestion du recording
- [remote.component.ts](../../raspberry/src/app/components/remote/remote.component.ts) - Telecommande
- ADR-001 : Architecture Edge + Cloud
- ADR-010 : Detection HDMI-CEC pour analytics fiables

---

_Cree le 15 fevrier 2026_
