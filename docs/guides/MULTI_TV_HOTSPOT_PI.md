# Guide — Multi-TV via hotspot Pi (même contenu)

> Procédure terrain pour ajouter une 2ᵉ (ou 3ᵉ/4ᵉ) TV à un site Pi existant **sans tirer de câble HDMI**, en utilisant le hotspot WiFi du Pi comme réseau dédié et un device navigateur (Fire TV Stick recommandé) sur la TV supplémentaire.
>
> Référence design : [PROP-001 — Multi-TV Single Pi, scénario E1](../proposals/PROP-001-multi-tv-single-pi.md).

**Date** : 2026-04-28
**Version** : 1.0
**Public cible** : installateur Neopro, ops support, staff club autonome
**Pré-requis** : club avec **Pi déjà installé et opérationnel**.

---

## Contrat en 1 phrase

> La 2ᵉ TV charge `http://neopro.local/tv` via Silk Browser sur un Fire TV Stick connecté au hotspot `NEOPRO_<club>` du Pi → elle affiche **exactement** le même contenu que le kiosk Pi natif (vidéos locales, Stramatel, Remote), avec un drift léger (1-2s) sur les boucles vidéo.

---

## 1. Quand utiliser ce setup

✅ **OK** :

- Club Pi existant, opérationnel
- 2 à 4 TV même contenu
- Distance entre Pi et TV supplémentaire ≤ 30m (portée hotspot 2.4GHz)
- TV non côte à côte (sinon le drift de 1-2s peut se voir)

❌ **NE PAS utiliser ce setup** :

- Sync frame-perfect requis (TV alignées dans la même salle, mur d'images) → utiliser un **splitter HDMI actif** (cf. [PROP-001 scénario A](../proposals/PROP-001-multi-tv-single-pi.md#scénario-a--splitter-hdmi-14-direct-distance--10m-)).
- Distance > 30m sans répéteur → utiliser **HDBaseT Cat6** (cf. [PROP-001 scénario B](../proposals/PROP-001-multi-tv-single-pi.md#scénario-b--hdbaset-cat6-distance--10m-)).
- Contenus différenciés par TV → nécessite dev `targetDisplay` ([PROP-001 Phase 2](../proposals/PROP-001-multi-tv-single-pi.md#phase-2--ciblage-par-display-5-jours-dev)), pas livré à ce jour.
- Club sans Pi → utiliser SaaS cloud ([PROP-001 scénario D](../proposals/PROP-001-multi-tv-single-pi.md#scénario-d--saas-multi-url-nouveau--recommandé)).

---

## 2. Bill of Materials (par TV supplémentaire)

| Élément                | Recommandé (option A)            | Recommandé (option B)              | Alternatives                                                                                                                    |
| ---------------------- | -------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Device navigateur HDMI | **Amazon Fire TV Stick 4K** ~40€ | **Chromecast avec Google TV** ~40€ | Smart TV avec navigateur intégré (0€, qualité variable), Mini-PC, ancien smartphone Android, Raspberry Pi 5 en mode SaaS (~80€) |
| Câble HDMI court       | Inclus avec le stick             | Inclus avec le Chromecast          | —                                                                                                                               |
| Alim                   | USB depuis port TV (souvent)     | USB-C secteur (fournie)            | —                                                                                                                               |
| Compte                 | Compte Amazon                    | Compte Google                      | Aucun si Smart TV / mini-PC                                                                                                     |

**Total : ~40€ par TV** (ou 0€ si Smart TV moderne avec navigateur fonctionnel).

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

### 4.B — Option Google Chromecast avec Google TV (Chrome)

1. **Brancher** le Chromecast en HDMI sur la TV supplémentaire. Brancher l'alim USB-C (le Chromecast n'est pas alimenté par la TV, contrairement au Fire Stick).
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

### Comment choisir entre Fire Stick et Chromecast ?

| Critère                         | Fire TV Stick 4K                     | Chromecast Google TV                             |
| ------------------------------- | ------------------------------------ | ------------------------------------------------ |
| Prix                            | ~40€                                 | ~40€                                             |
| Compte requis                   | Amazon                               | Google                                           |
| Navigateur                      | Silk Browser (Amazon, basé Chromium) | Chrome (Google, version desktop ~)               |
| Cycle de mise à jour navigateur | Plus lent (Amazon)                   | Plus rapide (Google) — léger avantage long terme |
| Télécommande IR fournie         | ✅                                   | ✅ (Bluetooth + IR pour TV)                      |
| Setup typique                   | 5 min                                | 5 min                                            |

**Règle simple** : si le client a déjà un compte → utiliser celui-là. S'il n'a aucun des deux → préférer **Chromecast** (Chrome plus à jour, écosystème plus standard).

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

- **Drift** : les vidéos peuvent décaler de 1-2s entre les 2 TV. Invisible pour des sponsors / boucles ambiance, peut se voir si les TV sont côte à côte. Pour une sync parfaite → splitter HDMI ([PROP-001 scénario A](../proposals/PROP-001-multi-tv-single-pi.md)).
- **Portée WiFi** : ~30m intérieur. Si la 2ᵉ TV est plus loin → répéteur WiFi configuré sur le même SSID `NEOPRO_<club>`, ou repasser au câblage HDMI/HDBaseT.
- **Bande passante** : avec le hotspot Pi 5 actuel (WiFi N 2.4GHz), 3-4 TV WiFi en 1080p est confortable. Au-delà → migration WiFi AC 5GHz (cf. [PROP-001 Phase 1.5](../proposals/PROP-001-multi-tv-single-pi.md#phase-15--optimisation-wifi-ac-pour-clubs-multi-tv-05-jour)).
- **Veille** : si le Fire Stick passe en veille, la TV s'éteint. Désactiver dans Settings → Display & Sounds.
- **Pas de monitoring central** : les Fire Sticks n'apparaissent pas dans le dashboard (pas de sites séparés). Le Pi reste le seul site monitoré.

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

Friction d'installation connue, mais incontournable sur Fire Stick comme sur Chromecast :

- Pas de compte Amazon ? → **Chromecast Google TV** (~40€, voir §4.B).
- Pas de compte Google ? → **Fire TV Stick** (~40€, voir §4.A).
- Aucun des deux et pas envie d'en créer ? Alternatives :
  - **Smart TV avec navigateur intégré** (Samsung Tizen 2022+, LG webOS 6+, Sony Bravia Android TV 10+) → 0€, qualité variable.
  - **Mini-PC ou ancien smartphone Android** en mode kiosk → flexible mais setup plus long.
  - **Raspberry Pi 5 supplémentaire en mode SaaS** (~80€) → plus cher mais navigateur Chromium éprouvé, même stack que le Pi principal.

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
