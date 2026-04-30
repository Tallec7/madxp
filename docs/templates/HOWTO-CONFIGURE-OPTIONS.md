# HOWTO — Configurer un template JOUEUR (options + packshot pluggable)

> Guide pratique pour câbler un template JOUEUR Simple/But en options
> dynamiques + packshot pluggable, **sans toucher la DB en SQL direct**.
>
> S'appuie sur les API CRUD super_admin livrées en PR #775 :
>   - `POST/PATCH/DELETE /api/remotion-templates-studio/:id/options`
>   - `POST/GET/DELETE /api/remotion-templates-studio/:id/packshot-refs`

---

## 1. Pré-requis

- Compte super_admin Neopro
- Token JWT valide (login dashboard, copier depuis localStorage)
- Templates importés via `npm run template:import` (SPECs YAML)

```bash
export NEOPRO_API="https://central.neopro.fr/api"
export TOKEN="<ton JWT super_admin>"
export AUTH="Authorization: Bearer $TOKEN"
```

---

## 2. Configurer JOUEUR Simple — option `intro_mode` (logo OU numéro)

### 2.1 Créer l'option

```bash
curl -X POST "$NEOPRO_API/remotion-templates-studio/<JOUEUR_SIMPLE_UUID>/options" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{
    "key": "intro_mode",
    "label": "Intro",
    "type": "enum",
    "values": ["logo", "numero"],
    "default_value": "logo",
    "user_editable": true,
    "sort_order": 0
  }'
```

→ Réponse 201 : option créée.

### 2.2 Câbler les slots conditionnels

Les slots `logo-club` et `numero-intro` ont déjà leur `visible_if` rempli
par l'import SPEC. Si besoin de patch ad hoc :

```bash
# Toujours via SPEC YAML + npm run template:import (pas d'API direct sur les slots)
```

### 2.3 Vérifier côté user

Aller sur `/content/templates-remotion/<UUID>` → onglet user form Studio v2 → la section "Options" affiche le toggle Logo/Numéro → cliquer "numero" → le slot `logo-club` se masque + le slot `numero-intro` apparaît.

---

## 3. Configurer le packshot pluggable

### 3.1 Créer l'option `packshot`

```bash
curl -X POST "$NEOPRO_API/remotion-templates-studio/<JOUEUR_SIMPLE_UUID>/options" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{
    "key": "packshot",
    "label": "Packshot",
    "type": "enum",
    "values": ["generique", "img"],
    "default_value": "generique",
    "sort_order": 1
  }'
```

### 3.2 Mapper chaque valeur vers un template packshot

Hypothèse : tu as déjà importé 2 templates packshot (slugs `packshot-generique` et `packshot-img`), récupère leurs UUID.

```bash
# Mapping 1 : intro_mode logo + packshot generique → packshot-generique-uuid
curl -X POST "$NEOPRO_API/remotion-templates-studio/<JOUEUR_SIMPLE_UUID>/packshot-refs" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{
    "option_key": "packshot",
    "option_value": "generique",
    "packshot_template_id": "<PACKSHOT_GENERIQUE_UUID>",
    "start_at_ms": 1700,
    "z_index_offset": 100
  }'

# Mapping 2 : packshot img → packshot-img-uuid
curl -X POST "$NEOPRO_API/remotion-templates-studio/<JOUEUR_SIMPLE_UUID>/packshot-refs" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{
    "option_key": "packshot",
    "option_value": "img",
    "packshot_template_id": "<PACKSHOT_IMG_UUID>",
    "start_at_ms": 1700,
    "z_index_offset": 100
  }'
```

→ Désormais, un user qui clique "img" verra le packshot IMG empilé en surcouche au timecode 1700ms (= 1'10 @ 25fps), avec ses textes/images/numéro.

### 3.3 Vérifier côté render

```bash
curl -X POST "$NEOPRO_API/remotion-templates/<JOUEUR_SIMPLE_UUID>/render" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{
    "title": "Test JOUEUR",
    "props": {
      "variantId": "<variant-uuid>",
      "selectedOptions": { "intro_mode": "logo", "packshot": "img" },
      "textValues": { "prenom-nom": "Lise Le Priellec", "nom-club": "UCKNEF" },
      "imageUploads": { "logo-club": "https://.../logo.png", "photo-joueur": "https://.../photo.png" }
    }
  }'
```

→ Job 202 + suivi via `/render-jobs/:jobId`. Le MP4 final aura les couches du parent + couches du packshot IMG empilées au-dessus à partir de 1700ms.

---

## 4. Inspecter / nettoyer

```bash
# Lister les options d'un template
curl "$NEOPRO_API/remotion-templates-studio/<UUID>/options" -H "$AUTH"

# Lister les packshot refs
curl "$NEOPRO_API/remotion-templates-studio/<UUID>/packshot-refs" -H "$AUTH"

# Supprimer une option (cascade : ses visible_if côté slots restent — à patcher manuellement via SPEC re-import si besoin)
curl -X DELETE "$NEOPRO_API/remotion-templates-studio/<UUID>/options/<OPTION_UUID>" -H "$AUTH"

# Supprimer un packshot ref
curl -X DELETE "$NEOPRO_API/remotion-templates-studio/<UUID>/packshot-refs/<REF_UUID>" -H "$AUTH"
```

---

## 5. Codes d'erreur principaux

| HTTP | error code | Cause |
|---|---|---|
| 400 | `invalid_default_value` | `default_value` absent de `values` |
| 400 | `invalid_payload` | CHECK SQL violé (type / values JSONB type) |
| 400 | `self_reference` | packshot_template_id == template_id parent |
| 400 | `invalid_packshot_template` | packshot_template_id introuvable (FK violation) |
| 401 | — | Token JWT manquant ou expiré |
| 403 | — | Pas super_admin |
| 404 | — | Option / ref / template inconnu |
| 409 | `key_exists` | Une option avec cette `key` existe déjà sur ce template |
| 409 | `mapping_exists` | Mapping (option_key, option_value) déjà défini sur ce template |

---

## 6. Pourquoi cet HOWTO existe

L'API CRUD remplace le SQL direct utilisé jusqu'en PR #774 pour configurer
options + packshot refs. Permet à un super_admin de gérer la configuration
sans accès DB, avec validation Joi + observabilité via logs Winston.

UI graphique super_admin pour ces 2 opérations : **dette technique tracée
dans une issue séparée** — reste sur curl/Postman pour l'instant. C'est
un usage rare (config initiale d'un nouveau template puis statique).

Refs : PR #771 (DB), PR #773 (UI form options user), PR #774 (render
packshot composé), PR #775 (cette API CRUD).
