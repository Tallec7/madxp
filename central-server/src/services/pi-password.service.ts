import { execFileSync } from 'child_process';
import logger from '../config/logger';

/**
 * ADR-132 — Service de rotation OTA du mot de passe système `pi`.
 *
 * Génère un hash SHA-512-crypt Linux ($6$salt$hash) compatible avec
 * `chpasswd -e` côté Pi.
 *
 * La génération passe par `openssl passwd -6 -stdin` :
 *   - stdin = pas d'argument CLI → pas d'injection shell
 *   - SHA-512-crypt : schéma $6$ natif Linux (PAM, /etc/shadow)
 *   - Compatible `chpasswd -e` (Pi Debian 12 Bookworm)
 */
class PiPasswordService {
  /**
   * Génère un hash SHA-512-crypt Linux pour un mot de passe donné.
   * Le hash est transmissible au Pi via `echo "pi:HASH" | sudo chpasswd -e`.
   *
   * @throws Error si `openssl` est absent ou si le mdp est trop court.
   */
  generateHash(password: string): string {
    if (!password || password.length < 8) {
      throw new Error('Pi system password must be at least 8 characters');
    }
    if (password.length > 128) {
      throw new Error('Pi system password must be at most 128 characters');
    }

    try {
      const hash = execFileSync(
        'openssl',
        ['passwd', '-6', '-stdin'],
        { input: `${password}\n`, encoding: 'utf8', timeout: 5000 }
      ).trim();

      if (!hash.startsWith('$6$')) {
        throw new Error(`openssl passwd returned unexpected format: ${hash.slice(0, 20)}`);
      }
      return hash;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('pi-password: hash generation failed', { error: msg });
      throw new Error(`Failed to generate SHA-512-crypt hash: ${msg}`);
    }
  }
}

export const piPasswordService = new PiPasswordService();
