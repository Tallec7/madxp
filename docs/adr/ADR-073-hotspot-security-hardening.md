# ADR-073 : Durcissement sécurité hotspot + dashboard local

**Date** : 2026-04-19
**Statut** : Accepté
**Format** : Complet
**Auteur** : Guillaume (CTO)
**Contexte audit** : `docs/audit/AUDIT-2026-04-19-hotspot-systemic.md`

---

## Contexte

L'audit sécurité de la stack hotspot (Pi 4/5 → hostapd+dnsmasq → remote staff) a révélé
9 points d'amélioration, dont **6 P0** (impact sécurité immédiat) :

- **S1** — PSK WiFi identique pour toute la flotte (`NeoProWiFi2025` hardcodé) →
  compromission d'un club = compromission de tous
- **S2** — Pas d'authentification sur le serveur Socket.IO du Pi (port 3000, `origin: true`) →
  n'importe quel device sur le LAN peut piloter la TV
- **S3** — Clients WiFi associés au hotspot pouvaient joindre les autres clients sur le
  sous-réseau 192.168.4.0/24 (pas d'`ap_isolate`)
- **S4** — Mot de passe admin du Pi stocké en clair dans `configuration.json`
- **S5** — Routes admin (backup/videos/sponsors) vulnérables au path traversal via le
  paramètre `filename`
- **S6** — Règles sudoers trop laxes : `modprobe *`, `cp /tmp/neopro-* /etc/wpa_supplicant/*`,
  `/home/pi/neopro/scripts/*`, `sed -i * /etc/hostapd/hostapd.conf`

Plus 2 « fonctionnelles » priorisées (impact offline-first) :

- **F1** — Captive portal non renvoyé sur les endpoints de détection OS (Android/iOS)
- **F7** — Pertes d'événements hostapd (auth failures, PSK mismatch) quand le socket central
  est déconnecté — diagnostic à distance impossible après coup

Contrainte forte MadXP : le Pi doit rester **fonctionnel hors-ligne** (clubs sans internet),
donc pas de dépendance serveur pour générer/vérifier les credentials, et aucune rotation
automatique silencieuse qui casserait les clients staff.

## Décision

Implémenter les 6 P0 + F1 + F7 + un dashboard hotspot local sur le serveur admin (`:8080`)
pour donner au club la capacité de :

1. Voir en direct qui est connecté au hotspot (MAC, signal, trafic)
2. Consulter le journal hostapd (events auth/deauth/PSK mismatch)
3. Rotationner la PSK WiFi sans SSH

### S1 — PSK unique par club

`install.sh` génère une clé aléatoire (`openssl rand -base64 16` + suffixe `Neo`) à
l'installation si le 2e argument n'est pas fourni. Le template `hostapd.conf` contient un
placeholder `NEOPRO_PLACEHOLDER_RUN_INSTALL_SH` — hostapd refuse de démarrer si le
placeholder survit (fail-safe).

### S2 — Socket.IO auth token (opt-in)

`io.use()` middleware dans `raspberry/server/server.js` exige un token si
`security.socketAuthToken` est défini dans `configuration.json`. Cache 5s pour éviter
de relire le fichier à chaque connexion (rotation OK via reload config).
**Opt-in** : si le champ est absent, pas d'auth (backward-compat avec les remotes
existantes v ≤ 3.193.9).

### S3 — ap_isolate=1

Ajout de `ap_isolate=1` dans `raspberry/config/systemd/hostapd.conf`. Les clients
hotspot (téléphones staff, remote Angular) ne peuvent plus se voir entre eux sur le
segment 192.168.4.0/24.

### S4 — scrypt + auto-migration

`raspberry/admin/routes/auth.js` utilise `crypto.scrypt` (Node core, pas de dep native
à compiler sur Pi) avec format `scrypt:<salt-hex>:<key-hex>`. Le login détecte les
mots de passe legacy (plain text), vérifie via comparaison directe, puis ré-écrit
`configuration.json` avec la version hashée (auto-migration au premier login).

### S5 — path.basename()

`path.basename()` appliqué sur tous les paramètres `filename` / `category` avant
utilisation dans `fs.join()` dans `routes/backup.js`, `routes/videos.js`, `routes/sponsors.js`.
Bloque `../../../etc/shadow` etc.

### S6 — Sudoers durci

Whitelist explicite dans `raspberry/config/sudoers.d/neopro` :

- `modprobe` → uniquement drivers WiFi (`rtl8192eu`, `rtl8xxxu`, `rtl88XXau`, `8188eu`,
  `8192eu`, `mt7601u`, `mt76x0u`, `mt76x2u`, `brcmfmac`) — load + unload
- `cp /tmp/neopro-*` → destinations précises `wpa_supplicant-wlan1.conf` + `wpa_supplicant.conf`
- `/home/pi/neopro/scripts/*` → whitelist `fix-hotspot.sh --json [--auto-fix]`,
  `validate-pi.sh --json`, `setup-captive-portal-iptables.sh`, `auto-backup.sh`
- `systemctl` sur `.service` : uniquement les services MadXP (backup, video-processor)
- `apt install *` conservé (sync-agent sanitize les noms de packages pour l'OTA dynamique)
- `sed -i * /etc/hostapd/hostapd.conf` conservé (nécessaire pour rotate-psk ; contenu
  validé côté admin-server avant sed)

### F1 — Captive portal (vérifié)

Investigation : `raspberry/config/nginx-captive-portal.conf` + `install.sh` (ligne 683+)
implémentent déjà tous les endpoints de détection (Android `/generate_204`, `/gen_204`,
iOS `/hotspot-detect.html`, `/library/test/success.html`, Windows `/connecttest.txt`,
`/ncsi.txt`). `dnsmasq.conf` hijack déjà les domaines de captive check vers 192.168.4.1.
**Audit false positive** — aucune modification code nécessaire. Conservé dans l'ADR pour
traçabilité.

### F7 — Buffer events hostapd offline

`raspberry/sync-agent/src/services/hostapd-telemetry.js` persiste les événements hostapd
dans `/home/pi/neopro/data/hostapd-events-buffer.jsonl` quand le socket central est
déconnecté (rolling cap 1000 events). Au retour du socket, flush FIFO avec throttle 50ms.
Pattern emprunté à `analytics-buffer.js`.

### Dashboard hotspot local (`:8080`)

Nouveau service `raspberry/admin/services/hotspot-dashboard.service.js` :

- `listClients()` parse `sudo hostapd_cli -i wlan0 all_sta` (MAC, signal, bytes, packets)
- `getEvents({ limit })` lit `hostapd-events-buffer.jsonl` + `hostapd-events-history.jsonl`
- `rotatePsk({ newPsk? })` valide la clé (8-63 chars imprimables), patch `hostapd.conf`,
  restart hostapd, met à jour `club-config.json`
- `archiveEvent(event)` appelé par sync-agent au flush pour archivage local (cap 500)

Routes REST factory-pattern : `routes/hotspot-dashboard.js` monté dans `admin-server.js`.
Frontend : `public/modules/network/hotspot-dashboard.js` avec tables clients + events +
modal de rotation PSK (auto-refresh 15s sur l'onglet Réseau).

## Alternatives rejetées

- **bcrypt pour S4** : rejeté car dépendance native compilée — risque de build failure
  sur Pi au premier OTA. `crypto.scrypt` de Node core est memory-hard, pas de dep externe.
- **Auth Socket.IO obligatoire** : rejeté car casse les remotes v ≤ 3.193.9 déjà
  déployées. Opt-in permet une migration progressive (S2 bis prévu plus tard).
- **Rotation PSK périodique automatique** : rejeté car casse silencieusement les clients
  staff sans leur donner la nouvelle clé. Rotation manuelle depuis le dashboard uniquement.
- **Sudoers NOPASSWD global** : rejeté (était la situation de départ en partie). Whitelist
  de commandes spécifiques est le bon compromis sécurité/ergonomie.

## Conséquences

**Positif**

- Un Pi compromis ne compromet plus la flotte (PSK unique)
- Exposition LAN du Pi réduite : un scanner sur le réseau ne peut plus piloter la TV
  sans le token Socket.IO (si activé), et les clients hotspot sont isolés
- Credentials admin hashés : un dump de `configuration.json` ne révèle plus le mot de passe
- Surface d'attaque sudo réduite drastiquement (wildcard → whitelist)
- Le club a la capacité de rotationner la PSK sans SSH (support/DevOps allégé)
- Les incidents hotspot restent diagnosticables même si le socket central est down
  pendant l'événement (buffer → flush → archive)

**Négatif / risques**

- Format mot de passe legacy / scrypt coexistent pendant la phase de migration — couvert
  par `verifyPassword.legacy` et auto-rewrite au login
- Socket.IO auth opt-in = sécurité optionnelle tant que `security.socketAuthToken`
  n'est pas déployé flotte-wide (roadmap : ADR-073 bis pour le rendre obligatoire
  une fois toutes les remotes migrées)
- Un admin qui oublie de copier la nouvelle PSK après rotation = staff coupé jusqu'au
  prochain SSH (atténué : la PSK est affichée une fois dans le modal + copie presse-papiers)
- `install.sh` sans argument PSK = PSK non transmise à l'installeur — la valeur générée
  doit être lue dans `club-config.json` ou dans le summary final

**Monitoring**

- Smoke tests (regex-based) enforcent les invariants : placeholder hostapd, wildcards
  sudoers absents, `io.use()` présent, `scryptAsync` utilisé, buffer flush présent,
  router wire-up admin-server
- Le buffer `hostapd-events-buffer.jsonl` expose `getBufferStatus()` pour le dashboard
  admin (futur widget de pressure buffer)

## Fichiers impactés

**Sécurité (P0)**

- `raspberry/install.sh` — génération PSK aléatoire si arg2 manquant (S1)
- `raspberry/config/systemd/hostapd.conf` — placeholder + `ap_isolate=1` (S1 + S3)
- `raspberry/server/server.js` — `io.use()` middleware auth token opt-in (S2)
- `raspberry/admin/routes/auth.js` — scrypt + auto-migration + timingSafeEqual (S4)
- `raspberry/admin/routes/backup.js` — `path.basename()` sur filename (S5)
- `raspberry/admin/routes/videos.js` — `path.basename()` sur category + filename (S5)
- `raspberry/admin/routes/sponsors.js` — `path.basename()` sur filename + import `path` (S5)
- `raspberry/config/sudoers.d/neopro` — whitelist explicite (S6)

**Fonctionnel (F)**

- `raspberry/sync-agent/src/services/hostapd-telemetry.js` — `_appendToBuffer` +
  `_flushBuffer` + `getBufferStatus` (F7)

**Dashboard hotspot local**

- `raspberry/admin/services/hotspot-dashboard.service.js` — NEW — service métier
- `raspberry/admin/routes/hotspot-dashboard.js` — NEW — routes REST
- `raspberry/admin/admin-server.js` — wire-up du router
- `raspberry/admin/public/modules/network/hotspot-dashboard.js` — NEW — frontend UI
- `raspberry/admin/public/index.html` — sections clients/events + modal rotate-psk
- `raspberry/admin/public/build-admin.sh` — ajout du module
- `raspberry/admin/public/styles/network.css` — styles dashboard hotspot
- `raspberry/admin/public/modules/bootstrap.js` — hook switchTab + window exports

## Migration / déploiement

1. OTA flotte-wide v ≥ 3.194.0 → tous les Pi reçoivent le code durci
2. Les Pi existants conservent leur ancienne PSK tant que `install.sh` n'est pas rejoué
   → pas de break pour le staff
3. Au premier login admin post-OTA, le mot de passe plain-text est migré vers scrypt
   automatiquement
4. Pour activer S2 (Socket.IO auth), ajouter `security.socketAuthToken` dans
   `configuration.json` et déployer la même valeur sur les remotes — rolling, pas de
   downtime
5. Rotation PSK depuis le dashboard : staff devra se reconnecter avec la nouvelle clé
