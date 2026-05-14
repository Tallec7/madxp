# ADR-121 : Fix drift pipeline `video_variants` — pré-requis advertiser cross-site avec variants

**Date** : 2026-05-14
**Statut** : Proposé (stub, à instruire quand un cas advertiser cross-site avec variants est concrètement vendu)
**Décideurs** : Daisy
**Référence amont** : ADR-120 (§1 matrice ownership — `video_variants` marqué cloud-owned dépendant de ce fix)

---

## Contexte

La table `video_variants` (cloud-side) devait permettre à un annonceur d'uploader UNE vidéo master (ex. "Coca 30s" en 16:9) et de fournir N variants recadrés (LED 3:1, multi-screen, etc.) qui se déploient automatiquement sur les bons displays de N Pi clients sponsorisés.

**État actuel** : la feature **n'a jamais marché en prod**. ~2 rows en 6+ mois dans `video_variants`. Mémoire `feedback_variant_pipeline_drift` identifie **3 bugs empilés** :

1. **Table `video_variants` aspirationnelle** : la majorité des "variants" LED en prod sont uploadés comme masters séparés (rows `videos` distinctes), pas comme variants d'un master existant.
2. **`generateUniqueFilename _N` orphelins** : à chaque re-upload (replace vidéo), le filename reçoit un suffixe `_N` qui décorrèle le variant du master.
3. **`restoreSecondaryVariants` Pi-side** : le sync-agent Pi préserve les variants secondaires obsolètes du filesystem au lieu de les nettoyer à la suppression du master cloud.

### Impact actuel

- **Cas advertiser SANS variants** (Coca master 16:9 sur 30 Pi qui ont des TV 16:9) : **fonctionne** indépendamment de ce drift. Master FTP push → Pi pull → joué partout.
- **Cas advertiser AVEC variants** (Coca master + Coca LED sur 30 Pi qui ont chacun TV 16:9 + bandeau LED) : **cassé**. Les variants LED ne se dispatchent pas correctement, les bandeaux affichent le master tronqué.

### Pourquoi ce fix est isolé d'ADR-120

ADR-120 traite l'**ownership** des données entre Pi et cloud. Le pipeline variants est un **chantier d'implémentation** indépendant : il fonctionne 100 % cloud→Pi (pas de push-back Pi requis), et son fix concerne la logique métier (linkage master/variant, naming, cleanup), pas l'architecture de sync.

Mélanger les deux ferait grossir ADR-120 et retarderait Phase 4 (push-back Pi → cloud, le besoin actuel prioritaire).

---

## Décision (à instruire)

À drafter quand un cas advertiser cross-site avec variants est concrètement vendu. Pistes initiales :

1. **Forcer le linkage explicite master ↔ variants** dès l'upload : route `POST /api/videos/:masterId/variants` qui upload un variant lié, refuse de créer une row `videos` séparée pour un variant
2. **Préserver le filename canonique** au replace : ne pas suffixer `_N` si c'est un re-upload du même `(filename, site_id, advertiser_id)` (déduplication par checksum + scope)
3. **Cascade cleanup côté Pi** : à la suppression d'un master cloud, queue une commande `cleanup_variants` au Pi qui supprime les fichiers variant orphelins
4. **Migration backfill** : identifier les "variants" déjà uploadés comme masters séparés et proposer un linkage rétroactif via UI admin (optionnel, peut rester en l'état)

---

## Alternatives considérées

À détailler à l'instruction. Pistes mentionnées en survol :

- Conserver le drift et documenter "variants non supportés" comme limitation produit
- Supprimer entièrement la table `video_variants` et faire reposer les variants sur des conventions de nommage (`master.webm`, `master_led.webm`) côté Pi
- Réécrire le pipeline en s'inspirant des display-type-aware deployments (ADR-117) avec un champ `display_type` direct sur `videos`

---

## Conséquences (à instruire)

À détailler lors du drafting définitif.

---

## Plan d'implémentation (à instruire)

Vide tant qu'aucun cas advertiser variant n'est concrètement vendu. Cet ADR est un **stub** qui sert de marqueur de dette technique et de point d'entrée référencé par ADR-120 §1.

---

## Références

- [ADR-120](ADR-120-pi-saas-ownership-model.md) §1 — matrice ownership, ligne `video_variants` cloud-owned dépendante de ce fix
- [ADR-117](ADR-117-auto-deploy-videos-on-profile-config-save.md) — auto-deploy vidéos (pattern dont s'inspirer pour le cleanup côté Pi)
- Mémoire `feedback_variant_pipeline_drift` — 3 bugs empilés (PR #921 et environs)
- `central-server/src/repositories/video-variant.repository.ts` — code actuel
- `raspberry/sync-agent/src/commands/restore-secondary-variants.js` — logique Pi à revoir
