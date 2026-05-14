/**
 * Smoke tests — Templates Studio V1 — sidebar dashboard.
 *
 * File-based : vérifie que les 3 routes du Studio V1 (Studio, Brand Kit,
 * Joueurs) sont câblées dans le menu latéral du dashboard, accessibles aux
 * rôles autorisés (super_admin/admin/club).
 *
 * Garde-fou : sans liens sidebar, l'opérateur doit taper l'URL à la main
 * → friction UX critique pour adoption V1.
 */

import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const LAYOUT = path.join(
  REPO_ROOT,
  'central-dashboard',
  'src',
  'app',
  'features',
  'layout',
  'layout.component.ts',
);

describe('Templates Studio V1 — sidebar nav', () => {
  const content = fs.readFileSync(LAYOUT, 'utf8');

  it.each([
    'templates-studio',
    'templates-studio/brand-kit',
    'templates-studio/players',
  ])('sidebar contains routerLink to /%s', (route) => {
    expect(content).toMatch(new RegExp(`routerLink="/${route.replace(/\//g, '\\/')}"`));
  });

  it('sidebar items are gated by canUseTemplatesStudio() helper', () => {
    // Aligné sur les routes app.routes.ts qui acceptent super_admin/admin/club.
    expect(content).toMatch(/canUseTemplatesStudio\(\)/);
    expect(content).toMatch(
      /canUseTemplatesStudio\(\)[\s\S]*?hasRole\('super_admin',\s*'admin',\s*'club'\)/,
    );
  });

  it('Studio link uses [routerLinkActiveOptions]={ exact: true } to avoid bleed onto sub-routes', () => {
    // Sans `exact: true`, /templates-studio reste actif quand on est sur
    // /templates-studio/brand-kit → 2 items "active" en même temps dans la
    // sidebar = visuel cassé.
    expect(content).toMatch(
      /routerLink="\/templates-studio"[\s\S]*?routerLinkActive="active"[\s\S]*?\[routerLinkActiveOptions\]="\{\s*exact:\s*true\s*\}"/,
    );
  });
});
