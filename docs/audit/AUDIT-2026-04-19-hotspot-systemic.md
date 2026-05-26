# Audit systémique — Hotspot WiFi MadXP

**Date** : 2026-04-19
**Contexte** : suite incident Strogatien (iPhone non connecté, 17h), ADR-072 OTA-1 + OTA-2 livrés. L'utilisateur a demandé un vrai audit CTO systémique au-delà du patch incident.
**Méthode** : phases 1→6 (lecture exhaustive, diagramme de flux, matrice de pannes, STRIDE, personas, benchmark).
**Scope** : hotspot Pi (wlan0) + services adjacents exposés sur ce réseau (admin :8080, socket :3000, sync-agent).

---

## 1. Findings critiques (synthèse exécutive)

### 🔴 P0 — Sécurité, à traiter sous 1 semaine

| #      | Finding                                                                                                                    | Impact                                                                                                                                      | Où                                                                      |
| ------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **S1** | **Password WiFi par défaut `NeoProWiFi2025` hardcodé dans `install.sh`** si arg2 omis (CI/CD, re-install)                  | Tous les Pi concernés partagent le même PSK → sniff + connexion depuis n'importe quel club vers n'importe quel autre                        | `raspberry/install.sh` + `.claude/rules/network.md` (en clair dans git) |
| **S2** | **Aucune auth Socket.IO sur `:3000`** + CORS `origin: true`                                                                | N'importe quel device sur le hotspot peut émettre `command/score-reset`, `phase-change`, `timer_reset`, etc. → prendre le contrôle du match | `raspberry/server/src/index.ts` + `socket.service.ts`                   |
| **S3** | **Client isolation désactivée** (`ap_isolate` absent de `hostapd.conf`)                                                    | Clients WiFi se voient entre eux → ARP spoofing, man-in-the-middle trivial entre remote staff et Pi                                         | `raspberry/config/systemd/hostapd.conf`                                 |
| **S4** | **Admin password stocké en clair** dans `configuration.json` (pas de hash)                                                 | Compromission d'un backup = compromission admin de tous les clubs ayant ce password                                                         | `raspberry/admin/services/AuthService.js`                               |
| **S5** | **Path traversal potentiel** sur `GET /api/backups/download/:filename`                                                     | Download de `/etc/passwd`, `/etc/sudoers.d/neopro`, fichiers WiFi                                                                           | `raspberry/admin/routes/backup.js`                                      |
| **S6** | **Sudoers wildcards très larges** : `apt install *`, `/home/pi/neopro/scripts/*`, `cp /tmp/neopro-* /etc/wpa_supplicant/*` | Si compte `pi` compromis (via XSS admin ou autre), escalation trivial vers root                                                             | `raspberry/config/sudoers.d/neopro`                                     |

### 🟠 P1 — Fiabilité / UX, à traiter sous 1 mois

| #      | Finding                                                                                                         | Impact                                                                                                                                                   | Où                                                                                     |
| ------ | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **F1** | **Pas d'endpoint `/generate_204` / `/hotspot-detect.html`** malgré DNS hijack déjà en place dans `dnsmasq.conf` | iOS/Android font un probe qui échoue → "Se connecter au réseau" sheet iOS, Android considère "no internet" et peut basculer 4G, parfois refuse la remote | `dnsmasq.conf` hijack OK mais `admin-server` ne répond rien → half-done captive portal |
| **F2** | **Pas de rate-limiting DHCP**                                                                                   | Client malveillant peut vider le pool 190 IPs en secondes → DoS hotspot                                                                                  | `dnsmasq.conf`                                                                         |
| **F3** | **Pas de monitoring thermal** côté WiFi chip (BCM43455)                                                         | Thermal throttling Pi 4 en salle chaude ≠ flagged comme incident hotspot                                                                                 | `metrics/hardware-metrics.js` (CPU oui, WiFi RF non)                                   |
| **F4** | **Conflit IP 192.168.4.x si routeur club existant**                                                             | Pi en conflit silencieux, hotspot fonctionne mais NAT/routing aléatoire                                                                                  | `install.sh` ne détecte pas la collision                                               |
| **F5** | **Multi-remote race condition** : 2 staff peuvent envoyer `command/increment_home` simultanément                | Score sauté, frustration staff                                                                                                                           | `socket.service.ts` pas de session locking                                             |
| **F6** | **Chromium `unsafe-inline` script-src** admin panel                                                             | XSS potentiel si sponsorName/videoTitle mal sanitizé                                                                                                     | `raspberry/admin/middleware/helmet.js`                                                 |
| **F7** | **Telemetry hostapd drop les events en offline** (dette technique d'OTA-2)                                      | Diagnostic impossible pendant panne cloud                                                                                                                | `hostapd-telemetry.js`                                                                 |
| **F8** | **Cache WiFi password en clair** `/home/pi/neopro/club-config.json` même chmod 600                              | Backup compressé contient le PSK                                                                                                                         | `install.sh` + backup service                                                          |

### 🟡 P2 — Hygiène / long terme

| #      | Finding                                                      | Impact                                                 | Où                     |
| ------ | ------------------------------------------------------------ | ------------------------------------------------------ | ---------------------- |
| **H1** | i18n absente, tout FR hardcodé                               | Staff non-francophone = opaque                         | Webapp Angular + admin |
| **H2** | Pas de SLO défini sur le hotspot (auth rate, latence remote) | On ne sait pas qu'on est en panne avant Slack qui ping | Absence dashboard      |
| **H3** | Pas de test smoke pour config hotspot (syntaxe hostapd.conf) | Régression config possible via OTA                     | `smoke-network-wifi`   |
| **H4** | Mono-bande 2.4GHz                                            | Saturation canal en salle bondée                       | Hardware limit         |
| **H5** | Pas de canary auto OTA fleet-wide                            | Une OTA cassée = fleet cassée                          | Pipeline OTA           |

---

## 2. Diagramme de flux (état actuel)

```
┌────────────────────────────────────────────────────────────────────┐
│  STAFF PHONE (iPhone/Android)                                      │
│  → Scan SSID "NEOPRO-CLUB"                                         │
│  → Auth WPA2-PSK (🔴 S1: PSK souvent partagé entre clubs)          │
│  → DHCP lease 2h                                                   │
│  → Captive portal probe (captive.apple.com, …)                     │
│  → Browser: http://neopro.local/remote                             │
│  → Socket.IO: ws://neopro.local:3000 (🔴 S2: aucune auth)          │
└────────────────────────────────────────────────────────────────────┘
          │
          │ WPA2-PSK
          │ 🔴 S3: ap_isolate=0 → clients se voient
          │ 🟠 F1: DNS hijack en place mais endpoints 204 absents
          ▼
┌────────────────────────────────────────────────────────────────────┐
│  RASPBERRY PI (wlan0 = 192.168.4.1/24)                             │
│                                                                    │
│  hostapd (root)                                                    │
│    ssid=NEOPRO-CLUB · channel=6 fixe · max_num_sta=50              │
│    ieee80211w=1 (PMF optional, ADR-072 OTA-2) ✅                    │
│    ❌ ap_isolate=0 · pas de disassoc_low_ack · pas d'ACS           │
│                                                                    │
│  dnsmasq                                                           │
│    DHCP 192.168.4.10-200, lease 2h ✅                               │
│    DNS hijack captive.apple.com etc. → 192.168.4.1 ✅               │
│    DNS upstream 8.8.8.8/8.8.4.4                                    │
│    ❌ Pas de rate limit DHCP (F2)                                   │
│                                                                    │
│  iptables/nft (NAT)                                                │
│    MASQUERADE 192.168.4.0/24 → wlan1 (si internet)                 │
│    DNAT tcp/80,443 → 192.168.4.1:80                                │
│                                                                    │
│  nginx :80/:443                                                    │
│    Reverse proxy → :3000 (webapp) + :8080 (admin)                  │
│    CSP 'self' verrouillée ✅                                        │
│                                                                    │
│  neopro-app :3000 (user=pi)                                        │
│    🔴 S2: PAS d'auth Socket.IO · CORS origin:true                   │
│    18 events: score/phase/timer/tv-register/etc.                   │
│    PIN HTTP endpoint (mode SaaS uniquement, bcrypt)                │
│    🟠 F5: pas de session lock → multi-remote race                   │
│                                                                    │
│  neopro-admin :8080 (user=pi, sans NoNewPrivileges)                │
│    Auth: single password partagé + CSRF + rate limit 5/15min       │
│    🔴 S4: password en clair dans configuration.json                 │
│    🔴 S5: path traversal /api/backups/download/:filename            │
│    🟠 F6: CSP unsafe-inline                                         │
│    🔴 S6: sudo wildcards très larges                                │
│    ❌ F1: pas de route /generate_204 pour captive portal            │
│                                                                    │
│  neopro-sync-agent (user=pi)                                       │
│    Watchdog hotspot 30s + internet 60s (multi-phase recovery)      │
│    hostapd-telemetry (NEW, ADR-072 OTA-2) ✅                        │
│    🟠 F7: drop events si cloud offline                              │
│    Command queue offline ✅                                         │
│                                                                    │
│  neopro-kiosk → Chromium fullscreen @ :0                           │
│                                                                    │
│  wlan1 (optionnel, RTL8192EU NLF) → WiFi client                    │
│  eth0 (optionnel) → Ethernet                                       │
└────────────────────────────────────────────────────────────────────┘
          │
          │ wss (si internet)
          ▼
┌────────────────────────────────────────────────────────────────────┐
│  CENTRAL SERVER (Railway)                                          │
│  Express + Postgres + Socket.IO                                    │
│  Dashboard Angular (Hostinger)                                     │
│  🟠 F3: pas de metric RF · H2: pas de SLO hotspot                   │
└────────────────────────────────────────────────────────────────────┘
```

---

## 3. Matrice de pannes (failure modes)

Priorité = Impact × Fréquence attendue. `✅` = déjà géré, `⚠️` = partiellement, `❌` = ignoré.

| #   | Panne                              | Offline | Online | Simple | NLF mesh | Pi4    | Pi5 | Impact                                        | Fréq                    | Etat                                       |
| --- | ---------------------------------- | ------- | ------ | ------ | -------- | ------ | --- | --------------------------------------------- | ----------------------- | ------------------------------------------ |
| 1   | Password WiFi leaké (S1)           | —       | —      | 🔴     | 🔴       | 🔴     | 🔴  | Tous les Pi compromis                         | Certaine                | ❌                                         |
| 2   | Canal 2.4GHz saturé                | 🟠      | 🟠     | 🟠     | 🟠       | 🟠     | 🟠  | Clients pas connectés                         | Hebdo salle bondée      | ❌                                         |
| 3   | Thermal throttling WiFi chip       | 🟠      | 🟠     | 🟠     | 🟠       | 🔴 Pi4 | 🟡  | Drop hotspot                                  | Été                     | ❌                                         |
| 4   | SD card corruption                 | 🔴      | 🔴     | 🔴     | 🔴       | 🔴     | 🔴  | Pi mort                                       | ~2%/an                  | ⚠️ `sd-health.service`                     |
| 5   | Conflit IP 192.168.4.x (F4)        | 🟠      | 🟠     | 🟠     | 🟡       | 🟠     | 🟠  | Hotspot cassé silencieux                      | Rare                    | ❌                                         |
| 6   | Multi-Pi même SSID canal 6         | 🟠      | 🟠     | 🟠     | —        | 🟠     | 🟠  | Interférence                                  | Gros complexe           | ❌                                         |
| 7   | DHCP pool saturé (F2 DoS ou légit) | 🟠      | 🟠     | 🟠     | 🟠       | 🟠     | 🟠  | 11e client rejeté (avant ADR-072: 190e après) | Mensuel pic             | ⚠️ ADR-072 mitige largement                |
| 8   | hostapd crash loop                 | 🔴      | 🔴     | 🟠     | 🔴       | 🟠     | 🟠  | Hotspot mort                                  | Post-OTA rare           | ⚠️ watchdog restart, cascade si config bad |
| 9   | Client isolation absente (S3)      | 🟠      | 🟠     | 🟠     | 🟠       | 🟠     | 🟠  | ARP spoof entre staff                         | Possible                | ❌                                         |
| 10  | Captive portal silencieux (F1)     | 🟠      | 🟠     | 🟠     | 🟠       | 🟠     | 🟠  | iOS refuse de router                          | Chaque iPhone moderne   | ⚠️ DNS hijack fait, réponse HTTP manque    |
| 11  | Command injection Socket.IO (S2)   | 🔴      | 🔴     | 🔴     | 🔴       | 🔴     | 🔴  | Score/match manipulé                          | Si malveillant sur WiFi | ❌                                         |
| 12  | Multi-remote race (F5)             | 🟡      | 🟡     | 🟡     | 🟡       | 🟡     | 🟡  | Score sauté                                   | Matches avec 2 staff    | ❌                                         |
| 13  | Telemetry cloud-only (F7)          | 🟠      | —      | 🟠     | 🟠       | 🟠     | 🟠  | Diagnostic perdu pendant panne                | Rare mais cumule        | ❌                                         |
| 14  | Admin panel compromis (S4+S5+S6)   | 🔴      | 🔴     | 🔴     | 🔴       | 🔴     | 🔴  | Root Pi en 3 étapes                           | Si WiFi leaké           | ❌                                         |
| 15  | Path traversal backup (S5)         | 🔴      | 🔴     | 🔴     | 🔴       | 🔴     | 🔴  | Exfiltration fichiers sensibles               | Si malveillant sur WiFi | ❌                                         |
| 16  | Battery remote meurt en match      | 🟡      | 🟡     | 🟡     | 🟡       | 🟡     | 🟡  | Staff doit reconnecter                        | Match/mois              | ⚠️ token 30j persiste                      |
| 17  | Clé CEE / coupure courant match    | 🔴      | 🔴     | 🔴     | 🔴       | 🔴     | 🔴  | SD corruption possible                        | Rare                    | ⚠️ pas d'UPS recommandé                    |
| 18  | OTA casse hotspot fleet-wide       | 🔴      | 🔴     | 🔴     | 🔴       | 🔴     | 🔴  | Tous les clubs morts                          | Si canary absent        | ⚠️ no auto canary                          |

---

## 4. Threat model (STRIDE)

Perspective : un utilisateur connecté au hotspot `NEOPRO-CLUB` (un staff, un spectateur, un attaquant physique avec le PSK).

### S — Spoofing

- **PSK partagé (S1)** : un attaquant qui a le PSK d'un Pi peut usurper une remote sur n'importe quel Pi si la génération du password n'est pas unique par club. À vérifier sur la flotte réelle.
- **Socket.IO non-authentifié (S2)** : n'importe qui peut se présenter comme "remote", "TV master", "TV slave". `tv-register` spoofing trivial.
- **mDNS spoofing** : un client malveillant peut répondre `neopro.local → 192.168.4.42` avant le Pi → MitM sur la remote. Mitigé en partie par `dnsmasq address=/neopro.local/192.168.4.1` mais seulement si le client interroge le Pi d'abord.

### T — Tampering

- **Commandes match** (S2) : `score-reset`, `increment_home`, `phase-change`, `timer_reset` sans auth.
- **Config hotspot via admin** : si password admin brute-forcé (5/15min par IP, contournable par DHCP rotation), attaquant modifie SSID/PSK.
- **Backup upload** (S5 path traversal écriture ?) : à vérifier si le path traversal marche en upload aussi.
- **Update videos** : upload 500MB sans rate limit → remplissage disque.

### R — Repudiation

- **Pas d'audit log local** sur admin-server (qui a cliqué "reboot" à quelle heure ? journal systemd sinon).
- **Socket.IO anonyme** → impossible de savoir qui a envoyé quelle commande pendant un match.

### I — Information disclosure

- **Path traversal (S5)** : `/api/backups/download/../../../../etc/passwd`.
- **Password en clair (S4)** : backup contient admin password + WiFi PSK.
- **Sniffing trafic** (S3 + HTTP en clair sur :3000) : un device sur le hotspot peut capturer `ws://neopro.local:3000` complet.
- **CORS `*` sur videos/thumbnails** : exfil facile depuis page web externe.

### D — Denial of Service

- **DHCP pool flood** (F2) : 190 MAC fake → autres clients rejetés.
- **hostapd brute force auth** : pas de limit → déauth clients légitimes.
- **`/api/hotspot/fix` répété** : restart hostapd chaque appel → coupure ~3s à chaque fois.
- **Upload 500MB spam** → disque plein → services crash.
- **`command/increment_home` flood** : score incohérent (lié à F5).

### E — Elevation of privilege

- **Sudo wildcards (S6)** : une fois shell user `pi` obtenu (via XSS admin ou path traversal écriture), escalation root via `sudo cp /tmp/x /etc/sudoers.d/`, `sudo apt install <trojan>`, `sudo /home/pi/neopro/scripts/attaquant.sh`.
- **Admin non-NoNewPrivileges** : aucun durcissement systemd.

---

## 5. Personas & parcours (revue produit)

### Persona A — Staff club (jour de match, 1ère utilisation)

**Contexte** : bénévole, 40 ans, maîtrise son iPhone, zéro notion WiFi. On lui a dit "télécommande = scanne le QR sur la TV".

**Parcours actuel** :

1. Scanne QR affiché sur TV → rejoint `NEOPRO-CLUB` ✅
2. iPhone : "Pas d'Internet" / sheet captive portal affiché ⚠️ (F1)
3. Staff clique "Ignorer" → browser
4. Staff tape `neopro.local/remote` — **problème** : il ne sait pas, personne ne lui a dit
5. Browser ouvre la remote si tout va bien
6. PIN demandé ou pas selon mode. En mode local : zéro auth → clique et c'est bon.

**Friction** : étape 3-4 infranchissables sans formation. **Solution** : captive portal qui redirige automatiquement vers la remote (F1 + auto-redirect).

### Persona B — Support MadXP N1

**Contexte** : Slack Alert "Strogatien: iPhone n'a pas pu rejoindre". Il a 5 min avant que le président du club appelle.

**Parcours actuel** :

1. Ouvre dashboard cloud → voit le site offline ou partiellement ⚠️ (H2 pas de SLO hotspot)
2. Pas de vue "hotspot health" dédiée — seulement les heartbeats du Pi
3. Aucun event hostapd remonté avant 2026-04-19 (fresh avec ADR-072 OTA-2)
4. Option : envoyer un `remote_shell` via cloud pour `hostapd_cli list_sta`. Nécessite Pi online.

**Friction** : quasi aveugle tant que le Pi est offline. **Solution** : buffer local events + dashboard hotspot fleet-wide (F7 + H2).

### Persona C — CTO/Founder MadXP (toi)

**Contexte** : tu veux scaler à 500 clubs. Aujourd'hui 50. Tu veux savoir quel risque tu portes.

**Risques actuels si scale × 10** :

- S1 (PSK partagé) : incident sécurité presse amplifiable 10×.
- S2 (Socket.IO open) : 1 compétiteur malveillant sur 1 match = vidéo virale "MadXP piraté en direct".
- F1 (captive portal) : 10× plus de tickets support "iPhone pas connecté".
- H2 (pas de SLO) : tu apprends les pannes par Slack client, pas par dashboard.

### Persona D — Nouveau staff jour J (remplaçant)

**Contexte** : titulaire malade, remplaçant 1h avant le match, jamais vu la remote.

**Parcours actuel** :

1. Comment découvre-t-il le PSK WiFi ? → affiche papier derrière la TV si admin a pris la peine. Sinon: téléphone au CTO.
2. Comment découvre-t-il l'URL ? → idem.
3. Comment découvre-t-il le PIN (si SaaS) ? → email/SMS beforehand, pas évident si pressé.

**Friction** : dépendance au titulaire. **Solution** : onboarding in-app accessible via captive portal auto-redirect avec aide contextuelle.

---

## 6. Benchmark concurrence

Lecture publique, sans accès web en direct dans l'environnement d'audit — à reconfirmer avec WebSearch avant décision finale.

| Acteur                               | Hotspot local                                 | Offline                 | Tier hardware           | Pricing                | Pertinence              |
| ------------------------------------ | --------------------------------------------- | ----------------------- | ----------------------- | ---------------------- | ----------------------- |
| **Spond**                            | ❌ app mobile seule                           | partiel                 | aucun HW                | freemium + 2-4€/membre | Faible (pas de HW club) |
| **Sportradar**                       | N/A upmarket                                  | N/A                     | N/A                     | enterprise             | Hors scope              |
| **Sportity**                         | non-vérifiable                                | annoncé                 | écrans tiers            | 100-500€/event         | Moyen                   |
| **Pixellot**                         | ❌ besoin WiFi club                           | ✅ upload différé       | 1 tier 5-15k€           | 100-400€/mois          | Moyen (adjacent caméra) |
| **Veo Cam 2/3**                      | ✅ **même pattern que MadXP** (hotspot setup) | ✅ enregistrement local | 2 tiers (1000€ / 1600€) | ~250€/mois             | **Référence #1**        |
| **ScoreVision / Daktronics / Nevco** | partiel (AP optionnel)                        | ✅ scoreboard local     | 3-4 gammes              | 15k-500k$              | Leçon tiers HW          |
| **GameChanger / Meridix**            | ❌ dépendant WiFi                             | ✅ scoring offline      | BYOD                    | ~15$/mois              | Faible                  |

**Leçons clés** :

1. **Veo** est la référence pattern hotspot + multi-tier hardware → étudier leur UX d'appairage et specs sécurité.
2. **Daktronics** légitime le **tier hardware** sur ce segment (ils ont 4 gammes).
3. **Personne ne fait le captive portal** sur ce segment → **opportunité différenciante** pour onboarding staff.
4. **Offline-first** est rare (Veo + scoreboards US) → MadXP doit le garder comme pillar marketing.

---

## 7. Plan d'action priorisé

### 🔴 Cette semaine (P0 sécurité)

| Action                                                                                                                                                  | Effort             | Gain                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------ |
| **S1 Fix** : génération PSK unique par club dans `install.sh` + rotation automatique via sync-agent (envoie le nouveau PSK au dashboard, affiche QR TV) | 2j                 | Killing chain bloquée                      |
| **S2 Fix** : auth token partagé Pi↔remote via `configuration.json` (token local signé), vérifié dans `socket.on('connection')`                          | 2j                 | Socket.IO sécurisé                         |
| **S3 Fix** : `ap_isolate=1` dans `hostapd.conf` (ADR-072 sibling OTA-3)                                                                                 | 30min + smoke test | MitM inter-client bloqué                   |
| **S5 Fix** : sanitize `:filename` avec `path.basename()` + allowlist extension sur `/api/backups/download/`                                             | 15min              | Exfil fichier système bloquée              |
| **S4 Fix** : bcrypt hash admin password dans `configuration.json` (migration script)                                                                    | 4h                 | Compromission backup ≠ compromission admin |
| **S6 Audit** : réviser sudoers, remplacer wildcards par commandes exactes (au moins `apt install *` → liste blanche, `scripts/*` → whitelist)           | 1j                 | Réduit attack surface                      |

### 🟠 Ce mois (P1 fiabilité)

| Action                                                                                                                   | Effort                                  | Gain                          |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- | ----------------------------- | ------------------------- |
| **F1 Fix** : endpoints captive portal sur admin :80/:8080 (`/generate_204`, `/hotspot-detect.html` → 302 vers `/remote`) | 1j                                      | iOS/Android onboarding fluide |
| **F7 Fix** : buffer local events hostapd dans sync-agent (pattern `analytics-buffer.js`)                                 | 4h                                      | Telemetry fiable en offline   |
| **F5 Fix** : session lock optimiste côté socket (1 remote maître, autres en read-only), bascule via "take control"       | 2j                                      | Plus de race condition        |
| **F2 Fix** : `dhcp-host` whitelist OU `dhcp-rate-limit` via iptables module                                              | 1j                                      | DoS DHCP bloqué               |
| **F3 Fix** : metric RF (`iw dev wlan0 station dump                                                                       | avg signal`) dans `hardware-metrics.js` | 4h                            | Visibilité thermal impact |
| **F6 Fix** : CSP nonce-based au lieu de `unsafe-inline`                                                                  | 1j                                      | XSS blocked                   |
| **Dashboard hotspot local** : nouvelle page admin :8080 "Clients WiFi connectés, signal, events récents"                 | 2j                                      | Staff debug sans internet     |
| **Dashboard hotspot fleet-wide** : vue central-dashboard sur hostapd_events                                              | 2j                                      | Support N1 voit tout          |
| **Canary OTA automatique** : 1 Pi canary obligatoire avant fleet rollout                                                 | 3j                                      | Un OTA cassée ≠ fleet morte   |

### 🟡 Trimestre (P2 + stratégique)

| Action                                                                             | Effort                    | Gain                           |
| ---------------------------------------------------------------------------------- | ------------------------- | ------------------------------ |
| **ACS one-shot boot** (canal auto figé)                                            | 1j                        | 80% des "canal saturé" résolus |
| **Alerte PSK-mismatch burst** côté central                                         | 4h                        | Détection fuite PSK            |
| **i18n** (au moins EN + FR)                                                        | 5-10j                     | Marchés export                 |
| **SLO hotspot** défini + dashboard Grafana                                         | 3j                        | Détection proactive            |
| **Smoke test config hotspot** (parse + validation `hostapd.conf` syntaxique)       | 1j                        | Régression impossible          |
| **Tier "MadXP Pro"** : option AP externe dédié (GL.iNet ou équivalent) + dongle 4G | 3 mois (produit + supply) | Upsell + fiabilité gros clubs  |
| **Audit RF terrain NLF** (WiFi Explorer + Wireshark)                               | 1j sur site               | Root cause vraies              |
| **Test charge 50 clients simultanés** (iperf + bots auth)                          | 2j                        | Validation `max_num_sta=50`    |
| **UPS Pi** (batterie onduleur ~30€) recommandé pour clubs critiques                | doc + partenariat         | SD corruption quasi-éliminée   |

---

## 8. Recommandation synthèse

**Si tu n'as qu'une semaine** : S1 + S2 + S3 + S5. Ça bloque les 3 vecteurs d'attaque les plus triviaux depuis le hotspot.

**Si tu n'as qu'un mois** : les 6 P0 + F1 (captive portal) + F7 (buffer events) + dashboard hotspot local. Ça transforme MadXP d'un produit "semi-sécurisé" à un produit "défense en profondeur".

**Si tu scales à 500 clubs** : impossible sans canary OTA automatique + SLO hotspot + audit terrain NLF + tier Pro hardware. L'un d'entre eux lâche → PR nightmare.

**Si tu veux un différenciateur commercial** : le **captive portal + MFA staff** n'existe chez aucun concurrent direct. C'est un argument RGPD/assurance B2B fort pour les clubs qui hébergent des événements avec mineurs.

---

**Limites de cet audit** :

- Benchmark concurrentiel fait sans accès web en direct → chiffres à reconfirmer.
- Pas d'audit RF sur site physique (impossible depuis laptop).
- Threat model STRIDE complet mais pas testé par pentest réel — un vrai pentest prendrait 5 jours.
- Certaines sudoers wildcards (`apt install *`, `scripts/*`) peuvent avoir des justifications historiques non documentées — à discuter avant réduction.
