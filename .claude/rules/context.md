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
- **Multi-tenant** : super_admin > admin > operator > viewer | advertiser | agency

## Stack

| Composant | Technologies |
|-----------|-------------|
| Frontend Raspberry | Angular 20, Socket.IO client, SCSS |
| Frontend Dashboard | Angular 20, Chart.js, Leaflet, Standalone Components |
| Backend API | Node.js 18+, Express 4.18, TypeScript strict |
| Base de données | PostgreSQL 15 (Supabase) - Pool: 5 connexions |
| Stockage | FTP (Hostinger) + Supabase Storage (fallback) |
| Auth | JWT HttpOnly cookie + Bearer token + MFA (TOTP) |
| Hébergement | Railway (API), Hostinger (Dashboard) |
| Tests | Jest + Supertest (API), Karma (Angular), Playwright (E2E) |

## Rôles utilisateurs

| Rôle | Actions |
|------|---------|
| Super Admin | Tout (users, sites, content, abonnements) |
| Operator | Gère ses clubs assignés, upload vidéos |
| Advertiser | Upload pubs, gère ses vidéos |
| Agency | Gère plusieurs advertisers |
| Club Staff | Utilise la télécommande locale |

## Glossaire essentiel

Voir `docs/GLOSSARY.md` pour le glossaire complet.

Termes les plus importants :
- **Site** : Un club sportif équipé d'un Raspberry Pi + TV
- **Boîtier** : Le Raspberry Pi physique installé dans un club
- **Déploiement** : Envoi d'une vidéo du cloud vers un ou plusieurs Pi
- **Heartbeat** : Signal envoyé toutes les 30s par le Pi au cloud
- **Phase de match** : Moment du match (neutral/before/during/after)
- **wlan0** : WiFi intégré du Pi → Hotspot pour /remote et admin :8080
- **wlan1** : Dongle USB WiFi → Connexion Internet vers le cloud
