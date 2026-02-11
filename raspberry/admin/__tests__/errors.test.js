/**
 * Tests for services/errors.js - typed error classes
 */

const {
  ServiceError,
  NotFoundError,
  LockedError,
  ValidationError,
  DuplicateError,
  CommandError,
} = require('../services/errors');

describe('Error classes', () => {
  it('ServiceError should have name and code', () => {
    const err = new ServiceError('test message', 'TEST_CODE');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ServiceError');
    expect(err.message).toBe('test message');
    expect(err.code).toBe('TEST_CODE');
  });

  it('NotFoundError should have default message and code', () => {
    const err = new NotFoundError();
    expect(err).toBeInstanceOf(ServiceError);
    expect(err.name).toBe('NotFoundError');
    expect(err.message).toBe('Ressource introuvable');
    expect(err.code).toBe('NOT_FOUND');
  });

  it('NotFoundError should accept custom message', () => {
    const err = new NotFoundError('Video not found');
    expect(err.message).toBe('Video not found');
    expect(err.code).toBe('NOT_FOUND');
  });

  it('LockedError should have correct code', () => {
    const err = new LockedError();
    expect(err).toBeInstanceOf(ServiceError);
    expect(err.code).toBe('LOCKED');
  });

  it('ValidationError should have correct code', () => {
    const err = new ValidationError('bad input');
    expect(err).toBeInstanceOf(ServiceError);
    expect(err.code).toBe('VALIDATION');
    expect(err.message).toBe('bad input');
  });

  it('DuplicateError should have correct code', () => {
    const err = new DuplicateError();
    expect(err).toBeInstanceOf(ServiceError);
    expect(err.code).toBe('DUPLICATE');
  });

  it('CommandError should have correct code', () => {
    const err = new CommandError('command failed');
    expect(err).toBeInstanceOf(ServiceError);
    expect(err.code).toBe('COMMAND_FAILED');
    expect(err.message).toBe('command failed');
  });

  it('all errors should be catchable as Error', () => {
    const errors = [
      new NotFoundError(),
      new LockedError(),
      new ValidationError(),
      new DuplicateError(),
      new CommandError(),
    ];

    for (const err of errors) {
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(ServiceError);
    }
  });
});
