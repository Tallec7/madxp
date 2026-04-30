/**
 * Smoke tests — API CRUD options + packshot refs (PR #775).
 * Garde-fous des 6 endpoints super_admin pour configurer un template
 * sans SQL direct.
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const centralSrc = path.join(repoRoot, 'central-server', 'src');

function readSrv(rel: string): string {
  return fs.readFileSync(path.join(centralSrc, rel), 'utf8');
}

describe('Joi schemas — templateOptionCreate / Update / templatePackshotRefCreate', () => {
  const validation = readSrv('middleware/validation.ts');

  it('templateOptionCreate enforce key snake_case + values min 1 + default required', () => {
    expect(validation).toMatch(/templateOptionCreate:\s*Joi\.object\([\s\S]*key:[\s\S]*pattern\(\s*\/\^\[a-z_\]\[a-z0-9_\]\{0,63\}\$\//);
    expect(validation).toMatch(/templateOptionCreate:[\s\S]*values:[\s\S]*\.min\(1\)\.required/);
    expect(validation).toMatch(/templateOptionCreate:[\s\S]*default_value:[\s\S]*\.required/);
  });

  it('templateOptionUpdate exige .min(1) pour éviter les patches vides', () => {
    expect(validation).toMatch(/templateOptionUpdate:[\s\S]*\}\)\.min\(1\)/);
  });

  it('templatePackshotRefCreate borne start_at_ms ≤ 600000 et z_index_offset ≤ 10000', () => {
    expect(validation).toMatch(/templatePackshotRefCreate:[\s\S]*start_at_ms:[\s\S]*\.max\(600000\)/);
    expect(validation).toMatch(/templatePackshotRefCreate:[\s\S]*z_index_offset:[\s\S]*\.max\(10000\)/);
  });

  it('paramSchemas idAndOptionId + idAndPackshotRefId définis', () => {
    expect(validation).toMatch(/idAndOptionId:\s*Joi\.object\(\{[\s\S]*optionId:\s*Joi\.string\(\)\.uuid\(\)\.required/);
    expect(validation).toMatch(/idAndPackshotRefId:\s*Joi\.object\(\{[\s\S]*packshotRefId:\s*Joi\.string\(\)\.uuid\(\)\.required/);
  });
});

describe('Repository — updateOption + findOptionById', () => {
  const repo = readSrv('repositories/template-options.repository.ts');

  it('expose updateOption + findOptionById', () => {
    expect(repo).toMatch(/async\s+updateOption\s*\(/);
    expect(repo).toMatch(/async\s+findOptionById\s*\(/);
  });

  it('updateOption sérialise values en JSON.stringify', () => {
    expect(repo).toMatch(/values\.push\(JSON\.stringify\(patch\.values\)\)/);
  });

  it('updateOption retourne row courant si patch vide (no-op safe)', () => {
    expect(repo).toMatch(/if\s*\(\s*sets\.length\s*===\s*0\s*\)\s*\{[\s\S]*SELECT\s*\*\s*FROM\s+template_options/);
  });
});

describe('Controller template-options — 6 handlers + erreurs métier', () => {
  const ctrl = readSrv('controllers/template-options.controller.ts');

  it('expose les 6 handlers', () => {
    expect(ctrl).toMatch(/export\s+const\s+createOption\s*=/);
    expect(ctrl).toMatch(/export\s+const\s+updateOption\s*=/);
    expect(ctrl).toMatch(/export\s+const\s+deleteOption\s*=/);
    expect(ctrl).toMatch(/export\s+const\s+listPackshotRefs\s*=/);
    expect(ctrl).toMatch(/export\s+const\s+createPackshotRef\s*=/);
    expect(ctrl).toMatch(/export\s+const\s+deletePackshotRef\s*=/);
  });

  it('createOption refuse default_value absent de values (400 invalid_default_value)', () => {
    expect(ctrl).toMatch(/!body\.values\.includes\(body\.default_value\)/);
    expect(ctrl).toMatch(/invalid_default_value/);
  });

  it('createOption mappe duplicate key → 409 key_exists', () => {
    expect(ctrl).toMatch(/duplicate\s+key\|unique[\s\S]*key_exists/);
  });

  it('createPackshotRef refuse self-reference (template parent === packshot)', () => {
    expect(ctrl).toMatch(/body\.packshot_template_id\s*===\s*templateId/);
    expect(ctrl).toMatch(/self_reference/);
  });

  it('createPackshotRef mappe duplicate → 409 mapping_exists + FK violation → 400 invalid_packshot_template', () => {
    expect(ctrl).toMatch(/mapping_exists/);
    expect(ctrl).toMatch(/invalid_packshot_template/);
  });

  it('updateOption vérifie cohérence default_value vs values existant en DB', () => {
    expect(ctrl).toMatch(/findOptionById/);
    expect(ctrl).toMatch(/!existing\.values\.includes\(body\.default_value\)/);
  });
});

describe('Routes — montées sous /api/remotion-templates-studio (super_admin)', () => {
  const routes = readSrv('routes/template-studio.routes.ts');

  it('POST /:id/options gated super_admin + Joi templateOptionCreate', () => {
    expect(routes).toMatch(/router\.post\(\s*'\/:id\/options'[\s\S]*adminOnly[\s\S]*templateOptionCreate[\s\S]*createOption/);
  });

  it('PATCH /:id/options/:optionId + DELETE /:id/options/:optionId super_admin', () => {
    expect(routes).toMatch(/router\.patch\(\s*'\/:id\/options\/:optionId'[\s\S]*adminOnly[\s\S]*templateOptionUpdate[\s\S]*updateOption/);
    expect(routes).toMatch(/router\.delete\(\s*'\/:id\/options\/:optionId'[\s\S]*adminOnly[\s\S]*deleteOption/);
  });

  it('Packshot refs : 3 endpoints super_admin', () => {
    expect(routes).toMatch(/router\.get\(\s*'\/:id\/packshot-refs'[\s\S]*adminOnly[\s\S]*listPackshotRefs/);
    expect(routes).toMatch(/router\.post\(\s*'\/:id\/packshot-refs'[\s\S]*adminOnly[\s\S]*templatePackshotRefCreate[\s\S]*createPackshotRef/);
    expect(routes).toMatch(/router\.delete\(\s*'\/:id\/packshot-refs\/:packshotRefId'[\s\S]*adminOnly[\s\S]*deletePackshotRef/);
  });

  it('GET /:id/options reste accessible aux users authentifiés (lecture saisie)', () => {
    // Pas de adminOnly sur le GET
    expect(routes).toMatch(/router\.get\(\s*'\/:id\/options'[\s\S]*authenticate[\s\S]*listTemplateOptions/);
  });
});
