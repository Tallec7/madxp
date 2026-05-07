/**
 * Smoke test — Template Studio v3 / PREV-01 / PREV-02 / PREV-03.
 *
 * Locks the live Remotion Player integration contract for the wizard:
 * - Single mount of <app-wizard-preview-panel> in the shell with [hidden] (NOT *ngIf — Pitfall P3).
 * - buildRuntimePlayerState applies proxyUrl() per-layer + per-variant (Pitfall P2).
 * - PREVIEW_FIXTURES exports FR placeholder strings.
 * - Hybrid debounce(300) + (blur) wiring on Step 3 form (Pitfall 9 — burst typing race).
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const wizardDir = path.join(
  repoRoot,
  'central-dashboard',
  'src',
  'app',
  'features',
  'content',
  'remotion-templates',
  'studio-v3',
  'wizard',
);
const previewService = path.join(
  repoRoot,
  'central-dashboard',
  'src',
  'app',
  'features',
  'content',
  'remotion-templates',
  'remotion-preview.service.ts',
);

describe('Template Studio v3 — preview integration (PREV-01/02/03)', () => {
  it('A: WizardPreviewPanelComponent file exists', () => {
    expect(fs.existsSync(path.join(wizardDir, 'wizard-preview-panel.component.ts'))).toBe(true);
  });

  it('B: shell HTML mounts <app-wizard-preview-panel> exactly once with [hidden], never *ngIf (Pitfall P3)', () => {
    const html = fs.readFileSync(
      path.join(wizardDir, 'studio-v3-wizard.component.html'),
      'utf8',
    );
    const mountCount = (html.match(/<app-wizard-preview-panel\b/g) || []).length;
    expect(mountCount).toBe(1);
    // [hidden] used on the preview panel
    expect(html).toMatch(/<app-wizard-preview-panel[\s\S]*?\[hidden\]=/);
    // *ngIf NEVER on the preview panel (Pitfall P3 — single mount)
    expect(html).not.toMatch(/<app-wizard-preview-panel[\s\S]*?\*ngIf/);
  });

  it('C: remotion-preview.service.ts buildRuntimePlayerState applies proxyUrl per-layer (Pitfall P2)', () => {
    const src = fs.readFileSync(previewService, 'utf8');
    // Allow optional generics between the name and the open paren (`buildRuntimePlayerState<L,V,...>(...)`)
    expect(src).toMatch(/buildRuntimePlayerState\s*[<(]/);
    // Must map over layers and call proxyUrl per element
    expect(src).toMatch(/layers[\s\S]{0,300}\.map\s*\([\s\S]{0,300}proxyUrl/);
    // Must map over variants per element too
    expect(src).toMatch(/variants[\s\S]{0,300}\.map\s*\([\s\S]{0,300}proxyUrl/);
    // Anti-Pitfall-P2: must NOT shortcut by passing the whole runtime state to proxyFtpUrls
    expect(src).not.toMatch(/proxyFtpUrls\s*\(\s*(?:state|playerState|runtime)\b/);
  });

  it('D: preview-fixtures.ts exports PREVIEW_FIXTURES with FR placeholder strings', () => {
    const fixturePath = path.join(wizardDir, 'preview-fixtures.ts');
    expect(fs.existsSync(fixturePath)).toBe(true);
    const src = fs.readFileSync(fixturePath, 'utf8');
    expect(src).toMatch(/export\s+const\s+PREVIEW_FIXTURES\b/);
    expect(src).toContain('PRÉNOM NOM');
    expect(src).toContain('NOM DU CLUB');
  });

  it('E: wizard-step-zones uses hybrid debounce/blur (debounceTime(300) AND (blur))', () => {
    const src = fs.readFileSync(
      path.join(wizardDir, 'wizard-step-zones.component.ts'),
      'utf8',
    );
    expect(src).toMatch(/debounceTime\s*\(\s*300\s*\)/);
    expect(src).toMatch(/\(blur\)=/);
  });

  /**
   * Regression guard — bug 2026-05-07 : la 1re sélection d'un fond animé
   * faisait planter Chrome (boucle infinie d'effect Angular).
   *
   * Cause : l'effect du shell lisait `state()` ET écrivait `state.previewState`
   * avec un guard `next !== s.previewState` jamais satisfait
   * (`buildRuntimePlayerState` réalloue toujours un nouvel objet) → recursion.
   *
   * Fix : `previewState` extrait du `WizardState` vers un signal séparé
   * `previewStateSignal`. L'effect lit `state()` mais écrit ailleurs, donc
   * pas de feedback. Toute régression qui réintroduirait `previewState` dans
   * le signal `state` ramènerait le freeze.
   */
  it('F: WizardState type does NOT carry previewState (effect feedback loop guard)', () => {
    const types = fs.readFileSync(
      path.join(wizardDir, '..', 'wizard-state.types.ts'),
      'utf8',
    );
    expect(types).not.toMatch(/previewState\??:\s*RuntimePlayerState/);
  });

  it('F2: wizard shell never writes previewState into state.update (effect feedback loop guard)', () => {
    const shell = fs.readFileSync(
      path.join(wizardDir, 'studio-v3-wizard.component.ts'),
      'utf8',
    );
    expect(shell).not.toMatch(/state\.update\([^)]*previewState/);
    expect(shell).toMatch(/previewStateSignal\s*=\s*signal</);
  });
});
