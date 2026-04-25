# Contribuer à Neopro

> Comment livrer une évolution de A à Z, sans casser NLF un dimanche soir.

**Public** : développeurs internes, contributeurs externes ponctuels, agents IA.
**Référence delivery** : [`docs/technical/ENVIRONMENTS.md`](docs/technical/ENVIRONMENTS.md).

---

## TL;DR

1. **Branche** depuis `main` : `git checkout -b feat/scope-courte-description`
2. **Commits** [Conventional Commits](https://www.conventionalcommits.org/) : `feat(scope):`, `fix(scope):`, `chore(scope):`
3. **PR < 400 lignes** idéalement, scope unique
4. **CI verte** : lint + typecheck + tests + smoke (1655 tests)
5. **Label** : `tech-only` ou `needs-gabin` (au moins un, voir §3)
6. **Tag prod** uniquement après CI verte + label `gabin-validated` si applicable

---

## 1. Branches

| Branche                                              | Rôle                                            | Protégée ?                     |
| ---------------------------------------------------- | ----------------------------------------------- | ------------------------------ |
| `main`                                               | Source unique de vérité, déclenche staging auto | ✅ Required reviews + CI green |
| `feat/*`, `fix/*`, `chore/*`, `docs/*`, `refactor/*` | Branches de travail                             | ❌                             |
| `develop`                                            | Legacy, à éviter pour nouveaux travaux          | —                              |

**Convention nom** : `<type>/<scope>-<description-courte>` — ex. `feat/sponsors-magic-link`, `fix/match-autoclose-stuck`.

**Squash merge** par défaut sur `main` — historique propre, bisect simple.

---

## 2. Commits

Format imposé par `commitlint` + `husky` :

```
<type>(<scope>): <sujet impératif présent>

[corps optionnel : pourquoi, pas quoi]

[footer optionnel : refs ADR, breaking change, co-author]
```

**Types** : `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `ci`, `style`.

**Scopes Neopro fréquents** : `sponsors`, `match`, `remote`, `profiles`, `onboarding`, `wifi`, `alerts`, `audit`, `fleet`, `motion`, `templates`, `score`, `live`, `email`, `infra`, `safe`, `ci`. Liste complète dans [`.claude/rules/safe-update.md`](.claude/rules/safe-update.md) (mapping Epics SAFe).

**Exemples** :

- ✅ `feat(sponsors): add sponsor signup with magic link`
- ✅ `fix(match): freeze score on session end (ADR-093)`
- ❌ `update stuff` (pas de type, pas de scope, sujet vague)

> Voir [`docs/safe/README.md`](docs/safe/README.md) pour la mise à jour automatique des fichiers SAFe à chaque feat/fix.

---

## 3. Pull Requests

### 3.1 — Avant d'ouvrir

- [ ] Branche à jour avec `main` (`git rebase main` ou merge récent)
- [ ] CI locale : `npm run lint` + `npm run test:smoke:smart`
- [ ] Tests ajoutés pour les nouveaux comportements (TDD ou couverture rétroactive)
- [ ] ADR créé si décision architecturale (voir [`.claude/rules/adr.md`](.claude/rules/adr.md))

### 3.2 — À l'ouverture

Le template PR (`.github/PULL_REQUEST_TEMPLATE.md`) demande :

- **Summary** technique
- **Impact client** (visible utilisateur final)
- **ADR lié**
- **Risque** (low/med/high)
- **Migration DB ?** (oui/non + idempotente ?)
- **Comment tester sur staging** (URL + steps pour Gabin)
- **Test plan**

### 3.3 — Labels obligatoires

Au moins un label de validation parmi :

| Label         | Quand l'utiliser                                                          | Validation requise                                  |
| ------------- | ------------------------------------------------------------------------- | --------------------------------------------------- |
| `tech-only`   | Refacto interne, perf, infra, lint, fix purement technique sans impact UX | Self-merge OK après CI verte + 24h délai courtoisie |
| `needs-gabin` | Toute évolution UX, produit, métier, client-facing                        | **Label `gabin-validated` requis avant tag prod**   |

Labels secondaires utiles : `breaking-change`, `migration`, `docs-only`, `urgent-nlf`.

### 3.4 — Validation Gabin (`needs-gabin` → `gabin-validated`)

**Flow** :

1. PR ouverte avec label `needs-gabin` → notif auto Discord `#valid-gabin` (Sprint 2)
2. Gabin teste sur staging via l'URL de la PR (Cloudflare Pages staging + Pi staging Sprint 1)
3. Gabin appose label `gabin-validated` ou demande des changements en commentaire
4. **SLA** : 48h pour valider. Au-delà sans réponse, un autre approbateur produit peut débloquer.
5. **Tag prod interdit** sans `gabin-validated` quand `needs-gabin` est présent.

**Pour batcher** : Gabin a un créneau quotidien 30 min de review groupée (à formaliser).

### 3.5 — Taille de PR

| Lignes diff | Niveau        | Action                                                    |
| ----------- | ------------- | --------------------------------------------------------- |
| < 200       | 🟢 idéal      | Reviewer en 5-10 min                                      |
| 200-400     | 🟡 acceptable | Reviewer < 30 min                                         |
| 400-800     | 🟠 splittable | Justifier dans la description                             |
| > 800       | 🔴 à splitter | Sauf cas exceptionnel (refacto atomique, génération auto) |

---

## 4. Tests

### 4.1 — Tester avant de pousser

```bash
npm run lint                       # ESLint global
npm run test:smoke:smart           # Smoke tests sur fichiers modifiés (~5-30s)
npm run test:server                # Jest API (2728 tests, ~2 min)
npm run test:central               # Karma dashboard (520 tests)
```

### 4.2 — Avant un commit final

```bash
npm run test:smoke                 # Smoke complet (1655 tests, 28s)
```

### 4.3 — En CI

- Smoke tests **bloquent** la PR depuis Sprint 0 (cf. `ci.yml` job `central-server`)
- Codecov upload (sans seuil bloquant pour l'instant)
- Build dashboard prod + raspberry validés

### 4.4 — Quand quels tests

Voir [`.claude/rules/testing.md`](.claude/rules/testing.md).

---

## 5. Déploiement

| Cible                               | Comment                                                          | Qui                   |
| ----------------------------------- | ---------------------------------------------------------------- | --------------------- |
| **Staging API** (Railway)           | Auto sur merge `main` (watchPatterns `central-server/**`)        | n/a                   |
| **Staging Dashboard/SaaS**          | Auto sur merge `main` via Cloudflare Pages                       | n/a                   |
| **Prod API** (Railway)              | Tag semantic-release + approuver GitHub Environment `production` | Reviewers Environment |
| **Prod Dashboard/SaaS** (Hostinger) | Job `release.yml` après approbation Environment                  | Reviewers Environment |
| **OTA flotte Pi**                   | Dashboard "Déploiements" → cohorte canary 5 Pi → 100%            | Super admin           |

**Rollback prod** :

1. Railway dashboard → service `neopro-central` → Deployments → "Redeploy" sur version précédente
2. Hostinger dashboard : restore manuel via FTP backup (rare, généralement on re-tag patch)
3. OTA Pi : déployer la version précédente via flow standard

---

## 6. Sécurité — règles non négociables

Voir [`CLAUDE.md`](CLAUDE.md) §"NE JAMAIS FAIRE" pour la liste complète. Rappels critiques :

- **Pas de secret en clair** dans le repo (utiliser GitHub Secrets + 1Password vault)
- **Pas de `console.log` dans `central-server/`** (Winston logger uniquement)
- **Pas de `query()` direct dans les controllers** (repository pattern, ESLint enforced)
- **Migrations DB** : toujours réversibles, idempotentes, jouées d'abord sur staging
- **PSK Pi** : ne jamais commiter, ne jamais logger en clair (ADR-074)

---

## 7. Documentation à mettre à jour

À chaque évolution structurante :

| Fichier                                            | Quand                                                                                           |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `docs/changelog/CHANGELOG.md`                      | Auto via semantic-release                                                                       |
| `docs/safe/FEATURES.md` + `IMPLEMENTED-BACKLOG.md` | Si feature SAFe complétée — voir [`.claude/rules/safe-update.md`](.claude/rules/safe-update.md) |
| `docs/adr/ADR-XXX-*.md`                            | Si décision architecturale                                                                      |
| `docs/technical/ENVIRONMENTS.md`                   | Si changement d'infra ou de plateforme                                                          |
| `docs/technical/REFERENCE.md`                      | Si nouvelle entité/endpoint structurant                                                         |
| `docs/clients/NLF.md` ou autres                    | Si impact client critique                                                                       |

---

## 8. En cas de problème

- **CI rouge** : voir logs dans l'onglet Actions, fix en local, push à nouveau
- **Release stuck** : voir [Troubleshooting § Release bloquée](docs/guides/TROUBLESHOOTING.md)
- **Incident prod NLF** : suivre [`docs/guides/RUNBOOK_NLF.md`](docs/guides/RUNBOOK_NLF.md)
- **Doute sur scope/architecture** : ouvrir une issue ou un ADR draft avant la PR

---

## 9. Glossaire express

- **Pi** : Raspberry Pi installé chez un club, avec une TV connectée
- **Site SaaS** : club sans Pi, accès via navigateur uniquement (ADR-037)
- **Flotte** : ensemble des Pi en prod (50+)
- **OTA** : déploiement à distance d'une nouvelle version sur les Pi
- **Profil** : config (sponsors, vidéos, paramètres) d'un club, peut avoir plusieurs profils
- **Match session** : session ouverte sur le Pi pendant un match, persistée en DB (ADR-093)

---

**Dernière mise à jour** : 25 Avril 2026 (Sprint 1 — formalisation flow Gabin + delivery)
