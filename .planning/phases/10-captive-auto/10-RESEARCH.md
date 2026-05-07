# Phase 10: CAPTIVE-AUTO — Silk Browser Auto-Launch — Research

**Researched:** 2026-05-07
**Domain:** Fire OS captive portal detection mechanism — auto-launch vs. notification-only behavior; nginx response engineering
**Confidence:** MEDIUM (core mechanism confirmed by WBA documentation + user reports; Fire OS 8 auto-launch reliability is LOW confidence due to contradicting reports)

---

<phase_requirements>

## Phase Requirements

| ID         | Description                                                                                                                                                               | Research Support                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| CAPTIVE-05 | Quand un Fire Stick se connecte au hotspot Pi, le Silk Browser s'ouvre automatiquement sur la page captive sans que le bénévole n'ait à ouvrir manuellement un navigateur | Section "Fire OS CPD sequence" — le mécanisme natif + la condition à remplir côté nginx pour déclencher CaptivePortalLauncher sans tap utilisateur |
| CAPTIVE-06 | L'auto-launch fonctionne au boot du Fire Stick (premier démarrage après connexion hotspot) sans manipulation de la télécommande                                           | Section "Boot sequence Fire OS" — même mécanisme CPD, déclenché au `NETWORK_STATE_CHANGED` broadcast                                               |
| CAPTIVE-07 | Si l'auto-launch échoue (Fire Stick hors hotspot, timeout), la page d'attente reste accessible manuellement — aucune régression comportement v4.0                         | Section "Fallback / CAPTIVE-07" — la page d'attente Phase 6 reste intacte ; aucun retrait de comportement existant                                 |

</phase_requirements>

---

## Summary

Phase 6 a livré le fond technique : DNS hijack, nginx, `/api/captive/whoami`, page d'attente `firestick-wait.html`, Angular bootstrap router. Mais lors de la validation Pi NLF (2026-05-07, Fire Stick AFTSS Fire OS 8, Silk 138.13.4), le bénévole a dû **lancer Silk manuellement**. CAPTIVE-05/06 exigent de supprimer cette étape manuelle.

Le mécanisme natif Fire OS est le `CaptivePortalLauncher` — une app système cachée qui réagit aux probes de connectivité effectuées automatiquement à la connexion Wi-Fi. La séquence exacte (confirmée WBA/captivebehavior.wballiance.com) est :

1. Fire OS effectue `GET http://spectrum.s3.amazonaws.com/kindle-wifi/wifistub.html` (port 80, DNS déjà hijacké vers Pi)
2. Si le Pi répond **200 + body `Success`** → Fire OS marque le réseau "connecté" et **ne lance pas** CaptivePortalLauncher
3. Si le Pi répond **non-200 ou redirect (302)** → Fire OS génère une notification système et peut auto-lancer CaptivePortalLauncher

Le Pi en Phase 6 **répond 200 "Success"** sur `/kindle-wifi/wifistub.html` — ce qui est la réponse correcte pour "Internet fonctionne". C'est le contresens fondamental : en répondant 200, on dit à Fire OS "tout va bien, pas besoin d'ouvrir un navigateur".

**La clé de Phase 10 :** Pour déclencher CaptivePortalLauncher, il faut que le endpoint `/kindle-wifi/wifistub.html` retourne une réponse qui signale un portail captif, typiquement un **redirect 302** vers la page du portail. Fire OS déclenche alors CaptivePortalLauncher qui charge `wifiredirect.html` (également hijacké vers Pi) et l'affiche à l'utilisateur comme portail captif.

**Nuance critique (LOW confidence) :** Les rapports terrain montrent que sur Fire OS 8 (Fire TV Stick 4K 2e gen, 2023), le comportement est **inconsistant** — certains utilisateurs rapportent l'auto-launch, d'autres non. La solution la plus fiable est d'assurer que le scénario de fallback (bénévole ouvre Silk manuellement → Angular bootstrap router prend le relais) fonctionne impeccablement, et que Phase 10 est "best-effort" sur l'auto-launch natif.

**Primary recommendation:** Modifier `neopro-base.conf` pour que `wifistub.html` retourne un **302 redirect** vers la page Neopro (au lieu du 200 "Success" actuel), et ajouter le endpoint `wifiredirect.html` qui sert la page d'attente ou un redirect captif. Tester empiriquement sur le Pi RACC. Si le 302 casse d'autres comportements (ex: loop détection), avoir un fallback B : répondre 200 mais avec un body qui force le browser Fire OS via un meta-refresh.

---

## User Constraints (CONTEXT.md absent — contraintes déduites de v4.0)

### Locked Decisions (portées de v4.0 et STATE.md)

- Phase 6 infra intacte : DNS hijack, nginx config `neopro-base.conf`, `/api/captive/whoami`, `firestick-wait.html`, Angular bootstrap router — rien ne doit régresser (CAPTIVE-07)
- Pas de DNAT 443 (ADR-079 invariant, `.claude/rules/raspberry.md` — smoke test enforced)
- Pas de modification `hostapd.conf` ni du mécanisme PSK (ADR-074 invariant, `.claude/rules/hotspot-psk.md`)
- `console.info/warn` côté Pi (pas de Winston dans `raspberry/server`)
- Pattern modulaire `raspberry/server` : orchestrateur + services + routes

### Claude's Discretion

- Choix de la réponse HTTP pour `wifistub.html` : 302 redirect vs 200 + meta-refresh vs autre signal
- Choix du endpoint `wifiredirect.html` : 302 vers `/captive/wait?mac=...` ou page HTML dédiée
- Ordre de test des variantes sur Pi RACC si la première stratégie échoue

### Deferred Ideas (OUT OF SCOPE — v4.2+)

- APK TWA fullscreen (URL bar Silk toujours visible — trigger : retour terrain)
- ADB over WiFi pour envoyer des commandes au Fire Stick (nécessite developer mode — non acceptable grand public)
- Scénario SaaS Fire Stick (sans Pi)

---

## Standard Stack

### Core (inchangé — Phase 6)

| Composant                     | Version          | Rôle                                                               |
| ----------------------------- | ---------------- | ------------------------------------------------------------------ |
| nginx                         | 1.18+ (Bookworm) | Serveur captive portal, réponse aux probes Fire OS                 |
| dnsmasq                       | 2.89+            | DNS hijack `firetvcaptiveportal.com` + `spectrum.s3.amazonaws.com` |
| Express.js (raspberry/server) | Node 20          | Route `/api/captive/whoami`                                        |
| Angular 20 (raspberry/src)    | 20.x             | Bootstrap router dans `AppComponent`                               |

### Modifications Phase 10

| Fichier                                   | Modification                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| `raspberry/config/nginx/neopro-base.conf` | `kindle-wifi/wifistub.html` : passer de `return 200 'Success'` à `return 302 <url captive>` |
| `raspberry/config/nginx/neopro-base.conf` | Nouveau endpoint `kindle-wifi/wifiredirect.html` : sert redirect ou page d'attente          |
| Smoke test `smoke-kiosk-pi.test.ts`       | Mettre à jour les guards Phase 6 pour refléter le nouveau comportement wifistub             |

---

## Architecture Patterns

### Fire OS Captive Portal Detection (CPD) Sequence — Détail

```
Fire OS boot / connexion Wi-Fi
    │
    ▼ DNS query: spectrum.s3.amazonaws.com → 192.168.4.1 (dnsmasq hijack)
    │
    ▼ HTTP GET http://spectrum.s3.amazonaws.com/kindle-wifi/wifistub.html
    │
    ├── Pi répond 200 "Success"
    │       → Fire OS: "Internet OK" — marque réseau connecté
    │       → CaptivePortalLauncher: NE SE LANCE PAS
    │       → Bénévole doit ouvrir Silk manuellement (comportement Phase 6 actuel)
    │
    └── Pi répond 302 → http://192.168.4.1/kindle-wifi/wifiredirect.html
            → Fire OS: "Portail captif détecté"
            → CaptivePortalLauncher: SE LANCE (ou notification apparaît)
            → [optional tap] → Silk ouvre wifiredirect.html → page Pi
```

**wifiredirect.html** est le endpoint que Fire OS charge APRÈS détection du portail. C'est là que le Pi sert la page utile (ou un nouveau redirect vers `/captive/wait`).

### Pattern nginx recommandé

```nginx
# wifistub.html : indiquer portail captif (return 302 au lieu de 200 Success)
location = /kindle-wifi/wifistub.html {
    return 302 http://$host/kindle-wifi/wifiredirect.html;
}

# wifiredirect.html : rediriger vers la page d'attente captive
location = /kindle-wifi/wifiredirect.html {
    return 302 http://192.168.4.1/captive/wait;
}
```

**Alternative B** (si 302 ne fonctionne pas sur certains firmwares Fire OS) :

```nginx
# wifistub.html : corps non-Success pour forcer détection portail
location = /kindle-wifi/wifistub.html {
    default_type text/html;
    return 200 '<!DOCTYPE html><html><head>
      <meta http-equiv="refresh" content="0;url=http://192.168.4.1/captive/wait">
      </head><body></body></html>';
}
```

**Alternative C** (contournement si CPD natif reste peu fiable sur Fire OS 8) : ne pas modifier `wifistub.html`, mais s'appuyer sur le comportement actuel (bénévole ouvre Silk → page d'attente). Dans ce cas Phase 10 = "best-effort CPD" + documentation de la procédure manuelle améliorée (ex: page d'accueil Silk configure vers `192.168.4.1` par défaut dans les paramètres Fire TV).

### Anti-Patterns à Éviter

- **Wildcard DNS** `address=/#/` — casserait Android sur le hotspot Pi (déjà documenté `dnsmasq.conf`)
- **DNAT 443** — casse TLS handshake iOS/macOS (ADR-079 invariant smoke test enforced)
- **Loop redirect infini** — si `wifistub.html` redirige vers `/captive/wait` et que la page d'attente déclenche une probe, s'assurer qu'il n'y a pas de boucle (`wifistub` → `wait` → [Angular fetch `whoami`] — pas de nouvelle probe Amazon)
- **ADB over WiFi** — requiert developer mode activé sur chaque Fire Stick, non acceptable pour une solution bénévole grand public
- **Modifier `generate_204`** — ce endpoint est utilisé par Android générique, sa modification casserait la détection Android

---

## Don't Hand-Roll

| Problème                          | Ne pas construire    | Utiliser                                              | Pourquoi                                                |
| --------------------------------- | -------------------- | ----------------------------------------------------- | ------------------------------------------------------- |
| Détecter si Fire OS ouvre browser | Scan réseau complexe | CaptivePortalLauncher natif via réponse HTTP correcte | Fire OS gère lui-même via probes CPD                    |
| Forcer ouverture Silk             | ADB commands         | Réponse nginx 302 sur wifistub                        | ADB requiert developer mode — non scalable grand public |
| Envoyer page captive              | Nouveau service      | Réutiliser `/captive/wait` de Phase 6                 | Déjà livré et validé terrain                            |

---

## Common Pitfalls

### Pitfall 1 : Répondre 200 "Success" à wifistub.html

**What goes wrong :** Fire OS interprète la réponse comme "Internet disponible" et ne déclenche pas CaptivePortalLauncher. Le bénévole doit ouvrir Silk manuellement.

**Why it happens :** C'est le comportement Phase 6 actuel — délibéré à l'époque pour ne pas perturber l'UX, en attendant Phase 10.

**How to avoid :** Changer la réponse de `wifistub.html` en 302 redirect pour signaler un portail captif.

**Warning signs :** Fire OS affiche le réseau Wi-Fi avec une icône "connecté" sans notification captive.

---

### Pitfall 2 : Auto-launch inconsistant sur Fire OS 8

**What goes wrong :** Sur les Fire TV Stick 4K Gen 2 (2023, Fire OS 8), le comportement CPD est moins fiable que sur les générations antérieures. Certains rapports terrain indiquent que le browser ne s'ouvre pas automatiquement même avec un 302 correct.

**Why it happens :** Amazon a durci les restrictions de lancement automatique d'apps dans Fire OS 8 (impact digital signage aussi documenté). CaptivePortalLauncher peut ne montrer qu'une notification plutôt que d'ouvrir Silk directement.

**How to avoid :** (a) Tester empiriquement sur Pi RACC avec le Fire Stick de test (AFTSS `0c:43:f9:36:04:77`). (b) S'assurer que la notification captive apparaît au moins — même si l'utilisateur doit appuyer une fois pour confirmer, c'est déjà mieux que "lancer Silk manuellement". (c) CAPTIVE-07 garantit que le fallback manuel fonctionne encore.

**Warning signs :** Le Pi RACC répond correctement en 302 mais le Fire Stick ne montre pas de notification ni de browser.

---

### Pitfall 3 : Smoke test Phase 6 casse si on modifie wifistub.html

**What goes wrong :** `smoke-kiosk-pi.test.ts` ligne 3539 asserte que `neopro-base.conf` contient `location = /kindle-wifi/wifistub.html`. Si on modifie la réponse de 200 à 302, la réponse change mais le endpoint existe toujours — le test actuel ne vérifie pas le statut HTTP, seulement la présence du bloc. À valider si un test plus strict faillerait.

**How to avoid :** Lire le test exact avant modification. Mettre à jour le smoke test pour refléter le nouveau comportement (`return 302` au lieu de `return 200`).

---

### Pitfall 4 : wifiredirect.html manquant → loop ou 404

**What goes wrong :** Si `wifistub.html` redirige vers `wifiredirect.html` mais que ce endpoint n'est pas configuré dans nginx, Fire OS reçoit un 404 et le comportement est indéfini.

**How to avoid :** Ajouter le bloc `wifiredirect.html` dans nginx en même temps que la modification de `wifistub.html`. S'assurer qu'il redirige vers `/captive/wait` ou sert une page HTML valide.

---

### Pitfall 5 : Loop infini redirect entre wifistub/wifiredirect et Angular bootstrap

**What goes wrong :** Si `wifiredirect.html` redirige vers `/` (Angular app root) et qu'Angular fait un nouveau fetch `/api/captive/whoami` qui lui-même provoque des calls réseau pouvant retrigguer une probe Fire OS, une boucle peut se former.

**How to avoid :** `wifiredirect.html` → redirect vers `/captive/wait?mac=...` directement (pas vers `/`). La page d'attente ne fait pas de probe Amazon, elle fait uniquement du polling vers `/api/captive/whoami` local.

---

## Code Examples

### Modification nginx wifistub.html (Approche A — recommandée)

```nginx
# Source: neopro-base.conf (à remplacer le bloc actuel)
# AVANT (Phase 6) :
# location = /kindle-wifi/wifistub.html {
#     default_type text/html;
#     return 200 '<!DOCTYPE html><html><head><title>Success</title></head><body>Success</body></html>';
# }

# APRÈS (Phase 10) :
location = /kindle-wifi/wifistub.html {
    # Signaler portail captif à Fire OS : répondre 302 au lieu de 200 Success
    # Fire OS déclenche alors CaptivePortalLauncher qui charge wifiredirect.html
    return 302 http://$host/kindle-wifi/wifiredirect.html;
    add_header Cache-Control "no-cache, no-store, must-revalidate";
}

location = /kindle-wifi/wifiredirect.html {
    # Page que CaptivePortalLauncher charge après détection du portail
    # Rediriger vers la page d'attente Neopro
    # Note: on ne peut pas encore résoudre la MAC ici (pas d'Express derrière nginx à ce stade)
    # → on redirige vers /captive/wait sans mac, le Angular bootstrap s'occupera du whoami
    return 302 http://192.168.4.1/;
    add_header Cache-Control "no-cache, no-store, must-revalidate";
}
```

### Smoke test mise à jour (guard Phase 10)

```typescript
// Source: central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts
// Dans describe('Phase 6 — Fire Stick Captive Portal')
// METTRE À JOUR le test wifistub :

it('nginx wifistub.html returns captive signal (302 or 200 with redirect body)', () => {
  const confPath = path.join(REPO_ROOT, 'raspberry/config/nginx/neopro-base.conf');
  const conf = fs.readFileSync(confPath, 'utf8');
  // Phase 10 : le bloc kindle-wifi doit exister mais NE DOIT PAS retourner 200 "Success"
  // (un 200 Success dirait à Fire OS que tout va bien → pas d'auto-launch)
  expect(conf).toMatch(/location\s*=\s*\/kindle-wifi\/wifistub\.html/);
  // Guard négatif : ne pas retourner "Success" (empêcherait CaptivePortalLauncher)
  const wifistubBlock = extractNginxBlock(conf, '/kindle-wifi/wifistub.html');
  expect(wifistubBlock).not.toContain('Success');
  expect(wifistubBlock).not.toMatch(/return\s+200/);
});
```

---

## State of the Art

| Ancienne approche (Phase 6)               | Approche Phase 10                                                             | Impact                                                 |
| ----------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------ |
| `wifistub.html` → `200 Success`           | `wifistub.html` → `302 → wifiredirect.html`                                   | Fire OS détecte portail captif → CaptivePortalLauncher |
| Bénévole lance Silk manuellement          | Silk s'ouvre automatiquement via CaptivePortalLauncher                        | Zéro manipulation télécommande au premier branchement  |
| Page d'attente accessible via Silk manuel | Page d'attente accessible via CaptivePortalLauncher OU Silk manuel (fallback) | CAPTIVE-07 préservé                                    |

**Fire OS 8 nuance :** Sur les générations antérieures (Fire OS 5-7), le CaptivePortalLauncher s'ouvre directement. Sur Fire OS 8 (2023+), il peut se limiter à une notification système — l'utilisateur presse OK sur la télécommande. C'est un UX step de moins que "lancer Silk manuellement depuis le menu Fire TV", mais pas encore "zéro manipulation". À valider terrain.

---

## Validation Architecture

### Test Framework

| Property           | Value                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| Framework          | Jest 29.x (`raspberry/server`) + smoke tests Jest (`central-server`) + validation manuelle Pi RACC |
| Config file        | `raspberry/server/jest.config.js` + `central-server/jest.config.ts`                                |
| Quick run command  | `cd central-server && npx jest --testPathPatterns='smoke-kiosk-pi' --no-coverage --forceExit`      |
| Full suite command | `cd raspberry/server && npm test && cd ../../central-server && npm run test:smoke:smart`           |

### Phase Requirements → Test Map

| Req ID        | Behavior                                            | Test Type  | Automated Command                                                                           | File Exists?     |
| ------------- | --------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------- | ---------------- |
| CAPTIVE-05    | `wifistub.html` retourne 302 (pas 200 Success)      | smoke/grep | `npx jest --testPathPatterns='smoke-kiosk-pi' --no-coverage` (mettre à jour guard existant) | ⚠️ Mettre à jour |
| CAPTIVE-05    | `wifiredirect.html` endpoint existe dans nginx      | smoke/grep | même suite                                                                                  | ❌ Wave 0        |
| CAPTIVE-05/06 | CaptivePortalLauncher déclenche Silk au boot        | E2E manuel | Brancher Fire Stick sur hotspot Pi RACC, observer auto-launch                               | ❌ Manuel        |
| CAPTIVE-07    | Page d'attente accessible manuellement (régression) | régression | `npx jest --testPathPatterns='smoke-kiosk-pi' --no-coverage` (guards Phase 6 restent verts) | ✅ Existant      |
| CAPTIVE-07    | Angular bootstrap router inchangé                   | régression | `cd raspberry/server && npm test`                                                           | ✅ Existant      |

### Sampling Rate

- **Per task commit :** `cd central-server && npx jest --testPathPatterns='smoke-kiosk-pi' --no-coverage --forceExit`
- **Per wave merge :** `cd raspberry/server && npm test && npm run test:smoke:smart` (depuis racine)
- **Phase gate :** Smoke suite verte + validation manuelle Pi RACC (Fire Stick physique, observer auto-launch) avant `/gsd:verify-work`

### Wave 0 Gaps

- [ ] Mettre à jour `central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts` : guard `wifistub.html` pour asserter `302` au lieu de `200 Success`
- [ ] Ajouter guard `wifiredirect.html` dans le même smoke test
- [ ] Validation manuelle Pi RACC obligatoire : auto-launch est non-testable en Jest (nécessite Fire Stick physique + hotspot actif)

---

## Open Questions

1. **La réponse 302 sur `wifistub.html` déclenche-t-elle bien CaptivePortalLauncher sur Fire OS 8 (AFTSS, Silk 138.13.4) ?**
   - What we know : WBA documentation confirme que Fire OS déclenche CaptivePortalLauncher sur réponse non-200 ou redirect. Validation POC à faire.
   - What's unclear : comportement exact Fire OS 8 (2023) — peut se limiter à une notification plutôt qu'un launch direct.
   - Recommendation : test empirique immédiat sur Pi RACC avec le Fire Stick connu (`0c:43:f9:36:04:77`). Si 302 fonctionne → plan A. Si seulement notification → acceptable (1 tap télécommande). Si rien → plan B (meta-refresh 200).

2. **wifiredirect.html doit-il rediriger vers `/` ou vers `/captive/wait` ?**
   - What we know : `/captive/wait` sans `?mac=` va afficher la page d'erreur (fallback `error-state` dans firestick-wait.html). `/` va déclencher le bootstrap Angular qui fera un fetch whoami — plus propre.
   - What's unclear : est-ce que Fire OS accepte que `wifiredirect.html` fasse un second redirect (302 → 302) sans bloquer ?
   - Recommendation : `wifiredirect.html` → 302 vers `http://192.168.4.1/` — Angular prend le relais pour whoami → redirect correct.

3. **Le smoke guard Phase 6 existant sur `wifistub.html` va-t-il casser avec un 302 ?**
   - What we know : le test ligne 3539 asserte uniquement `toMatch(/location\s*=\s*\/kindle-wifi\/wifistub\.html/)` — il vérifie que le bloc existe, pas le code HTTP.
   - What's unclear : y a-t-il un test supplémentaire qui asserte le corps `Success` ?
   - Recommendation : lire le test complet avant modification (grep `wifistub` dans smoke-kiosk-pi.test.ts) — inclure dans Wave 0 du premier plan.

---

## Sources

### Primary (HIGH confidence)

- `.planning/phases/06-captive-fire-stick-page-neopro/06-captive-04-SUMMARY.md` — validation terrain Pi NLF 2026-05-07 : "bénévole a lancé Silk manuellement" confirmé
- `raspberry/config/nginx/neopro-base.conf` — comportement actuel wifistub.html (return 200 Success)
- `captivebehavior.wballiance.com` — documentation WBA sur le comportement Fire OS CPD : `wifistub.html` échec → notification → tap → `wifiredirect.html` chargé

### Secondary (MEDIUM confidence)

- Wireless Broadband Alliance Captive Portal Behavior database — séquence wifistub/wifiredirect documentée
- Amazon Community Forums (multiples threads) — reports terrain auto-launch parfois automatique, parfois nécessite user tap, inconsistant sur Fire OS 8
- AFTVnews article — Fire OS 8 push 2024 a durci restrictions auto-launch apps (impact digital signage)

### Tertiary (LOW confidence)

- Reports Reddit/forums : "Fire TV Stick is the only streaming stick that truly supports captive portals and will popup automatically" — contredit par d'autres reports d'échec sur Fire OS 8

---

## Metadata

**Confidence breakdown :**

- Mécanisme CPD (`wifistub` → 302 → `wifiredirect`) : HIGH — WBA documentation + comportement Android standard
- Auto-launch CaptivePortalLauncher sur Fire OS 8 sans tap : LOW — contradictions terrain
- Fallback manuel préservé (CAPTIVE-07) : HIGH — Phase 6 infra intacte
- Smoke test updates : HIGH — grep sur fichiers en place

**Research date :** 2026-05-07
**Valid until :** 2026-06-07 (30 jours — Fire OS stable, mais un firmware OTA Amazon peut changer le comportement CPD)
