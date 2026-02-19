import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  QueryList,
  ViewChildren
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { GridsterConfig, GridsterItem, GridType, CompactType, DisplayGrid } from 'angular-gridster2';

import { FlightArchiveService } from '../services/flight-archive.service';
import { TelemetrySensorFields } from '../common/interfaces/telemetry-sensor-fields.interface';
import { AnalyzeChartsService } from './services/analyze-charts.service';
import { RelatedParamsService } from './services/related-params.service';
import { HistoricalSimilarityPoint } from '../common/interfaces/historical-similarity-point.interface';
import { HistoricalSidebarItem } from '../common/interfaces/historical-sidebar-item.interface';
import { GridChartItem } from '../common/interfaces/grid-chart-item.interface';

@Component({
  selector: 'app-analyze-page',
  templateUrl: './analyze-page.component.html',
  styleUrls: ['./analyze-page.component.scss']
})
export class AnalyzePageComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChildren('miniChart') public miniChartEls!: QueryList<ElementRef<HTMLDivElement>>;
  @ViewChildren('gridChartEl') public gridChartEls!: QueryList<ElementRef<HTMLDivElement>>;

  public masterIndex: number = 0;
  public flightData: TelemetrySensorFields[] = [];
  public parameters: string[] = [];
  public selected: Set<string> = new Set<string>();
  public paramSearchText: string = '';

  public sidebarMode: 'related' | 'historical' = 'related';
  public historicalSidebarItems: HistoricalSidebarItem[] = [];
  public historicalSortBy: 'time' | 'score' = 'time';

  public gridOptions: GridsterConfig = {
    gridType: GridType.VerticalFixed,
    fixedRowHeight: 420,
    compactType: CompactType.None,
    displayGrid: DisplayGrid.OnDragAndResize,
    defaultItemCols: 4,
    defaultItemRows: 1,
    minCols: 4,
    maxCols: 4,
    minRows: 1,
    margin: 14,
    outerMargin: true,
    draggable: { enabled: true },
    resizable: { enabled: true },
    pushItems: false,
    swap: false,
    itemChangeCallback: (item: GridsterItem) => {
      const gridItem = item as GridChartItem;
      if (gridItem.chart) {
        setTimeout(() => (gridItem.chart as any).reflow(), 300);
      }
    },
    itemResizeCallback: (item: GridsterItem) => {
      const gridItem = item as GridChartItem;
      if (gridItem.chart) {
        setTimeout(() => (gridItem.chart as any).reflow(), 50);
      }
    }
  };

  public gridItems: GridChartItem[] = [];

  private subs: Subscription = new Subscription();
  private miniCharts: Map<string, import('highcharts').Chart> = new Map();

  public constructor(
    private readonly route: ActivatedRoute,
    private readonly archiveService: FlightArchiveService,
    private readonly router: Router,
    private readonly charts: AnalyzeChartsService,
    private readonly cdr: ChangeDetectorRef,
    public readonly related: RelatedParamsService
  ) {}

  public ngOnInit(): void {
    const sub: Subscription = this.route.paramMap.subscribe((params) => {
      this.masterIndex = Number(params.get('masterIndex'));
      this.selected.clear();
      this.clearGrid();
      this.related.clear();
      this.loadFlight();
      this.paramSearchText = '';
    });
    this.subs.add(sub);
  }

  public ngAfterViewInit(): void {}

  public ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.clearGrid();
    this.charts.destroyMiniCharts(this.miniCharts);
    this.related.clear();
  }

  public get gridHeight(): number {
    const count = this.gridItems.length;
    if (count === 0) return 0;
    const rowHeight = (this.gridOptions.fixedRowHeight as number) ?? 420;
    const margin = (this.gridOptions.margin as number) ?? 14;
    return count * rowHeight + (count + 1) * margin;
  }

  public get sortedHistoricalItems(): HistoricalSidebarItem[] {
    const items: HistoricalSidebarItem[] = [...this.historicalSidebarItems];
    if (this.historicalSortBy === 'time') {
      return items.sort((a, b) => a.time - b.time);
    }
    return items.sort((a, b) => b.score - a.score);
  }

  public get filteredParameters(): string[] {
    const query: string = this.paramSearchText.trim().toLowerCase();
    if (query.length === 0) return this.parameters;
    return this.parameters.filter((p: string) => p.toLowerCase().includes(query));
  }

  public goBack(): void {
    this.router.navigate(['/']);
  }

  public isSelected(param: string): boolean {
    return this.selected.has(param);
  }

  public toggleParam(param: string): void {
    const wasSelected: boolean = this.selected.has(param);

    if (wasSelected) {
      this.removeGridItem(param);
      this.selected.delete(param);
    } else {
      this.selected.add(param);
      this.addGridItem(param);
      this.related.openFor(this.masterIndex, param, this.subs);
    }

    this.related.relatedOpen = this.selected.size > 0;
  }

  public onRelatedParamClick(param: string): void {
    if (this.selected.has(param)) {
      this.removeGridItem(param);
      this.selected.delete(param);
    } else {
      this.selected.add(param);
      this.addGridItem(param);
    }
  }

  public toggleRelatedList(): void {
    this.related.toggle(this.masterIndex, this.subs);
  }

  public toggleAnomalies(item: GridChartItem): void {
    if (!item.chart) return;
    item.showAnomalies = !item.showAnomalies;
    const s = item.chart.series.find((s: any) => s.options.id === `anomalies:${item.param}`);
    if (s) { item.showAnomalies ? s.show() : s.hide(); }
  }

  public toggleHistory(item: GridChartItem): void {
    if (!item.chart) return;
    item.showHistory = !item.showHistory;
    const s = item.chart.series.find((s: any) => s.options.id === `history:${item.param}`);
    if (s) { item.showHistory ? s.show() : s.hide(); }
  }

  public onParamSearchChange(value: string): void {
    this.paramSearchText = value;
  }

  public clearParamSearch(): void {
    this.paramSearchText = '';
  }

  private addGridItem(param: string): void {
    const row = this.gridItems.length;

    const item: GridChartItem = {
      param,
      cols: 4,
      rows: 1,
      x: 0,
      y: row,
      chart: undefined,
      showAnomalies: true,
      showHistory: true
    };

    this.gridItems.push(item);
    this.cdr.detectChanges();

    setTimeout(() => this.initGridChart(item), 150);
  }

  private removeGridItem(param: string): void {
    const idx: number = this.gridItems.findIndex((i) => i.param === param);
    if (idx === -1) return;

    const item: GridChartItem = this.gridItems[idx];
    if (item.chart) {
      item.chart.destroy();
      item.chart = undefined;
    }

    this.gridItems.splice(idx, 1);

    this.gridItems.forEach((it, i) => {
      it.y = i;
    });

    this.cdr.detectChanges();
  }

  private clearGrid(): void {
    for (const item of this.gridItems) {
      if (item.chart) {
        item.chart.destroy();
        item.chart = undefined;
      }
    }
    this.gridItems = [];
  }

  private initGridChart(item: GridChartItem): void {
    const ref: ElementRef<HTMLDivElement> | undefined =
      this.gridChartEls.find(
        (el) => el.nativeElement.dataset['param'] === item.param
      );

    if (!ref) {
      setTimeout(() => this.initGridChart(item), 150);
      return;
    }

    item.chart = this.charts.createGridChart(
      ref.nativeElement,
      item.param,
      this.flightData
    );

    const chart = item.chart;
    setTimeout(() => (chart as any)?.reflow(), 0);

    this.loadAndShowAnomalies(item.param, chart);
    this.loadAndShowHistoricalSimilarity(item.param, chart);
  }

  private loadFlight(): void {
    const sub: Subscription =
      this.archiveService.getFlightFields(this.masterIndex).subscribe({
        next: (rows: TelemetrySensorFields[]) => {
          const sortedRows: TelemetrySensorFields[] = (rows ?? [])
            .slice()
            .sort((a, b) => a.timestep - b.timestep);

          this.flightData = sortedRows;
          this.parameters = Object.keys(this.flightData[0]?.fields ?? {});

          setTimeout(() => this.drawMiniCharts());
        },
        error: (err: any) => {
          console.error('Failed to load flight:', err);
          this.flightData = [];
          this.parameters = [];
        }
      });

    this.subs.add(sub);
  }

  private drawMiniCharts(): void {
    if (this.flightData.length === 0) return;
    if (this.miniCharts.size > 0) return;

    this.miniChartEls.forEach((ref: ElementRef<HTMLDivElement>) => {
      const param: string | undefined = ref.nativeElement.dataset['param'];
      if (!param) return;

      const dataPoints: [number, number][] =
        this.charts.buildSeries(this.flightData, param);

      const chart = this.charts.createMiniChart(ref.nativeElement, param, dataPoints);
      this.miniCharts.set(param, chart);
    });
  }

  private loadAndShowAnomalies(param: string, chart: import('highcharts').Chart): void {
    const sub: Subscription =
      this.archiveService.getFlightPointsParam(this.masterIndex, param).subscribe({
        next: (anomalyTimes: number[]) => {
          const points: [number, number][] =
            this.charts.mapAnomalyEpochSecondsToXY(this.flightData, param, anomalyTimes);
          this.charts.addOrReplaceAnomaliesSeries(chart, param, points);
        },
        error: (err: any) => console.error('Failed to load anomalies for', param, err)
      });

    this.subs.add(sub);
  }

  private loadAndShowHistoricalSimilarity(
    param: string,
    chart: import('highcharts').Chart
  ): void {
    const sub: Subscription =
      this.archiveService.getFlightHistoricalSimilarity(this.masterIndex, param).subscribe({
        next: (items: HistoricalSimilarityPoint[]) => {
          const points: import('highcharts').PointOptionsObject[] =
            this.charts.mapHistoricalSimilarityToPoints(this.flightData, param, items);

          this.charts.addOrReplaceHistoricalSimilaritySeries(chart, param, points);

          const sidebarItems: HistoricalSidebarItem[] = items.map((item) => {
            const start: number = Number(item.startIndex);
            const end: number = Number(item.endIndex);
            const t: number = Math.round((start + end) / 2);
            return {
              param,
              comparedFlightIndex: item.comparedFlightIndex,
              label: item.label,
              score: Number(item.finalScore),
              time: t
            };
          });

          this.historicalSidebarItems.push(...sidebarItems);
        },
        error: (err: any) =>
          console.error('Failed to load historical similarity for', param, err)
      });

    this.subs.add(sub);
  }
}