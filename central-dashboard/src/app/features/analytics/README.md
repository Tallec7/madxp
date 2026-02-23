# Analytics Feature - Status: ACTIVE

## Composants

| Fichier                             | Route                   | Description                                | Roles                        |
| ----------------------------------- | ----------------------- | ------------------------------------------ | ---------------------------- |
| `analytics.component.ts`            | `/analytics`            | Vue flotte (statuts, metriques, activite)  | super_admin, admin, operator |
| `analytics-traction.component.ts`   | `/analytics/traction`   | KPIs traction & croissance                 | super_admin, admin           |
| `analytics-comparison.component.ts` | `/analytics/comparison` | Comparaison multi-sites (Chart.js)         | super_admin, admin           |
| `realtime-dashboard.component.ts`   | `/analytics/realtime`   | Tableau de bord temps reel (polling 10s)   | super_admin, admin           |
| `club-analytics.component.ts`       | `/sites/:id/analytics`  | Analytics par club (usage, contenu, sante) | super_admin, admin, operator |
| `analytics-nav.component.ts`        | -                       | Navigation par onglets entre sous-pages    | -                            |

## Limites connues

- "Temps de diffusion" = somme durees video x lectures (pas le temps ecran reel)
- "Disponibilite" = mesure connexion cloud, pas usage TV physique
- L'activite recente sur la page flotte est derivee des statuts de connexion (pas de flux d'evenements dedie)
