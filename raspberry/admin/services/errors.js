/**
 * Typed error classes for admin services
 *
 * Each error carries a `code` string used by route handlers to determine
 * the appropriate HTTP status code.
 */

class ServiceError extends Error {
  constructor(message, code) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

class NotFoundError extends ServiceError {
  constructor(message = 'Ressource introuvable') {
    super(message, 'NOT_FOUND');
  }
}

class LockedError extends ServiceError {
  constructor(message = 'Cette ressource est verrouillée par NEOPRO') {
    super(message, 'LOCKED');
  }
}

class ValidationError extends ServiceError {
  constructor(message = 'Données invalides') {
    super(message, 'VALIDATION');
  }
}

class DuplicateError extends ServiceError {
  constructor(message = 'Cet élément existe déjà') {
    super(message, 'DUPLICATE');
  }
}

class CommandError extends ServiceError {
  constructor(message = 'Échec de la commande système') {
    super(message, 'COMMAND_FAILED');
  }
}

module.exports = {
  ServiceError,
  NotFoundError,
  LockedError,
  ValidationError,
  DuplicateError,
  CommandError,
};
