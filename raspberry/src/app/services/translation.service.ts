import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, firstValueFrom } from 'rxjs';

export type SupportedLanguage = 'fr' | 'en' | 'es';

export interface LanguageOption {
  code: SupportedLanguage;
  label: string;
  flag: string;
}

interface SettingsResponse {
  settings: {
    language: SupportedLanguage;
    timezone: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class TranslationService {
  private readonly translate = inject(TranslateService);
  private readonly http = inject(HttpClient);
  private readonly STORAGE_KEY = 'neopro_language';
  private readonly CONFIG_API_URL = 'http://localhost:8080/api/configuration/settings';

  private currentLangSubject = new BehaviorSubject<SupportedLanguage>('fr');
  currentLang$ = this.currentLangSubject.asObservable();

  private configLanguage: SupportedLanguage = 'fr';

  readonly supportedLanguages: LanguageOption[] = [
    { code: 'fr', label: 'Français', flag: '🇫🇷' },
    { code: 'en', label: 'English', flag: '🇬🇧' },
    { code: 'es', label: 'Español', flag: '🇪🇸' }
  ];

  constructor() {
    this.initializeLanguage();
  }

  private async initializeLanguage(): Promise<void> {
    this.translate.addLangs(['fr', 'en', 'es']);
    this.translate.setDefaultLang('fr');

    // Priority: localStorage > config file > browser > default
    let langToUse: SupportedLanguage = 'fr';

    // 1. Try localStorage first (user preference)
    const savedLang = this.getSavedLanguage();
    if (savedLang && this.isValidLanguage(savedLang)) {
      langToUse = savedLang;
    } else {
      // 2. Try to load from config file
      const configLang = await this.loadLanguageFromConfig();
      if (configLang && this.isValidLanguage(configLang)) {
        langToUse = configLang;
        this.configLanguage = configLang;
      } else {
        // 3. Try browser language
        const browserLang = this.translate.getBrowserLang() as SupportedLanguage;
        if (browserLang && this.isValidLanguage(browserLang)) {
          langToUse = browserLang;
        }
      }
    }

    this.setLanguage(langToUse, false);
  }

  private async loadLanguageFromConfig(): Promise<SupportedLanguage | null> {
    try {
      const response = await firstValueFrom(
        this.http.get<SettingsResponse>(this.CONFIG_API_URL, { withCredentials: true })
      );
      return response?.settings?.language || null;
    } catch {
      // Config not available (e.g., admin server not running)
      console.log('[i18n] Could not load language from config, using default');
      return null;
    }
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

  /**
   * Set the language for the UI
   * @param lang The language code
   * @param save Whether to save to localStorage (user preference override)
   */
  setLanguage(lang: SupportedLanguage, save = true): void {
    this.translate.use(lang);
    this.currentLangSubject.next(lang);

    if (save) {
      this.saveLanguage(lang);
    }

    document.documentElement.lang = lang;
  }

  /**
   * Reset to config language (remove user override)
   */
  resetToConfigLanguage(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch {
      // Ignore
    }
    this.setLanguage(this.configLanguage, false);
  }

  /**
   * Get the language defined in the config file
   */
  getConfigLanguage(): SupportedLanguage {
    return this.configLanguage;
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
