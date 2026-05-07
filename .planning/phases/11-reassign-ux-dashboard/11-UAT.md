---
status: testing
phase: 11-reassign-ux-dashboard
source: 11-01-SUMMARY.md
started: 2026-05-07T19:35:00Z
updated: 2026-05-07T19:35:00Z
---

## Current Test

<!-- OVERWRITE each test - shows where we are -->

number: 3
name: Sous-texte cross-display
expected: |
Dans le dropdown, si une MAC est déjà assignée à un autre display du même site,
affiche "actuellement sur [Nom du display]" en gris sous la MAC
(au lieu du "il y a X min" habituel).
awaiting: user response

## Tests

### 1. Badge MAC séparé + bouton [Réassigner ▾]

expected: Sur un display déjà assigné à un Fire Stick (colonne Récepteur), deux éléments distincts apparaissent : (1) badge vert 📺 AA:BB…FF et (2) bouton [Réassigner ▾] en bleu souligné. La MAC n'est plus affichée DANS le bouton comme Phase 8.
result: pass

### 2. Filtrage MAC courante dans le dropdown

expected: Cliquer [Réassigner ▾] sur un display assigné ouvre le dropdown. La MAC actuellement assignée à ce display N'APPARAÎT PAS dans la liste (elle est filtrée). Seuls les autres Fire Sticks disponibles sont proposés.
result: pass

### 3. Sous-texte cross-display

expected: Dans le dropdown, si une MAC est déjà assignée à un autre display du même site, affiche "actuellement sur [Nom du display]" en gris sous la MAC (au lieu du "il y a X min" habituel).
result: [pending]

### 4. Réassignation atomique 1-clic

expected: Sélectionner une MAC déjà assignée à Display A depuis le dropdown de Display B : (1) Display A perd son Fire Stick (badge disparaît, repasse en [+ Assigner]), (2) Display B obtient le Fire Stick, tout ça en 1 seul clic, sans confirmation ni spinner. Le PATCH est envoyé une seule fois.
result: [pending]

### 5. Badge stale — MAC hors-ligne

expected: Si le Fire Stick assigné à un display est hors-ligne (Pi ne le voit plus), le badge 📺 AA:BB…FF apparaît désaturé/grisé (opacity réduite) avec un tooltip "Récepteur hors-ligne" au survol. Le bouton [Réassigner ▾] reste actif.
result: [pending]

### 6. Dropdown actif quand liste filtrée vide

expected: Si le seul Fire Stick dans connectedReceivers est celui déjà assigné au display (liste filtrée = vide), le bouton [Réassigner ▾] reste actif (non-disabled). Cliquer affiche "Aucun récepteur détecté (Pi hors-ligne ?)" + l'option "— Désassigner" en rouge.
result: [pending]

## Summary

total: 6
passed: 2
issues: 0
pending: 4
skipped: 0

## Gaps

[none yet]
