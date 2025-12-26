import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';

export type SupportedLanguage = 'fr' | 'en' | 'es';

export interface LanguageOption {
  code: SupportedLanguage;
  label: string;
  flag: string;
}

@Injectable({
  providedIn: 'root'
})
export class TranslationService {
  private readonly translate = inject(TranslateService);
  private readonly STORAGE_KEY = 'neopro_language';

  private currentLangSubject = new BehaviorSubject<SupportedLanguage>('fr');
  currentLang$ = this.currentLangSubject.asObservable();

  readonly supportedLanguages: LanguageOption[] = [
    { code: 'fr', label: 'Français', flag: '🇫🇷' },
    { code: 'en', label: 'English', flag: '🇬🇧' },
    { code: 'es', label: 'Español', flag: '🇪🇸' }
  ];

  constructor() {
    this.initializeLanguage();
  }

  private initializeLanguage(): void {
    // Set available languages
    this.translate.addLangs(['fr', 'en', 'es']);

    // Set default language
    this.translate.setDefaultLang('fr');

    // Get saved language or detect from browser
    const savedLang = this.getSavedLanguage();
    const browserLang = this.translate.getBrowserLang() as SupportedLanguage;

    // Priority: saved > browser > default (fr)
    let langToUse: SupportedLanguage = 'fr';

    if (savedLang && this.isValidLanguage(savedLang)) {
      langToUse = savedLang;
    } else if (browserLang && this.isValidLanguage(browserLang)) {
      langToUse = browserLang;
    }

    this.setLanguage(langToUse, false);
  }

  private isValidLanguage(lang: string): lang is SupportedLanguage {
    return ['fr', 'en', 'es'].includes(lang);
  }

  private getSavedLanguage(): string | null {
    try {
      return localStorage.getItem(this.STORAGE_KEY);
    } catch {
      return null;
    }
  }

  private saveLanguage(lang: SupportedLanguage): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, lang);
    } catch {
      // localStorage not available
    }
  }

  setLanguage(lang: SupportedLanguage, save = true): void {
    this.translate.use(lang);
    this.currentLangSubject.next(lang);

    if (save) {
      this.saveLanguage(lang);
    }

    // Update document lang attribute for accessibility
    document.documentElement.lang = lang;
  }

  getCurrentLanguage(): SupportedLanguage {
    return this.currentLangSubject.value;
  }

  getLanguageOption(code: SupportedLanguage): LanguageOption | undefined {
    return this.supportedLanguages.find(l => l.code === code);
  }

  instant(key: string, params?: object): string {
    return this.translate.instant(key, params);
  }
}
