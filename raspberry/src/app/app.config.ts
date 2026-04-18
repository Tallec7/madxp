import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { remotePinInterceptor } from './interceptors/remote-pin.interceptor';
import { provideTranslateService, TranslateLoader } from '@ngx-translate/core';
import { TranslateHttpLoader, provideTranslateHttpLoader } from '@ngx-translate/http-loader';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([remotePinInterceptor])),
    provideTranslateService({
      fallbackLang: 'fr',
      loader: {
        provide: TranslateLoader,
        useClass: TranslateHttpLoader
      }
    }),
    provideTranslateHttpLoader({
      prefix: './assets/i18n/',
      suffix: '.json'
    })
  ]
};
