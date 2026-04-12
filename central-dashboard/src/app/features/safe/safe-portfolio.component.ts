/**
 * SAFe Portfolio Overview
 *
 * Dashboard principal : KPIs, roadmap Gantt, Kanban epics, ROAM, themes, value streams, flow metrics.
 */

import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { CdkDragDrop, DragDropModule, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  SafeService,
  SafePortfolio,
  SafeEpic,
  SafePiObjective,
  SafeRisk,
  EpicStatus,
  SafeRoadmapItem,
} from '../../core/services/safe.service';
import { NotificationService } from '../../core/services/notification.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';

interface KanbanColumn {
  id: EpicStatus;
  labelKey: string;
  items: SafeEpic[];
}

@Component({
  selector: 'app-safe-portfolio',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslateModule, DragDropModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="safe-portfolio" *ngIf="portfolio; else skeleton">

      <!-- Header -->
      <div class="page-header">
        <div class="header-left">
          <h1>{{ 'safe.portfolio.title' | translate }}</h1>
          <span class="pi-badge">{{ portfolio.kpis.currentPi }}</span>
        </div>
        <div class="header-actions">
          <a routerLink="/safe/sprints" class="btn btn-secondary">
            {{ 'safe.sprints.title' | translate }}
          </a>
          <a routerLink="/safe/proposals" class="btn btn-secondary">
            {{ 'safe.proposals.title' | translate }}
          </a>
          <a routerLink="/safe/product" class="btn btn-secondary">
            Produit
          </a>
        </div>
      </div>

      <!-- KPI Cards -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-value">{{ portfolio.kpis.totalEpics }}</div>
          <div class="kpi-label">{{ 'safe.portfolio.epics' | translate }}</div>
          <div class="kpi-sub">{{ portfolio.kpis.epicsDone }} {{ 'safe.portfolio.done' | translate }}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">{{ portfolio.kpis.totalFeatures }}</div>
          <div class="kpi-label">{{ 'safe.portfolio.features' | translate }}</div>
          <div class="kpi-sub">{{ portfolio.kpis.featuresDone }} {{ 'safe.portfolio.done' | translate }}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">{{ portfolio.kpis.totalStoryPoints }}</div>
          <div class="kpi-label">{{ 'safe.portfolio.storyPoints' | translate }}</div>
        </div>
        <div class="kpi-card" *ngIf="portfolio.kpis.predictability !== null">
          <div class="kpi-value">{{ portfolio.kpis.predictability }}%</div>
          <div class="kpi-label">{{ 'safe.portfolio.predictability' | translate }}</div>
        </div>
      </div>

      <!-- Roadmap Gantt -->
      <div class="section-card">
        <h2>{{ 'safe.portfolio.roadmap' | translate }}</h2>
        <div class="gantt-container">
          <div class="gantt-row" *ngFor="let item of portfolio.roadmap; trackBy: trackByRoadmap">
            <div class="gantt-label">
              <span class="epic-id">{{ item.epicId }}</span>
              <span class="epic-name">{{ item.name }}</span>
            </div>
            <div class="gantt-bar-container">
              <div
                class="gantt-bar"
                [class]="'pi-' + item.pi.toLowerCase().replace(' ', '')"
                [style.left.%]="getGanttOffset(item)"
                [style.width.%]="getGanttWidth(item)"
                [title]="item.pi + ' - ' + item.durationDays + 'j'"
              >
                {{ item.pi }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Themes + Value Streams (side by side) -->
      <div class="two-col">
        <div class="section-card">
          <h2>{{ 'safe.portfolio.themes' | translate }}</h2>
          <div class="theme-list">
            <div class="theme-item" *ngFor="let theme of portfolio.themes; trackBy: trackById">
              <div class="theme-header">
                <span class="theme-dot" [style.background]="theme.color"></span>
                <strong>{{ theme.id }}</strong> — {{ theme.name }}
              </div>
              <div class="theme-meta">
                <span>{{ theme.epicIds.length }} epics</span>
                <span>OKR: {{ theme.okr }}</span>
              </div>
              <div class="theme-impact">{{ theme.impact }}</div>
            </div>
          </div>
        </div>

        <div class="section-card">
          <h2>{{ 'safe.portfolio.valueStreams' | translate }}</h2>
          <div class="vs-list">
            <div class="vs-card" *ngFor="let vs of portfolio.valueStreams; trackBy: trackById">
              <div class="vs-name">{{ vs.id }} — {{ vs.name }}</div>
              <div class="vs-stats">
                <span>{{ vs.epicsCount }} epics</span>
                <span>{{ vs.featuresCount }} features</span>
                <span>{{ vs.storyPoints }} SP</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Epic Kanban Board -->
      <div class="section-card">
        <h2>{{ 'safe.portfolio.epicBoard' | translate }}</h2>
        <div class="kanban-board" cdkDropListGroup>
          <div
            class="kanban-column"
            *ngFor="let col of kanbanColumns; trackBy: trackByColumnId"
            cdkDropList
            [cdkDropListData]="col.items"
            [id]="'kanban-' + col.id"
            [cdkDropListConnectedTo]="getConnectedLists(col.id)"
            (cdkDropListDropped)="onEpicDrop($event)"
          >
            <div class="kanban-column-header">
              <span class="column-title">{{ col.labelKey | translate }}</span>
              <span class="column-count">{{ col.items.length }}</span>
            </div>
            <div
              class="kanban-card"
              *ngFor="let epic of col.items; trackBy: trackById"
              cdkDrag
              [class]="'theme-' + epic.theme.toLowerCase()"
            >
              <div class="card-top-row">
                <span class="card-id">{{ epic.id }}</span>
                <div class="card-actions">
                  <button class="btn-icon btn-icon-sm" (click)="openEpicEditModal(epic); $event.stopPropagation()" title="Modifier l'Epic">✏️</button>
                  <select
                    class="epic-status-select"
                    [ngModel]="col.id"
                    (ngModelChange)="onEpicStatusSelect(epic, $event, col.id)"
                    (mousedown)="$event.stopPropagation()"
                    (touchstart)="$event.stopPropagation()"
                    cdkDragHandle
                    [cdkDragHandleDisabled]="true"
                  >
                    <option *ngFor="let s of epicStatuses" [value]="s">{{ 'safe.epicStatus.' + s | translate }}</option>
                  </select>
                </div>
              </div>
              <div class="card-name">{{ epic.name }}</div>
              <div class="card-meta">
                <span class="card-pi">{{ epic.pi }}</span>
                <span class="card-sp">{{ epic.storyPoints }} SP</span>
                <span class="card-features">{{ epic.featuresDone }}/{{ epic.featuresCount }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- PI Objectives -->
      <div class="section-card" *ngIf="portfolio.piObjectives.length > 0">
        <h2>{{ 'safe.portfolio.piObjectives' | translate }}</h2>
        <div class="objectives-table">
          <table>
            <thead>
              <tr>
                <th class="sortable" (click)="sortObjBy('number')"># {{ getObjSortIndicator('number') }}</th>
                <th class="sortable" (click)="sortObjBy('description')">{{ 'safe.portfolio.objective' | translate }} {{ getObjSortIndicator('description') }}</th>
                <th class="sortable" (click)="sortObjBy('valueStream')">VS {{ getObjSortIndicator('valueStream') }}</th>
                <th class="sortable" (click)="sortObjBy('theme')">{{ 'safe.portfolio.theme' | translate }} {{ getObjSortIndicator('theme') }}</th>
                <th class="sortable" (click)="sortObjBy('businessValue')">BV {{ getObjSortIndicator('businessValue') }}</th>
                <th class="sortable" (click)="sortObjBy('type')">Type {{ getObjSortIndicator('type') }}</th>
                <th class="sortable" (click)="sortObjBy('storyPoints')">SP {{ getObjSortIndicator('storyPoints') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let obj of sortedObjectives; trackBy: trackByObjNumber" [class]="'obj-' + obj.type">
                <td>{{ obj.number }}</td>
                <td>{{ obj.description }}</td>
                <td>{{ obj.valueStream }}</td>
                <td>{{ obj.theme }}</td>
                <td class="bv-cell">{{ obj.businessValue }}</td>
                <td><span class="obj-badge" [class]="obj.type">{{ obj.type }}</span></td>
                <td>{{ obj.storyPoints }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ROAM Summary -->
      <div class="section-card">
        <h2>{{ 'safe.portfolio.roam' | translate }}</h2>
        <div class="roam-grid">
          <div class="roam-card roam-resolved">
            <div class="roam-count">{{ getRoamCount('Resolved') }}</div>
            <div class="roam-label">{{ 'safe.roamStatus.Resolved' | translate }}</div>
          </div>
          <div class="roam-card roam-owned">
            <div class="roam-count">{{ getRoamCount('Owned') }}</div>
            <div class="roam-label">{{ 'safe.roamStatus.Owned' | translate }}</div>
          </div>
          <div class="roam-card roam-accepted">
            <div class="roam-count">{{ getRoamCount('Accepted') }}</div>
            <div class="roam-label">{{ 'safe.roamStatus.Accepted' | translate }}</div>
          </div>
          <div class="roam-card roam-mitigated">
            <div class="roam-count">{{ getRoamCount('Mitigated') }}</div>
            <div class="roam-label">{{ 'safe.roamStatus.Mitigated' | translate }}</div>
          </div>
        </div>
        <div class="risk-table" *ngIf="portfolio.risks.length > 0">
          <table>
            <thead>
              <tr>
                <th class="sortable" (click)="sortRiskBy('id')">ID {{ getRiskSortIndicator('id') }}</th>
                <th class="sortable" (click)="sortRiskBy('title')">{{ 'safe.portfolio.risk' | translate }} {{ getRiskSortIndicator('title') }}</th>
                <th class="sortable" (click)="sortRiskBy('roamStatus')">ROAM {{ getRiskSortIndicator('roamStatus') }}</th>
                <th class="sortable" (click)="sortRiskBy('category')">{{ 'safe.portfolio.category' | translate }} {{ getRiskSortIndicator('category') }}</th>
                <th class="sortable" (click)="sortRiskBy('probability')">P {{ getRiskSortIndicator('probability') }}</th>
                <th class="sortable" (click)="sortRiskBy('impact')">I {{ getRiskSortIndicator('impact') }}</th>
                <th class="sortable" (click)="sortRiskBy('owner')">{{ 'safe.portfolio.owner' | translate }} {{ getRiskSortIndicator('owner') }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let risk of sortedRisks; trackBy: trackById">
                <td class="risk-id">{{ risk.id }}</td>
                <td>{{ risk.title }}</td>
                <td><span class="roam-badge" [class]="risk.roamStatus.toLowerCase()">{{ 'safe.roamStatus.' + risk.roamStatus | translate }}</span></td>
                <td>{{ risk.category }}</td>
                <td>{{ risk.probability }}</td>
                <td>{{ risk.impact }}</td>
                <td>{{ risk.owner }}</td>
                <td><button class="btn-icon" (click)="openRoamEditModal(risk)" title="Modifier le statut ROAM">✏️</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Flow Metrics -->
      <div class="section-card" *ngIf="portfolio.flowMetrics.length > 0">
        <h2>{{ 'safe.portfolio.flowMetrics' | translate }}</h2>
        <div class="flow-metrics-table">
          <table>
            <thead>
              <tr>
                <th>{{ 'safe.portfolio.flowMetricName' | translate }}</th>
                <th>{{ 'safe.portfolio.flowMetricDefinition' | translate }}</th>
                <th>{{ 'safe.portfolio.flowMetricUnit' | translate }}</th>
                <th>{{ 'safe.portfolio.flowMetricTarget' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let fm of portfolio.flowMetrics; trackBy: trackByName">
                <td class="metric-name">{{ fm.name }}</td>
                <td>{{ fm.definition }}</td>
                <td>{{ fm.unit }}</td>
                <td class="metric-target">{{ fm.targetPi1 }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ROAM Edit Modal -->
      <div class="modal" *ngIf="showRoamModal" (click)="closeRoamModal()">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Modifier le statut ROAM</h2>
            <button class="modal-close" (click)="closeRoamModal()">×</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>Risque</label>
              <div class="read-only-field">{{ editingRisk?.id }} — {{ editingRisk?.title }}</div>
            </div>
            <div class="form-group">
              <label for="roamStatus">Statut ROAM</label>
              <select id="roamStatus" [(ngModel)]="roamEditForm.status" class="form-control">
                <option value="Resolved">Resolved</option>
                <option value="Owned">Owned</option>
                <option value="Accepted">Accepted</option>
                <option value="Mitigated">Mitigated</option>
              </select>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="closeRoamModal()">Annuler</button>
            <button class="btn btn-primary" (click)="saveRoamStatus()" [disabled]="savingRoam">
              {{ savingRoam ? 'Enregistrement...' : 'Enregistrer' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Epic Edit Modal -->
      <div class="modal" *ngIf="showEpicModal" (click)="closeEpicModal()">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Modifier l'Epic</h2>
            <button class="modal-close" (click)="closeEpicModal()">×</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>Epic</label>
              <div class="read-only-field">{{ editingEpic?.id }}</div>
            </div>
            <div class="form-group">
              <label for="epicName">Nom</label>
              <input id="epicName" type="text" [(ngModel)]="epicEditForm.name" class="form-control" />
            </div>
            <div class="form-group">
              <label for="epicStatus">Statut</label>
              <select id="epicStatus" [(ngModel)]="epicEditForm.status" class="form-control">
                <option *ngFor="let s of epicStatuses" [value]="s">{{ 'safe.epicStatus.' + s | translate }}</option>
              </select>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="closeEpicModal()">Annuler</button>
            <button class="btn btn-primary" (click)="saveEpic()" [disabled]="savingEpic">
              {{ savingEpic ? 'Enregistrement...' : 'Enregistrer' }}
            </button>
          </div>
        </div>
      </div>

    </div>

    <!-- Skeleton Loading -->
    <ng-template #skeleton>
      <div class="safe-portfolio">
        <div class="page-header">
          <div class="header-left">
            <div class="skel skel-title"></div>
            <div class="skel skel-badge"></div>
          </div>
        </div>
        <div class="kpi-grid">
          <div class="kpi-card skel-pulse" *ngFor="let i of [1,2,3,4]">
            <div class="skel skel-kpi-value"></div>
            <div class="skel skel-kpi-label"></div>
          </div>
        </div>
        <div class="section-card skel-pulse">
          <div class="skel skel-section-title"></div>
          <div class="skel skel-gantt" *ngFor="let i of [1,2,3,4,5]"></div>
        </div>
        <div class="section-card skel-pulse">
          <div class="skel skel-section-title"></div>
          <div class="kanban-board">
            <div class="kanban-column skel-pulse" *ngFor="let i of [1,2,3,4,5]">
              <div class="skel skel-col-header"></div>
              <div class="skel skel-card" *ngFor="let j of [1,2]"></div>
            </div>
          </div>
        </div>
      </div>
    </ng-template>
  `,
  styles: [`
    :host { display: block; }

    .safe-portfolio { padding: 24px; max-width: 1400px; margin: 0 auto; }

    .page-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 24px;
    }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .header-left h1 { margin: 0; font-size: 24px; color: var(--neo-text, #fff); }
    .pi-badge {
      background: var(--neo-primary, #4f8cff); color: #fff;
      padding: 4px 12px; border-radius: 12px; font-size: 13px; font-weight: 600;
    }
    .btn { padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer; font-size: 13px; text-decoration: none; }
    .btn-secondary {
      background: var(--neo-surface, #1e1e2e); color: var(--neo-text, #fff);
      border: 1px solid var(--neo-border, #333);
    }
    .btn-secondary:hover { background: var(--neo-hover, #2a2a3e); }

    /* KPI Grid */
    .kpi-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px; margin-bottom: 24px;
    }
    .kpi-card {
      background: var(--neo-surface, #1e1e2e); border-radius: 12px;
      padding: 20px; text-align: center;
      border: 1px solid var(--neo-border, #333);
    }
    .kpi-value { font-size: 32px; font-weight: 700; color: var(--neo-primary, #4f8cff); }
    .kpi-label { font-size: 13px; color: var(--neo-text-secondary, #999); margin-top: 4px; }
    .kpi-sub { font-size: 12px; color: var(--neo-text-muted, #666); margin-top: 2px; }

    /* Section Card */
    .section-card {
      background: var(--neo-surface, #1e1e2e); border-radius: 12px;
      padding: 20px; margin-bottom: 24px;
      border: 1px solid var(--neo-border, #333);
    }
    .section-card h2 {
      margin: 0 0 16px; font-size: 18px; color: var(--neo-text, #fff);
    }

    /* Two Column */
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    @media (max-width: 900px) { .two-col { grid-template-columns: 1fr; } }

    /* Gantt */
    .gantt-container { overflow-x: auto; }
    .gantt-row { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; min-height: 28px; }
    .gantt-label {
      min-width: 280px; display: flex; gap: 8px; font-size: 12px;
      color: var(--neo-text-secondary, #999);
    }
    .epic-id { font-weight: 600; color: var(--neo-text, #fff); min-width: 40px; }
    .gantt-bar-container { flex: 1; position: relative; height: 22px; background: var(--neo-bg, #121220); border-radius: 4px; }
    .gantt-bar {
      position: absolute; height: 100%; border-radius: 4px;
      font-size: 10px; color: #fff; display: flex; align-items: center;
      padding: 0 6px; white-space: nowrap; min-width: 40px;
    }
    .pi-done { background: #4caf50; }
    .pi-pi-1, .pi-pi1 { background: #2196f3; }
    .pi-pi-2, .pi-pi2 { background: #ff9800; }
    .pi-pi-3, .pi-pi3 { background: #9c27b0; }

    /* Themes */
    .theme-list { display: flex; flex-direction: column; gap: 12px; }
    .theme-item {
      padding: 12px; border-radius: 8px;
      background: var(--neo-bg, #121220); border: 1px solid var(--neo-border, #333);
    }
    .theme-header { display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--neo-text, #fff); }
    .theme-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .theme-meta { font-size: 12px; color: var(--neo-text-secondary, #999); margin-top: 4px; display: flex; gap: 12px; }
    .theme-impact { font-size: 12px; color: var(--neo-text-muted, #666); margin-top: 2px; }

    /* Value Streams */
    .vs-list { display: flex; flex-direction: column; gap: 12px; }
    .vs-card {
      padding: 12px; border-radius: 8px;
      background: var(--neo-bg, #121220); border: 1px solid var(--neo-border, #333);
    }
    .vs-name { font-size: 14px; font-weight: 600; color: var(--neo-text, #fff); }
    .vs-stats { font-size: 12px; color: var(--neo-text-secondary, #999); margin-top: 4px; display: flex; gap: 12px; }

    /* Kanban Board */
    .kanban-board { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px; }
    .kanban-column {
      min-width: 200px; flex: 1;
      background: var(--neo-bg, #121220); border-radius: 8px;
      padding: 12px; min-height: 200px;
    }
    .kanban-column-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 12px; padding-bottom: 8px;
      border-bottom: 2px solid var(--neo-border, #333);
    }
    .column-title { font-size: 13px; font-weight: 600; color: var(--neo-text, #fff); text-transform: uppercase; }
    .column-count {
      background: var(--neo-surface, #1e1e2e); color: var(--neo-text-secondary, #999);
      padding: 2px 8px; border-radius: 10px; font-size: 11px;
    }

    .kanban-card {
      background: var(--neo-surface, #1e1e2e); border-radius: 8px;
      padding: 10px; margin-bottom: 8px; cursor: grab;
      border-left: 3px solid var(--neo-border, #333);
      transition: box-shadow 0.2s;
    }
    .kanban-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
    .kanban-card.cdk-drag-preview { box-shadow: 0 4px 16px rgba(0,0,0,0.5); }
    .kanban-card.theme-ts1 { border-left-color: #ef5350; }
    .kanban-card.theme-ts2 { border-left-color: #42a5f5; }
    .kanban-card.theme-ts3 { border-left-color: #66bb6a; }
    .kanban-card.theme-ts4 { border-left-color: #ab47bc; }
    .card-top-row { display: flex; align-items: center; justify-content: space-between; }
    .card-id { font-size: 11px; font-weight: 600; color: var(--neo-primary, #4f8cff); }
    .epic-status-select {
      font-size: 10px; padding: 1px 4px; border-radius: 4px;
      background: var(--neo-bg, #121220); color: var(--neo-text-secondary, #999);
      border: 1px solid var(--neo-border, #333); cursor: pointer;
      max-width: 100px;
    }
    .epic-status-select:hover { border-color: var(--neo-primary, #4f8cff); }
    .epic-status-select:focus { outline: none; border-color: var(--neo-primary, #4f8cff); }
    .card-name { font-size: 13px; color: var(--neo-text, #fff); margin-top: 2px; }
    .card-meta { display: flex; gap: 8px; margin-top: 6px; font-size: 11px; color: var(--neo-text-secondary, #999); }

    .cdk-drag-placeholder {
      background: var(--neo-bg, #121220); border: 2px dashed var(--neo-border, #444);
      border-radius: 8px; min-height: 60px; margin-bottom: 8px;
    }

    /* PI Objectives Table */
    .objectives-table { overflow-x: auto; }
    .objectives-table table {
      width: 100%; border-collapse: collapse; font-size: 13px;
    }
    .objectives-table th {
      text-align: left; padding: 8px 12px; color: var(--neo-text-secondary, #999);
      border-bottom: 1px solid var(--neo-border, #333); font-weight: 600;
    }
    .objectives-table td {
      padding: 8px 12px; color: var(--neo-text, #fff);
      border-bottom: 1px solid var(--neo-border, #222);
    }
    .obj-stretch td { opacity: 0.7; }
    .bv-cell { font-weight: 600; color: var(--neo-primary, #4f8cff); }
    .obj-badge {
      padding: 2px 8px; border-radius: 8px; font-size: 11px; text-transform: uppercase;
    }
    .obj-badge.committed { background: #1b5e20; color: #a5d6a7; }
    .obj-badge.stretch { background: #4a148c; color: #ce93d8; }

    /* ROAM */
    .roam-grid {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;
      margin-bottom: 16px;
    }
    .roam-card {
      text-align: center; padding: 16px; border-radius: 8px;
      background: var(--neo-bg, #121220);
    }
    .roam-count { font-size: 28px; font-weight: 700; }
    .roam-label { font-size: 12px; color: var(--neo-text-secondary, #999); margin-top: 2px; }
    .roam-resolved .roam-count { color: #4caf50; }
    .roam-owned .roam-count { color: #ff9800; }
    .roam-accepted .roam-count { color: #2196f3; }
    .roam-mitigated .roam-count { color: #9c27b0; }

    .risk-table { overflow-x: auto; }
    .risk-table table {
      width: 100%; border-collapse: collapse; font-size: 13px;
    }
    .risk-table th {
      text-align: left; padding: 8px 12px; color: var(--neo-text-secondary, #999);
      border-bottom: 1px solid var(--neo-border, #333); font-weight: 600;
    }
    .risk-table td {
      padding: 8px 12px; color: var(--neo-text, #fff);
      border-bottom: 1px solid var(--neo-border, #222);
    }
    .risk-id { font-weight: 600; color: var(--neo-primary, #4f8cff); }
    .roam-badge {
      padding: 2px 8px; border-radius: 8px; font-size: 11px; font-weight: 600;
    }
    .roam-badge.resolved { background: #1b5e20; color: #a5d6a7; }
    .roam-badge.owned { background: #e65100; color: #ffcc80; }
    .roam-badge.accepted { background: #0d47a1; color: #90caf9; }
    .roam-badge.mitigated { background: #4a148c; color: #ce93d8; }
    .sortable { cursor: pointer; user-select: none; }
    .sortable:hover { color: var(--neo-text, #fff); }

    /* Flow Metrics */
    .flow-metrics-table { overflow-x: auto; }
    .flow-metrics-table table {
      width: 100%; border-collapse: collapse; font-size: 13px;
    }
    .flow-metrics-table th {
      text-align: left; padding: 8px 12px; color: var(--neo-text-secondary, #999);
      border-bottom: 1px solid var(--neo-border, #333); font-weight: 600;
    }
    .flow-metrics-table td {
      padding: 8px 12px; color: var(--neo-text, #fff);
      border-bottom: 1px solid var(--neo-border, #222);
    }
    .metric-name { font-weight: 600; }
    .metric-target { color: var(--neo-primary, #4f8cff); font-weight: 600; }

    /* Skeleton */
    .skel {
      background: var(--neo-surface, #1e1e2e); border-radius: 8px;
    }
    .skel-pulse {
      animation: pulse 1.5s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .skel-title { width: 200px; height: 28px; }
    .skel-badge { width: 60px; height: 24px; border-radius: 12px; }
    .skel-kpi-value { width: 60px; height: 32px; margin: 0 auto 8px; }
    .skel-kpi-label { width: 80px; height: 14px; margin: 0 auto; }
    .skel-section-title { width: 180px; height: 20px; margin-bottom: 16px; }
    .skel-gantt { height: 22px; margin-bottom: 6px; }
    .skel-col-header { height: 20px; margin-bottom: 12px; }
    .skel-card { height: 70px; margin-bottom: 8px; border-radius: 8px; background: var(--neo-surface, #1e1e2e); }

    /* Modal */
    .modal {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.5); display: flex; align-items: center;
      justify-content: center; z-index: 1000; padding: 2rem;
    }
    .modal-content {
      background: var(--neo-surface, #1e1e2e); border-radius: 12px;
      max-width: 500px; width: 100%; max-height: 90vh; overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }
    .modal-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 1.5rem; border-bottom: 1px solid var(--neo-border, #333);
    }
    .modal-header h2 { margin: 0; font-size: 1.25rem; color: var(--neo-text, #fff); }
    .modal-close {
      background: none; border: none; font-size: 2rem; color: var(--neo-text-secondary, #999);
      cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center;
      justify-content: center; border-radius: 4px;
    }
    .modal-close:hover { background: var(--neo-bg, #121220); color: var(--neo-text, #fff); }
    .modal-body { padding: 1.5rem; }
    .modal-footer {
      display: flex; justify-content: flex-end; gap: 1rem;
      padding: 1.5rem; border-top: 1px solid var(--neo-border, #333);
    }
    .form-group { margin-bottom: 1rem; }
    .form-group label {
      display: block; font-size: 13px; font-weight: 600;
      color: var(--neo-text-secondary, #999); margin-bottom: 6px;
    }
    .form-control {
      width: 100%; padding: 8px 12px; border-radius: 6px;
      border: 1px solid var(--neo-border, #333); background: var(--neo-bg, #121220);
      color: var(--neo-text, #fff); font-size: 14px;
    }
    .read-only-field {
      padding: 8px 12px; background: var(--neo-bg, #121220);
      border-radius: 6px; color: var(--neo-text, #fff); font-size: 14px;
    }
    .btn-icon {
      background: none; border: none; cursor: pointer; padding: 4px;
      font-size: 14px; opacity: 0.6; transition: opacity 0.2s;
    }
    .btn-icon:hover { opacity: 1; }
    .btn-icon-sm { font-size: 12px; }
    .card-actions { display: flex; align-items: center; gap: 4px; }

    @media (max-width: 768px) {
      .safe-portfolio { padding: 16px; }
      .kpi-grid { grid-template-columns: repeat(2, 1fr); }
      .roam-grid { grid-template-columns: repeat(2, 1fr); }
      .kanban-board { flex-direction: column; }
      .kanban-column { min-width: unset; }
    }
  `]
})
export class SafePortfolioComponent implements OnInit, OnDestroy {
  private readonly safeService = inject(SafeService);
  private readonly notif = inject(NotificationService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly translate = inject(TranslateService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  portfolio: SafePortfolio | null = null;
  kanbanColumns: KanbanColumn[] = [];
  sortedObjectives: SafePiObjective[] = [];
  sortedRisks: SafeRisk[] = [];
  readonly epicStatuses: EpicStatus[] = ['funnel', 'analysis', 'backlog', 'implementing', 'done'];

  // ROAM edit modal
  showRoamModal = false;
  editingRisk: SafeRisk | null = null;
  roamEditForm = { status: '' as string };
  savingRoam = false;

  // Epic edit modal
  showEpicModal = false;
  editingEpic: SafeEpic | null = null;
  epicEditForm = { status: '' as string, name: '' };
  savingEpic = false;

  private objSortCol = '';
  private objSortDir: 'asc' | 'desc' = 'asc';
  private riskSortCol = '';
  private riskSortDir: 'asc' | 'desc' = 'asc';

  private ganttStart = 0;
  private ganttEnd = 0;
  private ganttRange = 0;

  ngOnInit(): void {
    this.safeService.getPortfolio().pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => {
        this.portfolio = data;
        this.sortedObjectives = [...data.piObjectives];
        this.sortedRisks = [...data.risks];
        this.computeGanttRange(data.roadmap);
        this.buildKanban(data.epics);
        this.cdr.markForCheck();
      },
      error: () => {
        this.notif.error(this.translate.instant('safe.portfolio.loadError'));
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private computeGanttRange(roadmap: SafeRoadmapItem[]): void {
    if (roadmap.length === 0) {
      this.ganttStart = Date.now();
      this.ganttEnd = Date.now() + 180 * 86400000;
      this.ganttRange = this.ganttEnd - this.ganttStart;
      return;
    }
    const starts = roadmap.map(r => new Date(r.startDate).getTime());
    const ends = roadmap.map(r => new Date(r.startDate).getTime() + r.durationDays * 86400000);
    const margin = 14 * 86400000;
    this.ganttStart = Math.min(...starts) - margin;
    this.ganttEnd = Math.max(...ends) + margin;
    this.ganttRange = this.ganttEnd - this.ganttStart;
  }

  private buildKanban(epics: SafeEpic[]): void {
    const statuses: EpicStatus[] = ['funnel', 'analysis', 'backlog', 'implementing', 'done'];
    this.kanbanColumns = statuses.map(s => ({
      id: s,
      labelKey: `safe.epicStatus.${s}`,
      items: epics.filter(e => e.status === s || (s === 'done' && e.status === 'partial')),
    }));
  }

  getConnectedLists(current: EpicStatus): string[] {
    return this.kanbanColumns
      .filter(c => c.id !== current)
      .map(c => 'kanban-' + c.id);
  }

  async onEpicDrop(event: CdkDragDrop<SafeEpic[]>): Promise<void> {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
      return;
    }

    const epic = event.previousContainer.data[event.previousIndex];
    const newStatus = this.kanbanColumns.find(
      c => event.container.id === 'kanban-' + c.id
    )?.id;

    if (!newStatus || !epic) return;

    const ok = await this.confirmDialog.confirm(
      this.translate.instant('safe.portfolio.epicStatusUpdated') + ` — ${epic.id} → ${this.translate.instant('safe.epicStatus.' + newStatus)}?`,
      { title: 'Status', confirmLabel: this.translate.instant('common.confirm'), confirmStyle: 'primary' },
    );
    if (!ok) return;

    transferArrayItem(
      event.previousContainer.data,
      event.container.data,
      event.previousIndex,
      event.currentIndex
    );
    this.cdr.markForCheck();

    this.safeService.updateEpic(epic.id, { status: newStatus }).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.notif.success(this.translate.instant('safe.portfolio.epicStatusUpdated'));
      },
      error: () => {
        transferArrayItem(
          event.container.data,
          event.previousContainer.data,
          event.currentIndex,
          event.previousIndex
        );
        this.notif.error(this.translate.instant('safe.portfolio.epicStatusError'));
        this.cdr.markForCheck();
      }
    });
  }

  async onEpicStatusSelect(epic: SafeEpic, newStatus: EpicStatus, currentCol: EpicStatus): Promise<void> {
    if (newStatus === currentCol) return;

    const ok = await this.confirmDialog.confirm(
      this.translate.instant('safe.portfolio.epicStatusUpdated') + ` — ${epic.id} → ${this.translate.instant('safe.epicStatus.' + newStatus)}?`,
      { title: 'Status', confirmLabel: this.translate.instant('common.confirm'), confirmStyle: 'primary' },
    );
    if (!ok) return;

    // Move between columns
    const fromCol = this.kanbanColumns.find(c => c.id === currentCol);
    const toCol = this.kanbanColumns.find(c => c.id === newStatus);
    if (!fromCol || !toCol) return;

    const idx = fromCol.items.indexOf(epic);
    if (idx === -1) return;

    fromCol.items.splice(idx, 1);
    toCol.items.push(epic);
    this.cdr.markForCheck();

    this.safeService.updateEpic(epic.id, { status: newStatus }).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.notif.success(this.translate.instant('safe.portfolio.epicStatusUpdated'));
      },
      error: () => {
        // Rollback
        const revertIdx = toCol.items.indexOf(epic);
        if (revertIdx !== -1) toCol.items.splice(revertIdx, 1);
        fromCol.items.splice(idx, 0, epic);
        this.notif.error(this.translate.instant('safe.portfolio.epicStatusError'));
        this.cdr.markForCheck();
      }
    });
  }

  getGanttOffset(item: { startDate: string }): number {
    if (!this.ganttRange) return 0;
    const start = new Date(item.startDate).getTime();
    return Math.max(0, ((start - this.ganttStart) / this.ganttRange) * 100);
  }

  getGanttWidth(item: { durationDays: number }): number {
    if (!this.ganttRange) return 0;
    const durationMs = item.durationDays * 86400000;
    return Math.min(100, (durationMs / this.ganttRange) * 100);
  }

  getRoamCount(status: string): number {
    return this.portfolio?.risks.filter(r => r.roamStatus === status).length || 0;
  }

  sortObjBy(col: string): void {
    if (this.objSortCol === col) {
      this.objSortDir = this.objSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.objSortCol = col;
      this.objSortDir = 'asc';
    }
    this.sortedObjectives = [...(this.portfolio?.piObjectives || [])].sort((a, b) => {
      const va = (a as unknown as Record<string, unknown>)[col];
      const vb = (b as unknown as Record<string, unknown>)[col];
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va ?? '').localeCompare(String(vb ?? ''));
      return this.objSortDir === 'asc' ? cmp : -cmp;
    });
    this.cdr.markForCheck();
  }

  getObjSortIndicator(col: string): string {
    if (this.objSortCol !== col) return '';
    return this.objSortDir === 'asc' ? '\u25B2' : '\u25BC';
  }

  sortRiskBy(col: string): void {
    if (this.riskSortCol === col) {
      this.riskSortDir = this.riskSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.riskSortCol = col;
      this.riskSortDir = 'asc';
    }
    this.sortedRisks = [...(this.portfolio?.risks || [])].sort((a, b) => {
      const va = (a as unknown as Record<string, unknown>)[col];
      const vb = (b as unknown as Record<string, unknown>)[col];
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va ?? '').localeCompare(String(vb ?? ''));
      return this.riskSortDir === 'asc' ? cmp : -cmp;
    });
    this.cdr.markForCheck();
  }

  getRiskSortIndicator(col: string): string {
    if (this.riskSortCol !== col) return '';
    return this.riskSortDir === 'asc' ? '\u25B2' : '\u25BC';
  }

  trackById(_index: number, item: { id: string }): string {
    return item.id;
  }

  trackByColumnId(_index: number, col: KanbanColumn): string {
    return col.id;
  }

  trackByRoadmap(_index: number, item: SafeRoadmapItem): string {
    return item.epicId;
  }

  trackByObjNumber(_index: number, obj: { number: number }): number {
    return obj.number;
  }

  trackByName(_index: number, item: { name: string }): string {
    return item.name;
  }

  // --- ROAM Edit Modal ---

  openRoamEditModal(risk: SafeRisk): void {
    this.editingRisk = risk;
    this.roamEditForm = { status: risk.roamStatus };
    this.showRoamModal = true;
    this.cdr.markForCheck();
  }

  closeRoamModal(): void {
    this.showRoamModal = false;
    this.editingRisk = null;
    this.cdr.markForCheck();
  }

  saveRoamStatus(): void {
    if (!this.editingRisk || this.savingRoam) return;

    this.savingRoam = true;
    this.cdr.markForCheck();

    this.safeService.updateRiskRoamStatus(this.editingRisk.id, this.roamEditForm.status as SafeRisk['roamStatus'])
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.notif.success('Statut ROAM mis à jour');
          this.closeRoamModal();
          this.savingRoam = false;
          this.refreshPortfolio();
        },
        error: () => {
          this.notif.error('Erreur lors de la mise à jour du statut ROAM');
          this.savingRoam = false;
          this.cdr.markForCheck();
        }
      });
  }

  // --- Epic Edit Modal ---

  openEpicEditModal(epic: SafeEpic): void {
    this.editingEpic = epic;
    this.epicEditForm = { status: epic.status, name: epic.name };
    this.showEpicModal = true;
    this.cdr.markForCheck();
  }

  closeEpicModal(): void {
    this.showEpicModal = false;
    this.editingEpic = null;
    this.cdr.markForCheck();
  }

  saveEpic(): void {
    if (!this.editingEpic || this.savingEpic) return;

    this.savingEpic = true;
    this.cdr.markForCheck();

    const data: { status?: EpicStatus; name?: string } = {};
    if (this.epicEditForm.status !== this.editingEpic.status) {
      data.status = this.epicEditForm.status as EpicStatus;
    }
    if (this.epicEditForm.name.trim() !== this.editingEpic.name) {
      data.name = this.epicEditForm.name.trim();
    }

    if (!data.status && !data.name) {
      this.closeEpicModal();
      this.savingEpic = false;
      return;
    }

    this.safeService.updateEpic(this.editingEpic.id, data)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.notif.success('Epic mis à jour');
          this.closeEpicModal();
          this.savingEpic = false;
          this.refreshPortfolio();
        },
        error: () => {
          this.notif.error('Erreur lors de la mise à jour de l\'Epic');
          this.savingEpic = false;
          this.cdr.markForCheck();
        }
      });
  }

  private refreshPortfolio(): void {
    this.safeService.getPortfolio().pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => {
        this.portfolio = data;
        this.sortedObjectives = [...data.piObjectives];
        this.sortedRisks = [...data.risks];
        this.computeGanttRange(data.roadmap);
        this.buildKanban(data.epics);
        this.cdr.markForCheck();
      }
    });
  }
}
