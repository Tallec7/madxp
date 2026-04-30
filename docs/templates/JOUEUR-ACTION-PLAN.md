# Plan d'action — Templates JOUEUR

> Plan d'exécution de la PR [#757](https://github.com/Tallec7/neopro/pull/757)
> jusqu'à la mise en prod des templates Joueur Simple + Joueur But.
>
> **Stratégie** : 3 fronts en parallèle pour ne pas dépendre uniquement de la
> livraison des assets Daisy. Préparer le terrain code pendant l'attente,
> dérisquer les inconnues techniques, formaliser la gouvernance.

---

## TL;DR métier

On peut commencer **dès maintenant** à coder le moteur (versioning, cadrage auto photo, migrations DB) sans attendre les vidéos de Daisy. Quand elle livre, il suffira de mesurer les safe zones et lancer l'import. Objectif : **3 semaines** entre cette PR et le push prod, à condition d'avancer en parallèle.

---

## Vue d'ensemble — 3 semaines

```
Semaine 1 (cette semaine)
 ├─ Front 1 : Daisy livre assets (ping batché)
 ├─ Front 2 : ADR versioning + migration DB + POC auto_crop
 └─ Front 3 : ADR grants + checklist acceptance

Semaine 2 (réception assets Daisy)
 ├─ Mesure safe zones réelles sur WebM → MAJ SPECs (commit final)
 ├─ npm run template:import sur staging
 ├─ Frame-compare aux masters designer
 └─ Itération si écarts visuels

Semaine 3
 ├─ UI Central (assistant 3 étapes + champs édition)
 ├─ Validation super_admin → lock v1.0
 └─ Push prod + monitoring 1ʳᵉ semaine
```

---

## Front 1 — Débloquer Daisy (chemin critique) 🔴

| # | Action | Owner | ETA | Statut |
|---|--------|-------|-----|--------|
| 1.1 | **Trancher ComicSans vs GeneralSans** sur PACKSHOT_IMG | Daisy | 5 min | ⏳ |
| 1.2 | Livrer **8 WebM alpha** (1920×1080 @ 25fps) | Daisy | ?j | ⏳ |
| 1.3 | Livrer fonts `Bulevar.otf` + `GeneralSans-Bold.otf` | Daisy | ?j | ⏳ |
| 1.4 | Trancher **délai cible + client cible** (NLF / démo / prospect) | Daisy | 5 min | ⏳ |
| 1.5 | (Optionnel) Confirmer Q14 anchor/fit photo joueur | Daisy | 5 min | ⏳ |

**Action immédiate (Lead Dev)** : draft d'un message récap unique pour Daisy, à valider avant envoi.

**Si bloqué >5 jours** : escalade Daisy direct, ou réduction de scope (livrer Joueur Simple seul d'abord).

---

## Front 2 — Préparer le terrain code (autonomie) 🟠

Faisable maintenant, indépendant des assets. Permet d'arriver prêt à l'import.

### 2.1 ADR Versioning des templates (0.5j) — **PRIORITÉ 1**

**Objectif** : décider du modèle de verrouillage masters (recommandé : versioning vs flag `locked`).

**Livrable** : `docs/adr/ADR-XXX-template-versioning.md` qui tranche :
- Schéma DB : `templates.version` (semver) + table `template_versions(template_id, version, layers_snapshot, slots_snapshot, status, published_at, locked)`
- API : `GET /api/templates/:slug/:version` (résolution explicite)
- Workflow : draft → published (locked) → fork v1.1 draft
- Migration : sites consommateurs référencent `template_id@v1.0`
- Rollback : possible vers n'importe quelle version `published` antérieure

**Bloque** : Front 2.2 (migration DB), Front 3.3 (lock v1.0)

### 2.2 Migration DB (0.5j)

**Objectif** : ajouter les colonnes nécessaires aux SPECs sans rien casser en prod.

**Migration** : `add-template-studio-v2-joueur-fields.sql`
```sql
-- Versioning (cf. ADR 2.1)
ALTER TABLE templates ADD COLUMN IF NOT EXISTS version TEXT NOT NULL DEFAULT '1.0';
ALTER TABLE templates ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';
-- ... (cf. ADR pour la migration complète)

-- Slot text : text_transform (uppercase pour majuscules)
ALTER TABLE template_text_fields ADD COLUMN IF NOT EXISTS text_transform TEXT DEFAULT 'none';

-- Slot image : auto_crop + user_offset_x (cadrage photo joueur)
ALTER TABLE template_image_slots ADD COLUMN IF NOT EXISTS auto_crop BOOLEAN DEFAULT false;
ALTER TABLE template_image_slots ADD COLUMN IF NOT EXISTS user_offset_x NUMERIC DEFAULT 0;
ALTER TABLE template_image_slots ADD COLUMN IF NOT EXISTS require_alpha BOOLEAN DEFAULT false;

-- Backgrounds (phase 2)
CREATE TABLE IF NOT EXISTS template_backgrounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  hex_color TEXT,
  webm_url TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Grants backgrounds par user_id (cf. réponse Daisy + pattern ADR-082)
CREATE TABLE IF NOT EXISTS template_backgrounds_grants (
  background_id UUID NOT NULL REFERENCES template_backgrounds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by UUID NOT NULL REFERENCES users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (background_id, user_id)
);
```

**Bloque** : 2.3 (POC auto_crop), 2.4 (POC text_transform), 2.5 (smoke tests)

### 2.3 POC `auto_crop` — extraction bbox alpha PNG (1j) — **PRIORITÉ 2**

**Pourquoi maintenant** : c'est la capability moteur la plus à risque. Si la bbox du détourage donne un mauvais cadrage, on doit ajuster avant que Daisy ne valide le workflow.

**Livrable** :
- Service `central-server/src/services/png-bbox.service.ts` (utilise `sharp`)
- Endpoint `POST /api/templates/photo/auto-crop` qui reçoit un PNG, retourne `{ bbox: { x, y, width, height }, suggested_safe_zone_offset_x }`
- Test unitaire avec 3 photos : centrée, décalée gauche, décalée droite
- Endpoint résultat illustré dans une issue GitHub avant validation

**Validation** : POC visible avec la photoref Daisy (image9.png du PDF) + 2 autres photos test.

### 2.4 POC `text_transform: uppercase` dans `TemplateRuntime.tsx` (0.5j)

**Trivial** mais à câbler proprement dans le moteur générique (pas de hardcode dans un template).

**Livrable** : modif `templates-remotion/src/runtime/TemplateRuntime.tsx` + test smoke.

### 2.5 Smoke tests garde-fous (0.5j)

Suivant le pattern `.claude/rules/templates.md` :
- `smoke-template-versioning.test.ts` : vérifie qu'aucun template n'est inséré sans `version`
- `smoke-template-text-transform.test.ts` : vérifie que `text_transform` est lu depuis la DB, pas hardcodé
- `smoke-template-auto-crop.test.ts` : vérifie que `auto_crop` n'est pas appliqué sans `require_alpha`

---

## Front 3 — Process & gouvernance 🟡

À formaliser avant le 1er master, faisable pendant l'attente assets.

### 3.1 ADR Grants backgrounds (0.5j)

**Objectif** : doc le pattern de visibilité des backgrounds par user_id (cf. SPEC globale §5.3).

**Livrable** : `docs/adr/ADR-XXX-template-backgrounds-grants.md`
- Schéma DB (déjà dans la migration 2.2)
- Repository pattern : `templateBackgroundsRepository.listForUser(userId)`
- API : `GET /api/templates/backgrounds?user_id=` (filtré par grants)
- UI super_admin : grant/revoke par user

### 3.2 Checklist d'acceptance super_admin (0.5j)

Avant lock v1.0, super_admin doit valider une checklist concrète :

```markdown
- [ ] Render visuel conforme master designer (frame-compare OK)
- [ ] Tous les champs utilisateur fonctionnent (édition texte/image en live)
- [ ] Limites caractères / wrap appliquées
- [ ] Photo détourée acceptée, photo non-détourée refusée (PNG sans alpha)
- [ ] Cadrage auto + offset user fonctionne sur 3 photos différentes
- [ ] Combinaisons croisées rendues correctement (Simple/img, But/generique)
- [ ] Performance : render < 30s sur Mac M1 / < 60s Railway
```

**Livrable** : composant Angular `<app-template-acceptance-checklist>` dans le studio admin.

### 3.3 Convention naming + plan rollback (rédaction ADR 2.1)

À inclure dans l'ADR versioning :
- Slugs immutables : `joueur-simple` (pas de `-v1` dans le slug)
- Versions semver : 1.0 → 1.1 (modif compatibles) → 2.0 (breaking)
- Sites consommateurs référencent toujours une version explicite
- Rollback = remettre `default_version` du template à une version `published` antérieure

---

## Découpage en commits / PRs

| PR | Contenu | Dépendances |
|----|---------|-------------|
| **#757** ✅ | SPEC famille JOUEUR (ouverte, en cours) | — |
| #758 | ADR-XXX versioning + migration DB | #757 mergée |
| #759 | POC auto_crop bbox PNG | #758 |
| #760 | text_transform dans runtime + smoke tests | #758 |
| #761 | ADR-XXX grants backgrounds | #758 |
| #762 | Acceptance checklist UI | #758 |
| #763 | Import des templates Joueur (post-livraison Daisy) | #759, #760, assets reçus |
| #764 | UI Central assistant 3 étapes | #763 |

---

## Risques identifiés

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Daisy livre tard (>2 sem) | Moyenne | Bloque tout | Réduction scope : Joueur Simple seul d'abord |
| ComicSans est bien la font voulue (pas une typo) | Faible | Esthétique douteuse | Confirmer en amont avant import |
| Bbox alpha donne mauvais cadrage | Moyenne | Refonte UX upload | POC #759 dérisque tôt |
| Versioning casse les sites en prod | Faible | Régression majeure | Tests E2E + plan rollback ADR 2.1 |
| Frame-compare échoue (timing désynchro) | Moyenne | Itérations multiples | Mesurer durées exactes sur WebM avant import |

---

## Décisions à prendre maintenant

1. **Ordre de démarrage Front 2** : ADR versioning d'abord (bloque tout) ou POC auto_crop d'abord (dérisque) ?
   - Reco : **ADR versioning en premier** (0.5j seul) → puis migration DB → puis POC auto_crop en parallèle d'autre chose.
2. **Réduction de scope possible** : si Daisy met >5 jours, livrer Joueur Simple seul d'abord ?
3. **Background agents** : spawn un agent pour babysitter la livraison Daisy ?
4. **Communication Daisy** : message Slack récap des 5 points bloquants à valider ?

---

## Prochaine étape concrète

→ **Commit ce plan d'action sur la PR #757** (1 fichier `JOUEUR-ACTION-PLAN.md`).
→ **Drafter le message Slack pour Daisy** (5 points bloquants).
→ **Démarrer Front 2.1 (ADR versioning)** dès validation du plan.
