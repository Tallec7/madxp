# Notion Import Files — SAFe Neopro

4 CSV files generated for Notion database import (18 Feb 2026).

## Files

### 1. roam-import.csv

- **Source**: `ROAM.md` (Risk Registry)
- **Rows**: 9 (1 header + 8 risks: R-01 through R-08)
- **Columns**: Name, Catégorie, Statut ROAM, Probabilité, Impact, Owner, PI, Mitigation, Critère de résolution
- **Notion Setup**: Create table "Risks" with these columns as property names

### 2. pi-objectives-import.csv

- **Source**: `PI-OBJECTIVES.md` (PI Planning)
- **Rows**: 13 (1 header + 12 objectives)
  - 4 PI-1 Committed
  - 2 PI-1 Stretch
  - 3 PI-2 (provisional)
  - 3 PI-3 (provisional)
- **Columns**: Name, PI, Type, Value Stream, Thème Stratégique, BV Planifié, BV Réel, Statut
- **Notion Setup**: Create table "PI Objectives" with these columns

### 3. implemented-backlog-import.csv

- **Source**: `IMPLEMENTED-BACKLOG.md` (Feature Registry)
- **Rows**: 177 (1 header + 176 features)
- **Columns**: Name, Code, Domaine, Statut, Fichiers clés, Version/Date
- **Domains** (13):
  - Authentification & Sécurité (13 features)
  - Gestion de Contenu & Vidéo (13 features)
  - Score en Direct & Overlays (10 features)
  - Déploiement & OTA (12 features)
  - Monétisation & Sponsors (14 features)
  - Analytics & Reporting (18 features)
  - Raspberry Pi (Edge) (21 features)
  - Résilience Réseau & Sync (17 features)
  - Monitoring & Alertes (22 features)
  - Administration & Infrastructure (22 features)
  - Playlists & Programmation (3 features)
  - Gestion Utilisateurs & Rôles (4 features)
  - Documentation & Qualité (7 features)
- **Notion Setup**: Create table "Implemented Features" with these columns

### 4. flow-metrics-import.csv

- **Source**: `FLOW-METRICS.md` (SAFe Flow Metrics)
- **Rows**: 7 (1 header + 6 metric entries)
  - 3 Sprint-level (Sprint 1, 2, 3)
  - 3 Value Stream-level (OVS1, OVS2, DVS-1)
- **Columns**: Name, PI, Sprint, Flow Velocity (items), Flow Time (jours), Flow Load (WIP), Flow Efficiency (%), Flow Distribution, Cycle Time PR (jours)
- **Notion Setup**: Create table "Flow Metrics" with these columns

## Encoding

All files are UTF-8 with comma delimiter. French characters (é, è, ê, ç, etc.) are properly supported.

## Notion Import Steps

1. Open each CSV file in Notion
2. Go to Database → Import CSV
3. Map columns to the properties listed above
4. Click Import

## Notes

- BV Réel and Statut fields in pi-objectives are intentionally left empty for PI-2 and PI-3 (to be filled during Inspect & Adapt)
- File paths in implemented-backlog-import contain multiple items separated by commas and are quoted for proper CSV parsing
- Flow metrics include both sprint-level and value stream-level aggregations
- All timestamps are ISO 8601 format where applicable

---

**Generated**: 19 Feb 2026 | Framework: SAFe 6.0 | Project: Neopro
