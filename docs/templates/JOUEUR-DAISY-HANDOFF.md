# Handoff Daisy — chantier templates JOUEUR

> Récap des actions à mener côté Daisy pour finaliser la mise en prod
> des templates JOUEUR. Tout le backend + l'UI super_admin sont prêts
> et attendent les assets.

---

## TL;DR

Hello Daisy 👋
Côté code, tout est prêt — backend complet (migration DB, 9 endpoints API gated super_admin, runtime câblé) et UI Angular super_admin (3 outils sous `/content/joueur-tools`). Reste **5 items côté toi** pour qu'on puisse importer les templates en staging et lancer le frame-compare. Détails ci-dessous.

PRs prêtes à review :
- [PR #757](https://github.com/Tallec7/neopro/pull/757) — SPECs + ADRs + plan d'action
- [PR #760](https://github.com/Tallec7/neopro/pull/760) — Foundations backend + UI

---

## ✅ Ce qui est prêt

### Documentation
- 5 SPECs livrées : globale transverse + Joueur Simple + Joueur But + 2 packshots
- 2 ADRs rédigés : ADR-108 (versioning) + ADR-109 (backgrounds + grants)
- Plan d'action 3 semaines / 3 fronts (cf. JOUEUR-ACTION-PLAN.md)

### Backend (PR #760)
- Migration DB : versioning `neopro_templates.version` + table snapshot, slot capabilities (`text_transform`, `auto_crop`, `user_offset_x`, `require_alpha`), catalogue `template_backgrounds` + grants user_id
- Backfill idempotent : tous les templates existants → v1.0 published, sans casse
- 9 endpoints API super_admin :
  - `POST /:id/publish` (snapshot + lock master)
  - `POST /:id/fork` (clone draft v+1)
  - `GET /:id/versions` (list snapshots)
  - `PATCH /:id/default-version` (rollback / promote)
  - `POST /photo/auto-crop` (cadrage auto photo joueur PNG)
  - `GET / /:id` backgrounds (lecture filtrée par grants)
  - `POST` backgrounds (upload WebM + create)
  - `PATCH /:id` (rename / toggle public / archive)
  - `POST /:id/grants` (bulk grant), `GET /:id/grants`, `DELETE /:bg/:userId`
- `text_transform: uppercase` câblé end-to-end (DB → repo → runtime CSS)

### UI super_admin (PR #760)
Page `/content/joueur-tools` avec 3 onglets :
- 📸 **Auto-crop photo** : drop PNG → preview bbox SVG + crosshairs + slider offset_x éditable
- 🎨 **Backgrounds** : list catalogue + upload + toggle public/restreint + archive + bulk grants editor + revoke
- 🔒 **Versions** : input templateId + Publish + Fork (semver pré-validé) + table snapshots + Set default

### POC dev
- Service `pngBboxService` validé sur PNG synthétique (8/8 tests unit + smoke)
- CLI `npm run template:test-bbox -- <photo.png> --visual` pour validation hors API
- Mini serveur localhost:3030 pour drop & test interactif

---

## 🚧 Ce qu'on attend de toi (5 items bloquants)

### 1. Confirmer "ComicSans" sur PACKSHOT_IMG ⚠️

Sur la page 5 du PDF tu as écrit que le nom du club du **PACKSHOT_IMG** utilise **ComicSans bold majuscules**. Je flag parce que :
- Le **PACKSHOT_GENERIQUE** utilise GeneralSans Bold (cohérent avec la charte tech)
- Comic Sans est une font informelle peu compatible avec le style sport pro des autres templates

**→ Confirme** : ComicSans est-il vraiment voulu (= choix design assumé), ou typo pour `GeneralSans` ?

### 2. Livraison des 8 WebM alpha (1920×1080 @ 25fps)

| Template | Fichiers attendus | Durée totale |
|---|---|---|
| Joueur Simple | `01-A-hexagone.webm`, `02-B-transition.webm` | 5'24 = 5960 ms |
| Joueur But | `01-A-hexagone.webm`, `02-B-transition.webm`, `03-C-titre.webm`, `04-D-transition.webm` | 6'24 = 6960 ms |
| Packshots | `packshot-generique.webm`, `packshot-img.webm` | (durée packshot indépendante) |

**Chemin de livraison** : tu peux les déposer dans un dossier Drive/Hostinger ou me les pinger en upload Slack.

### 3. Fonts `.otf` + licences

- `Bulevar.otf`
- `GeneralSans-Bold.otf`
- ✅ Licences web confirmées (round 2). Attache juste les fichiers de licence (PDF / TXT) avec les .otf pour traçabilité.

### 4. Mesures précises (à confirmer post-livraison WebM)

Une fois les WebM livrés, je vais mesurer :
- Dimensions exactes de la **safe zone hexagone** (centre + largeur + hauteur en px sur 1920×1080)
- Dimensions exactes du **rectangle rouge photo joueur** sur PACKSHOT_IMG (cadrage cible)

Mais **idéalement** : tu peux me passer ces 2 mesures directement en t'appuyant sur ton fichier source (Figma / AE) — ce sera plus précis que ma reconstruction visuelle a posteriori.

### 5. Délai cible + client cible

- **Quand tu veux qu'on ship en prod** ? Démo prochaine ? Échéance NLF ?
- **Pour qui en priorité** ? NLF, prospect Premium, démo générale ?

Ça m'aide à arbitrer si on doit réduire le scope (Joueur Simple seul d'abord) en cas de retard livraison, et à prioriser les templates dans la flotte.

---

## 🎯 Proposition de séquencement post-livraison

À réception de tes assets :
1. **J-0** : tu livres → je mesure les safe zones, mets à jour les SPECs, push commit final
2. **J+1** : `npm run db:migrate` sur staging → backfill validé → import via `npm run template:import`
3. **J+2** : frame-compare aux masters designer (toi + moi en visio 30 min ?), itération si écarts
4. **J+3** : validation acceptance super_admin (checklist UI prête) → publish v1.0 + lock master
5. **J+4** : push prod, monitoring 1ʳᵉ semaine

**Total** : ~1 semaine entre ta livraison et le push prod.

---

## 🧪 Comment tester le POC auto-crop avant la livraison

Tu peux déjà valider que le cadrage auto fonctionne sur tes photos détourées **sans** rien attendre :

```bash
# Pull la branche
git fetch origin feat/template-versioning-and-backgrounds-grants
git worktree add ../neopro-test-bbox feat/template-versioning-and-backgrounds-grants
cd ../neopro-test-bbox/central-server
npm install

# Test 1 : CLI sur une photo
npm run template:test-bbox -- /chemin/vers/ta-photo.png --visual

# Test 2 : Mini serveur localhost (drop interactif)
npm run template:preview-bbox
# Puis drop tes photos sur http://localhost:3030
```

Drop 3-4 photos types (centrée / décalée / différents cadrages) → si le rectangle rouge cadre bien le sujet et que les crosshairs sont cohérents, on est bon. Sinon je tune le seuil alpha ou l'algo.

---

## Refs

- [JOUEUR-SPEC-GLOBAL.md](JOUEUR-SPEC-GLOBAL.md) — vue d'ensemble + invariants
- [JOUEUR-ACTION-PLAN.md](JOUEUR-ACTION-PLAN.md) — plan détaillé 3 semaines
- [ADR-108](../adr/ADR-108-template-versioning-and-master-locking.md) — versioning
- [ADR-109](../adr/ADR-109-template-backgrounds-grants.md) — backgrounds + grants
- [PR #757](https://github.com/Tallec7/neopro/pull/757) — SPECs + ADRs
- [PR #760](https://github.com/Tallec7/neopro/pull/760) — code backend + UI

Ping-moi sur Slack quand tu as un créneau pour finaliser. ✌️
