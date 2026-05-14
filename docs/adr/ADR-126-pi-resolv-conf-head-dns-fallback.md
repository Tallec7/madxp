# ADR-126: Pin `/etc/resolv.conf.head` côté Pi pour neutraliser le DNS hijack quand `/etc/resolv.conf` est vide

**Date** : 2026-05-14
**Statut** : Accepté
**Format** : Léger

---

## Contexte

Le 2026-05-14, le Pi NLF Handball (gros client) est tombé "Hors ligne" pendant ~3h alors que sa connexion Internet (wlan1) fonctionnait. Investigation côté Pi :

1. **Outage transitoire wlan1** (clé Wi-Fi USB en cycle `rfkill`).
2. Pendant l'outage, `dhcpcd5` a perdu son bail et **vidé `/etc/resolv.conf`** (commentaires uniquement, aucun `nameserver`).
3. La récupération via `dhclient` dans `internet-watchdog.js` (lignes 271, 284, 292, 308) a ramené l'IP wlan1 mais **pas repeuplé `/etc/resolv.conf`** (dhcpcd5 et dhclient sont deux clients DHCP distincts, le hook `20-resolv.conf` de dhcpcd ne se déclenche pas).
4. Avec `/etc/resolv.conf` vide, glibc tombe en fallback sur `127.0.0.1` (cf. `man resolv.conf`).
5. Le `dnsmasq` du hotspot (ADR-079 Phase 14) contient un catch-all `address=/#/192.168.4.1` pour simuler de l'internet aux clients Fire Stick/Android. Quand le Pi lui-même tape `127.0.0.1:53`, **toutes ses propres requêtes sont hijackées vers `192.168.4.1`** — y compris `neopro-central-production.up.railway.app`.
6. Résultat : sync-agent en boucle `ECONNREFUSED 192.168.4.1:443`, dashboard affiche "Hors ligne", uploads vidéo cassés.

Fix immédiat en prod : `echo "nameserver 1.1.1.1" > /etc/resolv.conf` + `systemctl restart neopro-sync-agent`. Mais ce fix est éphémère (écrasé au prochain bail dhcpcd) et toute la flotte est exposée au même piège.

## Décision

Pinner `/etc/resolv.conf.head` (lu par le hook `/lib/dhcpcd/dhcpcd-hooks/20-resolv.conf` à chaque écriture de `/etc/resolv.conf`) avec deux nameservers publics fiables :

```
nameserver 1.1.1.1
nameserver 8.8.8.8
```

Effet : à chaque renouvellement de bail dhcpcd, `/etc/resolv.conf` est généré avec **d'abord** Cloudflare/Google, **ensuite** les nameservers poussés par le DHCP de la box. Même quand dhcpcd vide tout (bail perdu), `resolv.conf.head` reste, donc glibc trouve toujours un upstream valide et ne tombe jamais sur `127.0.0.1` → `dnsmasq` local → hijack.

Implémentation :

- `raspberry/install.sh` — écrit `/etc/resolv.conf.head` lors de l'install initiale.
- `raspberry/scripts/fix-resolv-conf-head.sh` — script idempotent appelé en post-install hook par l'OTA (pour rattraper la flotte existante).
- Smoke test garde-fou pour empêcher la régression.

## Alternatives rejetées

- **Désactiver le wildcard `address=/#/192.168.4.1` dans dnsmasq** : rejeté car il est nécessaire pour le captive Fire Stick (ADR-079 Phase 14, simule de l'internet sans uplink).
- **Forcer `bind-interfaces` + `interface=wlan0` + `except-interface=lo,wlan1`** : déjà présent dans `raspberry/config/systemd/dnsmasq.conf` source, mais le piège demeure si glibc fallback sur `127.0.0.1` (le routing kernel peut résoudre via `192.168.4.1` directement). Le `resolv.conf.head` casse la chaîne plus haut.
- **`chattr +i /etc/resolv.conf`** : rejeté — bloque les MAJ légitimes du DNS de la box quand on change de réseau.
- **Patcher `internet-watchdog.js` pour utiliser `dhcpcd` au lieu de `dhclient`** : utile à terme mais ne couvre pas le cas où la box ne push pas de DNS dans le bail (cas réel sur certains FAI).

## Conséquences

- **Positif** : tout Pi qui subit un outage wlan1 transitoire reste résolvable côté DNS. Plus jamais de hijack `address=/#/` qui se retourne contre le Pi.
- **Positif** : la latence DNS du Pi vers Railway baisse légèrement (Cloudflare 1.1.1.1 est plus rapide que la plupart des DNS box FAI).
- **Risque mineur** : si l'admin réseau du club exige que tout DNS passe par la box (politique entreprise), `resolv.conf.head` la contourne. À ce jour aucun client n'a cette exigence. Mitigation : variable d'env `NEOPRO_DNS_FALLBACK_DISABLED=1` non implémentée tant qu'aucun client ne le demande (YAGNI).

## Fichiers impactés

- `raspberry/install.sh` — nouvelle fonction `ensure_resolv_conf_head()` appelée pendant `setup_hotspot()`.
- `raspberry/scripts/fix-resolv-conf-head.sh` — nouveau script idempotent.
- `central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts` — nouveau cas de test "RESOLV-HEAD-01: install.sh writes /etc/resolv.conf.head with Cloudflare/Google DNS".
- `.claude/rules/hotspot-psk.md` — nouvelle règle "NE JAMAIS supprimer le pinning resolv.conf.head".
- `docs/runbooks/INCIDENT-LOG.md` — entrée incident 2026-05-14.

## Référence

- Incident : NLF Handball offline 2026-05-14 ~09:32-12:11 UTC
- Test régression : `central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts` (cas `RESOLV-HEAD-01`)
- ADR liés : ADR-079 (captive portal Phase 14 wildcard hijack), ADR-044 (sync-agent network-watchdog)
