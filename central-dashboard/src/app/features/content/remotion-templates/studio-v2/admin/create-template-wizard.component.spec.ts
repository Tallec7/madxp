import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { CreateTemplateWizardComponent } from './create-template-wizard.component';
import { RemotionTemplatesDataService } from '../../remotion-templates-data.service';
import { NotificationService } from '../../../../../core/services/notification.service';
import type { RemotionTemplate } from '../../remotion-templates.types';

describe('CreateTemplateWizardComponent', () => {
  let fixture: ComponentFixture<CreateTemplateWizardComponent>;
  let cmp: CreateTemplateWizardComponent;
  let dataSpy: jasmine.SpyObj<RemotionTemplatesDataService>;
  let notifSpy: jasmine.SpyObj<NotificationService>;

  beforeEach(async () => {
    dataSpy = jasmine.createSpyObj('RemotionTemplatesDataService', ['createTemplate']);
    notifSpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);

    await TestBed.configureTestingModule({
      imports: [CreateTemplateWizardComponent],
      providers: [
        { provide: RemotionTemplatesDataService, useValue: dataSpy },
        { provide: NotificationService, useValue: notifSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CreateTemplateWizardComponent);
    cmp = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('starts at step 1 and cannot advance without a name', () => {
    expect(cmp.step).toBe(1);
    expect(cmp.canAdvance()).toBe(false);

    cmp.form.name = 'My Template';
    expect(cmp.canAdvance()).toBe(true);
  });

  it('blocks step 2 advance without compositionId', () => {
    cmp.form.name = 'X';
    cmp.next();
    expect(cmp.step).toBe(2);
    expect(cmp.canAdvance()).toBe(false);

    cmp.form.compositionId = 'ButV2';
    expect(cmp.canAdvance()).toBe(true);
  });

  it('step 3 in v2 mode advances without seed JSON', () => {
    cmp.form = { name: 'N', compositionId: 'C', description: '', mode: 'v2' };
    cmp.step = 3;
    expect(cmp.canAdvance()).toBe(true);
  });

  it('step 3 in v1 mode rejects invalid JSON seeds', () => {
    cmp.form = { name: 'N', compositionId: 'C', description: '', mode: 'v1' };
    cmp.propsSchemaJson = 'not json';
    cmp.step = 3;
    expect(cmp.canAdvance()).toBe(false);
    expect(cmp.seedError).toBeTruthy();
  });

  it('submit calls createTemplate and emits created on success', () => {
    const tpl: RemotionTemplate = {
      id: 'new',
      name: 'N',
      composition_id: 'C',
      description: '',
      props_schema: [],
      default_props: {},
      thumbnail_url: null,
      published: false,
      created_at: '2026-04-20',
    };
    dataSpy.createTemplate.and.returnValue(of(tpl));

    cmp.form = { name: 'N', compositionId: 'C', description: '', mode: 'v2' };
    cmp.step = 4;

    const spy = jasmine.createSpy('created');
    cmp.created.subscribe(spy);

    cmp.submit();

    expect(dataSpy.createTemplate).toHaveBeenCalledWith(jasmine.objectContaining({
      name: 'N',
      composition_id: 'C',
    }));
    expect(spy).toHaveBeenCalledWith(tpl);
    expect(cmp.submitting).toBe(false);
  });

  it('submit surfaces server error message', () => {
    dataSpy.createTemplate.and.returnValue(
      throwError(() => ({ error: { error: 'duplicate name' } })),
    );

    cmp.form = { name: 'N', compositionId: 'C', description: '', mode: 'v2' };
    cmp.step = 4;

    cmp.submit();

    expect(cmp.submitError).toBe('duplicate name');
    expect(cmp.submitting).toBe(false);
  });
});
