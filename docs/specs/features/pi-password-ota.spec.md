# SPEC : Rotation OTA du mot de passe système `pi`

> **Owner** : Daisy
> **Statut** : Live (ADR-132 — deploiement 2026-05-20)
> **Dernière revue** : 2026-05-20
> **last_verified** : 2026-05-20
> **verified_against_commit** : c8dd55f2
>
> **Code principal** :
>
> **Cloud (central-server)** — source unique de vérité :
>
> - `central-server/src/services/pi-password-crypto.service.ts` (chiffrement AES-256-GCM, fail-fast si clé absente)
> - `central-server/src/services/pi-password.service.ts` (génération hash SHA-512-crypt via `openssl passwd -6 -stdin`)
> - `central-server/src/repositories/pi-password.repository.ts` (lecture/écriture colonnes `pi_password_*` dans `sites`)
> - `central-server/src/controllers/pi-password.controller.ts` + routes `POST /api/fleet/rotate-pi-password`, `GET/POST /api/sites/:id/pi-system-password*`
>
> **Pi sync-agent** — consommateur :
>
> - `raspberry/sync-agent/src/services/pi-password-sync.js` (pull hash, apply via `sudo chpasswd -e`, acquittement)
> - `raspberry/sync-agent/src/agent.js` (appel `syncPiPasswordFromCloud()` dans `handleAuthenticated()`, après `syncHotspotFromCloud()`)
> - `raspberry/sync-agent/src/config.js` (`'change_pi_password'` dans `DEFAULT_ALLOWED_COMMANDS`)
> - `raspberry/sync-agent/src/commands/index.js` (handler `change_pi_password`)
> - `raspberry/config/sudoers.d/neopro` (`NOPASSWD: /usr/sbin/chpasswd`)
>
> **ADR liés** : ADR-132 (rotation OTA mot de passe pi — one-shot avec acquittement), ADR-074 (hotspot PSK cloud-canonical — pattern de référence), ADR-120 (Pi/SaaS ownership model)
> **Migration DB** : `central-server/src/scripts/migrations/add-pi-system-password.sql`

## En une phrase

Le mot de passe Linux du compte `pi` est changé à distance depuis le dashboard super_admin via un hash SHA-512-crypt chiffré AES-256-GCM en DB ; les Pi l'appliquent à chaque reconnexion si `pi_system_password_pending = true`, puis acquittent.

## Périmètre

Domaine restreint à la rotation OTA du mot de passe système `pi` sur la flotte entière.

- **Services backend** : `pi-password-crypto.service.ts`, `pi-password.service.ts`, `pi-password.repository.ts`, `pi-password.controller.ts`
- **Routes API** : `POST /api/fleet/rotate-pi-password`, `GET /api/sites/:id/pi-system-password`, `POST /api/sites/:id/pi-password-applied`
- **Composants Pi** : `raspberry/sync-agent/src/services/pi-password-sync.js`, `raspberry/sync-agent/src/agent.js`
- **Tables DB** : `sites.pi_password_ciphertext`, `sites.pi_password_iv`, `sites.pi_password_auth_tag`, `sites.pi_system_password_pending`, `sites.pi_password_rotated_at`
- **Variable d'env** : `PI_PASSWORD_ENCRYPTION_KEY` (Railway secret, 64 hex chars)
- **ADR** : ADR-132

## Règles métier (ce qui DOIT marcher)

- **Scope flotte** : la rotation s'applique à tous les sites `site_type = 'pi'` simultanément (même mot de passe sur toute la flotte = uniformité opérationnelle).
- **One-shot avec acquittement** : `pi_system_password_pending = TRUE` est posé sur tous les Pi au déclenchement. Chaque Pi qui applique le hash remet le flag à `FALSE`. Les Pi offline rattrapent à la prochaine reconnexion (`handleAuthenticated()`).
- **Chiffrement AES-256-GCM** : le hash SHA-512-crypt ne transite jamais en clair en DB. Clé `PI_PASSWORD_ENCRYPTION_KEY` (Railway secret, fail-fast `warn` si absente — `503` si le Pi pull sans clé).
- **Hash SHA-512-crypt** : format `$6$` natif Linux PAM, généré via `openssl passwd -6 -stdin` (stdin uniquement — le mot de passe n'apparaît jamais dans `ps aux` ni dans les logs).
- **Apply côté Pi** : `echo "pi:HASH\n" | sudo /usr/sbin/chpasswd -e` — hash via stdin, jamais en argument CLI.
- **Idempotence** : si le Pi échoue l'apply, il ne acquitte pas — le cloud retente à la prochaine reconnexion.
- **Notification push** : à la rotation, `sendOrQueue('change_pi_password')` est envoyé aux Pi connectés pour application immédiate (best-effort, n'empêche pas la rotation si certains Pi sont offline).

## Séquence complète

```
super_admin → POST /api/fleet/rotate-pi-password { password }
           → hash SHA-512-crypt généré (openssl passwd -6 -stdin)
           → hash chiffré AES-256-GCM, stocké dans sites.pi_password_*
           → pi_system_password_pending = TRUE sur tous les sites pi
           → sendOrQueue('change_pi_password') pour les Pi connectés

Pi reconnecte → handleAuthenticated() → syncPiPasswordFromCloud()
             → GET /api/sites/:id/pi-system-password
             →   204 = no-op (pas de rotation en attente)
             →   200 { hash } = rotation en attente
             → echo "pi:HASH" | sudo chpasswd -e
             → POST /api/sites/:id/pi-password-applied
             → pi_system_password_pending = FALSE
```

## Bootstrap (séquence d'activation)

Le sudoers `chpasswd` est mis à jour lors de la prochaine OTA logicielle (`update_software`). Ordre obligatoire :

1. Merger la PR contenant ADR-132 → déclenche OTA flotte automatique
2. Configurer `PI_PASSWORD_ENCRYPTION_KEY` dans Railway (`openssl rand -hex 32`)
3. Déclencher la rotation via le dashboard (super_admin uniquement)

## Comportements observables

| Règle                        | Comment on vérifie                                                                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Rotation déclenchée          | `psql` : `SELECT id, pi_system_password_pending FROM sites WHERE site_type = 'pi'` → toutes les rows à `TRUE` après `POST /api/fleet/rotate-pi-password` |
| Pi applique à la reconnexion | Logs Pi `journalctl -u neopro-sync-agent -f` : message `"pi-password: applied"` + acquittement `POST /pi-password-applied` → 200                         |
| Acquittement reçu            | `psql` : `pi_system_password_pending = FALSE` pour le site acquitteur + `pi_password_rotated_at IS NOT NULL`                                             |
| Pi offline rattrape          | Pi offline → reconnecte → `handleAuthenticated()` → log `"syncPiPasswordFromCloud"` → mot de passe appliqué                                              |
| 204 si pas de rotation       | `GET /api/sites/:id/pi-system-password` → `204 No Content` quand `pending = FALSE`                                                                       |
| 503 si clé absente           | `PI_PASSWORD_ENCRYPTION_KEY` absent → `GET /api/sites/:id/pi-system-password` retourne `503` avec message ADR-132                                        |
| Hash non visible dans ps aux | `ps aux                                                                                                                                                  | grep chpasswd` → pas de hash visible (passage via stdin uniquement) |

## Cas d'edge connus

- **Pi offline lors de la rotation** : le flag `pi_system_password_pending = TRUE` persiste. À la prochaine reconnexion (`handleAuthenticated()`), le Pi pull, applique, et acquitte. Idempotent.
- **Clé `PI_PASSWORD_ENCRYPTION_KEY` absente** : le central-server émet un `warn` au boot (pas de crash). Si un Pi essaie de pull → `503` avec message explicite. La rotation ne peut pas être déclenchée (endpoint retourne 400 car `generateHash` échoue avant le chiffrement).
- **Pi qui échoue l'apply (`chpasswd` erreur)** : `pi-password-sync.js` ne POST pas l'acquittement — le flag reste `TRUE`. Le cloud réessaie à la prochaine reconnexion.
- **Rotation déclenchée deux fois** : la seconde rotation écrase le hash et remet `pending = TRUE` sur tous les Pi, y compris ceux qui avaient déjà acquitté. Idempotent.
- **Pi sans `chpasswd` dans sudoers** (pré-bootstrap) : la commande échoue, le Pi warn et ne remet pas le flag. Se corrige automatiquement après la prochaine OTA logicielle.
- **Race condition multi-admins** : deux `POST /rotate-pi-password` concurrents → deux UPDATEs SQL sur les mêmes rows → le dernier gagne (PG serialise les UPDATEs row-level). Pas de corruption possible.

## Contraintes / NE PAS FAIRE

- Ne jamais logguer le hash SHA-512-crypt dans Winston (`logger.info`, `logger.debug`) — c'est une donnée sensible même si ce n'est pas le mot de passe en clair.
- Ne jamais passer le hash en argument de ligne de commande (`chpasswd HASH` ou `openssl passwd -6 PASS`) — toujours via stdin.
- Ne pas exposer `POST /api/fleet/rotate-pi-password` à un rôle inférieur à `super_admin` — le changement de mot de passe système est irreversible sans accès Pi.
- Ne pas déporter le hash en mémoire vive (signal, env var) — le hash chiffré reste uniquement en DB entre les requêtes.
- Ne pas activer la feature avant que `PI_PASSWORD_ENCRYPTION_KEY` soit configuré en Railway.

## Ce qui n'est PAS dans le scope

- **Gestion par club** : le mot de passe `pi` est un secret opérationnel global (super_admin uniquement). Les clubs n'ont pas accès.
- **Rotation individuelle par site** : seule la rotation flotte entière est supportée (uniformité opérationnelle). Une rotation par site individuel peut être ajoutée en backlog si besoin.
- **Audit log détaillé** : qui a déclenché la rotation est loggué en Winston uniquement (`userId`). Pas de ligne dans la table `audit_logs` pour l'instant (backlog).
- **Sites SaaS** : les sites `site_type = 'saas'` n'ont pas de compte `pi` Linux — la rotation ne les concerne pas (filtre `WHERE site_type = 'pi'`).
- **Provisioning initial** : le mot de passe par défaut au flash de l'image SD reste inchangé jusqu'à la première OTA + rotation.

## Invariants de sécurité (NE JAMAIS FAIRE)

- Le hash ne doit **jamais** apparaître dans les logs (`logger.info`) ni dans les args de process (`openssl passwd -6 -stdin` + `chpasswd -e` via stdin uniquement)
- `sudo chpasswd` dans sudoers DOIT utiliser `/usr/sbin/chpasswd` (chemin absolu — pas `chpasswd` sans chemin)
- `syncPiPasswordFromCloud()` dans `handleAuthenticated()` DOIT être **après** `syncHotspotFromCloud()` (ordre de priorité réseau d'abord)
- `change_pi_password` DOIT être dans `DEFAULT_ALLOWED_COMMANDS` (sinon la commande push est droppée par la whitelist)
- La clé `PI_PASSWORD_ENCRYPTION_KEY` est **séparée** de `HOTSPOT_PSK_ENCRYPTION_KEY` pour cloisonner les secrets (ADR-074 ≠ ADR-132)

## Références

- [ADR-132](../../docs/adr/ADR-132-pi-system-password-ota-rotation.md) — Architecture Decision Record
- [ADR-074](../../docs/adr/ADR-074-hotspot-psk-cloud-canonical.md) — Pattern de référence (hotspot PSK)
- [ADR-120](../../docs/adr/ADR-120-pi-saas-ownership-model.md) — Ownership Pi vs cloud
- Migration : `central-server/src/scripts/migrations/add-pi-system-password.sql`
