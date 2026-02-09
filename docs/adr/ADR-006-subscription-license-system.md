# ADR-006: Système d'Abonnement et Licence Offline

**Date** : Janvier 2026 (v2.47)
**Statut** : Accepté
**Décideurs** : Équipe Neopro

---

## Contexte

Neopro opère sur un modèle SaaS avec des Raspberry Pi déployés chez les clubs sportifs. Plusieurs contraintes devaient être adressées :

1. **Monétisation** : Besoin de contrôler l'accès selon le statut d'abonnement (essai, standard, premium)
2. **Fonctionnement offline** : Les Pi peuvent rester sans connexion Internet pendant des jours/semaines
3. **Suspension granulaire** : Différents motifs de suspension (impayé, maintenance, abus) avec des comportements différents
4. **Expérience utilisateur** : Avertir progressivement avant de bloquer, pas de coupure brutale

## Décision

Adopter un **système à 3 couches avec cache local et grace period** :

```
Cloud (subscription.service.ts)     Pi (license-cache.js)     UI (license.service.ts)
       │                                    │                         │
       │ Calcule le statut licence          │                         │
       │──── sync_local_state ─────────────>│                         │
       │                                    │ Cache dans JSON local   │
       │                                    │──── /api/license ──────>│
       │                                    │                         │ Affiche état
```

### Statuts de licence

| Statut | Signification | TV | Remote |
|--------|--------------|-----|--------|
| `VALID` | Abonnement actif | OK | OK |
| `WARNING` | Expire dans ≤30 jours | OK | Bannière |
| `GRACE_PERIOD` | Expiré depuis ≤7 jours | OK | Bannière urgente |
| `CONNECTION_WARNING` | Offline 7-14 jours | OK | Bannière |
| `BLOCKED` | Expiré/suspendu/offline >14j | Écran blocage | Écran blocage |

### Constantes clés

| Variable | Valeur | Rôle |
|----------|--------|------|
| `LICENSE_CACHE_TTL_DAYS` | 7 | Durée de validité du cache local |
| `SUBSCRIPTION_GRACE_PERIOD_DAYS` | 7 | Délai de grâce après expiration |
| `MAX_OFFLINE_DAYS` | 14 | Maximum offline avant blocage (cache + grace) |
| `WARNING_THRESHOLD_DAYS` | 30 | Premier avertissement |
| `URGENT_WARNING_THRESHOLD_DAYS` | 7 | Avertissement urgent |

### Auto-déblocage

Les suspensions pour motifs financiers (`unpaid`, `expired`, `trial_ended`) se débloquent automatiquement si l'abonnement est renouvelé. Les motifs opérationnels (`maintenance`, `abuse`, `request`, `hardware`) requièrent une réactivation manuelle.

## Alternatives Considérées

### 1. Licence online-only (vérification à chaque requête)

**Avantages** : Simple, toujours à jour
**Inconvénients** : Incompatible avec le fonctionnement offline (Pi sans Internet = TV bloquée immédiatement)
**Verdict** : Rejeté — Les clubs fonctionnent souvent offline pendant les matchs.

### 2. Licence perpétuelle avec kill-switch remote

**Avantages** : Pas de gestion d'expiration locale
**Inconvénients** : Impossible de bloquer un Pi offline ; pas de dégradation progressive
**Verdict** : Rejeté — Aucun contrôle sur les Pi déconnectés.

### 3. Cache local avec grace period (choisi) ✅

**Avantages** :
- 14 jours d'autonomie offline (7j cache + 7j grace)
- Dégradation progressive (WARNING → GRACE → BLOCKED)
- Auto-déblocage intelligent selon le motif
- Backup du cache local pour résilience

**Inconvénients** :
- Complexité du calcul d'état distribué
- 14 jours de "fuite" possible (utilisation gratuite après expiration)

**Verdict** : Accepté — Meilleur compromis entre contrôle commercial et réalité terrain.

## Conséquences

### Positives

1. **Résilience** : Un club peut fonctionner 14 jours sans Internet sans interruption
2. **UX progressive** : Avertissements 30j, 7j, puis grace period avant blocage
3. **Flexibilité** : 8 motifs de suspension avec comportements distincts
4. **Audit complet** : Historique de tous les changements dans `subscription_history`

### Négatives

1. **Fenêtre de fuite** : Un client peut utiliser le service 14 jours après expiration
2. **Complexité** : 3 couches de calcul d'état à maintenir synchronisées
3. **Tables DB** : 2 nouvelles tables + 2 vues + colonnes sur `sites`

### Risques Mitigés

| Risque | Mitigation |
|--------|------------|
| Cache corrompu | Fichier backup `.backup.json` avec rollback |
| Horloge Pi décalée | Utilisation de `server_timestamp` comme référence |
| Auto-unblock abusif | Vérification stricte : suspension_reason + subscription_end > now |

## Références

- `central-server/src/services/subscription.service.ts` — Calcul statut licence
- `raspberry/sync-agent/src/license-cache.js` — Cache local Pi
- `raspberry/src/app/services/license.service.ts` — Service Angular UI
- `central-server/src/scripts/migrations/add-subscription-system.sql` — Migration DB

---

*Créé le 9 février 2026*
