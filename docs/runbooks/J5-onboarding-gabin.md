# Runbook J5 — Onboarding Gabin (nouveau dev)

> **Objectif** : Gabin est productif sur staging dans les 2 jours après son arrivée, sans toucher prod.
> **Pré-requis** : J1-J4 terminés (staging fonctionnel + branch protection main + prod gated).
> **Niveau de risque** : 🟢 faible — uniquement des actions d'invitation/lecture, prod isolée.

---

## Pré-requis à confirmer avant Day 1

- [ ] **Email GitHub** de Gabin : `<À RENSEIGNER>`
- [ ] **Email pro** (Google Workspace `@kalonpartners.bzh` ?) : `<À RENSEIGNER>`
- [ ] **Date d'arrivée** : `<À RENSEIGNER>`
- [ ] **Périmètre** : full-stack (Angular + Node) ou front/back uniquement ? `<À RENSEIGNER>`
- [ ] **Niveau** : junior / mid / senior ? (impacte le pairing requis)

---

## Étape 1 — Accès comptes (J-1, ~30 min)

### GitHub

1. Repo `Tallec7/neopro` → **Settings** → **Collaborators** → **Add people** → invite Gabin.
2. Rôle : **Write** (pas Admin — Gabin push sur des branches feat, ne touche pas main directement, branch protection bloque déjà les push directs).
3. **Settings** → **Environments** → `divine-freedom / production` → ajouter Gabin comme **Required reviewer** (il pourra approuver les deploys prod après pairing).

### Railway

1. [Railway dashboard](https://railway.app/dashboard) → projet `divine-freedom` → **Settings** → **Members** → invite via email pro.
2. Rôle : **Member** (lecture/edit services, pas billing). Permettra de voir les logs staging + redeploy manuel staging.
3. Lui dire de **ne jamais** redeploy `neopro-central` (prod) sans validation.

### Cloudflare

1. [Cloudflare dashboard](https://dash.cloudflare.com) → **Manage Account** → **Members** → invite.
2. Rôle : **Administrator Read Only** (suffit pour debug Pages staging + DNS lookup).

### Hostinger (FTP prod dashboard)

- **Ne pas donner** d'accès Hostinger tant qu'ADR-071 n'est pas migré. Si urgent : créer un compte FTP dédié read-only.

### Sentry / observabilité (si applicable)

- À voir selon ce qui est en place.

### Notion

- Inviter sur le workspace Neopro → accès aux specs SAFe + roadmap.

## Étape 2 — Setup environnement local (Day 1, ~2h en pair)

Le fichier `docs/01-START-HERE.md` est la source de vérité. Vérifier qu'il est à jour avec les dernières conventions (notamment staging URLs).

```bash
# 1. Clone
git clone git@github.com:Tallec7/neopro.git
cd neopro

# 2. Node + npm
nvm install        # utilise .nvmrc
npm install
cd central-server && npm install && cd ..
cd central-dashboard && npm install && cd ..

# 3. .env central-server
cp central-server/.env.example central-server/.env
# Remplir avec les credentials staging (pas prod !)

# 4. DB locale (option A : Postgres local)
brew install postgresql@18
brew services start postgresql@18
createdb neopro_dev
cd central-server && npm run db:migrate

# 4bis. (Option B recommandée) : pointer sur staging cloud DB
# Dans .env : DATABASE_URL=$STAGING_DATABASE_URL — accès lecture/écriture sur données anonymisées

# 5. Lancer le tout
npm run dev:seed                   # Seed les 3 servers en local
npm run start:central              # Dashboard port 4300
cd central-server && npm run dev   # API port 3001
```

## Étape 3 — Doc à lire (Day 1, ~3h en autonomie)

Ordre conseillé :

1. `docs/01-START-HERE.md` — vue d'ensemble
2. `CLAUDE.md` (racine) — conventions de code + commandes
3. `docs/technical/ARCHITECTURE.md` — schéma 3-tiers
4. `docs/GLOSSARY.md` — vocabulaire métier
5. `.claude/rules/context.md` — rôles, stack, multi-tenant
6. `docs/safe/README.md` — pilotage produit (Epics / Features / US)
7. `docs/adr/README.md` — survol des ADR clés (ADR-035, ADR-037, ADR-070, ADR-091)
8. `docs/runbooks/README.md` — runbooks ops

## Étape 4 — Premier ticket (Day 2, ~1 jour)

Choisir un ticket :

- **Trivial** : fix typo dans un .md, ajout d'une trad i18n manquante. Objectif = passer la chaîne complète : branche → push → PR → CI → review → merge → deploy staging.
- **Petit** : un bug visible côté staging, ou une US `XS` du backlog SAFe.
- **Pas trop tôt** : pas de migration DB, pas de touche au protocole socket Pi, pas de modif sur les fichiers critiques (`auth.ts`, `database.ts`, `socket.service.ts`).

Pairing obligatoire sur la première PR : review live ensemble.

## Étape 5 — Checklist accès prod (post-onboarding, ~Day 7+)

À débloquer **uniquement** quand Gabin a livré 3-5 PR sans incident :

- [ ] Bumper `Required approvals` du ruleset main de 0 → 1 (force PR review).
- [ ] Confirmer qu'il a compris le process deploy prod (Étape 4 du runbook J4).
- [ ] Lui faire approuver son premier deploy prod en pairing.
- [ ] Donner l'accès Hostinger (si ADR-071 pas encore livré).

## Étape 6 — Créer / mettre à jour `TEAM.md` (~10 min)

```bash
# Si TEAM.md n'existe pas encore
cat > TEAM.md <<'EOF'
# Team Neopro

| Nom       | Rôle    | GitHub      | Email                      | Périmètre              |
| --------- | ------- | ----------- | -------------------------- | ---------------------- |
| Gwenvaël  | CTO     | @Tallec7    | glt.breizh.kapital@gmail.com | Tout                   |
| Gabin     | Dev     | @<handle>   | <email>                    | <front/back/full>      |
EOF
```

---

## Checklist finale J5

- [ ] Accès GitHub (Write) + Environment production (reviewer) accordés
- [ ] Accès Railway (Member) + Cloudflare (Admin RO) accordés
- [ ] Setup local Day 1 effectué en pair (env up + login staging OK)
- [ ] Doc lue (au moins 1, 3, 5, 6 de la liste Étape 3)
- [ ] Première PR mergée (trivial)
- [ ] `TEAM.md` créé/mis à jour

**Livrable** : Gabin autonome sur staging. Bump des reviews requises sur main quand il est prêt.

## Rollback

- Retirer collab GitHub : Settings → Collaborators → Remove
- Retirer Railway : Members → Remove
- Retirer Cloudflare : Members → Remove
- Pas de rollback DB / code à faire (Gabin opère sur staging uniquement au début)

## Références

- [Runbook J1-J4](README.md)
- [ADR-091](../adr/ADR-091-environnement-staging.md) — stratégie 3-env
- [docs/01-START-HERE.md](../01-START-HERE.md) — onboarding détaillé
