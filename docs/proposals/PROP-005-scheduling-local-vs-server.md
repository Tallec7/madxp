# PROP-005: Planification Horaire — Local (Pi) vs Serveur (Cloud)

> _Anciennement ADR-017_

**Date** : Février 2026
**Statut** : Proposé
**Décideurs** : À déterminer

---

## Contexte

Les clubs veulent programmer leur contenu :

- "La boucle sponsors tourne de 8h à 22h en semaine"
- "Le week-end, c'est la boucle match-day"
- "La pub de ce sponsor passe uniquement le mardi et jeudi"

Actuellement, les changements de boucle sont manuels (via télécommande ou dashboard).

**Question clé** : Où s'exécute la logique de planification ?

## Décision

À prendre.

## Options

### Option A : Planification côté Pi (cron local)

**Principe** : Le Pi reçoit un planning complet et l'exécute localement, indépendamment du cloud.

```json
// configuration.json du Pi
{
  "schedule": {
    "weekday": {
      "08:00-12:00": { "loop": "sponsors_matin" },
      "12:00-14:00": { "loop": "sponsors_midi" },
      "14:00-22:00": { "loop": "sponsors_apresmidi" }
    },
    "weekend": {
      "09:00-22:00": { "loop": "match_day" }
    }
  }
}
```

**Avantages** :

- **Fonctionne offline** : Le Pi exécute le planning même sans Internet
- Latence nulle : le changement se fait localement
- Cohérent avec l'architecture edge (ADR-001)
- Pas de charge serveur supplémentaire

**Inconvénients** :

- Le Pi doit avoir une horloge fiable (NTP requis)
- Modification du planning = redéploiement de la config
- Logique de scheduling à implémenter dans le composant TV Angular
- Timezone à gérer localement

**Estimation effort** : Moyen
**Alignement architecture** : ✅ Fort (edge autonome)

### Option B : Planification côté serveur (push)

**Principe** : Le serveur central envoie la bonne configuration au bon moment via Socket.IO.

```typescript
// cron-scheduler.service.ts
cron.schedule('0 8 * * 1-5', () => {
  // 8h en semaine → pousser boucle sponsors
  sites.forEach((site) => {
    socketService.emit(site.id, 'update_config', {
      activeLoop: 'sponsors_matin',
    });
  });
});
```

**Avantages** :

- Contrôle centralisé total
- Changements de planning sans redéploiement
- Logique de scheduling dans un seul endroit (serveur)

**Inconvénients** :

- **Ne fonctionne pas offline** : Si Internet coupe, pas de changement de boucle
- Charge serveur : 50+ sites × N changements/jour = beaucoup de messages
- Latence réseau pour chaque changement
- Incohérent avec l'autonomie edge (ADR-001)

**Estimation effort** : Moyen
**Alignement architecture** : ❌ Faible (dépendance cloud)

### Option C : Hybride (planning local + override serveur)

**Principe** : Le Pi a le planning complet en local (autonome) mais le serveur peut pousser des overrides en temps réel.

```json
// configuration.json du Pi
{
  "schedule": { ... },  // Planning par défaut (autonome)
  "override": null       // Peut être écrasé par le serveur
}
```

**Avantages** :

- **Fonctionne offline** (planning local)
- **Flexibilité** : Override depuis le dashboard pour les cas spéciaux
- Meilleur des deux mondes

**Inconvénients** :

- Plus complexe à implémenter
- Deux sources de vérité (planning local + override serveur)
- Conflit possible entre planning et override

**Estimation effort** : Élevé
**Alignement architecture** : ✅ Fort

## Recommandation

**Option A (Pi local)** pour la V1 :

- Cohérent avec ADR-001 (autonomie edge)
- Le planning est juste un champ `schedule` dans `configuration.json`
- Le composant TV lit le planning et change de boucle automatiquement
- Le watermark a déjà un système de scheduling (jours + heures) → réutiliser le pattern

Option C en V2 si le besoin d'override temps réel se confirme.

## Références

- ADR-001 : Architecture Edge + Cloud
- [watermark.service.ts](../../raspberry/src/app/services/watermark.service.ts) - Scheduling existant (jours + heures)
- [tv.component.ts](../../raspberry/src/app/components/tv/tv.component.ts) - getLoopVideosForPhase()

---

_Créé le 11 février 2026_
