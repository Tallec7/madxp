# ADR-020: Expiration Automatique de Contenu

**Date** : Février 2026
**Statut** : Proposé
**Décideurs** : À déterminer

---

## Contexte

Les contrats sponsors ont une durée limitée (3 mois, 6 mois, 1 an). Quand un contrat se termine, la vidéo du sponsor doit être retirée de la boucle. Aujourd'hui :

1. La chargée de com' doit penser à retirer manuellement la vidéo
2. Si elle oublie, la pub continue de tourner gratuitement
3. Pire : le sponsor constate que sa pub tourne après la fin du contrat et demande un geste commercial

**Objectif** : Retirer automatiquement une vidéo de la boucle à une date définie.

## Décision

À prendre.

## Options

### Option A : Expiration côté Pi (local)

**Principe** : La date d'expiration est stockée dans `configuration.json`. Le composant TV vérifie avant chaque lecture.

```json
{
  "sponsors": [
    {
      "name": "Sponsor A",
      "path": "videos/sponsor_a.mp4",
      "expiresAt": "2026-06-30T23:59:59Z"
    }
  ]
}
```

```typescript
// tv.component.ts
getActiveSponsors(): Sponsor[] {
  return this.sponsors.filter(s =>
    !s.expiresAt || new Date(s.expiresAt) > new Date()
  );
}
```

**Avantages** :
- **Fonctionne offline** : Le Pi retire la vidéo même sans Internet
- Latence nulle : vérification à chaque cycle de boucle
- Simple : un champ `expiresAt` par vidéo
- Cohérent avec l'architecture edge (ADR-001)

**Inconvénients** :
- L'horloge du Pi doit être correcte (NTP requis)
- La vidéo reste physiquement sur le Pi (juste pas jouée)
- Pas de notification quand une vidéo expire

**Estimation effort** : Faible

### Option B : Expiration côté serveur (push)

**Principe** : Un cron serveur vérifie les dates d'expiration et envoie un `update_config` pour retirer les vidéos expirées.

```typescript
// cron-scheduler.service.ts
cron.schedule('0 0 * * *', async () => { // Minuit chaque jour
  const expiredVideos = await getExpiredSponsorVideos();
  for (const { siteId, videoId } of expiredVideos) {
    await removeVideoFromLoop(siteId, videoId);
    await sendUpdateConfig(siteId);
  }
});
```

**Avantages** :
- Contrôle centralisé
- Notification possible (email au sponsor, alerte à l'opérateur)
- Peut aussi supprimer le fichier du Pi

**Inconvénients** :
- **Ne fonctionne pas offline** : Si le Pi est déconnecté le jour de l'expiration, la vidéo continue
- Charge serveur (vérification quotidienne × N sites × M vidéos)
- Dépend de la connexion cloud

**Estimation effort** : Moyen

### Option C : Hybride (local + notification serveur) ✅

**Principe** : Le Pi gère l'expiration localement. Le serveur envoie des notifications et peut forcer un cleanup.

```
Pi (local) :
  - Vérifie expiresAt avant chaque lecture → filtre automatique
  - Fonctionne offline

Serveur (cloud) :
  - Cron quotidien vérifie les expirations à venir
  - J-7 : Notifie l'opérateur ("Sponsor A expire dans 7 jours")
  - J-0 : Notifie l'opérateur + sponsor ("Contrat terminé")
  - J+1 : Optionnel — envoie update_config pour cleanup complet
```

**Avantages** :
- Fonctionne offline (Pi local)
- Notifications proactives (serveur)
- Le meilleur des deux mondes

**Inconvénients** :
- Deux systèmes à synchroniser
- Légèrement plus complexe

**Estimation effort** : Moyen

## Recommandation

**Option C (hybride)** :
1. **V1** : Champ `expiresAt` sur les vidéos dans `configuration.json` + filtre côté Pi
2. **V1** : Champ `expiresAt` dans l'UI dashboard (date picker dans la config de boucle)
3. **V2** : Cron serveur pour notifications (J-7, J-0) via email
4. **V2** : Alerte prédictive "contenu expirant bientôt" (extension ADR-010 alertes prédictives)

### Gestion de la vidéo expirée

| Action | Quand | Qui |
|--------|-------|-----|
| Vidéo non jouée dans la boucle | `expiresAt` dépassé | Pi (automatique) |
| Notification opérateur | J-7 et J-0 | Serveur (cron) |
| Notification sponsor | J-0 | Serveur (email) |
| Suppression du fichier vidéo | Manuel ou après 30 jours | Opérateur ou cron |

## Références

- [tv.component.ts](../../raspberry/src/app/components/tv/tv.component.ts) - getLoopVideosForPhase()
- [config-merge.js](../../raspberry/sync-agent/src/utils/config-merge.js) - Structure configuration
- [predictive-alerts.service.ts](../../central-server/src/services/predictive-alerts.service.ts) - Pattern alertes
- ADR-001 : Architecture Edge + Cloud (autonomie Pi)
- ADR-013 : Merge intelligent de configuration
- ADR-017 : Planification horaire (même pattern local-first)

---

*Créé le 11 février 2026*
