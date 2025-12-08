import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { validate, schemas } from './validation';

// Helper to create mock request
const createMockRequest = (body: Record<string, unknown> = {}): Request =>
  ({
    body,
  } as Request);

// Helper to create mock response
const createMockResponse = (): Response => {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as Response;
};

describe('Validation Middleware', () => {
  describe('validate function', () => {
    const testSchema = Joi.object({
      name: Joi.string().required(),
      email: Joi.string().email().required(),
      age: Joi.number().min(0).optional(),
    });

    it('should call next() when validation passes', () => {
      const req = createMockRequest({
        name: 'Test User',
        email: 'test@example.com',
      });
      const res = createMockResponse();
      const next: NextFunction = jest.fn();

      const middleware = validate(testSchema);
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should strip unknown fields from body', () => {
      const req = createMockRequest({
        name: 'Test User',
        email: 'test@example.com',
        unknownField: 'should be removed',
      });
      const res = createMockResponse();
      const next: NextFunction = jest.fn();

      const middleware = validate(testSchema);
      middleware(req, res, next);

      expect(req.body).not.toHaveProperty('unknownField');
      expect(next).toHaveBeenCalled();
    });

    it('should return 400 when required field is missing', () => {
      const req = createMockRequest({
        name: 'Test User',
        // email is missing
      });
      const res = createMockResponse();
      const next: NextFunction = jest.fn();

      const middleware = validate(testSchema);
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Données invalides',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: 'email',
          }),
        ]),
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 400 when email format is invalid', () => {
      const req = createMockRequest({
        name: 'Test User',
        email: 'not-an-email',
      });
      const res = createMockResponse();
      const next: NextFunction = jest.fn();

      const middleware = validate(testSchema);
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Données invalides',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: 'email',
          }),
        ]),
      });
    });

    it('should return all validation errors at once', () => {
      const req = createMockRequest({
        // Both name and email missing
      });
      const res = createMockResponse();
      const next: NextFunction = jest.fn();

      const middleware = validate(testSchema);
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      const jsonCall = (res.json as jest.Mock).mock.calls[0][0];
      expect(jsonCall.details).toHaveLength(2);
    });

    it('should return 400 when number constraint is violated', () => {
      const req = createMockRequest({
        name: 'Test User',
        email: 'test@example.com',
        age: -5, // Invalid: must be >= 0
      });
      const res = createMockResponse();
      const next: NextFunction = jest.fn();

      const middleware = validate(testSchema);
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('schemas', () => {
    describe('login schema', () => {
      it('should validate correct login data', () => {
        const { error } = schemas.login.validate({
          email: 'user@example.com',
          password: 'password123',
        });
        expect(error).toBeUndefined();
      });

      it('should reject invalid email', () => {
        const { error } = schemas.login.validate({
          email: 'invalid-email',
          password: 'password123',
        });
        expect(error).toBeDefined();
      });

      it('should reject short password', () => {
        const { error } = schemas.login.validate({
          email: 'user@example.com',
          password: '12345', // Too short (min 6)
        });
        expect(error).toBeDefined();
      });
    });

    describe('createSite schema', () => {
      it('should validate correct site data', () => {
        const { error } = schemas.createSite.validate({
          site_name: 'Test Site',
          club_name: 'Test Club',
          location: {
            city: 'Paris',
            region: 'Ile-de-France',
          },
          sports: ['volleyball', 'basketball'],
        });
        expect(error).toBeUndefined();
      });

      it('should validate minimal site data', () => {
        const { error } = schemas.createSite.validate({
          site_name: 'Test Site',
          club_name: 'Test Club',
        });
        expect(error).toBeUndefined();
      });

      it('should reject missing site_name', () => {
        const { error } = schemas.createSite.validate({
          club_name: 'Test Club',
        });
        expect(error).toBeDefined();
      });

      it('should validate coordinates within range', () => {
        const { error } = schemas.createSite.validate({
          site_name: 'Test Site',
          club_name: 'Test Club',
          location: {
            coordinates: {
              lat: 48.8566,
              lng: 2.3522,
            },
          },
        });
        expect(error).toBeUndefined();
      });

      it('should reject invalid coordinates', () => {
        const { error } = schemas.createSite.validate({
          site_name: 'Test Site',
          club_name: 'Test Club',
          location: {
            coordinates: {
              lat: 100, // Invalid: must be -90 to 90
              lng: 2.3522,
            },
          },
        });
        expect(error).toBeDefined();
      });
    });

    describe('updateSite schema', () => {
      it('should allow partial updates', () => {
        const { error } = schemas.updateSite.validate({
          site_name: 'Updated Name',
        });
        expect(error).toBeUndefined();
      });

      it('should validate status values', () => {
        const { error } = schemas.updateSite.validate({
          status: 'maintenance',
        });
        expect(error).toBeUndefined();
      });

      it('should reject invalid status', () => {
        const { error } = schemas.updateSite.validate({
          status: 'invalid-status',
        });
        expect(error).toBeDefined();
      });
    });

    describe('createGroup schema', () => {
      it('should validate correct group data', () => {
        const { error } = schemas.createGroup.validate({
          name: 'Test Group',
          type: 'sport',
          description: 'A test group',
        });
        expect(error).toBeUndefined();
      });

      it('should reject invalid type', () => {
        const { error } = schemas.createGroup.validate({
          name: 'Test Group',
          type: 'invalid-type',
        });
        expect(error).toBeDefined();
      });

      it('should allow empty description', () => {
        const { error } = schemas.createGroup.validate({
          name: 'Test Group',
          type: 'custom',
          description: '',
        });
        expect(error).toBeUndefined();
      });
    });

    describe('addSitesToGroup schema', () => {
      it('should validate correct site_ids', () => {
        const { error } = schemas.addSitesToGroup.validate({
          site_ids: ['550e8400-e29b-41d4-a716-446655440000'],
        });
        expect(error).toBeUndefined();
      });

      it('should reject non-UUID site_ids', () => {
        const { error } = schemas.addSitesToGroup.validate({
          site_ids: ['not-a-uuid'],
        });
        expect(error).toBeDefined();
      });

      it('should reject empty site_ids array', () => {
        const { error } = schemas.addSitesToGroup.validate({
          site_ids: [],
        });
        expect(error).toBeDefined();
      });
    });

    describe('deployContent schema', () => {
      it('should validate correct deployment data', () => {
        const { error } = schemas.deployContent.validate({
          video_id: '550e8400-e29b-41d4-a716-446655440000',
          target_type: 'site',
          target_ids: ['550e8400-e29b-41d4-a716-446655440001'],
        });
        expect(error).toBeUndefined();
      });

      it('should reject invalid target_type', () => {
        const { error } = schemas.deployContent.validate({
          video_id: '550e8400-e29b-41d4-a716-446655440000',
          target_type: 'invalid',
          target_ids: ['550e8400-e29b-41d4-a716-446655440001'],
        });
        expect(error).toBeDefined();
      });
    });
  });
});
