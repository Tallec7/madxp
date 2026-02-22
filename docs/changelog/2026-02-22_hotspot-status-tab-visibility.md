# Hotspot — Visibilité dans l'onglet État

**Date:** 22 février 2026
**Version:** 3.69.x
**Type:** Feature (UX)

## Contexte

Le statut du hotspot WiFi (SSID, canal, clients connectés, état actif/inactif) n'était visible que dans l'onglet **Debug** du dashboard, nécessitant plusieurs clics pour y accéder. Pour les opérateurs qui supervisent la flotte, cette information est critique et doit être accessible dès l'ouverture de la page site.

## Changements

### 1. Carte métrique Hotspot (onglet État)

Nouvelle carte dans la grille des métriques système, au même niveau que CPU, RAM, température, disque et ventilateur :

| Donnée  | Source                                      | Affichage                                |
| ------- | ------------------------------------------- | ---------------------------------------- |
| SSID    | `local_config_mirror._hotspotInfo.ssid`     | Nom du réseau (ex: `NEOPRO-CLUB`)        |
| État    | `local_config_mirror._hotspotInfo.isActive` | Actif (normal) / Inactif (warning jaune) |
| Canal   | `local_config_mirror._hotspotInfo.channel`  | `Ch. 6`                                  |
| Clients | `local_config_mirror._hotspotInfo.clients`  | `2 clients` (affiché si > 0)             |

La carte n'apparaît que si le Pi a déjà remonté un SSID hotspot (`hotspotSsid` non null). Un état "Inactif" déclenche un style warning (bordure jaune) pour attirer l'attention.

### 2. Action rapide "Relancer Hotspot"

Nouveau bouton dans la section "Actions rapides" de l'onglet État :

- **Action** : Envoie `fix_hotspot` avec `autoFix: true` au Pi via `sitesService.fixHotspot()`
- **Pi connecté** : Redémarre `hostapd` + `dnsmasq` immédiatement
- **Pi hors ligne** : Commande mise en file d'attente (affiché via `'debug.queued' | translate`)
- **Feedback** : Notification succès/warning/erreur selon le résultat

### 3. Monitoring existant (inchangé)

Le monitoring hotspot était déjà complet côté serveur — aucun ajout nécessaire :

| Couche              | Mécanisme                                     | Fichier                        |
| ------------------- | --------------------------------------------- | ------------------------------ |
| Config sync         | `_hotspotInfo` dans local_config_mirror       | `config-sync.handler.ts`       |
| Heartbeat alertes   | `wifi_power_mgmt_on`, `wifi_channel_conflict` | `heartbeat.handler.ts`         |
| Alertes prédictives | `hotspot_instability`                         | `predictive-alerts.service.ts` |
| Watchdog Pi         | `neopro-hotspot-watchdog.service`             | Systemd sur Pi                 |
| Optimiseur boot     | `hotspot-optimizer.sh`                        | Script au démarrage Pi         |

## Fichiers modifiés

| Fichier                                          | Modification                                                                              |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `central-dashboard/.../site-detail.component.ts` | Carte métrique hotspot, bouton action rapide, `updateHotspotStatus()`, `restartHotspot()` |

## UX avant / après

**Avant :** Hotspot visible uniquement dans Debug > section "Hotspot WiFi" (3 clics)
**Après :** Hotspot visible dès l'onglet État (0 clic supplémentaire) + action rapide de redémarrage

## Données source

Les données hotspot proviennent de `local_config_mirror._hotspotInfo`, synchronisé par le Pi via le config-sync handler. Le rafraîchissement se fait au chargement de la page (`loadSite()`). La donnée change rarement (seulement lors d'un reboot Pi ou changement de config hotspot), donc un rafraîchissement unique est suffisant.

Fallback : si `_hotspotInfo` n'est pas disponible (anciens Pi), le composant utilise `_hotspotSsid` comme source secondaire (SSID seulement, état présumé actif).
