# ADR-132 — Rotation OTA du mot de passe système `pi`

**Statut** : Accepté  
**Date** : 2026-05-20  
**Auteur** : Daisy (MadXP)

---

## Contexte

Le compte système Linux `pi` sur toute la flotte partage un mot de passe générique faible, modifiable par n'importe quel opérateur de club ayant un accès physique au boîtier. Ce vecteur d'accès SSH non maîtrisé expose la flotte à :

- Modification non autorisée de la configuration locale
- Contournement du modèle d'ownership Pi vs cloud (ADR-120)
- Pivot réseau vers d'autres Pi sur le même LAN

## Décision

Implémenter un mécanisme OTA **one-shot avec acquittement** pour changer le mot de passe système `pi` sur l'ensemble de la flotte, piloté depuis le dashboard central par le super_admin.

### Choix structurants

| Question        | Décision                                                | Raison                                           |
| --------------- | ------------------------------------------------------- | ------------------------------------------------ |
| Scope           | Flotte entière (même mdp)                               | Uniformité opérationnelle                        |
| Modèle          | One-shot + acquittement (flag `pending`)                | Idempotent, Pi offline rattrape à la reconnexion |
| Hash            | SHA-512-crypt (`$6$`) via `openssl passwd -6 -stdin`    | Format natif Linux PAM, compatible `chpasswd -e` |
| Stockage        | AES-256-GCM dans `sites` (pattern ADR-074)              | Cohérence avec `wifi_psk_encrypted`              |
| Transmission    | TLS sync-agent → central (canal existant)               | Pas de double chiffrement nécessaire             |
| Clé chiffrement | `PI_PASSWORD_ENCRYPTION_KEY` (Railway secret, 32 bytes) | Clé séparée de ADR-074 pour cloisonner           |

## Architecture

### Flux complet

```
super_admin → POST /api/fleet/rotate-pi-password { password: "..." }
           → hash SHA-512 généré (openssl passwd -6 -stdin)
           → hash chiffré AES-256-GCM, stocké dans sites.*
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

### Colonnes DB ajoutées (`sites`)

```sql
pi_password_ciphertext  BYTEA              -- hash chiffré AES-256-GCM
pi_password_iv          BYTEA              -- IV (12 bytes)
pi_password_auth_tag    BYTEA              -- tag d'auth GCM
pi_system_password_pending BOOLEAN NOT NULL DEFAULT FALSE
pi_password_rotated_at  TIMESTAMPTZ        -- horodatage du trigger (pas de l'acquittement)
```

### Fichiers nouveaux

| Fichier                                                            | Rôle                          |
| ------------------------------------------------------------------ | ----------------------------- |
| `central-server/src/scripts/migrations/add-pi-system-password.sql` | Migration DB                  |
| `central-server/src/services/pi-password-crypto.service.ts`        | AES-256-GCM encrypt/decrypt   |
| `central-server/src/services/pi-password.service.ts`               | Génération hash SHA-512-crypt |
| `central-server/src/repositories/pi-password.repository.ts`        | Accès DB                      |
| `central-server/src/controllers/pi-password.controller.ts`         | Handlers HTTP                 |
| `central-server/src/routes/pi-password.routes.ts`                  | Endpoints Express             |
| `raspberry/sync-agent/src/services/pi-password-sync.js`            | Pull + apply côté Pi          |

### Fichiers modifiés

| Fichier                                       | Modification                                           |
| --------------------------------------------- | ------------------------------------------------------ |
| `raspberry/config/sudoers.d/neopro`           | `NOPASSWD: /usr/sbin/chpasswd`                         |
| `raspberry/sync-agent/src/config.js`          | `'change_pi_password'` dans `DEFAULT_ALLOWED_COMMANDS` |
| `raspberry/sync-agent/src/commands/index.js`  | Handler `change_pi_password`                           |
| `raspberry/sync-agent/src/agent.js`           | `syncPiPasswordFromCloud()` dans `handleAuthenticated` |
| `central-server/src/middleware/validation.ts` | Schema `rotatePiPassword`                              |
| `central-server/src/server.ts`                | Import + mount + fail-fast env check                   |
| `central-server/src/scripts/full-schema.sql`  | Nouvelles colonnes                                     |

### Endpoints

```
POST /api/fleet/rotate-pi-password          JWT super_admin, sensitiveRateLimit
GET  /api/sites/:id/pi-system-password      Bearer <apiKey>, adminRateLimit
POST /api/sites/:id/pi-password-applied     Bearer <apiKey>, adminRateLimit
```

## Variable d'environnement Railway

```
PI_PASSWORD_ENCRYPTION_KEY=<64 hex chars>   # openssl rand -hex 32
```

La clé est **optionnelle** : si absente, la feature est inactive (warn au boot, 503 si le Pi pull). Si définie mais invalide en production → crash au boot.

## Invariants (smoke test à créer)

- `sudo chpasswd` dans sudoers DOIT utiliser `/usr/sbin/chpasswd` (chemin absolu)
- Le hash ne doit **jamais** apparaître dans les logs (`logger.info`) ni dans les args de process (`ps aux` safe : passage via stdin)
- `syncPiPasswordFromCloud()` dans `handleAuthenticated()` DOIT être après `syncHotspotFromCloud()` (ordre de priorité)
- `change_pi_password` DOIT être dans `DEFAULT_ALLOWED_COMMANDS` (sinon la commande push ne passe pas le whitelist)

## Bootstrap

Le sudoers `chpasswd` est mis à jour lors de la prochaine OTA logicielle (`update_software`). La séquence correcte :

1. Merger cette PR → déclencher une OTA flotte (update_software)
2. Configurer `PI_PASSWORD_ENCRYPTION_KEY` dans Railway
3. Déclencher la rotation via le dashboard

## Conséquences

- **+** Le mdp `pi` peut être changé à distance sur l'ensemble de la flotte en <5 min
- **+** Les Pi offline appliquent à la prochaine reconnexion (idempotent)
- **+** Pas de mot de passe en clair dans les logs, la DB, ou les arguments de process
- **−** Un redéploiement Railway efface le hash en mémoire → pas un problème car le hash est en DB chiffré

## Références

- ADR-074 : Hotspot PSK cloud-canonical (pattern de référence)
- ADR-120 : Pi/SaaS ownership model
- Migration : `add-pi-system-password.sql`
