/**
 * Pin Migration Service — ADR-058 Phase 2A
 *
 * Migration opportuniste du PIN legacy site-scope (`sites.remote_pin_hash`,
 * SHA-256) vers le PIN du profil par défaut (`config_profiles.remote_pin_hash`,
 * bcrypt rounds=12). Déclenchée après une vérification legacy réussie :
 * on connait alors le PIN en clair, donc on peut le re-hasher en bcrypt.
 *
 * Effets de bord :
 *   1. bcrypt.hash(pin, 12) sur le profil par défaut (si pas déjà configuré)
 *   2. `sites.remote_pin_hash = NULL` (on ne garde plus le legacy)
 *   3. metric `madxp_legacy_pin_migrations_total{status}`
 *   4. log Winston info (success) / warn (failed, skipped)
 *
 * Non-fatal : toute erreur retourne silencieusement sans casser la vérif PIN.
 */

import bcrypt from 'bcryptjs';
import {
  configProfileRepository,
} from '../repositories/config-profile.repository';
import { siteRepository } from '../repositories/site.repository';
import logger from '../config/logger';
import metricsService from './metrics.service';

const BCRYPT_ROUNDS = 12;

export async function migrateLegacyPinToDefaultProfile(
  siteId: string,
  plainPin: string
): Promise<'success' | 'skipped_no_default' | 'skipped_already_set' | 'failed'> {
  try {
    const profiles = await configProfileRepository.findProfilesMetadata(siteId);
    const defaultProfile = profiles.find((p) => p.is_default);

    if (!defaultProfile) {
      metricsService.recordLegacyPinMigration('skipped_no_default');
      logger.info('Legacy PIN migration skipped (no default profile)', { siteId });
      return 'skipped_no_default';
    }

    if (defaultProfile.remote_pin_required) {
      // Default profile already has its own PIN — do not overwrite.
      metricsService.recordLegacyPinMigration('skipped_already_set');
      return 'skipped_already_set';
    }

    const hash = await bcrypt.hash(plainPin, BCRYPT_ROUNDS);
    await configProfileRepository.setPin(defaultProfile.id, {
      hash,
      required: true,
    });
    await siteRepository.clearRemotePin(siteId);

    metricsService.recordLegacyPinMigration('success');
    logger.info('Legacy site PIN migrated to default profile (ADR-058 Phase 2A)', {
      siteId,
      profileId: defaultProfile.id,
    });
    return 'success';
  } catch (err) {
    metricsService.recordLegacyPinMigration('failed');
    logger.warn('Legacy PIN migration failed (non-fatal)', {
      siteId,
      error: (err as Error).message,
    });
    return 'failed';
  }
}
