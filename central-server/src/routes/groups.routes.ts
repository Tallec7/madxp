import { Router } from 'express';
import * as groupsController from '../controllers/groups.controller';
import { authenticate, requireRole } from '../middleware/auth';
import { validate, schemas } from '../middleware/validation';

const router = Router();

router.get('/', authenticate, groupsController.getGroups);

router.get('/:id', authenticate, groupsController.getGroup);

router.get('/:id/sites', authenticate, groupsController.getGroupSites);

router.post(
  '/',
  authenticate,
  requireRole('admin', 'operator'),
  validate(schemas.createGroup),
  groupsController.createGroup
);

router.put(
  '/:id',
  authenticate,
  requireRole('admin', 'operator'),
  validate(schemas.updateGroup),
  groupsController.updateGroup
);

router.delete(
  '/:id',
  authenticate,
  requireRole('admin'),
  groupsController.deleteGroup
);

router.post(
  '/:id/sites',
  authenticate,
  requireRole('admin', 'operator'),
  validate(schemas.addSitesToGroup),
  groupsController.addSitesToGroup
);

router.delete(
  '/:id/sites/:siteId',
  authenticate,
  requireRole('admin', 'operator'),
  groupsController.removeSiteFromGroup
);

export default router;
