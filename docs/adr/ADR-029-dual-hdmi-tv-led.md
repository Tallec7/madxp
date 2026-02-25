# ADR-029 : Dual HDMI — Contenus Différenciés Écran Principal + Secondaire

| Champ      | Valeur                                                            |
| ---------- | ----------------------------------------------------------------- |
| Statut     | Accepté                                                           |
| Date       | 2026-02-21                                                        |
| Mis à jour | 2026-02-24 (renommage LED → Secondary Display, fix config-merge)  |
| Catégorie  | Edge / Display                                                    |
| Composant  | `raspberry`, `central-server`, `central-dashboard`                |
| Epic SAFe  | [E-22](../safe/FEATURES.md#e-22--contenus-différenciés-tv--led)   |
| Proposal   | [PROP-002](../proposals/PROP-002-tv-led-dual-output.md) (détails) |

## Contexte

Des clubs sportifs disposent d'un **écran principal** (TV, écran géant) et d'un **écran secondaire** (panneau LED bord de terrain, parc de TV tribunes chaînées en HDMI, moniteur vestiaires). Ils souhaitent des contenus différenciés sur chaque support depuis **un seul Raspberry Pi**.

> **Note renommage (2026-02-24)** : Le terme "LED" a été remplacé par "secondary display"
> dans tout le codebase car le HDMI secondaire n'est pas toujours un panneau LED — il peut
> s'agir de TV tribunes chaînées, d'un écran géant, etc. Voir migration
> `rename-led-to-secondary-display.sql`. Le watchdog et le sync-agent gèrent la
> rétrocompatibilité avec l'ancien format (`ledEnabled` → `secondaryDisplayEnabled`).

> **Bug critique corrigé (2026-02-24)** : `config-merge.js` ne gérait pas explicitement
> `secondaryDisplayEnabled` / `secondaryDisplayResolution`. Ces clés étaient silencieusement
> perdues lors du merge, empêchant l'activation de l'écran secondaire via le dashboard sur
> les Pi déployés. Fix : ajout du handling explicite + migration automatique des anciennes
> clés `ledEnabled` / `ledResolution`. Smoke test ajouté pour empêcher la régression.

Aujourd'hui le Pi n'utilise qu'un seul port HDMI (HDMI 0). Il n'existe pas de concept de type d'écran dans le modèle de données, ni de variantes vidéo par format.

**Lié à** : [ADR-008](./ADR-008-double-buffer-video-pi.md) (Double-Buffer Vidéo — contraintes GPU), [ADR-031](./ADR-031-master-slave-video-loop-sync.md) (Sync master-slave boucles vidéo)

## Décision

### 1. Dual kiosk Chromium natif via les 2 micro-HDMI du Pi 5

- **HDMI 0 → TV** : instance Chromium sur `/tv` (existant)
- **HDMI 1 → Secondaire** : instance Chromium sur `/secondary` (nouveau)
- Chaque instance a son `--user-data-dir` séparé → BroadcastChannel ne traverse pas → **Socket.IO** est le canal de communication unique
- `max_framebuffers=2` dans `config.txt`

### 2. Détection HDMI 1 par DRM/KMS (pas de force hotplug)

- `hdmi_force_hotplug:0=1` (TV, toujours forcé)
- **HDMI 1 NON forcé** par défaut — détection via `/sys/class/drm/card1-HDMI-A-2/status`
- Watchdog vérifie toutes les 30s : si `connected` et `secondaryDisplayEnabled=true`, lance le kiosk secondaire
- Fallback par site dans le dashboard : réactiver `hdmi_force_hotplug:1=1` si DRM échoue

**Pourquoi** : `hdmi_force_hotplug:1=1` force le Pi à toujours croire qu'un écran est branché, empêchant la détection dynamique. `tvservice` n'est plus disponible sur Pi 5 (KMS natif). DRM/KMS via sysfs est le mécanisme standard.

### 3. Réactions différenciées aux faits de jeu

Un seul événement Socket.IO est émis (score-update, command, breaking-news, phase-change). Chaque instance l'interprète selon son `displayType` :

| Événement       | TV (HDMI 0)               | Secondaire (HDMI 1)                 |
| --------------- | ------------------------- | ----------------------------------- |
| `score-update`  | Overlay popup + animation | Bandeau score compact + flash       |
| `command`       | Vidéo variante TV (16:9)  | Vidéo variante secondaire (bandeau) |
| `breaking-news` | Bandeau texte en overlay  | Texte pleine largeur intégré        |

La Remote reste inchangée — intelligence dans le récepteur, pas l'émetteur.

### 4. Système de variantes vidéo

Nouvelle table `video_variants` :

```sql
CREATE TABLE video_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  display_type VARCHAR(20) NOT NULL CHECK (display_type IN ('tv', 'secondary')),
  filename VARCHAR(500) NOT NULL,
  storage_path VARCHAR(1000) NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  width INTEGER,
  height INTEGER,
  UNIQUE(video_id, display_type)
);

ALTER TABLE sites ADD COLUMN secondary_display_enabled BOOLEAN DEFAULT false;
ALTER TABLE sites ADD COLUMN secondary_display_resolution VARCHAR(20);
```

Fallback : si pas de variante secondaire, la version TV est affichée avec `object-fit: cover`.

### 5. Pipeline de déploiement conditionnel

Le `content-deployment` filtre les vidéos par `display_type` selon la configuration du site. L'OTA inclut les paramètres `config.txt` pour le dual kiosk.

## Alternatives considérées

| Alternative                              | Verdict | Raison                                                 |
| ---------------------------------------- | ------- | ------------------------------------------------------ |
| Un seul HDMI splitté + scaler pour LED   | Rejeté  | Contenu identique, pas de différenciation              |
| Pi Compute Module avec 3+ sorties        | Rejeté  | Surcoût hardware, IO board custom, pas de HDMI natif   |
| LED via GPIO (HUB75, rpi-rgb-led-matrix) | Rejeté  | Résolution faible, conflits GPIO, qualité insuffisante |
| **Dual kiosk natif + variantes vidéo**   | Accepté | Seule solution répondant au besoin, 0 hardware Pi      |

## Conséquences

### Positives

- Contenus **vraiment adaptés** à chaque support (format, résolution, ratio)
- Score visible partout, formaté pour chaque type d'écran
- Combinable avec [PROP-001](../proposals/PROP-001-multi-tv-single-pi.md) : HDMI 0 → splitter → N TV, HDMI 1 → LED
- Un seul Pi gère TV + LED + Stramatel
- Modèle de variantes réutilisable pour futurs supports (totem vertical, écran tactile)

### Négatives

- **Performance GPU** : 2 décodages simultanés → Pi 5 obligatoire, vidéos max 1080p@30fps
- **Complexité upload** : opérateur doit fournir 2 versions par vidéo (ou génération auto future)
- **Stockage doublé** : 2 fichiers par vidéo (mitigé par taille LED plus petite)
- **RAM** : +150 MB pour le 2e Chromium (OK sur Pi 5 4GB/8GB)

### Risques (ROAM)

| Risque                             | Type     | Mitigation                                                     |
| ---------------------------------- | -------- | -------------------------------------------------------------- |
| GPU surchargé 2 flux               | Resolved | Pi 5 obligatoire, vidéos 1080p max, monitoring                 |
| DRM/KMS instable sur Pi 5          | Accepted | Fallback `hdmi_force_hotplug:1=1` par site                     |
| Résolution secondaire non standard | Owned    | Config par site via dashboard (`secondary_display_resolution`) |
| Contrôleur LED incompatible        | Accepted | Spike enabler F-22.0 valide les modèles cibles                 |

## Références

- [PROP-002](../proposals/PROP-002-tv-led-dual-output.md) — Spécification technique détaillée (architecture, watchdog, code, schémas)
- [E-22 Features & US](../safe/FEATURES.md#e-22--contenus-différenciés-tv--led) — Backlog SAFe
- [ADR-008](./ADR-008-double-buffer-video-pi.md) — Double-Buffer Vidéo Pi (contraintes GPU)
- `raspberry/scripts/kiosk-watchdog.sh` — Watchdog à modifier
- `raspberry/src/app/components/tv/tv.component.ts` — TvComponent (goal animation, handleCommand)

---

_Créé le 21 février 2026_
