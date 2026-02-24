# SPIKE-002 — Preview Live Dashboard : Analyse d'usage et benchmark

> **Epic** : E-22 — Contenus Différenciés TV + Écran Secondaire
> **Feature** : F-22.6 — Preview live Dashboard
> **US** : US-22.6.1 (Spike — 2 SP)
> **Date** : 24 Février 2026
> **Statut** : Spike (analyse)

---

## Contexte

La capture d'écran existe déjà (`screenshot.service.ts`) et fonctionne en production. La question est : faut-il aller plus loin vers du "live preview" ou améliorer l'existant ?

---

## État actuel du mécanisme de capture

| Aspect         | Valeur actuelle                                                                 |
| -------------- | ------------------------------------------------------------------------------- |
| **Service**    | `raspberry/src/app/services/screenshot.service.ts`                              |
| **Résolution** | 480p (854×480)                                                                  |
| **Format**     | JPEG, qualité 50%                                                               |
| **Taille**     | ~30-50 KB par image                                                             |
| **Rate-limit** | 1 capture/seconde (hardcoded)                                                   |
| **Timeout**    | 8s côté serveur, 10s côté dashboard                                             |
| **Transport**  | HTTP request-response (depuis v3.58)                                            |
| **Dashboard**  | `screenshot-viewer.component.ts` avec bouton capture + auto-refresh toggle (5s) |
| **Tracking**   | Prometheus counter `neopro_commands_total{type="screenshot"}`                   |

### Ce qui existe déjà

- Bouton "Capture Screen" dans la télécommande cloud
- **Toggle auto-refresh** qui re-capture toutes les 5s
- Indicateur temps écoulé ("à l'instant", "il y a 5s")
- Gestion erreurs (timeout, no_active_video, capture_failed)
- Metadata : nom de la vidéo en cours, phase du match

---

## 3 approches comparées

### A — Améliorer l'existant (screenshot polling amélioré)

```
Dashboard                    Central Server                Pi
   │                              │                         │
   ├─ Auto-refresh ON (3s) ──────►├─ HTTP screenshot ──────►│
   │                              │                         ├─ Canvas capture
   │◄── JPEG 480p (30-50KB) ─────┤◄── base64 JPEG ────────┤
   │                              │                         │
   └─ Affiche dans <img>          │                         │
      + badge "il y a 3s"         │                         │
```

| Avantage                          | Inconvénient                                       |
| --------------------------------- | -------------------------------------------------- |
| 0 nouveau code côté Pi            | Latence 3-5s (pas "live")                          |
| Infra existante, éprouvée         | Polling = requêtes inutiles si personne ne regarde |
| Bande passante minimale (~10KB/s) | 1 seul écran capturé (TV ou secondary, pas les 2)  |

**Effort** : ~3 SP
**Améliorations possibles** :

- Réduire auto-refresh de 5s → 3s
- Ajouter toggle "TV / Secondary" pour choisir quel écran capturer
- Afficher les 2 captures côte à côte (2 requêtes parallèles)

### B — WebRTC Peer-to-Peer

```
Dashboard ◄──── WebRTC stream (500Kbps) ────► Pi
              via TURN/STUN server (coturn)
```

| Avantage                  | Inconvénient                                              |
| ------------------------- | --------------------------------------------------------- |
| Vrai temps réel (< 200ms) | Infrastructure coturn à déployer et maintenir             |
| Stream vidéo fluide       | ~500Kbps continu par viewer (même si personne ne regarde) |
| Standard navigateur       | Complexité : ICE negotiation, NAT traversal, TURN         |
|                           | Charge CPU Pi : encodage WebRTC continu                   |
|                           | Pas compatible avec tous les réseaux (firewall club)      |

**Effort** : ~13 SP + coût infra coturn
**Verdict** : **Disproportionné** pour le besoin actuel. À reconsidérer si > 50 clubs ou besoin de monitoring vidéo continu.

### C — Server-Sent Events (SSE) avec screenshots streamés

```
Dashboard ◄──── SSE stream (1 image/3s) ────► Central Server ◄── Pi
```

| Avantage                     | Inconvénient                                        |
| ---------------------------- | --------------------------------------------------- |
| Pseudo-live (3s latence)     | Charge serveur : maintient connexion SSE par viewer |
| Pas de polling (push)        | Complexité : gestion connexions SSE + cleanup       |
| Bande passante identique à A | Avantage marginal vs polling simple                 |

**Effort** : ~5 SP
**Verdict** : Marginal vs approche A améliorée. Ne justifie pas la complexité.

---

## Analyse d'impact CPU Pi

| Approche              | CPU Pi (continu)           | CPU Pi (capture)       | Bande passante |
| --------------------- | -------------------------- | ---------------------- | -------------- |
| **A — Screenshot 3s** | 0% (idle entre captures)   | ~2% pendant 100ms      | ~10 KB/s       |
| **B — WebRTC**        | ~15-20% (encodage continu) | N/A (stream permanent) | ~60 KB/s       |
| **C — SSE**           | 0% (idle entre captures)   | ~2% pendant 100ms      | ~10 KB/s       |

**Conclusion** : L'approche A est la seule qui ne pénalise pas les performances du Pi, qui doit déjà gérer 2 flux vidéo en dual display.

---

## Analyse d'usage actuel

### Données à collecter (action requise)

Pour décider de l'investissement, vérifier via Prometheus/Grafana :

```promql
# Nombre total de screenshots demandés (30 derniers jours)
sum(increase(neopro_commands_total{type="screenshot"}[30d]))

# Nombre de screenshots par site (identifier les power users)
sum by (site_id)(increase(neopro_commands_total{type="screenshot"}[30d]))

# Taux d'erreur screenshots
sum(increase(neopro_commands_total{type="screenshot", status="timeout"}[30d]))
/ sum(increase(neopro_commands_total{type="screenshot", status="sent"}[30d]))
```

**Hypothèse** : Si < 50 captures/mois toutes sites confondues, l'investissement preview live n'est pas justifié.

---

## Recommandation

### Court terme : Approche A améliorée (3 SP)

1. **Réduire l'intervalle auto-refresh** de 5s → 3s
2. **Dual capture** : 2 thumbnails côte à côte (TV + Secondary)
   - Envoyer `screenshot-request` avec paramètre `displayType: 'tv' | 'secondary'`
   - Le `tv.component.ts` filtre selon son propre `displayType`
3. **Indicateur visuel** : badge "LIVE" clignotant quand auto-refresh actif
4. **Lazy loading** : auto-refresh ne démarre que quand l'onglet preview est visible

### Long terme : WebRTC (si justifié par l'usage)

Reconsidérer si :

- \> 50 clubs actifs
- Demande explicite d'opérateurs pour du vrai temps réel
- Cas d'usage monitoring NOC (centre d'opérations réseau)

---

## Décision attendue

| Option                      | Effort        | Impact                     | Recommandation             |
| --------------------------- | ------------- | -------------------------- | -------------------------- |
| **A — Screenshot amélioré** | 3 SP          | Dual capture + refresh 3s  | **GO**                     |
| B — WebRTC                  | 13 SP + infra | Vrai live                  | NO GO (disproportionné)    |
| C — SSE                     | 5 SP          | Pseudo-live, gain marginal | NO GO                      |
| Ne rien faire               | 0 SP          | Statu quo                  | Acceptable si usage faible |

---

**Retour** : [Features E-22](../safe/FEATURES.md#f-226--preview-live-dashboard--à-détailler) · [screenshot-viewer.component.ts](../../central-dashboard/src/app/features/remote/components/screenshot-viewer/)
