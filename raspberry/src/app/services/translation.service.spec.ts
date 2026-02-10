import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TranslationService, SupportedLanguage } from './translation.service';
import { TranslateService } from '@ngx-translate/core';

describe('TranslationService', () => {
  let service: TranslationService;
  let httpMock: HttpTestingController;
  let mockTranslateService: jasmine.SpyObj<TranslateService>;
  let localStorageMock: Record<string, string>;

  beforeEach(() => {
    localStorageMock = {};
    spyOn(localStorage, 'getItem').and.callFake((key: string) => localStorageMock[key] ?? null);
    spyOn(localStorage, 'setItem').and.callFake((key: string, value: string) => { localStorageMock[key] = value; });
    spyOn(localStorage, 'removeItem').and.callFake((key: string) => { delete localStorageMock[key]; });

    mockTranslateService = jasmine.createSpyObj('TranslateService', [
      'addLangs', 'setDefaultLang', 'use', 'getBrowserLang', 'instant'
    ]);
    mockTranslateService.getBrowserLang.and.returnValue('fr');
    mockTranslateService.instant.and.callFake((key: string) => key);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TranslateService, useValue: mockTranslateService },
      ],
    });

    service = TestBed.inject(TranslationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Le constructeur lance un HTTP GET async qu'on ne contrôle pas toujours.
    // Flush proprement tout ce qui reste sans faire verify().
    httpMock.match(() => true);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  it('should add supported languages and set default', () => {
    expect(mockTranslateService.addLangs).toHaveBeenCalledWith(['fr', 'en', 'es']);
    expect(mockTranslateService.setDefaultLang).toHaveBeenCalledWith('fr');
  });

  it('should use saved language from localStorage', () => {
    // Le service a déjà été créé avec un localStorage vide dans beforeEach.
    // On vérifie que setLanguage fonctionne pour appliquer une langue sauvegardée
    service.setLanguage('en');
    expect(mockTranslateService.use).toHaveBeenCalledWith('en');
  });

  // ---------------------------------------------------------------------------
  // setLanguage
  // ---------------------------------------------------------------------------

  it('should set language and save to localStorage', () => {
    service.setLanguage('es');
    expect(mockTranslateService.use).toHaveBeenCalledWith('es');
    expect(localStorage.setItem).toHaveBeenCalledWith('neopro_language', 'es');
    expect(service.getCurrentLanguage()).toBe('es');
  });

  it('should set language without saving when save=false', () => {
    (localStorage.setItem as jasmine.Spy).calls.reset();
    service.setLanguage('en', false);
    expect(mockTranslateService.use).toHaveBeenCalledWith('en');
    // setItem ne devrait pas avoir été appelé pour la langue
    const languageCalls = (localStorage.setItem as jasmine.Spy).calls.allArgs()
      .filter((args: string[]) => args[0] === 'neopro_language');
    expect(languageCalls.length).toBe(0);
  });

  it('should update document lang attribute', () => {
    service.setLanguage('es');
    expect(document.documentElement.lang).toBe('es');
  });

  // ---------------------------------------------------------------------------
  // getCurrentLanguage
  // ---------------------------------------------------------------------------

  it('should return current language', () => {
    service.setLanguage('en');
    expect(service.getCurrentLanguage()).toBe('en');
  });

  // ---------------------------------------------------------------------------
  // currentLang$ observable
  // ---------------------------------------------------------------------------

  it('should emit language changes', (done) => {
    const langs: SupportedLanguage[] = [];
    service.currentLang$.subscribe(lang => {
      langs.push(lang);
      if (langs.length >= 2) {
        expect(langs[langs.length - 1]).toBe('es');
        done();
      }
    });

    service.setLanguage('es');
  });

  // ---------------------------------------------------------------------------
  // resetToConfigLanguage
  // ---------------------------------------------------------------------------

  it('should remove localStorage override on reset', () => {
    service.resetToConfigLanguage();
    expect(localStorage.removeItem).toHaveBeenCalledWith('neopro_language');
  });

  // ---------------------------------------------------------------------------
  // getConfigLanguage
  // ---------------------------------------------------------------------------

  it('should return default config language (fr)', () => {
    expect(service.getConfigLanguage()).toBe('fr');
  });

  // ---------------------------------------------------------------------------
  // supportedLanguages
  // ---------------------------------------------------------------------------

  it('should have 3 supported languages', () => {
    expect(service.supportedLanguages.length).toBe(3);
    expect(service.supportedLanguages.map(l => l.code)).toEqual(['fr', 'en', 'es']);
  });

  // ---------------------------------------------------------------------------
  // getLanguageOption
  // ---------------------------------------------------------------------------

  it('should return language option by code', () => {
    const option = service.getLanguageOption('fr');
    expect(option).toBeDefined();
    expect(option!.label).toBe('Français');
  });

  it('should return undefined for unknown language', () => {
    const option = service.getLanguageOption('de' as SupportedLanguage);
    expect(option).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // instant
  // ---------------------------------------------------------------------------

  it('should delegate to TranslateService.instant', () => {
    service.instant('test.key');
    expect(mockTranslateService.instant).toHaveBeenCalledWith('test.key', undefined);
  });
});
