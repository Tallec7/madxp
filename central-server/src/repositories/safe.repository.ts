/**
 * SAFe Repository
 *
 * Accès DB pour les données hybrides SAFe :
 * - Vélocité persistée par sprint
 * - Overrides de statut de stories
 *
 * Source de vérité = markdown, ces tables stockent
 * les overrides dynamiques pour la couche hybride.
 */

import { QueryResultRow } from 'pg';
import { query } from '../config/database';
import logger from '../config/logger';

// --- Row types ---

export interface SprintVelocityRow extends QueryResultRow {
  id: number;
  sprint_id: string;
  velocity: number;
  recorded_at: Date;
}

export interface StoryStatusOverrideRow extends QueryResultRow {
  id: number;
  story_id: string;
  status: string;
  updated_at: Date;
}

// --- Repository ---

class SafeRepository {
  /**
   * Get all persisted sprint velocities.
   * Returns a map: sprintId → velocity.
   */
  async getVelocities(): Promise<Map<string, number>> {
    try {
      const result = await query<SprintVelocityRow>(
        'SELECT sprint_id, velocity FROM safe_sprint_velocity'
      );
      const map = new Map<string, number>();
      for (const row of result.rows) {
        map.set(row.sprint_id, Number(row.velocity));
      }
      return map;
    } catch (error) {
      logger.warn('SAFe: safe_sprint_velocity table not available (migration pending?)', { error });
      return new Map();
    }
  }

  /**
   * Upsert velocity for a sprint.
   */
  async upsertVelocity(sprintId: string, velocity: number): Promise<void> {
    try {
      await query(
        `INSERT INTO safe_sprint_velocity (sprint_id, velocity, recorded_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (sprint_id) DO UPDATE SET velocity = $2, recorded_at = NOW()`,
        [sprintId, velocity]
      );
    } catch (error) {
      logger.warn('SAFe: Failed to upsert sprint velocity', { sprintId, error });
    }
  }

  /**
   * Get all story status overrides.
   * Returns a map: storyId → status.
   */
  async getStoryOverrides(): Promise<Map<string, string>> {
    try {
      const result = await query<StoryStatusOverrideRow>(
        'SELECT story_id, status FROM safe_story_status_override'
      );
      const map = new Map<string, string>();
      for (const row of result.rows) {
        map.set(row.story_id, row.status);
      }
      return map;
    } catch (error) {
      logger.warn('SAFe: safe_story_status_override table not available (migration pending?)', { error });
      return new Map();
    }
  }

  /**
   * Upsert status override for a story.
   */
  async upsertStoryStatus(storyId: string, status: string): Promise<void> {
    try {
      await query(
        `INSERT INTO safe_story_status_override (story_id, status, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (story_id) DO UPDATE SET status = $2, updated_at = NOW()`,
        [storyId, status]
      );
    } catch (error) {
      logger.warn('SAFe: Failed to upsert story status override', { storyId, error });
    }
  }
}

export const safeRepository = new SafeRepository();
