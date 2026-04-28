# Guide — Multi-TV via hotspot Pi (même contenu)

> Procédure terrain pour ajouter une 2ᵉ (ou 3ᵉ/4ᵉ) TV à un site Pi existant **sans tirer de câble HDMI**, en utilisant le hotspot WiFi du Pi comme réseau dédié et un device navigateur (**Fire TV Stick** ou **Google TV Streamer / Chromecast with Google TV**) sur la TV supplémentaire.
>
> ⚠️ **Un simple "Chromecast" sans Google TV ne fonctionne PAS** (dongle de cast passif sans navigateur ni télécommande). Voir §2 BoM pour le détail.
>
> Référence design : [PROP-001 — Multi-TV Single Pi, scénario E1](../proposals/PROP-001-multi-tv-single-pi.md).

**Date** : 2026-04-28
**Version** : 1.1 (ajout matrice de décision + critique honnête fiabilité grand public)
**Public cible** : installateur Neopro, ops support, staff club autonome
**Pré-requis** : club avec **Pi déjà installé et opérationnel**.

> **⚠️ À lire avant** : ce guide n'est **PAS** la solution universelle multi-TV. Pour la TV principale d'un match critique, préférer un splitter HDMI actif (scénario A de PROP-001) ou un 2ᵉ Pi 5 en mode SaaS. Voir §1 "Choisir la bonne solution selon la situation" pour la matrice de décision complète. Les Fire Stick / Chromecast sont des devices grand public — bien adaptés aux écrans secondaires (buvette, vestiaires), avec des réserves documentées en §7 pour un usage match-day.

---

## Contrat en 1 phrase

> La 2ᵉ TV charge `http://neopro.local/tv` via Silk Browser sur un Fire TV Stick connecté au hotspot `NEOPRO_<club>` du Pi → elle affiche **exactement** le même contenu que le kiosk Pi natif (vidéos locales, Stramatel, Remote), avec un drift léger (1-2s) sur les boucles vidéo.

---

## 1. Choisir la bonne solution selon la situation

> **Important** : ce guide n'est pas la seule réponse multi-TV. Le bon choix dépend de **(a) la criticité de l'écran** (TV principale de match vs TV ambiance buvette), **(b) la distance Pi ↔ TV**, et **(c) la possibilité de tirer un câble**.

### Matrice de décision

| Situation                                                  | Solution recommandée                                                                                                                                               | Pourquoi                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| **TV principale de match**, câblage HDMI possible, ≤ 10m   | **Splitter HDMI actif** + câble HDMI court ([PROP-001 scénario A](../proposals/PROP-001-multi-tv-single-pi.md#scénario-a--splitter-hdmi-14-direct-distance--10m-)) | Sync frame-perfect, fiabilité industrielle, 1 seul système à monitorer (le Pi)   |
| **TV principale de match**, câblage possible, 10-100m      | **HDBaseT Cat6** ([PROP-001 scénario B](../proposals/PROP-001-multi-tv-single-pi.md#scénario-b--hdbaset-cat6-distance--10m-))                                      | Idem A mais sur Cat6, indépendant du WiFi/hotspot (transport pur du signal HDMI) |
| **TV principale**, câblage impossible, ≤ 30m du Pi         | **2ᵉ Pi 5 en mode SaaS** sur le hotspot (~80€)                                                                                                                     | Stack Neopro complète : watchdog, kiosk Chromium, OTA, monitoring central        |
| **TV secondaire** (buvette, vestiaires, hall), ≤ 30m du Pi | **Ce guide — Fire Stick / Chromecast sur hotspot**                                                                                                                 | Setup 5 min, ~40€, drift 1-2s acceptable hors écran principal                    |
| **TV secondaire**, 30-50m du Pi                            | Ce guide + **répéteur WiFi** sur SSID `NEOPRO_<club>`                                                                                                              | Étendre la portée du hotspot                                                     |
| **TV secondaire**, > 50m                                   | HDBaseT, ou WiFi du club + 2ᵉ Pi SaaS                                                                                                                              | Hors portée hotspot                                                              |
| Aucun Pi installé                                          | [PROP-001 scénario D](../proposals/PROP-001-multi-tv-single-pi.md#scénario-d--saas-multi-url-nouveau--recommandé) (SaaS cloud pur)                                 | Pas l'objet de ce guide                                                          |
| Contenus différenciés par TV                               | Pas livré à ce jour ([PROP-001 Phase 2](../proposals/PROP-001-multi-tv-single-pi.md#phase-2--ciblage-par-display-5-jours-dev--à-re-chiffrer-voir-note-ci-dessous)) | Phase de dev à venir                                                             |

### Quand utiliser CE guide précisément

✅ **OK** :

- Club Pi existant et opérationnel
- TV supplémentaire = écran **secondaire** (buvette, vestiaires, hall, totem accueil) — pas l'écran principal de match si la sync frame-perfect ou la fiabilité industrielle sont critiques
- Distance Pi ↔ TV ≤ 30m (portée hotspot 2.4GHz)
- Câblage HDMI/Cat6 impossible ou disproportionné (mur, plafond, traversée)
- Drift visuel de 1-2s acceptable (TV non côte à côte, contenu d'ambiance type sponsors/boucles)

⚠️ **Réserves** (cf. §7 Limitations pour le détail) :

- Fire Stick / Chromecast = devices grand public, fiabilité jour de match (5h+) **non garantie** sans Fully Kiosk Browser
- Pas de monitoring central des sticks (invisibles côté flotte Neopro)
- Pas de watchdog natif → un crash navigateur = TV figée jusqu'à intervention humaine

❌ **NE PAS utiliser ce setup pour** :

- Sync frame-perfect requis (TV côte à côte, mur d'images) → splitter HDMI actif (scénario A)
- TV principale de match avec exigence de fiabilité industrielle → splitter HDMI ou 2ᵉ Pi 5 SaaS
- Distance > 30m sans répéteur WiFi → HDBaseT Cat6 (scénario B)
- Contenus différenciés par TV → pas livré à ce jour (PROP-001 Phase 2 à re-chiffrer)
- Club sans Pi → SaaS cloud (scénario D)

---

## 2. Bill of Materials (par TV supplémentaire)

| Élément                | Recommandé (option A)            | Recommandé (option B)                          | Alternatives                                                                                                                    |
| ---------------------- | -------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Device navigateur HDMI | **Amazon Fire TV Stick 4K** ~40€ | **Google TV Streamer (4K)** ~50€ — modèle 2024 | Smart TV avec navigateur intégré (0€, qualité variable), Mini-PC, ancien smartphone Android, Raspberry Pi 5 en mode SaaS (~80€) |
| Câble HDMI court       | Inclus avec le stick             | Inclus avec le Streamer                        | —                                                                                                                               |
| Alim                   | USB depuis port TV (souvent)     | USB-C secteur (fournie)                        | —                                                                                                                               |
| Compte                 | Compte Amazon                    | Compte Google                                  | Aucun si Smart TV / mini-PC                                                                                                     |

**Total : ~40-50€ par TV** (ou 0€ si Smart TV moderne avec navigateur fonctionnel).

> **⚠️ Attention au piège "Chromecast"** : il existe deux familles de produits Google qui partagent ce nom — seule la **2ᵉ génération** fonctionne pour Neopro :
>
> | Produit                                                                                      | Description                                                                                                                                   | Compatible Neopro ? |
> | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
> | **Chromecast 1ʳᵉ-3ᵉ gen / Chromecast Ultra** (2013-2020)                                     | Dongle simple **sans télécommande, sans UI, sans navigateur**. Reçoit uniquement du contenu casté depuis un téléphone/laptop via Google Cast. | ❌ **NON**          |
> | **Google TV Streamer (4K)** 2024 — ou ancien **Chromecast with Google TV (4K/HD)** 2020-2023 | Vrai device Android TV avec **télécommande, UI, Play Store, Chrome préinstallé**. Tu navigues comme sur une Smart TV.                         | ✅ **OUI**          |
>
> Lors de l'achat, **vérifier explicitement** : la boîte mentionne "Google TV" ou "with Google TV", contient une télécommande, et le produit a un app store. Un simple "Chromecast" sans cette mention = ancien dongle Cast = **ne marchera pas standalone** (il faudrait laisser un laptop allumé en permanence en train de caster `neopro.local/tv`, pas viable en prod).

---

## 3. Pré-requis Pi (à vérifier en amont)

- [ ] Pi opérationnel, kiosk Chromium affichant `/tv` correctement.
- [ ] Hotspot `NEOPRO_<club>` actif (vérifier sur smartphone à proximité).
- [ ] PSK du hotspot connu (cf. [MODOP_CLUB_PSK.md](MODOP_CLUB_PSK.md)).
- [ ] mDNS actif : `ssh pi@neopro.local` répond, OU `systemctl status avahi-daemon` est `active (running)`.
- [ ] Capacité hotspot suffisante : `raspberry/config/systemd/hostapd.conf` → `max_num_sta ≥ 10` (par défaut **50**, OK).

---

## 4. Procédure d'installation (5 minutes par TV)

> **Aucune des deux options ne nécessite de développement Neopro.** Choisir selon l'écosystème que le club préfère (compte Amazon vs Google) ou ce qu'il a déjà.

### 4.A — Option Amazon Fire TV Stick 4K (Silk Browser)

1. **Brancher** le Fire TV Stick en HDMI sur la TV supplémentaire. Mettre la TV sur la bonne entrée HDMI.
2. **Activer le stick** : suivre l'assistant de démarrage Fire TV (**compte Amazon requis**, langue, etc.). Skipper les étapes optionnelles.
3. **Connecter au WiFi** : Settings → Network → choisir `NEOPRO_<club>` → entrer le PSK du club.
4. **Installer Silk Browser** : Appstore → rechercher "Silk Browser" → Get/Download (gratuit, édité par Amazon).
5. **Charger la page TV** :
   - Ouvrir Silk Browser
   - Barre d'adresse : `http://neopro.local/tv`
   - Si `neopro.local` ne résout pas → fallback : `http://192.168.4.1/tv` (IP par défaut du Pi en hotspot)
6. **Plein écran** : menu Silk (≡) → "Request desktop site" puis geste fullscreen, ou installer **Fully Kiosk Browser** (recommandé en prod, voir §5).
7. **Vérifier l'affichage** : la TV doit afficher la même boucle que le kiosk Pi principal dans les ~5 secondes.

### 4.B — Option Google TV Streamer / Chromecast with Google TV (Chrome)

> ⚠️ **Vérifier le bon produit avant d'acheter** : le device DOIT avoir une télécommande, une UI Android TV et un app store (Play Store). Voir §2 BoM pour le tableau "Attention au piège Chromecast". Un simple dongle Chromecast (sans Google TV) ne fonctionne pas.

1. **Brancher** le Google TV Streamer (ou Chromecast with Google TV) en HDMI sur la TV supplémentaire. Brancher l'alim USB-C (le device n'est pas alimenté par la TV, contrairement au Fire Stick).
2. **Activer le device** : suivre l'assistant Google TV (**compte Google requis**, langue, etc.). L'app Google Home sur smartphone facilite la config WiFi.
3. **Connecter au WiFi** : pendant l'assistant ou ensuite Settings → Network & Internet → choisir `NEOPRO_<club>` → entrer le PSK du club.
4. **Installer / ouvrir Chrome** : Chrome est généralement préinstallé sur Google TV. Sinon Play Store → "Google Chrome" → Install.
   - Variante si Chrome refuse de se lancer en plein écran : installer **Fully Kiosk Browser** depuis le Play Store (équivalent Android TV).
5. **Charger la page TV** :
   - Ouvrir Chrome
   - Barre d'adresse : `http://neopro.local/tv`
   - Si `neopro.local` ne résout pas → fallback : `http://192.168.4.1/tv`
6. **Plein écran** : Chrome menu ⋮ → mode immersif, ou utiliser Fully Kiosk (recommandé prod, voir §5).
7. **Vérifier l'affichage** : la TV doit afficher la même boucle que le kiosk Pi principal dans les ~5 secondes.

### Comment choisir entre Fire Stick et Google TV Streamer ?

| Critère                         | Fire TV Stick 4K                     | Google TV Streamer / Chromecast with Google TV   |
| ------------------------------- | ------------------------------------ | ------------------------------------------------ |
| Prix                            | ~40€                                 | ~50€ (Streamer 2024) / ~40€ (ancien Chromecast)  |
| Compte requis                   | Amazon                               | Google                                           |
| Navigateur                      | Silk Browser (Amazon, basé Chromium) | Chrome (Google, version desktop ~)               |
| Cycle de mise à jour navigateur | Plus lent (Amazon)                   | Plus rapide (Google) — léger avantage long terme |
| Télécommande fournie            | ✅ (IR + voix Alexa)                 | ✅ (Bluetooth + IR pour TV + voix Google)        |
| Setup typique                   | 5 min                                | 5 min                                            |

**Règle simple** : si le club a déjà un compte → utiliser celui-là. S'il n'a aucun des deux → préférer **Google TV Streamer** (Chrome plus à jour, écosystème plus standard) en s'assurant d'acheter le bon produit (avec télécommande Google TV, **pas un simple dongle Chromecast**).

---

## 5. Renforcement résilience (recommandé production)

Le navigateur seul peut crasher après plusieurs heures. Pour un usage jour de match (5h+), installer **Fully Kiosk Browser** (Free Edition suffit). Disponible sur **les deux plateformes** :

- **Fire TV** : Appstore → "Fully Kiosk Browser" → Install
- **Google TV / Android TV** : Play Store → "Fully Kiosk Browser" → Install

Configuration commune :

1. Ouvrir l'app, paramétrer :
   - **Start URL** : `http://neopro.local/tv`
   - **Run on device boot** : ON
   - **Auto-reload on idle / network failure** : ON
   - **Kiosk Mode** : ON (empêche de quitter l'app accidentellement)
2. Désactiver la **mise en veille** du device :
   - Fire Stick : Settings → Display & Sounds → Screen Saver → Start After → "Never"
   - Chromecast Google TV : Settings → System → Display & Sound → Advanced display settings → désactiver l'écran de veille

---

## 6. Validation post-install (checklist ops)

À cocher avant de quitter le club :

- [ ] Les 2 TV affichent simultanément la même boucle sponsors (vérifier visuellement 1 cycle complet).
- [ ] Le score Stramatel s'affiche en temps réel sur les 2 TV (latence < 1s, synchrone à l'œil).
- [ ] La Remote (smartphone sur hotspot, `http://neopro.local/remote`) contrôle les 2 TV simultanément :
  - Play vidéo manuelle → joue sur les 2.
  - Breaking news → s'affiche sur les 2.
  - Phase change (mi-temps, fin de match) → switch les 2.
- [ ] Drift visuel < 2s entre les 2 TV après 10 min de boucle continue.
- [ ] Coupure WiFi du Fire Stick pendant 30s → reconnexion auto sans intervention staff.
- [ ] Stabilité : laisser tourner 30 min sans interaction → aucune TV figée, pas d'écran noir.

---

## 7. Limitations à communiquer au club

### Limitations techniques liées au WiFi

- **Drift** : les vidéos peuvent décaler de 1-2s entre les 2 TV (chaque navigateur gère son propre playback). Invisible pour des sponsors / boucles d'ambiance, peut se voir si les TV sont côte à côte. Pour une sync parfaite → splitter HDMI ([PROP-001 scénario A](../proposals/PROP-001-multi-tv-single-pi.md)).
- **Portée WiFi** : ~30m intérieur. Si la 2ᵉ TV est plus loin → répéteur WiFi configuré sur le même SSID `NEOPRO_<club>`, ou repasser au câblage HDMI/HDBaseT.
- **Bande passante** : avec le hotspot Pi 5 actuel (WiFi N 2.4GHz), 3-4 TV WiFi en 1080p est confortable. Au-delà → migration WiFi AC 5GHz (cf. [PROP-001 Phase 1.5](../proposals/PROP-001-multi-tv-single-pi.md#phase-15--optimisation-wifi-ac-pour-clubs-multi-tv-05-jour)).

### Limitations liées à la nature grand public des sticks

- **Pas de fiabilité industrielle** : Fire Stick / Chromecast sont conçus pour un usage domestique (Netflix le soir, ~2h max), pas pour 5-8h en boucle pendant un match. Risques connus : memory leak du navigateur après plusieurs heures, redémarrages intempestifs pour mise à jour OS poussée par Amazon/Google, retour à l'écran d'accueil avec pubs si l'app navigateur ferme. **Mitigation obligatoire jour de match** : Fully Kiosk Browser (cf. §5).
- **Pas de watchdog natif** : sur le Pi, un script systemd redémarre Chromium en cas de crash. Sur un stick, **rien**. Si le navigateur freeze, la TV reste figée jusqu'à intervention humaine.
- **Pas de monitoring central** : les Fire Sticks / Chromecasts n'apparaissent pas dans le dashboard Neopro (le Pi reste le seul site monitoré). Si la 2ᵉ TV crashe en match, **personne n'est alerté côté flotte** — il faut qu'un humain regarde la TV.
- **Pas d'OTA Neopro** : impossible de pousser une nouvelle version du frontend sur le stick à distance. Le stick recharge automatiquement la version servie par le Pi à chaque reload, mais la mise à jour Silk/Chrome elle-même dépend du cycle de release Amazon/Google.
- **Veille agressive** : si le Fire Stick passe en veille, la TV s'éteint. À désactiver explicitement dans Settings → Display & Sounds → Screen Saver → "Never".

### Conséquence pratique

Pour la **TV principale d'un match critique** (NLF, finale, événement médiatisé), préférer le scénario A (splitter HDMI actif) ou un 2ᵉ Pi 5 en mode SaaS. Le setup hotspot+stick est **adapté aux écrans secondaires** (buvette, vestiaires, hall, totem) où une TV figée 30 min est récupérable sans gâcher le match.

---

## 8. Troubleshooting

### `neopro.local` introuvable depuis le Fire Stick

1. Vérifier sur le Pi : `systemctl status avahi-daemon` → doit être `active (running)`.
2. Si le Fire Stick ne supporte pas mDNS → utiliser l'IP de fallback : `http://192.168.4.1/tv` (IP par défaut du Pi en mode hotspot).
3. Vérifier que le Fire Stick est bien sur `NEOPRO_<club>` et **pas** sur le WiFi du club (le client privilégie parfois le réseau internet plus rapide).

### Vidéos qui buffer sur la 2ᵉ TV

1. Sur le Pi : `iw dev wlan0 station dump` → vérifier `signal` ≥ -70 dBm pour le client Fire Stick.
2. Si signal faible → rapprocher le Fire Stick du Pi ou ajouter un répéteur.
3. Si signal OK mais buffer → vérifier qu'aucun autre client lourd n'est sur le hotspot (autre TV streaming, etc.).

### Le Fire Stick s'est déconnecté du WiFi

1. Vérifier que le PSK n'a pas été tourné côté cloud sans que le Pi se soit resync (cf. [ADR-074](../adr/ADR-074-hotspot-psk-single-source-of-truth.md)).
2. Reboot du Fire Stick : Settings → Device & Software → Restart.
3. Si récurrent → désactiver l'auto-update du Fire Stick (Settings → My Fire TV → About → Install Updates → OFF) pour éviter les redémarrages intempestifs jour de match.

### Drift > 5s entre les 2 TV

Comportement non attendu en mode hub local. Vérifier :

1. Que les 2 TV utilisent bien le **même Pi** (pas une qui pointerait vers SaaS cloud par erreur).
2. Latence Socket.IO sur la 2ᵉ TV : ouvrir la console Silk Browser (paramètres → Developer Options).
3. Reload de la 2ᵉ TV (`F5` ou Fully Kiosk reload) → re-sync immédiat.

### Le device exige un compte (Amazon ou Google)

Friction d'installation connue, mais incontournable sur Fire Stick comme sur Google TV Streamer :

- Pas de compte Amazon ? → **Google TV Streamer / Chromecast with Google TV** (~40-50€, voir §4.B). ⚠️ Vérifier que le produit a bien une télécommande Google TV — un simple "Chromecast" sans Google TV ne marche pas.
- Pas de compte Google ? → **Fire TV Stick 4K** (~40€, voir §4.A).
- Aucun des deux et pas envie d'en créer ? Alternatives :
  - **Smart TV avec navigateur intégré** (Samsung Tizen 2022+, LG webOS 6+, Sony Bravia Android TV 10+) → 0€, qualité variable.
  - **Mini-PC ou ancien smartphone Android** en mode kiosk → flexible mais setup plus long.
  - **Raspberry Pi 5 supplémentaire en mode SaaS** (~80€) → plus cher mais navigateur Chromium éprouvé, même stack que le Pi principal.

### J'ai acheté un Chromecast et il ne marche pas

Symptôme : le device s'installe, mais aucune option pour ouvrir un navigateur ou taper une URL — il ne propose que de "caster" depuis un téléphone/laptop.

→ Vous avez probablement acheté un **ancien Chromecast (1ʳᵉ-3ᵉ gen ou Chromecast Ultra)** au lieu d'un **Google TV Streamer** ou d'un **Chromecast with Google TV**. Les anciens modèles sont des dongles passifs sans navigateur, incompatibles avec ce setup.

Solutions :

- Renvoyer / revendre le device, racheter un **Google TV Streamer (4K) 2024** ou un **Chromecast with Google TV (4K/HD)** modèle 2020-2023 (vérifier la mention "Google TV" sur la boîte + présence d'une télécommande)
- Ou basculer sur un **Fire TV Stick 4K** si compte Amazon disponible
- Workaround temporaire (non viable en prod) : laisser un laptop allumé connecté au hotspot, ouvrir Chrome sur `neopro.local/tv`, et **caster l'onglet** vers l'ancien Chromecast. Le laptop doit rester allumé en permanence — usable seulement pour une démo ponctuelle.

---

## 9. Références

- [PROP-001 — Multi-TV Single Pi](../proposals/PROP-001-multi-tv-single-pi.md) (scénarios complets, matrice de décision)
- [MODOP_CLUB_PSK.md](MODOP_CLUB_PSK.md) — récupération du PSK club
- [ADR-074](../adr/ADR-074-hotspot-psk-single-source-of-truth.md) — rotation PSK hotspot
- `raspberry/config/systemd/hostapd.conf` — config hotspot WiFi (`max_num_sta=50`, `hw_mode=g`)
- `raspberry/src/environments/environment.raspberry.ts` — `socketUrl: ''` résolu dynamiquement → permet à n'importe quel device sur le hotspot d'être un client TV
- `raspberry/config/nginx-captive-portal.conf` — nginx Pi (sert `/tv`, proxie `/socket.io/`, `/videos/`)

---

_Créé le 28 avril 2026 — Phase 0 du plan d'implémentation PROP-001._
