---
phase: 10-captive-auto
verified: 2026-05-07T20:45:00Z
status: human_needed
score: 3/4 must-haves verified
re_verification: false
human_verification:
  - test: 'Fire Stick AFTSS (0c:43:f9:36:04:77) auto-launch Silk Browser'
    expected: "Silk Browser s'ouvre automatiquement sur la page Neopro dans les 10s apres connexion au hotspot Pi, OU notification systeme 'Connectez-vous au reseau' apparait (1 tap acceptable)"
    why_human: "Fire OS CaptivePortalLauncher est un comportement runtime specifique au firmware Fire OS 8 et au modele AFTSS. Le 302 nginx est verifie programmatiquement, mais le declenchement effectif du lanceur natif ne peut pas etre simule en test. La RESEARCH.md Q1 documente l'inconsistance connue entre modeles."
  - test: 'Fallback CAPTIVE-07 manuel via firetvcaptiveportal.com'
    expected: "Ouvrir Silk manuellement et taper firetvcaptiveportal.com affiche la page d'attente Neopro avec la MAC du Fire Stick"
    why_human: "La route /captive/wait est verifiee par smoke test, mais le parcours complet (DNS hijack -> page d'attente affichee avec MAC correcte) necessite un vrai device Fire Stick sur le hotspot Pi."
---

# Phase 10: CAPTIVE-AUTO Verification Report

**Phase Goal:** Un Fire Stick branche sur le hotspot Pi ouvre automatiquement le portail captif sans aucune manipulation de la telecommande par le benevole.
**Verified:** 2026-05-07T20:45:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                            | Status      | Evidence                                                                                                                                                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | wifistub.html retourne 302 (pas 200 Success) pour declencher CaptivePortalLauncher Fire OS (CAPTIVE-05)          | VERIFIED    | neopro-base.conf ligne 69: `return 302 http://$host/kindle-wifi/wifiredirect.html;` — smoke CAPTIVE-05 vert                                                                                                                                                                              |
| 2   | wifiredirect.html redirige vers la racine Pi (Angular bootstrap) (CAPTIVE-05/06)                                 | VERIFIED    | neopro-base.conf ligne 78: `return 302 http://192.168.4.1/;` — smoke CAPTIVE-05/06 vert                                                                                                                                                                                                  |
| 3   | Silk s'ouvre automatiquement au boot Fire Stick sans manipulation telecommande (CAPTIVE-05/06)                   | NEEDS HUMAN | Le 302 nginx est delivre (valide par curl sur Pi RACC). Le declenchement CaptivePortalLauncher Fire OS ne peut pas etre verifie sans device physique. SUMMARY.md indique "Physical test performed" mais le resultat explicite (auto-launch OK / notification / rien) n'est pas consigne. |
| 4   | La page d'attente reste accessible manuellement via firetvcaptiveportal.com si l'auto-launch echoue (CAPTIVE-07) | VERIFIED    | /captive/wait existe et sert firestick-wait.html — smoke CAPTIVE-07 vert. firestick-captive.conf catch-all redirige vers 192.168.4.1/.                                                                                                                                                   |

**Score:** 3/4 truths verified (1 needs human)

### Required Artifacts

| Artifact                                                    | Expected                                                                                | Status   | Details                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `raspberry/config/nginx/neopro-base.conf`                   | wifistub 302 + nouveau bloc wifiredirect                                                | VERIFIED | Lignes 68-80: deux blocs Phase 10 presentes, `return 302 http://$host/kindle-wifi/wifiredirect.html` et `return 302 http://192.168.4.1/`. Aucun `return 200 Success` dans le bloc wifistub.                                                             |
| `central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts` | 6 guards Phase 10: wifistub 302, wifiredirect block, no Success, CAPTIVE-07 regressions | VERIFIED | describe 'Phase 10 — CAPTIVE-AUTO Silk auto-launch' present ligne 3621. 6 tests. extractNginxBlock helper ligne 3612. Assertion `toContain('Success')` supprimee du test CAPTIVE-01. Tous les 6 tests PASS.                                             |
| `docs/guides/CAPTIVE-AUTO-OTA.md`                           | Procédure OTA + checklist Fire Stick AFTSS                                              | VERIFIED | Fichier present. 2 occurrences `ssh pi@neopro.local`, 9 occurrences `302`, 4 references aux requirements CAPTIVE-05/06/07. Contenu substantiel: Option A (install.sh) + Option B (scp), checklist, rollback, observabilite, sequence DNS→nginx→Angular. |
| `raspberry/config/nginx/firestick-captive.conf`             | POC Pi RACC config miroir 302 (deviation auto-fixee)                                    | VERIFIED | Fichier present (31 lignes). Mirrors le comportement 302 de neopro-base.conf pour le serveur Pi RACC qui avait ce bloc en sites-enabled. wifistub → wifiredirect → 192.168.4.1/.                                                                        |

### Key Link Verification

| From                           | To                                              | Via                                                                  | Status      | Details                                                                                                                                                            |
| ------------------------------ | ----------------------------------------------- | -------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fire OS CaptivePortalLauncher  | /kindle-wifi/wifistub.html                      | DNS hijack spectrum.s3.amazonaws.com → 192.168.4.1 (dnsmasq Phase 6) | WIRED       | dnsmasq hijack Phase 6 toujours en place (verifie par smoke-kiosk-pi Phase 6 guards). curl -I confirme 302 sur Pi RACC.                                            |
| /kindle-wifi/wifistub.html     | /kindle-wifi/wifiredirect.html                  | nginx `return 302 http://$host/kindle-wifi/wifiredirect.html`        | WIRED       | Pattern present dans neopro-base.conf ligne 69. Smoke CAPTIVE-05 asserte exactement ce pattern.                                                                    |
| /kindle-wifi/wifiredirect.html | Page Neopro racine (Angular bootstrap → whoami) | nginx `return 302 http://192.168.4.1/`                               | WIRED       | Pattern present neopro-base.conf ligne 78. Smoke CAPTIVE-05/06 asserte ce pattern.                                                                                 |
| Fire OS → auto-launch Silk     | Comportement visible Fire Stick                 | CaptivePortalLauncher natif Fire OS declenche par 302                | NEEDS HUMAN | Le signal 302 est envoye correctement. Le declenchement CaptivePortalLauncher est specifique au firmware Fire OS 8 et au modele AFTSS. Non verifiable sans device. |

### Requirements Coverage

| Requirement | Source Plan                      | Description                                                                                     | Status                                                | Evidence                                                                                                                                                  |
| ----------- | -------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CAPTIVE-05  | 10-01-nginx-wifistub-302-PLAN.md | Silk Browser s'ouvre automatiquement sur la page captive sans ouvrir manuellement un navigateur | VERIFIED (infra) / NEEDS HUMAN (comportement runtime) | nginx delivre le 302. 4 smoke guards CAPTIVE-05 verts. Comportement CaptivePortalLauncher = validation humaine requise.                                   |
| CAPTIVE-06  | 10-01-nginx-wifistub-302-PLAN.md | L'auto-launch fonctionne au boot du Fire Stick sans manipulation telecommande                   | NEEDS HUMAN                                           | Depend du meme comportement CaptivePortalLauncher que CAPTIVE-05. Infrastructure en place, validation physique requise.                                   |
| CAPTIVE-07  | 10-01-nginx-wifistub-302-PLAN.md | Si auto-launch echoue, page d'attente reste accessible manuellement — aucune regression v4.0    | VERIFIED                                              | /captive/wait toujours present, firestick-wait.html toujours servi, firestick-captive.conf catch-all vers 192.168.4.1/. Smoke CAPTIVE-07 regression vert. |

Aucun requirement orphelin: CAPTIVE-05, CAPTIVE-06, CAPTIVE-07 sont tous declares dans le PLAN frontmatter et couverts ci-dessus.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact                                                                                                     |
| ---- | ---- | ------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| —    | —    | —       | —        | Aucun anti-pattern detecte dans les fichiers modifies. Pas de TODO/FIXME, pas de return null, pas de stub. |

Verification supplementaire:

- `grep -n "TODO\|FIXME\|PLACEHOLDER" neopro-base.conf` → 0 resultats
- `grep -n "return 200" neopro-base.conf` dans le bloc wifistub → 0 resultats (la ligne `return 200` restante est dans `@captive_fallback` pour iOS, hors perimetre Phase 10)
- `grep "toContain('Success')" smoke-kiosk-pi.test.ts` → presente uniquement dans `expect(block).not.toContain('Success')` (assertion negative correcte)

### Human Verification Required

#### 1. Fire Stick auto-launch (CAPTIVE-05 / CAPTIVE-06)

**Test:** Debrancher le Fire Stick AFTSS (0c:43:f9:36:04:77) 30s, rebrancher. Au boot Fire OS, selectionner le Wi-Fi hotspot Pi et entrer le PSK. Observer pendant 30s.

**Expected:**

- Scenario A (ideal): Silk Browser s'ouvre automatiquement sur la page Neopro (ou page d'attente si MAC non assignee) dans les 10s — aucune action telecommande.
- Scenario B (acceptable): Notification systeme "Connectez-vous au reseau" apparait, 1 tap suffit.

**Why human:** CaptivePortalLauncher Fire OS est un comportement firmware non simulable. La RESEARCH.md Q1 documente l'inconsistance entre modeles Fire OS 8. Le SUMMARY.md indique "Physical test performed" mais le resultat (Scenario A / B / rien) n'est pas explicitement consigne dans les artefacts.

**Logs a observer pendant le test:**

```bash
ssh pi@neopro.local 'sudo journalctl -u nginx -f'
# Attendu: GET /kindle-wifi/wifistub.html (302) → GET /kindle-wifi/wifiredirect.html (302) → GET / (200)
```

#### 2. Fallback manuel CAPTIVE-07

**Test:** Si l'auto-launch ne se declenche pas (ou apres le test auto-launch), ouvrir Silk manuellement et taper `firetvcaptiveportal.com`.

**Expected:** La page d'attente Neopro s'affiche avec la MAC du Fire Stick visible en gros.

**Why human:** Le DNS hijack firetvcaptiveportal.com et le rendu de la page d'attente avec la bonne MAC sont des comportements end-to-end qui necessitent un vrai device sur le hotspot.

### Note sur la validation Pi RACC

Le SUMMARY.md (ligne 124) indique: "Fire Stick AFTSS `0c:43:f9:36:04:77` test: Physical test performed. CaptivePortalLauncher behavior observed post 302 change." sans qualifier le resultat (auto-launch OK / notification / rien).

La validation curl 302 est confirmee: `curl -I -H "Host: spectrum.s3.amazonaws.com" http://192.168.4.1/kindle-wifi/wifistub.html` → HTTP/1.1 302 ✓

Le resultat du comportement Fire Stick physique doit etre confirme par Daisy pour clore CAPTIVE-05/06.

---

_Verified: 2026-05-07T20:45:00Z_
_Verifier: Claude (gsd-verifier)_
