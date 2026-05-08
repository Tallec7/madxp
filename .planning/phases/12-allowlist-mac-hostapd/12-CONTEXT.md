---
phase: 12
slug: observe-receivers
status: ready_to_plan
created: 2026-05-08
---

# Phase 12 — OBSERVE : Contexte & Décisions

## Goal

Quand un Fire Stick se connecte au hotspot Pi sans être assigné à un display,
l'admin le voit immédiatement dans la vue Écrans (badge ambre) et dispose d'une
métrique Prometheus. Le hotspot reste ouvert — aucune modification hostapd.

## Pourquoi pas de blocage MAC

La télécommande des bénévoles utilise le même hotspot Pi. Bloquer au niveau
hostapd (`macaddr_acl=1`) priverait d'IP les téléphones des bénévoles (MACs
inconnues, changeantes). Option retenue : observabilité passive uniquement.

## Décisions lockées (phases précédentes)

- `receivers.service.js` (Phase 5) détecte déjà `kind: 'firestick'` vs `kind: 'browser'`
  et expose `displayIndex` (null si non assigné). Le signal existe.
- `state-sync` relay Pi→cloud (Phase 7 + fix Phase 11) propage `receivers[]` au cloud.
- `GET /api/sites/:id/connected-receivers` expose déjà `{mac, kind, displayIndex, lastSeenAt}`.
- `displays-editor.component` (Phase 8/11) affiche déjà les receivers avec badges.

## Décisions discutées

### A — Emplacement dashboard

**Décision** : Badge ambre dans la section receivers existante de `displays-editor.component`.

Pas de nouvelle page. Les receivers détectés apparaissent déjà dans la vue Écrans.
On ajoute une distinction visuelle :

- `displayIndex !== null` → badge vert 📺 (existant Phase 8)
- `displayIndex === null` + `kind === 'firestick'` → badge ambre ⚠️ "Non assigné"
- `kind === 'browser'` → ignoré (téléphone bénévole, pas de badge)

### B — Auto-population à l'activation

**N/A** — Pas d'activation. L'observabilité est toujours active dès qu'un Fire Stick
non assigné est détecté.

### C — Expérience Fire Stick non assigné

**Décision** : Comportement Pi inchangé — le Fire Stick voit la page d'attente captive
(Phase 6, déjà implémenté). Pas de régression, pas de nouveau comportement côté TV.
Le seul changement visible = badge ambre dans le dashboard admin.

### D — Source du signal + métrique

**Décision** : Signal déjà disponible dans `receivers.service.js` via `displayIndex`.
Flow :

1. `receivers.service.js` détecte un firestick avec `displayIndex === null`
2. `_emitChange()` → `state-sync` → cloud (déjà câblé)
3. Cloud handler `receivers` : si firestick non assigné détecté pour la première fois
   → `logger.warn` + incrémente `neopro_hotspot_unknown_firestick_total{site_id}`
4. Métrique visible dans Grafana

Pas de modification Pi-side au-delà du log. Pas de `hostapdTelemetry.js`.

## Code context

### Fichiers à modifier

| Fichier                                                            | Changement                                               |
| ------------------------------------------------------------------ | -------------------------------------------------------- |
| `central-server/src/handlers/receivers.handler.ts` (ou équivalent) | Détecter firestick non assigné → log + métrique          |
| `central-server/src/services/metrics.service.ts`                   | Ajouter Counter `neopro_hotspot_unknown_firestick_total` |
| `central-dashboard/.../displays-editor.component`                  | Badge ambre pour firestick `displayIndex === null`       |
| `central-dashboard/.../displays-editor.component.spec.ts`          | Test badge ambre                                         |

### Fichiers clés existants à lire

| Fichier                                                       | Pourquoi                             |
| ------------------------------------------------------------- | ------------------------------------ |
| `central-server/src/handlers/` (handler receivers/state-sync) | Où traiter le signal entrant         |
| `central-server/src/services/metrics.service.ts`              | Pattern Counter existant             |
| `central-dashboard/.../displays-editor.component.html`        | Markup badges existants (Phase 8/11) |
| `central-server/src/routes/sites.routes.ts`                   | Route connected-receivers existante  |

### Patterns à réutiliser

- Badge vert Phase 11 : `.receiver-badge--assigned` → dupliquer en `.receiver-badge--unknown`
- Counter Prometheus : pattern `neopro_alerts_dedup_skipped_total` (ADR-111, labels)
- Handler state-sync : pattern relay receivers Phase 7

## Contraintes

- Ne PAS modifier `receivers.service.js` ni `hostapd.conf` — hotspot reste ouvert
- `kind === 'browser'` (téléphones bénévoles) → jamais de badge ambre, jamais de métrique
- La métrique ne s'incrémente qu'à la **première** détection d'un Fire Stick inconnu
  par session (pas à chaque tick de 10s) — dédupliquer par `(site_id, mac)`

## Hors scope (Phase 12)

- Blocage DHCP ou réseau → jamais (régression télécommande)
- Alerte push quand Fire Stick assigné disparaît → Phase 13
- Gestion d'une whitelist manuelle → déferred, non prioritaire
