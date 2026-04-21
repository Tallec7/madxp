# ADR-079 : Hotspot Internet Share — Option B raffinée puis Option C

**Date** : 2026-04-20
**Statut** : Phase 1 ✅ Accepté & implémenté (2026-04-21) · Phase 2 ⏳ Proposé
**Décideurs** : @Tallec7 + Claude
**Remplace** : —
**Remplacé par** : —

## Historique

| Date       | Événement                                                                                                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-04-20 | Rédaction ADR                                                                                                                                                                 |
| 2026-04-21 | **Phase 1 mergée** : PR [#517](https://github.com/Tallec7/neopro/pull/517) (captive portal brandé) + PR [#524](https://github.com/Tallec7/neopro/pull/524) (retrait DNAT 443) |

---

## Contexte

Le hotspot local du Pi (`NEOPRO-XXX` sur `192.168.4.1`) sert aujourd'hui uniquement de réseau **local** pour :

- La télécommande (Remote PWA Angular)
- L'admin panel (`neopro.local:8080`)
- L'inscription on-boarding (QR code + bootstrap ADR-074)

Il ne fournit **aucun accès Internet** aux smartphones qui s'y connectent.

### Problème terrain observé (NLF, avril 2026)

1. Quand un utilisateur se connecte au hotspot avec un iPhone :
   - iOS affiche une page de portail captif avec le texte brut **"Success"**
   - À la fermeture, iOS affiche un dialog : _"The Wi-Fi network NEOPRO-NLF is not connected to the internet"_ → `Use Without Internet / Use Other Network / Dismiss`
2. Après "Use Without Internet", l'utilisateur rapporte des **oscillations de connexion** : iOS semble perdre puis regagner le WiFi, Wi-Fi Assist kick in agressivement, rendant `neopro.local` difficilement joignable
3. Sur Android, les checks de connectivité (HTTPS `clients3.google.com`) échouent → Android bascule sur la data mobile et ignore le hotspot

### Cause technique racine

Le script [`raspberry/scripts/setup-captive-portal-iptables.sh`](../../raspberry/scripts/setup-captive-portal-iptables.sh) redirige **tout** le trafic TCP des clients hotspot (ports 80 **et 443**) vers nginx local :

```bash
iptables -t nat -A PREROUTING -i wlan0 -p tcp --dport 80  -j DNAT --to 192.168.4.1:80
iptables -t nat -A PREROUTING -i wlan0 -p tcp --dport 443 -j DNAT --to 192.168.4.1:80  # ← problématique
```

Cette règle 443 :

- Répond en HTTP clair sur une requête HTTPS → **TLS handshake invalide**
- iOS détecte un captive portal "agressif" et ouvre le CNA (Captive Network Assistant)
- Après `Use Without Internet`, iOS marque le WiFi comme "captive refusé" → tentatives de reconnexion périodiques → oscillation

### Contraintes métier

- Le Pi peut être **avec ou sans clé WiFi USB** (wlan1) — flotte hétérogène
- Le WiFi du club n'est pas toujours accessible / partageable
- Le club doit pouvoir opter **in** ou **out** pour le partage Internet (responsabilité)
- iOS est majoritaire chez les utilisateurs français (~70% des staff)

---

## Décision

**Adopter une approche progressive en 2 phases** :

### Phase 1 — Option B raffinée (quick win, ~2h dev)

Supprimer la redirection iptables sur le **port 443**, conserver la redirection sur port 80 avec la page captive portal brandée (livrée en parallèle).

- Le port 443 tombe en "connection refused" → iOS conclut "pas d'internet mais pas de captive portal"
- iOS reste stable sur le WiFi, route les apps via 4G/5G automatiquement
- Le portail captif brandé reste accessible via `http://neopro.local` ou après détection HTTP

### Phase 2 — Option C (ADR à itérer, ~9 jours dev)

Activer le **partage Internet** via wlan1 (clé WiFi USB) ou eth0 quand uplink disponible, avec toggle opt-in par site et mitigations des risques. Déclenchée seulement si la Phase 1 ne suffit pas aux retours terrain.

---

## Alternatives Considérées

### 1. Status quo (garder redirect 443) ❌

**Avantages** :

- Android voit le captive portal → guide l'utilisateur vers l'admin
- Pas de changement

**Inconvénients** :

- UX iOS dégradée (oscillation, CNA moche, dialog "not connected")
- Déjà observé en prod à NLF

**Verdict** : Rejeté — problème terrain documenté.

### 2. Option B brute (supprimer toute redirection iptables) ❌

**Avantages** :

- Plus simple
- Aucune interception

**Inconvénients** :

- Plus aucun portail captif automatique (ni iOS ni Android)
- Plus aucun fallback "je ne sais pas comment trouver l'admin"

**Verdict** : Rejeté — perte totale de la découvrabilité.

### 3. Option B raffinée (Phase 1) ✅

**Avantages** :

- Supprime l'oscillation iOS (cause racine éliminée)
- Coût dérisoire (15 min dev + 1h test)
- Réversible en 5 min
- Compatible avec la page captive portal brandée livrée en parallèle

**Inconvénients** :

- Android < 10 peut basculer sur data mobile sans afficher le portail
- Non testé empiriquement — hypothèse bien raisonnée mais pas validée

**Verdict** : Accepté pour Phase 1, avec plan de test explicite avant rollout flotte.

### 4. Option C — Partage Internet via wlan1 (Phase 2) ✅ (conditionnelle)

**Avantages** :

- UX "aéroport" : plus aucun dialog iOS/Android
- Cohérent avec l'architecture existante wlan0 + wlan1 (ADR-073/074)
- Différenciateur commercial (Wi-Fi offert aux visiteurs via le Pi)

**Inconvénients** :

- Effort ~9j dev + ~2 sprints rollout
- 5 risques majeurs à mitiger (détaillés ci-dessous)
- Change le modèle : le club devient opérateur accessoire

**Verdict** : Accepté pour Phase 2, **conditionnée aux retours Phase 1**. Si Phase 1 résout le problème terrain (test NLF + 2 clubs témoins), Phase 2 est mise en backlog non prioritaire.

### 5. Option C via 4G/5G tethering d'un téléphone ❌

**Avantages** :

- Pas besoin de WiFi club

**Inconvénients** :

- SSID tethering instable (change à chaque connexion iOS)
- Opérateurs détectent le tethering via TTL → throttle/blocage
- Téléphone sacrifié 24/7 au club (batterie, mobilité, coût forfait ~420€/an)
- Illégal côté CGU forfaits grand public

**Verdict** : Rejeté — économiquement et techniquement non viable.

### 6. Profil MDM Apple / Passpoint / Hotspot 2.0 ❌

**Avantages** :

- Seule façon Apple-sanctioned de supprimer le dialog iOS

**Inconvénients** :

- Nécessite provisionnement enterprise (Apple Business Manager)
- Overkill pour un club sportif

**Verdict** : Rejeté — inadapté au segment client.

---

## Conséquences

### Positives (Phase 1)

1. UX iOS stabilisée : plus d'oscillation, plus de CNA persistant
2. Téléphone reste sur hotspot + utilise 4G/5G pour les apps (comportement natif iOS/Android ≥ 10)
3. Portail captif brandé reste accessible via HTTP (le cas 1-tap "Use Without Internet" éduque l'utilisateur)
4. Coût faible, rollback trivial

### Positives (Phase 2)

1. Expérience "aéroport" : zéro friction pour les utilisateurs
2. Valorisation commerciale du Pi comme passerelle Wi-Fi
3. Opt-in par site → pas de régression forcée

### Négatives (Phase 1)

1. Android < 10 (~8% parc FR) peut basculer sur data mobile sans voir le portail → doit taper `neopro.local` manuellement
2. Plus aucune "découvrabilité automatique" du portail via le mécanisme OS captive
3. Non testé empiriquement avant ce jour (2026-04-20)

### Négatives (Phase 2)

1. Complexité réseau fortement accrue (iptables conditionnelles, dnsmasq bi-mode, state machine)
2. Surface d'attaque élargie (le Pi devient passerelle NAT)
3. Responsabilité légale : le club devient "opérateur accessoire" (logs, RGPD, blocklist ARJEL)
4. Charge bande passante potentiellement lourde sur la box du club

### Risques et mitigations (Phase 2)

| #   | Risque                                                    | Mitigation                                                                                                                                                                                         |
| --- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | WiFi du club a son propre captive portal → double portail | Détection auto via `curl http://captive.apple.com/hotspot-detect.html` après connexion wlan1. Si réponse ≠ "Success", fallback local-only + alerte dashboard                                       |
| 2   | wlan1 flap (déconnexion brusque clé USB) → NAT orphelin   | State machine `SHARING ↔ LOCAL_ONLY` avec debounce 30s. Retrait MASQUERADE en <2s. Bannière sur captive-portal.html "Internet momentanément indisponible". Backoff exponential 5s/15s/30s/60s/5min |
| 3   | MTU / fragmentation (double NAT) casse visio & VPN        | `iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu` + MSS fixe 1400 en fallback                                                                           |
| 4   | RGPD / responsabilité légale                              | Opt-in explicite + CGU cochées dans admin panel. Logs minimaux (MAC hashée SHA-256 + salt, rotation 30j). DNS blocklist StevenBlack + ARJEL. Annexe contrat "opérateur accessoire"                 |
| 5   | Saturation bande passante                                 | `tc qdisc add dev wlan0 root fq_codel` + `tbf rate 50mbit`. Plafond 5 Mbps/MAC. QoS prioritaire pour sync-agent (classe 1:10 vs smartphones 1:20)                                                  |

---

## Plan d'implémentation

### Phase 1 — Option B raffinée (quick win)

1. **Portail captif brandé** ✅ livré en parallèle (`raspberry/captive-portal.html` + nginx config)
2. Modifier [`raspberry/scripts/setup-captive-portal-iptables.sh`](../../raspberry/scripts/setup-captive-portal-iptables.sh) :
   - Supprimer les 2 lignes DNAT sur `--dport 443` (iptables + nftables backends)
   - Conserver la règle DNAT port 80 et la MASQUERADE
3. **Tests empiriques obligatoires avant rollout flotte** :
   - iPhone iOS 17 + iOS 18 : connexion, stabilité >30 min, DNS `neopro.local`, apps (Insta/WhatsApp) via 4G
   - Android Pixel (stock) + Samsung (One UI) : idem
   - Observation comportement "Use Without Internet" → plus d'oscillation ?
4. Déploiement canary sur 1 Pi (NLF)
5. Observation 48h avec télémétrie Grafana (heartbeat, erreurs réseau)
6. Rollout flotte si OK, rollback si régression

**Critères de validation Phase 1** :

- ✅ Zéro oscillation iOS observée après "Use Without Internet"
- ✅ `neopro.local` joignable à 100% après le 1er tap
- ✅ Android ≥ 10 garde la connexion WiFi en parallèle de la 4G
- ⚠️ Android 8/9 : si bascule data mobile, documenter le "tapez neopro.local" dans la doc club

### Phase 2 — Option C (si Phase 1 insuffisante)

| #   | Zone                       | Tâches                                                                                                                                                                                | Effort |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | **Central-server**         | Flag `sites.hotspot_internet_share`, migration, route PATCH, repo                                                                                                                     | 0.5 j  |
| 2   | **Pi kernel**              | `sysctl net.ipv4.ip_forward=1` persistant via `/etc/sysctl.d/`                                                                                                                        | 0.25 j |
| 3   | **Pi iptables**            | Script `setup-internet-share.sh` : MASQUERADE sur wlan1, redirect 80/443 conditionnel (seulement captive.apple.com, clients3.google.com, connectivitycheck.gstatic.com), MSS clamping | 2 j    |
| 4   | **Pi dnsmasq**             | Forward DNS upstream quand mode share ON, résolution locale sinon. Blocklist StevenBlack + ARJEL                                                                                      | 0.5 j  |
| 5   | **sync-agent**             | Service `internet-share.js` : détection uplink wlan1/eth0, state-machine, watchdog, télémétrie                                                                                        | 1.5 j  |
| 6   | **Admin panel**            | Toggle `/network` + disclaimer CGU + indicateur état "uplink partagé / local-only"                                                                                                    | 0.75 j |
| 7   | **Dashboard central**      | Colonne site "Internet partagé", filtre                                                                                                                                               | 0.25 j |
| 8   | **tc / QoS**               | `fq_codel` + plafond 5 Mbps/MAC + priorité sync-agent                                                                                                                                 | 1 j    |
| 9   | **Logs & blocklist**       | Logging minimal (MAC hashée, bytes), rotation 30j                                                                                                                                     | 0.5 j  |
| 10  | **Détection captive club** | `curl` test + fallback local-only + alerte                                                                                                                                            | 0.5 j  |
| 11  | **Tests**                  | smoke-network-wifi + smoke-socket-realtime + sync-agent unit + Playwright admin                                                                                                       | 1 j    |
| 12  | **Rollout**                | 1 Pi test → observation 48h → flotte                                                                                                                                                  | 1 j    |
| 13  | **Doc**                    | Update WIFI_USB_GUIDE.md, SAFe Features, RGPD annexe                                                                                                                                  | 0.5 j  |

**Total Phase 2** : ~9 jours dev (~2 sprints)

**Critères de validation Phase 2** :

- ✅ iOS/Android connectés au hotspot avec Internet fonctionnel (aéroport-like)
- ✅ wlan1 flap : smartphones voient la bannière dégradation <5s
- ✅ Bande passante club : pas de saturation observée sur 1 semaine (30 clients simulés)
- ✅ DNS blocklist active (test domaine p2p bloqué)
- ✅ Toggle opt-in fonctionnel, disclaimer CGU archivé

---

## Références

- [raspberry/captive-portal.html](../../raspberry/captive-portal.html) — Page brandée livrée en parallèle
- [raspberry/scripts/setup-captive-portal-iptables.sh](../../raspberry/scripts/setup-captive-portal-iptables.sh) — Script à modifier en Phase 1
- [raspberry/sync-agent/src/services/network-watchdog.js](../../raspberry/sync-agent/src/services/network-watchdog.js) — Base pour state-machine Phase 2
- [docs/guides/WIFI_USB_GUIDE.md](../guides/WIFI_USB_GUIDE.md) — Architecture wlan0/wlan1
- [ADR-073](ADR-073-hotspot-psk-rotation-strategy.md) & [ADR-074](ADR-074-hotspot-psk-single-source-of-truth.md) — Contexte hotspot existant
- Apple — [Configuring Network Services Behind a Captive Portal](https://developer.apple.com/library/archive/qa/qa1693/_index.html)
- RFC 7710 — Captive-Portal Identification in DHCP
