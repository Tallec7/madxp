# Architecture Système — Vue C4

> Vue d'ensemble de l'architecture 3-tiers Neopro : Cloud ↔ Edge ↔ Utilisateurs.

## 1. Vue Contexte — Acteurs & Systèmes

```mermaid
graph TB
    subgraph ACTORS["👥 Acteurs"]
        SA["🔑 Super Admin"]
        ADM["👤 Admin / Operator"]
        ADV["📢 Advertiser / Agency"]
        CLUB["🏟️ Staff Club"]
        TV["📺 Spectateurs"]
    end

    subgraph NEOPRO["☁️ Plateforme Neopro"]
        DASH["Dashboard Angular 20"]
        API["Central Server<br/>Express + TypeScript"]
        DB["PostgreSQL 15<br/>Supabase"]
        FTP["Stockage FTP<br/>Hostinger"]
    end

    subgraph EDGE["📡 Edge — Clubs sportifs (50+ sites)"]
        PI["Raspberry Pi 4<br/>+ TV connectée"]
    end

    SA -->|"HTTPS"| DASH
    ADM -->|"HTTPS"| DASH
    ADV -->|"HTTPS"| DASH
    CLUB -->|"WiFi local"| PI
    TV -->|"HDMI"| PI

    DASH -->|"REST API"| API
    API -->|"SQL Pool:5"| DB
    API -->|"FTP Upload"| FTP
    API <-->|"WebSocket<br/>Socket.IO"| PI
    PI -->|"HTTPS Download"| FTP

    style NEOPRO fill:#e8f4fd,stroke:#2196F3
    style EDGE fill:#fff3e0,stroke:#FF9800
    style ACTORS fill:#f3e5f5,stroke:#9C27B0
```

---

## 2. Vue Conteneur — Composants Cloud

```mermaid
graph TB
    subgraph RAILWAY["☁️ Railway (Cloud)"]
        subgraph API_SERVER["Central Server — Express/TS"]
            ROUTES["Routes<br/>REST API"]
            SOCKET["Socket.IO<br/>Server"]
            REPOS["21 Repositories<br/>BaseRepository&lt;T&gt;"]
            SERVICES["Services<br/>deployment, alerting, storage..."]
            AUTH["Auth Middleware<br/>JWT + MFA (TOTP)"]
            RATE["Rate Limiter<br/>10-100 req/min"]
            MEMORY["Memory Manager<br/>93% heap auto-cleanup"]
        end

        REDIS["Redis<br/>Socket.IO Adapter<br/>sticky sessions"]
    end

    subgraph SUPABASE["🐘 Supabase"]
        PG["PostgreSQL 15<br/>RLS multi-tenant<br/>30+ tables"]
    end

    subgraph HOSTINGER["🌐 Hostinger"]
        DASHBOARD["Dashboard Angular 20<br/>Static SPA<br/>neopro-admin.kalonpartners.bzh"]
        FTP_STORAGE["FTP Storage<br/>kalonpartners.bzh/neopro-video/<br/>Vidéos + Thumbnails"]
    end

    DASHBOARD -->|"REST HTTPS"| ROUTES
    DASHBOARD -->|"WebSocket"| SOCKET
    ROUTES --> AUTH
    AUTH --> REPOS
    REPOS -->|"Pool: 5 conn"| PG
    SERVICES --> REPOS
    SOCKET --> SERVICES
    SOCKET --> REDIS

    style RAILWAY fill:#e3f2fd,stroke:#1565C0
    style SUPABASE fill:#e8f5e9,stroke:#2E7D32
    style HOSTINGER fill:#fff8e1,stroke:#F57F17
```

---

## 3. Vue Conteneur — Composants Edge (Raspberry Pi)

```mermaid
graph TB
    subgraph PI["🔧 Raspberry Pi 4 — Un par club"]
        subgraph SYNC["Sync Agent — Node.js"]
            AGENT["agent.js<br/>WebSocket client"]
            CONFIG_MERGE["config-merge.js<br/>Fusion NEOPRO + Club"]
            DEPLOY_VID["deploy-video.js<br/>Téléchargement + SHA256"]
            COMMANDS["commands/<br/>reboot, logs, update..."]
        end

        subgraph LOCAL_SERVER["Socket.IO Server — Port 3000"]
            ORCH["Orchestrateur<br/>TV ↔ Télécommande"]
            PLAY_SVC["PlaybackService<br/>Lecture vidéo"]
            ANALYTICS_SVC["AnalyticsService<br/>Collecte locale"]
        end

        subgraph ADMIN["Admin UI — Port 8080"]
            ADMIN_ROUTES["Express<br/>Config locale"]
        end

        subgraph WEBAPP["Angular Frontend — Port 80"]
            TV_APP["Application TV<br/>Video.js 8.x"]
            REMOTE["Télécommande<br/>Mobile responsive"]
        end

        NGINX["nginx<br/>Reverse proxy<br/>Port 80"]
        HOTSPOT["hostapd + dnsmasq<br/>WiFi NEOPRO-[CLUB]<br/>192.168.4.1"]
    end

    AGENT <-->|"WebSocket<br/>heartbeat 30s"| CLOUD["☁️ Central Server"]
    DEPLOY_VID -->|"HTTPS Download"| FTP["🌐 FTP Hostinger"]
    HOTSPOT -->|"WiFi AP"| PHONE["📱 Staff / Spectateurs"]
    NGINX --> TV_APP
    NGINX --> REMOTE
    PHONE --> NGINX
    TV_APP <--> ORCH
    REMOTE <--> ORCH

    style PI fill:#fff3e0,stroke:#E65100
    style SYNC fill:#e8eaf6,stroke:#283593
    style LOCAL_SERVER fill:#e0f2f1,stroke:#00695C
    style WEBAPP fill:#fce4ec,stroke:#880E4F
```

---

## 4. Flux de données — Vue séquence simplifiée

```mermaid
sequenceDiagram
    autonumber
    participant D as 🖥️ Dashboard
    participant A as ☁️ Central API
    participant DB as 🐘 PostgreSQL
    participant FTP as 📁 FTP Hostinger
    participant PI as 🔧 Raspberry Pi
    participant TV as 📺 TV Club

    Note over D,TV: === DÉPLOIEMENT VIDÉO ===

    D->>A: POST /content/upload (vidéo)
    A->>FTP: Stream upload (0 mémoire)
    FTP-->>A: URL publique
    A->>DB: INSERT videos
    A-->>D: ✅ Vidéo uploadée

    D->>A: POST /content/deploy
    A->>DB: INSERT content_deployments
    A->>PI: emit('deploy_video', {url, checksum})
    PI->>FTP: HTTPS download vidéo
    PI->>PI: Vérification SHA256
    PI->>A: emit('deploy_progress', 100%)
    A->>DB: UPDATE status = 'completed'
    A->>D: emit('deployment_update')

    Note over D,TV: === LECTURE VIDÉO ===

    TV->>PI: Connexion Socket.IO locale
    PI->>TV: emit('play_video', {filename})
    TV->>TV: Video.js lecture
    TV->>PI: emit('video_ended')
    PI->>PI: Enregistre video_play localement

    Note over D,TV: === SYNC ANALYTICS ===

    PI->>A: emit('heartbeat', {cpu, ram, temp})
    A->>DB: INSERT metrics
    PI->>A: Batch analytics (100 records)
    A->>DB: INSERT video_plays
```

---

## 5. Patterns architecturaux

```mermaid
graph LR
    subgraph PATTERNS["Patterns clés"]
        P1["🏢 Repository Pattern<br/>21 repositories typés<br/>BaseRepository&lt;T&gt;"]
        P2["📡 Event-Driven<br/>Socket.IO rooms<br/>9 handlers spécialisés"]
        P3["🔒 Multi-Tenant RLS<br/>Isolation par site_id<br/>Row-Level Security"]
        P4["🌐 Edge Computing<br/>Offline-first<br/>Sync asynchrone"]
        P5["📊 CQRS light<br/>Write: API REST<br/>Read: WebSocket temps réel"]
        P6["🛡️ Defense in Depth<br/>JWT + MFA + Rate Limit<br/>+ API Key + RLS"]
    end

    style PATTERNS fill:#f5f5f5,stroke:#616161
```

---

## 6. Capacités & Limites

| Composant           | Capacité                     | Limite actuelle            |
| ------------------- | ---------------------------- | -------------------------- |
| **Central Server**  | Multi-instance (Railway)     | 256 MB RAM / instance      |
| **PostgreSQL Pool** | 5 connexions (Railway)       | Adapté pour ~50 sites      |
| **Redis**           | Socket.IO adapter uniquement | Pas de cache général       |
| **FTP Storage**     | Illimité (Hostinger)         | Bande passante partagée    |
| **Raspberry Pi 4**  | 4 GB RAM, 32 GB SD min       | ~100 vidéos en cache local |
| **WebSocket**       | 50+ connexions simultanées   | heartbeat 30s, timeout 90s |
| **Analytics batch** | 100 records / batch          | Insertion asynchrone       |
| **Rate limiting**   | Auth: 10/15min, API: 100/min | Upload: 10/heure           |

---

_Dernière mise à jour : 10 février 2026_
