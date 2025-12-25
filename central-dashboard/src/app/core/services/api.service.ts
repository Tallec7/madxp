import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';

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
}
