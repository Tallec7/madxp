---
name: check-db-source
description: Vérifie que central-server/.env pointe sur la DB Railway (pas la DB Supabase orpheline post-ADR-070) avant une session debug
---

Lis `central-server/.env` et extrais la valeur de `DATABASE_URL` :

```bash
grep '^DATABASE_URL=' central-server/.env 2>/dev/null || echo "NOT_FOUND"
```

Puis applique la logique suivante selon l'host détecté :

**Si `DATABASE_URL` est absent ou fichier introuvable :**
> ❌ `central-server/.env` introuvable ou `DATABASE_URL` manquant.
> Crée le fichier depuis `central-server/.env.example` et configure la DB.

**Si l'host contient `supabase.co` :**
> ⚠️  **ALERTE — DB orpheline post-ADR-070**
> `central-server/.env` pointe sur la Supabase abandonnée. Toute query psql renverra des données **gelées** (dernier snapshot au moment du switch Railway, PR #633). Diagnostic impossible en l'état.
>
> **Fix :**
> ```bash
> # Option A — interactif, persiste dans .env :
> ./scripts/use-prod-db.sh
>
> # Option B — psql sans persister :
> railway connect postgres-prod
> ```
> Ref : `docs/guides/LOCAL-DB-SWITCH.md`

**Si l'host contient `railway` ou `proxy.rlwy.net` :**
> ✅ **DB prod Railway** — OK pour debug.

**Si l'host est `localhost` ou `127.0.0.1` :**
> ℹ️  **DB locale** — données de dev, pas de prod. Normal en développement local.

**Sinon :**
> ⚠️  Format `DATABASE_URL` inattendu : `<valeur brute>`. Vérifier manuellement `central-server/.env`.
