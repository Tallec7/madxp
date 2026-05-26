# ADR-122 : Rappels reconnexion Pi — in-app télécommande + email club

**Date** : 2026-05-14
**Statut** : Proposé (validé par le fondateur, à implémenter dans une PR dédiée)
**Décideurs** : Daisy
**Référence amont** : [ADR-120](ADR-120-pi-saas-ownership-model.md) (modèle ownership Pi), [pi-connectivity-model.spec.md](../specs/features/pi-connectivity-model.spec.md) (état actuel + gaps)

---

## Contexte

L'offre Pi est vendue avec la promesse "Pi reconnecté minimum 1×/mois pour push analytics + pull MAJ config". Audit du code au 2026-05-14 (cf. spec `pi-connectivity-model`) révèle que cette promesse n'a **aucun garde-fou applicatif réel** :

- Seuls les sites avec `network_profile.type = 'mesh'` sont couverts par une alerte 24h (CRON `network-alerts.service.ts:220-233`)
- La majorité de la flotte (sites simples, ethernet, enterprise) n'a aucune détection "Pi non vu depuis N jours"
- Aucun mécanisme automatique ne rappelle au club de reconnecter son Pi (pas de colonne `sites.contact_email`, pas de CRON dédié, pas de notif in-app)
- L'alerte ponctuelle `siteOffline` (grace 60s) cible MADXP uniquement et ne crie qu'au moment de la déconnexion initiale — silence total après

Sans intervention, un club peut laisser son Pi offline plusieurs mois sans qu'aucun signal automatique ne soit émis.

### Patterns existants à réutiliser

Trois patterns sont déjà implémentés dans le code pour des cas similaires :

| Pattern                                          | Code                                 | Adaptable au Pi reconnect ?                                    |
| ------------------------------------------------ | ------------------------------------ | -------------------------------------------------------------- |
| Warning in-app via `message_remote` télécommande | `subscription.service.ts:181-213`    | ✅ Oui — afficher "Dernière sync il y a X jours" en permanence |
| Email CRON aux admins MADXP                      | `cron-tasks/report.task.ts:34-50`    | ✅ Oui — déjà câblé, juste à étendre                           |
| Email CRON via `contact_email` (sponsors)        | `monthly-reports.service.ts:512-527` | ⚠️ Nécessite ajout `sites.contact_email`                       |

L'architecture est prête. Il faut câbler le cas spécifique "Pi reconnect" en s'appuyant dessus.

## Décision

Implémenter **deux mécanismes complémentaires** (Option α + Option β) pour garantir que la promesse "1 mois max" soit tenue.

### Option α — Rappel passif in-app dans la télécommande

Inspiré du Pattern 1 (subscription warning).

**Mécanisme** :

1. Le sync-agent Pi écrit dans un fichier local `webapp/data/last-cloud-sync.json` à chaque sync réussie avec le cloud :
   ```json
   { "lastSyncAt": "2026-04-30T14:32:00Z", "sourceCloudCommit": "abdd99ba" }
   ```
2. Le serveur Pi (`raspberry/server/`) lit ce fichier et expose `GET /api/connectivity-status` qui calcule `daysSinceLastSync`
3. La télécommande Angular Pi affiche en permanence en haut de l'écran (ou dans un coin discret) :
   - Si `< 7 j` : rien (pas de pollution UX)
   - Si `7-14 j` : info subtile "Synchronisé il y a X jours"
   - Si `15-29 j` : warning visible "⚠️ Pi non synchronisé depuis X jours — pensez à reconnecter à internet"
   - Si `≥ 30 j` : alerte critique "🔴 Pi non synchronisé depuis X jours — reconnexion urgente, sinon analytics et MAJ bloqués"

**Indépendant du cloud** : marche même si Pi offline depuis longtemps (lecture filesystem local).

**Effort estimé** : ~1 jour

- Sync-agent : écriture `last-cloud-sync.json` (~2h)
- Server Pi : endpoint `/api/connectivity-status` (~2h)
- Télécommande Angular : bannière conditionnelle (~3h)
- Smoke test garde-fou (~1h)

### Option β — Email actif au club via CRON

Inspiré du Pattern 3 (sponsor monthly).

**Mécanisme** :

1. **Migration DB** : ajouter `sites.contact_email VARCHAR(255)` (nullable). Optionnellement : `sites.contact_phone` pour SMS futur, `sites.preferred_locale` pour i18n des emails.
2. **UI dashboard** : champ "Email de contact du club" sur la page `/sites/:id/settings`, réservé aux super_admin + admin pour éditer.
3. **Onboarding** : ajout de ce champ dans le formulaire de création de site Pi (CONTRIBUTING.md / onboarding flow).
4. **Nouveau CRON task** `executePiOfflineReminderTask` dans `cron-tasks/pi-offline-reminder.task.ts` :
   - Tourne toutes les 24h
   - Sélectionne les sites `site_type = 'pi'` avec `last_seen_at < NOW() - INTERVAL 'X days'` ET `contact_email IS NOT NULL`
   - Détermine la tranche d'alerte : J+15 (info), J+25 (warning), J+35 (critique), J+60 (escalade MADXP)
   - Dédup : ne renvoie un email que si pas envoyé pour la même tranche (`pi_offline_reminders_sent` table ou colonne sur `sites`)
   - Appelle `emailService.sendPiOfflineReminder(contactEmail, { siteName, daysSinceLastSync, tier, helpUrl })`
5. **Template email** dans `email.service.ts` : `sendPiOfflineReminder()` avec corps :

   ```
   Bonjour,

   Votre boîtier MadXP du club <X> n'a pas été connecté à internet depuis
   <N> jours. Pour conserver vos analytics et recevoir les dernières mises
   à jour, merci de connecter le Pi à internet quand vous pouvez.

   Aide : <lien support>
   ```

6. **Anti-spam** : 4 emails max sur l'année par site (J+15, J+25, J+35, J+60), puis silence sauf nouvelle déconnexion après une reconnexion.

**Effort estimé** : ~2-3 jours

- Migration DB + backfill (~0.5 j)
- UI dashboard + form onboarding (~0.5 j)
- Nouveau CRON task + dédup (~1 j)
- Template email + tests (~0.5 j)
- Smoke tests + observabilité (~0.5 j)

### Phase 3 — Garde-fou cloud générique (= étendre `network-alerts.service.ts`)

Complément aux Options α et β : on veut aussi que MADXP (équipe interne) soit alerté pour TOUS les Pi orphelins, pas que les mesh.

**Mécanisme** :

1. Ajouter dans `network-alerts.service.ts` un nouveau check **indépendant du `network_profile`** :
   ```typescript
   // Risk 7: Site offline depuis longtemps (tous profils)
   if (site.status === 'offline' && hoursSinceLastSeen > GENERIC_OFFLINE_THRESHOLD_HOURS) {
     risks.push({
       riskType: 'site_offline_extended',
       severity: hoursSinceLastSeen > 720 ? 'critical' : 'warning', // 30j
       details: `Site offline depuis ${days}j (tous profils)`,
     });
   }
   ```
2. Default `GENERIC_OFFLINE_THRESHOLD_HOURS = 336` (= 14 jours), configurable par env var ou per-site via future colonne `sites.offline_alert_threshold_hours`.
3. **Auto-resolve** : quand le Pi reconnecte (`socket.service.ts` event), passer les rows `alerts.alert_type LIKE 'site_offline_%'` à `status = 'resolved'`.

**Effort estimé** : ~0.5 jour

- Check supplémentaire dans `assessSiteRisks()` (~2h)
- Auto-resolve à la reconnexion (~1h)
- Smoke test garde-fou (~1h)

### Total

**~4 jours cumulés** (α + β + Phase 3), livrables indépendamment.

## Alternatives considérées

### 1. Statu quo (rien faire)

**Verdict** : Rejeté — la promesse commerciale "1 mois max" n'est pas tenue, risque réputationnel et SLA. Le fondateur a explicitement validé qu'il fallait combler le gap.

### 2. Option α seule (sans email)

**Verdict** : Rejeté — un Pi offline ne fetch pas le message in-app. Sans email actif, un club qui n'utilise pas la télécommande pendant 1 mois ne saura jamais qu'il faut reconnecter.

### 3. Option β seule (sans rappel in-app)

**Verdict** : Rejeté — un email peut être ignoré ou tomber dans les spams. Le rappel passif télécommande pique le staff sur place et complète bien le canal email.

### 4. SMS / push mobile / notification 4G backup

**Verdict** : Reporté — solution premium future, pas critique pour Phase 1. Discussion commerciale séparée.

### 5. Sanction technique (désactivation du Pi après N jours)

**Verdict** : Rejeté — casse la promesse "Pi fonctionne offline". Contre-productif si le club continue à utiliser le système localement.

## Conséquences

### Positives

1. La promesse "Pi reconnecté minimum 1×/mois" devient **applicativement garantie** (rappels + détection cloud).
2. Le club est notifié sur 2 canaux (in-app + email) → couverture maximale.
3. MADXP détecte tous les Pi orphelins, plus seulement les mesh.
4. Auto-resolve des alertes `site_offline` à la reconnexion → dashboard moins bruyant.
5. Réutilisation des patterns existants (subscription warning + sponsor monthly) → cohérence architecturale.

### Négatives

1. Effort total ~4 jours répartis sur cloud + Pi + dashboard.
2. Migration DB pour `sites.contact_email` → besoin de backfill (initialement NULL pour tous les sites existants, à saisir manuellement par les opérateurs).
3. Risque de spam perçu côté club si le seuil J+15 est trop strict → mitigé par anti-spam à 4 emails/an max.

### Risques

| Risque                                                                                 | Mitigation                                                                                                                           |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Sync-agent ne write pas `last-cloud-sync.json` correctement → bannière incohérente     | Smoke test `smoke-pi-connectivity-banner.test.ts` qui valide le flow E2E                                                             |
| Email finit dans les spams du club                                                     | Utiliser le domaine email MADXP authentifié SPF/DKIM/DMARC ; éviter sujets sensationnalistes                                         |
| Spam si Pi reconnecte/déconnecte en flip-flop                                          | Dédup par tranche dans `pi_offline_reminders_sent` ; reset uniquement après reconnect stable > 24h                                   |
| Colonne `sites.contact_email` reste NULL pour la flotte existante                      | Backfill manuel via dashboard + script CLI pour les sites principaux ; alerte MADXP si un Pi tier ≥ premium reste sans contact_email |
| Confusion entre `users` rôle `'club'` (login portail) et `sites.contact_email` (notif) | Doc explicite + nullable ; ne pas réutiliser l'email user club (peut être différent)                                                 |

## Plan d'implémentation

### Phase 1 — Garde-fou cloud générique (~0.5 j) — ⚠️ priorité

Rapide à livrer, débloque immédiatement la visibilité MADXP.

1. Étendre `network-alerts.service.ts:170-244` avec `Risk 7: site_offline_extended` indépendant du profil
2. Auto-resolve `site_offline_*` à la reconnexion (`socket.service.ts` connect handler)
3. Smoke `smoke-network-alerts-generic-offline.test.ts`

### Phase 2 — Option α (in-app télécommande, ~1 j)

1. Sync-agent : écrit `webapp/data/last-cloud-sync.json` à chaque sync réussie
2. `raspberry/server/` : endpoint `GET /api/connectivity-status`
3. Télécommande Angular : bannière conditionnelle (4 seuils 0/7/15/30 j)
4. Smoke test

### Phase 3 — Option β (email club, ~2-3 j)

1. Migration `add-sites-contact-email.sql`
2. UI dashboard : champ contact_email sur `/sites/:id/settings`
3. Form onboarding création site Pi
4. CRON task `executePiOfflineReminderTask` + dédup `pi_offline_reminders_sent`
5. Template email `sendPiOfflineReminder()`
6. Smoke tests

### Critères de validation globale

- Un Pi offline depuis 15 jours déclenche un email au `contact_email` du club (si saisi)
- Au prochain reconnect, l'alerte `site_offline_extended` passe à `resolved` automatiquement
- La télécommande affiche en permanence "Synchronisé il y a X jours" si X ≥ 7
- Le Pi affiche le bon `daysSinceLastSync` même quand il est offline depuis 3 mois
- Anti-spam : pas plus de 4 emails/an/site pour le même cycle d'offline

## Références

- [pi-connectivity-model.spec.md](../specs/features/pi-connectivity-model.spec.md) — état actuel + gaps documentés
- [ADR-120](ADR-120-pi-saas-ownership-model.md) — modèle ownership Pi vs SaaS
- [ADR-111](ADR-111-alert-repository-dedup.md) — dédup alerts (utilisé pour `site_offline_*`)
- `central-server/src/services/subscription.service.ts:181-213` — Pattern 1 (in-app message_remote)
- `central-server/src/services/monthly-reports.service.ts:512-527` — Pattern 3 (email via contact_email)
- `central-server/src/cron-tasks/report.task.ts` — Pattern 2 (email admin MADXP)
- `central-server/src/services/network-alerts.service.ts:170-244` — à étendre Phase 1
