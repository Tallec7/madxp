# Specs Neopro

> Une SPEC = règles métier vivantes d'un composant/feature/service. **1 page max**, lisible métier, mise à jour dans la même PR que tout changement de comportement.

## Pourquoi pas un PRD ?

Le PRD (Product Requirements Document) est conçu pour **aligner plusieurs personnes sur un produit qui n'existe pas encore** (15-50 pages, owner PM, semaines de revue). Il ne match pas le contexte solo dev sur un code qui existe déjà. La SPEC garde les sections vraiment utiles d'un PRD (Problem, Goals, Non-Goals, Functional/Non-Functional, Open Questions, Success Metrics) en 1 page focalisée. Si Neopro recrute un PM un jour, on bascule certaines SPECs en PRDs (chemin facile).

## Différence avec ce qui existe déjà

| Doc                      | Rôle                                                    | Quand consulter                                                    |
| ------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------ |
| **ADR** (`docs/adr/`)    | "Pourquoi on a décidé ça" — figé au point dans le temps | Quand on s'interroge sur un choix archi historique                 |
| **`.claude/rules/`**     | Interdits techniques auto-loadés                        | Auto-injecté quand Claude touche un fichier                        |
| **SPEC** (`docs/specs/`) | "Comment ça marche aujourd'hui en métier" — vivant      | Quand on prépare une évolution / quand on revient sur un composant |
| **Story Card** (PR body) | "Ce qui a changé dans cette PR" — snapshot ship         | À l'ouverture d'une PR                                             |

Aucun chevauchement, chaque doc a un rôle clair.

## Périmètre — quels composants méritent une SPEC

| Type                        | Exemples                                                                         | SPEC ?                       |
| --------------------------- | -------------------------------------------------------------------------------- | ---------------------------- |
| Feature transverse complexe | Sponsors rotation, Match sessions, Templates Studio, SaaS mode, OTA, Hotspot PSK | ✅ Oui                       |
| Composant client-visible    | TV component, Remote, Dashboard sites list, Club portal                          | ✅ Oui                       |
| Service backend critique    | Cron scheduler, Socket service, Storage, Deployment, Auth                        | ✅ Oui                       |
| Sous-composant CRUD         | Un controller sur 1 entité                                                       | ❌ Non — le code suffit      |
| Util / helper               | `formatBytes`, `hashApiKey`                                                      | ❌ Non — pas de règle métier |

**Estimation cible** : 20-25 SPECs au total, vs 250+ règles dans `.claude/rules/` ou 254 US dans SAFe.

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
| [features/match-sessions](features/match-sessions.spec.md)       | ADR-093, ADR-097                                              | Live   | 2026-04-25     |
| [features/saas-mode](features/saas-mode.spec.md)                 | ADR-037, ADR-038, ADR-039, ADR-059, ADR-069, ADR-088, ADR-096 | Live   | 2026-04-25     |
| [features/sponsor-reports](features/sponsor-reports.spec.md)     | ADR-035, ADR-097                                              | Live   | 2026-04-27     |
| [features/sponsors-rotation](features/sponsors-rotation.spec.md) | ADR-035, ADR-093                                              | Live   | 2026-04-27     |
| [features/hotspot-psk](features/hotspot-psk.spec.md)             | ADR-073, ADR-074, ADR-076                                     | Live   | 2026-04-27     |
| [features/templates-studio](features/templates-studio.spec.md)   | ADR-075, ADR-077, ADR-084, ADR-086, ADR-087, ADR-095          | Live   | 2026-04-25     |
| [services/cron-scheduler](services/cron-scheduler.spec.md)       | ADR-097                                                       | Live   | 2026-04-25     |
| [services/socket-service](services/socket-service.spec.md)       | ADR-002, ADR-037, ADR-061, ADR-081, ADR-090, ADR-093, ADR-096 | Live   | 2026-04-25     |

**Total : 8 SPECs actives** (target final ~20-25). Prochaines à écrire : `features/ota-deployment`, `features/club-portal`, `services/storage-service`, `services/auth-service`, `components/tv-player`, `components/remote-control`, `components/dashboard-sites`.

## Cycle de vie d'une SPEC

| Évènement                                | Action SPEC                                            |
| ---------------------------------------- | ------------------------------------------------------ |
| Nouvelle feature majeure                 | Créer la SPEC en même temps que le code                |
| PR qui change un comportement métier     | MAJ SPEC dans la même PR (smoke test enforced à terme) |
| PR refactor sans changement comportement | SPEC inchangée — elle décrit le quoi, pas le comment   |
| Incident production                      | Ajouter ligne "Cas d'edge connus" + lien post-mortem   |
| 3 mois sans modification                 | SPEC marquée "stale", revue à planifier                |

## Smoke tests prévus (à activer quand 5+ SPECs en place)

- Chaque ADR `Accepté` doit être référencé dans ≥1 SPEC
- Chaque service `central-server/src/services/*.service.ts` >300 lignes doit avoir une SPEC dans `docs/specs/services/`
- Chaque SPEC doit avoir une "Dernière revue" < 6 mois (warning, pas bloquant)
- Format SPEC respecté : sections obligatoires (En une phrase, Règles métier, Comportements observables, Cas d'edge connus, Ce qui n'est PAS dans le scope) présentes

---

## Gabarit SPEC

Copier-coller pour créer une nouvelle SPEC :

```markdown
# SPEC : <Nom du composant/feature>

> **Owner** : Daisy
> **Statut** : Live | Beta | Deprecated
> **Dernière revue** : YYYY-MM-DD
> **Code principal** : `path/to/main/file.ts`
> **ADR liés** : ADR-XXX, ADR-YYY (si applicable)
> **Smoke tests** : `central-server/src/__tests__/smoke/smoke-X.test.ts`
> **`.claude/rules/` lié** : `<rule>.md` (si applicable)

## En une phrase

Ce que ce composant fait pour l'utilisateur final, en langage métier.

## Règles métier (ce qui DOIT marcher)

Format : règle = phrase actionnable, métier-readable. Pas de jargon technique.

- Règle 1
- Règle 2
- ...

## Comportements observables

Pour CHAQUE règle métier, comment on vérifie qu'elle marche en prod (UI, métrique, log, dashboard).

| Règle | Comment on vérifie                             |
| ----- | ---------------------------------------------- |
| ...   | Grafana / Dashboard / Smoke test / Log Winston |

## Cas d'edge connus

- Cas 1 : description + comportement attendu
- Cas 2 : ...
- (incident YYYY-MM-DD) — [lien vers post-mortem si applicable]

## Contraintes / NE PAS FAIRE

Pointer vers `.claude/rules/<X>.md` pour ne pas dupliquer. Lister ICI uniquement les contraintes **métier** (pas conventions de code).

- Contrainte métier 1
- Contrainte métier 2

## Ce qui n'est PAS dans le scope

Pour éviter la confusion et les questions récurrentes :

- Hors-scope 1 (renvoyer vers la SPEC qui couvre)
- Hors-scope 2

## Évolutions possibles (backlog léger)

- [ ] Évolution 1
- [ ] Évolution 2
```
