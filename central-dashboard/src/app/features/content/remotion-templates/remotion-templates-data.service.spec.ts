import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { RemotionTemplatesDataService } from './remotion-templates-data.service';
import { ApiService } from '../../../core/services/api.service';

/**
 * Quick task 260507-gxd — spec for deleteTemplate.
 * Verifies the URL formatting (with/without ?force=true) and that the
 * underlying api.delete is invoked with the expected path.
 */
describe('RemotionTemplatesDataService.deleteTemplate', () => {
  let service: RemotionTemplatesDataService;
  let apiSpy: jasmine.SpyObj<ApiService>;

  beforeEach(() => {
    apiSpy = jasmine.createSpyObj('ApiService', [
      'get', 'post', 'patch', 'delete', 'upload',
    ]);
    TestBed.configureTestingModule({
      providers: [
        RemotionTemplatesDataService,
        { provide: ApiService, useValue: apiSpy },
      ],
    });
    service = TestBed.inject(RemotionTemplatesDataService);
  });

  it('calls api.delete on /remotion-templates/:id without ?force when force=false', () => {
    apiSpy.delete.and.returnValue(of({ deleted: true, orphanAssetsRemoved: 0, ftpFailures: 0 }));
    service.deleteTemplate('abc-123').subscribe();
    expect(apiSpy.delete).toHaveBeenCalledWith('/remotion-templates/abc-123');
  });

  it('appends ?force=true when force=true', () => {
    apiSpy.delete.and.returnValue(of({ deleted: true, orphanAssetsRemoved: 1, ftpFailures: 0 }));
    service.deleteTemplate('abc-123', true).subscribe();
    expect(apiSpy.delete).toHaveBeenCalledWith('/remotion-templates/abc-123?force=true');
  });
});
