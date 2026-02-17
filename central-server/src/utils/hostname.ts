/**
 * Hostname slug derivation utilities for Raspberry Pi fleet.
 *
 * Generates unique, valid Linux hostnames from club names.
 * Pattern: "neopro-{slugified-club-name}" (e.g., "neopro-usap")
 *
 * Linux hostname rules:
 * - Max 63 characters
 * - Lowercase alphanumeric + hyphens
 * - No leading/trailing hyphens
 */

const PREFIX = 'neopro-';
const MAX_LENGTH = 63;
const MAX_SLUG_LENGTH = MAX_LENGTH - PREFIX.length; // 56 chars for slug part

/**
 * Derives a valid Linux hostname slug from a club name.
 *
 * @example
 * deriveHostnameSlug('USAP')           // 'neopro-usap'
 * deriveHostnameSlug('Racing 92')      // 'neopro-racing-92'
 * deriveHostnameSlug('Béziers')        // 'neopro-beziers'
 * deriveHostnameSlug('AS Saint-Étienne') // 'neopro-as-saint-etienne'
 */
export function deriveHostnameSlug(clubName: string): string {
  const slug = clubName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // Strip accents (diacritical marks)
    .replace(/[^a-z0-9]/g, '-')        // Replace non-alphanumeric with hyphen
    .replace(/-+/g, '-')               // Collapse consecutive hyphens
    .replace(/^-|-$/g, '')             // Trim leading/trailing hyphens
    .substring(0, MAX_SLUG_LENGTH);

  // Handle edge case: empty slug after sanitization
  if (!slug) {
    return `${PREFIX}club`;
  }

  return `${PREFIX}${slug}`;
}

/**
 * Resolves hostname collisions by appending a numeric suffix.
 *
 * @example
 * deriveHostnameWithSuffix('neopro-usap', [])                    // 'neopro-usap'
 * deriveHostnameWithSuffix('neopro-usap', ['neopro-usap'])       // 'neopro-usap-2'
 * deriveHostnameWithSuffix('neopro-usap', ['neopro-usap', 'neopro-usap-2']) // 'neopro-usap-3'
 */
export function deriveHostnameWithSuffix(
  baseHostname: string,
  existingHostnames: string[],
): string {
  if (!existingHostnames.includes(baseHostname)) {
    return baseHostname;
  }

  let suffix = 2;
  while (existingHostnames.includes(`${baseHostname}-${suffix}`)) {
    suffix++;
  }

  const candidate = `${baseHostname}-${suffix}`;

  // Ensure total length stays within 63 chars
  if (candidate.length > MAX_LENGTH) {
    const trimmed = baseHostname.substring(0, MAX_LENGTH - `-${suffix}`.length);
    return `${trimmed}-${suffix}`;
  }

  return candidate;
}
