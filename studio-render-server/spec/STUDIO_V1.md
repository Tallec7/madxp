# Studio Templates Clubs — V1

> **Périmètre strict 4-5 semaines, dev seul.**
> Ce doc est un plan d'exécution. Toute proposition d'ajout = candidate V2/V3, pas patch V1.

---

## 0. Contexte (pour cold reader)

**Codebase cible** : centrale Neopro (`/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro`)

- Stack : Express + TypeScript strict + pg + repository pattern (ESLint enforced) + Winston + Angular 20 dashboard
- Conventions : voir `CLAUDE.md` + `.claude/rules/templates.md`
- Pas de Redis aujourd'hui (donc pas de BullMQ)

**Sandbox de référence** : `/Users/gletallec/Documents/NEOPRO/studio-template/`

- `batch/batch.ts` : pipeline rembg + Remotion utilisé pour la session NLF (60 vidéos). Source des patterns `withRetry` Chromium et `@remotion/renderer` programmatique.
- `templates-remotion/src/JoueurButGeneriqueV1.tsx`, `JoueurEntreeGenerique.tsx`, `FaitsDeJeu2Min.tsx` : les 3 templates à porter en V1.

**Pourquoi un nouveau système en parallèle (pas une extension de l'existant)** :

- L'existant (`remotion_templates / template_layers / ...` + `TemplateRuntime.tsx` + ADR-075/077/084/086/087/095) implémente une philosophie data-driven (rows DB + moteur générique unique).
- Décision tranchée : pour la cible 10 templates, data-driven est sur-ingéniéré (9 ADR consacrés au moteur, complexité admin UX, velocity faible). On repart sur du code-driven (1 `.tsx` + 1 `manifest.json` co-localisés par template).
- L'ancien système reste en prod pour les 3 templates actifs (BUT Simple, BUT Img Joueur, Faits de Jeu V1). Le nouveau vit en parallèle sans dépendance (cf risque #1).

**Cible** : 10 templates en prod sous 12 mois (3 V1 + 7 V2/V3).

**Vision long terme** : voir `STUDIO_VISION.md` (le doc précédent étendu, gardé comme référence post-V1).

---

## 1. Objectif V1

Une nouvelle page Angular dans la centrale Neopro où un opérateur :

1. Choisit un template parmi 3 (BUT, ENTREE, FAITS DE JEU)
2. Remplit un formulaire auto-généré
3. Voit une preview Remotion Player
4. Lance un rendu cloud → reçoit un MP4 sur FTP

**Critère de succès V1 (fin semaine 5)** : un opérateur Neopro crée 3 vidéos de 3 templates différents pour 1 club test, brandées (couleurs/logo), avec photo de joueur détourée auto, sans toucher au code.

---

## 2. Hors-scope explicite

À ne PAS implémenter en V1 (et donc à ne pas pré-câbler) :

- ❌ Workflow d'approbation (state machine, RBAC reviewer/editor) → V2
- ❌ Variantes auto multi-format (1 format par template V1) → V2
- ❌ Connecteur réseaux (Buffer, Meta) → V2
- ❌ Sponsor slots (le système Neopro existant `docs/specs/features/sponsors.spec.md` sera branché en lecture **quand un template V2 en aura besoin**, pas avant) → V2
- ❌ Scenarios / Match-day / Prod en masse événementielle → V3
- ❌ Recettes composites (1 saisie → N renders) → V3
- ❌ Caption AI → V2/V3
- ❌ Éditeur no-code → V3+
- ❌ Billing counters → ajouter quand la facturation est activée
- ❌ Multi-saison historique, A/B testing, app mobile → indéfini
- ❌ Colonne nullable `parent_id` / `scenario_id` "pour plus tard" → refactor explicite V1.5 quand on saura ce qu'est un Scenario

---

## 3. Stack — alignement Neopro existant

| Couche         | Choix                                                                                       | Justification                                                                                                                                                                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Framework API  | **Express** (existant)                                                                      | Pas de NestJS. Pas de 2e framework.                                                                                                                                                                                                                                                                                            |
| Accès DB       | **pg + repository pattern** (existant, ESLint enforced)                                     | Pas de Prisma. Pas de 2e ORM.                                                                                                                                                                                                                                                                                                  |
| Queue          | **Table `render_requests` PG-pollée** (ou `pg-boss` si besoin)                              | Pas de Redis. Pas de BullMQ.                                                                                                                                                                                                                                                                                                   |
| Logging        | **Winston** (existant)                                                                      | Conventions Neopro.                                                                                                                                                                                                                                                                                                            |
| Auth           | **Réutilisation de l'auth Neopro**                                                          | Middleware `central-server/src/middleware/auth.ts:227-252`. `req.user.site_id` (JWT payload) = tenant. `req.user.id` = userId stable.                                                                                                                                                                                          |
| Storage        | **FTP existant** (`central-server/src/config/ftp-storage.ts`)                               | Helpers `uploadFileToFtpFromDisk()` + `uploadFileToFtpWithVerification()` (retry + check size). URL publique via `getFtpPublicUrl()` → `https://kalonpartners.bzh/neopro-video/{path}`. Pas de CDN, pas de signed URL (cf risque RGPD #8).                                                                                     |
| Worker rendu   | **Même process Railway que la centrale, nouveau fichier `studio-render-worker.service.ts`** | Tranché S0. Pas de 2e service Railway (surcoût inutile à 1-10 renders/jour). Pas de greffe sur `remotion-render-worker.service.ts` legacy (couplage data-driven contredit le risque #1). Nouveau fichier, poll `render_requests`, bundle cache + withRetry réimplémentés à partir du sandbox `batch.ts` (pas d'import legacy). |
| Front          | **Angular**, nouvelle page `/templates-studio`                                              | Aucune dépendance vers `TemplateRuntime.tsx` ou tables `remotion_templates / template_layers / ...`.                                                                                                                                                                                                                           |
| Forms auto-gen | **Angular Reactive Forms + mini-générateur custom (~150 lignes)**                           | Tranché S0. Pas de `@ngx-formly` (3 deps lourdes pour 3 templates V1). Formly redevient candidat V2 si on dépasse ~10 templates avec schemas variés.                                                                                                                                                                           |
| Render         | **`@remotion/renderer` programmatique** (`bundle()` 1×, `renderMedia()` N×)                 | Tranché S0. Pas de Remotion CLI. Le sandbox `batch.ts` valide déjà ce pattern (~3-5× plus rapide à volume).                                                                                                                                                                                                                    |
| Détourage      | **Container Python séparé pour rembg**                                                      | Tranché S0. Pas de coloc avec le worker Remotion (Python 3.11 + BiRefNet 170 Mo vs Node + Chromium → Dockerfile multi-stage cauchemardesque).                                                                                                                                                                                  |

---

## 4. Modèle de données — 4 tables

```sql
-- Catalogue templates (alimenté par le code, pas par UI en V1)
CREATE TABLE template_definitions (
  id                       UUID PRIMARY KEY,
  slug                     TEXT UNIQUE NOT NULL,
  version                  TEXT NOT NULL,
  manifest_json            JSONB NOT NULL,
  remotion_composition_id  TEXT NOT NULL,
  is_active                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Demandes de rendu (= 1 ligne par MP4 généré)
CREATE TABLE render_requests (
  id           UUID PRIMARY KEY,
  site_id      UUID NOT NULL REFERENCES sites(id),
  template_id  UUID NOT NULL REFERENCES template_definitions(id),
  props_json   JSONB NOT NULL,        -- payload résolu (après cascade brand kit)
  status       TEXT NOT NULL,         -- 'queued' | 'rendering' | 'ready' | 'failed'
  output_url   TEXT,                  -- URL FTP du MP4 final
  error_msg    TEXT,
  created_by   UUID NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX render_requests_status_idx ON render_requests(status) WHERE status IN ('queued','rendering');
CREATE INDEX render_requests_site_idx ON render_requests(site_id, created_at DESC);

-- Identité visuelle par club (1-1 avec sites)
CREATE TABLE site_brand_kits (
  site_id       UUID PRIMARY KEY REFERENCES sites(id),
  colors_json   JSONB NOT NULL DEFAULT '{}'::jsonb,    -- {primary, secondary, accent}
  logos_json    JSONB NOT NULL DEFAULT '{}'::jsonb,    -- {primary, mono_light, mono_dark}
  fonts_json    JSONB NOT NULL DEFAULT '{}'::jsonb,    -- {display, body}
  sponsors_json JSONB NOT NULL DEFAULT '{}'::jsonb,    -- lecture site_sponsors en V2, vide V1
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bibliothèque joueurs
CREATE TABLE players (
  id                UUID PRIMARY KEY,
  site_id           UUID NOT NULL REFERENCES sites(id),
  prenom            TEXT NOT NULL,
  nom               TEXT NOT NULL,
  numero            INT,
  poste             TEXT,
  photo_raw_url     TEXT,             -- FTP, upload brut
  photo_cutout_url  TEXT,             -- FTP, après rembg
  cutout_status     TEXT NOT NULL,    -- 'pending' | 'processing' | 'ready' | 'failed'
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX players_site_idx ON players(site_id);
```

**Note tenant** : la table Neopro est `sites` (pas `clubs`). `site_name` + `club_name` y co-existent (le second n'est qu'un libellé d'affichage). Toutes les FK pointent vers `sites(id)`. Le code utilise `site_id` partout (`req.user.site_id` via JWT).

---

## 5. Manifest de template — contrat déclaratif

Chaque template vit dans `templates-remotion/src/templates/<slug>/` avec **deux fichiers** co-localisés :

```
templates-remotion/src/templates/but_generique/
  Composition.tsx          ← Remotion compo (existante, à porter)
  manifest.json            ← contrat déclaratif
```

Forme minimale du `manifest.json` V1 :

```json
{
  "id": "but_generique",
  "version": "1.0.0",
  "label": "BUT - Générique",
  "inputSchema": {
    "type": "object",
    "required": ["scorerPlayerId", "minute"],
    "properties": {
      "scorerPlayerId": { "type": "string", "ref": "Player" },
      "minute": { "type": "integer", "minimum": 1, "maximum": 130 },
      "assistPlayerId": { "type": "string", "ref": "Player" }
    }
  },
  "bindings": {
    "scorerName": { "source": "input.scorerPlayerId", "transform": "player.fullName" },
    "scorerNumber": { "source": "input.scorerPlayerId", "transform": "player.number" },
    "scorerPhoto": { "source": "input.scorerPlayerId", "transform": "player.cutoutUrl" },
    "minute": { "source": "input.minute" },
    "clubLogo": { "source": "brandKit.logos.primary" },
    "primaryColor": { "source": "brandKit.colors.primary" }
  },
  "format": { "width": 1080, "height": 1920 },
  "compositionId": "ButGeneriqueStory"
}
```

**V1 = 1 format par template** (pas de matrice formats[]). Le manifest portera `formats[]` plus tard, V2.

**Pas de `slots`** en V1 (réservé V2 pour sponsors).

**Pas de `languages[]` / `translatableFields[]`** en V1 (FR uniquement).

**Le manifest est versionné, lu au boot de l'API** : un script de seed lit tous les `manifest.json` du dossier `templates/` et upsert dans `template_definitions`. Pas de table-de-vérité dans la DB pour le manifest.

**Règle de versioning (à appliquer dès le 1er template porté)** :

- Une fois un manifest livré en prod, **on ne change jamais un binding existant**. On en ajoute un nouveau et on déprécie l'ancien.
- Un breaking change (rename binding, changement de format, refacto compo) = **bump version + nouveau slug** (`but_generique` → `but_generique_v2`). Les renders passés (qui pointent vers `template_id`) restent reproductibles.
- **Effet de bord FK à respecter** : quand on bump un slug, on **ne supprime jamais** l'ancienne row dans `template_definitions` (sinon les FK depuis `render_requests.template_id` cassent). On la passe simplement en `is_active = false` pour la retirer de l'UI de création, mais elle doit rester en DB indéfiniment pour les renders historiques.
- À documenter dans la doc de portage livrée en S5.

---

## 6. Plan de dev — 5 semaines séquentielles

À la fin de chaque semaine il doit y avoir quelque chose à montrer.

### Semaine 1-2 — Fondations + 1 template porté (BUT)

**Livrables (côté code Neopro `central-server/src/`)** :

- Migration SQL des 4 tables (avec FK `sites(id)`)
- Nouveaux fichiers (top-level, conventions Neopro plates) :
  - `repositories/templates-studio.repository.ts` (templates + render_requests + brand-kits + players)
  - `services/templates-studio.service.ts` (logique métier, résolveur cascade)
  - `services/studio-render-worker.service.ts` (poll + render, **aucun import legacy**)
  - `controllers/templates-studio.controller.ts`
  - `routes/templates-studio.routes.ts`
  - `validators/templates-studio.validator.ts`
  - `__tests__/smoke/templates-studio.smoke.test.ts` (test smoke obligatoire pour chaque `.service.ts`)
- Endpoint `POST /render-requests` (Express + repository pattern)
- Endpoint `GET /render-requests/:id` (suivi statut)
- Endpoint `GET /templates` (lecture seed depuis manifests)
- Script seed manifests : scan `templates-remotion/src/templates/*/manifest.json` → upsert
- Worker poll `render_requests` PG (boucle simple : `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1`, même pattern que le worker legacy mais nouveau fichier)
- Worker utilise **`@remotion/renderer` programmatique** : `bundle()` au boot (1 fois, cache en mémoire), `renderMedia()` par job → upload FTP via `uploadFileToFtpWithVerification()` (path `renders/{YYYY-MM}/{uuid}.mp4`) → met à jour `output_url + status='ready'`
- **`withRetry` sur erreurs Chromium transitoires** (à réimplémenter à partir du sandbox `batch.ts`, **pas d'import legacy**) : `ERR_NETWORK_CHANGED`, `Could not extract frame from compositor`, `Request closed`, `socket hang up`, `ECONNRESET` → 3 tentatives avec backoff exponentiel avant de passer en `failed`. Sans ça, ~5-10% de fails définitifs.
- **Template BUT porté** : `.tsx` co-localisé + `manifest.json`
- **Bundle Remotion dual** : compositions exposées pour le Remotion Player web ET le worker Node (cf §8 risque #2)
- Page Angular `/templates-studio` shell : liste templates (1 seul à ce stade) + form auto-gen (Reactive Forms + mini-générateur custom lisant `manifest.inputSchema`) + preview Remotion Player + bouton "Lancer"

**Critère de succès S2** : depuis l'UI, créer un render → MP4 récupérable sur FTP en **<3 min** (cible à affiner après mesure réelle worker Railway en S0 — cf §11 DoD non-fonctionnelle).

### Semaine 3 — Brand Kit minimal

**Livrables** :

- Endpoint `GET/PUT /sites/:siteId/brand-kit`
- Page Angular "Brand Kit" : color picker (3 couleurs), upload logo principal, choix font display/body
- **Service `Resolver`** (back) : prend `(template.manifest.bindings, input.props, brandKit)` → retourne le payload final injecté à Remotion
- Cascade implémentée : `input override < brand kit < manifest defaults`
- Le template BUT consomme `brandKit.colors.primary` et `brandKit.logos.primary` via le résolveur

**Critère de succès S3** : changer la couleur primaire du club test → le BUT généré ensuite a la nouvelle couleur, sans toucher au TSX.

### Semaine 4 — Roster joueurs + détourage async

**Livrables** :

- Endpoints `GET/POST/PUT /sites/:siteId/players` + upload photo brute
- Worker rembg : **container Python séparé** (Python 3.11 + BiRefNet) tournant sur Railway, distinct du worker Remotion
- Polling `players WHERE cutout_status='pending'` → traite → met à jour `photo_cutout_url + cutout_status='ready'`
- Paths FTP : `players/{site_id}/{player_id}-raw.{ext}` (upload brut) et `players/{site_id}/{player_id}-cutout.png` (après rembg)
- Page Angular "Joueurs" : grille, ajout joueur, upload photo, badge statut détourage
- **Widget custom "PlayerPicker"** (composant Angular Reactive Forms) : sélecteur joueur dans le form auto-gen quand `inputSchema.properties.X.ref === "Player"`
- Le template BUT utilise le PlayerPicker pour `scorerPlayerId` → photo détourée injectée auto

**Critère de succès S4** : ajouter un joueur avec photo brute → détourage auto en <60s → utilisable dans le form BUT en 2 clics.

### Semaine 5 — Porter ENTREE + FAITS DE JEU + recette

**Livrables** :

- Template ENTREE porté (`.tsx` + `manifest.json`)
- Template FAITS DE JEU porté (`.tsx` + `manifest.json`)
- Validation : créer 1 render de chaque template pour le club test
- Documentation interne de portage (~1 page) pour le prochain dev qui ajoutera un template
- README dans `templates-remotion/src/templates/` qui explique la structure

**Critère de succès S5** : 3 templates en prod interne Neopro, 1 club test brandé, démo fonctionnelle de bout en bout.

**Coupures possibles** :

- Couper à S2 → démo MVP technique
- Couper à S3 → démo brandée
- Couper à S4 → démo end-to-end avec joueurs réels (vrai début de valeur)
- Couper à S5 → V1 complète

---

## 7. Architecture — vue technique

```
┌────────────────────────────────────┐
│  Angular - Page /templates-studio  │
│  - Liste templates                 │
│  - Form auto-gen (manifest)        │
│  - Remotion Player web (preview)   │
│  - Brand Kit / Joueurs (onglets)   │
└────────────────┬───────────────────┘
                 │ REST
┌────────────────▼───────────────────┐
│  Express API (Neopro centrale)     │
│  - /templates                      │
│  - /render-requests                │
│  - /sites/:id/brand-kit            │
│  - /sites/:id/players              │
│  - ResolverService (cascade)       │
│  - Auth middleware (site_id JWT)   │
│  - studio-render-worker            │  ← in-process
└────────────────┬───────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
   ┌────▼─────┐    ┌──────▼──────┐
   │ Postgres │    │ Container   │
   │ Neopro   │    │ rembg       │  ← service Railway séparé
   │          │    │ (Python +   │
   │ render_  │    │  BiRefNet)  │
   │ requests │    └──────┬──────┘
   └──────────┘           │
        └────────┬────────┘
                 │
          ┌──────▼──────┐
          │ FTP storage │
          └─────────────┘
```

**Polling intervalles V1** : 2s pour `render_requests`, 5s pour `players.cutout_status='pending'`. Suffisant pour le volume V1.

**Bundle Remotion dual** : le projet `templates-remotion/` build 2 cibles :

- `dist/web/` (Vite, pour `@remotion/player` embarqué dans Angular)
- `dist/server/` (esbuild, pour le worker Node qui appelle `@remotion/renderer`)

Les compositions partagent les mêmes `.tsx`. Les helpers d'asset (`staticFile()` vs `path.resolve()`) sont abstraits derrière une fonction `asset(name)` qui lit `import.meta.env.MODE` ou équivalent.

---

## 8. Risques V1

| #     | Risque                                                                                                                                                                                               | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | **Dépendance accidentelle au `TemplateRuntime.tsx` existant ou aux tables `remotion_templates / template_layers / template_text_fields`** → on porte la dette du data-driven dans le nouveau système | Smoke test CI : `grep -rE "TemplateRuntime\|remotion_templates\|template_layers\|template_text_fields" templates-remotion/src/templates/` doit retourner vide. Les nouveaux templates V1 vivent dans `templates-remotion/src/templates/<slug>/` (§5). Les anciens `.tsx` à plat dans `templates-remotion/src/` (`ButSimple.tsx`, `JoueurButGeneriqueV1.tsx`, etc.) seront challengés en S5 : garder ce qui sert de référence visuelle, supprimer le reste. Validation à chaque PR. |
| **2** | **Bundle Remotion dual web+server sous-estimé**                                                                                                                                                      | Réserver 3-5j dans la semaine 1-2 pour la plomberie : Vite pour web, esbuild pour server, abstraction `asset()`, polyfills `staticFile()`. Si ça déborde, on annonce le slip dès S2.                                                                                                                                                                                                                                                                                               |
| 3     | Auth Neopro pas réutilisable proprement                                                                                                                                                              | À clarifier obligatoirement en semaine 0 (cf §9). **Pas de fallback JWT autonome** — créer un 2e système auth = dette permanente. Si non clarifié S0 → block S1, escalade.                                                                                                                                                                                                                                                                                                         |
| 4     | Volume worker insuffisant pour le rendu                                                                                                                                                              | V1 = volume très faible (1-10 renders/jour interne). Pas un risque V1.                                                                                                                                                                                                                                                                                                                                                                                                             |
| 5     | Photo brute mal détourée par rembg                                                                                                                                                                   | Doc utilisateur : conditions de shoot (fond uni, lumière). Bouton "re-détourer" en V2.                                                                                                                                                                                                                                                                                                                                                                                             |
| 6     | Manifest trop rigide pour templates futurs                                                                                                                                                           | Acceptable V1 — 3 templates connus. Élargissement V2 piloté par usage réel.                                                                                                                                                                                                                                                                                                                                                                                                        |
| 7     | Multi-tenant `site_id` injection oubliée sur une route                                                                                                                                               | Middleware Express obligatoire (`req.user.site_id` du JWT) + tests d'autorisation sur chaque endpoint (`__tests__/smoke/`).                                                                                                                                                                                                                                                                                                                                                        |
| **8** | **RGPD photos joueurs sur FTP public** : `https://kalonpartners.bzh/neopro-video/players/...` sans signed URL ni auth. Risque accru pour clubs jeunes (mineurs).                                     | V1 : doc consentement utilisateur (case à cocher lors de l'ajout joueur, mention "photo publique"). V2 obligatoire : endpoint proxy authentifié OU signed URLs FTP. À ne pas oublier dans le go-live interne.                                                                                                                                                                                                                                                                      |

---

## 9. Décisions S0 — issues du Q&A dev Neopro

Sous-ensemble figé après échange S0. Toutes les questions bloquantes sont résolues — ce §9 est la référence à consulter pendant l'implémentation.

### Auth & tenant

- **Tenant key** : `site_id` (pas `club_id`). La table métier Neopro est `sites` (`full-schema.sql:965`), pas `clubs`. `club_name` y est un libellé d'affichage.
- **Middleware auth** : `central-server/src/middleware/auth.ts:227-252` réutilisé tel quel. Injecte `req.user` (interface `JwtPayload` `auth.ts:17-25` : `{ id, email, role, advertiser_id?, sponsor_id?, agency_id?, site_id? }`).
- **userId stable** : `req.user.id`.
- **FK** : toutes les tables V1 référencent `sites(id)`.

### Storage FTP

- **Host** : `72.60.93.193` (IP, pas DNS — limitation Hostinger). User `u406531085.videos`. Credentials dans `central-server/src/config/ftp-storage.ts`. Compte pré-positionné sur `/neopro-video`.
- **Helpers à utiliser** : `uploadFileToFtpFromDisk()` + `uploadFileToFtpWithVerification()` (retry + check size). **Ne pas réimplémenter.**
- **Paths V1** :
  - Renders : `renders/{YYYY-MM}/{uuid}.mp4`
  - Photos joueurs : `players/{site_id}/{player_id}-raw.{ext}` et `players/{site_id}/{player_id}-cutout.png`
- **URL publique** : `getFtpPublicUrl()` → `https://kalonpartners.bzh/neopro-video/{path}`. Base = env `FTP_PUBLIC_URL`. **Pas de CDN, pas de signed URL** (cf risque #8 RGPD).

### Infra Railway

- **Workspace** : unique, existant. Builder `central-server/Dockerfile`, healthcheck `/live`, config `railway.json`.
- **Container Remotion existant** : pattern `bundle()` + `renderMedia()` + poll PG déjà en prod (`central-server/src/services/remotion-render-worker.service.ts` sur `remotion_render_jobs`). **Pas de réutilisation directe** — risque #1 (couplage data-driven). Nouveau fichier `studio-render-worker.service.ts`, **même process Railway** (pas de 2e service Railway). Pattern réimplémenté (poll, bundle cache, withRetry) à partir du sandbox `batch.ts`.
- **Postgres depuis worker** : pool partagé via `central-server/src/config/database.ts:77` (PgBouncer Transaction Mode port 6543). `DB_POOL_MAX=10` par défaut. ✅ réutilisable.

### Conventions code

- **Naming dirs** : **pas de `features/`**. Top-level dirs plats Neopro : `controllers/`, `services/`, `repositories/`, `routes/`, `validators/`, `middleware/`. Fichiers : `templates-studio.controller.ts`, `templates-studio.service.ts`, `templates-studio.repository.ts`, `studio-render-worker.service.ts`, `templates-studio.routes.ts`, `templates-studio.validator.ts`.
- **Tests** : Jest + ts-jest, fichiers `*.test.ts`. Setup `src/__tests__/setup.ts`. Smoke obligatoire dans `__tests__/smoke/*.test.ts` pour **chaque `.service.ts`** (règle `smoke-service-test-coverage` enforced). Pas de threshold global hors garde-fou `coverageThreshold.functions: 41` (`.claude/rules/testing.md`).
- **Logger** : Winston. Pour routes Express : `getRequestLogger()` (auto correlationId/userId/userEmail/userRole). Pour worker : `createContextLogger({ component: 'studio-render', request_id, template_id, site_id })`. Transport Logtail en prod, pas de fichier.
- **Alerting** (ADR-051 + ADR-111) : `central-server/src/services/alerting.service.ts` + `alerting-checks.service.ts` + `alerting-notifier.service.ts`. **Toute alerte doit passer par `alertRepository.create()`** (dédup centralisée sur `(site_id, alert_type, status='active')`). V1 : brancher un check qui appelle `alertRepository.create({ site_id, alert_type: 'studio_render_failed', ... })` quand `render_requests` a des `status='failed'` sur la dernière heure.

### Sponsors (lecture seule V1, écriture V2)

- **Repository existant** : `central-server/src/repositories/site-sponsor.repository.ts`. Interface `SiteSponsorRow` : `{ id, site_id, name, contact_*, logo_url, contract_amount, contract_start, contract_end, status: 'active'|'expired'|'paused', metadata }`. Spec : `docs/specs/features/sponsors.spec.md`.
- **V1** : `site_brand_kits.sponsors_json` reste vide. Aucun fil tiré.
- **V2** : le résolveur lira `siteSponsorRepository.findActiveBySite(siteId)` quand un template V2 déclarera un `slot` sponsor dans son manifest.

---

## 10. Question ouverte qui impacte V2 (pas V1)

**Tes 10 templates cibles, c'est 10 archétypes ou 10 variantes ?**

- **10 archétypes** (BUT, CARTON, ENTREE, COMPO, RÉSULTAT, MOTM, ANNIV, SHOOTING, RAPPEL MATCH, FIN DE SAISON) → V2 doit prioriser la **DX de portage** d'un nouveau `.tsx + manifest.json`. Outils : scaffolder CLI, doc de portage, tests de manifest.
- **10 variantes** (BUT v1 sobre, BUT v2 cinéma, BUT v3 minimaliste...) → V2 doit prioriser **un pattern `variants` dans le manifest** : 1 template, N rendus visuels paramétrés. Le résolveur sélectionne la variante au moment du render.

Réponse demandée avant de figer V2.

---

## 11. Définition de "fait" V1

V1 est livrée quand TOUS les critères suivants sont vrais :

- [ ] 3 templates portés (BUT, ENTREE, FAITS DE JEU) avec leur `manifest.json`
- [ ] Page `/templates-studio` accessible depuis la centrale, derrière l'auth existante
- [ ] Création d'un render depuis l'UI → MP4 sur FTP en **<3 min** (cible affinée S0 après benchmark worker Railway)
- [ ] Brand Kit fonctionnel : changer une couleur impacte le prochain render
- [ ] Roster joueurs : ajouter un joueur avec photo → utilisable dans un template en <2 min total
- [ ] Smoke test "no legacy import" passe en CI
- [ ] 1 club test Neopro a sa Brand Kit + 5 joueurs + 3 renders publiés en interne
- [ ] Doc de portage d'un nouveau template écrite (~1 page)
- [ ] Pas de table polysémique (pas de `parent_id` "pour plus tard")
- [ ] Pas de RBAC, pas de state machine, pas de Buffer, pas de sponsors écrits, pas de Redis

### DoD non-fonctionnelle (à ne pas négliger)

- [ ] **Observabilité worker** : logs Winston via `createContextLogger({ component: 'studio-render', request_id, template_id, site_id, duration_ms })` + métrique `render_duration_seconds` exposée
- [ ] **Alerting** : `alertRepository.create({ site_id, alert_type: 'studio_render_failed', ... })` déclenché quand `render_requests WHERE status='failed' AND created_at > NOW() - INTERVAL '1 hour'` non vide (notifier ADR-111)
- [ ] **Budget infra** : coût Railway **< 30 €/mois** marginal pour le studio (worker in-process centrale + container rembg séparé), mesure réelle après 1 semaine de prod interne
- [ ] **Benchmark render** : temps médian + p95 mesurés et documentés (impacte le critère `<3 min` ci-dessus)
- [ ] **Retries** : taux de fail définitif `< 1%` après `withRetry` (mesure sur 100 renders)
- [ ] **RGPD consentement photo** : case à cocher "photo publique" au moment de l'ajout d'un joueur, mention claire de l'URL FTP publique non-protégée (cf risque #8)

Tout le reste = V2 ou plus tard.
