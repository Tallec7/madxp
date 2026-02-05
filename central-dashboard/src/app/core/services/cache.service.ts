import { Injectable } from '@angular/core';
import { Observable, of, shareReplay, Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';

interface CacheEntry<T> {
  data: Observable<T>;
  timestamp: number;
}

/**
 * Service de cache avec TTL pour optimiser les appels API
 * Évite les requêtes redondantes en mettant en cache les réponses
 *
 * Features:
 * - TTL configurable par requête
 * - Déduplication: si une requête est en cours, retourne le même Observable
 * - shareReplay pour partager le résultat entre abonnés
 */
@Injectable({
  providedIn: 'root',
})
export class CacheService {
  private cache = new Map<string, CacheEntry<any>>();
  private pendingRequests = new Map<string, Observable<any>>();
  private defaultTTL = 30000; // 30 secondes par défaut (augmenté de 5s)

  /**
   * Récupère une valeur du cache ou exécute la fonction si absente/expirée
   * Si une requête identique est déjà en cours, retourne le même Observable (déduplication)
   *
   * @param key Clé du cache
   * @param fetcher Fonction qui retourne un Observable avec les données
   * @param ttl Durée de vie en millisecondes (optionnel, défaut 30s)
   */
  get<T>(key: string, fetcher: () => Observable<T>, ttl?: number): Observable<T> {
    const now = Date.now();
    const cached = this.cache.get(key);
    const cacheTTL = ttl ?? this.defaultTTL;

    // Vérifier si le cache est valide
    if (cached && now - cached.timestamp < cacheTTL) {
      return cached.data;
    }

    // Si une requête est déjà en cours pour cette clé, la retourner (déduplication)
    const pending = this.pendingRequests.get(key);
    if (pending) {
      return pending;
    }

    // Fetch et mettre en cache
    const data$ = fetcher().pipe(
      shareReplay(1), // Partager le résultat entre tous les abonnés
      finalize(() => {
        // Nettoyer la requête pending une fois terminée
        this.pendingRequests.delete(key);
      })
    );

    // Marquer la requête comme en cours
    this.pendingRequests.set(key, data$);

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
