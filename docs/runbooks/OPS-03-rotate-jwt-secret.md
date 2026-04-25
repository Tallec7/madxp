# Runbook OPS-03 — Rotate JWT_SECRET

> **Objectif** : changer `JWT_SECRET` en prod sans déconnecter brutalement les ~50 sites + utilisateurs dashboard.
> **Fréquence** : trimestrielle (hygiène) ou immédiate (suspicion fuite).
> **Pré-requis** : accès Railway admin, accès DB prod (psql), ~1h, créneau low-traffic (idéalement nuit / dimanche matin).
> **Niveau de risque** : 🟠 modéré — toute erreur déconnecte la flotte ; suit la stratégie dual-key pour limiter le blast radius.

---

## Contexte

`JWT_SECRET` signe :

- Les tokens d'auth dashboard (HttpOnly cookie + Bearer)
- Les tokens d'auth des Pi (sync-agent + remote relay)

Source : [central-server/src/middleware/auth.ts](../../central-server/src/middleware/auth.ts:6) — `jwt.verify(token, JWT_SECRET)`.

Si tu changes `JWT_SECRET` en aveugle :

- Tous les tokens en cours deviennent invalides immédiatement
- Les utilisateurs dashboard sont déloggés
- Les Pi reçoivent 401 sur leur prochain heartbeat → reconnexion forcée

Pour éviter le downtime, on utilise la **stratégie dual-key** : accepter ancien + nouveau secret pendant 24h, puis ne garder que le nouveau.

---

## Décider : rotation programmée ou urgence ?

| Cas                                   | Stratégie                             |
| ------------------------------------- | ------------------------------------- |
| Hygiène trimestrielle, low-traffic    | **Dual-key 24h**                      |
| Suspicion fuite (logs, dump, employé) | **Dual-key 1h** + audit logs          |
| Compromission confirmée               | **Bascule immédiate** + reboot flotte |

---

## Étape 1 — Préparer le nouveau secret (~2 min)

```bash
# Générer un secret cryptographique fort (48 bytes base64url, comme runbook J1)
NEW_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")
echo "Nouveau secret généré (à ne pas logger en clair) : ${#NEW_SECRET} chars"
# NE PAS coller ce secret dans Slack, email, ou tout chat persistant
```

Le stocker temporairement en local dans un fichier protégé :

```bash
echo "$NEW_SECRET" > ~/.neopro-rotate-jwt-$(date +%Y%m%d).tmp
chmod 600 ~/.neopro-rotate-jwt-$(date +%Y%m%d).tmp
```

⚠️ **Ne jamais réutiliser un ancien `JWT_SECRET`.** Toujours générer un nouveau.

---

## Étape 2 — Phase A : Activer dual-key (~5 min)

Le code `auth.ts` n'accepte qu'un seul secret aujourd'hui. **Avant la rotation, livrer une PR qui ajoute le support dual-key** (à faire une fois, code permanent) :

```typescript
// central-server/src/middleware/auth.ts (ajout)
const JWT_SECRET_PRIMARY: Secret = process.env.JWT_SECRET ?? '';
const JWT_SECRET_SECONDARY: Secret | null = process.env.JWT_SECRET_OLD ?? null;

if (!JWT_SECRET_PRIMARY) {
  throw new Error('JWT_SECRET environment variable is required');
}

// Sign : toujours avec PRIMARY
// Verify : essayer PRIMARY d'abord, fallback SECONDARY si défini
function verifyToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, JWT_SECRET_PRIMARY) as JwtPayload;
  } catch (err) {
    if (JWT_SECRET_SECONDARY) {
      return jwt.verify(token, JWT_SECRET_SECONDARY) as JwtPayload;
    }
    throw err;
  }
}
```

✅ Si la PR support dual-key est déjà mergée, sauter à l'étape 3.

---

## Étape 3 — Phase B : Configurer Railway (~5 min)

Sur Railway, service `central-server` (prod) → onglet **Variables** :

```
JWT_SECRET_OLD = <ancienne valeur de JWT_SECRET>   # ← copier la valeur actuelle
JWT_SECRET     = <NEW_SECRET généré étape 1>       # ← écraser avec le nouveau
```

Cliquer **Deploy** pour redéployer avec les nouvelles vars.

⚠️ Vérifier que `JWT_SECRET_OLD` est bien renseigné **avant** de changer `JWT_SECRET`. Sinon les tokens existants deviennent invalides immédiatement.

---

## Étape 4 — Vérifier la cohabitation (~10 min)

```bash
# 1. Health checks API
curl -fsS https://api.neopro.kalonpartners.bzh/live
curl -fsS https://api.neopro.kalonpartners.bzh/ready

# 2. Tester un token signé avec l'ancien secret (toi connecté avant rotation)
#    → ouvrir le dashboard prod, faire une action → doit fonctionner

# 3. Tester un token signé avec le nouveau secret
#    → se déconnecter + reconnecter → action → doit fonctionner

# 4. Heartbeats Pi récents (les Pi avaient un token signé avec l'ancien secret)
psql "$PROD_DATABASE_URL" -c "SELECT COUNT(*) FROM sites WHERE last_seen > NOW() - INTERVAL '5 minutes';"
# Doit rester proche du nombre habituel (typiquement >40/50)
```

❌ Si beaucoup de sites passent offline → `JWT_SECRET_OLD` est mal configuré → revenir aux anciennes valeurs immédiatement.

---

## Étape 5 — Attendre 24h (rotation programmée) ou 1h (urgence) (~variable)

Pendant cette fenêtre :

- Les tokens existants (signés `OLD`) restent valides via fallback
- Les nouveaux tokens sont signés avec `NEW`
- À chaque renouvellement (login refresh, reconnect Pi), les clients basculent vers `NEW`

⚠️ **Surveiller en continu** :

- Métrique `neopro_auth_failures_total` (Prometheus)
- Logs Winston `level=error` mentionnant `JsonWebTokenError`
- Heartbeats Pi (devrait rester stable)

---

## Étape 6 — Phase C : Retirer l'ancien secret (~3 min)

Après 24h (ou 1h en urgence) :

Sur Railway → service prod → Variables :

- **Supprimer** `JWT_SECRET_OLD`
- Re-déployer

À ce stade, tout token encore signé avec l'ancien secret sera rejeté → utilisateurs sont forcés à se reconnecter (tokens d'accès = TTL court typiquement < 1h, refresh tokens TTL plus long).

---

## Étape 7 — Vérification finale (~5 min)

```bash
# Plus aucun JWT_SECRET_OLD côté Railway
gh api -X GET /repos/Tallec7/neopro/actions/secrets | jq -r '.secrets[].name' | grep -i JWT_SECRET || echo "OK"

# Heartbeats Pi stables
psql "$PROD_DATABASE_URL" -c "
  SELECT
    COUNT(*) FILTER (WHERE last_seen > NOW() - INTERVAL '5 minutes') AS online_5m,
    COUNT(*) FILTER (WHERE last_seen > NOW() - INTERVAL '1 hour')    AS online_1h,
    COUNT(*) AS total
  FROM sites
  WHERE site_type = 'pi';"

# Aucune erreur d'auth dans les 10 dernières minutes
# (via Logtail ou Railway logs)
```

---

## Étape 8 — Cleanup (~2 min)

```bash
# Supprimer le fichier temporaire local (RGPD + sécurité)
shred -u ~/.neopro-rotate-jwt-*.tmp

# Vérifier qu'aucun secret n'est resté dans l'historique shell
history | grep -E "JWT|crypto.randomBytes" | head -10
# Si visible → history -c (zsh) ou history -p (bash)
```

---

## Checklist post-rotation

- [ ] `JWT_SECRET` Railway = nouvelle valeur
- [ ] `JWT_SECRET_OLD` Railway = supprimé
- [ ] Heartbeats Pi stables (>40/50 online)
- [ ] Aucune erreur d'auth massive dans les logs (post-cooldown)
- [ ] Issue ops fermée + entry dans `docs/runbooks/JWT-ROTATION-LOG.md` :
  ```
  ## YYYY-MM-DD
  - Raison : trimestriel / urgence (préciser)
  - Fenêtre dual-key : 24h / 1h
  - Sites offline pendant rotation : <N>/50
  - Notes : RAS / incidents
  ```
- [ ] Si urgence (compromission) : audit `audit_logs` post-rotation, vérifier qu'aucune action suspecte n'a été faite avant détection

---

## Cas d'urgence : bascule immédiate (compromission confirmée)

Si tu sais que `JWT_SECRET` est compromis (employé sortant, dump leak, repo public) :

1. **Skip** la phase dual-key.
2. Générer + déployer le nouveau secret directement (`JWT_SECRET = NEW`, sans `OLD`).
3. Tous les tokens deviennent invalides → flotte se reconnecte automatiquement (~5 min).
4. Audit `audit_logs` table sur les dernières 24-72h pour repérer activité suspecte.
5. Si suspicion : rotation simultanée des secrets dérivés (`HOTSPOT_PSK_ENCRYPTION_KEY`, `RELEASE_TOKEN`...).

⚠️ Downtime utilisateur attendu : 30s-2 min (tokens invalidés, redirect vers /login).

---

## Métriques cibles

- **Sites offline pendant rotation** : < 5% transitoire, 0% post-stabilisation
- **Durée totale rotation** : ~30 min actif + 24h soak
- **MTTR si incident pendant rotation** : < 5 min (revert vers OLD via Railway)

## Référence

- [auth.ts](../../central-server/src/middleware/auth.ts)
- [J1 — Staging setup](J1-staging-setup.md) (génération secrets initiale)
- [OPS-01 — Rollback prod](OPS-01-rollback-prod.md)
- [CALENDAR.md](CALENDAR.md) (planning trimestriel)
