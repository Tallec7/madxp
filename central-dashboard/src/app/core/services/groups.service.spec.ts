import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of } from 'rxjs';
import { GroupsService } from './groups.service';
import { ApiService } from './api.service';
import { Group, Site } from '../models';

describe('GroupsService', () => {
  let service: GroupsService;
  let apiServiceSpy: jasmine.SpyObj<ApiService>;

  const mockGroup: Group = {
    id: 'group-1',
    name: 'Test Group',
    description: 'A test group',
    type: 'custom',
    filters: null,
    metadata: { sport: 'football' },
    created_at: new Date(),
    updated_at: new Date(),
    site_count: 5
  };

  const mockSite: Site = {
    id: 'site-1',
    site_name: 'Test Site',
    club_name: 'Test Club',
    location: { city: 'Paris', country: 'France' },
    sports: ['football'],
    status: 'online',
    last_seen_at: new Date(),
    software_version: '1.0.0',
    hardware_model: 'RPi4',
    api_key: 'key-123',
    metadata: {},
    created_at: new Date(),
    updated_at: new Date()
  };

  const mockGroupsResponse = {
    total: 2,
    groups: [mockGroup, { ...mockGroup, id: 'group-2', name: 'Group 2' }]
  };

  beforeEach(() => {
    apiServiceSpy = jasmine.createSpyObj('ApiService', ['get', 'post', 'put', 'delete']);

    TestBed.configureTestingModule({
      providers: [
        GroupsService,
        { provide: ApiService, useValue: apiServiceSpy }
      ]
    });

    service = TestBed.inject(GroupsService);
  });

  describe('loadGroups', () => {
    it('should load groups from API', fakeAsync(() => {
      apiServiceSpy.get.and.returnValue(of(mockGroupsResponse));

      let result: { total: number; groups: Group[] } | undefined;
      service.loadGroups().subscribe(r => result = r);
      tick();

      expect(apiServiceSpy.get).toHaveBeenCalledWith('/groups', undefined);
      expect(result).toEqual(mockGroupsResponse);
    }));

    it('should pass filters to API', fakeAsync(() => {
      apiServiceSpy.get.and.returnValue(of(mockGroupsResponse));

      const filters = { type: 'sport', limit: 10 };
      service.loadGroups(filters).subscribe();
      tick();

      expect(apiServiceSpy.get).toHaveBeenCalledWith('/groups', filters);
    }));

    it('should update groups$ observable', fakeAsync(() => {
      apiServiceSpy.get.and.returnValue(of(mockGroupsResponse));

      let emittedGroups: Group[] = [];
      service.groups$.subscribe(g => emittedGroups = g);

      service.loadGroups().subscribe();
      tick();

      expect(emittedGroups).toEqual(mockGroupsResponse.groups);
    }));
  });

  describe('getGroup', () => {
    it('should get single group by ID', fakeAsync(() => {
      apiServiceSpy.get.and.returnValue(of(mockGroup));

      let result: Group | undefined;
      service.getGroup('group-1').subscribe(r => result = r);
      tick();

      expect(apiServiceSpy.get).toHaveBeenCalledWith('/groups/group-1');
      expect(result).toEqual(mockGroup);
    }));
  });

  describe('loadGroup', () => {
    it('should call getGroup', fakeAsync(() => {
      apiServiceSpy.get.and.returnValue(of(mockGroup));

      service.loadGroup('group-1').subscribe();
      tick();

      expect(apiServiceSpy.get).toHaveBeenCalledWith('/groups/group-1');
    }));
  });

  describe('getGroupSites', () => {
    it('should get sites for a group', fakeAsync(() => {
      const response = { group_id: 'group-1', total: 1, sites: [mockSite] };
      apiServiceSpy.get.and.returnValue(of(response));

      let result: any;
      service.getGroupSites('group-1').subscribe(r => result = r);
      tick();

      expect(apiServiceSpy.get).toHaveBeenCalledWith('/groups/group-1/sites');
      expect(result).toEqual(response);
    }));
  });

  describe('createGroup', () => {
    it('should create group and reload groups', fakeAsync(() => {
      apiServiceSpy.post.and.returnValue(of(mockGroup));
      apiServiceSpy.get.and.returnValue(of(mockGroupsResponse));

      const data = { name: 'New Group', type: 'custom' as const };
      let result: Group | undefined;
      service.createGroup(data).subscribe(r => result = r);
      tick();

      expect(apiServiceSpy.post).toHaveBeenCalledWith('/groups', data);
      expect(result).toEqual(mockGroup);
    }));

    it('should include site_ids when provided', fakeAsync(() => {
      apiServiceSpy.post.and.returnValue(of(mockGroup));
      apiServiceSpy.get.and.returnValue(of(mockGroupsResponse));

      const data = { name: 'New Group', type: 'custom' as const, site_ids: ['site-1', 'site-2'] };
      service.createGroup(data).subscribe();
      tick();

      expect(apiServiceSpy.post).toHaveBeenCalledWith('/groups', data);
    }));
  });

  describe('updateGroup', () => {
    it('should update group and reload groups', fakeAsync(() => {
      const updatedGroup = { ...mockGroup, name: 'Updated Group' };
      apiServiceSpy.put.and.returnValue(of(updatedGroup));
      apiServiceSpy.get.and.returnValue(of(mockGroupsResponse));

      const data = { name: 'Updated Group' };
      let result: Group | undefined;
      service.updateGroup('group-1', data).subscribe(r => result = r);
      tick();

      expect(apiServiceSpy.put).toHaveBeenCalledWith('/groups/group-1', data);
      expect(result).toEqual(updatedGroup);
    }));
  });

  describe('deleteGroup', () => {
    it('should delete group and reload groups', fakeAsync(() => {
      apiServiceSpy.delete.and.returnValue(of(undefined));
      apiServiceSpy.get.and.returnValue(of(mockGroupsResponse));

      service.deleteGroup('group-1').subscribe();
      tick();

      expect(apiServiceSpy.delete).toHaveBeenCalledWith('/groups/group-1');
    }));
  });

  describe('addSitesToGroup', () => {
    it('should add sites to group', fakeAsync(() => {
      apiServiceSpy.post.and.returnValue(of({ success: true }));

      const siteIds = ['site-1', 'site-2'];
      service.addSitesToGroup('group-1', siteIds).subscribe();
      tick();

      expect(apiServiceSpy.post).toHaveBeenCalledWith('/groups/group-1/sites', { site_ids: siteIds });
    }));
  });

  describe('removeSiteFromGroup', () => {
    it('should remove site from group', fakeAsync(() => {
      apiServiceSpy.delete.and.returnValue(of(undefined));

      service.removeSiteFromGroup('group-1', 'site-1').subscribe();
      tick();

      expect(apiServiceSpy.delete).toHaveBeenCalledWith('/groups/group-1/sites/site-1');
    }));
  });

  describe('group commands', () => {
    const commandResponse = {
      success: true,
      message: 'Command sent',
      results: [{ site_id: 'site-1', success: true, message: 'OK' }]
    };

    describe('sendGroupCommand', () => {
      it('should send command to group', fakeAsync(() => {
        apiServiceSpy.post.and.returnValue(of(commandResponse));

        let result: any;
        service.sendGroupCommand('group-1', 'restart_service', { service: 'neopro' }).subscribe(r => result = r);
        tick();

        expect(apiServiceSpy.post).toHaveBeenCalledWith('/groups/group-1/command', {
          command: 'restart_service',
          params: { service: 'neopro' }
        });
        expect(result).toEqual(commandResponse);
      }));
    });

    describe('restartAllServices', () => {
      it('should send restart_service command', fakeAsync(() => {
        apiServiceSpy.post.and.returnValue(of(commandResponse));

        service.restartAllServices('group-1').subscribe();
        tick();

        expect(apiServiceSpy.post).toHaveBeenCalledWith('/groups/group-1/command', {
          command: 'restart_service',
          params: { service: 'neopro-app' }
        });
      }));
    });

    describe('rebootAllSites', () => {
      it('should send reboot command', fakeAsync(() => {
        apiServiceSpy.post.and.returnValue(of(commandResponse));

        service.rebootAllSites('group-1').subscribe();
        tick();

        expect(apiServiceSpy.post).toHaveBeenCalledWith('/groups/group-1/command', {
          command: 'reboot',
          params: {}
        });
      }));
    });
  });
});
