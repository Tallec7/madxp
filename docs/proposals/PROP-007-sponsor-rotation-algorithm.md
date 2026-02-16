# ADR-019: Algorithme de Rotation Équitable des Sponsors

**Date** : Février 2026
**Statut** : Proposé
**Décideurs** : À déterminer

---

## Contexte

Un club a typiquement 5-10 sponsors dans sa boucle vidéo. Les sponsors paient le même prix et s'attendent à un temps d'affichage équitable. Aujourd'hui :

1. L'ordre de la boucle est fixe (défini par la chargée de com')
2. Le premier sponsor est toujours vu plus souvent (les spectateurs arrivent/partent en cours de boucle)
3. Il n'y a pas de preuve de répartition équitable
4. Si un sponsor a une vidéo de 30s et un autre de 10s, le temps d'affichage est déséquilibré

**Objectif** : Garantir une répartition équitable du temps d'affichage entre sponsors et le prouver.

## Décision

À prendre.

## Options

### Option A : Round-robin strict (rotation séquentielle)

**Principe** : Les vidéos tournent dans un ordre fixe mais la position de départ change à chaque cycle.

```
Cycle 1 : A → B → C → D → E
Cycle 2 : B → C → D → E → A
Cycle 3 : C → D → E → A → B
```

**Avantages** :

- Simple à implémenter
- Prévisible
- Chaque sponsor passe en première position à tour de rôle

**Inconvénients** :

- Ne compense pas les différences de durée (vidéo 30s vs 10s)
- Ne tient pas compte des phases de match (mi-temps = plus de spectateurs)
- Rotation mécanique visible (toujours le même pattern décalé)

**Estimation effort** : Faible

### Option B : Pondération par durée (temps d'affichage égal)

**Principe** : L'algorithme calcule combien de fois chaque vidéo doit passer pour que le temps total soit équivalent.

```
Sponsor A : vidéo 30s → passe 2 fois = 60s
Sponsor B : vidéo 10s → passe 6 fois = 60s
Sponsor C : vidéo 20s → passe 3 fois = 60s
```

**Avantages** :

- **Temps d'affichage vraiment équitable**
- Compense les différences de durée des vidéos
- Justifiable auprès des sponsors

**Inconvénients** :

- Le sponsor avec une vidéo courte passe plus souvent (impression de surreprésentation)
- Calcul à refaire si la boucle change
- Le spectateur voit certains sponsors plus souvent que d'autres

**Estimation effort** : Moyen

### Option C : Shuffle aléatoire avec rééquilibrage

**Principe** : L'ordre est mélangé aléatoirement mais un compteur garantit que chaque sponsor a le même nombre de passages sur une fenêtre donnée.

```
Compteurs sur 1 heure :
  A: 12 passages | B: 11 passages | C: 12 passages | D: 10 passages
  → D est en déficit → D passe en priorité au prochain cycle
```

**Avantages** :

- **Pas de pattern visible** pour les spectateurs
- Équitable sur la durée
- Adaptable : on peut pondérer (sponsor premium = 2× plus de passages)

**Inconvénients** :

- Plus complexe à implémenter
- Nécessite un compteur persistant (localStorage ou fichier)
- Résultat moins prévisible (plus difficile à expliquer au sponsor)

**Estimation effort** : Moyen à Élevé

### Option D : Pondération par contrat (premium/standard)

**Principe** : Chaque sponsor a un "poids" défini par son contrat. Un sponsor premium a 2× ou 3× plus de temps.

```json
{
  "sponsors": [
    { "name": "Sponsor A", "weight": 2, "video": "a.mp4" },
    { "name": "Sponsor B", "weight": 1, "video": "b.mp4" },
    { "name": "Sponsor C", "weight": 3, "video": "c.mp4" }
  ]
}
```

**Avantages** :

- Différenciation commerciale (packs Bronze/Silver/Gold)
- Revenu supplémentaire (sponsor premium paie plus)
- Compatible avec les autres options (rotation + pondération)

**Inconvénients** :

- Complexifie la configuration
- Le sponsor standard peut se plaindre de voir moins sa pub
- Nécessite un modèle commercial clair

**Estimation effort** : Faible (au-dessus des autres options)

## Recommandation

**Option A (round-robin) + Option D (poids contrat)** pour la V1 :

- Simple à implémenter et à expliquer
- Le poids `weight` est un multiplicateur du nombre de passages dans la boucle
- Rapport de preuve : "Votre vidéo a été diffusée X fois, position moyenne #Y dans la boucle"

**Option C (shuffle + rééquilibrage)** en V2 si les sponsors demandent plus de sophistication.

### Preuve de diffusion

Quelle que soit l'option, le système doit produire un **certificat de diffusion** :

```
Sponsor A — Janvier 2026
  Passages total : 847
  Temps d'affichage : 7h05min
  Répartition : 16.2% du temps total (5 sponsors, cible 20%)
  Audience estimée : ~3200 spectateurs
```

Ce certificat est la vraie valeur ajoutée pour le commercial.

## Références

- [tv.component.ts](../../raspberry/src/app/components/tv/tv.component.ts) - Logique de boucle actuelle
- [pdf-report.service.ts](../../central-server/src/services/pdf-report.service.ts) - Rapports existants
- ADR-010 : HDMI-CEC (données fiables pour les certificats)

---

_Créé le 11 février 2026_
