import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams, HttpEventType, HttpEvent } from '@angular/common/http';
import { Observable, Subject, throwError, timer } from 'rxjs';
import { map, filter, retryWhen, delayWhen, scan, takeWhile } from 'rxjs/operators';
import { environment } from '@env/environment';

export interface UploadProgress {
  status: 'uploading' | 'processing' | 'complete' | 'error';
  progress: number; // 0-100
  loaded?: number;
  total?: number;
  response?: unknown;
  error?: string;
}

export interface UploadOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  onProgress?: (progress: UploadProgress) => void;
}

/**
 * Service API utilisant les cookies HttpOnly pour l'authentification.
 *
 * SECURITE: Le token JWT est stocke dans un cookie HttpOnly defini par le serveur.
 * - Le cookie est envoye automatiquement grace a withCredentials: true
 * - Le token n'est plus accessible via JavaScript (protection XSS)
 * - Le localStorage n'est plus utilise pour le token
 */
@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private readonly http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  private readonly defaultHeaders = new HttpHeaders({
    'Content-Type': 'application/json'
  });

  get<T>(endpoint: string, params?: Record<string, string | number | boolean>): Observable<T> {
    const httpParams = params ? new HttpParams({ fromObject: params }) : undefined;
    return this.http.get<T>(`${this.apiUrl}${endpoint}`, {
      headers: this.defaultHeaders,
      params: httpParams,
      withCredentials: true // Le cookie HttpOnly est envoye automatiquement
    });
  }

  post<T>(endpoint: string, body: unknown): Observable<T> {
    return this.http.post<T>(`${this.apiUrl}${endpoint}`, body, {
      headers: this.defaultHeaders,
      withCredentials: true
    });
  }

  put<T>(endpoint: string, body: unknown): Observable<T> {
    return this.http.put<T>(`${this.apiUrl}${endpoint}`, body, {
      headers: this.defaultHeaders,
      withCredentials: true
    });
  }

  patch<T>(endpoint: string, body: unknown): Observable<T> {
    return this.http.patch<T>(`${this.apiUrl}${endpoint}`, body, {
      headers: this.defaultHeaders,
      withCredentials: true
    });
  }

  delete<T>(endpoint: string): Observable<T> {
    return this.http.delete<T>(`${this.apiUrl}${endpoint}`, {
      headers: this.defaultHeaders,
      withCredentials: true
    });
  }

  upload<T>(endpoint: string, formData: FormData): Observable<T> {
    // Pas de Content-Type header pour les uploads multipart
    return this.http.post<T>(`${this.apiUrl}${endpoint}`, formData, {
      withCredentials: true
    });
  }

  /**
   * Upload avec suivi de progression et retry automatique.
   * Retourne un Observable qui émet des événements de progression.
   */
  uploadWithProgress<T>(
    endpoint: string,
    formData: FormData,
    options: UploadOptions = {}
  ): Observable<UploadProgress> {
    const { maxRetries = 3, retryDelayMs = 2000 } = options;
    const progress$ = new Subject<UploadProgress>();

    const doUpload = (attempt: number): void => {
      this.http.post<T>(`${this.apiUrl}${endpoint}`, formData, {
        withCredentials: true,
        reportProgress: true,
        observe: 'events'
      }).subscribe({
        next: (event: HttpEvent<T>) => {
          if (event.type === HttpEventType.UploadProgress) {
            const percentDone = event.total
              ? Math.round((100 * event.loaded) / event.total)
              : 0;
            progress$.next({
              status: 'uploading',
              progress: percentDone,
              loaded: event.loaded,
              total: event.total
            });
          } else if (event.type === HttpEventType.Response) {
            progress$.next({
              status: 'complete',
              progress: 100,
              response: event.body
            });
            progress$.complete();
          }
        },
        error: (error) => {
          const errorMessage = error.error?.error || error.message || 'Erreur réseau';

          // Retry si on n'a pas atteint le max et que c'est une erreur réseau (status 0)
          if (attempt < maxRetries && (error.status === 0 || error.status >= 500)) {
            const delay = retryDelayMs * Math.pow(2, attempt - 1); // Exponential backoff
            progress$.next({
              status: 'error',
              progress: 0,
              error: `Tentative ${attempt}/${maxRetries} échouée. Nouvelle tentative dans ${delay / 1000}s...`
            });
            setTimeout(() => doUpload(attempt + 1), delay);
          } else {
            progress$.next({
              status: 'error',
              progress: 0,
              error: errorMessage
            });
            progress$.error(error);
          }
        }
      });
    };

    doUpload(1);
    return progress$.asObservable();
  }
}
