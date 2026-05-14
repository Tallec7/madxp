/**
 * Smoke tests — Recording flap → analytics sponsors invisibles
 * (incident Mangin-Beaulieu 2026-05-14)
 *
 * Symptôme : sponsors locaux tournaient bien sur la TV (boucle Bresenham
 * autonome) mais aucun event analytics ne remontait au dashboard. 28 toggles
 * automatiques de `recordingState` en 4h, cycles ON pendant 7-40s puis OFF.
 *
 * Cause racine triple :
 *
 * 1. `tv.component.ts` n'appelait `startRecording(false)` au boot QUE pour les
 *    sites SaaS. Les sites Pi non-SaaS restaient avec `isRecording=false` en
 *    permanence → `analytics.service.ts:285` bail `!recordingState.isRecording`
 *    → 0 event poussé pour la boucle sponsor par défaut.
 *
 * 2. `manual-video.service.ts` togglait `startRecording(false)` puis
 *    `stopRecording(false)` autour de CHAQUE vidéo manuelle déclenchée. Sur
 *    les Pi qui passaient malgré tout par ce path (déclenchements Remote),
 *    chaque sponsor cliqué créait un cycle visible dans `[Recording] State
 *    update` → bruit log + flap.
 *
 * 3. `recording-state.service.ts broadcast()` ré-émettait sans guard
 *    d'idempotence — tout appel à `startRecording`/`stopRecording` même avec
 *    un state inchangé déclenchait un broadcast (et donc un nouveau cycle log
 *    serveur).
 *
 * Le fix :
 *   - tv.component.ts:223 → condition élargie (recording ON par défaut sur
 *     tout TV non-slave non-preview, indépendamment du mode SaaS).
 *   - manual-video.service.ts:204+287 → suppression du toggle auto + du flag
 *     `_manualRecordingStarted` + de l'injection RecordingStateService.
 *   - recording-state.service.ts → champ `_lastBroadcastState` + early-return
 *     dans `broadcast()` si state identique au précédent.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../../..');
const TV_COMPONENT = path.join(ROOT, 'raspberry/src/app/components/tv/tv.component.ts');
const MANUAL_VIDEO = path.join(ROOT, 'raspberry/src/app/services/manual-video.service.ts');
const RECORDING_STATE = path.join(ROOT, 'raspberry/src/app/services/recording-state.service.ts');

describe('Recording flap incident 2026-05-14 — analytics sponsors invisibles (smoke)', () => {
  const tv = fs.readFileSync(TV_COMPONENT, 'utf8');
  const mv = fs.readFileSync(MANUAL_VIDEO, 'utf8');
  const rs = fs.readFileSync(RECORDING_STATE, 'utf8');

  describe('tv.component.ts — recording ON par défaut au boot', () => {
    it('appelle startRecording(false) au boot du TV non-slave non-preview', () => {
      // La condition doit inclure les 3 guards, sans condition `saasMode`.
      expect(tv).toMatch(
        /if\s*\(\s*!this\.tvSyncService\.isSlaveMode\s*&&\s*this\.displayType\s*===\s*['"]tv['"]\s*&&\s*!this\.isPreviewMode\s*\)\s*\{[\s\S]*?this\.recordingState\.startRecording\(false\)/,
      );
    });

    it('appelle startSession() dans le même bloc (analytics OK)', () => {
      const block = tv.match(
        /if\s*\(\s*!this\.tvSyncService\.isSlaveMode[\s\S]{0,400}?\}/,
      );
      expect(block).not.toBeNull();
      expect(block![0]).toMatch(/this\.analyticsService\.startSession\(\)/);
    });

    it('ne gate plus le recording boot sur (environment as ...).saasMode', () => {
      // L'ancienne condition `(environment as { saasMode?: boolean }).saasMode`
      // gardait les Pi non-SaaS bloqués. Le `if` qui contient
      // startRecording(false) ne doit plus contenir saasMode dans sa condition.
      const ifBlock = tv.match(
        /if\s*\(([\s\S]{0,400}?)\)\s*\{[\s\S]{0,300}?this\.recordingState\.startRecording\(false\)/,
      );
      expect(ifBlock).not.toBeNull();
      expect(ifBlock![1]).not.toMatch(/saasMode/);
    });
  });

  describe('manual-video.service.ts — pas de toggle recording', () => {
    it('ne contient PAS recordingState.startRecording', () => {
      expect(mv).not.toMatch(/recordingState\.startRecording/);
    });

    it('ne contient PAS recordingState.stopRecording', () => {
      expect(mv).not.toMatch(/recordingState\.stopRecording/);
    });

    it('ne contient PAS le flag _manualRecordingStarted', () => {
      expect(mv).not.toMatch(/_manualRecordingStarted/);
    });

    it("n'injecte plus RecordingStateService", () => {
      expect(mv).not.toMatch(/RecordingStateService/);
      expect(mv).not.toMatch(/from\s+['"]\.\/recording-state\.service['"]/);
    });

    it('continue à tracker analytics autour des vidéos manuelles', () => {
      // Le toggle recording a sauté, mais trackVideoStart/trackVideoEnd doivent
      // rester (sinon les vidéos manuelles ne sont plus comptées du tout).
      expect(mv).toMatch(/analyticsService\.trackVideoStart\(\s*video\s*,\s*['"]manual['"]\s*\)/);
      expect(mv).toMatch(/analyticsService\.trackVideoEnd\(/);
    });
  });

  describe('recording-state.service.ts — broadcast idempotent', () => {
    it('déclare _lastBroadcastState pour le guard', () => {
      expect(rs).toMatch(/_lastBroadcastState\s*:\s*RecordingStateEvent\s*\|\s*null/);
    });

    it('broadcast() early-return si state identique au précédent', () => {
      const fn = rs.match(/private\s+broadcast\(\)\s*:\s*void\s*\{[\s\S]*?\n\s{2}\}/);
      expect(fn).not.toBeNull();
      const body = fn![0];

      // Compare les 2 champs
      expect(body).toMatch(/_lastBroadcastState\.isRecording\s*===\s*state\.isRecording/);
      expect(body).toMatch(/_lastBroadcastState\.isManualOverride\s*===\s*state\.isManualOverride/);

      // Early-return + persiste avant les emit
      expect(body).toMatch(/return\s*;/);
      const returnIdx = body.search(/return\s*;/);
      const setLastIdx = body.search(/this\._lastBroadcastState\s*=\s*state/);
      const localIdx = body.search(/this\.localBroadcast\.emitRecordingState/);
      const socketIdx = body.search(/this\.socketService\.emit\(\s*['"]recording-state['"]/);
      expect(returnIdx).toBeGreaterThan(-1);
      expect(setLastIdx).toBeGreaterThan(returnIdx);
      expect(localIdx).toBeGreaterThan(setLastIdx);
      expect(socketIdx).toBeGreaterThan(setLastIdx);
    });

    it('conserve INACTIVITY_DELAY = 15 minutes', () => {
      // Garde-fou contre une régression sur le timeout (la spec est 15 min).
      expect(rs).toMatch(/INACTIVITY_DELAY\s*=\s*15\s*\*\s*60\s*\*\s*1000/);
    });
  });
});
