import { Injectable, signal } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';

@Injectable({ providedIn: 'root' })
export class ErrorBoundaryService {
  private readonly _hasError = signal(false);
  readonly hasError = this._hasError.asReadonly();

  constructor(private router: Router) {
    this.router.events.subscribe(event => {
      if (event instanceof NavigationStart) {
        this._hasError.set(false);
      }
    });
  }

  triggerError(): void {
    this._hasError.set(true);
  }

  clear(): void {
    this._hasError.set(false);
  }
}
