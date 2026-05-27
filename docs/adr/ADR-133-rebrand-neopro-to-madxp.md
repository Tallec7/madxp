# ADR-133 : Rebrand NEOPRO → MadXP

**Date** : 2026-05-26
**Statut** : Accepté
**Décideurs** : Daisy

---

## Contexte

L'entreprise NEOPRO s'arrête. Le projet et toute son infrastructure sont conservés, mais migrés sous une nouvelle marque : **MadXP** (groupe Kalon Partners).

Le rebrand doit toucher l'intégralité du périmètre sans casser la flotte Pi déployée (NLF, Mangin-Beaulieu, et autres clubs en prod handball), sans perte d'historique git, et sans interruption de service côté dashboard/SaaS.

**Inventaire surface** (audit du 2026-05-26) :

- ~22 900 occurrences de `neopro/Neopro/NEOPRO` dans ~1 132 fichiers
- 12 services systemd `neopro-*.service` sur la flotte Pi
- Paths `/etc/neopro/`, `/home/pi/neopro/` (18+21 fichiers)
- 119 métriques Prometheus `neopro_*` + 7 dashboards Grafana + Alertmanager
- Domaine actuel `neopro-admin.kalonpartners.bzh` (CF Pages projet `neopro-frontend-prod`)
- API Railway `neopro-central` (custom `neopro-central-production.up.railway.app`)
- FTP Hostinger `kalonpartners.bzh/neopro-video/` + `/neopro-update/`
- mDNS `neopro.local` sur tous les Pi
- Repo GitHub `Tallec7/neopro`
- Emails `noreply@neopro.fr`, `admin@neopro.fr`
- Enum DB `category = 'NEOPRO'`, `owner = 'neopro'`
- SSID hotspot Pi `NEOPRO-CLUB-XXX` (ADR-074)

## Décision

Rebrand **complet** en 8 phases séquencées, avec **convention naming figée** et stratégie **hybride** pour la flotte Pi déployée afin d'éviter une OTA risquée de migration de paths.

### Convention naming

| Forme                | Usage                                                          | Exemples                                                                            |
| -------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `madxp` (lowercase)  | paths Unix, URLs, env vars, identifiants techniques, slugs npm | `/etc/madxp/`, `madxp.local`, `MADXP_ROOT`, `madxp-central-server`                  |
| `MadXP` (PascalCase) | UI utilisateur, prose, titres, branding visuel                 | "Solution MadXP SaaS", `<title>MadXP</title>`                                       |
| `MADXP` (uppercase)  | titres en capitales, constantes uppercase, écran admin         | `# Documentation MADXP`, `MFA_ISSUER='MadXP'` (PascalCase ici car app TOTP affiche) |

### Cibles infrastructure

| Surface              | Avant                                      | Après                                          |
| -------------------- | ------------------------------------------ | ---------------------------------------------- |
| Dashboard admin      | `neopro-admin.kalonpartners.bzh`           | `madxp.kalonpartners.bzh`                      |
| Portail club SaaS    | `neopro-admin.kalonpartners.bzh/saas/`     | `madxp.kalonpartners.bzh/saas/`                |
| API prod             | `neopro-central-production.up.railway.app` | `api.madxp.kalonpartners.bzh` (custom Railway) |
| API staging          | `api-staging.kalonpartners.bzh`            | `api-staging.madxp.kalonpartners.bzh`          |
| CF Pages prod        | `neopro-frontend-prod`                     | `madxp-frontend-prod`                          |
| CF Pages staging     | `neopro-exg`                               | `madxp-staging`                                |
| Railway service prod | `neopro-central`                           | `madxp-central`                                |
| FTP assets           | `/neopro-video/`                           | `/madxp-video/` (double-écriture transition)   |
| FTP updates OTA      | `/neopro-update/`                          | `/madxp-update/`                               |
| Email outbound       | `noreply@neopro.fr`                        | `noreply@madxp.kalonpartners.bzh`              |
| Repo GitHub          | `Tallec7/neopro`                           | `Tallec7/madxp`                                |

### Stratégie flotte Pi (HYBRIDE)

La flotte Pi en prod ne supporte pas une migration brutale de paths (`/etc/neopro/` → `/etc/madxp/`) sans risque d'incident (cf. règle `.claude/rules/raspberry.md`).

**Pattern adopté** :

- **Lecture** : code Pi lit `/etc/madxp/*.conf` en premier, fallback `/etc/neopro/*.conf` si absent.
- **Écriture** (nouveaux Pi flashés post-rebrand) : `/etc/madxp/`.
- **Écriture** (Pi existants) : conservent `/etc/neopro/` jusqu'à OTA dédiée Phase 8.
- **Services systemd** : `madxp-*.service` créés en **alias** des `neopro-*.service` (pas de remplacement). Les anciens services restent actifs sur les Pi existants.
- **mDNS** : `madxp.local` ajouté en alias, `neopro.local` conservé.
- **SSID hotspot** : `NEOPRO-CLUB-*` conservé tant qu'aucune raison opérationnelle de re-provisionner les hotspots (ADR-074 inchangée).

### Stratégie métriques Prometheus

**Rename brutal** `neopro_*` → `madxp_*` accepté. Dashboards Grafana ("NeoPro Blind Spots", "NeoPro Overview", etc.) à refaire en parallèle dans la PR métriques. Alertmanager (`docker/alertmanager/alertmanager.yml`) à mettre à jour.

Risque accepté : perte temporaire de visibilité sur historique des métriques renommées. Le coût d'une double-émission pendant 3 mois n'est pas justifié vu la taille de l'équipe.

### Stratégie FTP

**Double-écriture** transition. Code central-server upload vers `/madxp-video/` ET `/neopro-video/` pendant N semaines. Code Pi lit `/madxp-video/` en premier, fallback legacy. Migration SQL `videos.storage_path` réécrit `neopro-video` → `madxp-video` dans les rows existantes. Sunset legacy après audit "0 row pointing legacy" + audit "flotte Pi 100% sur nouvelle URL".

### Stratégie secrets

**Rotation complète** à la Phase 6 : JWT, FTP passwords, SendGrid, GitHub PAT, Slack webhook, HOTSPOT_PSK_ENCRYPTION_KEY (cf. ADR-074), MFA_ENCRYPTION_KEY (impact : tous les admins doivent re-scanner leur QR Google Authenticator → comm obligatoire), TEMPLATE_PROXY_HMAC_SECRET (cf. ADR-113), PI_SYSTEM_PASSWORD (cf. ADR-132).

L'audit du 2026-05-26 a exposé un GitHub PAT en clair dans le transcript d'un agent — **P0 révoqué le 2026-05-26**.

## Plan en 8 phases

| #   | Scope                                                                                  | Risque                     | PR                                                      |
| --- | -------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------- |
| 1   | Docs froides (brand mentions)                                                          | LOW                        | [#1065](https://github.com/Tallec7/neopro/pull/1065) ✅ |
| 2   | Code surface (package.json, manifests, HTML brand)                                     | LOW                        | [#1066](https://github.com/Tallec7/neopro/pull/1066) ✅ |
| 3   | ADR-133 + CLAUDE.md + `.claude/rules/context.md`                                       | LOW                        | cette PR                                                |
| 4   | Hybride Pi double-path (lecture `/etc/madxp/` fallback `/etc/neopro/`) + alias systemd | MEDIUM                     | à venir                                                 |
| 5   | Métriques Prometheus rename brutal + dashboards Grafana + Alertmanager                 | MEDIUM                     | à venir                                                 |
| 6   | FTP migration data + script SQL `storage_path` + double-écriture                       | HIGH                       | à venir                                                 |
| 7   | Bascule cloud : Railway/CF Pages rename + env vars + secrets rotation + DNS            | HIGH (fenêtre maintenance) | à venir                                                 |
| 8   | Repo GitHub rename + bootstrap Pi `install.sh` URL + OTA flotte                        | HIGH                       | à venir                                                 |

**Sunset** (mois +3 à +12 après Phase 8) : drop redirects ancien domaine, drop fallback `/etc/neopro/`, drop alias `neopro-*.service`, drop FTP legacy paths après audit.

## Alternatives considérées

### 1. Rebrand brutal en 1 PR géante

**Avantages** : un seul go/no-go, état "propre" instantanément.
**Inconvénients** : impossible à reviewer, ne survit pas à une régression terrain, casse forcément la flotte Pi déployée, rotation des secrets pas planifiable atomiquement avec le code.
**Verdict** : Rejeté.

### 2. Garder NEOPRO et n'ajouter MadXP qu'en façade UI

**Avantages** : zéro risque infra, zéro travail Phase 4-8.
**Inconvénients** : l'entreprise NEOPRO s'arrête, le nom doit disparaître complètement (consigne Daisy). Un visiteur du code voit toujours NEOPRO partout. Branding incohérent.
**Verdict** : Rejeté.

### 3. Phasage par layer (DB → API → frontend → infra)

**Avantages** : modèle académique propre.
**Inconvénients** : pas adapté à la réalité — le coût n'est pas dans le DB (enum stable), il est dans l'infra (Railway/CF Pages/FTP/flotte Pi) et la rotation des secrets. Le phasage par RISQUE (low → high) est plus pertinent ici.
**Verdict** : Rejeté.

### 4. Phasage par risque, hybride flotte Pi, rename brutal métriques (choisie) ✅

**Avantages** : chaque PR isolable, mergeable, reverteable. Flotte Pi protégée par double-path. Secrets rotés une fois au point de bascule cloud.
**Inconvénients** : 8 PRs étalées sur 3-4 semaines. Période transitoire où NEOPRO et MadXP coexistent.
**Verdict** : Accepté.

## Conséquences

### Positives

1. Identité visuelle complètement migrée, l'entreprise NEOPRO peut se fermer proprement.
2. Occasion de roter tous les secrets en bloc cohérent (sécu améliorée).
3. Occasion de mettre en place la branch protection `main` (constatée absente lors de l'audit).
4. Occasion de supprimer le service Railway orphelin `postgres-staging` (économie ~$1-2/mois).
5. Documentation actualisée : règles `.claude/rules/`, ADRs, runbooks reflètent la nouvelle identité.

### Négatives

1. Pendant la transition (~1 mois), `neopro` et `madxp` coexistent dans le code → cognitive load review.
2. Pendant la transition flotte Pi, deux conventions de paths cohabitent → debug terrain plus complexe.
3. La migration FTP nécessite une fenêtre de double-écriture avec coût stockage temporaire.
4. Tous les utilisateurs admin doivent re-scanner leur QR Google Authenticator (changement `MFA_ISSUER`).
5. Tous les utilisateurs sont déconnectés au moment du changement de cookie domain.

### Risques

| Risque                                                                              | Mitigation                                                                            |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| OTA Phase 8 casse un Pi en prod                                                     | Double-path en Phase 4 garantit le fallback ; OTA non urgente                         |
| Rotation `HOTSPOT_PSK_ENCRYPTION_KEY` casse le décrypt des PSK existants            | Rotation = re-chiffrement à chaud de tous les PSK avec migration script (cf. ADR-074) |
| Cassure liens externes (Slack, Notion, badges) après rename repo                    | Maintenir l'ancien repo en redirect GitHub (auto), audit liens externes               |
| Email `noreply@madxp.kalonpartners.bzh` en spam folder                              | Configurer SPF/DKIM/DMARC pour `kalonpartners.bzh` AVANT bascule SendGrid sender      |
| Synthetic monitoring (`frontend-health.yml`) casse                                  | Mettre à jour le workflow dans la même PR que la bascule DNS                          |
| Bootstrap Pi `tallec7.github.io/neopro/install/setup.sh` casse pour nouveaux flashs | Publier sous nouveau path **avant** rename repo, garder ancien path en redirect       |

## Hors scope ADR-133 (explicitement)

- Migration des **données DB** (enum `category='NEOPRO'`, `owner='neopro'`) — restent tels quels, ce sont des identifiants techniques sans visibilité utilisateur.
- Migration des **noms de tables/colonnes** — aucun ne contient "neopro" actuellement.
- Migration des **identifiants code TS** (`isNeoproVideo()`, `extractNeoproVideoPaths`, etc.) — rebrand purement cosmétique sans gain métier, repoussé sine die.
- Changement du nom de domaine `kalonpartners.bzh` lui-même — c'est le domaine du groupe Kalon Partners, conservé.

## Références

- Audit inventaire : agent Explore du 2026-05-26 (rapport `REBRAND-INVENTORY.md` produit en session)
- Audit infra : agent general-purpose du 2026-05-26 (DNS, Cloudflare, Railway, FTP)
- PR #1065 : docs rebrand
- PR #1066 : code surface (package.json, manifests, HTML)
- ADR-074 : Hotspot PSK (impact rotation `HOTSPOT_PSK_ENCRYPTION_KEY`)
- ADR-113 : FTP creds rotation (`npm run rotate:ftp-creds`)
- ADR-132 : Pi system password rotation
