/**
 * SAFe Parser — Sprint parsing functions.
 *
 * Extracted from SafeParserService. All functions are standalone,
 * receiving docsDir and readFileSafe as parameters.
 */

import path from 'path';
import type { ReadFileSafeFn } from './safe-parser.types';
import type {
  SafeSprintTracker,
  SafeSprint,
  SafeSprintStory,
  SprintStoryStatus,
} from '../types/safe.types';

export function buildSprintTracker(docsDir: string, readFileSafe: ReadFileSafeFn): SafeSprintTracker {
  const sprints = parseSprints(docsDir, readFileSafe);

  const today = new Date().toISOString().slice(0, 10);
  let currentSprintId: string | null = null;
  for (const sprint of sprints) {
    if (sprint.startDate <= today && sprint.endDate >= today) {
      currentSprintId = sprint.id;
      break;
    }
  }
  if (!currentSprintId) {
    const future = sprints.find(s => s.startDate > today);
    if (future) currentSprintId = future.id;
  }

  const completedSprints = sprints.filter(s => s.endDate < today && s.velocity > 0);
  const averageVelocity = completedSprints.length > 0
    ? Math.round(completedSprints.reduce((sum, s) => sum + s.velocity, 0) / completedSprints.length)
    : 0;

  return { sprints, currentSprintId, averageVelocity };
}

export function parseSprints(docsDir: string, readFileSafe: ReadFileSafeFn): SafeSprint[] {
  const content = readFileSafe(path.join(docsDir, 'USER-STORIES.md'));
  if (!content) return [];

  const sprintDateMap: Record<string, { start: string; end: string }> = {
    'PI-1-S1': { start: '2026-02-16', end: '2026-02-27' },
    'PI-1-S2': { start: '2026-03-02', end: '2026-03-13' },
    'PI-1-S3': { start: '2026-03-16', end: '2026-03-27' },
    'PI-2-S1': { start: '2026-04-01', end: '2026-04-14' },
    'PI-2-S2': { start: '2026-04-15', end: '2026-04-28' },
    'PI-2-S3': { start: '2026-04-29', end: '2026-05-12' },
    'PI-2-S4': { start: '2026-05-13', end: '2026-05-26' },
    'PI-2-S5': { start: '2026-05-27', end: '2026-06-09' },
    'PI-2-S6': { start: '2026-06-10', end: '2026-06-23' },
    'PI-3-S1': { start: '2026-06-24', end: '2026-07-07' },
    'PI-3-S2': { start: '2026-07-08', end: '2026-07-21' },
    'PI-3-S3': { start: '2026-07-22', end: '2026-08-04' },
  };

  const sprintNames: Record<string, string> = {
    'PI-1-S1': 'Sprint 1 (Sem 8-9)',
    'PI-1-S2': 'Sprint 2 (Sem 10-11)',
    'PI-1-S3': 'Sprint 3 (Sem 12-13)',
    'PI-2-S1': 'PI-2 Sprint 1',
    'PI-2-S2': 'PI-2 Sprint 2',
    'PI-2-S3': 'PI-2 Sprint 3',
    'PI-2-S4': 'PI-2 Sprint 4',
    'PI-2-S5': 'PI-2 Sprint 5',
    'PI-2-S6': 'PI-2 Sprint 6',
    'PI-3-S1': 'PI-3 Sprint 1',
    'PI-3-S2': 'PI-3 Sprint 2',
    'PI-3-S3': 'PI-3 Sprint 3',
  };

  const storiesBySprint: Record<string, SafeSprintStory[]> = {};

  let currentPi = 'PI-1';
  let currentEpicId = '';

  const lines = content.split('\n');
  const partie2Start = lines.findIndex(l => l.includes('Partie 2'));
  if (partie2Start === -1) return [];

  for (let i = partie2Start; i < lines.length; i++) {
    const line = lines[i];

    const piMatch = line.match(/^###\s+(PI-\d+)/);
    if (piMatch) {
      currentPi = piMatch[1];
      continue;
    }

    const epicMatch = line.match(/^####\s+(E-\d+)\s*—/);
    if (epicMatch) {
      currentEpicId = epicMatch[1];
      continue;
    }

    const storyMatch = line.match(
      /\|\s*(US-[\d.]+)\s*\|\s*(F-[\d.]+)\s*\|\s*(.+?)\s*\|\s*(\d+)\s*\|\s*(\S+(?:\s+\S+)?)\s*\|\s*(\S+)\s*\|\s*(.+?)\s*\|/
    );
    if (storyMatch) {
      const storyId = storyMatch[1];
      const featureId = storyMatch[2];
      const name = storyMatch[3].trim();
      const sp = parseInt(storyMatch[4]);
      const sprintRaw = storyMatch[5].trim();
      const priority = storyMatch[6].trim();
      const statusRaw = storyMatch[7].trim();

      if (sprintRaw === 'TBD') continue;

      const sprintId = normalizeSprintId(sprintRaw, currentPi);
      if (!sprintId) continue;

      const status = mapStoryStatus(statusRaw);

      const epicId = currentEpicId || `E-${featureId.split('.')[0].replace('F-', '')}`;

      if (!storiesBySprint[sprintId]) {
        storiesBySprint[sprintId] = [];
      }

      storiesBySprint[sprintId].push({
        id: storyId,
        name,
        epicId,
        featureId,
        storyPoints: sp,
        priority,
        status,
      });
    }
  }

  const sprints: SafeSprint[] = [];
  for (const [sprintId, dates] of Object.entries(sprintDateMap)) {
    const stories = storiesBySprint[sprintId] || [];
    const velocity = stories.filter(s => s.status === 'done').reduce((sum, s) => sum + s.storyPoints, 0);
    const capacity = stories.reduce((sum, s) => sum + s.storyPoints, 0);

    if (stories.length > 0 || dates.start <= new Date().toISOString().slice(0, 10)) {
      sprints.push({
        id: sprintId,
        name: sprintNames[sprintId] || sprintId,
        piId: sprintId.split('-S')[0],
        startDate: dates.start,
        endDate: dates.end,
        stories,
        velocity,
        capacity,
      });
    }
  }

  return sprints.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export function normalizeSprintId(raw: string, currentPi: string): string | null {
  const directMatch = raw.match(/^(PI-\d+)\s+S(\d+)$/);
  if (directMatch) {
    return `${directMatch[1]}-S${directMatch[2]}`;
  }

  const simpleMatch = raw.match(/^S(\d+)$/);
  if (simpleMatch) {
    return `${currentPi}-S${simpleMatch[1]}`;
  }

  return null;
}

export function mapStoryStatus(raw: string): SprintStoryStatus {
  if (raw.includes('Done') || raw.includes('Livré')) return 'done';
  if (raw.includes('En cours')) return 'in-progress';
  if (raw.includes('Retiré')) return 'removed';
  return 'todo';
}
