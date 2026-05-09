---
status: complete
phase: 11-reassign-ux-dashboard
source: 11-01-SUMMARY.md
started: 2026-05-07T19:35:00Z
updated: 2026-05-07T23:42:00Z
---

## Tests

### 1. Badge MAC séparé + bouton [Réassigner ▾]

expected: Sur un display déjà assigné à un Fire Stick (colonne Récepteur), deux éléments distincts apparaissent : (1) badge vert 📺 AA:BB…FF et (2) bouton [Réassigner ▾] en bleu souligné. La MAC n'est plus affichée DANS le bouton comme Phase 8.
result: pass

### 2. Filtrage MAC courante dans le dropdown

expected: Cliquer [Réassigner ▾] sur un display assigné ouvre le dropdown. La MAC actuellement assignée à ce display N'APPARAÎT PAS dans la liste (elle est filtrée). Seuls les autres Fire Sticks disponibles sont proposés.
result: pass

### 3. Sous-texte cross-display

expected: Dans le dropdown, si une MAC est déjà assignée à un autre display du même site, affiche "actuellement sur [Nom du display]" en gris sous la MAC (au lieu du "il y a X min" habituel).
result: skipped — aucun Fire Stick physique connecté au hotspot Pi lors du UAT. Couvert par Karma Test J (vert).

### 4. Réassignation atomique 1-clic

expected: Sélectionner une MAC déjà assignée à Display A depuis le dropdown de Display B : (1) Display A perd son Fire Stick (badge disparaît, repasse en [+ Assigner]), (2) Display B obtient le Fire Stick, tout ça en 1 seul clic, sans confirmation ni spinner. Le PATCH est envoyé une seule fois.
result: skipped — nécessite 2 Fire Sticks physiques. Couvert par Karma Test K (vert, assert emitCount === 1 + 2 mutations atomiques).

### 5. Badge stale — MAC hors-ligne

expected: Si le Fire Stick assigné à un display est hors-ligne (Pi ne le voit plus), le badge 📺 AA:BB…FF apparaît désaturé/grisé (opacity réduite) avec un tooltip "Récepteur hors-ligne" au survol. Le bouton [Réassigner ▾] reste actif.
result: skipped — nécessite Fire Stick assigné puis déconnecté. Couvert par Karma Test L (vert, assert .receiver-badge--stale + title='Récepteur hors-ligne').

### 6. Dropdown actif quand liste filtrée vide

expected: Si le seul Fire Stick dans connectedReceivers est celui déjà assigné au display (liste filtrée = vide), le bouton [Réassigner ▾] reste actif (non-disabled). Cliquer affiche "Aucun récepteur détecté (Pi hors-ligne ?)" + l'option "— Désassigner" en rouge.
result: skipped — nécessite état réseau spécifique. Couvert par Karma Test M (vert, assert button non-disabled + placeholder + Désassigner visible).

## Summary

total: 6
passed: 2
issues: 0
pending: 0
skipped: 4 (tous couverts par Karma Tests J/K/L/M)

## Bug fix post-UAT

Receivers non propagés au cloud (dropdown affichait "Aucun récepteur détecté") :
race condition dans `sync-agent/src/agent.js` — le `setImmediate` de flush se
déclenchait dans `connect()` (trop tôt, avant auth cloud), jamais dans
`handleAuthenticated()`. Fix : `_pendingStateSync` + flush dans `setImmediate()`
déplacé dans `handleAuthenticated()`. Commit 9b1380e1, PR #901.

Vérifié : `GET /api/sites/c994620c.../connected-receivers` → `[{mac: "0c:43:f9:36:04:77", ...}]`

## Gaps

[none — tests manuels skippés remplacés par couverture Karma complète 13/13]
