import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { TranslationService, SupportedLanguage, LanguageOption } from '../../../core/services/translation.service';

@Component({
  selector: 'app-language-selector',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="language-selector" role="group" aria-label="{{ 'language.select' | translate }}">
      <button
        class="language-btn"
        (click)="toggleDropdown()"
        [attr.aria-expanded]="isOpen"
        aria-haspopup="listbox"
        [attr.aria-label]="'language.select' | translate"
      >
        <span class="current-lang">
          <span class="flag" aria-hidden="true">{{ currentLanguage?.flag }}</span>
          <span class="code">{{ currentLanguage?.code?.toUpperCase() }}</span>
        </span>
        <span class="chevron" aria-hidden="true" [class.open]="isOpen">&#9662;</span>
      </button>

      <ul
        *ngIf="isOpen"
        class="language-dropdown"
        role="listbox"
        [attr.aria-label]="'language.select' | translate"
      >
        <li
          *ngFor="let lang of languages"
          role="option"
          [attr.aria-selected]="lang.code === currentLanguage?.code"
          [class.selected]="lang.code === currentLanguage?.code"
        >
          <button
            class="language-option"
            (click)="selectLanguage(lang.code)"
            [attr.aria-label]="lang.label"
          >
            <span class="flag" aria-hidden="true">{{ lang.flag }}</span>
            <span class="label">{{ lang.label }}</span>
            <span class="check" *ngIf="lang.code === currentLanguage?.code" aria-hidden="true">&#10003;</span>
          </button>
        </li>
      </ul>
    </div>
  `,
  styles: [`
    .language-selector {
      position: relative;
    }

    .language-btn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 6px;
      color: white;
      cursor: pointer;
      transition: all 0.2s;
      font-size: 0.875rem;
    }

    .language-btn:hover {
      background: rgba(255, 255, 255, 0.15);
    }

    .language-btn:focus-visible {
      outline: 2px solid white;
      outline-offset: 2px;
    }

    .current-lang {
      display: flex;
      align-items: center;
      gap: 0.375rem;
    }

    .flag {
      font-size: 1rem;
    }

    .code {
      font-weight: 500;
    }

    .chevron {
      font-size: 0.75rem;
      transition: transform 0.2s;
    }

    .chevron.open {
      transform: rotate(180deg);
    }

    .language-dropdown {
      position: absolute;
      bottom: 100%;
      left: 0;
      margin-bottom: 0.5rem;
      background: #1e293b;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.3);
      list-style: none;
      padding: 0.5rem;
      margin: 0 0 0.5rem 0;
      min-width: 150px;
      z-index: 1000;
    }

    .language-option {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      width: 100%;
      padding: 0.625rem 0.75rem;
      background: none;
      border: none;
      border-radius: 4px;
      color: #e2e8f0;
      cursor: pointer;
      transition: all 0.15s;
      font-size: 0.875rem;
      text-align: left;
    }

    .language-option:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .language-option:focus-visible {
      outline: 2px solid var(--neo-hockey-dark, #2022E9);
      outline-offset: 1px;
    }

    li.selected .language-option {
      background: rgba(32, 34, 233, 0.2);
      color: white;
    }

    .label {
      flex: 1;
    }

    .check {
      color: var(--neo-hand-light, #51B28B);
      font-weight: bold;
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .chevron {
        transition: none;
      }
    }
  `]
})
export class LanguageSelectorComponent implements OnInit, OnDestroy {
  private readonly translationService = inject(TranslationService);
  private subscription?: Subscription;

  languages: LanguageOption[] = [];
  currentLanguage?: LanguageOption;
  isOpen = false;

  ngOnInit(): void {
    this.languages = this.translationService.supportedLanguages;

    this.subscription = this.translationService.currentLang$.subscribe(lang => {
      this.currentLanguage = this.translationService.getLanguageOption(lang);
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', this.onDocumentClick.bind(this));
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    document.removeEventListener('click', this.onDocumentClick.bind(this));
  }

  private onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.language-selector')) {
      this.isOpen = false;
    }
  }

  toggleDropdown(): void {
    this.isOpen = !this.isOpen;
  }

  selectLanguage(code: SupportedLanguage): void {
    this.translationService.setLanguage(code);
    this.isOpen = false;
  }
}
