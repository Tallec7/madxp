# Diagramme de Sequence : Deploiement Video

> Flux complet : Upload Dashboard -> FTP/Supabase -> Deploy -> Pi -> Checksum

## Flux Complet End-to-End

```mermaid
sequenceDiagram
    autonumber
    participant Dash as Dashboard Angular
    participant API as Central Server API
    participant FTP as FTP Hostinger (prod)
    participant DB as PostgreSQL
    participant WS as Socket.IO Server
    participant Pi as Sync-Agent (Pi)
    participant FS as Filesystem Pi

    Note over Dash,FS: === PHASE 1 : UPLOAD VIDEO ===

    Dash->>API: POST /api/content/videos (multipart/form-data)
    Note right of API: multer: memory storage, single file

    API->>API: Validation MIME type + taille
    API->>API: SHA256(file_buffer) -> checksum
    API->>API: Generate unique filename

    API->>DB: INSERT INTO videos (filename, original_name, file_size,<br/>mime_type, checksum, upload_status='uploading')

    API->>FTP: uploadFileToFtpWithVerification(buffer, filename)
    FTP-->>API: Upload OK
    API->>API: Verification HTTP HEAD (taille fichier)
    Note right of API: storage_path = filename<br/>URL = FTP_PUBLIC_URL + filename

    API->>DB: UPDATE videos SET upload_status='ready',<br/>upload_verified_at=NOW(), upload_verified_size=$2
    API-->>Dash: 200 {video_id, filename, checksum}
```

## Phase 2 : Creation du Deploiement

```mermaid
sequenceDiagram
    autonumber
    participant Dash as Dashboard
    participant API as Central API
    participant VS as Verification Service
    participant DS as Deployment Service
    participant DB as PostgreSQL

    Note over Dash,DB: === PHASE 2 : CREATION DEPLOIEMENT ===

    Dash->>API: POST /api/content/deployments {videoId, targetType, targetId}

    API->>VS: checkUploadReadiness(videoId)
    VS->>DB: SELECT upload_status FROM videos WHERE id = $1
    DB-->>VS: {upload_status}

    alt upload_status = 'uploading'
        VS-->>API: BLOCKED — retry dans 30s
        API-->>Dash: 409 "Video en cours d'upload"
    else upload_status = 'verifying'
        VS-->>API: BLOCKED — retry dans 10s
        API-->>Dash: 409 "Verification en cours"
    else upload_status = 'failed'
        VS-->>API: BLOCKED
        API-->>Dash: 400 "Upload echoue, re-uploader"
    else upload_status = 'ready'
        VS-->>API: OK, proceed
    end

    API->>DS: createDeployment(videoId, targetType, targetId)

    DS->>DB: Fetch video metadata + checksum
    DS->>DB: Resolve target sites (direct ou via group)

    loop Pour chaque site cible
        DS->>DB: INSERT INTO content_deployments<br/>(video_id, site_id, status='pending', progress=0)
    end

    API-->>Dash: 200 {deploymentId, sites: [...]}
```

## Phase 2b : Short-circuit SaaS (v3.127.5+)

```mermaid
sequenceDiagram
    autonumber
    participant DS as Deployment Service
    participant DB as PostgreSQL

    Note over DS,DB: === PHASE 2b : SITE SaaS (pas de Pi) ===

    DS->>DS: getTargetSites() retourne siteType='saas'
    DS->>DS: Skip deployToSite() / sendOrQueue()
    Note right of DS: Les vidéos SaaS sont servies<br/>directement via URL FTP —<br/>aucun transfert physique nécessaire

    DS->>DB: UPDATE content_deployments<br/>SET status='completed', progress=100,<br/>completed_at=NOW()

    Note over DS,DB: Pas de commande queued,<br/>pas d'attente de Pi,<br/>pas d'alerte "bloqué"
```

## Phase 3 : Envoi vers le Raspberry Pi

```mermaid
sequenceDiagram
    autonumber
    participant DS as Deployment Service
    participant Q as Command Queue
    participant DB as PostgreSQL
    participant WS as Socket.IO Server
    participant Pi as Sync-Agent (Pi)
    participant Dash as Dashboard

    Note over DS,Dash: === PHASE 3 : ENVOI COMMANDE ===

    DS->>DS: Genere videoUrl publique
    Note right of DS: Detection auto :<br/>- Pas de / dans storage_path -> FTP URL<br/>- Avec / -> Supabase URL

    DS->>Q: queueCommand(siteId, 'deploy_video', {...})

    Q->>DB: INSERT INTO remote_commands (type='deploy_video',<br/>data={deploymentId, videoUrl, filename, category,<br/>checksum, sponsorId, ...}, status='pending')

    alt Site connecte
        Q->>WS: sendCommand(siteId, command)
        WS->>WS: pendingCommands.set(commandId, {timeout: 10min})
        WS-->>Pi: emit('command', {id, type: 'deploy_video', data})
        WS->>DB: UPDATE remote_commands SET status='executing'
        WS->>DB: UPDATE content_deployments SET status='in_progress'
    else Site hors ligne
        Note over DB: Commande en file d'attente<br/>Max 7 jours, traitee au reconnect
    end
```

## Phase 4 : Execution sur le Raspberry Pi

```mermaid
sequenceDiagram
    autonumber
    participant WS as Socket.IO Server
    participant Pi as Sync-Agent
    participant DV as deploy-video.js
    participant Net as HTTP Download
    participant FS as Filesystem Pi
    participant Cfg as configuration.json
    participant Dash as Dashboard

    Note over WS,Dash: === PHASE 4 : DEPLOIEMENT SUR LE PI ===

    Pi->>DV: execute(commandData)

    DV->>DV: 1. Verification checksum present
    alt Checksum manquant
        DV-->>Pi: Error 'CHECKSUM_REQUIRED'
        Pi-->>WS: emit('command_result', {status: 'error'})
    end

    DV->>FS: 2. mkdir -p videos/{category}/{subcategory}/
    DV->>DV: 3. Sanitize filename (chars illegaux, longueur)
    DV->>DV: 4. Ensure unique (append counter si doublon)

    DV->>Net: 5. Download video depuis videoUrl
    Note right of Net: Support resume (Range headers)<br/>Fichier temporaire: {path}.downloading<br/>Timeout: 10 minutes

    loop Progression du telechargement
        Net-->>DV: Chunk recu
        DV->>Pi: progressCallback(percent)
        Pi-->>WS: emit('deploy_progress', {deploymentId, progress: 0-100})
        WS->>DB: UPDATE content_deployments SET progress = $2
        WS->>Dash: io.to('dashboard').emit('deploy_progress')
    end

    Net-->>DV: Download complet
    DV->>FS: 6. Rename .downloading -> fichier final

    Note over DV,FS: === VERIFICATION INTEGRITE (CRITIQUE) ===

    DV->>FS: 7. SHA256(fichier telecharge) -> actualChecksum
    DV->>DV: Compare actualChecksum vs expectedChecksum

    alt Checksum MISMATCH
        DV->>FS: DELETE fichier corrompu
        DV-->>Pi: Error {expected, actual, message: 'Integrity check failed'}
        Pi-->>WS: emit('command_result', {status: 'error'})
        WS->>DB: UPDATE content_deployments SET status='failed'
        WS->>Dash: emit('deploy_failed', {deploymentId, reason: 'checksum'})
    end

    Note over DV,Cfg: === MISE A JOUR CONFIGURATION ===

    DV->>Cfg: 8. Load configuration.json
    DV->>Cfg: 9. Ajoute video a la categorie
    Note right of Cfg: {name, filename, path, type,<br/>locked: true, deployed_at,<br/>video_id, sponsor_id,<br/>analytics_category, expires_at}

    DV->>Cfg: 10. Write configuration.json
    DV->>Pi: 11. notifyLocalApp('config_updated')

    DV-->>Pi: {success: true, path, size, checksum, filename}
    Pi-->>WS: emit('command_result', {commandId, status: 'success', result})
    Pi-->>WS: emit('deploy_progress', {deploymentId, progress: 100, completed: true, deployedPath, deployedFilename})

    WS->>DB: UPDATE content_deployments SET status='completed', completed_at=NOW(), deployed_path=COALESCE($2,deployed_path), deployed_filename=COALESCE($3,deployed_filename)
    WS->>DB: UPDATE remote_commands SET status='completed'
    WS->>Dash: emit('command_completed', {commandId, siteId})
```

## Surveillance Post-Deploiement

```mermaid
sequenceDiagram
    autonumber
    participant VW as Video Watcher (Pi)
    participant SA as Sync-Agent
    participant WS as Socket.IO Server
    participant DB as PostgreSQL

    Note over VW,DB: === WATCHERS DETECTENT LE CHANGEMENT ===

    VW->>VW: Detecte nouveau fichier dans /videos/
    VW->>VW: Debounce 2 secondes
    VW->>SA: Trigger syncLocalState()
    SA->>SA: Scan videos/ recursif
    SA->>SA: Recalcul configHash
    SA->>WS: emit('sync_local_state', {videos[], configHash, storage})
    WS->>DB: UPDATE sites SET local_config_mirror = {_localVideos: [...]}

    Note over VW,DB: === EXPIRATION AUTOMATIQUE ===

    loop Toutes les heures
        SA->>SA: Scan configuration.json pour videos expirees
        alt Video avec expires_at < NOW()
            SA->>SA: Supprime entree du config
            SA->>SA: rm videos/category/filename.mp4
            SA->>SA: Write configuration.json
            SA->>WS: emit('sync_local_state', {videos updated})
        end
    end
```

## Chemins de Stockage

```
UPLOAD (Central)                    DOWNLOAD (Pi)
================                    ==============

Dashboard                           Sync-Agent
    |                                   |
    v                                   v
Central API                         HTTP GET videoUrl
    |                                   |
    +--> FTP Hostinger (PROD)           +--> /home/pi/neopro/
         path: filename.mp4                  videos/
         URL: https://kalonpartners            {category}/
              .bzh/neopro-video/                 {subcategory}/
              filename.mp4                         filename.mp4
                                            |
                                            +--> configuration.json
                                                 (video ajoutee)
```

## Resume Securite et Integrite

| Etape                    | Mecanisme       | Detail                                         |
| ------------------------ | --------------- | ---------------------------------------------- |
| Upload                   | SHA256          | Calcule sur le buffer avant stockage           |
| Stockage DB              | checksum column | SHA256 hex stocke dans `videos.checksum`       |
| Verification post-upload | HTTP HEAD       | Taille fichier verifiee apres FTP upload       |
| Gate de deploiement      | upload_status   | Bloque deploy si status != 'ready'             |
| Telechargement Pi        | Range headers   | Support resume si interruption                 |
| Verification Pi          | SHA256          | Recalcul complet, comparaison avec attendu     |
| Echec integrite          | Auto-delete     | Fichier corrompu supprime automatiquement      |
| Expiration               | Cron horaire    | Videos expirees supprimees du disque et config |
