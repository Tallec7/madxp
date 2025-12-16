import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { LoginComponent } from './login.component';
import { AuthService } from '../../core/services/auth.service';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let authService: jasmine.SpyObj<AuthService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    const authServiceSpy = jasmine.createSpyObj('AuthService', ['login']);
    const routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [LoginComponent, ReactiveFormsModule],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    authService = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;
    router = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Form Initialization', () => {
    it('should initialize with empty form fields', () => {
      expect(component.loginForm.get('email')?.value).toBe('');
      expect(component.loginForm.get('password')?.value).toBe('');
    });

    it('should have form invalid initially', () => {
      expect(component.loginForm.invalid).toBe(true);
    });

    it('should initialize with loading false', () => {
      expect(component.loading).toBe(false);
    });

    it('should initialize with empty error message', () => {
      expect(component.errorMessage).toBe('');
    });
  });

  describe('Form Validation', () => {
    it('should require email', () => {
      const emailControl = component.loginForm.get('email');
      emailControl?.setValue('');
      expect(emailControl?.hasError('required')).toBe(true);
    });

    it('should validate email format', () => {
      const emailControl = component.loginForm.get('email');
      emailControl?.setValue('invalid-email');
      expect(emailControl?.hasError('email')).toBe(true);
    });

    it('should accept valid email', () => {
      const emailControl = component.loginForm.get('email');
      emailControl?.setValue('test@example.com');
      expect(emailControl?.valid).toBe(true);
    });

    it('should require password', () => {
      const passwordControl = component.loginForm.get('password');
      passwordControl?.setValue('');
      expect(passwordControl?.hasError('required')).toBe(true);
    });

    it('should accept any non-empty password', () => {
      const passwordControl = component.loginForm.get('password');
      passwordControl?.setValue('password123');
      expect(passwordControl?.valid).toBe(true);
    });

    it('should be valid with correct email and password', () => {
      component.loginForm.setValue({
        email: 'test@example.com',
        password: 'password123',
      });
      expect(component.loginForm.valid).toBe(true);
    });
  });

  describe('onSubmit', () => {
    it('should not call authService if form is invalid', () => {
      component.loginForm.setValue({
        email: '',
        password: '',
      });

      component.onSubmit();

      expect(authService.login).not.toHaveBeenCalled();
    });

    it('should mark all fields as touched if form is invalid', () => {
      component.loginForm.setValue({
        email: '',
        password: '',
      });

      component.onSubmit();

      expect(component.loginForm.get('email')?.touched).toBe(true);
      expect(component.loginForm.get('password')?.touched).toBe(true);
    });

    it('should set loading to true when submitting', fakeAsync(() => {
      authService.login.and.returnValue(of({ token: 'test-token', user: {} as any }));

      component.loginForm.setValue({
        email: 'test@example.com',
        password: 'password123',
      });

      component.onSubmit();

      expect(component.loading).toBe(true);

      tick();
    }));

    it('should clear error message when submitting', fakeAsync(() => {
      authService.login.and.returnValue(of({ token: 'test-token', user: {} as any }));
      component.errorMessage = 'Previous error';

      component.loginForm.setValue({
        email: 'test@example.com',
        password: 'password123',
      });

      component.onSubmit();

      expect(component.errorMessage).toBe('');

      tick();
    }));

    it('should call authService.login with correct credentials', fakeAsync(() => {
      authService.login.and.returnValue(of({ token: 'test-token', user: {} as any }));

      component.loginForm.setValue({
        email: 'test@example.com',
        password: 'password123',
      });

      component.onSubmit();

      expect(authService.login).toHaveBeenCalledWith('test@example.com', 'password123');

      tick();
    }));

    it('should navigate to dashboard on successful login', fakeAsync(() => {
      authService.login.and.returnValue(of({ token: 'test-token', user: {} as any }));

      component.loginForm.setValue({
        email: 'test@example.com',
        password: 'password123',
      });

      component.onSubmit();
      tick();

      expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
    }));

    it('should set error message on login failure', fakeAsync(() => {
      const errorResponse = {
        error: { error: 'Invalid credentials' },
      };
      authService.login.and.returnValue(throwError(() => errorResponse));

      component.loginForm.setValue({
        email: 'test@example.com',
        password: 'wrongpassword',
      });

      component.onSubmit();
      tick();

      expect(component.errorMessage).toBe('Invalid credentials');
      expect(component.loading).toBe(false);
    }));

    it('should set default error message if none provided', fakeAsync(() => {
      authService.login.and.returnValue(throwError(() => ({})));

      component.loginForm.setValue({
        email: 'test@example.com',
        password: 'wrongpassword',
      });

      component.onSubmit();
      tick();

      expect(component.errorMessage).toBe('Erreur de connexion. Veuillez réessayer.');
    }));

    it('should set loading to false on error', fakeAsync(() => {
      authService.login.and.returnValue(throwError(() => new Error('Network error')));

      component.loginForm.setValue({
        email: 'test@example.com',
        password: 'password123',
      });

      component.onSubmit();
      tick();

      expect(component.loading).toBe(false);
    }));
  });

  describe('Template', () => {
    it('should display error message when set', () => {
      component.errorMessage = 'Test error message';
      fixture.detectChanges();

      const errorAlert = fixture.nativeElement.querySelector('.error-alert');
      expect(errorAlert?.textContent).toContain('Test error message');
    });

    it('should hide error message when empty', () => {
      component.errorMessage = '';
      fixture.detectChanges();

      const errorAlert = fixture.nativeElement.querySelector('.error-alert');
      expect(errorAlert).toBeNull();
    });

    it('should disable submit button when form is invalid', () => {
      component.loginForm.setValue({
        email: '',
        password: '',
      });
      fixture.detectChanges();

      const submitButton = fixture.nativeElement.querySelector('button[type="submit"]');
      expect(submitButton.disabled).toBe(true);
    });

    it('should disable submit button when loading', () => {
      component.loginForm.setValue({
        email: 'test@example.com',
        password: 'password123',
      });
      component.loading = true;
      fixture.detectChanges();

      const submitButton = fixture.nativeElement.querySelector('button[type="submit"]');
      expect(submitButton.disabled).toBe(true);
    });

    it('should show spinner when loading', () => {
      component.loading = true;
      fixture.detectChanges();

      const spinner = fixture.nativeElement.querySelector('.spinner-small');
      expect(spinner).toBeTruthy();
    });

    it('should show "Se connecter" text when not loading', () => {
      component.loading = false;
      fixture.detectChanges();

      const submitButton = fixture.nativeElement.querySelector('button[type="submit"]');
      expect(submitButton.textContent).toContain('Se connecter');
    });
  });
});
