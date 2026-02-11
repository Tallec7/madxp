const { ServiceError, ValidationError, CacheError } = require('../services/errors');

describe('ServiceError', () => {
  it('should set message and code', () => {
    const err = new ServiceError('test error', 'TEST_CODE');
    expect(err.message).toBe('test error');
    expect(err.code).toBe('TEST_CODE');
    expect(err.name).toBe('ServiceError');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('ValidationError', () => {
  it('should default to VALIDATION code', () => {
    const err = new ValidationError();
    expect(err.code).toBe('VALIDATION');
    expect(err.name).toBe('ValidationError');
    expect(err.message).toBe('Données invalides');
  });

  it('should accept custom message', () => {
    const err = new ValidationError('custom message');
    expect(err.message).toBe('custom message');
    expect(err.code).toBe('VALIDATION');
  });

  it('should be instance of ServiceError and Error', () => {
    const err = new ValidationError();
    expect(err).toBeInstanceOf(ServiceError);
    expect(err).toBeInstanceOf(Error);
  });
});

describe('CacheError', () => {
  it('should default to CACHE_ERROR code', () => {
    const err = new CacheError();
    expect(err.code).toBe('CACHE_ERROR');
    expect(err.name).toBe('CacheError');
    expect(err.message).toBe('Erreur de cache');
  });

  it('should accept custom message', () => {
    const err = new CacheError('read failed');
    expect(err.message).toBe('read failed');
    expect(err.code).toBe('CACHE_ERROR');
  });

  it('should be instance of ServiceError and Error', () => {
    const err = new CacheError();
    expect(err).toBeInstanceOf(ServiceError);
    expect(err).toBeInstanceOf(Error);
  });
});
