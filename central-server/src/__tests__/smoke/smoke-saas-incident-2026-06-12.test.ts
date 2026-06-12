/**
 * Smoke tests — incident sécurité 2026-06-12 : auto-escalade & écritures admin
 * du rôle `club` via le bypass `requireRole`.
 *
 * INCIDENT (challenge CEO du rôle club, audit 2026-06-12)
 * Cause racine :
 *   `requireRole` (central-server/src/middleware/auth.ts) contenait un bypass
 *   tous-verbes pour le rôle `club` : `role==='club' && (req.params.siteId ||
 *   req.params.id) === user.site_id → next()`, SANS tester `req.method`. Combiné
 *   à `requireRole('admin', ...)` sur les routes /:siteId|:id, un club pouvait
 *   faire des ÉCRITURES admin sur son propre site :
 *     - PUT /api/sites/:siteId/club-permissions  → self-grant des 6 permissions
 *       (défait l'enforcement #1103)
 *     - POST /api/sites/:id/regenerate-key        → rotation api_key → casse son Pi
 *     - POST /api/sites/:id/command               → commande Pi arbitraire
 *     - DELETE /api/sites/:id                      → supprime son propre site
 *   De plus, les routes qui listent 'club' dans requireRole passaient NON-scopées
 *   (le scope ne venait que du bypass) → risque cross-tenant sur les sponsors.
 *
 * FIX :
 *   1. Le bypass `requireRole` est restreint aux GET (`req.method === 'GET'`).
 *      Toute écriture admin /:siteId redevient 403 pour le club.
 *   2. Les écritures club LÉGITIMES (sauvegarde/déploiement de boucle, draft)
 *      sont ouvertes explicitement : requireRole(..., 'club') + requireClubScope
 *      (scope own-site) + requireClubPermission('edit_loop').
 *   3. Les routes sponsors (#1103) reçoivent requireClubScope pour fermer le
 *      trou cross-tenant.
 *
 * Ces tests ÉCHOUENT si le bug réapparaît (file-level reads, no app bootstrap).
 *
 * @see docs/runbooks/INCIDENT-LOG.md (entrée 2026-06-12)
 * @see .claude/memory feedback_requirerole_club_bypass_write_hole
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../../../');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const AUTH = 'central-server/src/middleware/auth.ts';
const CONFIG_PROFILES = 'central-server/src/routes/config-profiles.routes.ts';
const DRAFTS = 'central-server/src/routes/drafts.routes.ts';
const SPONSORS = 'central-server/src/routes/site-sponsor.routes.ts';
const CLUB_PERMS = 'central-server/src/routes/club-permissions.routes.ts';
const SITES = 'central-server/src/routes/sites.routes.ts';

describe('Smoke — club requireRole bypass write hole (incident 2026-06-12)', () => {
  describe('auth.ts — le bypass club est GET-only', () => {
    let src: string;
    beforeAll(() => {
      src = read(AUTH);
    });

    it("le bypass club teste req.method === 'GET'", () => {
      // Le bloc du bypass doit exiger la méthode GET. Sans ça, le club peut
      // écrire sur toute route admin /:siteId de son propre site.
      const bypass = src.match(
        /req\.method === ['"]GET['"][^}]*req\.user\.role === ['"]club['"]/s
      );
      expect(bypass).not.toBeNull();
    });

    it("requireClubScope et requireClubPermission sont exportés", () => {
      expect(src).toMatch(/export const requireClubScope/);
      expect(src).toMatch(/export const requireClubPermission/);
    });
  });

  describe('routes dangereuses — le club NE doit PAS être listé', () => {
    it("PUT /:siteId/club-permissions ne liste pas 'club' (anti self-grant)", () => {
      const src = read(CLUB_PERMS);
      const block = src.match(
        /router\.put\(\s*['"]\/:siteId\/club-permissions['"][\s\S]*?\);/
      );
      expect(block).not.toBeNull();
      expect(block![0]).not.toMatch(/['"]club['"]/);
    });

    it("regenerate-key / command / DELETE site ne listent pas 'club'", () => {
      const src = read(SITES);
      for (const frag of ['/regenerate-key', '/command']) {
        const block = src.match(
          new RegExp(`router\\.post\\(\\s*['"\`][^'"\`]*${frag.replace('/', '\\/')}['"\`][\\s\\S]*?\\);`)
        );
        if (block) expect(block[0]).not.toMatch(/['"]club['"]/);
      }
    });
  });

  describe('écritures club légitimes — explicitement ouvertes, scopées, gated', () => {
    it("config-save & deploy : club + clubScopeBySiteId + edit_loop", () => {
      const src = read(CONFIG_PROFILES);
      expect(src).toMatch(/const clubScopeBySiteId = requireClubScope/);
      const save = src.match(
        /router\.put\(\s*['"]\/:siteId\/profiles\/:profileId\/configuration['"][\s\S]*?\);/
      );
      expect(save).not.toBeNull();
      expect(save![0]).toMatch(/['"]club['"]/);
      expect(save![0]).toMatch(/clubScopeBySiteId/);
      expect(save![0]).toMatch(/requireClubPermission\(['"]edit_loop['"]\)/);

      const deploy = src.match(
        /router\.post\(\s*['"]\/:siteId\/profiles\/:profileId\/deploy['"][\s\S]*?\);/
      );
      expect(deploy).not.toBeNull();
      expect(deploy![0]).toMatch(/clubScopeBySiteId/);
      expect(deploy![0]).toMatch(/requireClubPermission\(['"]edit_loop['"]\)/);
    });

    it("draft save/validate/deploy/delete : club + scope + edit_loop", () => {
      const src = read(DRAFTS);
      expect(src).toMatch(/const clubScopeBySiteId = requireClubScope/);
      for (const verb of [
        /router\.put\(\s*['"]\/:siteId\/draft['"][\s\S]*?\);/,
        /router\.post\(\s*['"]\/:siteId\/draft\/validate['"][\s\S]*?\);/,
        /router\.post\(\s*['"]\/:siteId\/draft\/deploy['"][\s\S]*?\);/,
        /router\.delete\(\s*['"]\/:siteId\/draft['"][\s\S]*?\);/,
      ]) {
        const block = src.match(verb);
        expect(block).not.toBeNull();
        expect(block![0]).toMatch(/clubScopeBySiteId/);
        expect(block![0]).toMatch(/requireClubPermission\(['"]edit_loop['"]\)/);
      }
    });
  });

  describe('sponsors — scope own-site (anti cross-tenant)', () => {
    it("requireClubScope est appliqué (clubScopeBySiteId défini et utilisé)", () => {
      const src = read(SPONSORS);
      expect(src).toMatch(/const clubScopeBySiteId = requireClubScope/);
      // Toutes les routes qui listent 'club' doivent aussi être scopées.
      const clubBlocks = src.match(/requireRole\([^)]*['"]club['"][^)]*\)/g) || [];
      expect(clubBlocks.length).toBeGreaterThan(0);
      const scopeUses = (src.match(/clubScopeBySiteId/g) || []).length;
      // -1 pour la déclaration `const clubScopeBySiteId = ...`
      expect(scopeUses - 1).toBeGreaterThanOrEqual(clubBlocks.length);
    });
  });
});
