# ADR-102 : Persistance DB des préférences UX télécommande (Remote V2)

**Date** : 2026-04-28
**Statut** : Accepté
**Format** : Léger
**Amend** : ADR-062 (UX/Préférences) — la règle "per-device localStorage uniquement, jamais d'appel serveur" est levée pour les préférences UX et l'activation widgets.

---

## Contexte

Daisy a remonté que les prefs Remote V2 (haptics, highContrast, lockRotation,
fontSize, layoutMobile, layoutDesktop, widgets enabled) ne survivaient pas
entre devices : un opérateur régie qui changeait de PC perdait ses prefs.

PR #688 a corrigé le bug "tous les sites SaaS forcent V2 + prefs partagées
entre clubs" en scopant les clés localStorage par `(site, profile)` (ADR-062
respecté). Mais la persistance reste device-locale → un staff qui passe sur
la TV régie depuis le PC tribune retombe sur les defaults.

ADR-062 disait explicitement _"per-device localStorage uniquement, jamais
d'appel serveur"_. C'était cohérent à la sortie de la Remote V2 (les prefs
étaient cosmétiques individuelles). Maintenant que les layouts pro régie
sont vraiment des choix éditoriaux du club (cf. SPEC-V2-LAYOUT-01) et que
les widgets activés sont pilotés par le staff, la persistance par
`(site, profile)` est devenue le bon niveau de granularité.

## Décision

Nouvelle table `remote_preferences` clé sur `(site_id, profile_id)` :

```sql
CREATE TABLE remote_preferences (
  site_id    uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES config_profiles(id) ON DELETE CASCADE,
  prefs      jsonb NOT NULL DEFAULT '{}',
  widgets    jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (site_id, profile_id)
);
```

- `prefs` (haptics, highContrast, lockRotation, fontSize, layoutMobile, layoutDesktop)
- `widgets` (score, chrono, breaking) — flags d'activation
- **Recents** (vidéos récentes) restent en localStorage : volume + privacy
  device-local, pas une pref éditoriale.

### Endpoints (`/api/saas/:siteId/profiles/:profileId/preferences`)

| Méthode | Auth                       | Validation           | Effet                                           |
| ------- | -------------------------- | -------------------- | ----------------------------------------------- |
| `GET`   | `verifyRemotePin` (si PIN) | `siteIdAndProfileId` | Retourne `{prefs, widgets, updatedAt}` ou `{}`  |
| `PUT`   | `verifyRemotePin` (si PIN) | Joi whitelist strict | Upsert (clé partielle préservée par `COALESCE`) |

Whitelist Joi sur les clés acceptées (pas de JSONB ouvert) — un client
malveillant ne peut pas polluer la table avec des champs arbitraires.

### Flow client (`RemotePreferencesService`)

1. **Boot** : GET DB. Si DB renvoie un objet vide ET localStorage non vide
   → backfill PUT one-shot (rétro-compat PR #688).
2. **`update()` / `updateWidget()`** : maj optimiste (BehaviorSubject +
   localStorage cache) + PUT debouncé 500 ms. Échec réseau → silencieux,
   le localStorage reste source de vérité jusqu'au prochain reload.
3. **Switch de profil** : `SaasConfigService.profileChanged$` émet →
   `RemotePreferencesService.reloadFromStorage()` re-fetch DB.

### Pi natif (`siteId` vide)

Comportement inchangé (localStorage-only, 1 Pi = 1 device, pas de
multi-device à supporter). Le service détecte siteId vide et
court-circuite tous les appels API.

## Conséquences

✅ Un staff régie retrouve ses prefs en passant d'un device à l'autre
sur le même `(site, profile)`.
✅ Les widgets activés deviennent un choix éditorial du club (visible
côté super_admin via la table DB).
✅ `RemotePreferencesService` reste `providedIn: 'root'` → un seul
fetch boot + un seul cache sync entre V1 et V2.

⚠️ Last-write-wins : si deux devices modifient en parallèle, le dernier
PUT écrase l'autre. Acceptable pour des prefs cosmétiques, pas pour des
données critiques (score, etc. qui sont déjà broadcastés en temps réel
via Socket.IO).

⚠️ Le PIN protège l'écriture : un profil sans PIN reste ouvert en write,
cohérent avec la lecture publique de la config (pas de régression
sécurité).

❌ Pas de versioning / audit log dédié sur la table — si on veut tracer
"qui a changé quoi", il faudra ajouter une row d'audit + une convention
sur `updated_by` (pas de session staff aujourd'hui).

## Références

- Migration : `central-server/src/scripts/migrations/add-remote-preferences-table.sql`
- Repository : `central-server/src/repositories/remote-preferences.repository.ts`
- Endpoints : `central-server/src/controllers/saas.controller.ts` (`getRemotePreferences`, `upsertRemotePreferences`)
- Service Angular : `raspberry/src/app/components/remote/remote-preferences.service.ts`
- ADR antérieurs : ADR-062 (UX/Préférences originel), ADR-058 (PIN profil), PR #688 (scoping localStorage)
