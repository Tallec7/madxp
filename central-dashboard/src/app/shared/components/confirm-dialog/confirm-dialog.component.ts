import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import {
  ConfirmDialogService,
  ConfirmDialogRequest,
} from '../../../core/services/confirm-dialog.service';

/**
 * ConfirmDialogComponent
 *
 * Global confirm dialog rendered in the layout.
 * Subscribes to ConfirmDialogService and shows a modal overlay.
 * Replaces native window.confirm() across the dashboard.
 */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="confirm-overlay"
      *ngIf="visible"
      (click)="cancel()"
      (keydown.escape)="cancel()"
      role="dialog"
      aria-modal="true"
      [attr.aria-label]="request?.options?.title"
    >
      <div class="confirm-box" (click)="$event.stopPropagation()">
        <h3 class="confirm-title">{{ request?.options?.title }}</h3>
        <p class="confirm-message">{{ request?.message }}</p>
        <div class="confirm-actions">
          <button
            class="btn btn-secondary"
            (click)="cancel()"
            type="button"
          >
            {{ request?.options?.cancelLabel }}
          </button>
          <button
            class="btn"
            [ngClass]="request?.options?.confirmStyle === 'primary' ? 'btn-primary' : 'btn-danger'"
            (click)="accept()"
            type="button"
            #confirmBtn
          >
            {{ request?.options?.confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .confirm-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      animation: fadeIn 0.15s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .confirm-box {
      background: white;
      border-radius: 12px;
      padding: 1.75rem;
      max-width: 440px;
      width: 90vw;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
      animation: scaleIn 0.15s ease-out;
    }

    @keyframes scaleIn {
      from { transform: scale(0.95); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }

    .confirm-title {
      margin: 0 0 0.75rem;
      font-size: 1.1rem;
      font-weight: 600;
      color: #0f172a;
    }

    .confirm-message {
      margin: 0 0 1.5rem;
      font-size: 0.9rem;
      color: #475569;
      line-height: 1.5;
      white-space: pre-line;
    }

    .confirm-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
    }

    .btn {
      padding: 0.5rem 1.15rem;
      border-radius: 8px;
      border: 1px solid transparent;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }
    .btn:focus-visible {
      outline: 2px solid #3b82f6;
      outline-offset: 2px;
    }
    .btn-secondary {
      background: #f1f5f9;
      color: #475569;
      border-color: #d1d5db;
    }
    .btn-secondary:hover { background: #e2e8f0; }
    .btn-danger {
      background: #ef4444;
      color: white;
    }
    .btn-danger:hover { background: #dc2626; }
    .btn-primary {
      background: #3b82f6;
      color: white;
    }
    .btn-primary:hover { background: #2563eb; }
  `],
})
export class ConfirmDialogComponent implements OnInit, OnDestroy {
  visible = false;
  request: ConfirmDialogRequest | null = null;

  private subscription!: Subscription;

  constructor(private confirmDialogService: ConfirmDialogService) {}

  ngOnInit(): void {
    this.subscription = this.confirmDialogService.dialog$.subscribe(
      (request) => {
        this.request = request;
        this.visible = true;
      }
    );
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  accept(): void {
    this.visible = false;
    this.request?.resolve(true);
    this.request = null;
  }

  cancel(): void {
    this.visible = false;
    this.request?.resolve(false);
    this.request = null;
  }
}
