# Specs SPORT détaillées — vertical à poser sur la table `[S]`

> **Statut** : v0.1 — les 5 domaines sport qui restent à poser intégralement pour la séance.
> **But** : que le lead dev retail comprenne le vertical sport **sans lire le code**, et voie quels invariants le noyau doit respecter pour ne pas casser le sport au re-câblage (C8).
> **Confiance** : ✅ vérifié (ADR/rules/code) · ⚠️ estimé · ❌ inconnu.
> **Note** : ces specs sont du **vertical sport pur** (overlays/services au-dessus du noyau player+planning+régie). Aucune ne doit fuiter dans le moteur commun.

---

## SPEC-SPORT-OFFLINE-EDGE — Autonomie Pi `[S]` M

**Réf** : pi-connectivity-model.spec, ADR-114 (write-through), ADR-120 (ownership Pi vs cloud), command-queue.spec.

### Objectif & besoin (BF-10)

Garantir qu'un Pi en club **fonctionne en pleine autonomie hors-ligne** entre deux reconnexions — c'est l'offre commerciale (« TV interactive sans dépendance internet en live »).

### Acteurs

Pi (sync-agent), cloud (orchestrateur), operator distant, opérateur terrain (`:8080`).

### Règles métier

1. ✅ Internet requis **uniquement** pour bootstrap initial + reconnexions régulières. Entre les deux : **autonomie de diffusion** totale (le Pi joue sa dernière config).
2. 🔴 **CORRECTION code (HEAD)** : `site_type=pi` est **cloud-wins aujourd'hui**, PAS Pi-owned. `mergeConfigurations()` applique la config cloud au resync (`config-merge.js:269-342`). ADR-120 (Pi = source de vérité + push-back) est **proposé, non codé**. **Seuls** les `LOCAL_ONLY_SETTINGS` (auth/remote password, settings, hotspot, siteId) sont préservés (`config-merge.js:21-35`, ADR-115).
3. ✅ Commandes cloud→Pi via `commandQueueService.sendOrQueue()` : exécutées si online, **mises en file** (`pending_commands`) sinon, **rejouées** à la reconnexion.
4. ✅ Write-through (ADR-114) : une écriture cloud sur `displays` se propage au Pi **en préservant l'auth** (sync-agent-auth-preservation).
5. ✅ Toute feature touchant `categories`, `sponsors`, `timeCategories`, `displays`, `profiles/{id}.json`, `configuration.json` doit être réalisable depuis `:8080` **quand le Pi est offline** (ADR-120).

### Invariants testables

| #   | Invariant                                                                                                      | Test                                          | Conf.                                         |
| --- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------- |
| I1  | Pi offline ⇒ diffusion ininterrompue                                                                           | couper cloud, TV continue                     | ✅                                            |
| I2  | Commande émise offline ⇒ filée puis rejouée **une fois**                                                       | `pending_commands` consommé au reconnect      | ✅                                            |
| I3  | Édition `:8080` offline possible (config locale appliquée à la TV)                                             | éditer catégories sans cloud                  | ✅                                            |
| I4  | 🔴 Conflit cloud↔Pi ⇒ **cloud-wins** (édit contenu offline écrasé au resync ; `LOCAL_ONLY_SETTINGS` préservés) | éditer des 2 côtés, cloud gagne sauf settings | ✅ (réalité) / ⚠️ push-back = ADR-120 roadmap |

### Modèle de données + vérité

Config locale (Pi, vérité pour `pi`) · `local_config_mirror` (reflet cloud, **≠ profil édité dashboard**) · `pending_commands` (cloud, file).

### Parcours nominal

Operator pousse → `sendOrQueue` → Pi applique (ou file) → push-back met à jour le miroir cloud.

### Cas limites

Pi offline > 24h → alerte connectivité (⚠️ **mesh-only** : le CRON 4h ne couvre que `network_profile` mesh/mesh_isolated, pas tous les Pi) · multi-profils → `local_config_mirror` reflète le profil **actif TV** · garde-fou : ne jamais déclencher d'action destructive sur un Pi vu « offline » sans recouper.

### Critères d'acceptation

- _Given_ Pi offline, _When_ cloud coupé, _Then_ TV continue **et** `:8080` reste éditable. ✅
- _Given_ commande pendant offline, _When_ Pi revient, _Then_ rejouée exactement une fois. ✅
- 🔴 _Given_ édition contenu concurrente cloud + Pi, _When_ sync, _Then_ **cloud gagne** (édit Pi écrasé) sauf `LOCAL_ONLY_SETTINGS`. ✅ (le « push-back Pi gagne » est l'objectif ADR-120, non codé)

### Hors périmètre / Questions

Edge retail (Q6). Garde-fou générique « tous Pi offline » (aujourd'hui mesh-only) — à généraliser ? ⚠️

---

## SPEC-SPORT-SCOREBOARD-MATCH — Sessions & scoreboard `[S]` M

**Réf** : ADR-088 (scoreboard SaaS-first), ADR-093 (persistance + historique), ADR-097 (CRON), rules/match.md.

### Objectif & besoin (BF-11, BF-13)

Enregistrer une session de match (équipes, scores, profil, type d'événement), afficher un scoreboard live optionnel, persister pour l'historique + les rapports sponsors période-filtrés, et fermer automatiquement les sessions oubliées.

### Acteurs

Staff club (remote Pi/SaaS), super_admin/operator (historique multi-sites), dashboard (scoreboard temps réel), consoles de marque (Bodet/Stramatel).

### Règles métier

1. ✅ Sessions persistées dans **`club_sessions`** (pas de table parallèle) → préserve `video_plays.session_id` (analytics).
2. ✅ Colonnes ADR-093 obligatoires : `home_team`, `away_team`, `home_score`, `away_score`, `profile_id`, `event_type`, `ended_by`.
3. ✅ `match-config.handler` : UPDATE équipes/profil/event au **démarrage** du match (le Pi émet `match-config`).
4. ✅ `score-update.handler` : UPDATE scores → **gèle les scores finaux** (sans ça, historique vide).
5. ✅ Auto-close CRON `match_session_autoclose` : ferme les sessions `ended_at IS NULL` dormantes avec **`ended_by='timeout'`** (badge ⏲️) + `metricsService.recordMatchSessionAutoclosed()`.
6. ✅ Dashboard : `COALESCE(match_name, home_team || ' vs ' || away_team)` (sessions pré-ADR-093).
7. ✅ Scoreboard live = canal HTTP depuis consoles de marque (ADR-088 SaaS-first).

### Invariants testables

| #   | Invariant                                                                                            | Conf. |
| --- | ---------------------------------------------------------------------------------------------------- | ----- |
| I1  | Sans UPDATE `score-update` ⇒ scores finaux jamais gelés ⇒ **interdit**                               | ✅    |
| I2  | `'match_session_autoclose'` ∈ CHECK `check_task_type` (sinon `recurring_schedules` casse au boot)    | ✅    |
| I3  | Route `/api/sites/:id/match-history` valide `from`/`to` (`validateQuery(querySchemas.matchHistory)`) | ✅    |
| I4  | Auto-close pose `ended_by='timeout'` (badge dashboard)                                               | ✅    |
| I5  | Payload remote porte `homeTeam`/`awayTeam`/`profileId`/`eventType`                                   | ✅    |

### Modèle de données + vérité

`club_sessions` (cloud, vérité) · scoreboard live (edge/transient) · `video_plays.session_id` (lien analytics).

### Parcours nominal

Staff lance match (remote) → `match-config` (équipes/profil) → scores live (`score-update`) → fin manuelle **ou** auto-close → rapport sponsor période-filtré.

### Cas limites

Session oubliée (auto-close timeout) · console Bodet/Stramatel · session legacy (`match_name` seul) · multi-profils (profil actif tracé).

### Critères d'acceptation

- _Given_ un match terminé, _When_ on lit l'historique, _Then_ équipes + scores finaux présents. ✅
- _Given_ une session ouverte oubliée, _When_ le CRON tourne, _Then_ `ended_at` set + `ended_by='timeout'`. ✅
- _Given_ `from`/`to` invalides, _When_ requête historique, _Then_ rejet validation (pas un 500). ✅

### Hors périmètre / Questions

Retail (pas de match). —

---

## SPEC-SPORT-SPONSORS-ROTATION — Sponsors locaux & rapports `[S]` M

**Réf** : ADR-035 (dual annonceur/sponsor), ADR-093, sponsors.spec.

### Objectif & besoin (BF-07 versant sport, BF-08)

Faire tourner les vidéos sponsors dans la boucle de chaque club selon une pondération, attribuer chaque diffusion, et générer des rapports PDF mensuels via portail magic-link.

### Acteurs

Club (resp. partenaires), advertiser/agency, super_admin.

### Règles métier

1. ✅ Rotation pondérée **Bresenham** dans la boucle du club.
2. ✅ Modèle dual : **sponsor local** (club) vs **advertiser/agency** (ADR-035) — sémantiques distinctes.
3. ✅ Chaque diffusion attribuée (`video_plays`).
4. ✅ Rapports PDF mensuels via **portail magic-link**, période-filtrés (jointure `club_sessions`, breakdown `event_type`).

### Invariants testables

| #   | Invariant                                                                   | Conf. |
| --- | --------------------------------------------------------------------------- | ----- |
| I1  | La pondération respecte la part cible sur la durée (distribution Bresenham) | ✅    |
| I2  | Diffusion sponsor toujours attribuée (pas d'anonyme)                        | ✅    |
| I3  | Rapport période-filtré cohérent avec `event_type` (ADR-093)                 | ✅    |
| I4  | `sponsor_local` ne génère pas de facturation (lien SPEC-CORE-REGIE)         | ✅    |

### Modèle de données + vérité

`site_sponsors`, `advertisers`, `agencies` (cloud) · `video_plays` (edge→cloud) · attribution par profil actif.

### Parcours nominal

Club ajoute sponsor + poids → rotation dans la boucle → diffusions attribuées → PDF mensuel via magic-link.

### Cas limites

Multi-profils (attribution par profil actif) · magic-link expiré · dédup checksum vidéos (plusieurs rows partagent `storage_path` → `GROUP BY storage_path` avant cleanup).

### Critères d'acceptation

- _Given_ 3 sponsors pondérés 50/30/20, _When_ la boucle tourne longtemps, _Then_ la distribution converge. ✅
- _Given_ un mois donné, _When_ le PDF est généré, _Then_ diffusions attribuées + période exacte. ✅

### Hors périmètre / Questions

Régie média vendue → SPEC-CORE-REGIE. Pont SoV sport ↔ inventaire retail → Q1.

---

## SPEC-SPORT-REMOTE — Télécommande staff `[S]` M

**Réf** : remote.spec, remote-v2-preview-sync.spec, rules/match.md.

### Objectif & besoin (BF-12)

Permettre au staff club de piloter la TV en local (déclencher animations, lancer/gérer un match) via une télécommande Pi ou SaaS.

### Acteurs

Staff club (sans compte dashboard), Pi/TV.

### Règles métier

1. ✅ Remote Pi + Remote SaaS ; payload `command` avec `commandId` / `target` / `localBroadcast`.
2. ✅ Options match émises par `saveMatchInfo()` (raspberry remote.component) → alimente `match-config.handler`.
3. ✅ `currentProfileId` peuplé dans `onClubSelected` (audit + reports multi-profil).
4. ⚠️ **Piège** : `displayIndex` sur le payload `command` est **ignoré** ; le filtrage TV se fait sur `target: number[]` (tv.component). Ne pas « corriger ».

### Invariants testables

| #   | Invariant                                                                   | Conf. |
| --- | --------------------------------------------------------------------------- | ----- |
| I1  | Payload `saveMatchInfo` porte `homeTeam`/`awayTeam`/`profileId`/`eventType` | ✅    |
| I2  | `currentProfileId` peuplé au choix du club                                  | ✅    |
| I3  | Commande ciblée filtre sur `target`, pas `displayIndex`                     | ✅    |

### Modèle de données + vérité

Commande (transient socket relay) · effet persisté (`club_sessions`, cloud).

### Parcours nominal

Staff agit → socket relay → Pi/TV applique → si match, persistance via handlers.

### Cas limites

Offline (relay local Pi) · multi-display (`target`) · parité Remote V2 = V1 (commandId/target/localBroadcast + 3 options match).

### Critères d'acceptation

- _Given_ un démarrage de match via remote, _When_ le payload arrive, _Then_ équipes/profil persistés. ✅
- _Given_ `target=[1]` sur N displays, _When_ la commande passe, _Then_ seul le display 1 réagit. ✅

### Hors périmètre / Questions

Retail (pas de télécommande staff). —

---

## SPEC-SPORT-HOTSPOT-NETWORK — Hotspot, PSK, DNS `[S]` S

**Réf** : ADR-074 (PSK cloud-truth), ADR-076, ADR-126 (resolv.conf.head), rules/hotspot-psk.md.

### Objectif & besoin (BF-14)

Le Pi expose un hotspot Wi-Fi (captive portal pour Fire Stick / écrans secondaires) avec un PSK piloté depuis le cloud, et une résolution DNS robuste aux outages.

### Acteurs

Pi (sync-agent, hotspot-sync), cloud (source PSK), opérateur terrain, clients Wi-Fi (Fire Stick…).

### Règles métier

1. ✅ Source de vérité PSK = **DB cloud** (`sites.wifi_psk_encrypted`, AES-256-GCM). Le Pi **consomme** (`syncHotspotFromCloud` dans `handleAuthenticated`), ne dicte jamais.
2. ✅ Rotation : UPDATE DB → `commandQueueService.sendOrQueue(id,'rotate_psk',{})`. `rotate_psk` ∈ `DEFAULT_ALLOWED_COMMANDS`.
3. ✅ Écriture `hostapd.conf` **uniquement** dans `services/hotspot-sync.js` (sudoers restreint), PSK injecté via `shellEscape()`.
4. ✅ Filet DNS `resolv.conf.head` (ADR-126) : `ensure_resolv_conf_head()` dans `install.sh` (`setup_hotspot`) — préfixe Cloudflare/Google à chaque bail dhcpcd, sinon hijack par le wildcard captive `address=/#/192.168.4.1` (incident NLF 2026-05-14).
5. ✅ Ne **jamais** rediriger apple.com / google captive endpoints vers le Pi (réseau marqué « captive bloqué » par iOS/Android).
6. ✅ Prérequis routage : `ip_forward=1` + NAT masquerade sur **wlan1** (uplink).

### Invariants testables

| #   | Invariant                                                                         | Conf. |
| --- | --------------------------------------------------------------------------------- | ----- |
| I1  | `rotate_psk` ∈ `DEFAULT_ALLOWED_COMMANDS`                                         | ✅    |
| I2  | `ensure_resolv_conf_head()` appelée dans `setup_hotspot`                          | ✅    |
| I3  | PSK jamais en clair en DB (passe par `hotspotConfigService.encrypt()`)            | ✅    |
| I4  | `club-config.json` ne contient plus `wifiSSID`/`wifiPassword` (ADR-074)           | ✅    |
| I5  | wildcard `address=/#/192.168.4.1` préservé **couplé** au pinning resolv.conf.head | ✅    |

### Modèle de données + vérité

PSK chiffré (cloud, vérité) · cache Pi `.hotspot-cache` (0600, dérivé) · `hostapd.conf` (généré).

### Parcours nominal

Rotation cloud → commande `rotate_psk` → Pi réécrit `hostapd.conf` → clients se reconnectent.

### Cas limites

Outage dhcpcd (resolv.conf.head sauve la résolution) · Fire Stick captive (Silk fenêtré, fullscreen impossible sans APK TWA) · captive redirect → `/display/N` (pas `/?display=N`) avec guard `pathname.startsWith('/display/')`.

### Critères d'acceptation

- _Given_ une rotation PSK cloud, _When_ le Pi reçoit `rotate_psk`, _Then_ `hostapd.conf` mis à jour avec le nouveau PSK. ✅
- _Given_ dhcpcd vide `/etc/resolv.conf`, _When_ un bail se renouvelle, _Then_ DNS publics re-préfixés (pas de hijack). ✅

### Hors périmètre / Questions

Retail (sport-Pi pur ; sans objet si pas d'edge retail).

---

## Synthèse — invariants sport que le noyau NE doit PAS casser

| Invariant                                                           | Spec                | Pourquoi                                                                                   |
| ------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------ |
| Autonomie offline de **diffusion** (lecture sans cloud)             | OFFLINE-EDGE I1     | offre commerciale — **réelle ✅**                                                          |
| Préservation `LOCAL_ONLY_SETTINGS` au merge (auth/hotspot/settings) | OFFLINE-EDGE I4     | ADR-115 — **codé ✅**. (NB : ownership edge Pi-owned/push-back = ADR-120, **non codé** 🔴) |
| `club_sessions` = persistance unique                                | SCOREBOARD I1       | pipeline analytics                                                                         |
| Rotation Bresenham neutre aux droits                                | SPONSORS I1 / RÉGIE | pont monétisation                                                                          |
| `target` filtre les displays (pas `displayIndex`)                   | REMOTE I3           | régression connue                                                                          |
| PSK = cloud-truth, Pi consomme                                      | HOTSPOT I1          | sécurité ADR-074                                                                           |
| resolv.conf.head anti-hijack                                        | HOTSPOT I2          | incident NLF                                                                               |

> Ces 7 lignes sont la **checklist de non-régression** à brandir si une décision noyau menace le sport au re-câblage.
