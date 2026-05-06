import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { SocketService } from './services/socket.service';

describe('AppComponent', () => {
  beforeEach(async () => {
    const socketSpy = jasmine.createSpyObj('SocketService', ['initialize']);

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [{ provide: SocketService, useValue: socketSpy }],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Phase 6 — Fire Stick captive bootstrap router (CAPTIVE-02, CAPTIVE-04)
  // ---------------------------------------------------------------------------
  describe('Fire Stick captive bootstrap (Phase 6)', () => {
    let replaceSpy: jasmine.Spy;
    let fetchSpy: jasmine.Spy;

    beforeEach(() => {
      replaceSpy = spyOn(window.location, 'replace').and.callFake(() => {});
      fetchSpy = spyOn(window, 'fetch');
    });

    it('bypasses bootstrap when URL already has ?display=N', async () => {
      spyOnProperty(window.location, 'search', 'get').and.returnValue('?display=2');
      const fixture = TestBed.createComponent(AppComponent);
      await fixture.componentInstance.ngOnInit();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(replaceSpy).not.toHaveBeenCalled();
    });

    it('redirects to /?display=N when whoami returns assigned displayIndex (CAPTIVE-02)', async () => {
      spyOnProperty(window.location, 'search', 'get').and.returnValue('');
      fetchSpy.and.resolveTo({
        ok: true,
        json: () =>
          Promise.resolve({
            mac: '0c:43:f9:36:04:77',
            displayIndex: 1,
            displayName: 'Buvette',
          }),
      } as Response);
      const fixture = TestBed.createComponent(AppComponent);
      await fixture.componentInstance.ngOnInit();
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/captive/whoami',
        jasmine.objectContaining({ cache: 'no-store' }),
      );
      expect(replaceSpy).toHaveBeenCalledWith('/?display=1');
    });

    it('redirects to /captive/wait when whoami returns null displayIndex (CAPTIVE-04)', async () => {
      spyOnProperty(window.location, 'search', 'get').and.returnValue('');
      fetchSpy.and.resolveTo({
        ok: true,
        json: () =>
          Promise.resolve({
            mac: 'aa:bb:cc:dd:ee:ff',
            displayIndex: null,
            displayName: null,
          }),
      } as Response);
      const fixture = TestBed.createComponent(AppComponent);
      await fixture.componentInstance.ngOnInit();
      expect(replaceSpy).toHaveBeenCalledWith('/captive/wait?mac=aa%3Abb%3Acc%3Add%3Aee%3Aff');
    });

    it('boots normally when whoami fetch fails (resilience)', async () => {
      spyOnProperty(window.location, 'search', 'get').and.returnValue('');
      fetchSpy.and.rejectWith(new Error('network error'));
      const fixture = TestBed.createComponent(AppComponent);
      await fixture.componentInstance.ngOnInit();
      expect(replaceSpy).not.toHaveBeenCalled();
    });
  });
});
