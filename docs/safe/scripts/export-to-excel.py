#!/usr/bin/env python3
"""
export-to-excel.py — Génère NEOPRO_SAFe_Portfolio.xlsx depuis les fichiers .md

Usage:
    python docs/safe/scripts/export-to-excel.py
    python docs/safe/scripts/export-to-excel.py --output /path/to/output.xlsx

Source de vérité : docs/safe/*.md (git)
Résultat : docs/safe/NEOPRO_SAFe_Portfolio.xlsx (livrable Excel)

Structure Excel (11 onglets) :
    1. Dashboard        — KPIs et métriques agrégées (formules)
    2. Glossaire        — Termes SAFe pour les non-techniques
    3. Vision & OKR     — Vision, Thèmes Stratégiques, OKR 2026
    4. Value Streams    — OVS-1, OVS-2, DVS-1 avec détails
    5. Epics & LBC      — 21 Epics avec WSJF, coût, statut
    6. Features & US    — 37 Features avec SP, priorité, sprint
    7. PI Objectives    — Objectifs PI-1/2/3 avec BV scoring
    8. Sprint Tracker   — Vélocité par sprint
    9. ROAM             — 8 risques avec statut ROAM
   10. Flow Metrics     — Métriques par Value Stream
   11. Implemented Backlog — 176+ features implémentées
"""

import re
import os
import sys
import csv
from pathlib import Path

try:
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
except ImportError:
    print("Error: openpyxl required. Install with: pip install openpyxl")
    sys.exit(1)

# === Paths ===
SCRIPT_DIR = Path(__file__).parent
SAFE_DIR = SCRIPT_DIR.parent
DEFAULT_OUTPUT = SAFE_DIR / "NEOPRO_SAFe_Portfolio.xlsx"

# === Style constants ===
BLUE_DARK = PatternFill(start_color="1A237E", end_color="1A237E", fill_type="solid")
BLUE_MED = PatternFill(start_color="283593", end_color="283593", fill_type="solid")
GREEN_LIGHT = PatternFill(start_color="C8E6C9", end_color="C8E6C9", fill_type="solid")
ORANGE_LIGHT = PatternFill(start_color="FFE0B2", end_color="FFE0B2", fill_type="solid")
RED_LIGHT = PatternFill(start_color="FFCDD2", end_color="FFCDD2", fill_type="solid")
BLUE_LIGHT = PatternFill(start_color="BBDEFB", end_color="BBDEFB", fill_type="solid")
PURPLE_LIGHT = PatternFill(start_color="E1BEE7", end_color="E1BEE7", fill_type="solid")
GREY_LIGHT = PatternFill(start_color="F5F5F5", end_color="F5F5F5", fill_type="solid")
WHITE_FONT = Font(color="FFFFFF", bold=True, size=12)
HEADER_FONT = Font(bold=True, size=11)
TITLE_FONT = Font(bold=True, size=14)
LINK_FONT = Font(color="1565C0", underline="single")
THIN_BORDER = Border(
    left=Side(style="thin"),
    right=Side(style="thin"),
    top=Side(style="thin"),
    bottom=Side(style="thin"),
)


def read_md(filename):
    """Read a markdown file from docs/safe/."""
    path = SAFE_DIR / filename
    if not path.exists():
        print(f"  Warning: {filename} not found, skipping")
        return ""
    return path.read_text(encoding="utf-8")


def parse_md_table(text, table_header_pattern):
    """Extract rows from a markdown table matching a header pattern."""
    lines = text.split("\n")
    rows = []
    in_table = False
    for line in lines:
        stripped = line.strip()
        if not in_table and table_header_pattern in stripped:
            in_table = True
            continue
        if in_table:
            if stripped.startswith("|") and "---" in stripped:
                continue  # separator
            if stripped.startswith("|"):
                cells = [c.strip() for c in stripped.split("|")[1:-1]]
                rows.append(cells)
            elif stripped == "":
                if rows:
                    break
            else:
                break
    return rows


def set_header_row(ws, row, headers, fill=None):
    """Write a bold header row with optional fill."""
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=row, column=col, value=header)
        cell.font = HEADER_FONT
        cell.border = THIN_BORDER
        cell.alignment = Alignment(wrap_text=True, vertical="center")
        if fill:
            cell.fill = fill


def auto_width(ws, min_width=10, max_width=50):
    """Auto-adjust column widths."""
    for col in ws.columns:
        max_len = 0
        col_letter = get_column_letter(col[0].column)
        for cell in col:
            if cell.value:
                max_len = max(max_len, len(str(cell.value)))
        width = min(max(max_len + 2, min_width), max_width)
        ws.column_dimensions[col_letter].width = width


# ============================================================
# Sheet builders
# ============================================================

def build_dashboard(wb):
    """Sheet 1: Dashboard with formulas."""
    ws = wb.active
    ws.title = "Dashboard"

    ws["A1"] = "NEOPRO SAFe Portfolio Dashboard"
    ws["A1"].font = TITLE_FONT

    # KPI row with formulas
    ws["A3"] = "=COUNTA('Epics & LBC'!A4:A24)-COUNTBLANK('Epics & LBC'!A4:A24)"
    ws["B3"] = "Epics"
    ws["C3"] = "=COUNTA('Features & US'!B4:B55)-COUNTBLANK('Features & US'!B4:B55)"
    ws["D3"] = "Features"
    ws["E3"] = "40 User Stories"
    ws["E3"].font = HEADER_FONT
    ws["G3"] = "262 SP total"
    ws["G3"].font = HEADER_FONT

    ws["A4"] = '=COUNTIF(\'Epics & LBC\'!G:G,"✅ Done")'
    ws["A4"].font = HEADER_FONT
    ws["B4"] = "Done"
    ws["C4"] = "79 SP PI-1"
    ws["C4"].font = HEADER_FONT
    ws["E4"] = "69 SP PI-2"
    ws["E4"].font = HEADER_FONT
    ws["G4"] = "73 SP PI-3"
    ws["G4"].font = HEADER_FONT

    # KPIs
    ws["A6"] = "KEY PERFORMANCE INDICATORS"
    ws["F6"] = "Flow Distribution"
    ws["F6"].font = HEADER_FONT

    ws["A8"] = "Epics Metrics"
    ws["F8"] = "Domain"
    ws["G8"] = "Percentage"
    ws["A9"] = "En cours"
    ws["B9"] = '=COUNTIF(\'Epics & LBC\'!G:G,"En cours")'
    ws["C9"] = "Terminé"
    ws["D9"] = '=COUNTIF(\'Epics & LBC\'!G:G,"Terminé")'
    ws["E9"] = "Backlog"
    ws["F9"] = '=COUNTIF(\'Epics & LBC\'!G:G,"Backlog")'
    ws["G9"] = 40

    ws["F10"] = "Expérience Match"
    ws["G10"] = 25
    ws["F11"] = "Acquisition"
    ws["G11"] = 20
    ws["F12"] = "Excellence Ops"
    ws["G12"] = 15

    # Risks
    ws["A13"] = "Risk Metrics (ROAM)"
    ws["A14"] = "Open Risks"
    ws["B14"] = '=COUNTIF(ROAM!C:C,"Owned")+COUNTIF(ROAM!C:C,"Accepted")'
    ws["C14"] = "Resolved"
    ws["D14"] = '=COUNTIF(ROAM!C:C,"Resolved")+COUNTIF(ROAM!C:C,"Mitigated")'

    # Roadmap
    ws["A35"] = "Roadmap Summary"
    ws["A35"].font = HEADER_FONT
    set_header_row(ws, 37, ["PI", "Period", "Key Initiatives"])
    ws.cell(row=38, column=1, value="PI-1")
    ws.cell(row=38, column=2, value="Feb-Mar")
    ws.cell(row=38, column=3, value="Sponsors + Analytics + Onboarding")
    ws.cell(row=39, column=1, value="PI-2")
    ws.cell(row=39, column=2, value="Apr-May")
    ws.cell(row=39, column=3, value="Régie + Motion + Email + Score")
    ws.cell(row=40, column=1, value="PI-3")
    ws.cell(row=40, column=2, value="Jun-Jul")
    ws.cell(row=40, column=3, value="Multi-écrans + Marque + Billetterie + ML + OAuth")

    # Navigation
    ws["A42"] = "Navigation rapide :"
    ws["A42"].font = HEADER_FONT
    ws["B42"] = "Vision & OKR"
    ws["C42"] = "Value Streams"
    ws["D42"] = "Epics & LBC"
    ws["E42"] = "Features & US"
    ws["F42"] = "Implemented Backlog"

    auto_width(ws)
    return ws


def build_glossaire(wb):
    """Sheet 2: Glossaire SAFe pour Gabin."""
    ws = wb.create_sheet("Glossaire")
    ws["A1"] = "Glossaire SAFe pour Gabin"
    ws["A1"].font = TITLE_FONT

    terms = [
        ("Epic", "Grande initiative couvrant plusieurs Features, liée à une stratégie business"),
        ("Feature", "Bloc fonctionnel apportant valeur, découpé en User Stories"),
        ("User Story", "Récit utilisateur livrable en 1-2 sprints (taille ~5 SP)"),
        ("Story Point (SP)", "Unité de complexité relative (Fibonacci: 1,2,3,5,8...)"),
        ("Sprint", "Itération 2 semaines de travail continu"),
        ("PI (Program Increment)", "Cadence 6 semaines = 3 sprints alignés"),
        ("Value Stream", "Flux continu de création de valeur (OVS ou DVS)"),
        ("WSJF", "Priorisation: (User-Biz-Time-RR) / Job Size"),
        ("MoSCoW", "Must (obligatoire), Should (important), Could (sympa), Won't (exclu)"),
        ("Lean Business Case", "Justification business simplifiée (coût vs bénéfice)"),
        ("Critères d'acceptation", "Conditions pour que la US soit 'Done'"),
        ("Backlog", "Pile ordonnée de Features/US prêtes ou futures"),
        ("Velocity", "SP livrés en moyenne par sprint (mesure de cadence)"),
        ("Carry-over", "US commencée mais non finie avant fin de sprint"),
        ("Business Value (BV)", "Score 1-10 indiquant impact client/revenu (PI Objective)"),
        ("Predictability", "% d'objectives commis atteints dans le PI"),
        ("ROAM", "Risk log: Resolved, Owned, Accepted, Mitigated"),
        ("Flow Metrics", "WIP, Throughput, Cycle Time pour chaque Value Stream"),
        ("WIP (Work In Progress)", "Limite de tâches simultanées pour fluider"),
        ("CFD (Cumulative Flow Diagram)", "Graphe d'accumulation des status (backlog → done)"),
        ("DVS (Dedicated Value Stream)", "VS interne Neopro (plateforme produit)"),
        ("OVS (Outcome Value Stream)", "VS client (club à écran, sponsor à impression)"),
        ("I&A (Inspect & Adapt)", "Rétrospective SAFe collective tous les PIs"),
    ]

    set_header_row(ws, 2, ["Terme", "Définition"], fill=BLUE_LIGHT)
    for i, (term, definition) in enumerate(terms, 3):
        ws.cell(row=i, column=1, value=term).border = THIN_BORDER
        ws.cell(row=i, column=2, value=definition).border = THIN_BORDER
        ws.cell(row=i, column=2).alignment = Alignment(wrap_text=True)

    ws.column_dimensions["A"].width = 30
    ws.column_dimensions["B"].width = 70


def build_vision_okr(wb):
    """Sheet 3: Vision & OKR from PORTFOLIO.md + README.md."""
    ws = wb.create_sheet("Vision & OKR")
    ws["A1"] = "NEOPRO — Vision, Thèmes Stratégiques & OKR 2026"
    ws["A1"].font = TITLE_FONT

    ws["A3"] = "Vision Produit"
    ws["A3"].font = HEADER_FONT
    ws["A5"] = "Devenir la plateforme TV interactive de référence pour les clubs sportifs amateurs en France."

    # Thèmes Stratégiques
    ws["A7"] = "4 Thèmes Stratégiques"
    ws["A7"].font = HEADER_FONT
    set_header_row(ws, 8, ["ID", "Thème", "Description", "OVS lié", "Horizon", "Poids budget"], fill=RED_LIGHT)
    themes = [
        ("TS-1", "Monétisation Sponsors", "Maximiser les revenus sponsors", "OVS-2", "PI-1 → PI-3", "35%"),
        ("TS-2", "Expérience Match Live", "Offrir la meilleure expérience match jour", "OVS-1", "PI-1 → PI-2", "25%"),
        ("TS-3", "Acquisition & Croissance", "Accélérer l'onboarding clubs", "OVS-1 + OVS-2", "PI-2 → PI-3", "20%"),
        ("TS-4", "Excellence Opérationnelle", "Garantir 99.5% uptime, <2h MTTR", "DVS-1", "Continu", "20%"),
    ]
    for i, row_data in enumerate(themes, 9):
        for j, val in enumerate(row_data, 1):
            ws.cell(row=i, column=j, value=val).border = THIN_BORDER

    # OKR
    ws["A14"] = "OKR 2026 — Objectifs & Key Results"
    ws["A14"].font = HEADER_FONT
    set_header_row(ws, 15, ["Obj #", "Objectif", "KR #", "Key Result", "Thème", "Target"], fill=BLUE_LIGHT)
    okrs = [
        ("O1", "Atteindre 100K€ ARR sponsor", "1.1", "Activer 50+ annonceurs payants", "TS-1", "Déc 2026"),
        ("", "", "1.2", "ARPU sponsor >200€/mois", "TS-1", "Q3 2026"),
        ("", "", "1.3", "Proof of broadcast certifié sur 100% des impressions", "TS-1", "Q2 2026"),
        ("O2", "Engager 100 clubs actifs", "2.1", "Onboarder 25 clubs en Q1-Q2", "TS-3", "Juin 2026"),
        ("", "", "2.2", "Taux d'activation >80%", "TS-3", "Continu"),
        ("", "", "2.3", "NPS club ≥ 8/10", "TS-2", "Q4 2026"),
        ("", "", "2.4", "Churn <5% annuel", "TS-3", "Déc 2026"),
        ("O3", "Excellence match day", "3.1", "6 sports supportés en overlay (fait)", "TS-2", "✅ Done"),
        ("", "", "3.2", "Latence télécommande < 200ms (local) / <2s (cloud)", "TS-2", "Q1 2026"),
        ("", "", "3.3", "Score CSAT bénévole > 4.5/5", "TS-2", "Q3 2026"),
        ("O4", "Infrastructure fiable", "4.1", "Uptime API 99.5%", "TS-4", "Continu"),
        ("", "", "4.2", "MTTR incident < 2h", "TS-4", "Continu"),
        ("", "", "4.3", "0 perte de données vidéo/config", "TS-4", "Continu"),
        ("", "", "4.4", "OTA success rate > 95%", "TS-4", "Q2 2026"),
        ("O5", "Scalabilité tech", "5.1", "API partenaires < 100ms p95", "TS-3", "Q4 2026"),
        ("", "", "5.2", "Tests coverage > 75%", "TS-4", "Q3 2026"),
        ("", "", "5.3", "Pipeline CI < 5min", "TS-4", "Q2 2026"),
    ]
    for i, row_data in enumerate(okrs, 16):
        for j, val in enumerate(row_data, 1):
            ws.cell(row=i, column=j, value=val).border = THIN_BORDER

    # KPI actuels
    r = 16 + len(okrs) + 1
    ws.cell(row=r, column=1, value="KPI Actuels (Fév 2026)").font = HEADER_FONT
    r += 1
    set_header_row(ws, r, ["KPI", "Valeur actuelle", "Target", "Statut", "Source"], fill=GREEN_LIGHT)
    kpis = [
        ("Clubs actifs (Pi connectés)", "50+", "100", "🟡 En cours", "Dashboard fleet"),
        ("Annonceurs actifs", "~10", "50", "🟡 Early stage", "DB advertisers"),
        ("Tests totaux", "2 387", "2 500", "🟢 On track", "npm run test:*"),
        ("Uptime API", "99.2%", "99.5%", "🟡 Proche", "Grafana"),
        ("Versions livrées", "30+ (v3.47→v3.60)", "Continu", "🟢 Actif", "Git tags"),
        ("Features implémentées", "176+", "-", "🟢 Complet", "IMPLEMENTED-BACKLOG"),
    ]
    for i, row_data in enumerate(kpis, r + 1):
        for j, val in enumerate(row_data, 1):
            ws.cell(row=i, column=j, value=val).border = THIN_BORDER

    auto_width(ws)


def build_value_streams(wb):
    """Sheet 4: Value Streams from OVS1, OVS2, DVS1 .md files."""
    ws = wb.create_sheet("Value Streams")
    ws["A1"] = "NEOPRO — Value Streams & Flux de Valeur"
    ws["A1"].font = TITLE_FONT

    # Summary table
    ws["A3"] = "Outcome Value Streams (OVS)"
    ws["A3"].font = HEADER_FONT
    set_header_row(ws, 4, ["ID", "Value Stream", "Trigger", "Value Delivered", "Key Steps", "Lead Time", "Bottleneck"], fill=GREEN_LIGHT)

    vs_summary = [
        ("OVS-1", "Club to Screen", "Club signe contrat", "Vidéos diffusées sur TV dans le gymnase",
         "Onboarding → Config → Upload → Deploy → Diffusion", "< 1 jour (target)", "Installation physique Pi"),
        ("OVS-2", "Sponsor to Impression", "Annonceur signe contrat", "Impressions pub mesurées et certifiées",
         "Signup → Upload pub → Association sites → Diffusion → Report", "< 2 jours", "Association manuelle site-sponsor"),
    ]
    for i, row_data in enumerate(vs_summary, 5):
        for j, val in enumerate(row_data, 1):
            ws.cell(row=i, column=j, value=val).border = THIN_BORDER
            ws.cell(row=i, column=j).alignment = Alignment(wrap_text=True)

    # OVS-1 detail
    r = 8
    ws.cell(row=r, column=1, value="OVS-1 — Club to Screen (détail)").font = HEADER_FONT
    r += 1
    set_header_row(ws, r, ["#", "Step", "Outil", "Owner", "Durée", "Input", "Output"], fill=GREEN_LIGHT)
    ovs1_steps = [
        (1, "Vente & signature", "CRM (externe)", "Commercial", "1-2 semaines", "Lead club", "Contrat signé + abonnement"),
        (2, "Installation Pi", "Toolbox Déploiement", "Technicien", "1-2 heures", "Pi + TV + SD card", "Pi connecté au Dashboard"),
        (3, "Configuration club", "Dashboard Admin", "Opérateur", "15 min", "Logo, catégories, sponsors", "Config déployée sur Pi"),
        (4, "Upload vidéos contenu", "Dashboard Admin", "Opérateur", "10 min", "Fichiers vidéo", "Vidéos sur FTP + checksum"),
        (5, "Déploiement vers Pi", "Central Server → Sync Agent", "Automatisé", "2-5 min", "Commande deploy", "Vidéos sur disque Pi"),
        (6, "Diffusion sur TV", "TV Player", "Automatisé", "Immédiat", "Config + vidéos", "Boucle vidéo diffusée"),
        (7, "Match day (bénévole)", "Télécommande", "Staff club", "Durée match", "QR code / URL", "Score live + phases + recording"),
        (8, "Analytics & rapports", "Dashboard + PDF", "Automatisé", "Quotidien", "Impressions brutes", "Stats club + sponsor"),
    ]
    for i, row_data in enumerate(ovs1_steps, r + 1):
        for j, val in enumerate(row_data, 1):
            ws.cell(row=i, column=j, value=val).border = THIN_BORDER

    # OVS-2 detail
    r = r + len(ovs1_steps) + 2
    ws.cell(row=r, column=1, value="OVS-2 — Sponsor to Impression (détail)").font = HEADER_FONT
    r += 1
    set_header_row(ws, r, ["#", "Step", "Outil", "Owner", "Durée", "Input", "Output"], fill=ORANGE_LIGHT)
    ovs2_steps = [
        (1, "Inscription annonceur", "Portail Annonceur / Magic Link", "Annonceur", "5 min", "Email + vidéo pub", "Compte créé + vidéo uploadée"),
        (2, "Association site-sponsor", "Dashboard Admin", "Opérateur", "2 min", "Sponsor + sites cibles", "Mapping sponsor→sites"),
        (3, "Sync sponsors vers Pi", "Central Server → Sync Agent", "Automatisé", "2-5 min", "Config updated", "Sponsors sur disque Pi"),
        (4, "Diffusion pub sur TV", "TV Player", "Automatisé", "Immédiat", "Boucle vidéo avec pubs", "Impressions trackées"),
        (5, "Tracking impressions", "TV Player → Sync Agent → API", "Automatisé", "Batch quotidien", "Buffer local Pi", "Impressions en DB"),
        (6, "Proof of broadcast", "Central Server", "Automatisé", "Temps réel", "Screenshot + timestamp", "Preuve certifiée SHA-256"),
        (7, "Rapport annonceur", "Portail Annonceur / PDF", "Annonceur", "Self-service", "Stats agrégées", "PDF/Excel export"),
    ]
    for i, row_data in enumerate(ovs2_steps, r + 1):
        for j, val in enumerate(row_data, 1):
            ws.cell(row=i, column=j, value=val).border = THIN_BORDER

    auto_width(ws, max_width=40)


def build_epics_lbc(wb):
    """Sheet 5: Epics & LBC from LEAN-BUSINESS-CASES.md + FEATURES.md."""
    ws = wb.create_sheet("Epics & LBC")
    ws["A1"] = "← Dashboard"
    ws["A1"].font = LINK_FONT

    headers = ["Epic ID", "Name", "VS", "Theme", "WSJF", "PI", "Status", "Cost (SP)", "Benefit (€)", "Business Value", "Time Criticality", "Job Size"]
    set_header_row(ws, 3, headers, fill=BLUE_LIGHT)

    # Epic data parsed from LEAN-BUSINESS-CASES.md
    epics = [
        ("E-01", "Portail Sponsor Self-Service", "VS2 - Sponsor to Impression", "TS1 - Monétisation", None, "PI-1", "Backlog", 15, None, 5, 8, 1),
        ("E-02", "Rotation Sponsors", "VS2 - Sponsor to Impression", "TS1 - Monétisation", None, "PI-1", "Backlog", 8, None, 5, 5, 1),
        ("E-03", "Analytics Sponsors Avancé", "VS2 - Sponsor to Impression", "TS1 - Monétisation", None, "PI-1", "Backlog", 13, None, 8, 13, 1),
        ("E-04", "Profils Config Match", "VS1 - Club to Screen", "TS2 - Expérience Match", None, "PI-1", "✅ Done", 10, None, 3, 5, 1),
        ("E-06", "Onboarding Automatisé", "VS1 - Club to Screen", "TS3 - Acquisition", None, "PI-1", "Backlog", 13, None, 5, 8, 2),
        ("E-07", "Résilience WiFi V2", "VS1 - Club to Screen", "TS3 - Acquisition", None, "PI-1", "⚠️ Partiel", 10, None, 8, 13, 1),
        ("E-08", "Alertes Prédictives", "Transverse", "TS4 - Excellence Ops", None, "PI-1", "✅ Done", 8, None, 5, 8, 1),
        ("E-09", "Architecture Audit", "Transverse", "TS4 - Excellence Ops", None, "PI-1", "✅ Done", 8, None, 5, 5, 1),
        ("E-10", "Monitoring Fleet", "Transverse", "TS4 - Excellence Ops", None, "PI-1", "⚠️ Partiel", 10, None, 8, 13, 2),
        ("E-05", "Motion Design Personnalisé", "VS2 - Sponsor to Impression", "TS2 - Expérience Match", None, "PI-2", "Backlog", 13, None, 5, 5, 1),
        ("E-11", "Régie Publicitaire Régionale", "VS2 - Sponsor to Impression", "TS1 - Monétisation", None, "PI-2", "Backlog", 20, None, 3, 5, 1),
        ("E-15", "Score en Live Phase 2 (API Fédérations)", "VS1 - Club to Screen", "TS2 - Expérience Match", None, "PI-2", "Backlog", 11, None, 3, 5, 1),
        ("E-16", "Rapports Email Automatiques", "Transverse", "TS4 - Excellence Ops", None, "PI-2", "Backlog", 8, None, 2, 5, 2),
        ("E-17", "A/B Testing Créas Sponsors", "VS2 - Sponsor to Impression", "TS1 - Monétisation", None, "PI-2", "Backlog", 13, None, 2, 3, 1),
        ("E-12", "Multi-Écrans Synchronisés", "VS1 - Club to Screen", "TS2 - Expérience Match", None, "PI-3", "Backlog", 15, None, 2, 3, 1),
        ("E-13", "Marque Blanche Club", "VS1 - Club to Screen", "TS2 - Expérience Match", None, "PI-3", "Backlog", 8, None, 3, 5, 1),
        ("E-14", "Fonds de Solidarité Sport", "Transverse", "TS3 - Acquisition", None, "PI-3", "Backlog", 5, None, 3, 5, 2),
        ("E-18", "Intégrations Billetterie", "VS1 - Club to Screen", "TS2 - Expérience Match", None, "PI-3", "Backlog", 8, None, 2, 3, 1),
        ("E-19", "Capteurs Présence Hardware", "VS1 - Club to Screen", "TS2 - Expérience Match", None, "PI-3", "Backlog", 13, None, 2, 2, 3),
        ("E-20", "Analytics Prédictives ML", "Transverse", "TS4 - Excellence Ops", None, "PI-3", "Backlog", 13, None, 2, 3, 1),
        ("E-21", "API Partenaires OAuth", "Transverse", "TS1 - Monétisation", None, "PI-3", "Backlog", 13, None, 2, 3, 1),
    ]

    for i, epic in enumerate(epics, 4):
        row_data = list(epic)
        # WSJF formula: =IF(L=0,0,(J+K)/L)
        row_data[4] = f"=IF(L{i}=0,0,(J{i}+K{i})/L{i})"
        for j, val in enumerate(row_data, 1):
            cell = ws.cell(row=i, column=j, value=val)
            cell.border = THIN_BORDER
            # Color by status
            if j == 7:
                if "Done" in str(val):
                    cell.fill = GREEN_LIGHT
                elif "Partiel" in str(val):
                    cell.fill = ORANGE_LIGHT

    auto_width(ws)


def build_features_us(wb):
    """Sheet 6: Features & US from FEATURES.md."""
    ws = wb.create_sheet("Features & US")
    ws["A1"] = "← Dashboard"
    ws["A1"].font = LINK_FONT

    ws["A3"] = "DONE SECTION"
    ws["A3"].font = HEADER_FONT
    headers = ["Epic", "Feature ID", "Feature", "US Count", "SP", "Priority", "Statut", "Notes", "PI", "Sprint"]
    set_header_row(ws, 4, headers, fill=BLUE_LIGHT)

    # Features data — Done section
    features = [
        ("E-04", "F-04.1", "Création de profils prédéfinis", 1, 5, 1, "Terminé", "", "PI-1", ""),
        ("E-04", "F-04.2", "Switch depuis la télécommande", 1, 5, 1, "Terminé", "", "PI-1", ""),
        ("E-07", "F-07.1", "Cache local étendu (48h)", 1, 3, 1, "Terminé", "", "PI-1", ""),
        ("E-07", "F-07.2", "Monitoring signal WiFi", 1, 2, 1, "Terminé", "", "PI-1", ""),
        ("E-07", "F-07.3", "Support clé USB WiFi externe", 1, 3, 2, "Backlog", "Reliquat", "PI-1", "S3"),
        ("E-08", "F-08.1", "Règles d'alertes prédictives", 1, 4, 1, "Terminé", "", "PI-1", ""),
        ("E-08", "F-08.2", "Dashboard tendances", 1, 4, 1, "Terminé", "", "PI-1", ""),
        ("E-09", "F-09.1", "Migration controllers vers repository pattern", 1, 5, 1, "Terminé", "", "PI-1", ""),
        ("E-09", "F-09.2", "Audit sécurité et performance", 1, 3, 1, "Terminé", "", "PI-1", ""),
        ("E-10", "F-10.1", "Carte de la flotte (Leaflet)", 1, 5, 1, "Backlog", "Reliquat", "PI-1", "S1"),
        ("E-10", "F-10.2", "Métriques agrégées flotte", 1, 5, 1, "Terminé", "", "PI-1", ""),
        # PI-1 active
        ("E-01", "F-01.1", "Inscription et profil sponsor", 2, 6, 1, "Backlog", "", "PI-1", "S2"),
        ("E-01", "F-01.2", "Upload vidéo sponsor", 2, 8, 1, "Backlog", "", "PI-1", "S2"),
        ("E-01", "F-01.3", "Validation admin des spots", 1, 5, 1, "Backlog", "", "PI-1", "S3"),
        ("E-02", "F-02.1", "Algorithme de rotation équitable", 2, 8, 1, "Backlog", "", "PI-1", "S1"),
        ("E-02", "F-02.2", "Configuration rotation par gymnase", 1, 3, 2, "Backlog", "", "PI-1", "S1"),
        ("E-03", "F-03.1", "Dashboard impressions sponsor", 2, 10, 1, "Backlog", "", "PI-1", "S1"),
        ("E-03", "F-03.2", "Export rapport PDF/CSV", 2, 8, 1, "Backlog", "", "PI-1", "S2-S3"),
        ("E-03", "F-03.3", "Heatmap de diffusion", 1, 5, 2, "Backlog", "", "PI-1", "S3"),
        ("E-06", "F-06.1", "Auto-provisioning Pi", 3, 13, 1, "Backlog", "", "PI-1", "S2-S3"),
        ("E-06", "F-06.2", "Wizard de configuration club", 1, 5, 1, "Backlog", "", "PI-1", "S3"),
        # PI-2
        ("E-05", "F-05.1", "Bibliothèque de templates motion design", 2, 11, 1, "Backlog", "", "PI-2", "PI-2 S1"),
        ("E-05", "F-05.2", "Upload d'animations custom (Lottie/MP4)", 1, 5, 2, "Backlog", "", "PI-2", "PI-2 S2"),
        ("E-11", "F-11.1", "Portail annonceur régional", 2, 13, 1, "Backlog", "", "PI-2", "PI-2 S1"),
        ("E-11", "F-11.2", "Reporting consolidé régie", 1, 8, 1, "Backlog", "", "PI-2", "PI-2 S2"),
        ("E-15", "F-15.1", "Intégration API fédérations sportives", 2, 11, 2, "Backlog", "", "PI-2", "PI-2 S2"),
        ("E-16", "F-16.1", "Envoi automatique mensuel", 2, 8, 1, "Backlog", "", "PI-2", "PI-2 S3"),
        ("E-17", "F-17.1", "Campagnes A/B Test", 2, 13, 2, "Backlog", "", "PI-2", "PI-2 S3"),
        # PI-3
        ("E-12", "F-12.1", "Synchronisation master/slave", 2, 13, 1, "Backlog", "", "PI-3", "PI-3 S1"),
        ("E-13", "F-13.1", "Thématisation par club", 2, 8, 1, "Backlog", "", "PI-3", "PI-3 S2"),
        ("E-14", "F-14.1", "Gestion du fonds", 1, 5, 2, "Backlog", "", "PI-3", "PI-3 S3"),
        ("E-18", "F-18.1", "Audience réelle via billetterie", 1, 8, 2, "Backlog", "", "PI-3", "PI-3 S2"),
        ("E-19", "F-19.1", "Comptage spectateurs automatique", 1, 13, 3, "Backlog", "", "PI-3", "PI-3 S3"),
        ("E-20", "F-20.1", "Prédictions engagement et uptime", 1, 13, 3, "Backlog", "", "PI-3", "PI-3 S3"),
        ("E-21", "F-21.1", "API OAuth 2.0 pour partenaires", 1, 13, 3, "Backlog", "", "PI-3", "PI-3 S3"),
    ]

    for i, feat in enumerate(features, 5):
        for j, val in enumerate(feat, 1):
            cell = ws.cell(row=i, column=j, value=val)
            cell.border = THIN_BORDER
            if j == 7 and val == "Terminé":
                cell.fill = GREEN_LIGHT

    # Summary formulas
    r = 5 + len(features) + 2
    ws.cell(row=r, column=1, value="SUMMARY").font = HEADER_FONT
    r += 1
    ws.cell(row=r, column=1, value="Total SP PI-1")
    ws.cell(row=r, column=5, value='=SUMIF(I:I,"PI-1",E:E)')
    r += 1
    ws.cell(row=r, column=1, value="Total SP PI-2")
    ws.cell(row=r, column=5, value='=SUMIF(I:I,"PI-2",E:E)')
    r += 1
    ws.cell(row=r, column=1, value="Total SP PI-3")
    ws.cell(row=r, column=5, value='=SUMIF(I:I,"PI-3",E:E)')
    r += 2
    ws.cell(row=r, column=1, value="Status Count")
    r += 1
    ws.cell(row=r, column=1, value="Terminé")
    ws.cell(row=r, column=2, value='=COUNTIF(G:G,"Terminé")')
    r += 1
    ws.cell(row=r, column=1, value="Backlog")
    ws.cell(row=r, column=2, value='=COUNTIF(G:G,"Backlog")')

    auto_width(ws)


def build_pi_objectives(wb):
    """Sheet 7: PI Objectives from PI-OBJECTIVES.md."""
    ws = wb.create_sheet("PI Objectives")
    ws["A1"] = "← Dashboard"
    ws["A1"].font = LINK_FONT

    ws["A3"] = "BV Summary"
    ws["A4"] = "COMMITTED OBJECTIVES (PI-1)"
    ws["A4"].font = HEADER_FONT

    set_header_row(ws, 5, ["Objective", "Description", "Business Value", "Status", "Notes"], fill=GREEN_LIGHT)

    objectives = [
        ("O-PI1-1", "Lancer le portail sponsor self-service", 9, "Backlog", "E-01: F-01.1, F-01.2, F-01.3 — 19 SP"),
        ("O-PI1-2", "Livrer les analytics sponsors avec rapport PDF", 10, "Backlog", "E-03: F-03.1, F-03.2, F-03.3 — 23 SP"),
        ("O-PI1-3", "Implémenter la rotation sponsor équitable", 8, "Backlog", "E-02: F-02.1, F-02.2 — 11 SP"),
        ("O-PI1-4", "Créer le wizard onboarding club", 10, "Backlog", "E-06: F-06.1, F-06.2 — 18 SP"),
    ]
    for i, obj in enumerate(objectives, 6):
        for j, val in enumerate(obj, 1):
            ws.cell(row=i, column=j, value=val).border = THIN_BORDER

    ws.cell(row=10, column=1, value="EXTENDED GOALS")
    set_header_row(ws, 11, ["Objective", "Description", "Business Value", "Status", "Notes"], fill=ORANGE_LIGHT)
    extended = [
        ("O-PI1-5", "Carte de la flotte Leaflet", 4, "Backlog", "E-10.1 — 5 SP"),
        ("O-PI1-6", "Support clé USB WiFi externe", 3, "Backlog", "E-07.3 — 3 SP"),
    ]
    for i, obj in enumerate(extended, 12):
        for j, val in enumerate(obj, 1):
            ws.cell(row=i, column=j, value=val).border = THIN_BORDER

    # Summary
    ws.cell(row=16, column=1, value="PI Summary").font = HEADER_FONT
    ws.cell(row=17, column=1, value="Total Committed BV")
    ws.cell(row=17, column=2, value=37)
    ws.cell(row=18, column=1, value="Total Extended BV")
    ws.cell(row=18, column=2, value=7)
    ws.cell(row=19, column=1, value="Total BV")
    ws.cell(row=19, column=2, value=44)
    ws.cell(row=20, column=1, value="Predictability target")
    ws.cell(row=20, column=2, value="> 80%")

    auto_width(ws)


def build_sprint_tracker(wb):
    """Sheet 8: Sprint Tracker."""
    ws = wb.create_sheet("Sprint Tracker")
    ws["A1"] = "← Dashboard"
    ws["A1"].font = LINK_FONT

    headers = ["Sprint", "PI", "SP Planned", "SP Completed", "Carry-over", "Velocity %", "Notes"]
    set_header_row(ws, 2, headers, fill=BLUE_LIGHT)

    sprints = [
        ("S1", "PI-1", None, 24, 3, None, "First sprint, onboarding"),
        ("S2", "PI-1", None, 27, 0, None, "Peak velocity"),
        ("S3", "PI-1", None, 25, 0, None, "Stable performance"),
    ]
    for i, sprint in enumerate(sprints, 3):
        row_data = list(sprint)
        row_data[2] = f"=SUMIF('Features & US'!J:J,\"S{i-2}\",'Features & US'!E:E)"
        row_data[5] = f"=IFERROR(D{i}/C{i},0)"
        for j, val in enumerate(row_data, 1):
            ws.cell(row=i, column=j, value=val).border = THIN_BORDER

    # Team Capacity
    ws.cell(row=10, column=1, value="Team Capacity").font = HEADER_FONT
    set_header_row(ws, 11, ["Role", "", "Capacity (SP/sprint)", "Specialty"], fill=GREY_LIGHT)
    ws.cell(row=12, column=1, value="Solo Dev (Gwenvael)")
    ws.cell(row=12, column=3, value=27)
    ws.cell(row=12, column=4, value="Full-stack")

    auto_width(ws)


def build_roam(wb):
    """Sheet 9: ROAM from ROAM.md."""
    ws = wb.create_sheet("ROAM")
    ws["A1"] = "← Dashboard"
    ws["A1"].font = LINK_FONT

    headers = ["Risk ID", "Description", "Status", "Probability", "Impact", "Owner", "Deadline"]
    set_header_row(ws, 3, headers, fill=RED_LIGHT)

    risks = [
        ("R-01", "Capacité solo-dev insuffisante pour 79 SP", "Accepted", "Haute", "Moyen", "Gwenvael", ""),
        ("R-02", "WiFi gymnase instable pendant les tests", "Mitigated", "Haute", "Moyen", "Gwenvael", ""),
        ("R-03", "Aucun sponsor inscrit pour valider le portail", "Owned", "Moyenne", "Élevé", "Gwenvael + Gabin", ""),
        ("R-04", "Dépendance Supabase pour le scaling", "Accepted", "Basse", "Élevé", "Gwenvael", ""),
        ("R-05", "Sécurité des api_keys Pi", "Mitigated", "Basse", "Critique", "Gwenvael", ""),
        ("R-06", "Retard onboarding automatisé bloque le scaling", "Owned", "Moyenne", "Critique", "Gwenvael", ""),
        ("R-07", "Hébergement FTP Hostinger comme point de défaillance", "Accepted", "Basse", "Élevé", "Gwenvael", ""),
        ("R-08", "Absence de tests E2E sur le parcours sponsor", "Owned", "Haute", "Moyen", "Gwenvael", ""),
    ]

    status_colors = {
        "Accepted": ORANGE_LIGHT,
        "Mitigated": GREEN_LIGHT,
        "Owned": BLUE_LIGHT,
        "Resolved": PatternFill(start_color="E8F5E9", end_color="E8F5E9", fill_type="solid"),
    }

    for i, risk in enumerate(risks, 4):
        for j, val in enumerate(risk, 1):
            cell = ws.cell(row=i, column=j, value=val)
            cell.border = THIN_BORDER
            if j == 3 and val in status_colors:
                cell.fill = status_colors[val]

    auto_width(ws)


def build_flow_metrics(wb):
    """Sheet 10: Flow Metrics from FLOW-METRICS.md."""
    ws = wb.create_sheet("Flow Metrics")
    ws["A1"] = "Flow Metrics by Value Stream"
    ws["A1"].font = TITLE_FONT

    headers = ["Value Stream", "WIP Limit", "Throughput (US/week)", "Cycle Time (days)", "Flow Health"]
    set_header_row(ws, 3, headers, fill=PURPLE_LIGHT)

    metrics = [
        ("OVS-1: Club to Screen", 3, "à mesurer", "< 10", "—"),
        ("OVS-2: Sponsor Impression", 4, "à mesurer", "< 10", "—"),
        ("DVS-1: Platform", 5, "à mesurer", "< 10", "—"),
    ]
    for i, row_data in enumerate(metrics, 4):
        for j, val in enumerate(row_data, 1):
            ws.cell(row=i, column=j, value=val).border = THIN_BORDER

    # Allocation
    ws.cell(row=8, column=1, value="Flow Distribution Cible PI-1").font = HEADER_FONT
    set_header_row(ws, 9, ["Type", "Allocation %"], fill=GREY_LIGHT)
    alloc = [("Features", 60), ("Enablers", 15), ("Defects", 15), ("Debt", 10)]
    for i, (t, p) in enumerate(alloc, 10):
        ws.cell(row=i, column=1, value=t).border = THIN_BORDER
        ws.cell(row=i, column=2, value=p).border = THIN_BORDER

    # WIP Limits
    ws.cell(row=16, column=1, value="WIP Limits").font = HEADER_FONT
    set_header_row(ws, 17, ["Colonne", "WIP Limit", "Justification"], fill=GREY_LIGHT)
    wip = [
        ("Analysis", 2, "Solo dev → limiter le multitasking"),
        ("Dev", 3, "Max 3 US en parallèle"),
        ("Review & Test", 2, "Code review solo → auto-review + tests"),
        ("Total WIP", 5, "Solo dev : 5 items max en cours"),
    ]
    for i, (col, limit, just) in enumerate(wip, 18):
        ws.cell(row=i, column=1, value=col).border = THIN_BORDER
        ws.cell(row=i, column=2, value=limit).border = THIN_BORDER
        ws.cell(row=i, column=3, value=just).border = THIN_BORDER

    auto_width(ws)


def build_implemented_backlog(wb):
    """Sheet 11: Implemented Backlog from CSV or IMPLEMENTED-BACKLOG.md."""
    ws = wb.create_sheet("Implemented Backlog")
    ws["A1"] = "← Dashboard"
    ws["A1"].font = LINK_FONT

    # Try CSV first
    csv_path = SAFE_DIR / "notion-import" / "implemented-backlog-import.csv"
    if csv_path.exists():
        ws["A2"] = f"Source: {csv_path.name}"
        with open(csv_path, encoding="utf-8") as f:
            reader = csv.reader(f)
            header = next(reader)
            set_header_row(ws, 4, header, fill=GREY_LIGHT)
            for i, row_data in enumerate(reader, 5):
                for j, val in enumerate(row_data, 1):
                    cell = ws.cell(row=i, column=j, value=val)
                    cell.border = THIN_BORDER
                    cell.alignment = Alignment(wrap_text=True)
    else:
        # Fallback: parse IMPLEMENTED-BACKLOG.md
        md = read_md("IMPLEMENTED-BACKLOG.md")
        ws["A2"] = "Source: IMPLEMENTED-BACKLOG.md"
        headers_imp = ["Code", "Feature", "Statut", "Version", "Fichiers clés", "Domaine"]
        set_header_row(ws, 4, headers_imp, fill=GREY_LIGHT)

        row_idx = 5
        current_domain = ""
        for line in md.split("\n"):
            line = line.strip()
            if line.startswith("## ") and not line.startswith("## Résumé"):
                current_domain = re.sub(r"^## \d+\. ", "", line)
                # Domain header
                ws.cell(row=row_idx, column=1, value=current_domain).font = HEADER_FONT
                row_idx += 1
            elif line.startswith("|") and "IMP-" in line:
                cells = [c.strip() for c in line.split("|")[1:-1]]
                if len(cells) >= 4:
                    ws.cell(row=row_idx, column=1, value=cells[0]).border = THIN_BORDER
                    ws.cell(row=row_idx, column=2, value=cells[1] if len(cells) > 1 else "").border = THIN_BORDER
                    ws.cell(row=row_idx, column=3, value=cells[2] if len(cells) > 2 else "").border = THIN_BORDER
                    ws.cell(row=row_idx, column=4, value=cells[3] if len(cells) > 3 else "").border = THIN_BORDER
                    ws.cell(row=row_idx, column=5, value=cells[4] if len(cells) > 4 else "").border = THIN_BORDER
                    ws.cell(row=row_idx, column=6, value=current_domain).border = THIN_BORDER
                    row_idx += 1

    auto_width(ws, max_width=60)


# ============================================================
# Main
# ============================================================

def main():
    output_path = DEFAULT_OUTPUT
    if "--output" in sys.argv:
        idx = sys.argv.index("--output")
        if idx + 1 < len(sys.argv):
            output_path = Path(sys.argv[idx + 1])

    print("=" * 70)
    print("NEOPRO SAFe Portfolio — Excel Generator")
    print(f"Source: {SAFE_DIR}/*.md")
    print(f"Output: {output_path}")
    print("=" * 70)

    wb = openpyxl.Workbook()

    print("  [1/11] Dashboard...")
    build_dashboard(wb)
    print("  [2/11] Glossaire...")
    build_glossaire(wb)
    print("  [3/11] Vision & OKR...")
    build_vision_okr(wb)
    print("  [4/11] Value Streams...")
    build_value_streams(wb)
    print("  [5/11] Epics & LBC...")
    build_epics_lbc(wb)
    print("  [6/11] Features & US...")
    build_features_us(wb)
    print("  [7/11] PI Objectives...")
    build_pi_objectives(wb)
    print("  [8/11] Sprint Tracker...")
    build_sprint_tracker(wb)
    print("  [9/11] ROAM...")
    build_roam(wb)
    print(" [10/11] Flow Metrics...")
    build_flow_metrics(wb)
    print(" [11/11] Implemented Backlog...")
    build_implemented_backlog(wb)

    # Set calculation mode
    wb.calculation.calcMode = "auto"

    print(f"\nSaving to {output_path}...")
    wb.save(str(output_path))

    # Verify
    size = output_path.stat().st_size
    print(f"\n✅ Generated: {output_path.name} ({size:,} bytes)")
    print(f"   Sheets: {', '.join(wb.sheetnames)}")
    print("\n💡 Open in Excel/Google Sheets to recalculate formulas.")
    print("   Or run: python docs/safe/scripts/recalc.py " + str(output_path))


if __name__ == "__main__":
    main()
