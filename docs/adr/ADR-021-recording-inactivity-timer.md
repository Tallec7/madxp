# ADR-021: Timer d'inactivité recording

**Date** : Février 2026
**Statut** : Accepté (mise à jour février 2026)
**Décideurs** : Guillaume Le Tallec

---

## Contexte

Les analytics vidéo (lectures, impressions sponsors) ne sont enregistrées que lorsque `RecordingStateService.isRecording === true` sur le Raspberry Pi. Actuellement :

1. **Au boot** : recording = OFF
2. **Changement de phase** (neutral -> before/during/after) : recording = ON automatiquement
3. **Retour en neutral** : recording = OFF immédiatement (auto-stop)
4. **Vidéo manuelle en neutral** : recording = ON temporaire (le temps de la vidéo), puis OFF
5. **Override manuel** : le club peut forcer ON/OFF via la télécommande

**Problèmes identifiés** :

- Les clubs qui restent en phase match (before/during/after) sans toucher la télécommande pendant longtemps n'ont aucun feedback — le recording continue indéfiniment et ne s'arrête jamais
- Le timer de 15 min ne se déclenche que sur retour en neutral, pas dans les autres phases
- L'arrêt du recording est silencieux : aucune notification au club staff
- Si les clubs ne configurent pas de boucles temporelles et restent sur la boucle par défaut, aucune analytics n'est jamais collectée

**Objectif** : Rendre l'arrêt du recording visible et contrôlable pour les clubs.

## Décision

### Timer d'inactivité universel avec popup d'avertissement

Remplacer le timer "retour neutral" par un **timer d'inactivité universel** qui fonctionne dans toutes les phases. Après 15 minutes sans interaction sur la télécommande, une popup d'avertissement apparaît avec un décompte de 3 minutes. Le club peut prolonger ou arrêter le recording.

> **Note** : La "boucle NEOPRO par défaut" est un sujet séparé géré côté dashboard/central server via le système owner/lock existant dans `sponsors[]`. Ce n'est pas un champ Pi — c'est le central qui pousse les vidéos NEOPRO verrouillées dans la boucle par défaut lors du déploiement.

## Alternatives Considérées

### 1. Garder le timer neutral-only + ajouter un toast

**Avantages** : Changement minimal, pas de refonte du timer
**Inconvénients** : Ne résout pas l'absence de timeout en phase match, un toast est facilement raté
**Verdict** : Rejeté — ne couvre pas le cas des clubs qui restent en phase match

### 2. Timer d'inactivité universel avec popup (choisie)

**Avantages** :

- Couvre toutes les phases (neutral, before, during, after)
- Popup modale = impossible à rater pour le club staff
- Décompte visuel donne le temps de réagir
- Reset automatique sur toute interaction significative
- Le recording manuel (override) n'est pas affecté

**Inconvénients** :

- Changement de comportement pour les clubs existants (le timer se déclenche aussi en phase match)
- Nécessite d'instrumenter les méthodes d'interaction de la télécommande

**Verdict** : Accepté — meilleur compromis UX/collecte de données

## Conséquences

### Positives

1. Les clubs voient quand le recording va s'arrêter et peuvent prolonger
2. Les analytics sont collectées de manière plus fiable en match
3. Le recording manuel (override) n'est pas affecté par le timer d'inactivité

### Négatives

1. Les clubs habitués au recording indéfini en phase match verront une popup après 15 min d'inactivité
2. L'instrumentation des méthodes d'interaction ajoute un couplage entre `RemoteComponent` et `RecordingStateService`

### Risques

| Risque                                           | Mitigation                                                            |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| Popup jugée intrusive par les clubs              | Le bouton "Continuer" est un seul clic, reset complet du cycle        |
| Timer d'inactivité mal calibré (trop court/long) | 15 min est déjà la valeur en prod, les clubs sont habitués            |
| Interactions non détectées (scrolling, etc.)     | On instrumente uniquement les actions significatives, pas les scrolls |

## Plan d'implémentation

1. ~~Modifier `RecordingStateService` : remplacer le timer neutral-only par un timer d'inactivité universel + warning countdown~~ ✅ v3.38.0
2. ~~Écrire les tests unitaires (~10 cas)~~ ✅ v3.38.0
3. ~~Modifier `RemoteComponent` : subscription au warning, appels `notifyUserActivity()` dans les méthodes d'interaction~~ ✅ v3.38.0
4. ~~Ajouter la popup HTML + styles SCSS (avec dark mode)~~ ✅ v3.38.0
5. Auto-stop immédiat au retour en neutral (plus de timer 15+3 min en boucle par défaut) ✅ v3.43.2
6. Auto-start temporaire pour vidéos manuelles en neutral (le recording s'active le temps de la vidéo) ✅ v3.43.2
7. Retour automatique en boucle par défaut (neutral) quand le timer d'inactivité expire ✅ v3.44.5

### Critères de validation

- Tous les tests existants passent (31 recording-state + 38 analytics = 69 tests)
- La popup apparaît après 15 min d'inactivité dans les phases non-neutral
- Le retour en neutral coupe immédiatement le recording (sauf override manuel)
- Le lancement d'une vidéo manuelle en neutral active temporairement le recording
- Le bouton "Continuer" reset le cycle complet (15+3 min)
- Le décompte de 0 arrête le recording **et revient en boucle par défaut**
- Le recording manuel n'est pas affecté

## Références

- [recording-state.service.ts](../../raspberry/src/app/services/recording-state.service.ts) - Service de gestion du recording
- [tv.component.ts](../../raspberry/src/app/components/tv/tv.component.ts) - Composant TV (auto-start temporaire pour vidéos manuelles)
- [remote.component.ts](../../raspberry/src/app/components/remote/remote.component.ts) - Télécommande
- ADR-001 : Architecture Edge + Cloud
- ADR-010 : Détection HDMI-CEC pour analytics fiables

---

_Créé le 15 février 2026_
_Mis à jour le 16 février 2026 : auto-stop neutral + auto-start vidéos manuelles_
