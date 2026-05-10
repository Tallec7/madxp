# Accès Claude Code — Inventaire & Setup

> Référence pour savoir ce que Claude peut faire seul vs ce qui nécessite une action humaine.
> Mis à jour : 2026-05-10 — MCP Postgres opérationnel ✅

---

## Ce que Claude peut faire seul (aujourd'hui)

| Capacité                              | Outil             | Niveau  |
| ------------------------------------- | ----------------- | ------- |
| Lire / éditer du code                 | Read, Edit, Write | ✅ Full |
| Git (add, commit, diff, log, branch)  | Bash allowlist    | ✅ Full |
| Lancer les tests (jest, smoke, karma) | Bash              | ✅ Full |
| Lancer le build                       | Bash              | ✅ Full |
| Grep / find dans le codebase          | Bash              | ✅ Full |
| Créer/gérer des PRs GitHub            | MCP GitHub        | ✅ Full |
| Notion, Airtable, Gmail, Teams        | MCP servers       | ✅ Full |

---

## Ce que Claude ne peut PAS faire (accès manquants)

| Capacité                              | Statut                   | Priorité     |
| ------------------------------------- | ------------------------ | ------------ |
| Lire la DB Railway en prod            | ✅ MCP postgres-readonly | Opérationnel |
| SSH vers les Raspberry Pi             | ❌ Pas de MCP SSH        | J+6-10       |
| Lire les métriques Prometheus/Grafana | ❌ Pas de MCP Prometheus | Backlog      |
| Railway API (redéployer, voir logs)   | ❌ Pas de MCP Railway    | Backlog      |

Sans accès DB, Claude code des fixes prod sans vérifier l'état réel de la data
→ cascade de hotfixes sur hypothèse → pattern identifié dans CLAUDE-IMPROVEMENT-PLAN.md.

---

## Setup MCP Postgres read-only ✅ (opérationnel depuis 2026-05-10)

### Étape 1 — Créer l'utilisateur sur Railway

```bash
# Générer un mot de passe fort
openssl rand -base64 24
# → note ce mot de passe, tu en auras besoin à l'étape 3

# Éditer le script et remplacer <PASSWORD> par le mot de passe généré
# central-server/src/scripts/create-claude-readonly.sql
# Le script inclut : GRANT SELECT, BYPASSRLS (nécessaire pour RLS sur `sites`)

# Lancer le script contre Railway
psql $(railway variables --kv | grep ^DATABASE_PUBLIC_URL= | cut -d= -f2) \
  < central-server/src/scripts/create-claude-readonly.sql
```

> ⚠️ Utiliser `DATABASE_PUBLIC_URL` (proxy externe, port 42840), **pas** `DATABASE_URL`
> (URL interne `.railway.internal` inaccessible depuis local).

### Étape 2 — Récupérer l'URL de connexion Railway

```bash
railway variables --kv | grep ^DATABASE_PUBLIC_URL=
# → postgresql://postgres:<PG_PASSWORD>@roundhouse.proxy.rlwy.net:<PORT>/railway

# Construire l'URL claude_readonly :
# postgresql://claude_readonly:<PASSWORD>@roundhouse.proxy.rlwy.net:<PORT>/railway
```

### Étape 3 — Ajouter le MCP server à Claude Code

La config est stockée dans `~/.claude.json` (par projet, jamais dans git).

```bash
claude mcp add postgres-readonly -s local \
  -e DATABASE_URL="postgresql://claude_readonly:<PASSWORD>@roundhouse.proxy.rlwy.net:<PORT>/railway" \
  -e NODE_TLS_REJECT_UNAUTHORIZED="0" \
  -- npx mcp-postgres
```

> ⚠️ **Pièges validés** (2026-05-10) :
>
> - Utiliser `mcp-postgres` (pas `@modelcontextprotocol/server-postgres` — deprecated, ignorait l'URL)
> - Passer l'URL via `-e DATABASE_URL=` (pas en arg positionnel — ignoré par mcp-postgres)
> - Ajouter `-e NODE_TLS_REJECT_UNAUTHORIZED="0"` (Railway utilise un cert auto-signé)
> - La config se stocke dans `~/.claude.json` (pas `~/.claude/settings.json`)

### Étape 4 — Vérifier

```bash
claude mcp list | grep postgres
# → postgres-readonly: npx mcp-postgres - ✓ Connected

# Puis demander à Claude : "combien de sites j'ai en base ?"
```

---

## Accès futurs — à faire par Daisy (couche 3 bloqués infra)

### SSH NLF read-only — priorité haute

Permettrait à Claude de lire les logs Pi NLF sans demander à Daisy, et plus généralement de diagnostiquer un Pi directement :

- lire les logs journald
- vérifier l'état du sync-agent
- voir le contenu de `configuration.json`

```bash
# 1. Créer un wrapper npm dans package.json racine
# "pi:logs:nlf": "ssh pi@<IP_NLF> 'journalctl -u sync-agent -n 100 --no-pager'"

# 2. Ajouter à l'allowlist .claude/settings.json :
# "Bash(npm run pi:logs:nlf)"

# 3. Prérequis : clé SSH de la machine dev autorisée sur le Pi NLF
ssh-copy-id pi@<IP_NLF>
```

### MCP Railway logs — priorité moyenne

Permettrait à Claude de lire les logs Railway en temps réel.

```bash
# Option A — alias bash autorisé
# Ajouter dans package.json : "railway:logs": "railway logs --tail"
# Puis allowlist : "Bash(npm run railway:logs)"

# Option B — MCP Railway (si disponible)
# claude mcp add railway-logs npx -- -y @railway/mcp
```

### MCP Prometheus — backlog

Permettrait à Claude de requêter les métriques Grafana pour diagnostiquer
un incident avant de coder un fix. Non prioritaire tant que SSH + Railway logs
ne sont pas en place.

---

## Règle de session

Quand Claude dit ❌ Inconnu sur l'état DB → la réponse correcte est :

1. Vérifier avec le MCP postgres-readonly (une query suffit)
2. PUIS coder le fix

Jamais coder un fix prod sur hypothèse d'état DB.
