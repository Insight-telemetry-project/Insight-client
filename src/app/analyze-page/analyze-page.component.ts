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
    draggable: {
      enabled: true,
      dragHandleClass: 'gridChartHeader',
      ignoreContentClass: 'gridChartBody'
    },
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
    if (this.gridItems.length === 0) return 0;
    const rowHeight = (this.gridOptions.fixedRowHeight as number) ?? 420;
    const margin = (this.gridOptions.margin as number) ?? 14;
    const maxRow = Math.max(...this.gridItems.map(item => (item.y ?? 0) + (item.rows ?? 1)));
    return maxRow * rowHeight + (maxRow + 1) * margin;
  }

  public get sortedHistoricalItems(): HistoricalSidebarItem[] {
    const sidebarItemsCopy: HistoricalSidebarItem[] = [...this.historicalSidebarItems];
    if (this.historicalSortBy === 'time') {
      return sidebarItemsCopy.sort((firstItem, secondItem) => firstItem.time - secondItem.time);
    }
    return sidebarItemsCopy.sort((firstItem, secondItem) => secondItem.score - firstItem.score);
  }

  public get filteredParameters(): string[] {
    const searchQuery: string = this.paramSearchText.trim().toLowerCase();
    if (searchQuery.length === 0) return this.parameters;
    return this.parameters.filter((parameterName: string) => parameterName.toLowerCase().includes(searchQuery));
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
    const anomalySeries = item.chart.series.find((seriesItem: any) => seriesItem.options.id === `anomalies:${item.param}`);
    if (anomalySeries) { item.showAnomalies ? anomalySeries.show() : anomalySeries.hide(); }
  }

  public toggleHistory(item: GridChartItem): void {
    if (!item.chart) return;
    item.showHistory = !item.showHistory;
    const historySeries = item.chart.series.find((seriesItem: any) => seriesItem.options.id === `history:${item.param}`);
    if (historySeries) { item.showHistory ? historySeries.show() : historySeries.hide(); }
  }

  public onParamSearchChange(value: string): void {
    this.paramSearchText = value;
  }

  public clearParamSearch(): void {
    this.paramSearchText = '';
  }

  private addGridItem(param: string): void {
    const gridRowIndex = this.gridItems.length;

    const newGridChartItem: GridChartItem = {
      param,
      cols: 4,
      rows: 1,
      x: 0,
      y: gridRowIndex,
      chart: undefined,
      showAnomalies: true,
      showHistory: true
    };

    this.gridItems.push(newGridChartItem);
    this.cdr.detectChanges();

    setTimeout(() => this.initGridChart(newGridChartItem), 150);
  }

  private removeGridItem(param: string): void {
    const gridItemIndex: number = this.gridItems.findIndex((gridItem) => gridItem.param === param);
    if (gridItemIndex === -1) return;

    const itemToRemove: GridChartItem = this.gridItems[gridItemIndex];
    if (itemToRemove.chart) {
      itemToRemove.chart.destroy();
      itemToRemove.chart = undefined;
    }

    this.gridItems = this.gridItems.filter((_, currentIndex) => currentIndex !== gridItemIndex);
    this.cdr.detectChanges();
  }

  private clearGrid(): void {
    for (const gridItem of this.gridItems) {
      if (gridItem.chart) {
        gridItem.chart.destroy();
        gridItem.chart = undefined;
      }
    }
    this.gridItems = [];
  }

  private initGridChart(item: GridChartItem): void {
    const gridChartElementRef: ElementRef<HTMLDivElement> | undefined =
      this.gridChartEls.find(
        (elementRef) => elementRef.nativeElement.dataset['param'] === item.param
      );

    if (!gridChartElementRef) {
      setTimeout(() => this.initGridChart(item), 150);
      return;
    }

    item.chart = this.charts.createGridChart(
      gridChartElementRef.nativeElement,
      item.param,
      this.flightData
    );

    const chartInstance = item.chart;
    setTimeout(() => (chartInstance as any)?.reflow(), 0);

    this.loadAndShowAnomalies(item.param, chartInstance);
    this.loadAndShowHistoricalSimilarity(item.param, chartInstance);
  }

  private loadFlight(): void {
    const sub: Subscription =
      this.archiveService.getFlightFields(this.masterIndex).subscribe({
        next: (flightRows: TelemetrySensorFields[]) => {
          const sortedFlightRows: TelemetrySensorFields[] = (flightRows ?? [])
            .slice()
            .sort((firstRow, secondRow) => firstRow.timestep - secondRow.timestep);

          this.flightData = sortedFlightRows;
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

    this.miniChartEls.forEach((miniChartElementRef: ElementRef<HTMLDivElement>) => {
      const parameterName: string | undefined = miniChartElementRef.nativeElement.dataset['param'];
      if (!parameterName) return;

      const dataPoints: [number, number][] =
        this.charts.buildSeries(this.flightData, parameterName);

      const miniChartInstance = this.charts.createMiniChart(miniChartElementRef.nativeElement, parameterName, dataPoints);
      this.miniCharts.set(parameterName, miniChartInstance);
    });
  }

  private loadAndShowAnomalies(param: string, chart: import('highcharts').Chart): void {
    const anomaliesSubscription: Subscription =
      this.archiveService.getFlightPointsParam(this.masterIndex, param).subscribe({
        next: (anomalyEpochSecondsList: number[]) => {
          const anomalyPoints: [number, number][] =
            this.charts.mapAnomalyEpochSecondsToXY(this.flightData, param, anomalyEpochSecondsList);
          this.charts.addOrReplaceAnomaliesSeries(chart, param, anomalyPoints);
        },
        error: (error: any) => console.error('Failed to load anomalies for', param, error)
      });

    this.subs.add(anomaliesSubscription);
  }

  private loadAndShowHistoricalSimilarity(
    param: string,
    chart: import('highcharts').Chart
  ): void {
    const historicalSimilaritySubscription: Subscription =
      this.archiveService.getFlightHistoricalSimilarity(this.masterIndex, param).subscribe({
        next: (historicalSimilarityPoints: HistoricalSimilarityPoint[]) => {
          const similarityChartPoints: import('highcharts').PointOptionsObject[] =
            this.charts.mapHistoricalSimilarityToPoints(this.flightData, param, historicalSimilarityPoints);

          this.charts.addOrReplaceHistoricalSimilaritySeries(chart, param, similarityChartPoints);

          const sidebarItems: HistoricalSidebarItem[] = historicalSimilarityPoints.map((historicalSimilarityItem) => {
            const startIndex: number = Number(historicalSimilarityItem.startIndex);
            const endIndex: number = Number(historicalSimilarityItem.endIndex);
            const similarityTime: number = Math.round((startIndex + endIndex) / 2);
            return {
              param,
              comparedFlightIndex: historicalSimilarityItem.comparedFlightIndex,
              label: historicalSimilarityItem.label,
              score: Number(historicalSimilarityItem.finalScore),
              time: similarityTime
            };
          });

          this.historicalSidebarItems.push(...sidebarItems);
        },
        error: (error: any) =>
          console.error('Failed to load historical similarity for', param, error)
      });

    this.subs.add(historicalSimilaritySubscription);
  }
}