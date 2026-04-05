# Contexte Métier Neopro

**Neopro** = Système de TV interactive pour clubs sportifs.

## Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Dashboard     │ ──API── │  Central Server  │ ──WS──  │  Raspberry Pi   │
│   (Angular 20)  │         │  (Express/PG)    │         │  dans le club   │
└─────────────────┘         └──────────────────┘         └─────────────────┘
     Admin                       Cloud                        Edge
```

- **Un "site"** = Un club sportif avec un Raspberry Pi connecté à une TV
- **Les vidéos** sont uploadées dans le cloud, puis déployées vers les Pi
- **La flotte** = 50+ boîtiers Pi gérés depuis un dashboard central
- **Multi-tenant** : super_admin > admin > operator > viewer | advertiser | agency | club

## Stack

| Composant          | Technologies                                                   |
| ------------------ | -------------------------------------------------------------- |
| Frontend Raspberry | Angular 20, Socket.IO client, SCSS                             |
| Frontend Dashboard | Angular 20, Chart.js, Leaflet, Standalone Components           |
| Backend API        | Node.js 20+, Express 4.18, TypeScript strict                   |
| Base de données    | PostgreSQL 15 (Supabase Transaction Mode, port 6543) - Pool: 5 |
| Stockage           | FTP Hostinger (unifié via `storage.service.ts`)                |
| Auth               | JWT HttpOnly cookie + Bearer token + MFA (TOTP)                |
| Hébergement        | Railway (API, Dockerfile node:20-slim), Hostinger (Dashboard)  |
| Tests              | Jest + Supertest (API), Karma (Angular), Playwright (E2E)      |

## Rôles utilisateurs

| Rôle        | Actions                                                                    |
| ----------- | -------------------------------------------------------------------------- |
| Super Admin | Tout (users, sites, content, abonnements)                                  |
| Operator    | Gère ses clubs assignés, upload vidéos                                     |
| Advertiser  | Upload pubs, gère ses vidéos                                               |
| Agency      | Gère plusieurs advertisers                                                 |
| Club        | Portail club : upload/supprime ses vidéos, déploie sur son Pi (pas NEOPRO) |
| Club Staff  | Utilise la télécommande locale (pas de compte dashboard)                   |

## Glossaire

Voir `docs/GLOSSARY.md` pour le glossaire complet (termes métier, techniques, rôles).
