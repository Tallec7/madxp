/**
 * Smoke tests — Raspberry TV : retour boucle après vidéo manuelle (Option B)
 *
 * Garde-fou pour la transition manuel→loop "preload silencieux".
 *
 * Bug originel (incident Mangin-Beaulieu 2026-05-15) :
 * - Vidéo manuelle 7s sur boucle de vidéos ~5s → la vidéo de boucle finit en
 *   arrière-plan pendant le manuel.
 * - `onVideoEnded` bail-out immédiat si `isManualMode === true` → loop player
 *   reste paused/ended → à la fin du manuel, branche "loop died" → cold restart
 *   `startSeamlessLoop()` from-scratch → freeze frame ~400ms visible + saut.
 *
 * Fix Option B :
 * - `onVideoEnded` pendant manual → `handleLoopEndedDuringManual()` qui avance
 *   l'index ET preload la suivante sur le player inactif (paused).
 * - `onManualEnded` essaye d'abord `resumeWithPreloadedLoop()` (chemin smooth),
 *   puis fallback cold-restart si rien n'est prêt.
 *
 * Sans ces invariants, le bug visible "blocage + saut entre vidéo manuelle et
 * vidéo suivante" revient.
 */

import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const PLAYBACK = path.join(REPO_ROOT, 'raspberry/src/app/services/video-playback.service.ts');
const MANUAL = path.join(REPO_ROOT, 'raspberry/src/app/services/manual-video.service.ts');

describe('Raspberry TV — manual→loop resume (Option B)', () => {
  let playbackSrc: string;
  let manualSrc: string;

  beforeAll(() => {
    playbackSrc = fs.readFileSync(PLAYBACK, 'utf8');
    manualSrc = fs.readFileSync(MANUAL, 'utf8');
  });

  describe('video-playback.service.ts', () => {
    it('declares the _loopPreparedDuringManual flag', () => {
      expect(playbackSrc).toMatch(/_loopPreparedDuringManual\s*=\s*false/);
    });

    it('exposes resumeWithPreloadedLoop() for manual-video service', () => {
      expect(playbackSrc).toMatch(/resumeWithPreloadedLoop\s*\(\s*\)\s*:\s*boolean/);
    });

    it('handleLoopEndedDuringManual() advances index AND preloads on inactive player', () => {
      const fnMatch = playbackSrc.match(/handleLoopEndedDuringManual\s*\([^)]*\)\s*:\s*void\s*{[\s\S]*?\n\s{2}}/);
      expect(fnMatch).toBeTruthy();
      const body = fnMatch![0];
      expect(body).toMatch(/_currentLoopIndex\s*=\s*nextIndex/);
      expect(body).toMatch(/preloadOnInactivePlayer/);
      expect(body).toMatch(/_loopPreparedDuringManual\s*=\s*true/);
    });

    it('onVideoEnded routes to handleLoopEndedDuringManual when in manual mode (no longer bails out silently)', () => {
      const fnMatch = playbackSrc.match(/onVideoEnded\s*\(fromPlayer:[^)]*\)\s*:\s*void\s*{[\s\S]*?getIsManualMode\(\)\)\s*{[\s\S]*?}/);
      expect(fnMatch).toBeTruthy();
      expect(fnMatch![0]).toMatch(/handleLoopEndedDuringManual\(\)/);
    });

    it('startSeamlessLoop resets _loopPreparedDuringManual (no zombie state across phase changes)', () => {
      const fnMatch = playbackSrc.match(/_isLoopMode\s*=\s*true;[\s\S]{0,300}?_loopPreparedDuringManual\s*=\s*false/);
      expect(fnMatch).toBeTruthy();
    });

    it('stopManualVideoAndReturnToLoop resets _loopPreparedDuringManual (stop button case)', () => {
      const fnMatch = playbackSrc.match(/stopManualVideoAndReturnToLoop\s*\([\s\S]*?\)\s*:\s*void\s*{[\s\S]*?_loopPreparedDuringManual\s*=\s*false/);
      expect(fnMatch).toBeTruthy();
    });
  });

  describe('manual-video.service.ts', () => {
    it('onManualEnded (master path) tries resumeWithPreloadedLoop BEFORE the cold-restart branch', () => {
      // Find the master onManualEnded (line ~275 in current source).
      const idxResume = manualSrc.indexOf('resumeWithPreloadedLoop');
      const idxColdRestart = manualSrc.indexOf("loop died during manual, restarting");
      expect(idxResume).toBeGreaterThan(0);
      expect(idxColdRestart).toBeGreaterThan(0);
      expect(idxResume).toBeLessThan(idxColdRestart);
    });

    it('preloaded slave path (preloadManualVideo) also tries resumeWithPreloadedLoop before cold-restart', () => {
      // Both calls to resumeWithPreloadedLoop must exist (master + preloaded slave).
      const matches = manualSrc.match(/resumeWithPreloadedLoop\(\)/g) || [];
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });
  });
});
