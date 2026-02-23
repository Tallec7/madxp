import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { DebugSummaryBarComponent } from './debug-summary-bar.component';

describe('DebugSummaryBarComponent', () => {
  let component: DebugSummaryBarComponent;
  let fixture: ComponentFixture<DebugSummaryBarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DebugSummaryBarComponent, TranslateModule.forRoot()],
    }).compileComponents();

    fixture = TestBed.createComponent(DebugSummaryBarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('isConnectionHealthy', () => {
    it('should return isConnected when no connectionHealth', () => {
      component.isConnected = true;
      component.connectionHealth = null;
      expect(component.isConnectionHealthy()).toBe(true);

      component.isConnected = false;
      expect(component.isConnectionHealthy()).toBe(false);
    });

    it('should return health status from connectionHealth', () => {
      component.isConnected = true;
      component.connectionHealth = { isHealthy: true, lastPongAgeMs: 1000, socketInMap: true, reason: 'healthy' };
      expect(component.isConnectionHealthy()).toBe(true);

      component.connectionHealth = { isHealthy: false, lastPongAgeMs: 60000, socketInMap: true, reason: 'pong_stale' };
      expect(component.isConnectionHealthy()).toBe(false);
    });
  });

  describe('getConnectionLabel', () => {
    it('should return disconnected when offline', () => {
      component.isConnected = false;
      expect(component.getConnectionLabel()).toContain('Déconnecté');
    });

    it('should return unstable when unhealthy', () => {
      component.isConnected = true;
      component.connectionHealth = { isHealthy: false, lastPongAgeMs: 60000, socketInMap: true, reason: 'pong_stale' };
      expect(component.getConnectionLabel()).toContain('Instable');
    });

    it('should return connected when healthy', () => {
      component.isConnected = true;
      component.connectionHealth = null;
      expect(component.getConnectionLabel()).toContain('Connecté');
    });
  });

  describe('rendering', () => {
    it('should show health pill when healthStatus provided', () => {
      component.healthStatus = { healthScore: 85, healthStatus: 'healthy' };
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).toContain('85%');
    });

    it('should show files count', () => {
      component.filesCount = 12;
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).toContain('12');
    });

    it('should show hotspot info when provided', () => {
      component.hotspotInfo = { isActive: true, clients: 3 };
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).toContain('3');
    });
  });
});
