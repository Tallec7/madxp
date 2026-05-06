# Vision cible — Multi-display Fire Stick + Neopro

**Date** : 2026-05-05 / 2026-05-06
**Statut** : Validée par Daisy en fin de session POC
**Phase GSD à créer** : "Receivers Fire Stick — auto-discovery + dashboard assignment"

## Le scénario que ça permet

> Un club a 1 Pi Neopro (déjà déployé, écran principal sur HDMI) et veut diffuser le contenu Neopro sur N TVs supplémentaires (bar, terrain, vestiaire) sans tirer N câbles HDMI ni acheter N Pi.

Solution : 1 Fire Stick (~30€) par TV supplémentaire, branchés sur les TVs, connectés au hotspot Wi-Fi du Pi. Aucun internet requis dans le club.

## Architecture cible

```
                                 NEOPRO CLUB
        ┌──────────────────────────────────────────────────────┐
        │   📡 Wi-Fi NEOPRO-XXX                                │
        │                                                      │
        │   ┌────────┐                                         │
        │   │   Pi   │ HDMI ──► 📺 TV principale (#0)          │
        │   └───┬────┘                                         │
        │       │ wlan0 hotspot 192.168.4.1                    │
        │       │                                              │
        │       ├── Fire Stick A ──► 📺 TV bar (#1)            │
        │       ├── Fire Stick B ──► 📺 TV terrain (#2)        │
        │       └── Fire Stick C ──► 📺 TV vestiaire (#3)      │
        └──────────────────────────────────────────────────────┘
```

## UX cible

### Admin Daisy (dashboard cloud)

Dans `Sites > <NLF> > Écrans` (extension du `displays-editor` existant) :

```
| #│ Nom            │ Récepteur                          │
|--+----------------+------------------------------------|
| 0│ TV principale  │ 🟢 Pi natif (HDMI)                 │
| 1│ TV bar         │ 🟢 Fire Stick 0C:43:F9... [Désass.]│
| 2│ TV terrain     │ ⚪ Aucun [Assigner ▾]              │
| 3│ TV vestiaire   │ ⚪ Aucun [Assigner ▾]              │
```

Le dropdown [Assigner ▾] liste les MACs **auto-détectées** par le Pi sur son hotspot (pas de saisie aveugle, pas de pré-config).

### Bénévole sur place (Fire Stick)

1. Branche, allume, connecte au Wi-Fi du club
2. **Si MAC assignée** → page Neopro plein écran direct sur le bon display
3. **Si MAC pas encore assignée** → page d'attente avec MAC affichée. Le bénévole appelle Daisy qui assigne à distance, page Fire Stick auto-rafraîchit

Touche Home Fire Stick = sortie vers Fire OS (toujours dispo).

## Modèle de données

Extension de l'item `sites.displays[i]` JSONB existant (PROP-002), pas de nouvelle table :

```ts
interface DisplayConfig {
  index: number;
  name: string;
  type: string;
  resolution?: string;
  // NOUVEAU
  receiver?: {
    kind: 'pi_native' | 'firestick' | 'browser';
    mac?: string;
    last_seen_at?: string;
  } | null;
}
```

**Source de vérité = DB cloud.** Le Pi cache localement pour résilience offline.

## Couches impactées

| Couche         | Changement                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| DB             | Étendre `DisplayConfig` JSONB avec `receiver?` (migration ALTER)                                                          |
| Pi             | Nouveau `receivers.service.js` (watch dnsmasq.leases, push via sync-agent), nginx route `/` (lookup MAC → 302 ou attente) |
| Sync-agent     | Whitelist nouvel event `receiver-detected`                                                                                |
| Central server | Route `/api/sites/:id/connected-receivers`, repo extension                                                                |
| Dashboard      | Refonte légère `displays-editor` (colonne Récepteur + dropdown auto-rempli)                                               |
| Métriques      | `neopro_receivers_total{site_id, status}`                                                                                 |
| Smoke tests    | Nouveaux tests `smoke-receivers-discovery`                                                                                |

## Pattern existant à reproduire

Le Pi auto-détecte déjà les écrans HDMI via `raspberry/server/services/hdmi.service.js` (EDID + CEC) — pattern PROP-002 phase 5. Le service `receivers.service.js` à créer doit suivre **exactement le même pattern** : détection passive Pi-side, push événements socket, dashboard affiche.

| Layer        | HDMI (existant)                     | Receivers WiFi (à créer)      |
| ------------ | ----------------------------------- | ----------------------------- |
| Détection    | EDID/CEC scan continu               | dnsmasq.leases watch + ARP    |
| Service      | `hdmi.service.js`                   | `receivers.service.js`        |
| Socket event | `connected-displays-changed`        | `connected-receivers-changed` |
| State        | `state.service.js` returns displays | étendu avec receivers         |

## Edge cases couverts

| Cas                                      | Comportement                                                                                                                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pi off                                   | Wi-Fi NEOPRO-XXX disparaît, Fire Stick "Wi-Fi indispo". Au retour → reconnexion auto, mapping retrouvé en cache local.                                                             |
| PSK rotation                             | MAC inchangée, mapping conservé. Bénévole doit re-saisir PSK sur chaque Fire Stick (1 min × N). Préconisation : PSK custom stable per-club (cf. mémoire `feedback_psk_format.md`). |
| Pi remplacé                              | DB cloud = source de vérité. 1ʳᵉ sync du nouveau Pi récupère le mapping.                                                                                                           |
| Fire Stick déplacé d'une TV à l'autre    | Bouton "Réassigner" sur la page Neopro → repasse en attente → admin réassigne.                                                                                                     |
| Plus de Fire Sticks que d'écrans définis | Récepteur surnombre voit page d'attente sans dropdown utile, admin doit ajouter un écran.                                                                                          |
| MAC spoofing                             | Limite connue (accès physique au club requis). Pas critique au scope actuel.                                                                                                       |

## Hors scope phase initiale

- **APK custom TWA fullscreen** → trigger : 1ᵉʳ retour terrain "URL bar Silk fait pas pro"
- **Scénario SaaS Fire Stick** (pas de Pi → token URL/cookie) → trigger : 1ᵉʳ client SaaS qui demande
- **MAC allowlist sans PSK** (hostapd avancé) → trigger : rotation PSK bloquante
- **Captive portal forcé pour auto-launch boot** → trigger : friction "lancer Silk manuellement" documentée

## POC validé 2026-05-05

- Fire Stick `0C:43:F9:36:04:77` connecté au hotspot Pi RACC `neopro.local`
- Internet coupé via nft FORWARD block (Fire Stick → wlan1)
- DNS hijack `firetvcaptiveportal.com` + `spectrum.s3.amazonaws.com` → 192.168.4.1
- nginx server block répond 204 / Success body
- Silk charge la page Neopro depuis le Pi local
- URL bar Silk visible (pas fullscreen) → APK TWA en phase ultérieure

### Configs POC (à recréer si besoin)

**`/etc/dnsmasq.d/firestick-captive.conf`** :

```
address=/firetvcaptiveportal.com/192.168.4.1
address=/spectrum.s3.amazonaws.com/192.168.4.1
```

**`/etc/nginx/sites-available/firestick-captive`** :

```nginx
server {
    listen 80;
    server_name firetvcaptiveportal.com spectrum.s3.amazonaws.com;
    location = /generate_204 { return 204; }
    location = /kindle-wifi/wifistub.html {
        default_type text/html;
        return 200 '<html><head><title>Success</title></head><body>Success</body></html>';
    }
    location / {
        default_type text/plain;
        return 200 '';
    }
}
```

Les 2 fichiers sont **toujours déployés sur le Pi RACC** (`neopro.local`) — preuve du POC, sans nocivité (répliquent les vraies réponses Amazon).

Rollback : `sudo rm /etc/dnsmasq.d/firestick-captive.conf /etc/nginx/sites-enabled/firestick-captive && sudo systemctl restart dnsmasq && sudo systemctl reload nginx`
