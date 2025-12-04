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

  loadGroups(): Observable<{ total: number; groups: Group[] }> {
    return this.api.get<{ total: number; groups: Group[] }>('/groups').pipe(
      tap(response => this.groupsSubject.next(response.groups))
    );
  }

  getGroup(id: string): Observable<Group> {
    return this.api.get<Group>(`/groups/${id}`);
  }

  getGroupSites(id: string): Observable<{ group_id: string; total: number; sites: Site[] }> {
    return this.api.get(`/groups/${id}/sites`);
  }

  createGroup(data: Partial<Group>): Observable<Group> {
    return this.api.post<Group>('/groups', data).pipe(
      tap(() => this.loadGroups().subscribe())
    );
  }

  updateGroup(id: string, data: Partial<Group>): Observable<Group> {
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
}
