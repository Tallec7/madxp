# Accès Claude Code — Inventaire & Setup

> Référence pour savoir ce que Claude peut faire seul vs ce qui nécessite une action humaine.
> Mis à jour : 2026-05-10

---

## Ce que Claude peut faire seul (aujourd'hui)

| Capacité | Outil | Niveau |
|---|---|---|
| Lire / éditer du code | Read, Edit, Write | ✅ Full |
| Git (add, commit, diff, log, branch) | Bash allowlist | ✅ Full |
| Lancer les tests (jest, smoke, karma) | Bash | ✅ Full |
| Lancer le build | Bash | ✅ Full |
| Grep / find dans le codebase | Bash | ✅ Full |
| Créer/gérer des PRs GitHub | MCP GitHub | ✅ Full |
| Notion, Airtable, Gmail, Teams | MCP servers | ✅ Full |

---

## Ce que Claude ne peut PAS faire (accès manquants)

| Capacité | Statut | Priorité |
|---|---|---|
| Lire la DB Railway en prod | ❌ Pas de MCP Postgres | **J+4 — voir ci-dessous** |
| SSH vers les Raspberry Pi | ❌ Pas de MCP SSH | J+6-10 |
| Lire les métriques Prometheus/Grafana | ❌ Pas de MCP Prometheus | Backlog |
| Railway API (redéployer, voir logs) | ❌ Pas de MCP Railway | Backlog |

Sans accès DB, Claude code des fixes prod sans vérifier l'état réel de la data
→ cascade de hotfixes sur hypothèse → pattern identifié dans CLAUDE-IMPROVEMENT-PLAN.md.

---

## Setup MCP Postgres read-only (J+4)

### Étape 1 — Créer l'utilisateur sur Railway

```bash
# Générer un mot de passe fort
openssl rand -base64 24
# → note ce mot de passe, tu en auras besoin à l'étape 3

# Éditer le script et remplacer <PASSWORD> par le mot de passe généré
# central-server/src/scripts/create-claude-readonly.sql

# Lancer le script contre Railway
railway run psql < central-server/src/scripts/create-claude-readonly.sql
# ou : psql $DATABASE_URL < central-server/src/scripts/create-claude-readonly.sql
```

### Étape 2 — Récupérer l'URL de connexion Railway

Dans Railway dashboard → ton projet → Variables → copie `DATABASE_URL`.
Remplace le user/password dans l'URL :
```
# Original :
postgresql://postgres:<PG_PASSWORD>@roundhouse.proxy.rlwy.net:<PORT>/railway

# Readonly :
postgresql://claude_readonly:<PASSWORD>@roundhouse.proxy.rlwy.net:<PORT>/railway
```

### Étape 3 — Ajouter le MCP server à Claude Code

Option A — Via CLI Claude Code (recommandé, stocké en global, jamais dans git) :
```bash
claude mcp add postgres-readonly npx -- -y @modelcontextprotocol/server-postgres \
  "postgresql://claude_readonly:<PASSWORD>@<HOST>:<PORT>/railway"
```

Option B — Manuellement dans `~/.claude/settings.json` (fichier global hors projet) :
```json
{
  "mcpServers": {
    "postgres-readonly": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "postgresql://claude_readonly:<PASSWORD>@<HOST>:<PORT>/railway"
      ]
    }
  }
}
```

> ⚠️ Ne jamais mettre la connection string dans `.claude/settings.json` (suivi par git).
> Toujours utiliser `~/.claude/settings.json` (niveau global utilisateur).

### Étape 4 — Vérifier

```bash
# Relancer Claude Code — le MCP postgres-readonly doit apparaître dans /mcp
# Tester : demander à Claude "SELECT count(*) FROM sites"
```

---

## Accès futurs planifiés

### MCP SSH (Pi) — J+6-10

Permettrait à Claude de diagnostiquer un Pi directement :
- lire les logs journald
- vérifier l'état du sync-agent
- voir le contenu de `configuration.json`

Setup : `claude mcp add ssh-pi ssh -- pi@<IP_PI>` (nécessite clé SSH configurée)

### MCP Prometheus — Backlog

Permettrait à Claude de requêter les métriques Grafana pour diagnostiquer
un incident avant de coder un fix.

---

## Règle de session

Quand Claude dit ❌ Inconnu sur l'état DB → la réponse correcte est :
1. Vérifier avec le MCP postgres-readonly (une query suffit)
2. PUIS coder le fix

Jamais coder un fix prod sur hypothèse d'état DB.
