# NFR — Non-Functional Requirements

> MadXP — Système de TV interactive pour clubs sportifs.
> Architecture 3-tiers : Dashboard Angular 20 → Central Server Express/PG → Raspberry Pi Edge.
> **Date** : Avril 2026 | **Version** : 2.0

---

## 1. Performance

| NFR-ID  | Exigence                                                         | Cible mesurable                    |
| ------- | ---------------------------------------------------------------- | ---------------------------------- |
| NFR-P01 | Latence commande Socket.IO (télécommande → Pi, réseau LAN local) | < 10 ms                            |
| NFR-P02 | Latence commande Socket.IO (remote cloud — ADR-059)              | < 500 ms (p95)                     |
| NFR-P03 | Temps de réponse API REST — endpoints CRUD courants (p95)        | < 300 ms                           |
| NFR-P04 | Temps de réponse API REST — analytics/KPI/sponsor stats (p95)    | < 5 s                              |
| NFR-P05 | Temps de réponse DB queries (p95)                                | < 2 s                              |
| NFR-P06 | Heartbeat Pi → cloud                                             | Toutes les 30 s ; alerte si > 90 s |
| NFR-P07 | Analytics flush (batch `video_plays`)                            | Toutes les 5 min                   |
| NFR-P08 | Boot Pi complet (systemd → Angular kiosk affiché sur TV)         | < 60 s                             |
| NFR-P09 | Déploiement OTA (backup + download + restart + validation)       | < 10 min                           |
| NFR-P10 | Validation post-OTA (checks critiques)                           | < 1 min après `startServices()`    |
| NFR-P11 | Détection HDMI (udev)                                            | < 1 s ; polling fallback 5 s       |
| NFR-P12 | Reconnexion Socket.IO après coupure réseau Pi                    | < 5 s (backoff exponentiel)        |

**Rate limiting API (par user/IP — fenêtre 1 min) :**

| Périmètre                            | Max      |
| ------------------------------------ | -------- |
| API générale                         | 100 req  |
| Auth / login                         | 60 req   |
| Commandes sensibles (deploy, remote) | 30 req   |
| Admin dashboard                      | 400 req  |
| Pi analytics                         | 500 req  |
| Upload vidéo                         | 50/heure |

---

## 2. Disponibilité & Résilience

| NFR-ID  | Exigence                                                                | Cible mesurable                                                             |
| ------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| NFR-D01 | Uptime Central Server (Railway)                                         | Alerte critique si `up == 0` pendant > 2 min                                |
| NFR-D02 | Pi — lecture vidéo locale sans internet                                 | 100 % fonctionnel en mode hors-ligne                                        |
| NFR-D03 | Pi — autonomie offline complète (vidéos + télécommande locale + scores) | ≥ 24 h sans Central Server                                                  |
| NFR-D04 | Fallback réseau Pi — 3 couches (ADR-060)                                | Cloud Socket.IO → LAN auto → offline queue localStorage                     |
| NFR-D05 | Drain offline queue à la reconnexion                                    | Automatique, sans intervention                                              |
| NFR-D06 | Recovery Chromium crash (watchdog)                                      | < 30 s                                                                      |
| NFR-D07 | Recovery sync-agent crash (`sync-guardian`)                             | < 30 s (systemd watchdog)                                                   |
| NFR-D08 | Rollback OTA automatique                                                | Déclenché si checks critiques échouent (services, HTTP health, config.json) |
| NFR-D09 | Canary monitoring post-OTA                                              | Checks toutes les 30 s sur fenêtre 5 min ; alerte `canary_post_ota`         |
| NFR-D10 | Alerting Prometheus → Alertmanager                                      | Délai alerte < 2 min après seuil franchi                                    |
| NFR-D11 | Failover HDMI primaire → HDMI-1                                         | Automatique en cas de perte du display maître (F-23.6)                      |

---

## 3. Sécurité

| NFR-ID  | Exigence                    | Cible mesurable                                                                      |
| ------- | --------------------------- | ------------------------------------------------------------------------------------ |
| NFR-S01 | Authentification Dashboard  | JWT HttpOnly cookie + Bearer token ; session ≤ 24 h                                  |
| NFR-S02 | MFA                         | TOTP (RFC 6238) disponible pour tous ; obligatoire super_admin/admin                 |
| NFR-S03 | PIN par profil Pi (ADR-058) | bcrypt rounds=12 ; lockout après 5 tentatives / 10 min par `ip:profileId`            |
| NFR-S04 | API key site                | Format immuable (changement casserait tous les Pi) ; rotation possible via Dashboard |
| NFR-S05 | Isolation multi-tenant      | RLS PostgreSQL sur toutes les tables sensibles ; middleware RLS Context              |
| NFR-S06 | Requêtes SQL paramétrées    | 0 concaténation de chaîne (`$1`, `$2` uniquement) — ESLint enforced                  |
| NFR-S07 | Validation inputs           | Schéma Joi sur 100 % des routes (45+ body, 17 params, 13 query)                      |
| NFR-S08 | Transport chiffré           | TLS 1.3 sur API et Dashboard ; WSS pour Socket.IO                                    |
| NFR-S09 | Headers sécurité HTTP       | Helmet.js : HSTS, X-Frame-Options, CSP, X-Content-Type-Options                       |
| NFR-S10 | CSP Pi admin                | `script-src 'self'` / `connect-src 'self'`                                           |
| NFR-S11 | Firewall Pi (ufw)           | Ports ouverts : 80, 443, 3000, 8080 uniquement                                       |
| NFR-S12 | Secrets hors dépôt git      | 0 `.env` ou clé committée ; Railway/Supabase env vars uniquement                     |
| NFR-S13 | Audit trail                 | Toutes les actions admin dans `audit_logs` ; Winston JSON structuré + Correlation ID |
| NFR-S14 | Hachage mots de passe       | bcrypt ≥ 10 rounds ; jamais stockés en clair                                         |

---

## 4. Scalabilité

| NFR-ID   | Exigence                              | Cible mesurable                                                           |
| -------- | ------------------------------------- | ------------------------------------------------------------------------- |
| NFR-SC01 | Flotte Pi supportée (objectif PI-2/3) | 500 boîtiers Pi simultanés (Socket.IO rooms)                              |
| NFR-SC02 | Sites SaaS (ADR-037)                  | Multi-tenant illimité sans refactoring                                    |
| NFR-SC03 | Utilisateurs dashboard                | < 10 000 (AIPD RGPD §5.1)                                                 |
| NFR-SC04 | DB connection pool                    | 5 connexions Supabase Transaction Mode (PgBouncer port 6543) ; clamp 1-50 |
| NFR-SC05 | Alerte saturation pool DB             | `DbPoolSaturation` si active/total > 80 % pendant 3 min                   |
| NFR-SC06 | DB size                               | Alerte warning > 400 MB ; critique > 475 MB                               |
| NFR-SC07 | Heap mémoire API (Railway Hobby)      | < 256 MB RSS ; Memory Manager cleanup à 93 % heap                         |
| NFR-SC08 | Alerte mémoire haute                  | `HighMemoryUsage` si RSS > 226 MB (88 %)                                  |
| NFR-SC09 | Bounded Maps in-memory                | `metricHistory` max 200 clés × 60 snapshots ; `pendingCommands` cap 100   |
| NFR-SC10 | Scalabilité horizontale API           | Stateless Railway + Redis adapter Socket.IO (sticky sessions)             |
| NFR-SC11 | Vidéos par site                       | ≥ 500 vidéos par site avec pagination obligatoire                         |

---

## 5. Maintenabilité & Qualité Code

| NFR-ID  | Exigence                        | Cible mesurable                                                           |
| ------- | ------------------------------- | ------------------------------------------------------------------------- |
| NFR-M01 | Taille maximale fichier source  | < 400 lignes (split proactif)                                             |
| NFR-M02 | TypeScript strict               | 0 `any` implicite ; 0 erreur `tsc --strict`                               |
| NFR-M03 | Pattern Repository              | 0 `query()` direct dans controllers (ESLint enforced)                     |
| NFR-M04 | Logger                          | 0 `console.log` dans `central-server/` (Winston uniquement)               |
| NFR-M05 | Validation                      | Joi avant tout traitement ; 400 si schéma invalide                        |
| NFR-M06 | Commits                         | Conventional Commits `feat(scope):` / `fix(scope):` / `docs:`             |
| NFR-M07 | Linting                         | 0 erreur ESLint sur `npm run lint` avant merge                            |
| NFR-M08 | Tests API Jest (central-server) | 2 728 tests ; 0 régression                                                |
| NFR-M09 | Smoke tests régressions wiring  | 1 221 tests, 12 domaines ; ≤ 30 s (smart)                                 |
| NFR-M10 | Tests Karma Angular dashboard   | 520 tests                                                                 |
| NFR-M11 | Tests Jest Pi (server + admin)  | 71 + 194 = 265 tests                                                      |
| NFR-M12 | Total tests                     | ~4 734 tests toutes suites                                                |
| NFR-M13 | ADR process                     | Toute décision architecturale cross-composant documentée dans `docs/adr/` |
| NFR-M14 | Build artifacts                 | `raspberry/admin/public/app.js` et `styles.css` exclus de git             |

---

## 6. Conformité & RGPD

| NFR-ID  | Exigence                                  | Cible mesurable                                                                                  |
| ------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| NFR-R01 | Données personnelles                      | Collecte minimale ; aucune donnée sensible Art. 9 ; pas de profilage                             |
| NFR-R02 | Rétention logs accès                      | 12 mois glissants puis anonymisation                                                             |
| NFR-R03 | Rétention analytics vidéo (`video_plays`) | 24 mois max                                                                                      |
| NFR-R04 | Rétention comptes utilisateurs            | Durée contrat + 3 ans                                                                            |
| NFR-R05 | Rétention facturation                     | 10 ans (obligation comptable)                                                                    |
| NFR-R06 | Hébergement données EU                    | Supabase Irlande (PostgreSQL) + Hostinger UE (FTP)                                               |
| NFR-R07 | Chiffrement transit                       | TLS 1.3                                                                                          |
| NFR-R08 | Chiffrement repos                         | AES-256-GCM (backups Supabase)                                                                   |
| NFR-R09 | Notification violation CNIL               | < 72 h après constatation                                                                        |
| NFR-R10 | Hachage mots de passe                     | bcrypt 10 rounds ; jamais en clair                                                               |
| NFR-R11 | Cookies                                   | JWT HttpOnly uniquement ; `sameSite: 'strict'` ; pas de cookie analytics tiers sans consentement |
| NFR-R12 | Droit d'effacement                        | Suppression compte + données associées ≤ 30 jours sur demande                                    |

---

## 7. Contraintes matérielles Pi

| NFR-ID   | Exigence                      | Cible mesurable                                                   |
| -------- | ----------------------------- | ----------------------------------------------------------------- |
| NFR-HW01 | Modèle matériel               | Raspberry Pi 4 — 4 GB RAM minimum                                 |
| NFR-HW02 | Stockage                      | SD card ≥ 32 GB ; gestion espace par sync-agent                   |
| NFR-HW03 | Décodage vidéo                | H.264 hardware (GPU VideoCore)                                    |
| NFR-HW04 | Résolution HDMI               | 1920 × 1080 auto-détectée (xrandr → EDID DTD1 → fallback 1080p)   |
| NFR-HW05 | Dual display                  | HDMI-0 master + HDMI-1 slave, sync par `videoIndex`               |
| NFR-HW06 | Hotspot Pi interne            | `wlan0` SSID `NEOPRO_xxx` — IP 192.168.4.1 — télécommande locale  |
| NFR-HW07 | WiFi internet                 | `wlan1` (USB) — sync cloud                                        |
| NFR-HW08 | bssid-lock interdit (ADR-011) | `bgscan` désactivé ; mesh WiFi interdit sans Ethernet             |
| NFR-HW09 | Signal WiFi minimum           | Alerte `lowWifiSignal` si < -70 dBm (cooldown 6 h/site)           |
| NFR-HW10 | Portail captif                | Détection HTTP 204 ; alerte `captive_portal_detected`             |
| NFR-HW11 | Mode kiosk                    | Chromium plein écran ; accès clavier/souris physiques bloqués     |
| NFR-HW12 | Ports réseau exposés          | 80 (nginx/Angular), 3000 (Socket.IO), 8080 (admin)                |
| NFR-HW13 | OTA — rollback                | Automatique si critiques échouent ; canary 5 min post-déploiement |
| NFR-HW14 | Température CPU               | Throttling à 85 °C ; alerte si > 80 °C en usage continu           |

---

## 8. Tableau de synthèse

| NFR-ID   | Catégorie     | Exigence                       | Cible mesurable            | Priorité MoSCoW |
| -------- | ------------- | ------------------------------ | -------------------------- | --------------- |
| NFR-P01  | Performance   | Latence Socket.IO LAN          | < 10 ms                    | Must            |
| NFR-P02  | Performance   | Latence Socket.IO cloud remote | < 500 ms p95               | Must            |
| NFR-P03  | Performance   | API REST CRUD (p95)            | < 300 ms                   | Must            |
| NFR-P06  | Performance   | Heartbeat Pi                   | 30 s ; alerte > 90 s       | Must            |
| NFR-P08  | Performance   | Boot Pi complet                | < 60 s                     | Must            |
| NFR-P09  | Performance   | Déploiement OTA                | < 10 min                   | Should          |
| NFR-D01  | Disponibilité | Uptime Central Server          | Alerte si down > 2 min     | Must            |
| NFR-D02  | Disponibilité | Pi offline vidéo locale        | 100 % fonctionnel          | Must            |
| NFR-D03  | Disponibilité | Pi autonomie hors-ligne        | ≥ 24 h                     | Must            |
| NFR-D04  | Disponibilité | Fallback réseau 3 couches      | Automatique                | Must            |
| NFR-D06  | Disponibilité | Recovery Chromium crash        | < 30 s                     | Must            |
| NFR-D08  | Disponibilité | Rollback OTA automatique       | Sur échec checks critiques | Must            |
| NFR-D10  | Disponibilité | Alerting Prometheus            | < 2 min                    | Should          |
| NFR-S01  | Sécurité      | Auth JWT HttpOnly              | Session ≤ 24 h             | Must            |
| NFR-S02  | Sécurité      | MFA TOTP admin                 | Obligatoire super_admin    | Must            |
| NFR-S03  | Sécurité      | PIN Pi bcrypt + lockout        | 5 tentatives / 10 min      | Must            |
| NFR-S05  | Sécurité      | Isolation multi-tenant         | RLS PostgreSQL             | Must            |
| NFR-S06  | Sécurité      | Zéro injection SQL             | ESLint enforced            | Must            |
| NFR-S07  | Sécurité      | Validation Joi                 | 100 % des routes           | Must            |
| NFR-S08  | Sécurité      | Transport chiffré              | TLS 1.3 + WSS              | Must            |
| NFR-SC01 | Scalabilité   | Flotte Pi cible                | 500 boîtiers               | Should          |
| NFR-SC04 | Scalabilité   | Pool DB                        | 5 connexions (clamp 1-50)  | Must            |
| NFR-SC05 | Scalabilité   | Alerte pool saturation         | > 80 % pendant 3 min       | Should          |
| NFR-SC07 | Scalabilité   | Heap API Railway               | < 256 MB RSS               | Must            |
| NFR-M01  | Qualité       | Taille fichiers                | < 400 lignes               | Should          |
| NFR-M02  | Qualité       | TypeScript strict              | 0 `any` implicite          | Must            |
| NFR-M03  | Qualité       | Repository pattern             | 0 `query()` direct         | Must            |
| NFR-M07  | Qualité       | Linting                        | 0 erreur ESLint            | Must            |
| NFR-M12  | Qualité       | Couverture tests               | ~4 734 tests               | Must            |
| NFR-R01  | RGPD          | Collecte minimale              | Aucune donnée Art. 9       | Must            |
| NFR-R02  | RGPD          | Logs accès                     | ≤ 12 mois                  | Must            |
| NFR-R06  | RGPD          | Hébergement EU                 | Supabase IE + Hostinger UE | Must            |
| NFR-R09  | RGPD          | Notification violation         | < 72 h CNIL                | Must            |
| NFR-HW01 | Matériel Pi   | Hardware minimum               | RPi 4, 4 GB RAM            | Must            |
| NFR-HW03 | Matériel Pi   | Résolution HDMI                | 1920 × 1080 auto           | Must            |
| NFR-HW08 | Matériel Pi   | WiFi (no bssid-lock)           | ADR-011 respecté           | Must            |
| NFR-HW13 | Matériel Pi   | OTA rollback                   | Automatique                | Must            |

---

> **Sources** : `CLAUDE.md`, `docs/technical/ARCHITECTURE.md`, `docs/adr/`, `docs/legal/GDPR_PROCESSING_REGISTER.md`, `central-server/src/middleware/user-rate-limit.ts`, `docs/audit/ARCHITECTURE_REVIEW_2026-02-09.md`
