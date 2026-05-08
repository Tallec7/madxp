# ADR-115: Préservation du bloc `auth` du Pi contre les sync de profils cloud

**Date** : 2026-05-08
**Statut** : Accepté
**Format** : Léger

---

## Contexte

Bug observé sur Pi en production : à chaque reboot, le `configuration.json` du
Pi voyait son bloc `auth` (clubName + password télécommande) remis à vide,
alors que le password avait été déployé via le bouton "Déployer Authentification
Club" du dashboard quelques minutes plus tôt.

Cause racine — asymétrie SaaS/Pi dans `saveClubAuth` (dashboard) :

- Mode SaaS : update direct du profil cloud par défaut (`mergeDefaultProfileConfig`).
- Mode Pi : push `update_config` au Pi mais le profil cloud (`config_profiles.configuration.auth`)
  reste à `{ clubName: "", password: "", sessionDuration: 86400000 }` (jamais
  initialisé).

À chaque `sync_profiles` (notamment au reconnect/reboot), le sync-agent fait
`applyProfile(activeProfileId)` qui re-merge le profil cloud dans le Pi. Dans
certains chemins de merge, ce profil vide pouvait écraser le bloc auth local.

## Décision

Defense-in-depth en trois couches :

1. **Pi (sync-agent)** — ajouter `'auth'` à `LOCAL_ONLY_SETTINGS` dans
   `config-merge.js`. Le bloc auth local devient souverain Pi-side. Opt-out
   explicite pour les mises à jour légitimes via `neoProContent.remotePassword`
   / `neoProContent.clubName` (le path "Déployer Authentification Club").
2. **Dashboard** — `saveClubAuth` mode Pi appelle aussi `mergeDefaultProfileConfig`
   en plus du `update_config` Pi. Le profil cloud reste cohérent avec ce que
   l'admin voit dans le dashboard (et avec ce que le Pi a au runtime).
3. **Backfill** — script SQL idempotent qui copie `sites.local_config_mirror.auth`
   dans `config_profiles.configuration.auth` quand celui-ci est vide. Couvre
   tous les sites Pi déjà connectés au cloud au moins une fois.

L'OTA Pi devient un complément (defense-in-depth), pas un blocant pour la
résolution du bug : dès le déploiement dashboard + run du backfill SQL, le
profil cloud est aligné et ne peut plus écraser le Pi.

## Alternatives rejetées

- **Fix #1 seul (LOCAL_ONLY)** : rejeté car attend que tous les Pi du parc
  reçoivent l'OTA, fenêtre de risque plusieurs jours pour les Pi peu connectés.
- **Fix #2 seul (dashboard symétrie)** : rejeté car ne couvre pas les sites
  déjà désynchronisés (profil cloud à `auth: ""`) sans le backfill.
- **Casser le bouton "Authentification Club" et passer par
  `<app-remote-auth-section>` ADR-058** : rejeté pour cette PR — la section
  ADR-058 vit en `super_admin only` et exige un PIN bcrypt, le formulaire
  Settings vise les operators et le password remote en clair. Décision déférée
  à un futur ADR.

## Conséquences

- Le password remote est désormais préservé Pi-side contre toute sync de profil
  cloud à `auth: {}`. Un admin ne peut pas vider l'auth d'un Pi par accident
  via le profil cloud — seul un push explicite via le bouton "Déployer
  Authentification Club" peut modifier.
- Le profil cloud devient cohérent avec l'état Pi pour tous les sites Pi
  setupés au moins une fois.
- Un Pi jamais connecté au cloud (cas marginal) reste protégé par la couche 1
  dès qu'il reçoit l'OTA.

## Fichiers impactés

- `raspberry/sync-agent/src/utils/config-merge.js` — `LOCAL_ONLY_SETTINGS += 'auth'` + opt-out remotePassword/clubName
- `raspberry/sync-agent/src/__tests__/config-merge.test.js` — 3 tests regression-guard
- `central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-data.service.ts` — symétrie SaaS/Pi
- `central-server/src/scripts/backfill-config-profiles-auth.sql` — backfill idempotent
- `central-server/src/__tests__/smoke/smoke-auth-preservation.test.ts` — garde-fou cross-composant
- `.claude/rules/raspberry.md` — règle "ne pas retirer 'auth' de LOCAL_ONLY_SETTINGS"
