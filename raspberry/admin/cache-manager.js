/**
 * Gestionnaire de cache in-memory pour Neopro
 *
 * Implémente un cache LRU (Least Recently Used) avec expiration automatique
 * pour réduire les lectures disque et améliorer les performances.
 *
 * Fonctionnalités :
 * - Cache LRU avec taille maximale configurable
 * - TTL (Time To Live) par entrée
 * - Invalidation manuelle et automatique
 * - Statistiques de cache hit/miss
 * - Support de namespaces pour différents types de données
 */

class CacheManager {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 100;
    this.defaultTTL = options.defaultTTL || 60000; // 60 secondes par défaut
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0
    };

    // Nettoyage automatique des entrées expirées toutes les 30 secondes
    this.cleanupInterval = setInterval(() => this.cleanup(), 30000);
  }

  /**
   * Générer une clé de cache
   */
  _key(namespace, key) {
    return `${namespace}:${key}`;
  }

  /**
   * Obtenir une valeur du cache
   */
  get(namespace, key) {
    const cacheKey = this._key(namespace, key);
    const entry = this.cache.get(cacheKey);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Vérifier si l'entrée a expiré
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(cacheKey);
      this.stats.misses++;
      this.stats.evictions++;
      return null;
    }

    // Mettre à jour lastAccessed pour LRU
    entry.lastAccessed = Date.now();
    this.stats.hits++;
    return entry.value;
  }

  /**
   * Stocker une valeur dans le cache
   */
  set(namespace, key, value, ttl = null) {
    const cacheKey = this._key(namespace, key);
    const effectiveTTL = ttl !== null ? ttl : this.defaultTTL;
    const now = Date.now();

    const entry = {
      value,
      createdAt: now,
      lastAccessed: now,
      expiresAt: now + effectiveTTL,
      namespace,
      key
    };

    // Si le cache est plein, supprimer l'entrée la moins récemment utilisée
    if (this.cache.size >= this.maxSize && !this.cache.has(cacheKey)) {
      this._evictLRU();
    }

    this.cache.set(cacheKey, entry);
    this.stats.sets++;
    return true;
  }

  /**
   * Supprimer une entrée du cache
   */
  delete(namespace, key) {
    const cacheKey = this._key(namespace, key);
    const deleted = this.cache.delete(cacheKey);
    if (deleted) {
      this.stats.deletes++;
    }
    return deleted;
  }

  /**
   * Invalider toutes les entrées d'un namespace
   */
  invalidateNamespace(namespace) {
    let count = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (entry.namespace === namespace) {
        this.cache.delete(key);
        count++;
      }
    }
    this.stats.deletes += count;
    return count;
  }

  /**
   * Vider tout le cache
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.stats.deletes += size;
    return size;
  }

  /**
   * Évincer l'entrée la moins récemment utilisée
   */
  _evictLRU() {
    let oldestKey = null;
    let oldestAccess = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestAccess) {
        oldestAccess = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  /**
   * Nettoyer les entrées expirées
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.stats.evictions += cleaned;
    }

    return cleaned;
  }

  /**
   * Obtenir les statistiques du cache
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
      : 0;

    return {
      ...this.stats,
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: hitRate + '%',
      memory: this._estimateMemoryUsage()
    };
  }

  /**
   * Estimer l'utilisation mémoire
   */
  _estimateMemoryUsage() {
    let bytes = 0;
    for (const [key, entry] of this.cache.entries()) {
      bytes += key.length * 2; // Approximation pour les strings (UTF-16)
      bytes += JSON.stringify(entry.value).length * 2;
      bytes += 100; // Overhead pour les métadonnées
    }

    if (bytes < 1024) {
      return bytes + ' B';
    } else if (bytes < 1024 * 1024) {
      return (bytes / 1024).toFixed(2) + ' KB';
    } else {
      return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    }
  }

  /**
   * Obtenir toutes les clés d'un namespace
   */
  keys(namespace) {
    const keys = [];
    for (const entry of this.cache.values()) {
      if (entry.namespace === namespace) {
        keys.push(entry.key);
      }
    }
    return keys;
  }

  /**
   * Vérifier si une clé existe dans le cache
   */
  has(namespace, key) {
    const cacheKey = this._key(namespace, key);
    const entry = this.cache.get(cacheKey);

    if (!entry) {
      return false;
    }

    // Vérifier l'expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(cacheKey);
      return false;
    }

    return true;
  }

  /**
   * Obtenir ou définir (get-or-set pattern)
   */
  async getOrSet(namespace, key, factory, ttl = null) {
    // Essayer de récupérer depuis le cache
    const cached = this.get(namespace, key);
    if (cached !== null) {
      return cached;
    }

    // Sinon, utiliser la factory function
    const value = await factory();
    this.set(namespace, key, value, ttl);
    return value;
  }

  /**
   * Arrêter le gestionnaire de cache
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }

  /**
   * Réinitialiser les statistiques
   */
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0
    };
  }
}

// Namespaces prédéfinis
const NAMESPACES = {
  CONFIG: 'config',
  VIDEOS: 'videos',
  SYSTEM: 'system',
  BACKUPS: 'backups',
  PROCESSING: 'processing'
};

// Instance singleton
let instance = null;

/**
 * Obtenir l'instance du cache manager
 */
function getInstance(options = {}) {
  if (!instance) {
    instance = new CacheManager(options);
  }
  return instance;
}

/**
 * Détruire l'instance actuelle
 */
function destroyInstance() {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}

// Export
module.exports = {
  CacheManager,
  getInstance,
  destroyInstance,
  NAMESPACES
};
