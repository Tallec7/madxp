import { ApplicationConfig, APP_INITIALIZER, ErrorHandler, inject } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors, withFetch } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { GlobalErrorHandler } from './core/handlers/global-error.handler';
import { TranslationService } from './core/services/translation.service';

function initializeApp(): () => void {
  const translationService = inject(TranslationService);
  return () => {
    translationService.initializeLanguage();
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    // withFetch() améliore la compatibilité Safari pour les cookies cross-origin
    // errorInterceptor AFTER authInterceptor to ensure auth headers are set before error handling
    provideHttpClient(withFetch(), withInterceptors([authInterceptor, errorInterceptor])),
    provideAnimations(),
    provideRouter(routes),
    provideTranslateService(),
    provideTranslateHttpLoader({
      prefix: '/assets/i18n/',
      suffix: '.json'
    }),
    {
      provide: APP_INITIALIZER,
      useFactory: initializeApp,
      multi: true
    },
    // Global error handler for unhandled errors (component errors, async errors)
    {
      provide: ErrorHandler,
      useClass: GlobalErrorHandler
    }
  ]
};
