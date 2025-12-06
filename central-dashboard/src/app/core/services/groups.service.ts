import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, tap } from 'rxjs';
import { ApiService } from './api.service';
import { Group, Site } from '../models';

@Injectable({
  providedIn: 'root'
})
export class GroupsService {
  private groupsSubject = new BehaviorSubject<Group[]>([]);
  public groups$ = this.groupsSubject.asObservable();

  constructor(private api: ApiService) {}

  loadGroups(filters?: Record<string, any>): Observable<{ total: number; groups: Group[] }> {
    return this.api.get<{ total: number; groups: Group[] }>('/groups', filters).pipe(
      tap(response => this.groupsSubject.next(response.groups))
    );
  }

  getGroup(id: string): Observable<Group> {
    return this.api.get<Group>(`/groups/${id}`);
  }

  loadGroup(id: string): Observable<Group> {
    return this.getGroup(id);
  }

  getGroupSites(id: string): Observable<{ group_id: string; total: number; sites: Site[] }> {
    return this.api.get(`/groups/${id}/sites`);
  }

  createGroup(data: Partial<Group> & { site_ids?: string[] }): Observable<Group> {
    return this.api.post<Group>('/groups', data).pipe(
      tap(() => this.loadGroups().subscribe())
    );
  }

  updateGroup(id: string, data: Partial<Group> & { site_ids?: string[] }): Observable<Group> {
    return this.api.put<Group>(`/groups/${id}`, data).pipe(
      tap(() => this.loadGroups().subscribe())
    );
  }

  deleteGroup(id: string): Observable<void> {
    return this.api.delete<void>(`/groups/${id}`).pipe(
      tap(() => this.loadGroups().subscribe())
    );
  }

  addSitesToGroup(groupId: string, siteIds: string[]): Observable<any> {
    return this.api.post(`/groups/${groupId}/sites`, { site_ids: siteIds });
  }

  removeSiteFromGroup(groupId: string, siteId: string): Observable<void> {
    return this.api.delete<void>(`/groups/${groupId}/sites/${siteId}`);
  }

  // Commandes de groupe
  sendGroupCommand(groupId: string, command: string, params?: Record<string, any>): Observable<{
    success: boolean;
    message: string;
    results: { site_id: string; success: boolean; message: string }[];
  }> {
    return this.api.post(`/groups/${groupId}/command`, { command, params });
  }

  restartAllServices(groupId: string): Observable<{
    success: boolean;
    message: string;
    results: { site_id: string; success: boolean; message: string }[];
  }> {
    return this.sendGroupCommand(groupId, 'restart_service', { service: 'neopro-app' });
  }

  rebootAllSites(groupId: string): Observable<{
    success: boolean;
    message: string;
    results: { site_id: string; success: boolean; message: string }[];
  }> {
    return this.sendGroupCommand(groupId, 'reboot', {});
  }
}
