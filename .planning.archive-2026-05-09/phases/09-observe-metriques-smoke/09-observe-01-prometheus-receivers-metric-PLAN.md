---
phase: 09-observe-metriques-smoke
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - central-server/src/services/metrics.service.ts
  - central-server/src/services/socket.service.ts
  - central-server/src/controllers/sites.controller.ts
  - docker/grafana/provisioning/dashboards/json/cloud/neopro-overview-cloud.json
autonomous: true
requirements: [OBSERVE-01]
must_haves:
  truths:
    - 'La métrique neopro_receivers_total{site_id, status} est visible sur /metrics après un state-sync portant des receivers'
    - 'Un PATCH displays avec receiver.mac incrémente le compteur status=assigned'
    - "Le panel Grafana 'Fire Sticks détectés' apparaît dans le dashboard JSON (satisfait smoke-metrics-observability)"
  artifacts:
    - path: 'central-server/src/services/metrics.service.ts'
      provides: 'Counter neopro_receivers_total + méthode recordReceiver'
      contains: 'neopro_receivers_total'
    - path: 'central-server/src/services/socket.service.ts'
      provides: "Appel recordReceiver(siteId, 'detected') dans le handler state-sync"
      contains: 'recordReceiver'
    - path: 'central-server/src/controllers/sites.controller.ts'
      provides: "Appel recordReceiver(siteId, 'assigned') après updateDisplays"
      contains: 'recordReceiver'
    - path: 'docker/grafana/provisioning/dashboards/json/cloud/neopro-overview-cloud.json'
      provides: 'Panel stat Fire Sticks détectés'
      contains: 'neopro_receivers_total'
  key_links:
    - from: 'central-server/src/services/socket.service.ts'
      to: 'central-server/src/services/metrics.service.ts'
      via: "metricsService.recordReceiver(siteId, 'detected') dans handler state-sync"
      pattern: 'recordReceiver.*detected'
    - from: 'central-server/src/controllers/sites.controller.ts'
      to: 'central-server/src/services/metrics.service.ts'
      via: "metricsService.recordReceiver(siteId, 'assigned') après siteRepository.updateDisplays"
      pattern: 'recordReceiver.*assigned'
---

<objective>
Ajouter la métrique Prometheus `neopro_receivers_total{site_id, status}` (status ∈ `detected | assigned | disconnected`) pour observer les transitions Fire Stick en production, et exposer un panel Grafana pour satisfaire le guard `smoke-metrics-observability`.

Purpose: Rendre la feature Fire Stick observable en production — sans cette métrique, un Fire Stick silencieusement absent de la Map ou un bug d'assignation passerait inaperçu.
Output: Counter Prometheus avec 3 call sites + panel Grafana JSON.
</objective>

<execution_context>
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/workflows/execute-plan.md
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md

@central-server/src/services/metrics.service.ts
@central-server/src/services/socket.service.ts
@central-server/src/controllers/sites.controller.ts
@docker/grafana/provisioning/dashboards/json/cloud/neopro-overview-cloud.json

<interfaces>
<!-- Extraits des fichiers source pour l'exécuteur — pas besoin d'explorer le codebase -->

De metrics.service.ts (pattern Counter existant, lignes 55-60 + 974-976) :

```typescript
// Déclaration Counter (au niveau module, avant la classe) :
const deploymentsTotal = new Counter({
  name: 'neopro_deployments_total',
  help: 'Total number of content deployments',
  labelNames: ['status', 'target_type'],
  registers: [register],
});

// Méthode record (dans la classe MetricsService) :
recordDeployment(status: string, targetType: string): void {
  deploymentsTotal.inc({ status, target_type: targetType });
}

// Fin du fichier :
export const metricsService = new MetricsService();
export default metricsService;
```

De socket.service.ts (lignes 566-582, handler state-sync) :

```typescript
socket.on('state-sync', (data: unknown) => {
  metricsService.recordWebsocketMessage('inbound', 'state-sync');
  metricsService.recordStateSyncRelay();
  // CLOUD-01 — extract receivers from state-sync payload into in-memory Map
  if (data && Array.isArray((data as Record<string, unknown>).receivers)) {
    const receivers = (data as Record<string, unknown>).receivers as ReceiverInfo[];
    const isFirstSeen = !this.receiversBySite.has(siteId);
    this.receiversBySite.set(siteId, receivers);
    if (isFirstSeen) {
      logger.info('Receivers Map updated', { siteId, count: receivers.length });
    }
  }
  // ...
});
```

De sites.controller.ts (lignes ~451-465, updateSiteDisplays) :

```typescript
await siteRepository.updateDisplays(id, displays);
logger.info('Site displays updated', { siteId: id, displayCount: displays.length, updatedBy: req.user?.email });

try {
  await commandQueueService.sendOrQueue(id, 'receiver_assignment_updated', { displays });
  // ...
} catch (cmdErr) { ... }

const updatedDisplays = await siteRepository.getDisplays(id);
res.json({ displays: updatedDisplays });
```

Panel Grafana — structure stat existante à dupliquer (pattern lignes 95-108) :

```json
{
  "datasource": { "type": "prometheus", "uid": "grafanacloud-tallec7-prom" },
  "fieldConfig": {
    "defaults": {
      "color": { "mode": "thresholds" },
      "mappings": [],
      "thresholds": {
        "mode": "absolute",
        "steps": [
          { "color": "green", "value": null },
          { "color": "blue", "value": 1 }
        ]
      }
    }
  },
  "gridPos": { "h": 6, "w": 4, "x": 0, "y": 0 },
  "id": <unique_id>,
  "options": {
    "colorMode": "value",
    "graphMode": "area",
    "justifyMode": "center",
    "orientation": "auto",
    "reduceOptions": { "calcs": ["lastNotNull"], "fields": "", "values": false },
    "textMode": "auto"
  },
  "targets": [
    {
      "expr": "sum(neopro_receivers_total{status=\"detected\"})",
      "legendFormat": "Fire Sticks",
      "refId": "A"
    }
  ],
  "title": "Fire Sticks détectés",
  "type": "stat"
}
```

</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Counter neopro_receivers_total dans metrics.service.ts</name>
  <files>central-server/src/services/metrics.service.ts</files>
  <behavior>
    - recordReceiver('site-abc', 'detected') incrémente le Counter avec labels { site_id: 'site-abc', status: 'detected' }
    - recordReceiver('site-abc', 'assigned') incrémente avec status: 'assigned'
    - recordReceiver('site-abc', 'disconnected') incrémente avec status: 'disconnected'
    - Le Counter s'appelle 'neopro_receivers_total'
    - labelNames inclut ['site_id', 'status']
  </behavior>
  <action>
    Dans metrics.service.ts :

    1. Ajouter le Counter après le bloc "Métriques Business" existant (après `commandLatency`, ligne ~134), dans la section des déclarations au niveau module :
    ```typescript
    // ============= Métriques Receivers (Fire Stick — Phase 9 OBSERVE) =============
    const receiversTotal = new Counter({
      name: 'neopro_receivers_total',
      help: 'Total number of receiver state transitions (Fire Stick detection, assignment, disconnection)',
      labelNames: ['site_id', 'status'],
      registers: [register],
    });
    ```
    status ∈ 'detected' | 'assigned' | 'disconnected'

    2. Ajouter la méthode dans la classe MetricsService (avant `resetMetrics()`) :
    ```typescript
    recordReceiver(siteId: string, status: 'detected' | 'assigned' | 'disconnected'): void {
      receiversTotal.inc({ site_id: siteId, status });
    }
    ```

    TypeScript strict : le type union force le typage correct côté appelants.
    Ne pas utiliser `string` pour le paramètre status (perd le guard TypeScript).

  </action>
  <verify>
    <automated>cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/worktrees/nifty-ellis-756b56/central-server && npx tsc --noEmit 2>&1 | grep -E 'metrics\.service|error' | head -20</automated>
  </verify>
  <done>metrics.service.ts compile sans erreur TypeScript. `neopro_receivers_total` présent dans le fichier. `recordReceiver` est une méthode publique de MetricsService avec signature typée.</done>
</task>

<task type="auto">
  <name>Task 2: Appels recordReceiver dans socket.service.ts et sites.controller.ts</name>
  <files>central-server/src/services/socket.service.ts, central-server/src/controllers/sites.controller.ts</files>
  <action>
    ### socket.service.ts — status 'detected'

    Dans le handler `state-sync` (lignes 566-582), après le bloc `if (data && Array.isArray(...receivers))` qui peuple `this.receiversBySite`, ajouter l'appel si le tableau receivers est non vide :

    ```typescript
    if (data && Array.isArray((data as Record<string, unknown>).receivers)) {
      const receivers = (data as Record<string, unknown>).receivers as ReceiverInfo[];
      const isFirstSeen = !this.receiversBySite.has(siteId);
      this.receiversBySite.set(siteId, receivers);
      if (isFirstSeen) {
        logger.info('Receivers Map updated', { siteId, count: receivers.length });
      }
      // OBSERVE-01 — métrique Prometheus pour les transitions receiver
      if (receivers.length > 0) {
        metricsService.recordReceiver(siteId, 'detected');
      }
    }
    ```

    Logique : `detected` est incrémenté chaque fois que le Pi signale au moins un receiver via state-sync. Cela suit le rythme des heartbeats Pi (toutes les ~30s quand un Fire Stick est connecté).

    ### sites.controller.ts — status 'assigned'

    Dans `updateSiteDisplays` (ou la fonction équivalente), après l'appel `await siteRepository.updateDisplays(id, displays)` et avant la réponse HTTP, ajouter :

    ```typescript
    // OBSERVE-01 — compter les displays qui ont un receiver.mac assigné
    const assignedCount = Array.isArray(displays)
      ? displays.filter((d: Record<string, unknown>) =>
          d.receiver && typeof (d.receiver as Record<string, unknown>).mac === 'string'
        ).length
      : 0;
    if (assignedCount > 0) {
      metricsService.recordReceiver(id, 'assigned');
    }
    ```

    Import de metricsService : vérifier que `import metricsService from '../services/metrics.service';` existe déjà dans le fichier (très probable). Sinon l'ajouter avec les autres imports de services.

    ### socket.service.ts — status 'disconnected'

    Localiser la méthode `handleDisconnection` dans socket.service.ts (contient le guard `socket.id` — NE PAS supprimer ce guard). Ajouter l'appel après la confirmation que le site se déconnecte (après le log "Site disconnected") :

    ```typescript
    metricsService.recordReceiver(siteId, 'disconnected');
    ```

    Cela trace chaque déconnexion de site (le Fire Stick est virtuellement "perdu" quand le Pi se déconnecte du cloud).

  </action>
  <verify>
    <automated>cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/worktrees/nifty-ellis-756b56/central-server && npx tsc --noEmit 2>&1 | grep -E 'socket\.service|sites\.controller|error' | head -20</automated>
  </verify>
  <done>Les deux fichiers compilent sans erreur. `recordReceiver` est appelé dans le handler state-sync de socket.service.ts, dans updateSiteDisplays de sites.controller.ts, et dans handleDisconnection de socket.service.ts. Grep confirme : `grep -n "recordReceiver" central-server/src/services/socket.service.ts central-server/src/controllers/sites.controller.ts` retourne au moins 3 occurrences.</done>
</task>

<task type="auto">
  <name>Task 3: Panel Grafana "Fire Sticks détectés" dans neopro-overview-cloud.json</name>
  <files>docker/grafana/provisioning/dashboards/json/cloud/neopro-overview-cloud.json</files>
  <action>
    Lire le fichier JSON pour identifier :
    - Le plus grand `id` de panel existant (pour choisir un `id` unique : max_id + 1)
    - La position `gridPos` du dernier panel pour éviter les chevauchements

    Ajouter un nouveau panel stat dans le tableau `"panels"` (après le dernier panel existant) :

    ```json
    {
      "datasource": {
        "type": "prometheus",
        "uid": "grafanacloud-tallec7-prom"
      },
      "fieldConfig": {
        "defaults": {
          "color": {
            "mode": "thresholds"
          },
          "mappings": [],
          "thresholds": {
            "mode": "absolute",
            "steps": [
              { "color": "green", "value": null },
              { "color": "blue", "value": 1 }
            ]
          }
        }
      },
      "gridPos": { "h": 6, "w": 4, "x": 0, "y": 12 },
      "id": <max_existing_id + 1>,
      "options": {
        "colorMode": "value",
        "graphMode": "area",
        "justifyMode": "center",
        "orientation": "auto",
        "reduceOptions": { "calcs": ["lastNotNull"], "fields": "", "values": false },
        "textMode": "auto"
      },
      "targets": [
        {
          "expr": "sum(neopro_receivers_total{status=\"detected\"})",
          "legendFormat": "Fire Sticks",
          "refId": "A"
        }
      ],
      "title": "Fire Sticks détectés",
      "type": "stat"
    }
    ```

    Ajuster `gridPos.y` pour ne pas chevaucher les panels existants (lire la gridPos du dernier panel et positionner dessous).

    CRITIQUE : le JSON final doit être valide. Vérifier avec `node -e "JSON.parse(require('fs').readFileSync('docker/grafana/provisioning/dashboards/json/cloud/neopro-overview-cloud.json','utf8'))"` — doit sortir sans erreur.

    Ce panel satisfait le guard `smoke-metrics-observability.test.ts` qui vérifie que le nom `neopro_receivers_total` apparaît dans au moins un fichier Grafana dashboard JSON ou rules.yml.

  </action>
  <verify>
    <automated>node -e "JSON.parse(require('fs').readFileSync('/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/worktrees/nifty-ellis-756b56/docker/grafana/provisioning/dashboards/json/cloud/neopro-overview-cloud.json','utf8')); console.log('JSON valide')"</automated>
  </verify>
  <done>Le fichier JSON parse sans erreur. `grep "neopro_receivers_total" docker/grafana/provisioning/dashboards/json/cloud/neopro-overview-cloud.json` retourne au moins une ligne. Le panel "Fire Sticks détectés" est visible dans le JSON.</done>
</task>

</tasks>

<verification>
```bash
# 1. Compilation TypeScript propre
cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/worktrees/nifty-ellis-756b56/central-server && npx tsc --noEmit

# 2. Smoke tests smart (smoke-wiring + smoke-socket-realtime touchés par socket.service.ts)

npm run test:smoke:smart

# 3. Vérification grep call sites

grep -n "recordReceiver" src/services/metrics.service.ts src/services/socket.service.ts src/controllers/sites.controller.ts

# 4. JSON Grafana valide

node -e "JSON.parse(require('fs').readFileSync('../docker/grafana/provisioning/dashboards/json/cloud/neopro-overview-cloud.json','utf8')); console.log('OK')"

# 5. Vérification metric name dans Grafana JSON

grep "neopro_receivers_total" ../docker/grafana/provisioning/dashboards/json/cloud/neopro-overview-cloud.json

```
</verification>

<success_criteria>
1. `npx tsc --noEmit` passe sans erreur dans central-server.
2. `grep "neopro_receivers_total" central-server/src/services/metrics.service.ts` retourne la déclaration Counter ET le nom de métrique.
3. `grep "recordReceiver" central-server/src/services/socket.service.ts` retourne 2 occurrences (detected dans state-sync + disconnected dans handleDisconnection).
4. `grep "recordReceiver" central-server/src/controllers/sites.controller.ts` retourne 1 occurrence (assigned dans updateSiteDisplays).
5. Le JSON Grafana parse sans erreur ET contient "neopro_receivers_total".
6. `npm run test:smoke:smart` passe (ou les suites concernées sont vertes).
</success_criteria>

<output>
Après completion, créer `.planning/phases/09-observe-metriques-smoke/09-observe-01-SUMMARY.md` avec :
- Les fichiers modifiés et les lignes clés ajoutées
- Confirmation que le Counter est déclaré et les 3 call sites sont en place
- Hash du dernier commit
</output>
```
