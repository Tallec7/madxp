# ADR-011: Interdiction du BSSID Lock en Environnement Mesh

**Date** : Janvier 2026 (documenté rétroactivement)
**Statut** : Accepté
**Décideurs** : Équipe technique Neopro

---

## Contexte

Certains clubs ont du WiFi 2.4GHz avec plusieurs bornes portant le même SSID (répéteurs, mesh). Le Pi se connecte via un dongle USB WiFi (`wlan1`) et fait du roaming entre les bornes.

**Problème initial** : Le roaming WiFi du Pi était instable — il changeait de borne de manière aléatoire, causant des micro-coupures. La solution initiale était de "verrouiller" le Pi sur une borne spécifique (BSSID lock) via `wpa_supplicant.conf`.

**Incident NLF** : Le club NLF utilise un réseau mesh avec 3+ bornes. Après un BSSID lock, la borne verrouillée est devenue inaccessible (changement d'emplacement). Le Pi a perdu Internet sans possibilité de roamer vers une autre borne. Le boîtier est devenu inaccessible à distance.

## Décision

**Interdire le BSSID lock en environnement mesh** avec blocage multi-couches :

| Couche | Protection |
|--------|-----------|
| **Admin panel (:8080)** | Checkbox désactivée + message si mesh détecté |
| **Backend sync-agent** | Validation qui refuse la commande `set_bssid_lock` si profil mesh |
| **Dashboard central** | Badge d'alerte pulsant si BSSID lock + mesh détectés |
| **Auto-correction** | Au boot, `safeNetworkOperations.autoOptimize()` supprime le BSSID lock en mesh |

**Matrice de sécurité SafeNetworkOperations** :

| Opération | Simple | Mesh | Mesh Isolé | Enterprise |
|-----------|--------|------|------------|------------|
| `set_bssid_lock` | ✅ | ❌ | ❌ | ❌ |
| `remove_bssid_lock` | ✅ | ✅ | ✅ | ✅ |
| `configure_bgscan` | ✅ | ✅ | ✅ | ✅ |

**Alternative au BSSID lock en mesh** : `bgscan` (background scan) configuré automatiquement pour un roaming plus contrôlé sans verrouillage.

## Alternatives Considérées

### 1. Autoriser le BSSID lock partout

**Verdict** : Rejeté - Incident NLF. Le Pi devient inaccessible si la borne tombe.

### 2. BSSID lock avec détection de perte et fallback automatique

**Avantages** :
- Stabilité du BSSID lock + sécurité du fallback

**Inconvénients** :
- Le driver `brcmfmac` du Pi ne gère pas bien le fallback après un lock
- Délai de détection de perte (30-60s) inacceptable
- Complexité élevée pour un bénéfice marginal

**Verdict** : Rejeté - Le driver WiFi du Pi n'est pas assez fiable.

### 3. Interdiction stricte + bgscan ✅

**Avantages** :
- Sécurité maximale : impossible de se retrouver verrouillé sur une borne morte
- bgscan améliore le roaming sans verrouillage
- Auto-correction au boot

**Inconvénients** :
- Le roaming reste imparfait (micro-coupures possibles)
- Cloud Remote nécessaire si isolation client

**Verdict** : Accepté.

## Conséquences

### Positives

1. **Fiabilité** : Plus de Pi inaccessible à cause d'un BSSID lock en mesh
2. **Auto-correction** : Les anciens locks sont supprimés automatiquement au boot
3. **Transparence** : Le dashboard signale clairement les risques réseau

### Négatives

1. **Roaming imparfait** : Micro-coupures possibles lors des changements de borne (atténuées par bgscan)
2. **Cloud Remote nécessaire** : Si isolation client, la télécommande locale ne fonctionne pas → fallback cloud (ADR-007)

## Références

- [safe-network-operations.js](../../raspberry/sync-agent/src/services/safe-network-operations.js)
- [network-detector.js](../../raspberry/sync-agent/src/services/network-detector.js)
- [NLF.md](../clients/NLF.md) - Documentation client NLF
- [MESH_WIFI_ENVIRONMENTS.md](../guides/MESH_WIFI_ENVIRONMENTS.md)
- ADR-007 : API Remote publique (fallback cloud)

---

*Créé le 11 février 2026*
