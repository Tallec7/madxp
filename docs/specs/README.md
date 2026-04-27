# Specs Neopro

> Une SPEC = règles métier vivantes d'un **domaine métier cohérent** (pas d'un fichier). **1 page max**, lisible métier, mise à jour dans la même PR que tout changement de comportement.

## SPEC = domaine, pas SPEC = fichier

Un domaine métier regroupe N services + N composants + N features qui partagent un parcours utilisateur cohérent. Exemple : la SPEC "Match" couvre `match-sessions`, `scoreboard PROP-003`, `match-history-view`, `match-auto-close` — c'est un seul mental model, pas 4 docs à corréler. Cette approche évite de répliquer l'arborescence du code (inutile, le code suffit) et matérialise les **frontières métier** (irremplaçable, le code ne le dit pas).

## Pourquoi pas un PRD ?

Le PRD (Product Requirements Document) est conçu pour **aligner plusieurs personnes sur un produit qui n'existe pas encore** (15-50 pages, owner PM, semaines de revue). Il ne match pas le contexte solo dev sur un code qui existe déjà. La SPEC garde les sections vraiment utiles d'un PRD (Problem, Goals, Non-Goals, Functional/Non-Functional, Open Questions, Success Metrics) en 1 page focalisée. Si Neopro recrute un PM un jour, on bascule certaines SPECs en PRDs (chemin facile).

## Différence avec ce qui existe déjà

| Doc                                         | Rôle                                                                               | Quand consulter                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **ADR** (`docs/adr/`)                       | "Pourquoi on a décidé ça" — figé au point dans le temps                            | Quand on s'interroge sur un choix archi historique                       |
| **`.claude/rules/`**                        | Interdits techniques auto-loadés                                                   | Auto-injecté quand Claude touche un fichier                              |
| **SPEC** (`docs/specs/`)                    | "Comment ça marche aujourd'hui en métier" — vivant                                 | Quand on prépare une évolution / quand on revient sur un composant       |
| **USE-CASES** (`docs/product/USE-CASES.md`) | "Qui se coordonne avec qui dans un parcours réel" — JTBD + scénarios multi-acteurs | Quand on prépare une démo, un onboarding, ou une priorisation de backlog |
| **Story Card** (PR body)                    | "Ce qui a changé dans cette PR" — snapshot ship                                    | À l'ouverture d'une PR                                                   |

Aucun chevauchement, chaque doc a un rôle clair.

## Périmètre — quels composants méritent une SPEC

| Type                        | Exemples                                                                         | SPEC ?                       |
| --------------------------- | -------------------------------------------------------------------------------- | ---------------------------- |
| Feature transverse complexe | Sponsors rotation, Match sessions, Templates Studio, SaaS mode, OTA, Hotspot PSK | ✅ Oui                       |
| Composant client-visible    | TV component, Remote, Dashboard sites list, Club portal                          | ✅ Oui                       |
| Service backend critique    | Cron scheduler, Socket service, Storage, Deployment, Auth                        | ✅ Oui                       |
| Sous-composant CRUD         | Un controller sur 1 entité                                                       | ❌ Non — le code suffit      |
| Util / helper               | `formatBytes`, `hashApiKey`                                                      | ❌ Non — pas de règle métier |

**Estimation cible** : ~15 SPECs domaine au total (audit 2026-04-27), vs 250+ règles dans `.claude/rules/` ou 254 US dans SAFe. Cible précédente "20-25" remplacée après pivot SPEC=domaine.

## Les 15 SPECs domaine cibles

Issu de l'audit complet du 2026-04-27 (services backend + composants UI + ADR Acceptés + suites smoke).

| #   | Domaine                   | Statut              | Couvre                                                                                                                |
| --- | ------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | Match                     | ✅ Live             | match-sessions + events + templates + history-view + auto-close + scoreboard PROP-003 + scoreboard-saas               |
| 2   | Templates Studio          | ✅ Live             | runtime + admin studio + designer workflow                                                                            |
| 3   | SaaS & Club Portal        | ✅ Live             | saas-mode + club-portal-dashboard + diagnostic + sponsors-loop + onboarding (ADR-040)                                 |
| 4   | Sponsors & Pubs           | 🟡 Partiel (à fusionner) | sponsors-rotation ✅ + sponsor-reports ✅ + advertiser-portal + agency + sponsor-portal + analytics-sponsors + asset-service |
| 5   | Vidéo (cycle complet)     | ✅ Live             | content-management + upload-pipeline + categories + ftp-storage + upload-verification + cascade DELETE + ADR-100     |
| 6   | Déploiement & OTA         | À créer             | deployment + canary + update + orchestrated + canary-monitor + updates UI + staging                                   |
| 7   | Observabilité & Alerting  | À créer             | metrics + health + realtime-stats + connection-events + alerting (4 services) + network-alerts                        |
| 8   | Pi & Display (edge)       | À créer             | tv-player + status-screens + club-selector + kiosk-pi + display + watchdog + admin panel Pi                           |
| 9   | Remote (télécommande)     | À créer             | remote-v2 + remote legacy + API publique + feature flag                                                               |
| 10  | Réseau & Hotspot          | À créer             | hotspot-psk + network-wifi + network-resilience                                                                       |
| 11  | Auth & Sécurité           | À créer             | mfa + JWT + RLS multi-tenant + rate-limiter + audit-log + api-key-rotation                                            |
| 12  | Subscription & Billing    | À créer             | subscription-licensing + subscriptions UI + grace periods                                                             |
| 13  | Sync & Config (Pi↔Cloud)  | À créer             | sync-agent + command-queue + cron-scheduler + socket-service + draft-config                                           |
| 14  | Reporting & Exports       | À créer             | excel-export + monthly-reports + email + audit traçabilité                                                            |
| 15  | Dashboard Admin (chassis) | À créer             | layout-navigation + sites-list + users + groups + dashboard-guards                                                    |

> Les SPECs services existantes (`cron-scheduler`, `socket-service`) seront absorbées dans les SPECs domaine pertinentes (#13 Sync & Config) ou conservées comme SPECs services transverses — arbitrage au cas par cas pendant l'écriture.

## Localisation

```
docs/specs/
├── README.md                        # ce fichier (index + gabarit)
├── components/
│   ├── tv-player.spec.md
│   ├── remote-control.spec.md
│   └── dashboard-sites.spec.md
├── features/
│   ├── match-sessions.spec.md       # ✅ pilote livré
│   ├── sponsors-rotation.spec.md
│   ├── templates-studio.spec.md
│   ├── saas-mode.spec.md
│   ├── hotspot-psk.spec.md
│   ├── ota-deployment.spec.md
│   └── club-portal.spec.md
└── services/
    ├── cron-scheduler.spec.md
    ├── socket-service.spec.md
    ├── storage-service.spec.md
    └── auth-service.spec.md
```

## Index des SPECs actives

| SPEC                                                             | ADR liés                                                      | Statut | Dernière revue |
| ---------------------------------------------------------------- | ------------------------------------------------------------- | ------ | -------------- |
| [features/match-sessions](features/match-sessions.spec.md)       | ADR-088, ADR-093, ADR-097                                     | Live   | 2026-04-27     |
| [features/saas-mode](features/saas-mode.spec.md)                 | ADR-005, ADR-037, ADR-038, ADR-039, ADR-040, ADR-059, ADR-069, ADR-088, ADR-096 | Live   | 2026-04-27     |
| [features/sponsor-reports](features/sponsor-reports.spec.md)     | ADR-035, ADR-097                                              | Live   | 2026-04-27     |
| [features/sponsors-rotation](features/sponsors-rotation.spec.md) | ADR-035, ADR-093                                              | Live   | 2026-04-27     |
| [features/templates-studio](features/templates-studio.spec.md)   | ADR-075, ADR-077, ADR-084, ADR-086, ADR-087, ADR-095          | Live   | 2026-04-25     |
| [features/video-cycle](features/video-cycle.spec.md)             | ADR-100                                                       | Live   | 2026-04-27     |
| [services/cron-scheduler](services/cron-scheduler.spec.md)       | ADR-097                                                       | Live   | 2026-04-25     |
| [services/socket-service](services/socket-service.spec.md)       | ADR-002, ADR-037, ADR-061, ADR-081, ADR-090, ADR-093, ADR-096 | Live   | 2026-04-25     |

**Total : 8 SPECs actives** (target ~15 SPECs domaine). Voir le tableau "Les 15 SPECs domaine cibles" plus haut pour la roadmap d'écriture.

> Les SPECs `sponsors-rotation` et `sponsor-reports` (livrées 2026-04-27, PR #664) seront absorbées dans la SPEC domaine #4 "Sponsors & Pubs" en Sprint 1 — leur format pré-pivot (sans section Périmètre formalisée) est traité par allowlist du smoke `smoke-spec-coverage`.

## Cycle de vie d'une SPEC

| Évènement                                | Action SPEC                                            |
| ---------------------------------------- | ------------------------------------------------------ |
| Nouvelle feature majeure                 | Créer la SPEC en même temps que le code                |
| PR qui change un comportement métier     | MAJ SPEC dans la même PR (smoke test enforced à terme) |
| PR refactor sans changement comportement | SPEC inchangée — elle décrit le quoi, pas le comment   |
| Incident production                      | Ajouter ligne "Cas d'edge connus" + lien post-mortem   |
| 3 mois sans modification                 | SPEC marquée "stale", revue à planifier                |

## Smoke tests garde-fous (actifs)

Le smoke test `smoke-spec-coverage.test.ts` enforce :

- Chaque ADR `Accepté` doit être référencé dans ≥1 SPEC (allowlist gelée pour les ADR pas encore couverts, à faire fondre)
- Chaque service `central-server/src/services/*.service.ts` >500 lignes doit être mentionné dans ≥1 SPEC domaine (allowlist gelée)
- Chaque SPEC doit avoir une "Dernière revue" < 6 mois (warning, pas bloquant)
- Format SPEC respecté : sections obligatoires présentes (En une phrase, Périmètre, Règles métier, Comportements observables, Cas d'edge connus, Ce qui n'est PAS dans le scope)

Cible : faire fondre les allowlists au fil des Sprints.

## Checklist cohérence (à appliquer à CHAQUE SPEC créée/modifiée)

Avant de marquer une SPEC "Live", vérifier les 6 axes de cohérence :

### 1. Cohérence avec le code (source de vérité)

- [ ] Lire **réellement** chaque fichier listé en "Périmètre" (pas se fier à la mémoire)
- [ ] Vérifier que les invariants décrits sont bien implémentés (grep des fonctions clés)
- [ ] Si écart entre SPEC voulue et code actuel → noter dans "Cas d'edge connus" ou "Évolutions possibles", **ne pas inventer un comportement qui n'existe pas**

### 2. Cohérence avec les ADR

- [ ] Lister tous les ADR du périmètre
- [ ] Pour chaque ADR `Accepté` cité : vérifier que la décision est toujours en place
- [ ] Pour chaque ADR `Superseded` : ne pas le citer comme actif
- [ ] Si un ADR du périmètre n'est pas cité → soit l'ajouter, soit justifier explicitement

### 3. Cohérence avec `.claude/rules/`

- [ ] Vérifier qu'aucun "NE JAMAIS FAIRE" de la rule liée n'est contredit par la SPEC
- [ ] Pointer vers la rule (lien) au lieu de dupliquer les contraintes techniques
- [ ] Si la SPEC introduit une contrainte technique → vérifier qu'elle ne devrait pas plutôt aller dans `.claude/rules/`

### 4. Cohérence avec les smoke tests

- [ ] Lister les suites smoke du périmètre
- [ ] Vérifier que chaque "Règle métier" critique a un smoke test correspondant
- [ ] Si pas de smoke → noter dans "Évolutions possibles" : "ajouter smoke pour règle X"

### 5. Cohérence inter-SPECs (anti-chevauchement)

- [ ] Lire l'index ci-dessus à jour
- [ ] Pour chaque composant/service cité : vérifier qu'il n'est pas déjà dans une autre SPEC
- [ ] Si chevauchement → soit fusionner, soit déplacer le composant vers la SPEC la plus naturelle, soit cross-link explicite

### 6. Cohérence du format

- [ ] Sections obligatoires présentes (En une phrase / Acteurs / Périmètre / Règles métier / Comportements observables / Cas d'edge / Hors-scope)
- [ ] Frontmatter complet (Owner, Statut, Dernière revue, Code principal, ADR liés, Smoke tests, Rules liées)
- [ ] Longueur cible <100 lignes (au-delà = signal qu'on essaie de remplacer le code)
- [ ] MAJ de l'index ci-dessus dans la même PR

---

## Gabarit SPEC domaine

Copier-coller pour créer une nouvelle SPEC :

```markdown
# SPEC : <Nom du domaine métier>

> **Owner** : Daisy
> **Statut** : Live | Beta | Deprecated
> **Dernière revue** : YYYY-MM-DD

## En une phrase

Le job-to-be-done que ce domaine accomplit pour le métier (1 phrase, langage utilisateur).

## Acteurs impliqués

Liste des rôles utilisateurs qui interagissent avec ce domaine (super_admin, club, advertiser, etc.).
Référence : `docs/PERSONAE.md` + `docs/product/USE-CASES.md` si parcours multi-acteurs.

## Périmètre (ce que ce domaine couvre)

Matérialise les frontières du domaine. La SPEC ne traite QUE ce qui est listé ici.

- **Services backend** : `central-server/src/services/<a>.service.ts`, `<b>.service.ts`
- **Composants UI** : `central-dashboard/src/app/features/<x>/`, `raspberry/src/app/components/<y>/`
- **Routes API** : `POST /api/...`, `GET /api/...` (si non triviales)
- **Tables DB** : `table_x`, `table_y` (si schéma central au domaine)
- **ADR** : ADR-XXX, ADR-YYY
- **Smoke tests** : `smoke-foo.test.ts`, `smoke-bar.test.ts`
- **`.claude/rules/`** : `<domain>.md` (si applicable)

## Règles métier (ce qui DOIT marcher cross-composant)

Les invariants qui doivent tenir EN BOUT DE CHAÎNE, peu importe quel composant les implémente. Format : règle = phrase actionnable, métier-readable. Pas de jargon technique.

- Règle 1
- Règle 2

## Comportements observables

Pour CHAQUE règle métier, comment on vérifie qu'elle marche en prod (UI, métrique Prometheus, log Winston, dashboard).

| Règle | Comment on vérifie                     |
| ----- | -------------------------------------- |
| ...   | Grafana / Dashboard / Smoke test / Log |

## Cas d'edge connus

Pièges réels rencontrés, avec lien post-mortem si applicable.

- Cas 1 : description + comportement attendu
- (incident YYYY-MM-DD) — [post-mortem](path/to/post-mortem.md)

## Contraintes / NE PAS FAIRE

Pointer vers `.claude/rules/<X>.md` pour ne pas dupliquer. Lister ICI uniquement les contraintes **métier** (pas conventions de code).

- Contrainte métier 1

## Ce qui n'est PAS dans ce domaine

Pour éviter le scope creep et les questions récurrentes :

- Hors-scope 1 → couvert par [SPEC autre domaine](other.spec.md)

## Évolutions possibles (backlog léger)

- [ ] Évolution 1
```
