/**
 * Smoke tests — ADR-103 Phase 2.5 web content polish.
 *
 * Phase 2.5 covers:
 *   - WebContentService takes over from a manual MP4 cleanly (clears the
 *     manual players + resets isManualMode so the return goes to LOOP, not
 *     back to the manual entry).
 *   - Loop is NOT paused — it keeps advancing under the iframe (so a Phase
 *     2b boucle integration won't replay the same step on return).
 *   - Anti-flash: opacity CSS transition + 120ms reveal delay + freeze
 *     captured before clearing the iframe at returnToLoop.
 *   - Remote V2 Stop button → emits `stop-manual` socket command.
 *   - TV component routes stop-manual to web OR manual depending on
 *     what's currently playing.
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../../../');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('Smoke — ADR-103 Phase 2.5 web content polish', () => {
  // ------------ web-content.service.ts ------------

  it('web-content.service.ts — exposes Phase 2.5 constants (REVEAL_DELAY_MS, OPACITY_TRANSITION_MS)', () => {
    const src = read('raspberry/src/app/services/web-content.service.ts');
    // Phase 2.7 bumped REVEAL_DELAY_MS 120 → 250 (paint stabilisation).
    expect(/REVEAL_DELAY_MS\s*=\s*250/.test(src)).toBe(true);
    expect(/OPACITY_TRANSITION_MS\s*=\s*200/.test(src)).toBe(true);
    expect(/ADR-103 Phase 2\.5/.test(src)).toBe(true);
  });

  it('web-content.service.ts — registerElements sets iframe black background + no default transition (Phase 2.6)', () => {
    const src = read('raspberry/src/app/services/web-content.service.ts');
    const regStart = src.indexOf('registerElements(iframe');
    expect(regStart).toBeGreaterThan(0);
    const block = src.slice(regStart, regStart + 1000);
    expect(/iframe\.style\.background\s*=\s*['"]#000['"]/.test(block)).toBe(true);
    // Phase 2.6: transition disabled by default (instant show; transitions
    // applied only on close, hidden by freeze frame at z-20).
    expect(/iframe\.style\.transition\s*=\s*['"]none['"]/.test(block)).toBe(true);
    expect(/livestream\.style\.transition\s*=\s*['"]none['"]/.test(block)).toBe(true);
  });

  it('web-content.service.ts — clears active manual video on take-over (no resume to manual)', () => {
    const src = read('raspberry/src/app/services/web-content.service.ts');
    expect(/from '\.\/manual-video\.service'/.test(src)).toBe(true);
    expect(/clearActiveManualVideoIfAny/.test(src)).toBe(true);
    expect(/manualVideoService\.isManualMode\s*=\s*false/.test(src)).toBe(true);
    // The clear MUST be invoked from prepareShow (every take-over)
    const prepStart = src.indexOf('private prepareShow(');
    expect(prepStart).toBeGreaterThan(0);
    const prepBlock = src.slice(prepStart, prepStart + 2500);
    expect(/this\.clearActiveManualVideoIfAny\(\)/.test(prepBlock)).toBe(true);
  });

  it('web-content.service.ts — does NOT pause the loop player (advances silently under iframe)', () => {
    const src = read('raspberry/src/app/services/web-content.service.ts');
    // We must not pause the active loop player anywhere in show*/prepareShow.
    // (We DO pause manual players to clear them — that's intentional.)
    const prepStart = src.indexOf('private prepareShow(');
    const block = src.slice(prepStart, prepStart + 2000);
    expect(/getActivePlayer\(\)[\s\S]{0,80}\.pause\(\)/.test(block)).toBe(false);
  });

  it('web-content.service.ts — onLoad waits REVEAL_DELAY_MS before hiding the freeze frame', () => {
    const src = read('raspberry/src/app/services/web-content.service.ts');
    const onLoadStart = src.indexOf('const onLoad =');
    expect(onLoadStart).toBeGreaterThan(0);
    const block = src.slice(onLoadStart, onLoadStart + 1800);
    expect(/setTimeout\([\s\S]{0,800}hideFreezeFrame/.test(block)).toBe(true);
    expect(/REVEAL_DELAY_MS/.test(block)).toBe(true);
  });

  it('web-content.service.ts — onLoad waits two rAF ticks before starting reveal delay (Phase 2.7)', () => {
    const src = read('raspberry/src/app/services/web-content.service.ts');
    expect(/private scheduleAfterTwoFrames/.test(src)).toBe(true);
    expect(/requestAnimationFrame\([\s\S]{0,200}requestAnimationFrame/.test(src)).toBe(true);
    // The helper must be invoked from BOTH onLoad (showWebPage) and
    // onLoaded (showLivestream) so livestream shows are paint-stable too.
    const calls = (src.match(/this\.scheduleAfterTwoFrames\(/g) || []).length;
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(/Phase 2\.7/.test(src)).toBe(true);
  });

  it('web-content.service.ts — teardown captures freeze BEFORE clearing iframe', () => {
    const src = read('raspberry/src/app/services/web-content.service.ts');
    const teardownStart = src.indexOf('private teardown()');
    expect(teardownStart).toBeGreaterThan(0);
    const block = src.slice(teardownStart, teardownStart + 800);
    const freezeIdx = block.indexOf('captureAndShowFreezeFrame');
    const hideIframeIdx = block.indexOf('this.hideIframe()');
    expect(freezeIdx).toBeGreaterThan(0);
    expect(hideIframeIdx).toBeGreaterThan(0);
    expect(freezeIdx).toBeLessThan(hideIframeIdx);
  });

  it('web-content.service.ts — hideIframe is instant under the freeze cover (Phase 2.6)', () => {
    const src = read('raspberry/src/app/services/web-content.service.ts');
    const hideStart = src.indexOf('private hideIframe()');
    expect(hideStart).toBeGreaterThan(0);
    const block = src.slice(hideStart, hideStart + 700);
    // Phase 2.6: teardown captures freeze BEFORE this method runs so we
    // clear the iframe instantly. No setTimeout-deferred about:blank.
    expect(/about:blank/.test(block)).toBe(true);
    expect(/iframe\.style\.transition\s*=\s*['"]none['"]/.test(block)).toBe(true);
    expect(/Phase 2\.6/.test(block)).toBe(true);
  });

  it('web-content.service.ts — resumeRotation never restarts at savedLoopIndex (always +1)', () => {
    const src = read('raspberry/src/app/services/web-content.service.ts');
    const resStart = src.indexOf('private resumeRotation()');
    expect(resStart).toBeGreaterThan(0);
    const block = src.slice(resStart, resStart + 800);
    expect(/_savedLoopIndex \+ 1/.test(block)).toBe(true);
    // Never restart at exactly savedLoopIndex (would replay the same step)
    expect(/startSeamlessLoop\(this\._savedLoopIndex\)/.test(block)).toBe(false);
  });

  // ------------ Remote V2 Stop button ------------

  it('remote-v2 hero — exposes (stopPlaying) Output emitted by the Stop button', () => {
    const src = read('raspberry/src/app/components/remote-v2/parts/r2-hero.component.ts');
    expect(/@Output\(\) stopPlaying = new EventEmitter<void>\(\)/.test(src)).toBe(true);
    expect(/r2-stop-btn-circle/.test(src)).toBe(true);
    expect(/stopPlaying\.emit\(\)/.test(src)).toBe(true);
    // Visible only when something is playing (else show the loop btn)
    expect(/r2-stop-btn-circle[\s\S]{0,200}\*ngIf="playingVideo"/.test(src)).toBe(true);
  });

  it('remote-v2.component.ts — stopPlaying() emits stop-manual command', () => {
    const src = read('raspberry/src/app/components/remote-v2/remote-v2.component.ts');
    const stopIdx = src.indexOf('stopPlaying(): void');
    expect(stopIdx).toBeGreaterThan(0);
    // Include the JSDoc above the method (search a bit further back)
    const blockStart = Math.max(0, stopIdx - 600);
    const block = src.slice(blockStart, stopIdx + 1000);
    // Le contrat est : stopPlaying() doit émettre une commande `stop-manual`.
    // Depuis la PR de parité V1↔V2 (ADR-081), l'émission passe par le helper
    // privé `emitCommand({ type: 'stop-manual' })` qui ajoute commandId UUID v4
    // + target multi-écrans + double broadcast (localBroadcast + socket).
    // On valide donc le contrat fonctionnel (helper OU emit direct), pas la
    // string source littérale (anti-pattern smoke-test-mirror-code).
    const usesHelper = /this\.emitCommand\(\s*\{\s*type:\s*['"]stop-manual['"]/.test(block);
    const usesDirect = /this\.socketService\.emit\(\s*['"]command['"][\s\S]{0,200}type:\s*['"]stop-manual['"]/.test(block);
    expect(usesHelper || usesDirect).toBe(true);
    expect(/ADR-103 Phase 2\.5/.test(block)).toBe(true);
  });

  it('remote-v2.component.html — wires (stopPlaying) on app-r2-hero', () => {
    const src = read('raspberry/src/app/components/remote-v2/remote-v2.component.html');
    expect(/\(stopPlaying\)="stopPlaying\(\)"/.test(src)).toBe(true);
  });

  // ------------ TV component routing ------------

  it('tv.component.ts — stop-manual routes to web OR manual depending on active state', () => {
    const src = read('raspberry/src/app/components/tv/tv.component.ts');
    const handlerStart = src.indexOf("command.type === 'stop-manual'");
    expect(handlerStart).toBeGreaterThan(0);
    const block = src.slice(handlerStart, handlerStart + 1500);
    expect(/webContentService\.isActive/.test(block)).toBe(true);
    expect(/webContentService\.returnToLoop\(\)/.test(block)).toBe(true);
    expect(/manualVideoService\.stopAndReturnToLoop/.test(block)).toBe(true);
    expect(/ADR-103 Phase 2\.5/.test(block)).toBe(true);
  });
});
