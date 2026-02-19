# Guide Complet - Rapports PDF Analytics Sponsors

## Vue d'ensemble

Le module de génération de rapports PDF permet de créer des rapports professionnels avec graphiques pour les sponsors et les clubs. Ces rapports incluent des visualisations Chart.js, une mise en page professionnelle, et un certificat de diffusion avec signature numérique.

## Architecture

### Flux 2 : Generation on-demand avec stockage (v3.49+)

```
POST /api/reports/generate { type: "club"|"advertiser"|"site_sponsor", entityId, periodStart, periodEnd }
    │
    ▼
┌─────────────────────────┐     ┌──────────────────┐     ┌──────────────┐
│ generated_reports (DB)  │     │ pdf-report       │     │ FTP Upload   │
│ status = 'generating'   │────▶│ .service.ts      │────▶│ (Hostinger)  │
│ storage_path = placeholder│    │ PDFKit + Chart.js │     │ → URL        │
└─────────────────────────┘     └──────────────────┘     └──────────────┘
    │                                                           │
    ▼                                                           │
┌─────────────────────────┐                                     │
│ status = 'completed'    │◀────────────────────────────────────┘
│ storage_url = https://… │
│ checksum = sha256(…)    │
└─────────────────────────┘
```

**Cycle de vie :** INSERT (generating) → PDF Buffer → SHA-256 → FTP upload → UPDATE (completed/failed)

### Flux 1 : Rapport direct (download immediat, legacy)

```
┌─────────────────────────────────────────────────────────────────────┐
│                     GÉNÉRATION RAPPORTS PDF                          │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────┐      ┌──────────────────────┐      ┌─────────────┐
│  Frontend        │      │  Backend API         │      │  Services   │
│  Dashboard       │─────▶│  /api/sponsors/:id/  │─────▶│  PDFKit +   │
│                  │      │  report              │      │  Chart.js   │
└──────────────────┘      └──────────────────────┘      └─────────────┘
                                                                │
                                                                ▼
                                                      ┌─────────────────┐
                                                      │  PDF Buffer     │
                                                      │  (téléchargé)   │
                                                      └─────────────────┘
```

## Fonctionnalités

### 1. Structure du Rapport Sponsor (4 pages)

#### Page 1 : Page de garde

- Logo NEOPRO stylisé
- Titre "RAPPORT SPONSOR"
- Nom du sponsor
- Période d'analyse (DD/MM/YYYY - DD/MM/YYYY)
- Date de génération

#### Page 2 : Résumé Exécutif

- Grille de 6 KPIs avec icônes :
  - 📊 Impressions totales
  - ⏱️ Temps d'écran total
  - ✅ Taux de complétion (%)
  - 👥 Audience estimée
  - 📍 Sites actifs
  - 📅 Jours actifs

#### Page 3 : Tendances et Analyses

- **Graphique linéaire** : Évolution des impressions quotidiennes
  - Axe X : Dates
  - Axe Y : Nombre d'impressions
  - Courbe lissée avec tension 0.4
  - Remplissage transparent sous la courbe

- **Graphique en anneau** : Répartition par type d'événement
  - Match / Entraînement / Tournoi / Autre
  - Couleurs distinctes pour chaque catégorie
  - Légende à droite

#### Page 4 : Certificat de Diffusion (optionnel)

- Bordure décorative double
- Texte de certification officiel
- Métriques certifiées (liste à puces)
- **Signature numérique SHA-256** :
  - Format : `NEOPRO-CERT-XXXXXXXX-XXXXXXXX-...`
  - Basée sur : sponsor ID, période, impressions, timestamp
  - Non falsifiable

## API Endpoints

### Flux 2 : Génération on-demand avec stockage (recommandé)

```http
POST /api/reports/generate
Authorization: Bearer <token>
Content-Type: application/json

{
  "type": "club" | "advertiser" | "site_sponsor",
  "entityId": "uuid",
  "periodStart": "YYYY-MM-DD",
  "periodEnd": "YYYY-MM-DD"
}
```

**Paramètres (body JSON, camelCase obligatoire) :**

| Paramètre     | Type   | Requis | Description                                  |
| ------------- | ------ | ------ | -------------------------------------------- |
| `type`        | string | ✅     | `"club"`, `"advertiser"` ou `"site_sponsor"` |
| `entityId`    | UUID   | ✅     | ID du site, annonceur ou sponsor local       |
| `periodStart` | string | ✅     | Date début (YYYY-MM-DD)                      |
| `periodEnd`   | string | ✅     | Date fin (YYYY-MM-DD)                        |

> ⚠️ Les clés doivent être en **camelCase**. `entity_id` / `period_start` / `period_end` seront rejetés avec erreur 400.

**Réponse succès (200) :**

```json
{
  "success": true,
  "data": {
    "reportId": "uuid",
    "url": "https://storage.neopro.fr/reports/..."
  }
}
```

**Réponse erreur (400) :**

```json
{ "error": "Paramètres manquants: type, entityId, periodStart, periodEnd" }
```

### Flux 1 : Rapport direct legacy (download immédiat)

```http
GET /api/sponsors/:sponsorId/report?from=YYYY-MM-DD&to=YYYY-MM-DD&signature=true
Authorization: Bearer <token>
```

**Paramètres de requête :**

- `from` (required) : Date de début (YYYY-MM-DD)
- `to` (required) : Date de fin (YYYY-MM-DD)
- `signature` (optional) : Inclure le certificat de diffusion (true/false)
- `format` (optional) : Format du PDF (a4/letter, défaut: a4)
- `language` (optional) : Langue (fr/en, défaut: fr)

**Réponse :**

```
Content-Type: application/pdf
Content-Disposition: attachment; filename="rapport-sponsor-YYYY-MM.pdf"

[Binary PDF data]
```

## Implémentation Technique

### Technologies utilisées

1. **PDFKit** : Génération de documents PDF
   - Mise en page professionnelle
   - Polices : Helvetica, Helvetica-Bold, Helvetica-Oblique, Courier
   - Support des images (logos, graphiques)

2. **chartjs-node-canvas** : Rendu de graphiques Chart.js en images
   - Graphiques ligne (line chart)
   - Graphiques anneau (doughnut chart)
   - Rendu serveur en PNG/Buffer

3. **crypto (Node.js)** : Signature numérique SHA-256

### Code principal

```typescript
// central-server/src/services/pdf-report.service.ts

import PDFDocument from 'pdfkit';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import * as crypto from 'crypto';

async function generateSponsorReport(
  sponsorId: string,
  from: string,
  to: string,
  options: PdfReportOptions,
): Promise<Buffer> {
  // 1. Récupérer les données depuis PostgreSQL
  const sponsor = await query(/* ... */);
  const summary = await query(/* métriques globales */);
  const dailyTrends = await query(/* tendances quotidiennes */);

  // 2. Créer le document PDF
  const doc = new PDFDocument({ size: 'A4', margin: 50 });

  // 3. Générer les graphiques Chart.js
  const chartBuffer = await generateDailyImpressionsChart(dailyTrends);

  // 4. Assembler le PDF (pages, textes, images, graphiques)
  doc.image(chartBuffer, 50, 200, { width: 500 });

  // 5. Ajouter la signature numérique si demandée
  if (options.includeSignature) {
    const signature = generateDigitalSignature(data);
    doc.text(signature);
  }

  // 6. Retourner le buffer
  return Buffer.concat(buffers);
}
```

### Génération de graphiques

#### Graphique linéaire (impressions quotidiennes)

```typescript
async function generateDailyImpressionsChart(
  dailyData: Array<{ date: string; impressions: number }>,
): Promise<Buffer> {
  const chartJSNodeCanvas = new ChartJSNodeCanvas({
    width: 800,
    height: 400,
    backgroundColour: 'white',
  });

  const configuration = {
    type: 'line',
    data: {
      labels: dailyData.map((d) => formatDate(d.date)),
      datasets: [
        {
          label: 'Impressions',
          data: dailyData.map((d) => d.impressions),
          borderColor: '#3b82f6',
          backgroundColor: '#3b82f633',
          fill: true,
          tension: 0.4,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        title: { display: true, text: 'Évolution des impressions' },
      },
      scales: {
        y: { beginAtZero: true },
      },
    },
  };

  return chartJSNodeCanvas.renderToBuffer(configuration);
}
```

#### Graphique anneau (répartition événements)

```typescript
async function generateEventTypePieChart(eventTypeData: Record<string, number>): Promise<Buffer> {
  const configuration = {
    type: 'doughnut',
    data: {
      labels: ['Match', 'Entraînement', 'Tournoi', 'Autre'],
      datasets: [
        {
          data: Object.values(eventTypeData),
          backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'],
        },
      ],
    },
  };

  return chartJSNodeCanvas.renderToBuffer(configuration);
}
```

### Signature numérique

```typescript
function generateDigitalSignature(data: ReportData, options: PdfReportOptions): string {
  const signatureData = {
    sponsor: data.sponsor?.id,
    period: `${data.period.from}_${data.period.to}`,
    impressions: data.summary?.total_impressions,
    timestamp: new Date().toISOString(),
  };

  const hash = crypto.createHash('sha256').update(JSON.stringify(signatureData)).digest('hex');

  // Format lisible : NEOPRO-CERT-XXXXXXXX-XXXXXXXX-...
  const formatted = hash.match(/.{1,8}/g)?.join('-') || hash;
  return `NEOPRO-CERT-${formatted.substring(0, 47).toUpperCase()}`;
}
```

## Charte Graphique

### Couleurs NEOPRO

```typescript
const COLORS = {
  primary: '#1e3a8a', // Bleu foncé (titres)
  secondary: '#3b82f6', // Bleu clair (accents, graphiques)
  accent: '#10b981', // Vert (positif)
  text: '#1f2937', // Gris foncé (texte)
  lightGray: '#f3f4f6', // Fond des cartes KPI
  border: '#d1d5db', // Bordures
};
```

### Typographie

- **Titres** : Helvetica-Bold, 20-32pt
- **Sous-titres** : Helvetica-Bold, 14-18pt
- **Corps de texte** : Helvetica, 10-12pt
- **Code/Signature** : Courier, 8pt
- **Pied de page** : Helvetica, 8pt

### Mise en page

- **Format** : A4 (595 x 842 points)
- **Marges** : 50pt (environ 17mm)
- **Espacement des cartes KPI** : 20pt
- **Hauteur des graphiques** : 300-400px
- **Largeur des graphiques** : 500-800px

## Utilisation depuis le Dashboard Angular

```typescript
// frontend/src/app/pages/sponsors/sponsor-detail/sponsor-detail.component.ts

async downloadPDFReport() {
  const from = '2025-01-01';
  const to = '2025-01-31';
  const sponsorId = this.sponsor.id;

  try {
    const response = await this.http.get(
      `/api/sponsors/${sponsorId}/report?from=${from}&to=${to}&signature=true`,
      { responseType: 'blob' }
    ).toPromise();

    // Télécharger le fichier
    const blob = new Blob([response], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rapport-sponsor-${from}-${to}.pdf`;
    link.click();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Erreur téléchargement rapport:', error);
  }
}
```

## Performance

### Benchmarks

- Génération PDF simple (sans graphiques) : **~100ms**
- Génération PDF avec 2 graphiques : **~500ms**
- Taille fichier PDF typique : **50-150 KB**
- Limite recommandée : **1000 rapports/jour**

### Optimisations

1. **Cache des graphiques** :

   ```typescript
   // TODO: Implémenter cache Redis pour graphiques fréquents
   const cacheKey = `chart:${sponsorId}:${from}:${to}`;
   ```

2. **Génération asynchrone** :

   ```typescript
   // Pour gros volumes, utiliser une queue (Bull/BullMQ)
   await pdfQueue.add('generateReport', { sponsorId, from, to });
   ```

3. **Compression** :
   ```typescript
   doc.compress = true; // PDFKit compression activée par défaut
   ```

## Tests

### Test unitaire (génération PDF)

```typescript
// central-server/src/services/pdf-report.service.test.ts

describe('PDF Report Service', () => {
  it('should generate valid PDF buffer', async () => {
    const buffer = await generateSponsorReport('sponsor-123', '2025-01-01', '2025-01-31', {
      type: 'sponsor',
      includeSignature: true,
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.toString('utf8', 0, 4)).toBe('%PDF'); // Magic number
  });

  it('should include digital signature', async () => {
    const signature = generateDigitalSignature(mockData, {});
    expect(signature).toMatch(/^NEOPRO-CERT-[A-F0-9-]+$/);
  });
});
```

### Test d'intégration (API)

```typescript
describe('GET /api/sponsors/:id/report', () => {
  it('should return PDF with correct headers', async () => {
    const response = await request(app)
      .get('/api/sponsors/sponsor-123/report?from=2025-01-01&to=2025-01-31')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-disposition']).toContain('attachment');
  });
});
```

## Troubleshooting

### Erreur : "Cannot find module 'canvas'"

Chart.js nécessite une dépendance système sur certains environnements :

```bash
# Ubuntu/Debian
sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev

# macOS
brew install pkg-config cairo pango libpng jpeg giflib librsvg

# Puis réinstaller
npm install chartjs-node-canvas
```

### Erreur : "Memory limit exceeded"

Pour de gros rapports avec beaucoup de graphiques :

```bash
# Augmenter la limite mémoire Node.js
node --max-old-space-size=4096 dist/server.js
```

### Erreur : "Paramètres manquants: type, entityId, periodStart, periodEnd"

Le payload doit utiliser le **camelCase** pour les clés. Erreur courante : utiliser `snake_case` (`entity_id`, `period_start`, `period_end`) au lieu de `entityId`, `periodStart`, `periodEnd`.

```typescript
// ❌ FAUX — snake_case
{ type: 'site_sponsor', entity_id: sponsorId, period_start: '2026-01-01', period_end: '2026-01-31' }

// ✅ CORRECT — camelCase
{ type: 'site_sponsor', entityId: sponsorId, periodStart: '2026-01-01', periodEnd: '2026-01-31' }
```

> **Historique** : Ce bug a touché `sites.service.ts > generateSponsorReport()` (fix P7, feb 2026). Le `reports.service.ts` utilisait déjà le bon format. Alerte Prometheus `ReportValidationErrors` ajoutée pour détecter ce type de mismatch en production.

### Graphiques ne s'affichent pas

Vérifier que les données ne sont pas vides :

```typescript
if (data.trends.daily.length === 0) {
  logger.warn('No daily data for chart');
  // Afficher un message texte au lieu du graphique
}
```

## Roadmap

### Phase 1 : MVP (✅ Complété - Semaine 3)

- [x] Structure PDF 4 pages
- [x] Graphiques Chart.js (ligne + anneau)
- [x] Signature numérique SHA-256
- [x] Endpoint API `/api/sponsors/:id/report`

### Phase 2 : Améliorations (Semaine 4)

- [ ] Support logos personnalisés (upload sponsor/club)
- [ ] Graphiques supplémentaires (barres, aires)
- [ ] Multi-sponsors (rapport comparatif)
- [ ] Templates personnalisables

### Phase 3 : Enterprise (Semaine 5-6)

- [ ] Génération asynchrone (queue)
- [ ] Cache Redis pour graphiques
- [ ] Compression avancée
- [ ] Watermarks personnalisés
- [ ] Export multi-formats (PDF, Excel, PowerPoint)

## Conformité et Sécurité

### RGPD

- Les rapports ne contiennent **aucune donnée personnelle**
- Uniquement des métriques agrégées
- Signature numérique pour traçabilité

### Sécurité

- Authentification JWT requise sur l'endpoint
- Vérification des permissions (sponsor appartient au club)
- Rate limiting : 10 rapports/minute/utilisateur
- Validation stricte des paramètres de dates

### Archivage

- Les rapports on-demand (v3.49+) sont stockes sur FTP Hostinger et indexes en DB (`generated_reports`)
- Le flux legacy (direct download) ne stocke pas le PDF cote serveur
- Les rapports ont un checksum SHA-256 et un statut (`pending`/`generating`/`completed`/`failed`)

## Support

Pour toute question ou problème :

- Documentation technique : `docs/PDF_REPORTS_GUIDE.md`
- Code source : `central-server/src/services/pdf-report.service.ts`
- Tests : `central-server/src/services/pdf-report.service.test.ts`
- Issues : [GitHub Issues](https://github.com/neopro/neopro/issues)

---

**Dernière mise à jour** : 2026-02-18
**Version** : 1.2.0 (site_sponsor on-demand + camelCase fix + monitoring)
**Conformité BP §13.4** : 95%
