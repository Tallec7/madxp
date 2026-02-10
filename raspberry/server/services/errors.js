class ServiceError extends Error {
  constructor(message, code) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

class ValidationError extends ServiceError {
  constructor(message = 'Données invalides') {
    super(message, 'VALIDATION');
  }
}

class CacheError extends ServiceError {
  constructor(message = 'Erreur de cache') {
    super(message, 'CACHE_ERROR');
  }
}

module.exports = { ServiceError, ValidationError, CacheError };
