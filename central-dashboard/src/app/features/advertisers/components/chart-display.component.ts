import { Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart } from 'chart.js';
import { TranslateModule } from '@ngx-translate/core';

import {
  AnalyticsSummary,
  DailyTrend,
  Distribution,
  KpisResponse,
  SitePerformance,
  VideoPerformance
} from '../models/analytics.models';
import { ChartDisplayChartService } from './chart-display-chart.service';
import { ChartDisplayKpiService } from './chart-display-kpi.service';

@Component({
  selector: 'app-chart-display',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './chart-display.component.html',
  styleUrls: ['./chart-display.component.scss']
})
export class ChartDisplayComponent implements OnChanges, OnDestroy {
  @ViewChild('trendsChart') trendsChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('periodChart') periodChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('eventChart') eventChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('peakHoursChart') peakHoursChartRef!: ElementRef<HTMLCanvasElement>;

  @Input() summary!: AnalyticsSummary;
  @Input() kpisData: KpisResponse | null = null;
  @Input() topVideos: VideoPerformance[] = [];
  @Input() topSites: SitePerformance[] = [];
  @Input() dailyTrends: DailyTrend[] = [];
  @Input() periodDistribution: Distribution[] = [];
  @Input() eventDistribution: Distribution[] = [];

  private trendsChartInstance: Chart | null = null;
  private periodChartInstance: Chart | null = null;
  private eventChartInstance: Chart | null = null;
  private peakHoursChartInstance: Chart | null = null;

  constructor(
    public kpiService: ChartDisplayKpiService,
    private chartService: ChartDisplayChartService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['dailyTrends'] || changes['periodDistribution'] || changes['eventDistribution']) {
      setTimeout(() => this.renderCharts(), 100);
    }
    if (changes['kpisData']) {
      setTimeout(() => this.renderPeakHoursChart(), 150);
    }
  }

  ngOnDestroy(): void {
    this.destroyChart(this.trendsChartInstance);
    this.destroyChart(this.periodChartInstance);
    this.destroyChart(this.eventChartInstance);
    this.destroyChart(this.peakHoursChartInstance);
  }

  private renderCharts(): void {
    this.trendsChartInstance = this.rebuildChart(
      this.trendsChartInstance,
      this.trendsChartRef,
      () => this.chartService.renderTrendsChart(this.trendsChartRef.nativeElement, this.dailyTrends)
    );

    this.periodChartInstance = this.rebuildChart(
      this.periodChartInstance,
      this.periodChartRef,
      () => this.chartService.renderPeriodChart(this.periodChartRef.nativeElement, this.periodDistribution)
    );

    this.eventChartInstance = this.rebuildChart(
      this.eventChartInstance,
      this.eventChartRef,
      () => this.chartService.renderEventChart(this.eventChartRef.nativeElement, this.eventDistribution)
    );
  }

  private renderPeakHoursChart(): void {
    if (!this.peakHoursChartRef || !this.kpisData?.peak_hours?.hourly_heatmap) return;

    this.destroyChart(this.peakHoursChartInstance);
    this.peakHoursChartInstance = this.chartService.renderPeakHoursChart(
      this.peakHoursChartRef.nativeElement,
      this.kpisData.peak_hours.hourly_heatmap
    );
  }

  private rebuildChart(
    existing: Chart | null,
    ref: ElementRef<HTMLCanvasElement> | undefined,
    factory: () => Chart | null
  ): Chart | null {
    if (!ref) return existing;
    this.destroyChart(existing);
    return factory();
  }

  private destroyChart(chart: Chart | null): void {
    if (chart) {
      chart.destroy();
    }
  }
}
