# Diagramme de Sequence : Authentification

> Flux complet : Login -> JWT -> MFA -> Cookie -> Requetes authentifiees

## Flux Principal (Login)

```mermaid
sequenceDiagram
    autonumber
    participant U as Dashboard Angular
    participant I as Auth Interceptor
    participant A as POST /api/auth/login
    participant M as Auth Middleware
    participant DB as PostgreSQL
    participant MFA as MFA Service (TOTP)

    Note over U,DB: === PHASE 1 : LOGIN ===

    U->>A: POST /api/auth/login {email, password, mfaCode?}
    Note right of A: Rate limit: authRateLimit (anti-bruteforce)
    A->>A: Validation Joi (email, password min 6)
    A->>DB: SELECT * FROM users WHERE email = $1
    DB-->>A: user {id, password_hash, mfa_enabled, role, ...}

    alt Utilisateur non trouve ou mot de passe invalide
        A-->>U: 401 "Email ou mot de passe incorrect"
    end

    A->>A: bcrypt.compare(password, user.password_hash)

    alt MFA active (user.mfa_enabled = true)
        alt Pas de mfaCode fourni
            A-->>U: 200 {requireMfa: true, userId}
            Note over U: Affiche le champ MFA
            U->>A: POST /api/auth/login {email, password, mfaCode: "123456"}
        end

        A->>MFA: verifyMfaLogin(userId, mfaCode)
        MFA->>DB: SELECT mfa_secret, mfa_backup_codes FROM users WHERE id = $1
        DB-->>MFA: {mfa_secret, mfa_backup_codes}

        alt Code TOTP valide
            MFA->>MFA: authenticator.verify({token, secret, window: 1})
            MFA-->>A: true
        else Code TOTP invalide, essai backup code
            MFA->>MFA: Compare avec backup_codes (format XXXX-XXXX)
            alt Backup code valide
                MFA->>DB: UPDATE users SET mfa_backup_codes = $2 (consomme le code)
                MFA-->>A: true
            else Tous les codes invalides
                MFA-->>A: false
                A-->>U: 401 "Code MFA invalide"
            end
        end
    end

    Note over U,DB: === PHASE 2 : GENERATION JWT + COOKIE ===

    A->>A: jwt.sign({id, email, role, advertiser_id, agency_id}, JWT_SECRET, {expiresIn: '7d'})
    A->>DB: UPDATE users SET last_login_at = NOW() WHERE id = $1

    A-->>U: 200 + Set-Cookie: neopro_token=<JWT>
    Note right of A: Cookie: httpOnly, secure, sameSite=none,<br/>partitioned (Safari ITP), maxAge=7j

    Note over U: Stocke user en memoire (BehaviorSubject)<br/>Stocke token pour SSE fallback<br/>Demarre check periodique (5min)
```

## Requetes Authentifiees (3-tier fallback)

```mermaid
sequenceDiagram
    autonumber
    participant U as Dashboard Angular
    participant I as Auth Interceptor
    participant M as Auth Middleware
    participant C as Controller
    participant DB as PostgreSQL

    Note over U,DB: === REQUETE AUTHENTIFIEE ===

    U->>I: Requete API (ex: GET /api/sites)
    I->>I: withCredentials: true (envoie cookie)
    I->>I: Ajoute Authorization: Bearer <token> (fallback)
    I->>M: Requete avec Cookie + Header

    M->>M: 1. Check req.cookies['neopro_token']
    alt Cookie present
        M->>M: Utilise cookie
    else Pas de cookie
        M->>M: 2. Check Authorization: Bearer <token>
        alt Header present
            M->>M: Utilise header token
        else Pas de header
            M->>M: 3. Check ?token= query param (SSE)
            alt Query param present
                M->>M: Utilise query token
            else Aucun token
                M-->>U: 401 "Token manquant"
            end
        end
    end

    M->>M: jwt.verify(token, JWT_SECRET)
    alt Token invalide ou expire
        M-->>U: 401 "Token invalide ou expire"
        Note over U: Interceptor redirige vers /login
    end

    M->>M: Attache req.user = {id, email, role, ...}

    Note over M,C: === CONTROLE DE ROLE ===

    alt requireRole() middleware
        M->>M: Check user.role in allowedRoles
        alt super_admin
            M->>M: Bypass (acces universel, hierarchy=100)
        else Role insuffisant
            M-->>U: 403 "Acces refuse, role requis: ..."
        end
    end

    M->>C: Requete autorisee (req.user disponible)
    C->>DB: Query avec user context
    DB-->>C: Resultats (filtres RLS)
    C-->>U: 200 Response
```

## Authentification Raspberry Pi (API Key)

```mermaid
sequenceDiagram
    autonumber
    participant Pi as Raspberry Pi
    participant E as Endpoint API
    participant M as authenticateSiteApiKey
    participant DB as PostgreSQL

    Pi->>E: POST /api/impressions<br/>Authorization: Bearer <site_api_key>
    E->>M: Middleware authentication

    M->>M: Extrait API key du header
    M->>M: SHA256(api_key) pour comparaison
    M->>DB: SELECT id, site_name, api_key, status FROM sites WHERE id = $1
    DB-->>M: site {api_key_hash, status}

    alt API key invalide ou site disabled
        M-->>Pi: 401 "API key invalide"
    end

    M->>M: Attache req.siteId, req.siteName
    M->>E: Requete autorisee
    E-->>Pi: 200 Response
```

## Flux Reset Password

```mermaid
sequenceDiagram
    autonumber
    participant U as Dashboard
    participant A as Auth Controller
    participant DB as PostgreSQL
    participant E as Email Service

    U->>A: POST /api/auth/forgot-password {email}
    A->>DB: SELECT id FROM users WHERE email = $1 AND status = 'active'

    alt Utilisateur trouve
        A->>A: crypto.randomBytes(32).toString('hex')
        A->>A: SHA256(token) pour stockage
        A->>DB: INSERT INTO password_reset_tokens (user_id, token_hash, expires_at=+24h)
        A->>E: Envoie email avec lien contenant le token plain
    end

    A-->>U: 200 "Si l'email existe, un lien a ete envoye"
    Note right of A: Pas de fuite d'information<br/>(meme reponse si email inexistant)

    U->>A: POST /api/auth/reset-password {token, password, password_confirm}
    A->>A: SHA256(token)
    A->>DB: SELECT * FROM password_reset_tokens WHERE token_hash = $1 AND NOT used
    alt Token valide et non expire
        A->>A: bcrypt.hash(password, 10)
        A->>DB: BEGIN TRANSACTION
        A->>DB: UPDATE users SET password_hash = $1
        A->>DB: UPDATE password_reset_tokens SET used_at = NOW()
        A->>DB: COMMIT
        A-->>U: 200 "Mot de passe reinitialise"
    else Token invalide ou expire
        A-->>U: 400 "Token invalide ou expire"
    end
```

## Hierarchie des Roles

```
super_admin (100) ─── Acces total, bypass toutes les verifications
    │
admin (80) ─────── Dashboard admin, gestion users/sites/content
    │
operator (60) ──── Gere ses clubs assignes, upload videos
    │
viewer (40) ────── Lecture seule
    │
advertiser (30) ── Upload pubs, gere ses propres videos
agency (30) ────── Gere plusieurs advertisers
```

## Points de Securite

| Mecanisme         | Implementation                                         |
| ----------------- | ------------------------------------------------------ |
| Hash mot de passe | bcrypt, 10 rounds                                      |
| Token JWT         | 7 jours, signe avec JWT_SECRET                         |
| Cookie securise   | httpOnly + secure + sameSite=none + partitioned        |
| Anti-bruteforce   | Rate limiting strict sur /auth/\*                      |
| MFA               | TOTP (otplib) + 8 backup codes (XXXX-XXXX)             |
| Reset password    | Token SHA256 en DB, jamais stocke en clair, expire 24h |
| Anti-enumeration  | forgot-password retourne toujours 200                  |
| SQL injection     | Requetes parametrees exclusivement ($1, $2)            |
