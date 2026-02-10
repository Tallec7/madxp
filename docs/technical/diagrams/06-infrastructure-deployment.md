# Infrastructure & Déploiement

> Topologie des services, hébergement, et flux de déploiement Neopro.

## 1. Carte d'infrastructure

```mermaid
graph TB
    subgraph INTERNET["🌐 Internet"]
        USERS["👥 Utilisateurs<br/>Dashboard Web"]
        GH["GitHub<br/>Code source"]
    end

    subgraph RAILWAY["☁️ Railway — Central Server"]
        API["Express API<br/>Node.js 20<br/>Port 443<br/>256 MB RAM"]
        REDIS_R["Redis<br/>Socket.IO adapter"]
    end

    subgraph SUPABASE["🐘 Supabase — Base de données"]
        PG["PostgreSQL 15<br/>Pool: 5 connexions<br/>RLS activé<br/>30+ tables"]
        SUPA_AUTH["Supabase Auth<br/>JWT tokens"]
    end

    subgraph HOSTINGER["🌐 Hostinger — Hébergement Web"]
        STATIC["Dashboard Angular 20<br/>neopro-admin.kalonpartners.bzh<br/>SPA statique"]
        FTP["FTP Storage<br/>kalonpartners.bzh/neopro-video/<br/>Vidéos + Thumbnails + Updates"]
    end

    subgraph EDGE["📡 Edge — 50+ Clubs sportifs"]
        PI1["🔧 Pi #1<br/>Club Paris"]
        PI2["🔧 Pi #2<br/>Club Nantes"]
        PI3["🔧 Pi #3<br/>Club Lyon"]
        PIN["🔧 Pi #N<br/>..."]
    end

    USERS -->|"HTTPS"| STATIC
    STATIC -->|"REST HTTPS"| API
    STATIC -.->|"WebSocket wss://"| API

    GH -->|"CI/CD<br/>GitHub Actions"| RAILWAY

    API -->|"SQL<br/>Pool: 5"| PG
    API -->|"Auth verify"| SUPA_AUTH
    API <-->|"Pub/Sub"| REDIS_R
    API -->|"FTP upload<br/>stream"| FTP

    API <-->|"WebSocket<br/>Socket.IO"| PI1
    API <-->|"WebSocket"| PI2
    API <-->|"WebSocket"| PI3
    API <-->|"WebSocket"| PIN

    PI1 -->|"HTTPS download"| FTP
    PI2 -->|"HTTPS download"| FTP
    PI3 -->|"HTTPS download"| FTP

    style RAILWAY fill:#e3f2fd,stroke:#1565C0
    style SUPABASE fill:#e8f5e9,stroke:#2E7D32
    style HOSTINGER fill:#fff8e1,stroke:#F57F17
    style EDGE fill:#fff3e0,stroke:#E65100
    style INTERNET fill:#f3e5f5,stroke:#7B1FA2
```

---

## 2. Pipeline CI/CD

```mermaid
sequenceDiagram
    autonumber
    participant DEV as 👨‍💻 Développeur
    participant GH as 🐙 GitHub
    participant CI as ⚡ GitHub Actions
    participant RW as ☁️ Railway
    participant HO as 🌐 Hostinger

    Note over DEV,HO: === DÉPLOIEMENT CLOUD ===

    DEV->>GH: git push (PR → main)
    GH->>CI: Trigger workflow
    CI->>CI: npm ci (central-server)
    CI->>CI: npm run build (TypeScript)
    CI->>CI: npm test (1586 tests)
    CI->>CI: npm run lint (ESLint)

    alt Tous les tests passent
        CI->>RW: Auto-deploy central-server
        RW->>RW: Build + Start (PORT=3001)
        RW-->>CI: ✅ Deploy OK
    else Tests échoués
        CI-->>DEV: ❌ Pipeline failed
    end

    Note over DEV,HO: === DÉPLOIEMENT DASHBOARD ===

    DEV->>GH: git push (branch dashboard)
    GH->>CI: Trigger workflow
    CI->>CI: npm ci (central-dashboard)
    CI->>CI: ng build --configuration=production
    CI->>CI: ng test --browsers=ChromeHeadless
    CI->>HO: FTP upload dist/ → Hostinger
    HO-->>CI: ✅ Static files deployed

    Note over DEV,HO: === MISE À JOUR RASPBERRY PI (OTA) ===

    DEV->>GH: Tag release v2.x.x
    DEV->>RW: POST /api/software-updates (package)
    RW->>HO: Upload package → FTP
    RW->>RW: Notify connected Pis
    RW-->>DEV: ✅ OTA déployé sur N sites
```

---

## 3. Stratégies de déploiement Raspberry Pi

```mermaid
graph TB
    subgraph STRATEGIES["3 Méthodes de déploiement"]
        subgraph GOLDEN["1️⃣ Golden Image (recommandé)"]
            GI1["Image SD pré-configurée"]
            GI2["Flash avec Etcher"]
            GI3["Boot + register-site.js"]
            GI1 --> GI2 --> GI3
        end

        subgraph MANUAL["2️⃣ Installation manuelle"]
            MI1["Raspbian Lite"]
            MI2["install.sh (30 min)"]
            MI3["setup-new-club.sh (10 min)"]
            MI1 --> MI2 --> MI3
        end

        subgraph OTA["3️⃣ OTA — Over The Air"]
            OTA1["Upload package via Dashboard"]
            OTA2["Central Server → WebSocket"]
            OTA3["Pi download + backup"]
            OTA4["Pi apply + restart"]
            OTA1 --> OTA2 --> OTA3 --> OTA4
        end
    end

    GI3 -->|"⏱️ 10 min"| ONLINE["🟢 Site en ligne"]
    MI3 -->|"⏱️ 40 min"| ONLINE
    OTA4 -->|"⏱️ 10 min"| ONLINE

    style GOLDEN fill:#e8f5e9,stroke:#2E7D32
    style MANUAL fill:#fff8e1,stroke:#F57F17
    style OTA fill:#e3f2fd,stroke:#1565C0
```

---

## 4. Flux de stockage vidéo

```mermaid
sequenceDiagram
    autonumber
    participant D as 🖥️ Dashboard
    participant A as ☁️ Central API
    participant FTP as 📁 FTP Hostinger
    participant PI as 🔧 Raspberry Pi

    Note over D,PI: === UPLOAD (Dashboard → FTP) ===

    D->>A: POST /content/upload<br/>multipart/form-data
    A->>A: Validation Joi<br/>type, taille, durée
    A->>A: Sanitize filename<br/>uuid-original.mp4
    A->>FTP: Stream upload<br/>(0 mémoire serveur)
    A->>A: Calcul SHA256 pendant stream
    FTP-->>A: Upload complet
    A->>A: Vérification taille FTP = taille attendue
    A-->>D: {id, url, checksum, size}

    Note over D,PI: === DOWNLOAD (FTP → Pi) ===

    A->>PI: emit('deploy_video', {url, checksum, size})
    PI->>FTP: HTTPS GET video.mp4
    FTP-->>PI: Stream download
    PI->>PI: Calcul SHA256 pendant download
    PI->>PI: Vérification checksum
    alt Checksum OK
        PI->>PI: Sauvegarde dans /home/pi/neopro/videos/
        PI->>PI: Mise à jour configuration.json
        PI->>A: emit('deploy_progress', {progress: 100})
    else Checksum mismatch
        PI->>PI: Suppression fichier corrompu
        PI->>A: emit('deploy_progress', {error: 'checksum_mismatch'})
    end
```

---

## 5. Monitoring & Observabilité

```mermaid
graph LR
    subgraph SOURCES["📡 Sources"]
        PI["Raspberry Pi<br/>heartbeat 30s"]
        API["Central Server<br/>Prometheus /metrics"]
        PG["PostgreSQL<br/>pg_stat_activity"]
    end

    subgraph COLLECT["📥 Collecte"]
        SOCKET["Socket.IO<br/>heartbeat handler"]
        PROM["Prometheus<br/>Port 9090"]
        WINSTON["Winston Logger<br/>JSON structured"]
    end

    subgraph STORE["💾 Stockage"]
        METRICS_T["Table metrics<br/>(site_id, cpu, ram, temp, disk)"]
        ALERTS_T["Table alerts<br/>(severity, message, status)"]
        AUDIT_T["Table audit_logs<br/>(action, entity, details)"]
    end

    subgraph ALERT["🚨 Alertes"]
        THRESHOLDS["Seuils<br/>CPU>90, Temp>70, Disk>90"]
        CHANNELS["Canaux<br/>Email + Slack + Webhook"]
    end

    subgraph DISPLAY["📊 Affichage"]
        DASH["Dashboard Angular<br/>temps réel via WS"]
        GRAFANA["Grafana<br/>Port 3000"]
    end

    PI --> SOCKET
    API --> PROM
    API --> WINSTON

    SOCKET --> METRICS_T
    SOCKET --> ALERTS_T
    WINSTON --> AUDIT_T

    METRICS_T --> THRESHOLDS
    THRESHOLDS --> CHANNELS
    METRICS_T --> DASH
    PROM --> GRAFANA

    style SOURCES fill:#fff3e0,stroke:#E65100
    style COLLECT fill:#e3f2fd,stroke:#1565C0
    style STORE fill:#e8f5e9,stroke:#2E7D32
    style ALERT fill:#ffebee,stroke:#C62828
    style DISPLAY fill:#f3e5f5,stroke:#7B1FA2
```

---

## 6. Dimensionnement actuel

| Ressource       | Service            | Configuration                      | Coût estimé       |
| --------------- | ------------------ | ---------------------------------- | ----------------- |
| **Compute**     | Railway            | 1 instance, 256 MB RAM, auto-scale | ~$5/mois          |
| **Database**    | Supabase Free      | 500 MB, 5 connexions Pool          | Gratuit           |
| **Hébergement** | Hostinger Premium  | SPA + FTP illimité                 | ~$3/mois          |
| **Redis**       | Railway addon      | Socket.IO adapter uniquement       | ~$3/mois          |
| **Edge**        | 50× Raspberry Pi 4 | 4 GB RAM, 32 GB SD                 | Hardware one-time |
| **Domain**      | kalonpartners.bzh  | DNS Hostinger                      | ~$10/an           |
| **SSL**         | Let's Encrypt      | Auto-renew                         | Gratuit           |

---

_Dernière mise à jour : 10 février 2026_
