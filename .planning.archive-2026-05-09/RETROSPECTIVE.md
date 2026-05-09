# Project Retrospective

_Document vivant mis à jour après chaque milestone. Les leçons alimentent la planification suivante._

---

## Milestone: v3.0 — Template Studio v3

**Shipped:** 2026-05-05
**Phases:** 3 | **Plans:** 14 | **Timeline:** 1 journée (vs estimation ~3 semaines)

### What Was Built

- Asset Manager WebM standalone (browse/upload/delete) avec ffprobe alpha gate serveur
- Wizard 5 étapes signal-based : INSERT immédiat step 1, drag-reorder CDK transactionnel, zones mandatory layer_id
- Duplication atomique 6 tables (BEGIN/COMMIT, layerIdMap FK remap, WebM partagés sans copie FTP)
- Player Remotion monté une seule fois [hidden] (GPU-safe, Pitfall P3 smoke-enforced)
- Animation preset cards visuelles FR (banlist scaleFrom/scaleTo smoke-enforced)
- visible_if click-to-highlight + renameOptionKey transactionnel (4 UPDATEs, regexp_replace DB-side)
- Checklist 8 critères registry extensible + test render async + publish/unpublish validation-gated
- 9 suites smoke v3 (53 tests) figent tous les contrats UI↔DB

### What Worked

- **Architecture registry pattern pour la validation** : ajout d'une 9e règle = 1 fichier + 1 ligne. Zéro modification de l'orchestrateur. Le smoke itère sur le registre — extensibilité prouvée en production.
- **Smoke tests comme filet de sécurité** : les 3 grandes dérives (vocabulaire DB qui fuit, \*ngIf sur le Player, transactions incomplètes) ont toutes été stoppées par un test rouge avant d'atteindre prod. Pitfalls P2/P3/P6 respectés sans surveillance manuelle.
- **[hidden] jamais \*ngIf sur les step containers** : pattern simple, prouvé GPU-safe, smoke-enforcé. Réutilisable pour tout composant Angular embarquant un React root.
- **INSERT immédiat step 1 + replaceState** : élimine la perte de données à la source. Pas de "draft" complexe — la row DB est la source de vérité dès le premier clic "Continuer →".
- **Phases incrémentales** : Phase 1 livrable seule (wizard sans preview), Phase 2 additive, Phase 3 additive. Si une phase avait bloqué, les deux précédentes restaient shippables.
- **UAT bloquant en Phase 3 Plan 05** : 11/11 items approuvés par Daisy en session = zéro surprises après merge. Intégrer checkpoint humain avant fin de phase = coût faible, confiance élevée.

### What Was Inefficient

- **REQUIREMENTS.md stale checkboxes** : 5 cases non cochées (WIZARD-01/02/03, DUP-01, UX-01) ont nécessité une passe de nettoyage post-audit. À éviter : cocher au moment du SUMMARY, pas au audit.
- **Pas de `one_liner` dans les SUMMARY frontmatter** : l'extracteur CLI retourne vide. Les accomplissements doivent être recopiés manuellement dans MILESTONES.md. Ajouter `one_liner:` dans les templates de SUMMARY.
- **ng build Node 20 non disponible en worktree** : Phase 3 Plan 04 a dû substituer `tsc --noEmit` car Angular 20 exige Node 20.19+ et le CI tourne en Node 18 sur certaines worktrees locales. Vérifier `node --version` avant de valider un build Angular en plan.
- **Devoirs i18n imprévus** : mots bannis (`Supprimer`, `Annuler`, `Suivant`, `Oui/Non`, `En cours`) ont causé des micro-déviations sur 4 plans. La liste aurait dû être intégrée aux PLAN.md plutôt que découverte à l'exécution.
- **Pas de VALIDATION.md (Nyquist)** : 3 phases sans wave validation. Les smoke tests couvrent les contrats, mais pas les edge cases unitaires. Pour le prochain milestone, lancer `/gsd:validate-phase` en parallèle de l'exécution.

### Patterns Established

- **Pitfall list dans les ADR** : ADR-110 liste 10 pitfalls numérotés (P1-P10). Les PLAN.md les référencent explicitement. Résultat : 0 régression sur les pitfalls critiques sur tout le milestone.
- **Double-gate publish** : UI gating = UX, serveur re-validate = autorité. Applicable à tout endpoint destructeur ou irréversible.
- **Vocabulary constants co-localisés** : `vocabulary.constants.ts` = VOCABULARY_MAP + ANIMATION_PRESET_LABELS + ERROR_MESSAGES + MODAL_MESSAGES + VALIDATION_RULE_LABELS. Single source of truth lexicon, smoke-scanné. Pattern à reproduire pour tout nouveau sous-domaine UI.
- **Dual-context component** : AssetManagerModalComponent fonctionne en modal (wizard) ET en page (route) via `@Input context`. Pattern plus propre que deux composants séparés pour des UX similaires.
- **checkpoint:human-verify gate=blocking** dans les plans\*\* : forcer une session UAT avant la fin d'une phase critique garantit que les items non-automatisables sont couverts avant merge.

### Key Lessons

1. **Smoke first, implement second** : pour Phase 1, les 3 suites smoke ont été créées en Plan 01 avant l'UI. Quand le smoke existait déjà, les plans suivants n'ont jamais régressé sur les pitfalls. À généraliser.
2. **Les dérives i18n se cumulent** : 8 mots bannis découverts au fur et à mesure. Ajouter une section "mots bannis connus" dans CLAUDE.md ou dans les PLAN templates pour ce projet.
3. **Vérifier les exports DB avant de coder les types** : 4 plans ont eu des dérives parce que les types TypeScript aspirationnels du PLAN.md ne correspondaient pas aux colonnes réelles de `full-schema.sql`. Lire le schéma réel en step 0.
4. **La vélocité réelle > estimation x5** : 3 phases estimées à ~1 semaine chacune, livrées en 1 journée. L'estimation était basée sur "travail humain" ; avec GSD + Claude, le goulot d'étranglement est la réflexion/review, pas l'exécution. Calibrer les estimations en conséquence.

### Cost Observations

- Sessions: ~8 sessions Claude Code (1 journée)
- Modèles: Sonnet 4.6 principalement (planification + exécution), Opus pour audit milestone
- Notable: ratio plans/session élevé (~2 plans/session) — phases bien découpées = peu de context switches

---

---

## Milestone: v4.1 — Fire Stick polish

**Shipped:** 2026-05-08
**Phases:** 3 (10-12) | **Plans:** 4 | **Timeline:** 2 jours (2026-05-07 → 2026-05-08)

### What Was Built

- nginx wifistub 302-chain → Fire OS CaptivePortalLauncher : Silk Browser s'ouvre automatiquement à la connexion hotspot Pi (Phase 10)
- Réassigner UX 1 clic : mutation atomique 2-displays en une seule passe `.map()` dans `assignReceiver()`, badge backward-compat Phase 8 (Phase 11)
- Counter `neopro_hotspot_unknown_firestick_total{site_id}` + dedup `Map<siteId,Set<mac>>` scope process + Winston warn + badge ambre « Non assigné » dans displays-editor (Phase 12 — pivoté de ALLOWLIST vers OBSERVE)

### What Worked

- **Phase pivot explicite** : Phase 12 était planifiée pour ALLOWLIST, mais le scope réel du sprint était OBSERVE. Documenter le pivot dans STATE.md + VERIFICATION.md + l'audit a évité toute ambiguïté post-livraison.
- **Worktree isolation** : les 2 plans Phase 12 ont tourné en parallèle sur des worktrees séparées — merge propre sans collatéral.
- **Integration checker** : le gsd-integration-checker a détecté un faux gap (`displayIndex undefined vs null`) qui a été résolu en 1 ligne (`receivers.service.js:120 — ?? null`). Preuve d'utilité sur une base de code mature.
- **Smoke first encore** : les 9 assertions Phase 12 OBSERVE ont été définies AVANT l'implémentation (TDD RED→GREEN). Contrat wiring figé dès le départ.

### What Was Inefficient

- **Phase 13 skippée sans plan de remplacement** : ALERT-01/02/03/04 déférées sans roadmap précis pour v4.2. Mieux vaut créer un backlog explicite dans PROJECT.md.Active que laisser des requirements flottants.
- **REQUIREMENTS.md checkboxes jamais mis à jour** : DATA-01/02 et ASSIGN-01/02/03 restent [ ] dans le fichier archivé malgré livraison confirmée. Le problème récurrent des SUMMARY sans `req_completed` field en frontmatter.
- **Phases 08/09/11 sans VERIFICATION.md** : la phase d'exécution n'a pas systématiquement lancé gsd-verifier. Résultat : 3 phases vérifiées par UAT/Karma mais pas par le workflow formel.
- **2 worktrees → 1 conflit STATE.md** : le merge worktree 12-01 a nécessité une résolution manuelle de STATE.md (versions concurrent 12-01 vs 12-02). À éviter : STATE.md en shared mutable → préférer commits séquentiels ou STATE.md par plan.

### Patterns Established

- **Phase pivot documenté** : quand une phase change de scope en cours de sprint, documenter le pivot dans STATE.md decisions + PLAN.md objective + VERIFICATION.md goal_achieved_reason. Le pattern est maintenant établi pour v4.2.
- **Audit milestone comme pré-requis complete-milestone** : `gsd:audit-milestone` → résultat `gaps_found` → Daisy choisit "proceed anyway" en connaissance des gaps intentionnels. Flow propre vs découverte tardive.
- **Badge ambre pour Fire Stick non assigné** : pattern `kind === 'firestick' && displayIndex === null` + classe CSS `receiver-badge--unknown` réutilisable pour d'autres états d'alerte visuelle dans displays-editor.

### Key Lessons

1. **Un scope cut explicite vaut mieux qu'une livraison partielle silencieuse** : ALLOWLIST et ALERT skippés avec raison documentée (audit + STATE.md decisions) > implémentation à moitié finie. Les gaps sont maintenant dans v4.2.Active avec déclencheurs clairs.
2. **Map<siteId,Set<mac>> scope process = dédup simple mais fragile** : reset au reboot Railway — acceptable pour granularité session, mais à monitorer si Railway redémarre souvent (< 1h entre redémarrages = faux positifs réouverts). ADR à envisager si problème produit.
3. **gsd-verifier manqué sur 3 phases** : lancer `/gsd:verify-work` juste après execute-phase est un réflexe à renforcer — surtout quand les plans sont courts (1-2 fichiers). Le workflow est le filet, pas un bonus.

### Cost Observations

- Sessions: ~6 sessions Claude Code (2 jours)
- Modèles: Sonnet 4.6 (exécution), Sonnet 4.6 (audit + intégration checker)
- Notable: 4 plans en 2 jours = vélocité x2 vs v3.0 estimé, cohérent avec base existante (moins de boilerplate, patterns établis)

---

## Cross-Milestone Trends

| Milestone | Phases | Plans | Timeline | Velocity      | Smoke suites |
| --------- | ------ | ----- | -------- | ------------- | ------------ |
| v3.0      | 3      | 14    | 1 jour   | 14 plans/jour | 9 suites v3  |
| v4.0      | 6      | 20    | 2 jours  | 10 plans/jour | +12 smoke    |
| v4.1      | 3      | 4     | 2 jours  | 2 plans/jour  | +9 smoke     |

_Vélocité v4.1 plus faible car plans plus complexes (intégration multi-couche Pi + cloud + dashboard) — pas une régression_

_Mis à jour après chaque milestone_
