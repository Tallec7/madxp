import { Injectable } from '@angular/core';
import { Observable, of, shareReplay } from 'rxjs';
import { tap } from 'rxjs/operators';

interface CacheEntry<T> {
  data: Observable<T>;
  timestamp: number;
}

/**
 * Service de cache avec TTL pour optimiser les appels API
 * Évite les requêtes redondantes en mettant en cache les réponses
 */
@Injectable({
  providedIn: 'root',
})
export class CacheService {
  private cache = new Map<string, CacheEntry<any>>();
  private defaultTTL = 5000; // 5 secondes par défaut

  /**
   * Récupère une valeur du cache ou exécute la fonction si absente/expirée
   * @param key Clé du cache
   * @param fetcher Fonction qui retourne un Observable avec les données
   * @param ttl Durée de vie en millisecondes (optionnel)
   */
  get<T>(key: string, fetcher: () => Observable<T>, ttl?: number): Observable<T> {
    const now = Date.now();
    const cached = this.cache.get(key);
    const cacheTTL = ttl ?? this.defaultTTL;

    // Vérifier si le cache est valide
    if (cached && now - cached.timestamp < cacheTTL) {
      return cached.data;
    }

    // Fetch et mettre en cache
    const data$ = fetcher().pipe(
      shareReplay(1) // Partager le résultat entre tous les abonnés
    );

    this.cache.set(key, {
      data: data$,
      timestamp: now,
    });

    return data$;
  }

  /**
   * Invalide une entrée du cache
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Invalide toutes les entrées qui correspondent au pattern
   */
  invalidatePattern(pattern: RegExp): void {
    const keysToDelete: string[] = [];

    this.cache.forEach((_, key) => {
      if (pattern.test(key)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach((key) => {
      this.cache.delete(key);
    });
  }

  /**
   * Vide complètement le cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Obtient les statistiques du cache
   */
  getStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}
