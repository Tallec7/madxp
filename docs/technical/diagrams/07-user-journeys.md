# Parcours Utilisateurs par Rôle

> User journeys pour chaque rôle Neopro — du login à l'action métier principale.

## 1. Hiérarchie des rôles

```mermaid
graph TB
    SA["🔑 super_admin (100)<br/>Accès total"]
    ADM["👤 admin (80)<br/>Gestion opérationnelle"]
    OP["🔧 operator (60)<br/>Sites assignés"]
    VW["👁️ viewer (40)<br/>Lecture seule"]
    ADV["📢 advertiser (30)<br/>Ses vidéos uniquement"]
    AGY["🏢 agency (20)<br/>Ses annonceurs"]

    SA --> ADM
    ADM --> OP
    OP --> VW

    style SA fill:#ffcdd2,stroke:#C62828
    style ADM fill:#ffe0b2,stroke:#E65100
    style OP fill:#fff9c4,stroke:#F57F17
    style VW fill:#e8f5e9,stroke:#2E7D32
    style ADV fill:#e3f2fd,stroke:#1565C0
    style AGY fill:#f3e5f5,stroke:#7B1FA2
```

---

## 2. Super Admin — Gestion complète

```mermaid
sequenceDiagram
    autonumber
    participant SA as 🔑 Super Admin
    participant D as 🖥️ Dashboard
    participant A as ☁️ API

    Note over SA,A: === CONNEXION ===
    SA->>D: Login (email + password)
    D->>A: POST /auth/login
    A-->>D: JWT token + MFA challenge
    SA->>D: Code TOTP (si MFA activé)
    D->>A: POST /auth/mfa/verify
    A-->>D: ✅ Authentifié (role: super_admin)

    Note over SA,A: === GESTION UTILISATEURS (exclusif super_admin) ===
    SA->>D: Menu Users → Créer
    D->>A: POST /admin/users {email, role, ...}
    A->>A: requireSuperAdmin()
    A-->>D: ✅ Utilisateur créé

    Note over SA,A: === GESTION ABONNEMENTS (exclusif super_admin) ===
    SA->>D: Site → Abonnement → Changer plan
    D->>A: PUT /admin/sites/:id/subscription
    A->>A: requireSuperAdmin()
    A-->>D: ✅ Plan mis à jour (trial → premium)

    Note over SA,A: === MONITORING FLOTTE ===
    SA->>D: Dashboard principal
    D->>A: GET /sites (tous les sites)
    D->>A: WebSocket subscribe('dashboard')
    A-->>D: Temps réel : statuts, alertes, métriques
```

---

## 3. Admin — Opérations quotidiennes

```mermaid
sequenceDiagram
    autonumber
    participant ADM as 👤 Admin
    participant D as 🖥️ Dashboard
    participant A as ☁️ API
    participant PI as 🔧 Raspberry Pi

    Note over ADM,PI: === DÉPLOIEMENT VIDÉO ===
    ADM->>D: Menu Contenu → Upload vidéo
    D->>A: POST /content/upload (multipart)
    A->>A: requireRole('admin', 'operator')
    A-->>D: ✅ Vidéo uploadée

    ADM->>D: Sélectionner sites/groupe → Déployer
    D->>A: POST /content/deploy {videoId, targetType, targetId}
    A->>PI: emit('deploy_video', {...})
    PI-->>A: emit('deploy_progress', {progress})
    A-->>D: WebSocket updates temps réel

    Note over ADM,PI: === COMMANDE REMOTE ===
    ADM->>D: Site → Actions → Redémarrer
    D->>A: POST /sites/:id/commands {type: 'reboot'}
    A->>PI: emit('execute_command', {type: 'reboot'})
    PI-->>A: emit('command_result', {success: true})
    A-->>D: ✅ Commande exécutée

    Note over ADM,PI: === MISE À JOUR SOFTWARE ===
    ADM->>D: Updates → Upload package
    D->>A: POST /software-updates
    ADM->>D: Sélectionner cibles → Déployer
    D->>A: POST /update-deployments
    A->>PI: emit('update_software', {url, version})
    PI->>PI: Download → Backup → Apply → Restart
    PI-->>A: emit('update_result', {success})
```

---

## 4. Operator — Gestion de ses sites assignés

```mermaid
sequenceDiagram
    autonumber
    participant OP as 🔧 Operator
    participant D as 🖥️ Dashboard
    participant A as ☁️ API

    Note over OP,A: === PÉRIMÈTRE : SITES ASSIGNÉS UNIQUEMENT ===

    OP->>D: Login
    D->>A: POST /auth/login
    A-->>D: ✅ (role: operator, assigned_sites: [id1, id2, id3])

    OP->>D: Menu Sites
    D->>A: GET /sites
    A->>A: Filtre par sites assignés
    A-->>D: 3 sites visibles (sur 50+)

    Note over OP,A: === UPLOAD + DEPLOY VIDÉO ===
    OP->>D: Contenu → Upload
    D->>A: POST /content/upload
    A->>A: requireRole('admin', 'operator')
    A-->>D: ✅ Upload OK

    OP->>D: Déployer sur site #1
    D->>A: POST /content/deploy {target: site1}
    A->>A: Vérifie que site1 est assigné à l'operator
    A-->>D: ✅ Déploiement lancé

    Note over OP,A: === CONSULTATION ANALYTICS ===
    OP->>D: Site #1 → Analytics
    D->>A: GET /analytics/sites/site1
    A-->>D: Sessions, vidéos jouées, temps écran
```

---

## 5. Viewer — Lecture seule

```mermaid
sequenceDiagram
    autonumber
    participant VW as 👁️ Viewer
    participant D as 🖥️ Dashboard
    participant A as ☁️ API

    VW->>D: Login
    A-->>D: ✅ (role: viewer, assigned_sites: [id1])

    Note over VW,A: === CONSULTATION UNIQUEMENT ===

    VW->>D: Dashboard principal
    D->>A: GET /sites (filtrés)
    A-->>D: 1 site visible

    VW->>D: Site #1 → Détails
    D->>A: GET /sites/site1
    A-->>D: Infos site, métriques, statut

    VW->>D: Site #1 → Analytics
    D->>A: GET /analytics/sites/site1
    A-->>D: Données lecture seule

    VW->>D: Tente d'uploader une vidéo
    D->>D: ❌ Bouton masqué (roleGuard)

    VW->>D: Tente de déployer
    D->>D: ❌ Action masquée (roleGuard)
```

---

## 6. Advertiser — Gestion de ses publicités

```mermaid
sequenceDiagram
    autonumber
    participant ADV as 📢 Advertiser
    participant D as 🖥️ Dashboard
    participant A as ☁️ API

    ADV->>D: Login
    A-->>D: ✅ (role: advertiser, advertiser_id: adv1)

    Note over ADV,A: === PORTAIL ANNONCEUR ===

    ADV->>D: Mes Vidéos
    D->>A: GET /advertisers/adv1/videos
    A-->>D: Liste de ses vidéos publicitaires

    ADV->>D: Upload nouvelle pub
    D->>A: POST /content/upload {advertiser_id: adv1}
    A-->>D: ✅ Vidéo uploadée

    ADV->>D: Mes Analytics
    D->>A: GET /advertisers/adv1/analytics
    A-->>D: Impressions, durée, sites touchés

    ADV->>D: Rapports
    D->>A: GET /advertisers/adv1/reports
    A-->>D: PDF rapports avec preuves de diffusion

    ADV->>D: Tente d'accéder aux sites
    D->>D: ❌ Menu masqué (roleGuard)
```

---

## 7. Agency — Gestion multi-annonceurs

```mermaid
sequenceDiagram
    autonumber
    participant AGY as 🏢 Agency
    participant D as 🖥️ Dashboard
    participant A as ☁️ API

    AGY->>D: Login
    A-->>D: ✅ (role: agency, agency_id: agy1)

    Note over AGY,A: === VUE MULTI-ANNONCEURS ===

    AGY->>D: Mes Annonceurs
    D->>A: GET /agencies/agy1/advertisers
    A-->>D: Liste des annonceurs de l'agence

    AGY->>D: Sélectionner Annonceur #2
    D->>A: GET /advertisers/adv2/analytics
    A->>A: Vérifie que adv2 appartient à agy1
    A-->>D: Analytics de l'annonceur #2

    AGY->>D: Upload vidéo pour Annonceur #2
    D->>A: POST /content/upload {advertiser_id: adv2}
    A->>A: Vérifie ownership agency → advertiser
    A-->>D: ✅ Vidéo uploadée

    AGY->>D: Vue consolidée
    D->>A: GET /agencies/agy1/analytics
    A-->>D: Impressions totales tous annonceurs
```

---

## 8. Staff Club — Utilisation locale

```mermaid
sequenceDiagram
    autonumber
    participant STAFF as 🏟️ Staff Club
    participant PHONE as 📱 Téléphone
    participant PI as 🔧 Raspberry Pi
    participant TV as 📺 TV

    Note over STAFF,TV: === CONNEXION LOCALE (pas d'internet requis) ===

    STAFF->>PHONE: Connexion WiFi "NEOPRO-CLUB"
    PHONE->>PI: http://neopro.local (mDNS)
    PI-->>PHONE: Page d'accueil Angular

    STAFF->>PHONE: Login local (code PIN)
    PHONE->>PI: POST /api/auth/login {pin}
    PI-->>PHONE: ✅ Session locale

    Note over STAFF,TV: === CONTRÔLE TV ===

    STAFF->>PHONE: Télécommande → Play vidéo
    PHONE->>PI: emit('remote_action', {action: 'play', video})
    PI->>TV: emit('play_video', {filename})
    TV->>TV: Video.js lecture
    TV-->>PI: emit('video_ended')

    STAFF->>PHONE: Changer catégorie
    PHONE->>PI: emit('remote_action', {action: 'category', id})
    PI->>TV: emit('update_playlist', {category})

    Note over STAFF,TV: === ADMIN LOCAL ===

    STAFF->>PHONE: http://neopro.local:8080
    PI-->>PHONE: Interface admin locale
    STAFF->>PHONE: Modifier config WiFi
    PHONE->>PI: POST /api/config/wifi {ssid, password}
    PI-->>PHONE: ✅ Config mise à jour
```

---

## 9. Matrice des accès — Vue synthétique

```mermaid
graph LR
    subgraph FEATURES["Fonctionnalités"]
        F1["👥 Users CRUD"]
        F2["💳 Abonnements"]
        F3["🖥️ Tous les sites"]
        F4["📤 Upload vidéo"]
        F5["🚀 Déploiement"]
        F6["⚡ Commandes"]
        F7["📊 Analytics"]
        F8["👁️ Vue sites assignés"]
        F9["📢 Mes vidéos pub"]
        F10["🏢 Multi-annonceurs"]
    end

    SA["🔑 super_admin"] --> F1
    SA --> F2
    SA --> F3
    SA --> F4
    SA --> F5
    SA --> F6
    SA --> F7

    ADM["👤 admin"] --> F3
    ADM --> F4
    ADM --> F5
    ADM --> F6
    ADM --> F7

    OP["🔧 operator"] --> F4
    OP --> F5
    OP --> F7
    OP --> F8

    VW["👁️ viewer"] --> F7
    VW --> F8

    ADV["📢 advertiser"] --> F9
    ADV --> F7

    AGY["🏢 agency"] --> F9
    AGY --> F10
    AGY --> F7

    style SA fill:#ffcdd2,stroke:#C62828
    style ADM fill:#ffe0b2,stroke:#E65100
    style OP fill:#fff9c4,stroke:#F57F17
    style VW fill:#e8f5e9,stroke:#2E7D32
    style ADV fill:#e3f2fd,stroke:#1565C0
    style AGY fill:#f3e5f5,stroke:#7B1FA2
```

---

_Dernière mise à jour : 10 février 2026_
