import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * Options for the confirm dialog
 */
export interface ConfirmDialogOptions {
  /** Dialog title (default: 'Confirmation') */
  title?: string;
  /** Confirm button label (default: 'Confirmer') */
  confirmLabel?: string;
  /** Cancel button label (default: 'Annuler') */
  cancelLabel?: string;
  /** Confirm button style: 'danger' | 'primary' (default: 'danger') */
  confirmStyle?: 'danger' | 'primary';
}

/**
 * Internal dialog request structure
 */
export interface ConfirmDialogRequest {
  message: string;
  options: Required<ConfirmDialogOptions>;
  resolve: (result: boolean) => void;
}

/**
 * ConfirmDialogService
 *
 * Replaces native window.confirm() with a styled Angular modal.
 * Returns a Promise<boolean> — resolves true on confirm, false on cancel.
 *
 * @example
 * // Simple usage
 * const ok = await this.confirmDialog.confirm('Supprimer cet élément ?');
 * if (!ok) return;
 *
 * // With options
 * const ok = await this.confirmDialog.confirm('Supprimer le sponsor ?', {
 *   title: 'Suppression',
 *   confirmLabel: 'Supprimer',
 *   confirmStyle: 'danger',
 * });
 */
@Injectable({
  providedIn: 'root',
})
export class ConfirmDialogService {
  private dialogSubject = new Subject<ConfirmDialogRequest>();

  /** Observable consumed by ConfirmDialogComponent */
  dialog$ = this.dialogSubject.asObservable();

  /**
   * Show a confirm dialog and return user choice.
   * @param message The message to display
   * @param options Optional customization
   * @returns Promise that resolves to true (confirm) or false (cancel)
   */
  confirm(message: string, options?: ConfirmDialogOptions): Promise<boolean> {
    const resolved: Required<ConfirmDialogOptions> = {
      title: options?.title ?? 'Confirmation',
      confirmLabel: options?.confirmLabel ?? 'Confirmer',
      cancelLabel: options?.cancelLabel ?? 'Annuler',
      confirmStyle: options?.confirmStyle ?? 'danger',
    };

    return new Promise<boolean>((resolve) => {
      this.dialogSubject.next({ message, options: resolved, resolve });
    });
  }
}
