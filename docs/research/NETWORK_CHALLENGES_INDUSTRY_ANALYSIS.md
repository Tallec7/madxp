# Analyse Industrie : Problèmes Réseau en Digital Signage

> **Document de recherche** - Janvier 2026
>
> Objectif : Comprendre si les problèmes réseau de Neopro sont uniques ou communs à l'industrie

---

## Résumé Exécutif

**Conclusion principale** : Les problèmes réseau rencontrés par Neopro (mesh WiFi, roaming, instabilité hotspot) sont **communs à toute l'industrie du digital signage**. Ce n'est pas un problème spécifique à Neopro, mais un défi structurel lié à :

1. L'utilisation du Raspberry Pi et son driver WiFi (brcmfmac)
2. Le déploiement dans des environnements réseau non contrôlés
3. L'architecture double-WiFi (hotspot + client) peu courante

**Neopro n'est pas seul**, mais peut se différencier par une **meilleure gestion automatique** de ces problèmes.

---

## 1. Problèmes Communs à l'Industrie

### 1.1 Concurrents Raspberry Pi

| Solution             | Problèmes WiFi Documentés                                      | Sources                                                                                                                           |
| -------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **PiSignage**        | WiFi instable, recommandent Ethernet, désactivent WiFi interne | [PiSignage Blog](https://blog.pisignage.com/disabling-internal-wifi-and-bluetooth-on-pi-3/)                                       |
| **Screenly/Anthias** | WiFi cesse de fonctionner après reboot, problèmes SSID cachés  | [GitHub #593](https://github.com/Screenly/screenly-ose/issues/593), [GitHub #929](https://github.com/Screenly/Anthias/issues/929) |
| **Xibo (Arexibo)**   | Déconnexions XMR après perte Internet, nécessite restart app   | [Xibo Community](https://community.xibo.org.uk/t/xmr-cannot-connect-after-internet-reconnect/14280)                               |

### 1.2 Concurrents Professionnels (Non-Pi)

| Solution        | Problèmes WiFi Documentés                                                        | Sources                                                                                                                           |
| --------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **BrightSign**  | Difficultés WPA Enterprise, WiFi ne s'allume pas, adaptateurs USB problématiques | [BrightSign Support](https://support.brightsign.biz/hc/en-us/community/posts/11956416147611-WiFi-issues-using-WD-104-with-XT1144) |
| **ScreenCloud** | Problèmes firewalls entreprise, proxy mal configurés                             | [ScreenCloud Help](https://help.screencloud.com/en/articles/10116209-troubleshooting-networks-and-internet-connection)            |
| **Yodeck**      | Perte de connectivité si credentials WiFi changent                               | [Yodeck Docs](https://www.yodeck.com/docs/user-manual/troubleshooting/)                                                           |

### 1.3 Problèmes Spécifiques au Driver brcmfmac (Raspberry Pi)

Le driver WiFi intégré du Raspberry Pi (`brcmfmac`) a des **bugs connus** :

| Bug                                        | Impact                                                                    | Source                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Incompatibilité 802.11r (Fast Roaming)** | Pi ne peut pas s'associer aux APs avec 802.11r activé                     | [Launchpad Bug #1929746](https://bugs.launchpad.net/raspbian/+bug/1929746) |
| **Pas de notifications signal_change**     | wpa_supplicant ne reçoit pas les changements de signal, bgscan inefficace | [RPi Forums](https://forums.raspberrypi.com/viewtopic.php?t=352113)        |
| **Crash firmware avec Virtual AP**         | Utiliser wlan0 en AP + client simultané cause des crashes                 | [GitHub #1463](https://github.com/raspberrypi/firmware/issues/1463)        |
| **Freeze après plusieurs heures**          | WiFi meurt avec erreurs "brcmf_sdio_hostmail"                             | [GitHub #2453](https://github.com/raspberrypi/linux/issues/2453)           |

**Citation clé** :

> "There seems to be an incompatibility in the WiFi firmware of the brcmfmac WiFi driver on Raspberry Pi 4 which silently prevents it from associating with certain wireless access points that have 802.11r and/or WPA3 enabled."

---

## 2. Recommandations de l'Industrie

### 2.1 Consensus : Ethernet > WiFi

**Toutes les solutions recommandent Ethernet quand possible** :

> "Whenever possible, use a wired Ethernet connection for your digital signage players. Wired connections provide greater stability and bandwidth compared to wireless connections."
> — [Korbyt Knowledge Base](https://kb.korbyt.com/article/networking-best-practices-for-digital-signage/)

> "A wired internet connection is often more stable than a wireless digital signage solution."
> — [Screenly Blog](https://www.screenly.io/blog/2024/08/19/wifi-digital-signage/)

### 2.2 Si WiFi Obligatoire : Best Practices

| Pratique               | Recommandation                                                    | Source                                                                                                    |
| ---------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **VLAN dédié**         | Isoler le signage dans un subnet séparé                           | [TelemetryTV](https://www.telemetrytv.com/posts/integrating-digital-signage-with-it-infrastructure/)      |
| **SSID dédié**         | Demander à l'IT un SSID séparé pour le signage                    | [BrightSign Support](https://support.brightsign.biz/hc/en-us/articles/218063927-BrightSign-Network-Issue) |
| **Désactiver 802.11r** | Sur les routeurs mesh (Orbi, etc.), désactiver Fast Roaming       | [RPi Forums](https://forums.raspberrypi.com/viewtopic.php?t=352113)                                       |
| **Cache local**        | Toujours avoir du contenu en cache pour survivre aux déconnexions | [Screenly](https://www.screenly.io/blog/2024/08/19/wifi-digital-signage/)                                 |
| **Dongle USB externe** | Éviter le WiFi intégré, utiliser un dongle USB de qualité         | [RPi Forums](https://github.com/raspberrypi/firmware/issues/1463)                                         |

### 2.3 Pour les Réseaux Enterprise

> "Enable standards-based 802.11r support for smoother roaming for devices on the move, and consider enabling 'band steering'."
> — [UK Government Guidance](https://www.gov.uk/guidance/sharing-workplace-wireless-networks)

**Paradoxe** : Le gouvernement UK recommande 802.11r, mais le Pi ne le supporte pas bien.

---

## 3. Position de Neopro par Rapport à l'Industrie

### 3.1 Ce que Neopro Fait Bien (Différenciateurs)

| Fonctionnalité                             | Neopro       | PiSignage       | Screenly | Xibo   |
| ------------------------------------------ | ------------ | --------------- | -------- | ------ |
| **Hotspot local intégré**                  | ✅ Oui       | ✅ Oui (récent) | ❌ Non   | ❌ Non |
| **Télécommande locale**                    | ✅ `/remote` | ❌ Non          | ❌ Non   | ❌ Non |
| **Remote Cloud (contournement isolation)** | ✅ v2.33     | ❌ Non          | ❌ Non   | ❌ Non |
| **Détection mesh automatique**             | ✅ v2.28     | ❌ Non          | ❌ Non   | ❌ Non |
| **Hotspot channel optimizer**              | ✅ v2.28     | ❌ Non          | ❌ Non   | ❌ Non |
| **Cache vidéo offline**                    | ✅ Oui       | ✅ Oui          | ✅ Oui   | ✅ Oui |

### 3.2 Ce que Neopro Peut Améliorer

| Gap                         | État Actuel                | Amélioration Proposée        |
| --------------------------- | -------------------------- | ---------------------------- |
| **Détection profil réseau** | Manuelle (doc NLF)         | Automatique au boot          |
| **Protection BSSID lock**   | Warning seulement          | Blocage si mesh              |
| **Watchdog hotspot**        | Inexistant                 | Surveillance + auto-recovery |
| **Watchdog Internet**       | Basique (zombie detection) | Complet avec recovery        |
| **Recommandation Ethernet** | Non documenté              | Afficher si WiFi instable    |

### 3.3 Architecture Unique de Neopro

Neopro a une architecture **plus complexe** que ses concurrents :

```
NEOPRO (Architecture Dual-WiFi)
┌─────────────────────────────────────────────┐
│  wlan0 (intégré)     wlan1 (USB dongle)    │
│  ├── Hotspot         ├── Connexion Internet │
│  ├── hostapd         ├── wpa_supplicant     │
│  ├── dnsmasq         └── DHCP client        │
│  └── /remote, :8080                         │
│                                             │
│  Avantage: Télécommande sans Internet       │
│  Risque: Interactions driver brcmfmac       │
└─────────────────────────────────────────────┘

CONCURRENTS (Architecture Simple)
┌─────────────────────────────────────────────┐
│  wlan0 (ou eth0)                            │
│  └── Connexion Internet uniquement          │
│                                             │
│  Pas de télécommande locale                 │
│  Configuration via cloud seulement          │
└─────────────────────────────────────────────┘
```

**Conséquence** : Les bugs `brcmfmac` avec Virtual AP affectent plus Neopro que les concurrents.

---

## 4. Bugs brcmfmac Spécifiques à l'Architecture Neopro

### 4.1 Le Problème du Virtual AP

Citation du rapport de bug GitHub :

> "When creating an access point with an uplink client connection using a virtual interface of type \_\_ap, users noticed crashes of the brcmfmac firmware."

**Neopro utilise exactement cette configuration** : wlan0 en mode AP (hostapd) + wlan1 en client.

### 4.2 Impact du Restart hostapd

Le restart de hostapd peut perturber le driver partagé :

> "When using the external USB WiFi as an AP, and the internal WiFi to connect to other APs, the setup works flawlessly. Also with two external USB WiFis, and neglecting the internal WiFi, things work flawlessly."

**Implication** : Si les deux interfaces étaient sur des dongles USB séparés, les problèmes disparaîtraient.

### 4.3 Solutions Documentées

| Solution                    | Faisabilité Neopro    | Impact                    |
| --------------------------- | --------------------- | ------------------------- |
| **Deux dongles USB**        | Possible mais coûteux | Élimine les bugs brcmfmac |
| **Désactiver WiFi interne** | Nécessite 2 dongles   | Même chose                |
| **Downgrade firmware**      | Risqué (sécurité)     | Stabilise le driver       |
| **Éviter restart hostapd**  | ✅ Implémenté v2.33   | Réduit les perturbations  |

---

## 5. Comparaison des Approches Concurrentes

### 5.1 PiSignage : Approche "Désactiver et Simplifier"

> "Disabling the internal WiFi helps reduce power draw and potential wireless interference. This is done by blacklisting the default Raspberry Pi chipset drivers."

PiSignage recommande de **désactiver le WiFi interne** et d'utiliser Ethernet ou un dongle USB dédié.

**Différence Neopro** : Neopro a besoin du WiFi interne pour le hotspot local.

### 5.2 Screenly : Approche "Access Point Temporaire"

> "When powered on, PiSignage players now broadcast their own Wi-Fi network — typically named pi-player_xxxx. The access point uses the password 'piplayer' and automatically disables after configuration."

L'AP est **temporaire** et se désactive après configuration.

**Différence Neopro** : Le hotspot Neopro est **permanent** pour la télécommande.

### 5.3 BrightSign : Approche "Enterprise Ready"

> "BrightSign supports WPA Enterprise (WPA/WPA2-802.1x) authentication."

BrightSign investit dans le support enterprise (certificats, RADIUS).

**Opportunité Neopro** : Ajouter le support 802.1X pour les clients enterprise.

---

## 6. Recommandations Stratégiques

### 6.1 Court Terme (v2.34-2.35)

| Action                               | Justification                                       |
| ------------------------------------ | --------------------------------------------------- |
| **Documenter "Ethernet recommandé"** | Alignement avec l'industrie                         |
| **Watchdog hotspot**                 | PiSignage et Screenly ont des mécanismes similaires |
| **Bloquer BSSID lock en mesh**       | Unique à Neopro, mais nécessaire                    |
| **Détection automatique profil**     | Différenciateur vs concurrents                      |

### 6.2 Moyen Terme (v2.36-2.40)

| Action                                     | Justification                                                     |
| ------------------------------------------ | ----------------------------------------------------------------- |
| **Support configuration deux dongles USB** | Élimine les bugs brcmfmac                                         |
| **Mode "hotspot temporaire"**              | Option pour les clients qui n'ont pas besoin de /remote permanent |
| **Support 802.1X basique**                 | Demandé par les clients enterprise                                |

### 6.3 Long Terme

| Action                              | Justification                               |
| ----------------------------------- | ------------------------------------------- |
| **Évaluer hardware alternatif**     | CM4, Pi 5 ont potentiellement moins de bugs |
| **Connectivité 4G/LTE optionnelle** | Pour les sites sans WiFi fiable             |
| **Certification "Mesh Ready"**      | Marketing + procédures de test              |

---

## 7. Conclusion

### Neopro n'est PAS Unique

Les problèmes rencontrés sont **systémiques à l'industrie** :

- Tous les concurrents Raspberry Pi ont des problèmes WiFi
- Le driver brcmfmac a des bugs documentés
- Les environnements mesh/enterprise sont problématiques pour tous

### Neopro a des Défis Supplémentaires

L'architecture **dual-WiFi (hotspot + client)** est plus complexe et expose plus de bugs brcmfmac.

### Neopro peut se Différencier

En implémentant une **gestion automatique et proactive** des problèmes réseau, Neopro peut devenir la solution la plus robuste du marché pour les environnements difficiles.

---

## Sources

### Digital Signage Industry

- [Korbyt - Networking Best Practices](https://kb.korbyt.com/article/networking-best-practices-for-digital-signage/)
- [TelemetryTV - IT Infrastructure Integration](https://www.telemetrytv.com/posts/integrating-digital-signage-with-it-infrastructure/)
- [Screenly - WiFi Digital Signage](https://www.screenly.io/blog/2024/08/19/wifi-digital-signage/)
- [CirrusLED - Network Connection Options](https://www.cirrusled.com/blog/digital-signage-connect-to-network)

### Concurrents

- [PiSignage - Disable Internal WiFi](https://blog.pisignage.com/disabling-internal-wifi-and-bluetooth-on-pi-3/)
- [PiSignage - WiFi Setup](https://blog.pisignage.com/configuring-wfi-for-piplayer/)
- [Screenly - Troubleshooting](https://www.screenly.io/blog/2018/11/22/raspberry-pi-troubleshooting/)
- [ScreenCloud - Network Troubleshooting](https://help.screencloud.com/en/articles/10116209-troubleshooting-networks-and-internet-connection)
- [BrightSign - Network Issues](https://support.brightsign.biz/hc/en-us/articles/218063927-BrightSign-Network-Issue)
- [Xibo - Troubleshooting](https://xibosignage.com/docs/setup/troubleshooting-for-administrators)
- [Yodeck - WiFi Wizard](https://www.yodeck.com/docs/user-manual/configuring-your-wifi-network-by-using-the-player-wifi-wizard/)

### Raspberry Pi / brcmfmac Bugs

- [Launchpad - 802.11r Incompatibility](https://bugs.launchpad.net/raspbian/+bug/1929746)
- [GitHub - WiFi Firmware Crashes Virtual AP](https://github.com/raspberrypi/firmware/issues/1463)
- [GitHub - WLAN Freezes Pi 3B+](https://github.com/raspberrypi/linux/issues/2453)
- [RPi Forums - Signal Change Notifications](https://forums.raspberrypi.com/viewtopic.php?t=352113)
- [RPi Forums - WiFi Instability](https://forums.raspberrypi.com/viewtopic.php?t=146418)

### Enterprise WiFi

- [UK Government - Sharing Workplace Wireless](https://www.gov.uk/guidance/sharing-workplace-wireless-networks)

---

**Document créé** : 18 janvier 2026
**Auteur** : Analyse Claude pour Neopro
**Statut** : Recherche complète
