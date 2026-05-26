# Contexte Métier MadXP

**MadXP** = Système de TV interactive pour clubs sportifs (ex-NEOPRO, rebrand en cours — cf. [ADR-133](../../docs/adr/ADR-133-rebrand-neopro-to-madxp.md)).

## Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Dashboard     │ ──API── │  Central Server  │ ──WS──  │  Raspberry Pi   │
│   (Angular 20)  │         │  (Express/PG)    │         │  dans le club   │
└─────────────────┘         └──────────────────┘         └─────────────────┘
     Admin                       Cloud                        Edge
```

- **Un "site"** = Un club sportif avec un Raspberry Pi connecté à une TV, ou un site SaaS (navigateur uniquement, sans matériel — ADR-037)
- **Les vidéos** sont uploadées dans le cloud, puis déployées vers les Pi (mode Pi) ou servies directement via URLs FTP (mode SaaS)
- **La flotte** = 50+ boîtiers Pi + sites SaaS gérés depuis un dashboard central
- **`site_type`** : `'pi'` (matériel), `'saas'` (navigateur uniquement), `'demo'` (vitrine)
- **Multi-tenant** : super_admin > admin > operator > viewer | advertiser | agency | club

## Modèle de connectivité Pi vs SaaS

L'offre **Pi** est vendue comme "TV interactive sans dépendance internet en live". Un Pi a besoin d'internet uniquement pour bootstrap initial + reconnexion régulière (cf. `docs/specs/features/pi-connectivity-model.spec.md` pour le garde-fou). Entre deux reconnexions, le Pi fonctionne en pleine autonomie.

Deux UIs cohabitent volontairement, pour deux personae distinctes :

| UI                       | Persona                                     | Connectivité            | Usage typique                                                                                                       |
| ------------------------ | ------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Central dashboard        | Super admin / operator / advertiser distant | Toujours en ligne       | Push content vers la flotte, support distant, multi-sites, analytics, abonnements. **Pas d'accès physique aux Pi.** |
| `:8080` (admin Pi local) | Opérateur ON-SITE au club                   | Pi possiblement offline | Config locale, debug, profils, sponsors, vidéos locales, diag réseau, switch club.                                  |

**Implication produit (ADR-120)** : toute feature touchant `categories`, `sponsors`, `timeCategories`, `displays`, `profiles/{id}.json` ou `configuration.json` doit être réalisable depuis `:8080` quand le Pi est offline. Sinon l'opérateur terrain est bloqué jusqu'au prochain reconnect. Pour `site_type = 'pi'`, le Pi est source de vérité de sa config locale ; le cloud reflète et orchestre. Pour `site_type = 'saas'`, le cloud reste source de vérité (pas de `:8080`).

Détails complets : [ADR-120](../../docs/adr/ADR-120-pi-saas-ownership-model.md), [admin-pi-local.spec.md](../../docs/specs/features/admin-pi-local.spec.md).

## Stack

| Composant          | Technologies                                                       |
| ------------------ | ------------------------------------------------------------------ |
| Frontend Raspberry | Angular 20, Socket.IO client, SCSS                                 |
| Frontend Dashboard | Angular 20, Chart.js, Leaflet, Standalone Components               |
| Backend API        | Node.js 20+, Express 4.18, TypeScript strict                       |
| Base de données    | PostgreSQL 18 (Railway interne, port 5432) - Pool: 5 - cf. ADR-070 |
| Stockage           | FTP Hostinger (unifié via `storage.service.ts`)                    |
| Auth               | JWT HttpOnly cookie + Bearer token + MFA (TOTP)                    |
| Hébergement        | Railway (API, Dockerfile node:20-slim), Hostinger (Dashboard)      |
| Tests              | Jest + Supertest (API), Karma (Angular), Playwright (E2E)          |

## Rôles utilisateurs

| Rôle        | Actions                                                                   |
| ----------- | ------------------------------------------------------------------------- |
| Super Admin | Tout (users, sites, content, abonnements)                                 |
| Operator    | Gère ses clubs assignés, upload vidéos                                    |
| Advertiser  | Upload pubs, gère ses vidéos                                              |
| Agency      | Gère plusieurs advertisers                                                |
| Club        | Portail club : upload/supprime ses vidéos, déploie sur son Pi (pas MadXP) |
| Club Staff  | Utilise la télécommande locale (pas de compte dashboard)                  |

## Glossaire

Voir `docs/GLOSSARY.md` pour le glossaire complet (termes métier, techniques, rôles).
