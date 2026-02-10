# Topologie Réseau — Raspberry Pi & Cloud

> Architecture réseau du boîtier Raspberry Pi dans un club sportif — modes connecté et autonome.

## 1. Vue d'ensemble — Réseau club

```mermaid
graph TB
    subgraph CLOUD["☁️ Cloud Neopro"]
        API["Central Server<br/>Railway<br/>WSS + HTTPS"]
        FTP["FTP Hostinger<br/>Vidéos"]
    end

    subgraph CLUB["🏟️ Club Sportif"]
        subgraph PI_NET["🔧 Raspberry Pi 4"]
            WLAN0["wlan0<br/>Hotspot AP<br/>192.168.4.1"]
            WLAN1["wlan1<br/>WiFi Client<br/>DHCP"]
            ETH0["eth0<br/>Ethernet<br/>Optionnel"]
            SERVICES["Services<br/>nginx:80 | socket:3000 | admin:8080"]
        end

        ROUTER["📶 Box Internet<br/>du club"]
        TV["📺 TV<br/>HDMI"]

        subgraph CLIENTS["📱 Clients WiFi (NEOPRO-CLUB)"]
            PHONE1["📱 Staff #1"]
            PHONE2["📱 Staff #2"]
            TABLET["📱 Spectateur"]
        end
    end

    WLAN1 -->|"WiFi Client<br/>Internet"| ROUTER
    ETH0 -.->|"Ethernet<br/>Fallback"| ROUTER
    ROUTER -->|"Internet"| API
    ROUTER -->|"Internet"| FTP

    WLAN0 -->|"Hotspot AP<br/>SSID: NEOPRO-CLUB<br/>192.168.4.x/24"| PHONE1
    WLAN0 --> PHONE2
    WLAN0 --> TABLET

    SERVICES -->|"HDMI"| TV

    PHONE1 -->|"http://neopro.local"| SERVICES
    PHONE2 -->|"http://neopro.local"| SERVICES
    TABLET -->|"http://neopro.local"| SERVICES

    style CLOUD fill:#e3f2fd,stroke:#1565C0
    style PI_NET fill:#fff3e0,stroke:#E65100
    style CLIENTS fill:#f3e5f5,stroke:#7B1FA2
    style CLUB fill:#f5f5f5,stroke:#9E9E9E
```

---

## 2. Modes réseau du Raspberry Pi

### Mode 1 — Hotspot Only (100% Autonome)

```mermaid
graph LR
    subgraph PI["🔧 Raspberry Pi"]
        WLAN["wlan0<br/>AP Mode<br/>192.168.4.1"]
        HOSTAPD["hostapd<br/>SSID: NEOPRO_xxx"]
        DNSMASQ["dnsmasq<br/>DHCP: .4.10 → .4.50<br/>DNS: captive portal"]
        NGINX["nginx:80<br/>App Angular"]
        SOCKET["Socket.IO:3000<br/>TV ↔ Remote"]
        ADMIN["Admin:8080<br/>Config locale"]
        AVAHI["Avahi mDNS<br/>neopro.local"]
    end

    PHONES["📱 Clients WiFi"] -->|"DHCP 192.168.4.x"| WLAN
    PHONES -->|"neopro.local"| AVAHI
    PHONES -->|"http://neopro.local"| NGINX
    PHONES -->|"WebSocket"| SOCKET

    WLAN --> HOSTAPD
    WLAN --> DNSMASQ

    style PI fill:#fff3e0,stroke:#E65100
```

**Caractéristiques :**

- ❌ Pas d'accès internet
- ✅ Lecture vidéo locale
- ✅ Télécommande via WiFi
- ✅ Interface admin locale
- ❌ Pas de sync cloud, pas de métriques, pas de commandes remote

---

### Mode 2 — Hotspot + WiFi Client (Hybride)

```mermaid
graph TB
    subgraph PI["🔧 Raspberry Pi"]
        WLAN0["wlan0<br/>AP Mode<br/>192.168.4.1<br/>Hotspot local"]
        WLAN1["wlan1<br/>Client WiFi<br/>DHCP<br/>Internet via box club"]
    end

    PHONES["📱 Clients locaux"] -->|"WiFi AP"| WLAN0
    WLAN1 -->|"WiFi Client"| BOX["📶 Box Internet"]
    BOX -->|"Internet"| CLOUD["☁️ Cloud Neopro"]

    style PI fill:#fff3e0,stroke:#E65100
```

**Caractéristiques :**

- ✅ Accès internet via wlan1
- ✅ Hotspot local via wlan0
- ✅ Sync cloud (heartbeat 30s, analytics, configs)
- ✅ Commandes remote (reboot, logs, update)
- ✅ Déploiement vidéo OTA
- ✅ Métriques temps réel sur dashboard

---

### Mode 3 — Ethernet + Hotspot (Optimal)

```mermaid
graph TB
    subgraph PI["🔧 Raspberry Pi"]
        ETH0["eth0<br/>Ethernet<br/>DHCP<br/>Internet stable"]
        WLAN0["wlan0<br/>AP Mode<br/>192.168.4.1<br/>Hotspot local"]
    end

    PHONES["📱 Clients locaux"] -->|"WiFi AP"| WLAN0
    ETH0 -->|"Câble RJ45"| SWITCH["🔌 Switch réseau"]
    SWITCH --> BOX["📶 Box Internet"]
    BOX -->|"Internet"| CLOUD["☁️ Cloud Neopro"]

    style PI fill:#e8f5e9,stroke:#2E7D32
```

**Caractéristiques :**

- ✅ Connexion internet la plus stable
- ✅ Pas de conflit WiFi AP / Client
- ✅ Toutes les fonctionnalités cloud
- ⭐ Mode recommandé quand Ethernet disponible

---

## 3. Configuration réseau détaillée

```mermaid
graph TB
    subgraph NETWORK_STACK["🔧 Stack réseau Raspberry Pi"]
        subgraph LAYER_APP["Couche Application"]
            SYNC["Sync Agent<br/>→ Cloud API (WSS)"]
            NGINX["nginx:80<br/>→ App Angular"]
            SOCKET_SRV["Socket.IO:3000<br/>→ TV + Remote"]
            ADMIN_SRV["Admin:8080<br/>→ Config locale"]
        end

        subgraph LAYER_NET["Couche Réseau"]
            IPTABLES["iptables<br/>NAT masquerade<br/>FORWARD chains"]
            UFW["ufw firewall<br/>Ports: 22, 80, 443, 3000, 8080"]
        end

        subgraph LAYER_WIFI["Couche WiFi"]
            HOSTAPD_CFG["hostapd.conf<br/>driver=nl80211<br/>hw_mode=g<br/>channel=7<br/>ssid=NEOPRO_xxx"]
            DNSMASQ_CFG["dnsmasq.conf<br/>interface=wlan0<br/>dhcp-range=192.168.4.10,192.168.4.50,24h<br/>address=/#/192.168.4.1"]
        end

        subgraph LAYER_DNS["Couche DNS/mDNS"]
            AVAHI_CFG["avahi-daemon<br/>hostname=neopro<br/>→ neopro.local"]
        end
    end

    LAYER_APP --> LAYER_NET
    LAYER_NET --> LAYER_WIFI
    LAYER_NET --> LAYER_DNS

    style NETWORK_STACK fill:#f5f5f5,stroke:#616161
    style LAYER_APP fill:#e3f2fd,stroke:#1565C0
    style LAYER_NET fill:#fff8e1,stroke:#F57F17
    style LAYER_WIFI fill:#fce4ec,stroke:#880E4F
    style LAYER_DNS fill:#e8f5e9,stroke:#2E7D32
```

---

## 4. Flux de données réseau

```mermaid
sequenceDiagram
    autonumber
    participant P as 📱 Phone<br/>(192.168.4.15)
    participant AP as wlan0<br/>Hotspot AP<br/>(192.168.4.1)
    participant PI as 🔧 Pi Services
    participant WAN as wlan1/eth0<br/>Internet
    participant C as ☁️ Cloud

    Note over P,C: === FLUX LOCAL (WiFi Hotspot) ===

    P->>AP: DNS query: neopro.local
    AP->>AP: Avahi mDNS → 192.168.4.1
    AP-->>P: 192.168.4.1

    P->>AP: HTTP GET / (port 80)
    AP->>PI: nginx → Angular app
    PI-->>P: SPA Angular (TV ou Remote)

    P->>AP: WebSocket connect :3000
    AP->>PI: Socket.IO → Orchestrateur
    PI-->>P: Connexion établie

    Note over P,C: === FLUX CLOUD (Internet) ===

    PI->>WAN: WebSocket connect (WSS)
    WAN->>C: neopro-central-production.up.railway.app
    C-->>PI: ✅ Connecté

    loop Toutes les 30 secondes
        PI->>C: emit('heartbeat', {cpu, ram, temp, disk})
        C-->>PI: emit('pong')
    end

    C->>PI: emit('deploy_video', {url, checksum})
    PI->>WAN: HTTPS GET video.mp4 (FTP Hostinger)
    WAN-->>PI: Stream vidéo
    PI->>PI: Sauvegarde locale + SHA256
    PI->>C: emit('deploy_progress', 100%)
```

---

## 5. Résilience réseau — 4 couches

```mermaid
graph TB
    subgraph L1["🛡️ Couche 1 : Détection"]
        D1["Ping check 30s"]
        D2["Zombie detection (connected flag)"]
        D3["Heartbeat monitoring"]
    end

    subgraph L2["🔄 Couche 2 : Reconnexion"]
        R1["Auto-reconnect WebSocket"]
        R2["Backoff exponentiel<br/>5s → 10s → 20s → ... → 5min max"]
        R3["Tentatives illimitées"]
    end

    subgraph L3["📦 Couche 3 : Queue hors-ligne"]
        Q1["pending_commands<br/>File d'attente avec priorité"]
        Q2["Expiration configurable"]
        Q3["Replay à la reconnexion"]
    end

    subgraph L4["💾 Couche 4 : Autonomie locale"]
        A1["Vidéos en cache local"]
        A2["configuration.json locale"]
        A3["Analytics buffered"]
        A4["Lecture vidéo continue<br/>même sans internet"]
    end

    L1 -->|"Perte détectée"| L2
    L2 -->|"Reconnexion impossible"| L3
    L3 -->|"Site offline prolongé"| L4

    style L1 fill:#e3f2fd,stroke:#1565C0
    style L2 fill:#fff8e1,stroke:#F57F17
    style L3 fill:#ffe0b2,stroke:#E65100
    style L4 fill:#ffcdd2,stroke:#C62828
```

---

## 6. Ports & Services

| Port     | Service             | Interface       | Accès                   |
| -------- | ------------------- | --------------- | ----------------------- |
| **22**   | SSH (OpenSSH)       | Toutes          | Admin système           |
| **80**   | nginx (Angular app) | wlan0 (hotspot) | Staff club, spectateurs |
| **443**  | HTTPS sortant       | wlan1/eth0      | API Cloud + FTP         |
| **3000** | Socket.IO server    | wlan0 (hotspot) | TV + Télécommande       |
| **8080** | Admin Express       | wlan0 (hotspot) | Configuration locale    |
| **5353** | Avahi mDNS          | wlan0 (hotspot) | Résolution neopro.local |

---

## 7. Sécurité réseau

```mermaid
graph TB
    subgraph SECURITY["🔐 Mesures de sécurité"]
        subgraph PERIMETER["Périmètre"]
            FW["ufw firewall<br/>Ports whitelist"]
            AP_ISO["WiFi AP isolé<br/>hostapd isolation"]
        end

        subgraph AUTH_NET["Authentification"]
            WPA2["WPA2-PSK<br/>Hotspot protégé"]
            PIN["Code PIN local<br/>bcrypt hash"]
            APIKEY["API Key site<br/>Enregistrement central"]
            JWT["JWT tokens<br/>Dashboard admin"]
        end

        subgraph TRANSPORT["Transport"]
            TLS["TLS 1.3<br/>Let's Encrypt"]
            WSS["WebSocket Secure<br/>wss:// vers cloud"]
            SHA["SHA256 checksum<br/>Vidéos et configs"]
        end

        subgraph DATA["Données"]
            RLS["Row-Level Security<br/>Isolation par site_id"]
            PARAM["Requêtes paramétrées<br/>Anti-injection SQL"]
            SANITIZE["Sanitize filenames<br/>Anti-path traversal"]
        end
    end

    style SECURITY fill:#f5f5f5,stroke:#616161
    style PERIMETER fill:#ffebee,stroke:#C62828
    style AUTH_NET fill:#fff8e1,stroke:#F57F17
    style TRANSPORT fill:#e3f2fd,stroke:#1565C0
    style DATA fill:#e8f5e9,stroke:#2E7D32
```

---

_Dernière mise à jour : 10 février 2026_
