---
phase: 260507-p1a-templates-security
plan: 01
status: complete
date: 2026-05-07
requirements:
  - AUDIT-P1-7-hmac-proxy-urls
  - AUDIT-P1-8-multer-upload-timeout
  - AUDIT-P0-2-ftp-creds-rotation
key-files:
  created:
    - central-server/src/middleware/request-timeout.ts
    - central-server/src/middleware/request-timeout.test.ts
    - central-server/src/services/template-proxy-signing.service.ts
    - central-server/src/services/template-proxy-signing.service.test.ts
    - central-server/src/scripts/rotate-ftp-creds.ts
    - central-server/src/__tests__/smoke/smoke-template-uploads-security.test.ts
    - docs/adr/ADR-113-ftp-creds-rotation-procedure.md
  modified:
    - central-server/src/routes/remotion-templates.routes.ts
    - central-server/src/controllers/remotion-templates.controller.ts
    - central-server/src/middleware/validation.ts
    - central-server/src/services/metrics.service.ts
    - central-server/src/__tests__/setup.ts
    - central-server/package.json
    - central-dashboard/src/app/features/content/remotion-templates/remotion-templates-data.service.ts
    - docker/grafana/provisioning/dashboards/json/cloud/neopro-blind-spots-cloud.json
    - docs/adr/README.md
    - docs/BUSINESS-CHANGELOG.md
    - .claude/rules/templates.md
metrics:
  tasks_completed: 5
  files_created: 7
  files_modified: 11
  unit_tests_added: 11
  smoke_assertions_added: 15
---

# Phase 260507-p1a Plan 01: Templates Sécu Uploads Summary

Hardening sécu/réseau Template Studio (audit phase C, 3 sous-tâches sur 4 ; CSP unsafe-eval volontairement repoussé). Ferme P1 #7 (URLs proxy non signées), P1 #8 (multer sans timeout), P0 #2 (FTP creds non rotables).

## Story Card

```markdown
## Story 2026-05-07-templates-sec-uploads

**En tant que** : Lead Dev
**Je veux** : refermer 3 risques latents identifiés par l'audit Template Studio du 2026-05-07
**Pour** : passer le périmètre de "alpha qui fonctionne" à "outil pro" sans incendier la flotte

**Livré** :

- Middleware `requestTimeout(300_000)` armé sur les 3 routes upload Template Studio (POST /:id/assets, POST /:id/user-uploads, POST /library/upload). Un upload qui hang plus de 5 min retourne désormais 408 + message lisible côté UI au lieu d'exhauster les slots HTTP Railway.
- Service HMAC `template-proxy-signing.service` (signUrl + verifyUrl, crypto.timingSafeEqual constant-time) avec fail-fast au boot si `TEMPLATE_PROXY_HMAC_SECRET` absent. Le controller `proxyTemplateAsset` vérifie la signature ; phase migration 24h pendant laquelle les URLs non signées sont acceptées + tracées via `neopro_template_proxy_signature_validation_total{status="missing"}`.
- Script `npm run rotate:ftp-creds` qui imprime la procédure 7-step + accepte `--test-connection <pw>` pour valider un nouveau mot de passe contre Hostinger via basic-ftp. Cadence 90 jours documentée dans ADR-113 avec table "Historique des rotations" initialement vide.

**Vérifié par** :

- 4 tests unitaires `request-timeout.test.ts` (success, timeout, headers-already-sent guard, Winston warn)
- 7 tests unitaires `template-proxy-signing.service.test.ts` (valid, expired, tampered url, tampered sig, missing, 2× fail-fast boot via jest.isolateModules)
- 15 assertions `smoke-template-uploads-security.test.ts` (multer wiring, 408 body, HMAC verify, fail-fast, métrique, ADR + script + readme, Joi schema)
- Full smoke pass : 2131 / 2131
- TypeScript strict compile clean

**Risque résiduel** : phase migration 24h — surveiller `neopro_template_proxy_signature_validation_total{status="missing"}` dans Grafana ("NeoPro Blind Spots" → panel "Template proxy signature validation"). Tant que le compteur reste > 0, des call-sites n'ont pas migré et la PR cleanup ne peut pas drop le fallback `missing`.

**Next** :

- (a) PR cleanup pour drop le fallback `missing` (verifyUrl → 401) après 24h sans `missing` en prod.
- (b) Audit phase C reste = CSP `'unsafe-eval'` removal sur `/remotion-preview` (research + Pi visual smoke — volontairement out-of-scope cette PR).
- (c) Ajouter `TEMPLATE_PROXY_HMAC_SECRET` aux env vars Railway production (manuel, hors-code, valeur min 32 chars).
```

## Diff stats

```
18 files changed, 798 insertions(+), 12 deletions(-)
```

## Tests verts

| Suite                                          | Résultat       |
| ---------------------------------------------- | -------------- |
| `request-timeout.test.ts`                      | 4 / 4 ✓        |
| `template-proxy-signing.service.test.ts`       | 7 / 7 ✓        |
| `smoke-template-uploads-security.test.ts`      | 15 / 15 ✓      |
| `npm run test:smoke` (full)                    | 2131 / 2131 ✓  |
| `npx tsc --noEmit -p tsconfig.json`            | clean ✓        |

## Commits

| Hash       | Message                                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| `dc5472f4` | feat(uploads): add 5min timeout middleware on Template Studio upload routes (audit P1 #8)                        |
| `729c5462` | feat(security): add HMAC signing service for template proxy URLs (audit P1 #7)                                   |
| `56395483` | feat(security): verify HMAC signature on template proxy asset (audit P1 #7, 24h migration window)                |
| `61edae51` | docs(security): add ADR-113 + rotate-ftp-creds script (audit P0 #2)                                              |
| `efe1c201` | test(smoke): enforce template uploads security invariants (audit phase C)                                        |

## Decisions Made

- **Phase migration 24h pour la signature HMAC** : verifyUrl retourne `reason='missing'` quand sig/exp absents → log warn + métrique + sert quand même, plutôt que 401 immédiat. Permet d'éviter de casser les call-sites qui n'ont pas encore migré (un cleanup follow-up tightening en 401 sera trivial une fois `status="missing"` ≈ 0 en prod).
- **Fail-fast au boot pour TEMPLATE_PROXY_HMAC_SECRET** : throw au module-load plutôt que fallback silencieux `dev-secret`. Mieux vaut un crashloop Railway visible qu'un déploiement qui sert des URLs non vérifiées.
- **Test setup seed du secret HMAC** : ajouté à `__tests__/setup.ts` pour éviter de casser les 3958 tests existants qui importent transitivement le service via le controller.
- **`requestTimeout` via JS `setTimeout` plutôt que `req.setTimeout`** : `req.setTimeout` aborte le socket sans status line → le client voit `ERR_NETWORK`. Avec un JS setTimeout on contrôle la réponse 408.
- **Cadence rotation FTP = 90 jours** (vs 30 ou 180) : compatible cadence audits sécu trimestriels, friction acceptable pour 1 secret manuel, marge sur fenêtre d'exposition d'un leak.
- **Pas d'API Hostinger pour rotation auto** : alternative explicitement rejetée dans ADR-113 (plan upstream non disponible).

## Deviations from Plan

### Adaptations chemins (Rule 3 — fichiers cibles existants)

- Le plan référençait `central-server/src/schemas/template-studio.schemas.ts` (n'existe pas) → ajouté `proxyAssetQuerySchema` à `central-server/src/middleware/validation.ts` aux côtés des schemas existants.
- Le plan référençait `central-dashboard/.../services/remotion-templates-data.service.ts` (sous-dossier `services/`) → fichier réel à `.../remotion-templates-data.service.ts` (racine du dossier `remotion-templates/`).
- Le plan parlait de `/proxy?url=…` → le endpoint réel est `/api/remotion-templates/asset-proxy?url=…`, monté directement sur `app` dans `server.ts` (pas via le router).

### Auto-fixes (Rule 2 — observabilité critique manquante)

- **Panel Grafana** : le smoke `smoke-metrics-observability` exige qu'un nouveau Counter `neopro_*` apparaisse dans au moins un dashboard ou alert rule. J'ai ajouté un panel "Template proxy signature validation" à `neopro-blind-spots-cloud.json` plutôt que de tomber dans l'allowlist gelée. Sans ça la PR aurait été bloquée en CI.

### Auto-fixes (Rule 3 — Jest setup pour transitive imports)

- L'ajout du fail-fast HMAC secret dans le service cassait toutes les suites qui l'importent transitivement via `controllers/remotion-templates.controller.ts`. Fix : seed `TEMPLATE_PROXY_HMAC_SECRET` dans `central-server/src/__tests__/setup.ts` (defaulted à un secret 32+ chars de test).

## Self-Check: PASSED

Vérifications post-implémentation :

- ✓ `central-server/src/middleware/request-timeout.ts` exists
- ✓ `central-server/src/services/template-proxy-signing.service.ts` exists + co-located `.test.ts`
- ✓ `central-server/src/scripts/rotate-ftp-creds.ts` exists + npm script wired
- ✓ `docs/adr/ADR-113-ftp-creds-rotation-procedure.md` exists + indexed in README
- ✓ `central-server/src/__tests__/smoke/smoke-template-uploads-security.test.ts` exists (15 / 15 ✓)
- ✓ Commits dc5472f4 / 729c5462 / 56395483 / 61edae51 / efe1c201 present in git log
- ✓ Full `npm run test:smoke` : 2131 / 2131
- ✓ `npx tsc --noEmit` clean
- ✓ ESLint warnings only (no errors) on 5 touched files
- ✓ Business changelog entry under Semaine 19 / 🛡️ Robustesse
- ✓ `.claude/rules/templates.md` extended with 6 new smoke-enforced invariants
