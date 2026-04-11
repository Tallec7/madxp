# PROP-001: Multi-TV — Diffusion sur Plusieurs Écrans (Pi & SaaS)

> _Anciennement ADR-011 — Révisé le 2026-04-11 avec l'offre SaaS (ADR-037) et le mode hybride Pi+SaaS_

**Date** : 2026-02-11 (créé) — 2026-04-11 (révisé)
**Statut** : Proposé
**Décideurs** : Équipe Neopro
**Lié à** : [ADR-008](../adr/ADR-008-double-buffer-video-pi.md) (Double-Buffer Vidéo), [ADR-001](../adr/ADR-001-edge-cloud-architecture.md) (Edge-Cloud Architecture), [ADR-037](../adr/ADR-037-saas-site-type.md) (SaaS Site Type)

---

## Contexte

Un prospect (club sportif) souhaite diffuser du contenu Neopro sur **4 écrans TV simultanément**. Les TV sont réparties dans différentes zones du club (hall d'accueil, buvette, tribunes, vestiaires) et peuvent être **espacées de 5 mètres ou plus** les unes des autres.

### Évolution majeure depuis la v1 de cette proposition

Deux évolutions changent fondamentalement la donne :

1. **L'offre SaaS** (ADR-037) : n'importe quel navigateur moderne peut devenir un écran Neopro en chargeant une URL → **scénario D** (cloud pur).

2. **Le mode hybride Pi+SaaS** (scénario E) : le Pi existant sert déjà le frontend Angular + les vidéos + Socket.IO via son hotspot WiFi. N'importe quel device (Fire Stick, Smart TV, tablette) connecté au hotspot `NEOPRO_xxx` peut charger `http://neopro.local/tv` et devenir un écran supplémentaire. **Ça fonctionne déjà aujourd'hui, zéro dev.** C'est le meilleur des deux mondes : la résilience offline du Pi + la flexibilité multi-écran du SaaS.

### Contraintes

- **Même contenu** sur toutes les TV (playlist identique + overlay de score) — cas standard
- **Contenus différenciés** par TV — cas avancé (nécessite ciblage)
- **Distance** entre TV : 5-20m typiquement
- **Qualité vidéo** : 1080p minimum sur chaque TV
- **Score live** : l'overlay de score doit être visible sur toutes les TV
- **Fiabilité** : le système tourne en autonomie pendant les matchs (5h+)
- **Coût** : minimiser le hardware additionnel

### État actuel

- Architecture 1 site = 1 Pi ou 1 URL SaaS = 1 écran (mapping 1:1)
- Mode Pi : 1 instance Chromium kiosk, 1 sortie HDMI
- Mode SaaS : 1 navigateur charge `https://neopro-admin.kalonpartners.bzh/saas/?site={siteId}`
- Vidéos servies via URLs FTP publiques (SaaS) ou fichiers locaux (Pi)

### La Remote (télécommande) — Élément critique

La Remote est une page web accessible depuis n'importe quel smartphone. Elle permet au staff du club de piloter les écrans (vidéos, score, phases de match, breaking news, chronomètre).

**Communication dual-channel** :

1. **BroadcastChannel** (`neopro-local`) : navigateur-à-navigateur sur le même appareil. Zéro latence, offline.
2. **Socket.IO** : communication réseau pour tous les appareils connectés, y compris le monitoring cloud.

**Limitation actuelle** : La Remote broadcast à **tous les écrans** sans distinction. Aucun mécanisme de ciblage par display n'existe.

## Matrice de décision

| Critère                  | A — Splitter HDMI | B — HDBaseT       | C — Pi Zero esclaves | D — SaaS cloud        | **E — Pi + devices WiFi**                    |
| ------------------------ | ----------------- | ----------------- | -------------------- | --------------------- | -------------------------------------------- |
| Même contenu             | ✅ Natif          | ✅ Natif          | ✅ + différencié     | ✅ + différencié      | **✅ + différencié**                         |
| Contenus différents      | ❌                | ❌                | ✅                   | ✅                    | **✅**                                       |
| Distance max             | 10-15m            | 70-100m           | WiFi (~30m)          | WiFi/Ethernet club    | **Hotspot Pi (~30m)**                        |
| Dev logiciel             | 0                 | 0                 | ~10 jours            | ~5 jours              | **0** (même contenu) / **~5j** (différencié) |
| Coût hardware/TV         | 15-20€            | 60-100€           | ~45€                 | 0-50€                 | **0-50€** (stick HDMI)                       |
| Offline total            | ✅                | ✅                | ✅                   | ❌ Dépend internet    | **✅ Tout local**                            |
| Maintenance flotte       | 1 device          | 1 device          | N+1 devices          | 1 site SaaS           | **1 Pi (inchangé)**                          |
| Scalabilité (ajouter TV) | Nouveau splitter  | Nouveau récepteur | Nouveau Pi Zero      | Ouvrir une URL        | **Connecter au hotspot**                     |
| Score Stramatel live     | ✅ série directe  | ✅ série directe  | ✅ Socket.IO relay   | ⚠️ Cloud relay ~200ms | **✅ Socket.IO local 0ms**                   |
| Remote (télécommande)    | ✅ Inchangée      | ✅ Inchangée      | ⚠️ Adaptation        | ✅ Socket.IO cloud    | **✅ Inchangée**                             |
| Réseau requis            | Aucun             | Aucun             | Hotspot Pi           | WiFi club + internet  | **Hotspot Pi seul**                          |

---

## Scénario A — Splitter HDMI 1→4 direct (distance < 10m) ✅

```
┌─────────────┐    HDMI     ┌──────────────┐
│ Raspberry Pi │───────────→│ Splitter 1→4 │
│  (HDMI 1)   │            │  HDMI actif   │
└─────────────┘            └──┬──┬──┬──┬───┘
                              │  │  │  │
                    HDMI      │  │  │  │  HDMI (max ~10-15m)
                              ↓  ↓  ↓  ↓
                            TV1 TV2 TV3 TV4
```

**Principe** : Splitter actif 1→4 duplique le signal HDMI. Chaque TV reçoit une copie exacte (vidéo + audio + overlay).

**Hardware** : Splitter HDMI 1→4 actif (30-50€) + câbles HDMI (5-15€/câble).

**Impact Remote** : **Aucun.** Le splitter est transparent — la Remote contrôle 1 flux, les 4 TV affichent la même chose.

**Limites** : Distance max ~10-15m. Même contenu uniquement.

### Scénario B — HDBaseT Cat6 (distance > 10m) ✅

```
┌─────────────┐    HDMI     ┌─────────────────┐
│ Raspberry Pi │───────────→│ Émetteur HDBaseT│
│  (HDMI 1)   │            └──┬──┬──┬──┬──────┘
                              │  │  │  │  Cat6 (70-100m)
                              ↓  ↓  ↓  ↓
                           [Rx][Rx][Rx][Rx] → HDMI → TV1-4
```

**Principe** : Signal HDMI transporté sur Cat6/Ethernet. Standard AV professionnel (HDBaseT).

**Hardware** : Matrice HDBaseT 1→4 (150-250€) + récepteurs (30-50€/pièce) + Cat6.

**Impact Remote** : **Aucun.** Identique au scénario A.

**Avantages** : 70-100m de portée, câblage Ethernet souvent déjà tiré, PoE possible.

### Scénario C — Pi Zero esclaves (contenus différenciés)

```
                          WiFi Hotspot du Pi maître
                                    │
            ┌───────────┬───────────┼───────────┐
            ↓           ↓           ↓           ↓
      Pi maître     Pi Zero 2W  Pi Zero 2W  Pi Zero 2W
      HDMI → TV1    HDMI → TV2  HDMI → TV3  HDMI → TV4
      /tv?d=1       /tv?d=2     /tv?d=3     /tv?d=4
```

**Principe** : Pi principal = maître (serveur, stockage, Stramatel). Pi Zero 2W (~20€) derrière chaque TV secondaire, connectés au hotspot WiFi du maître.

**Impact Remote** :

- BroadcastChannel ne traverse pas le réseau → **Socket.IO canal primaire** pour les esclaves
- Nécessite ajout du champ `targetDisplay` + sélecteur de display dans la Remote
- Score/phase/breaking news → broadcast global ; vidéos → ciblable par display

**Dev** : ~7-10 jours (infra réseau + adaptation Remote + dashboard).

**Limites** : N+1 devices à maintenir, bande passante WiFi (3× 1080p ≈ 15 Mbps, OK pour WiFi Pi 5).

---

## Scénario D — SaaS Multi-URL (NOUVEAU) ✅ Recommandé

> **Le game-changer.** Chaque TV du club exécute un navigateur qui charge l'URL SaaS du site. Zéro matériel Neopro.

```
                        Internet / WiFi du club
                                  │
                    ┌─────────────┼─────────────┐
                    ↓             ↓             ↓
              Smart TV 1    Fire Stick 2   Chromecast 3    ...N
              Chrome/Tizen  Silk Browser   Chrome Cast
              saas/?site=X  saas/?site=X   saas/?site=X
              &display=1    &display=2     &display=3
                    │             │             │
                    └──── Socket.IO room ───────┘
                              siteId=X
                                  │
                         Central Server (cloud)
                                  │
                            Remote (smartphone)
                            saas/?site=X&remote=1
```

### Comment ça marche

1. **Chaque TV** charge `https://neopro-admin.kalonpartners.bzh/saas/?site={siteId}&display={N}`
2. **Le Central Server** sert la configuration (profil par défaut enrichi, URLs FTP résolues)
3. **Socket.IO** coordonne toutes les TV dans la même room `siteId` — la Remote broadcast les commandes
4. **BroadcastChannel** reste actif pour le cas même-navigateur (ex: Remote et TV dans 2 onglets sur le même device)

### Sous-scénario D1 — Même contenu (zéro dev)

Toutes les TV chargent la même URL sans paramètre `display`. La Remote broadcast à tous via Socket.IO. **Aucun développement nécessaire — ça marche déjà aujourd'hui.**

Le score, les phases de match, les breaking news sont synchronisés via Socket.IO room. Les vidéos jouent la même playlist.

**Limitation** : léger décalage (drift) entre TV car chaque navigateur gère son propre playback. Pour les sponsors et ambiance, c'est invisible. Pour un contenu synchronisé à la frame, le splitter HDMI reste supérieur.

### Sous-scénario D2 — Contenus différenciés par TV

Nécessite le développement du **ciblage par display** (commun avec le scénario C) :

```typescript
// URL avec identifiant display
// saas/?site=abc123&display=2

// La TV s'enregistre dans la room avec son displayId
socket.emit('register-display', { siteId, displayId: 2, name: 'Buvette' });

// La Remote cible un display spécifique
socket.emit('command', {
  type: 'play-video',
  videoId: '...',
  targetDisplay: 2, // null = broadcast à tous
});

// Côté TV : filtrage
socket.on('command', (cmd) => {
  if (cmd.targetDisplay && cmd.targetDisplay !== myDisplayId) return;
  // Exécuter la commande
});
```

### Hardware pour scénario D

| Device TV                                                  | Prix         | Performance                    |
| ---------------------------------------------------------- | ------------ | ------------------------------ |
| Smart TV avec navigateur intégré (Samsung Tizen, LG webOS) | 0€ (déjà là) | ⚠️ Variable selon modèle/année |
| Amazon Fire TV Stick 4K                                    | ~40€         | ✅ Silk Browser stable         |
| Google Chromecast avec Google TV                           | ~40€         | ✅ Chrome stable               |
| Mini PC (Intel NUC / Beelink)                              | ~100-150€    | ✅✅ Meilleur navigateur       |
| Raspberry Pi 5 en mode SaaS                                | ~80€         | ✅ Chromium kiosk éprouvé      |

**Recommandation CTO** : Fire TV Stick 4K — meilleur rapport qualité/prix/fiabilité. Se branche directement en HDMI sur la TV, WiFi intégré, navigateur Silk fonctionnel. Le staff du club le configure en 5 minutes (WiFi + URL + plein écran).

### Avantages clés du scénario D

1. **Coût marginal quasi-nul** pour ajouter un écran (un stick HDMI de 40€ ou rien si Smart TV)
2. **Zéro gestion de flotte IoT** — pas de Pi à provisionner, pas d'image OS à maintenir, pas de sync agent
3. **Scalabilité illimitée** — 4, 10, 20 TV ? Ouvrir des URLs
4. **Maintenance simplifiée** — mise à jour = déployer le frontend SaaS, toutes les TV se rafraîchissent
5. **Profils de configuration** — le système de profils (ADR-037) permet naturellement d'assigner un profil par display
6. **Installation par le club lui-même** — pas besoin de technicien. URL + WiFi = opérationnel

### Limitations et mitigations

| Limitation               | Impact                                     | Mitigation                                                                                                           |
| ------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| **Dépendance Internet**  | Coupure = écrans noirs                     | Service Worker pour cache offline des vidéos et config (PWA). Fallback : afficher le dernier contenu caché           |
| **Drift entre TV**       | Vidéos pas synchronisées à la frame        | Acceptable pour sponsors/ambiance. Pour sync parfaite → scénario A/B                                                 |
| **Score Stramatel**      | Pas de liaison série directe               | Cloud relay via Central Server (déjà fonctionnel pour dashboard). Latence ~200-500ms acceptable pour affichage score |
| **Navigateurs Smart TV** | Qualité variable                           | Recommander Fire Stick/Chromecast plutôt que navigateur intégré TV                                                   |
| **WiFi du club**         | Qualité variable, congestion jour de match | Recommander réseau dédié ou VLAN pour les devices TV. Vidéos pré-cachées via Service Worker                          |
| **Kiosk mode**           | Pas de watchdog natif                      | Script de redémarrage auto sur Fire Stick (ADB). Sur Smart TV : app dédiée type "Fully Kiosk Browser"                |

### Score Stramatel en mode SaaS — Architecture détaillée

En mode Pi, le score Stramatel est capté localement via liaison série (RS-232/USB). En mode SaaS pur, il n'y a pas de Pi local. Deux approches :

**Option 1 — Pi dédié Stramatel (hybride)** :
Un seul Pi reste dans le club, connecté au panneau Stramatel. Il capte le score et le pousse au Central Server via Socket.IO. Les TV SaaS reçoivent le score depuis le cloud. Coût : ~80€ (le Pi). Latence : ~200ms.

**Option 2 — Saisie manuelle (déjà existante)** :
Le staff utilise la Remote pour saisir le score manuellement. Fonctionnel dès aujourd'hui, aucun développement. C'est le mode par défaut pour les clubs sans panneau Stramatel.

**Option 3 — API scoring tiers** :
Intégration future avec des APIs de fédérations sportives (FFR, FFF, FFHB) pour le score automatique. Non prioritaire mais architecturalement simple (webhook → Central Server → Socket.IO broadcast).

---

---

## Scénario E — Pi comme hub SaaS local (NOUVEAU) ✅✅ Recommandé

> **Le meilleur des deux mondes.** Le Pi reste le cerveau du club (vidéos locales, Stramatel, offline). Les TV supplémentaires sont de simples navigateurs connectés au hotspot WiFi du Pi. **Ça fonctionne déjà aujourd'hui.**

```
                     Hotspot WiFi NEOPRO_xxx (hostapd)
                     max_num_sta=10, 802.11n 2.4GHz
                                  │
            ┌─────────────────────┼─────────────────────┐
            │                     │                     │
     ┌──────┴──────┐     ┌───────┴───────┐    ┌────────┴────────┐
     │ Pi 5 (maître)│     │  Fire Stick    │    │  Smart TV       │
     │ HDMI → TV1   │     │  Silk Browser  │    │  Navigateur     │
     │ Chromium     │     │  neopro.local  │    │  neopro.local   │
     │ kiosk local  │     │  /tv           │    │  /tv            │
     └──────┬──────┘     └───────┬───────┘    └────────┬────────┘
            │                     │                     │
            │        Socket.IO localhost:3000            │
            │          (via nginx proxy)                 │
            └─────────────────────┼─────────────────────┘
                                  │
                        ┌─────────┴─────────┐
                        │   Pi local server  │
                        │  nginx (port 80)   │
                        │  Socket.IO (:3000) │
                        │  Videos locales    │
                        │  Stramatel série   │
                        │  Sync-agent cloud  │
                        └───────────────────┘
                                  │
                           Smartphone staff
                           neopro.local/remote
                           (hotspot WiFi)
```

### Pourquoi ça marche déjà

L'architecture Pi existante est **déjà un serveur web local complet** :

| Composant                          | Statut     | Détail                                                                            |
| ---------------------------------- | ---------- | --------------------------------------------------------------------------------- |
| **nginx** sert le frontend Angular | ✅ Actif   | `root /home/pi/neopro/webapp`, SPA fallback `try_files $uri /index.html`          |
| **nginx** sert les vidéos          | ✅ Actif   | `location /videos/` proxy vers admin-server (normalisation Unicode)               |
| **Socket.IO** coordonne TV/Remote  | ✅ Actif   | Port 3000, proxié par nginx sur `/socket.io/`                                     |
| **socketUrl** résolu dynamiquement | ✅ Actif   | `environment.raspberry.ts` : `socketUrl: ''` → utilise `window.location.hostname` |
| **Captive portal**                 | ✅ Actif   | Endpoints Android/iOS/Windows dans `nginx-captive-portal.conf`                    |
| **mDNS** (`neopro.local`)          | ✅ Actif   | avahi-daemon installé par `install.sh`                                            |
| **Hotspot WiFi**                   | ✅ Actif   | hostapd, `max_num_sta=10`, WPA2, canal 6                                          |
| **Pas d'auth sur `/tv`**           | ✅ Vérifié | Aucun `canActivate` guard sur la route TV                                         |

Un Fire Stick connecté au hotspot `NEOPRO_xxx` qui ouvre `http://neopro.local/tv` dans Silk Browser affiche **exactement** le même contenu que le kiosk Chromium du Pi — mêmes vidéos locales, même overlay de score, même Socket.IO.

### Sous-scénario E1 — Même contenu (zéro dev, disponible maintenant)

Toutes les TV chargent `http://neopro.local/tv`. Le Pi broadcast les commandes Remote à tous les clients Socket.IO. Le score Stramatel est relayé en temps réel via Socket.IO local (latence < 1ms).

**Ce qui change par rapport au splitter HDMI (scénarios A/B)** :

- (+) Pas de câblage HDMI/Cat6 entre les TV
- (+) Les TV peuvent être n'importe où dans la portée WiFi (~30m du Pi)
- (+) Chaque TV est indépendante — une panne d'un stick n'affecte pas les autres
- (-) Léger drift entre les TV (chaque navigateur gère son propre playback)
- (-) Dépend de la stabilité WiFi du hotspot Pi

### Sous-scénario E2 — Contenus différenciés par TV

Même développement que D2 (ciblage `targetDisplay`). Les TV chargent `http://neopro.local/tv?display=N`. Le dev est **identique** et mutualisé entre les scénarios C, D2 et E2.

### Capacité du hotspot Pi

Configuration actuelle (`hostapd.conf`) :

| Paramètre     | Valeur     | Implication                                               |
| ------------- | ---------- | --------------------------------------------------------- |
| `max_num_sta` | 10         | 10 clients WiFi max (4 TV + 3 smartphones Remote + marge) |
| `hw_mode`     | g (2.4GHz) | ~100 Mbps théorique, ~40-60 Mbps réel                     |
| `ieee80211n`  | 1          | WiFi N activé (HT20/HT40)                                 |
| `channel`     | 6          | Canal fixe — pas d'interférence auto-channel              |
| `wmm_enabled` | 1          | QoS multimedia activé — priorise les flux vidéo           |

**Bande passante pour N TV** :

| Config                          | Débit requis | Marge sur WiFi N | Verdict        |
| ------------------------------- | ------------ | ---------------- | -------------- |
| 1 TV locale (kiosk) + 1 TV WiFi | ~10 Mbps     | 4-6×             | ✅ Confortable |
| 1 TV locale + 3 TV WiFi         | ~25 Mbps     | 1.5-2.5×         | ✅ OK          |
| 1 TV locale + 5 TV WiFi         | ~35 Mbps     | 1-1.5×           | ⚠️ Limite      |
| 1 TV locale + 8 TV WiFi         | ~50 Mbps     | Saturé           | ❌ Trop        |

**Estimation** : 1 flux vidéo 1080p@30fps H.264 ≈ 5-8 Mbps. Chaque TV WiFi charge les vidéos depuis nginx local. Avec le WiFi N du Pi 5, **3-4 TV WiFi supplémentaires** sont confortables. Au-delà de 5, envisager :

- Réduire à 720p pour les TV WiFi éloignées
- Utiliser le port Ethernet du Pi + un switch pour les TV qui ont un port Ethernet (certains Fire Stick ont un adaptateur USB-Ethernet)
- Passer au WiFi AC (5GHz) via dongle USB si le Pi n'est pas un Pi 5 (le Pi 5 a du WiFi AC natif)

**Note Pi 5** : Le Pi 5 supporte nativement le WiFi AC (802.11ac, 5GHz, ~300 Mbps réel). Avec `hw_mode=a` et `ieee80211ac=1`, la capacité passe à **8-10 TV WiFi** confortablement. Recommandation : **migrer la config hostapd vers 5GHz pour les clubs multi-TV**.

### Avantages clés du scénario E

1. **Zéro dev, zéro coût logiciel** — tout est déjà en place
2. **Offline total** — aucune dépendance internet, le Pi est autonome
3. **Score Stramatel en temps réel** — liaison série locale, relayé par Socket.IO, latence < 1ms
4. **Réseau maîtrisé** — le hotspot Pi est dédié, pas de congestion avec le WiFi du club
5. **Installation triviale** — le staff du club branche un Fire Stick et se connecte au hotspot
6. **Maintenance flotte inchangée** — le Central Server voit 1 Pi, pas N devices. Les sticks sont des "clients muets"
7. **Captive portal déjà configuré** — les smartphones/tablettes se connectent sans friction au hotspot
8. **Profils multi-config** — le Pi supporte déjà les profils. Chaque TV pourrait charger un profil différent
9. **Dual-display Pi compatible** — le Pi 5 peut piloter 2 TV en HDMI direct + N TV en WiFi. Hybride total.

### Limitations et mitigations

| Limitation                                    | Impact                                        | Mitigation                                                                         |
| --------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Portée WiFi hotspot** (~30m intérieur)      | TV éloignées hors portée                      | Répéteur WiFi ou point d'accès relais sur le même SSID                             |
| **Bande passante WiFi N**                     | Limite à ~4 TV WiFi en 1080p                  | Passer en WiFi AC (5GHz) sur Pi 5 ou réduire à 720p                                |
| **Drift entre TV**                            | Vidéos pas synchronisées à la frame           | Acceptable pour sponsors/ambiance. Splitter HDMI pour sync parfaite                |
| **Navigateur Smart TV variable**              | Certains navigateurs intégrés sont médiocres  | Recommander Fire Stick 4K (40€, navigateur fiable)                                 |
| **Pas de watchdog sur les sticks**            | Un crash navigateur = TV figée                | App "Fully Kiosk Browser" (gratuit) avec auto-reload sur crash                     |
| **Canal 2.4GHz congestionné** (jour de match) | Interférences avec les téléphones spectateurs | Les spectateurs sont sur le WiFi club, pas sur le hotspot Pi. Canal dédié          |
| **Central Server ne voit pas les TV WiFi**    | Monitoring partiel                            | Phase 2 : le Pi reporte le nombre de clients Socket.IO connectés dans le heartbeat |

### Hardware recommandé pour scénario E

| Device                               | Prix | Avantages                                                | Inconvénients                  |
| ------------------------------------ | ---- | -------------------------------------------------------- | ------------------------------ |
| **Amazon Fire TV Stick 4K**          | ~40€ | WiFi AC, Silk Browser, HDMI direct, télécommande incluse | Nécessite un compte Amazon     |
| **Xiaomi Mi TV Stick**               | ~30€ | Moins cher, Android TV                                   | Navigateur moins stable        |
| **Google Chromecast avec Google TV** | ~40€ | Chrome stable, Google Cast                               | Nécessite un compte Google     |
| **Smart TV (navigateur intégré)**    | 0€   | Déjà là                                                  | Navigateur souvent lent/ancien |
| **Ancien smartphone/tablette**       | 0€   | Recyclage                                                | Petit écran, batterie          |

**Recommandation** : Fire TV Stick 4K. Se branche en HDMI, WiFi intégré, télécommande IR pour naviguer. Le staff configure en 5 minutes : WiFi `NEOPRO_xxx` → Silk Browser → `neopro.local/tv` → plein écran.

---

## Scénario E vs D — Quand choisir lequel ?

| Situation                           | Scénario recommandé     | Raison                                                         |
| ----------------------------------- | ----------------------- | -------------------------------------------------------------- |
| Club avec Pi déjà installé          | **E**                   | Le Pi est là, autant l'utiliser comme hub                      |
| Club sans Pi, WiFi club fiable      | **D** (SaaS cloud)      | Pas de hardware Neopro du tout                                 |
| Club sans Pi, WiFi club instable    | **E** (installer un Pi) | Le hotspot Pi est un réseau dédié et fiable                    |
| Club avec Stramatel                 | **E**                   | Le Pi capte le score en série — pas d'alternative cloud fiable |
| Club rural, internet intermittent   | **E**                   | Offline total, aucune dépendance internet                      |
| Chaîne de clubs, déploiement rapide | **D**                   | Zéro hardware à expédier                                       |
| Événement temporaire / démo         | **D**                   | Setup en 2 minutes, pas de Pi à transporter                    |

---

## Recommandation stratégique (vision CTO)

### Court terme — Clubs Pi existants, multi-TV même contenu

→ **Scénario E1 (Pi hub + devices WiFi)** : **Fonctionne aujourd'hui, zéro dev, zéro coût si Smart TV.** Le club branche des Fire Stick (40€/TV) au hotspot `NEOPRO_xxx` et charge `neopro.local/tv`. Score Stramatel, offline, Remote — tout marche.

Alternative : **Scénario A/B** (splitter HDMI) si le club veut la synchronisation frame-perfect ou si le WiFi du Pi est saturé.

### Court terme — Nouveaux clubs sans Pi

→ **Scénario D1 (SaaS cloud)** : Fonctionne aujourd'hui sans développement. Chaque TV charge l'URL SaaS cloud. Pas de hardware Neopro.

Si le club a besoin de Stramatel ou d'offline → installer un Pi et passer en **scénario E**.

### Moyen terme — Contenus différenciés (Q3 2026)

→ **Ciblage `targetDisplay`** : Un seul développement (~5 jours) qui bénéficie aux **3 scénarios** D2, E2 et C. Paramètre `?display=N` dans l'URL, sélecteur de display dans la Remote, filtrage Socket.IO côté TV.

### Moyen terme — Optimisation WiFi Pi 5 pour multi-TV

→ **Passer hostapd en WiFi AC (5GHz)** : Le Pi 5 supporte nativement le 802.11ac. Avec `hw_mode=a` + `ieee80211ac=1`, la bande passante passe de ~50 Mbps à ~300 Mbps, supportant **8-10 TV WiFi** en 1080p. Quick win, 10 lignes de config.

### Long terme — Offline-first SaaS (2027+)

→ **PWA avec Service Worker** pour le scénario D uniquement. Le scénario E n'en a pas besoin — il est déjà offline-first par design.

### Abandon progressif du scénario C

Le scénario C (Pi Zero esclaves) n'a plus de justification face aux scénarios D et E :

- Pi Zero 2W (20€) + alim (10€) + SD (8€) + câble (5€) = **43€/TV** + gestion de flotte IoT + image OS à maintenir
- Fire TV Stick 4K = **40€/TV**, zéro gestion, installation par le club
- Le scénario E offre **les mêmes avantages** que C (offline, Stramatel, réseau dédié) sans la complexité N+1 devices

Le scénario C reste pertinent **uniquement** pour un besoin de synchronisation frame-perfect entre le Pi maître et les écrans esclaves (cas marginal).

### Résumé exécutif

```
                    Clubs Pi existants          Nouveaux clubs
                    ─────────────────           ──────────────
Même contenu        E1 (hub WiFi)  ★★★         D1 (SaaS cloud) ★★★
                    A/B (splitter) ★★           E1 (installer Pi) ★★

Différencié         E2 (hub + display)          D2 (SaaS + display)
                    → dev mutualisé ~5j         → même dev

Stramatel           E (obligatoire)             E (installer Pi)
Offline             E (natif)                   E (installer Pi)
```

---

## Plan d'implémentation révisé

### Phase 0 — E1 Pi hub WiFi même contenu (0 jour dev, disponible maintenant)

**Action immédiate pour tout club Pi existant.** Documentation d'installation :

1. Acheter un Fire TV Stick 4K (~40€) ou utiliser la Smart TV existante
2. Brancher le Stick en HDMI sur la TV
3. Connecter au WiFi `NEOPRO_xxx` (mot de passe dans la fiche club)
4. Ouvrir Silk Browser → `http://neopro.local/tv`
5. Passer en plein écran (F11 ou bouton navigateur)
6. Répéter pour chaque TV supplémentaire

**Critères de validation** :

- [ ] N TV affichent le même contenu simultanément via hotspot Pi
- [ ] Remote contrôle toutes les TV (play, pause, score, breaking news)
- [ ] Score Stramatel visible sur toutes les TV en temps réel
- [ ] Pas de drift visible entre TV sur playlist sponsors (< 2s acceptable)
- [ ] Stabilité sur 5h de fonctionnement continu (jour de match)
- [ ] Reconnexion automatique après déconnexion WiFi temporaire
- [ ] Le hotspot Pi supporte N devices sans dégradation (mesurer avec 4 TV + 2 smartphones)

### Phase 1 — D1 SaaS cloud même contenu (0 jour dev)

Pour les clubs sans Pi. Documentation d'installation :

1. Acheter un Fire TV Stick 4K (ou utiliser Smart TV)
2. Connecter au WiFi du club (internet requis)
3. Ouvrir Silk Browser / Chrome
4. Charger `https://neopro-admin.kalonpartners.bzh/saas/?site={siteId}`
5. Passer en plein écran

**Critères de validation** :

- [ ] N TV affichent le même contenu simultanément via URL SaaS cloud
- [ ] Remote contrôle toutes les TV via Socket.IO cloud
- [ ] Stabilité sur 5h de fonctionnement continu

### Phase 1.5 — Optimisation WiFi AC pour clubs multi-TV (0.5 jour)

Pour les clubs E1 avec 4+ TV, passer le hotspot Pi 5 en WiFi AC :

| Tâche                                                                | Effort |
| -------------------------------------------------------------------- | ------ |
| Modifier `hostapd.conf` : `hw_mode=a`, `channel=36`, `ieee80211ac=1` | 15min  |
| Tester compatibilité Fire Stick / Smart TV en 5GHz                   | 1h     |
| Script de détection Pi 4 vs Pi 5 pour auto-config WiFi N/AC          | 2h     |
| Documenter le fallback 2.4GHz pour les devices non-5GHz              | 30min  |

### Phase 2 — Ciblage par display (5 jours dev)

Commun aux scénarios C, D2 et E2. Backlog unifié :

| Tâche                                           | Fichiers impactés                                 | Effort |
| ----------------------------------------------- | ------------------------------------------------- | ------ |
| Paramètre `display` dans URL SaaS + Pi          | `tv.component.ts`, routing                        | 0.5j   |
| Registry des displays connectés (cloud)         | `central-server/src/services/display-registry.ts` | 1j     |
| Champ `targetDisplay` dans événements Socket.IO | `socket/handlers.js`, `remote.controller.ts`      | 0.5j   |
| Filtrage côté TV des commandes non ciblées      | `tv.component.ts`                                 | 0.5j   |
| Sélecteur de display dans la Remote             | `remote.component.ts/html`                        | 1j     |
| Dashboard : nommage + monitoring displays       | `central-dashboard/src/app/features/sites/`       | 1j     |
| Profil par display (assign playlist)            | `config-profiles.controller.ts`                   | 0.5j   |

### Phase 3 — Résilience offline SaaS (future)

| Tâche                                   | Effort |
| --------------------------------------- | ------ |
| Service Worker pour cache config        | 2j     |
| Cache offline des vidéos (IndexedDB)    | 3j     |
| Détection online/offline + UI indicator | 1j     |
| Sync delta au retour de la connexion    | 2j     |

---

## Budget estimé révisé

| Scénario                          | Matériel/TV | Dev logiciel | Maintenance | Offline | Stramatel | Recommandation         |
| --------------------------------- | ----------- | ------------ | ----------- | ------- | --------- | ---------------------- |
| A — Splitter HDMI (< 10m)         | 15-20€      | 0            | Aucune      | ✅      | ✅        | Sync frame-perfect     |
| B — HDBaseT Cat6 (> 10m)          | 60-100€     | 0            | Aucune      | ✅      | ✅        | Grandes distances      |
| C — Pi Zero esclaves              | ~45€        | ~10 jours    | Flotte IoT  | ✅      | ✅        | ⚠️ Obsolète            |
| D1 — SaaS cloud même contenu      | 0-40€       | 0            | Aucune      | ❌      | ❌        | Nouveaux clubs sans Pi |
| D2 — SaaS cloud différencié       | 0-40€       | ~5 jours     | Aucune      | ❌      | ❌        | Moyen terme            |
| **E1 — Pi hub WiFi même contenu** | **0-40€**   | **0**        | **Aucune**  | **✅**  | **✅**    | **✅✅ Clubs Pi**      |
| **E2 — Pi hub WiFi différencié**  | **0-40€**   | **~5 jours** | **Aucune**  | **✅**  | **✅**    | **✅✅ Moyen terme**   |

---

## Alternatives Considérées

### 1. Adaptateurs USB→HDMI (DisplayLink)

**Verdict** : Rejeté — qualité vidéo insuffisante, drivers DisplayLink instables sur ARM/Linux.

### 2. Pi Compute Module 5 + IO Board custom

**Verdict** : Rejeté — limité à 3 sorties, surcoût et complexité disproportionnés.

### 3. Distribution HDMI matérielle (Scénarios A/B) ✅

**Verdict** : Accepté pour les clubs Pi existants. Rapport coût/fiabilité optimal.

### 4. SaaS Multi-URL cloud (Scénario D) ✅

**Verdict** : Accepté pour les nouveaux clubs sans Pi. Coût marginal quasi-nul, mais dépendant d'internet.

### 5. Pi comme hub SaaS local (Scénario E) ✅✅ NOUVEAU — RECOMMANDÉ

**Verdict** : Accepté comme approche par défaut pour tous les clubs avec Pi. Combine la résilience offline et Stramatel du Pi avec la flexibilité multi-écran du SaaS. Fonctionne déjà, zéro développement.

---

## Conséquences

### Positives

1. **Les scénarios E1 et D1 sont gratuits et immédiats** — zéro dev, zéro coût logiciel
2. **Le scénario E cumule tous les avantages** — offline + Stramatel + multi-TV + réseau dédié
3. **Scalabilité linéaire** — ajouter une TV = connecter un stick au hotspot
4. **Unification Pi/SaaS** — le dev du ciblage display bénéficie aux trois modes (C, D, E)
5. **Time-to-value client** — un club Pi existant peut être multi-TV en 5 minutes
6. **Pas de changement de modèle flotte** — le Central Server continue de gérer 1 Pi par club, pas N devices

### Négatives

1. **Dépendance internet** (scénario D uniquement) — mitigé par Service Worker futur
2. **Pas de sync frame-perfect** (scénarios D et E) — acceptable pour 95% des cas d'usage
3. **Bande passante WiFi Pi** (scénario E) — limite à ~4 TV en WiFi N, ~10 en WiFi AC
4. **Stramatel** nécessite un Pi (scénario D) ou saisie manuelle

### Risques révisés

| Risque                                     | Probabilité | Impact                    | Mitigation                                        |
| ------------------------------------------ | ----------- | ------------------------- | ------------------------------------------------- |
| WiFi du club instable jour de match        | Élevée      | TV freezent               | Réseau dédié/VLAN + Service Worker offline        |
| Smart TV avec navigateur obsolète          | Moyenne     | Contenu mal rendu         | Recommander Fire Stick (navigateur à jour)        |
| Drift > 5s entre TV                        | Faible      | Visible si TV côte à côte | Sync heartbeat Socket.IO (re-sync périodique)     |
| Fire Stick reboot/mise à jour intempestive | Faible      | TV éteinte temporairement | Mode kiosk "Fully Kiosk" + désactiver auto-update |
| Splitter HDMI en panne (A/B)               | Très faible | Toutes TV éteintes        | Splitter de rechange (~30€)                       |
| Bande passante FTP insuffisante            | Faible      | Buffering                 | CDN ou cache local (Service Worker)               |

---

## Références

- `raspberry/src/app/components/tv/tv.component.ts` — Système master/slave + display param
- `raspberry/src/app/components/remote/remote.component.ts` — Remote controller
- `raspberry/src/app/services/local-broadcast.service.ts` — BroadcastChannel dual-channel
- `raspberry/server/socket/handlers.js` — Gestion rôles TV + relay événements
- `central-server/src/controllers/saas.controller.ts` — Config SaaS avec URL resolution
- `central-server/src/controllers/config-profiles.controller.ts` — Profils de configuration
- `central-server/src/repositories/config-profile.repository.ts` — Repository profils
- [ADR-001](../adr/ADR-001-edge-cloud-architecture.md) — Architecture Edge-Cloud
- [ADR-008](../adr/ADR-008-double-buffer-video-pi.md) — Double-Buffer Vidéo
- [ADR-037](../adr/ADR-037-saas-site-type.md) — SaaS Site Type
- `raspberry/config/systemd/hostapd.conf` — Config hotspot WiFi (max_num_sta, hw_mode, channel)
- `raspberry/config/nginx-captive-portal.conf` — Nginx Pi (SPA + vidéos + Socket.IO proxy + captive portal)
- `raspberry/src/environments/environment.raspberry.ts` — socketUrl dynamique (résolu via window.location)

---

## Convergence avec PROP-002 (TV + LED dual output)

PROP-001 et [PROP-002](./PROP-002-tv-led-dual-output.md) sont **complémentaires** et partagent des concepts unifiables. Ensemble, ils permettent au Pi de gérer **3 axes de sortie simultanés** :

```
Pi 5 (1 seul device)
│
├── HDMI 0 → [Splitter] → TV1, TV2, TV3      PROP-001 scénario A/B (même contenu)
│                                              displayType = 'tv'
│
├── HDMI 1 → Contrôleur LED → Bandeau LED     PROP-002 (contenu LED adapté)
│                                              displayType = 'led'
│
└── Hotspot WiFi → Fire Stick → TV Buvette    PROP-001 scénario E (SaaS local)
                   Fire Stick → TV Vestiaire   displayType = 'tv', displayId = 4, 5
                   Tablette  → Totem accueil   displayType = 'totem' (futur)
```

### Modèle unifié : displayType + displayId

Les deux PROP introduisent la notion de "quel contenu pour quel écran" sous des angles différents. On unifie avec deux dimensions :

| Dimension     | Rôle                                                       | Exemples                                 | Source   |
| ------------- | ---------------------------------------------------------- | ---------------------------------------- | -------- |
| `displayType` | **Type** d'écran — détermine le **format** du contenu      | `'tv'`, `'led'`, `'totem'`               | PROP-002 |
| `displayId`   | **Instance** spécifique — permet le **ciblage** individuel | `1` (hall), `2` (buvette), `3` (tribune) | PROP-001 |

**Règles de dispatch** :

```typescript
// Chaque écran s'enregistre avec type + id
socket.emit('register-display', {
  siteId,
  displayType: 'tv', // format du contenu
  displayId: 2, // instance spécifique
  name: 'TV Buvette', // label humain
  source: 'wifi', // 'hdmi' | 'wifi' (informatif)
});

// La Remote cible par type, par id, ou broadcast
socket.emit('command', {
  type: 'play-video',
  videoId: '...',
  targetDisplay: null, // null = TOUS les écrans
  targetType: null, // null = tous les types
});

// Score → broadcast global (tous types, tous ids)
// Vidéo sponsor → chaque type joue sa variante (PROP-002)
// Vidéo manuelle → ciblable par displayId (PROP-001 Phase 2)
```

**Dispatch côté récepteur** :

| Événement            | Filtrage type | Filtrage id | Comportement                                           |
| -------------------- | ------------- | ----------- | ------------------------------------------------------ |
| `score-update`       | Non (tous)    | Non (tous)  | Chaque type affiche son template de score              |
| `phase-change`       | Non (tous)    | Non (tous)  | Chaque type switch sa boucle de phase                  |
| `breaking-news`      | Non (tous)    | Non (tous)  | Format adapté au type (overlay TV, pleine largeur LED) |
| `command` (video)    | **Oui**       | **Oui**     | Joue la variante du bon type, sur le bon id            |
| `command` (sponsors) | **Oui**       | Non (tous)  | Chaque type joue sa variante sponsor                   |

### Dev mutualisé

Le ciblage display (Phase 2 PROP-001, ~5j) et le dual kiosk + variantes (PROP-002, ~8-12j) partagent :

| Composant partagé              | PROP-001             | PROP-002              | Mutualisé |
| ------------------------------ | -------------------- | --------------------- | --------- |
| `register-display` Socket.IO   | displayId            | displayType           | 1×        |
| Filtrage commandes côté TV     | targetDisplay        | displayType           | 1×        |
| Registry displays (serveur Pi) | Instances connectées | Types connectés       | 1×        |
| Sélecteur display dans Remote  | Par id               | Par type (indicateur) | 1×        |
| Dashboard monitoring displays  | Nombre de TV WiFi    | TV + LED status       | 1×        |

**Recommandation** : implémenter les deux en une seule phase unifiée. Le modèle `displayType` + `displayId` couvre les deux besoins.

### Vision complète : le Pi comme hub multi-sortie

```
┌──────────────────────────────────────────────────────────┐
│                     Pi 5 — Hub unifié                     │
│                                                          │
│  nginx (frontend Angular + vidéos locales)               │
│  Socket.IO (coordination tous écrans + Remote)            │
│  Sync-agent (config + vidéos depuis le cloud)            │
│  Stramatel (score série RS-232 → Socket.IO broadcast)    │
│                                                          │
│  Sorties :                                               │
│  ├── HDMI 0 → TV(s) via splitter    [displayType=tv]     │
│  ├── HDMI 1 → LED via contrôleur    [displayType=led]    │
│  └── WiFi  → N devices navigateur   [displayType=*]      │
│                                                          │
│  Entrées :                                               │
│  ├── Remote (smartphone via hotspot)                     │
│  ├── Stramatel (série RS-232/USB)                        │
│  └── Cloud (sync-agent, commandes dashboard)             │
└──────────────────────────────────────────────────────────┘
```

---

_Créé le 11 février 2026 — Révisé le 11 avril 2026 (ajout scénarios D/E, convergence PROP-002, matrice de décision, recommandation stratégique)_
