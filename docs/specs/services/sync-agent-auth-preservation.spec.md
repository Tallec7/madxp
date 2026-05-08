# SPEC : Sync-agent — Préservation du bloc `auth` Pi

> **Owner** : Daisy
> **Statut** : Live
> **Dernière revue** : 2026-05-08
> **Code principal** :
>
> - `raspberry/sync-agent/src/utils/config-merge.js` (`LOCAL_ONLY_SETTINGS` + opt-out remotePassword/clubName)
> - `raspberry/sync-agent/src/commands/sync-profiles.js` (`applyProfile` — consommateur principal du merge)
> - `raspberry/sync-agent/src/commands/update-config.js` (path "Déployer Authentification Club")
> - `central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-data.service.ts` (symétrie SaaS/Pi `saveClubAuth`)
> - `central-server/src/scripts/backfill-config-profiles-auth.sql` (backfill one-shot des profils cloud existants)
>
> **ADR liés** : ADR-115 (préservation du bloc `auth` Pi contre les sync de profils cloud)
> **Smoke tests** :
>
> - `central-server/src/__tests__/smoke/smoke-auth-preservation.test.ts` (5 contrats cross-composant)
> - `raspberry/sync-agent/src/__tests__/config-merge.test.js` (3 cas `auth preservation (ADR-115)`)
>
> **`.claude/rules/` lié** : `raspberry.md` section "Sync-Agent" — règle ADR-115 (ne pas retirer 'auth' de LOCAL_ONLY_SETTINGS)

## En une phrase

Le bloc `auth` du `configuration.json` Pi (`clubName` + `password` télécommande + `sessionDuration`) est souverain Pi-side ; un profil cloud à `auth: { password: "" }` ne peut pas l'écraser au reboot, sauf push explicite via le bouton "Déployer Authentification Club" du dashboard.

## Périmètre

- **Inclus** : la liste `LOCAL_ONLY_SETTINGS` du sync-agent, l'opt-out merge sur `remotePassword`/`clubName`, la symétrie SaaS/Pi de `saveClubAuth` côté dashboard, le backfill SQL one-shot.
- **Couvre** : fichier Pi `/home/pi/neopro/webapp/configuration.json` (bloc `auth`), DB `config_profiles.configuration.auth`, DB `sites.local_config_mirror.auth`, route Pi `/login` (consomme `auth.password`).
- **Exclu** : `<app-remote-auth-section>` ADR-058 (PIN bcrypt par profil, super_admin only) — coexiste avec le canal "password en clair" Settings tab et fait l'objet d'un futur ADR.

## Règles métier

- Le `password` télécommande appartient au club et est saisi/déployé par un admin Neopro depuis le dashboard. Il n'est pas dérivé d'une source externe.
- Le password est stocké en clair dans `configuration.json.auth.password` côté Pi (consommé par `/login` Angular du Pi) — la confidentialité est assurée par le périmètre LAN du Pi et les permissions fichier (`pi:pi`, 644). Le PIN bcrypt par profil ADR-058 est un canal séparé qui ne remplace pas celui-ci.
- Le bouton "Déployer Authentification Club" du Settings tab est l'UNIQUE chemin de mise à jour (mode Pi et mode SaaS) ; un sync de profil cloud ne peut JAMAIS modifier l'auth Pi sans intention explicite.
- Le profil cloud par défaut (`config_profiles.is_default = TRUE`) doit refléter l'état Pi pour permettre le ré-imaging d'un boîtier (continuité de service en cas de panne hardware).

## Comportements observables

- **Reboot Pi** : `auth.clubName` et `auth.password` survivent à `applyProfile()` au démarrage. `journalctl -u neopro-sync-agent` log `[config-merge] Paramètre local préservé: auth` quand un profil cloud à `auth: {}` est appliqué.
- **Déploiement explicite** : un clic sur "Déployer Authentification Club" log `[config-merge] Mot de passe télécommande mis à jour` et `[config-merge] Nom du club mis à jour: <X>` côté sync-agent ; côté DB, `config_profiles.configuration.auth` est aligné en parallèle.
- **Backfill** : la sortie `psql ... -f backfill-config-profiles-auth.sql` retourne `profiles_backfilled` + `array_agg(site_name)` listant les sites traités. Idempotent : run multiple = résultat identique.
- **Login télécommande** : après reboot, l'utilisateur tape directement son password sans passer par l'écran "Configurer le mot de passe" (= l'`auth.password` n'est pas vide).

## Cas d'edge

- **Pi jamais connecté au cloud** : pas couvert par le backfill SQL (pas de `local_config_mirror`). À sa première connexion, le profil cloud sera vide → couche 1 (sync-agent OTA) le protège dès qu'il a reçu la nouvelle version.
- **Site jamais setupé (auth vide partout)** : le backfill skip volontairement (filtre `local_config_mirror->'auth'->>'password' != ''`). Comportement actuel inchangé : l'écran "Configurer le mot de passe" s'affiche jusqu'au premier déploiement.
- **Update partiel** : si l'admin met à jour uniquement `clubName` (laisse password vide), le merge garde le password Pi local existant grâce au check truthy `if (neoProContent.remotePassword)`.
- **Désync cloud volontaire** : un super_admin qui veut effectivement vider l'auth d'un site doit passer par une intervention DB directe — aucun chemin UI ne le permet (et c'est intentionnel).

## Ce qui n'est PAS dans ce SPEC

- **`<app-remote-auth-section>` ADR-058** (PIN bcrypt par profil, super_admin only) : canal séparé pour valider une commande télécommande. Coexiste avec le password en clair Settings tab. Décision de fusion déférée à un futur ADR.
- **Rotation périodique des passwords** : non implémentée. Daisy peut imposer une rotation manuelle via le bouton "Déployer" — pas de policy automatique côté serveur.
- **Hash du password** : le password est en clair dans `configuration.json` (LAN Pi only). Une migration vers hash exigerait de changer le contrat Angular `/login` et le chemin "Déployer" — hors scope ADR-115.
- **Hotspot WiFi PSK** : géré séparément par ADR-074 (chiffré AES-256-GCM cloud-side, dérivé scrypt côté hostapd Pi). Ne partage rien avec `auth.password`.

## Références

- [ADR-115](../../adr/ADR-115-auth-preserved-on-sync.md)
- ADR-058 — Remote auth per profile (PIN bcrypt) — coexistence
