# MODOP Support — Rotation PSK hotspot club

> Procédure à destination de l'équipe support Neopro pour gérer la PSK WiFi du hotspot local d'un club.
> Lié à [ADR-073](../adr/ADR-073-hotspot-security-hardening.md) — PSK unique par club.

## Contexte

Depuis ADR-073, chaque Pi Neopro a une PSK WiFi **unique** générée à l'installation (plus de `NeoProWiFi2025` partagé). Cette PSK est :

- Stockée en clair dans `/home/pi/neopro/club-config.json` (fichier `chmod 600`)
- Configurée dans `/etc/hostapd/hostapd.conf` (ligne `wpa_passphrase=...`)
- Mirrorée dans le champ `wifiPassword` du club sur la base centrale (chiffrée at rest)

## 1. Accès au dashboard local d'un Pi

**Prérequis** : être sur le LAN du club (VPN, SSH tunnel, ou présence physique).

```
http://<ip-pi-local>:8080
ou
http://neopro-admin.local:8080 (mDNS si dispo)
```

Credentials admin : voir 1Password → `Neopro / Dashboard admin Pi / <nom-club>` (mot de passe scrypt hashé côté Pi, migration automatique au premier login).

## 2. Consulter l'état du hotspot

Onglet **Network** du dashboard :

| Section            | Ce que tu vois                                                             |
| ------------------ | -------------------------------------------------------------------------- |
| Clients connectés  | MAC address, signal (RSSI), durée connectée, octets échangés               |
| Événements hostapd | Historique local (jusqu'à 500 events) : associations, deauth, PSK mismatch |
| Bouton Rotate PSK  | Génère une nouvelle PSK ou en applique une custom                          |

Auto-refresh toutes les 15 s quand l'onglet est actif.

## 3. Rotater la PSK (cas nominal — dashboard distant)

1. Onglet **Network** → bouton **Rotate PSK**
2. **Saisir une PSK custom memorable** (voir pattern recommandé ci-dessous). La PSK auto-générée (20 chars alphanum) est **déconseillée pour les clubs** — trop complexe à saisir sur un smartphone par le staff, source d'erreurs et d'appels support
3. Cliquer **Confirmer**
4. Le dashboard affiche la nouvelle PSK + bouton **Copier**
5. **Noter la PSK immédiatement** — elle n'est plus affichée ensuite (consultable uniquement en SSH sur le Pi)
6. Communiquer la nouvelle PSK au contact du club

### Pattern PSK recommandé

`<NomClubAbbrev><Année>!` — unique par club, lisible, 12-22 chars.

Exemples :

| Club                          | PSK                     |
| ----------------------------- | ----------------------- |
| NLF Handball                  | `NantesLoireFeminin26!` |
| AS Saint Rogatien             | `SaintRogatien26!`      |
| Corsaires de Nantes           | `CorsairesNantes26!`    |
| Nantes Atlantique Rink Hockey | `NantesRinkHockey26!`   |

Contraintes techniques (validées par l'API) : 8-63 chars, ASCII imprimable, pas de `\n|&;`.

> **Exception** : pour une nouvelle installation où un sticker PSK est collé sur le boîtier, l'auto-gen 20-char reste acceptable (le staff n'a pas à mémoriser / resaisir la PSK en dehors du premier pairing).

Ce que fait le backend (`hotspot-dashboard.service.js:rotatePsk`) :

- Patch `wpa_passphrase=` dans `/etc/hostapd/hostapd.conf` via `sed` (sudoers whitelisté)
- `systemctl restart hostapd` (hotspot indisponible ~2 s)
- Met à jour `club-config.json` (`wifiPassword` + `pskRotatedAt`)

Les clients déjà connectés sont **déconnectés** et devront se reconnecter avec la nouvelle PSK.

## 4. Rotater la PSK (fallback — SSH direct)

Si le dashboard est inaccessible (admin-server down, :8080 bloqué) :

```bash
ssh pi@<ip-pi>

# Générer une PSK
NEW_PSK=$(openssl rand -base64 16 | tr -d '/+=' | cut -c1-20)Neo
echo "Nouvelle PSK : $NEW_PSK"

# Patch hostapd.conf
sudo sed -i "s|^wpa_passphrase=.*|wpa_passphrase=${NEW_PSK}|" /etc/hostapd/hostapd.conf

# Restart
sudo systemctl restart hostapd

# Mettre à jour club-config.json pour cohérence
sudo jq --arg psk "$NEW_PSK" '.wifiPassword = $psk | .pskRotatedAt = (now | todate)' \
  /home/pi/neopro/club-config.json > /tmp/cc.json && \
  sudo mv /tmp/cc.json /home/pi/neopro/club-config.json && \
  sudo chmod 600 /home/pi/neopro/club-config.json
```

## 5. Migration des Pi legacy (post-ADR-073)

Les Pi déployés **avant** ADR-073 tournent sur l'ancienne PSK partagée `NeoProWiFi2025`. Procédure de migration :

1. Établir une liste des Pi legacy (requête central : `SELECT site_id, ip_local FROM sites WHERE created_at < '2026-04-19' AND site_type = 'pi'`)
2. Pour chaque Pi : se connecter au dashboard `:8080`, rotater la PSK
3. Noter la nouvelle PSK dans 1Password + communiquer au club
4. Vérifier que le staff reconnecte bien la télécommande (onglet Network → Clients connectés)
5. Tag du site en DB : `UPDATE sites SET psk_rotated_at = NOW() WHERE id = $1`

**Ordre de priorité** : clubs en activité match (weekend) en premier, vitrines/démos en dernier.

## 6. Troubleshooting

### Le bouton Rotate PSK renvoie "Échec patch hostapd.conf"

- Vérifier les permissions sudoers : `sudo -n /usr/bin/sed --version` doit marcher sans mot de passe
- Vérifier que `/etc/hostapd/hostapd.conf` existe et contient une ligne `wpa_passphrase=`
- Consulter `journalctl -u neopro-admin -n 50` pour les logs

### Un client n'arrive pas à se reconnecter après rotation

- Vérifier la PSK communiquée (copier-coller, pas de saisie manuelle)
- Onglet Events : filtrer sur `reason=PSK_MISMATCH` — signe d'une PSK incorrecte
- Demander au staff d'**oublier** le réseau sur son device avant de reconnecter

### hostapd ne redémarre pas

- `sudo systemctl status hostapd` — souvent erreur de syntaxe dans hostapd.conf
- Si la PSK contient un caractère spécial échappé incorrectement, restaurer la précédente :
  ```bash
  sudo journalctl -u hostapd -n 50
  ```
- Fallback : restaurer `/etc/hostapd/hostapd.conf` depuis `/etc/hostapd/hostapd.conf.bak` (backup créé par install.sh)

### Le dashboard `:8080` n'affiche aucun client alors que des devices sont connectés

- Vérifier `sudo hostapd_cli -i wlan0 all_sta` en SSH — si vide aussi, le hotspot tourne peut-être sur une autre interface
- Vérifier `iw dev` pour lister les interfaces WiFi
- Si l'interface est `wlan1`, il faut patcher `hotspot-dashboard.service.js:HOSTAPD_CLI` (ou rendre l'interface configurable)

## 7. Références

- Service : [raspberry/admin/services/hotspot-dashboard.service.js](../../raspberry/admin/services/hotspot-dashboard.service.js)
- Routes : [raspberry/admin/routes/hotspot-dashboard.js](../../raspberry/admin/routes/hotspot-dashboard.js)
- UI : [raspberry/admin/public/modules/network/hotspot-dashboard.js](../../raspberry/admin/public/modules/network/hotspot-dashboard.js)
- Install initial (génération PSK) : [raspberry/scripts/install.sh](../../raspberry/scripts/install.sh)
- ADR : [ADR-073](../adr/ADR-073-hotspot-security-hardening.md)
- Modop côté club : [MODOP_CLUB_PSK.md](MODOP_CLUB_PSK.md)
