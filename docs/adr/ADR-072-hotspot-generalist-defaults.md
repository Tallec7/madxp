# ADR-072: Hotspot — defaults generalist pour toute la flotte

**Date** : 2026-04-19
**Statut** : Accepté (OTA-1 + OTA-2 livrés)
**Format** : Léger

---

## Contexte

Le hotspot Pi (`hostapd` sur wlan0) a été progressivement optimisé pour un client critique (NLF Handball, environnement mesh avec dongle RTL8192EU). Plusieurs de ces optimisations ont été poussées globalement via OTA et dégradent désormais l'expérience sur les sites "simples" (un AP, pas de mesh, pas de wlan1 actif).

Incident déclencheur : le 2026-04-19 à 17h, un iPhone n'a pas pu rejoindre `NEOPRO-STROGATIEN` alors qu'un autre device à côté y parvenait. Audit complet du stack hotspot : plusieurs causes racines non-NLF identifiées (plafond clients, saturation DHCP, double watchdog, absence de PMF, pas de grace period boot, absence de télémetrie auth).

Contrainte : aucun accès SSH aux Pi terrain — tout changement doit passer par l'OTA pipeline existant.

## Décision

Déploiement fleet-wide en **deux OTA** :

**OTA-1 (P0, bug 17h)** — corrige ce qui a directement causé l'incident Strogatien et ce qui est 0-risque :

1. `max_num_sta` : 10 → **50** (le 11e client était rejeté silencieusement)
2. Range DHCP : `192.168.4.10-50` (40) → **`10-200`** (190) ; lease : 24h → **2h** (la rotation MAC iOS saturait le pool sur 24h)
3. Supprimer le watchdog bash redondant (`raspberry/scripts/hotspot-watchdog.sh` + unit systemd associée), garder uniquement `raspberry/sync-agent/src/services/hotspot-watchdog.js` (deux daemons restart `hostapd` en parallèle → deauth cascades)
4. Ajouter au `hostapd.conf` : `ieee80211d=1`, `ht_capab=[HT20][SHORT-GI-20][DSSS_CCK-40]` (conformité réglementaire pour iOS/Android récents en mode strict)

**OTA-2 (P1, hygiène)** — suit dans la foulée après stabilisation :

5. `ieee80211w=1` (PMF en mode **optional**, pas required — iOS 16+ friendly sans casser les devices anciens)
6. Grace period 60s au boot dans `hotspot-watchdog.js` (pas de recovery avant que wlan0 ait fini d'acquérir son IP et que hostapd soit stable)
7. Télémetrie hostapd auth/deauth → central-server (table `hostapd_events` + socket forward) pour diagnostiquer les prochains incidents sans SSH

**Hors scope** (à re-étudier séparément) : TX power adaptatif par profil réseau. L'idée initiale (15 dBm en mesh+wlan1 / 25 dBm ailleurs) a été écartée car baisser la puissance traite le symptôme (desense RX du RTL8192EU) et non la cause (séparation fréquentielle wlan0/wlan1). Nécessite un audit canal dédié.

## Alternatives rejetées

- **Override site-specific via `hotspot-txpower.conf`** : rejeté car oblige à accéder physiquement ou SSH à chaque Pi en souffrance (impraticable sur Strogatien).
- **Rester sur les defaults NLF globaux** : rejeté — l'incident 17h prouve que ces defaults cassent les sites non-mesh.
- **TX power adaptatif mesh=15/autres=25** : rejeté (voir ci-dessus).

## Conséquences

**Positif**

- Tous les sites non-mesh (la majorité de la flotte) retrouvent un hotspot robuste.
- Observabilité gagnée via la télémetrie hostapd — prochain incident debuggable à distance.
- Code simplifié : un seul watchdog hotspot au lieu de deux.

**Négatif / risques**

- OTA-1 restart `hostapd` une fois → deauth global ~3s. Acceptable vu le gain, à programmer hors horaires de match pour NLF.
- PMF optional (OTA-2) : devices très anciens peuvent montrer des warnings — `optional` ≠ `required`, donc pas de rejet.
- Suppression du watchdog bash demande de bien vérifier que le watchdog Node couvre 100% des scénarios (déjà documenté dans `.claude/rules/network.md`).
- NLF reste couvert : toutes les règles "NE JAMAIS FAIRE" de `network.md` (bgscan hysteresis, guard modprobe mesh, scan cache RTL8192EU, etc.) sont conservées.

## Fichiers impactés

- `raspberry/config/systemd/hostapd.conf` — `max_num_sta=50`, `ieee80211d=1`, `ht_capab=...`, `ieee80211w=1` (OTA-2)
- `raspberry/config/systemd/dnsmasq.conf` — range `10-200`, lease `2h`
- `raspberry/scripts/hotspot-watchdog.sh` — **supprimé**
- `raspberry/config/systemd/neopro-hotspot-watchdog.service` — **supprimé** (unit bash)
- `raspberry/sync-agent/src/services/hotspot-watchdog.js` — grace period 60s (OTA-2)
- `raspberry/sync-agent/src/services/hostapd-telemetry.js` — **nouveau** (OTA-2, parse `hostapd_cli` events)
- `central-server/src/routes/hostapd-events.ts` — **nouveau** (OTA-2, endpoint ingest)
- `central-server/src/repositories/hostapd-events.repository.ts` — **nouveau** (OTA-2)
- `central-server/src/migrations/YYYYMMDD-hostapd-events.sql` — **nouveau** (OTA-2)
- `raspberry/install.sh` / `raspberry/tools/prepare-image.sh` — aligner les templates hostapd/dnsmasq
- `.claude/rules/network.md` — mettre à jour la matrice et les "NE JAMAIS FAIRE"
- `docs/clients/NLF.md` — noter que les defaults globaux ont changé (non-NLF), NLF reste protégé par les guards profil

## Validation

- Smoke tests : `npm run test:smoke:smart` (attendu : `smoke-network-wifi` + `smoke-kiosk-pi`)
- Canary deploy : 1 Pi test avant fleet (pas NLF).
- Post-deploy : vérifier `hostapd_cli list_sta` > 10 possible, `dnsmasq-dhcp` leases < 50% du pool, un seul process watchdog actif (`ps aux | grep watchdog`).
- Rollback : `git revert` + OTA ; canary-monitor attrape toute régression <10 min.
