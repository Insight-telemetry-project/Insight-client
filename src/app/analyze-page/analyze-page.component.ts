import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  QueryList,
  ViewChildren,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  GridsterConfig,
  GridsterItem,
  GridType,
  CompactType,
  DisplayGrid,
} from 'angular-gridster2';

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
  styleUrls: ['./analyze-page.component.scss'],
})
export class AnalyzePageComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChildren('miniChart') public miniChartElements!: QueryList<
    ElementRef<HTMLDivElement>
  >;
  @ViewChildren('gridChartEl') public gridChartElements!: QueryList<
    ElementRef<HTMLDivElement>
  >;

  public masterIndex: number = 0;
  public flightData: TelemetrySensorFields[] = [];
  public parameters: string[] = [];
  public selected: Set<string> = new Set<string>();
  public paramSearchText: string = '';

  public sidebarMode: 'related' | 'historical' = 'related';
  public historicalSidebarItems: HistoricalSidebarItem[] = [];
  public historicalSortBy: 'time' | 'score' = 'time';
  public hoveredHistoricalId: string | null = null;

  private pendingParamToAutoSelect: string | null = null;

  public gridOptions: GridsterConfig = {
    gridType: GridType.VerticalFixed,
    fixedRowHeight: 420,
    compactType: CompactType.CompactUp,
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
      ignoreContentClass: 'gridChartBody',
    },
    resizable: { enabled: true },
    pushItems: true,
    swap: false,
  };

  public gridItems: GridChartItem[] = [];

  private subscriptions: Subscription = new Subscription();
  private miniCharts: Map<string, import('highcharts').Chart> = new Map();
  private historicalKeySet: Set<string> = new Set<string>();

  public constructor(
    private readonly route: ActivatedRoute,
    private readonly archiveService: FlightArchiveService,
    private readonly router: Router,
    private readonly chartsService: AnalyzeChartsService,
    private readonly changeDetectorRef: ChangeDetectorRef,
    public readonly related: RelatedParamsService,
  ) {}

  public ngOnInit(): void {
    const routeParamSubscription: Subscription = this.route.paramMap.subscribe((paramMap) => {
      this.masterIndex = Number(paramMap.get('masterIndex'));
      this.selected.clear();
      this.clearGrid();
      this.related.clear();
      this.historicalSidebarItems = [];
      this.historicalKeySet.clear();

      this.miniCharts.forEach((miniChart) => miniChart.destroy());
      this.miniCharts.clear();
      this.paramSearchText = '';
      this.pendingParamToAutoSelect = this.route.snapshot.queryParamMap.get('param');
      this.loadFlight();
    });

    this.subscriptions.add(routeParamSubscription);

    window.addEventListener('historical-hover', (event: any) => {
      this.hoveredHistoricalId = event.detail;
    });
  }

  public ngAfterViewInit(): void {
    window.addEventListener('historical-point-hover', (event: any) => {
      this.hoveredHistoricalId = event.detail;
    });

    window.addEventListener('historical-card-hover', (event: any) => {
      const targetHistoricalId: string | null = event.detail;

      for (const gridItem of this.gridItems) {
        if (!gridItem.chart) continue;

        for (const chartSeries of gridItem.chart.series) {
          if (!(chartSeries.options as any).id?.startsWith('history:')) continue;

          for (const seriesPoint of chartSeries.points) {
            const pointHistoricalId = (seriesPoint.options as any)?.custom?.historicalId;

            if (targetHistoricalId && pointHistoricalId === targetHistoricalId) {
              seriesPoint.setState('hover');
            } else {
              seriesPoint.setState('');
            }
          }
        }
      }
    });
  }

  public ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.clearGrid();
    this.chartsService.destroyMiniCharts(this.miniCharts);
    this.related.clear();
  }

  public get gridHeight(): number {
    if (this.gridItems.length === 0) return 0;
    const rowHeight = (this.gridOptions.fixedRowHeight as number) ?? 420;
    const margin = (this.gridOptions.margin as number) ?? 14;
    const maxRowIndex = Math.max(
      ...this.gridItems.map((gridItem) => (gridItem.y ?? 0) + (gridItem.rows ?? 1)),
    );
    return maxRowIndex * rowHeight + (maxRowIndex + 1) * margin;
  }

  public get sortedHistoricalItems(): HistoricalSidebarItem[] {
    const sidebarItemsCopy: HistoricalSidebarItem[] = [
      ...this.historicalSidebarItems,
    ];
    if (this.historicalSortBy === 'time') {
      return sidebarItemsCopy.sort(
        (firstItem, secondItem) => firstItem.time - secondItem.time,
      );
    }
    return sidebarItemsCopy.sort(
      (firstItem, secondItem) => secondItem.score - firstItem.score,
    );
  }

  public get filteredParameters(): string[] {
    const searchQuery: string = this.paramSearchText.trim().toLowerCase();
    if (searchQuery.length === 0) return this.parameters;
    return this.parameters.filter((parameterName: string) =>
      parameterName.toLowerCase().includes(searchQuery),
    );
  }

  public goBack(): void {
    this.router.navigate(['/']);
  }

  public isSelected(paramName: string): boolean {
    return this.selected.has(paramName);
  }

  public toggleParam(paramName: string): void {
    const wasSelected: boolean = this.selected.has(paramName);

    if (wasSelected) {
      this.removeGridItem(paramName);
      this.selected.delete(paramName);
    } else {
      this.selected.add(paramName);
      this.addGridItem(paramName);
      this.related.openFor(this.masterIndex, paramName, this.subscriptions);
    }

    this.related.relatedOpen = this.selected.size > 0;
  }

  public onRelatedParamClick(paramName: string): void {
    if (this.selected.has(paramName)) {
      this.removeGridItem(paramName);
      this.selected.delete(paramName);
    } else {
      this.selected.add(paramName);
      this.addGridItem(paramName);
    }
  }

  public toggleRelatedList(): void {
    this.related.toggle(this.masterIndex, this.subscriptions);
  }

  public toggleAnomalies(gridChartItem: GridChartItem): void {
    if (!gridChartItem.chart) return;
    gridChartItem.showAnomalies = !gridChartItem.showAnomalies;
    const anomaliesSeries = gridChartItem.chart.series.find(
      (seriesItem: any) => seriesItem.options.id === `anomalies:${gridChartItem.param}`,
    );
    if (anomaliesSeries) {
      gridChartItem.showAnomalies ? anomaliesSeries.show() : anomaliesSeries.hide();
    }
  }

  public toggleHistory(gridChartItem: GridChartItem): void {
    if (!gridChartItem.chart) return;
    gridChartItem.showHistory = !gridChartItem.showHistory;
    const historySeries = gridChartItem.chart.series.find(
      (seriesItem: any) => seriesItem.options.id === `history:${gridChartItem.param}`,
    );
    if (historySeries) {
      gridChartItem.showHistory ? historySeries.show() : historySeries.hide();
    }
  }

  public onParamSearchChange(searchValue: string): void {
    this.paramSearchText = searchValue;
  }

  public clearParamSearch(): void {
    this.paramSearchText = '';
  }

  public navigateToHistoricalFlight(sidebarItem: HistoricalSidebarItem): void {
    this.router.navigate(['/archive', sidebarItem.comparedFlightIndex], {
      queryParams: { param: sidebarItem.param },
    });
  }

  public onHistoricalCardHover(historicalItem: any): void {
    const historicalId: string = historicalItem.comparedFlightIndex + '_' + historicalItem.time;

    this.hoveredHistoricalId = historicalId;

    window.dispatchEvent(
      new CustomEvent('historical-card-hover', { detail: historicalId }),
    );
  }

  public onHistoricalCardLeave(): void {
    this.hoveredHistoricalId = null;

    window.dispatchEvent(
      new CustomEvent('historical-card-hover', { detail: null }),
    );
  }

  public isParamVisible(paramName: string): boolean {
    const searchQuery: string = this.paramSearchText.trim().toLowerCase();
    if (searchQuery.length === 0) return true;
    return paramName.toLowerCase().includes(searchQuery);
  }

  private addGridItem(paramName: string): void {
    const newRowIndex = this.gridItems.length;

    const newGridChartItem: GridChartItem = {
      param: paramName,
      cols: 4,
      rows: 1,
      x: 0,
      y: newRowIndex,
      chart: undefined,
      showAnomalies: true,
      showHistory: true,
    };

    this.gridItems.push(newGridChartItem);
    this.changeDetectorRef.detectChanges();

    setTimeout(() => this.initGridChart(newGridChartItem), 150);
  }

  private removeGridItem(paramName: string): void {
    const gridItemIndex: number = this.gridItems.findIndex(
      (gridItem) => gridItem.param === paramName,
    );
    if (gridItemIndex === -1) return;

    const itemToRemove: GridChartItem = this.gridItems[gridItemIndex];
    if (itemToRemove.chart) {
      itemToRemove.chart.destroy();
      itemToRemove.chart = undefined;
    }

    this.gridItems = this.gridItems.filter(
      (_, currentIndex) => currentIndex !== gridItemIndex,
    );
    this.changeDetectorRef.detectChanges();
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

  private initGridChart(gridChartItem: GridChartItem): void {
    const gridChartElementRef: ElementRef<HTMLDivElement> | undefined =
      this.gridChartElements.find(
        (elementRef) =>
          elementRef.nativeElement.dataset['param'] === gridChartItem.param,
      );

    if (!gridChartElementRef) {
      setTimeout(() => this.initGridChart(gridChartItem), 150);
      return;
    }

    gridChartItem.chart = this.chartsService.createGridChart(
      gridChartElementRef.nativeElement,
      gridChartItem.param,
      this.flightData,
    );

    const chartInstance = gridChartItem.chart;
    setTimeout(() => (chartInstance as any)?.reflow(), 0);

    this.loadAndShowAnomalies(gridChartItem.param, chartInstance);
    this.loadAndShowHistoricalSimilarity(gridChartItem.param, chartInstance);
  }

  private loadFlight(): void {
    const flightSubscription: Subscription = this.archiveService
      .getFlightFields(this.masterIndex)
      .subscribe({
        next: (flightRows: TelemetrySensorFields[]) => {
          const sortedFlightRows: TelemetrySensorFields[] = (flightRows ?? [])
            .slice()
            .sort(
              (firstRow, secondRow) => firstRow.timestep - secondRow.timestep,
            );

          this.flightData = sortedFlightRows;
          this.parameters = Object.keys(this.flightData[0]?.fields ?? {});

          setTimeout(() => {
            this.drawMiniCharts();
            if (this.pendingParamToAutoSelect) {
              const pendingParam = this.pendingParamToAutoSelect;
              this.pendingParamToAutoSelect = null;
              setTimeout(() => this.autoSelectParam(pendingParam), 300);
            }
          });
        },
        error: (error: any) => {
          console.error('Failed to load flight:', error);
          this.flightData = [];
          this.parameters = [];
        },
      });

    this.subscriptions.add(flightSubscription);
  }

  private drawMiniCharts(): void {
    if (this.flightData.length === 0) return;
    if (this.miniCharts.size > 0) return;

    this.miniChartElements.forEach(
      (miniChartElementRef: ElementRef<HTMLDivElement>) => {
        const parameterName: string | undefined =
          miniChartElementRef.nativeElement.dataset['param'];
        if (!parameterName) return;

        const dataPoints: [number, number][] = this.chartsService.buildSeries(
          this.flightData,
          parameterName,
        );

        const miniChartInstance = this.chartsService.createMiniChart(
          miniChartElementRef.nativeElement,
          parameterName,
          dataPoints,
        );
        this.miniCharts.set(parameterName, miniChartInstance);
      },
    );
  }

  private loadAndShowAnomalies(
    paramName: string,
    chart: import('highcharts').Chart,
  ): void {
    const anomaliesSubscription: Subscription = this.archiveService
      .getFlightPointsParam(this.masterIndex, paramName)
      .subscribe({
        next: (anomalyEpochSecondsList: number[]) => {
          const anomalyPoints: [number, number][] =
            this.chartsService.mapAnomalyEpochSecondsToXY(
              this.flightData,
              paramName,
              anomalyEpochSecondsList,
            );
          this.chartsService.addOrReplaceAnomaliesSeries(chart, paramName, anomalyPoints);
        },
        error: (error: any) =>
          console.error('Failed to load anomalies for', paramName, error),
      });

    this.subscriptions.add(anomaliesSubscription);
  }

  private loadAndShowHistoricalSimilarity(
    paramName: string,
    chart: import('highcharts').Chart,
  ): void {
    const historicalSimilaritySubscription: Subscription = this.archiveService
      .getFlightHistoricalSimilarity(this.masterIndex, paramName)
      .subscribe({
        next: (historicalSimilarityPoints: HistoricalSimilarityPoint[]) => {
          const similarityChartPoints: import('highcharts').PointOptionsObject[] =
            this.chartsService.mapHistoricalSimilarityToPoints(
              this.flightData,
              paramName,
              historicalSimilarityPoints,
            );

          this.chartsService.addOrReplaceHistoricalSimilaritySeries(
            chart,
            paramName,
            similarityChartPoints,
          );

          const sidebarItems: HistoricalSidebarItem[] =
            historicalSimilarityPoints.map((historicalSimilarityItem) => {
              const startIndex: number = Number(historicalSimilarityItem.startIndex);
              const endIndex: number = Number(historicalSimilarityItem.endIndex);
              const midpointTime: number = Math.round((startIndex + endIndex) / 2);

              return {
                param: paramName,
                comparedFlightIndex: historicalSimilarityItem.comparedFlightIndex,
                label: historicalSimilarityItem.label,
                score: Number(historicalSimilarityItem.finalScore),
                time: midpointTime,
              };
            });

          for (const sidebarItem of sidebarItems) {
            const uniqueKey: string = `${sidebarItem.param}_${sidebarItem.comparedFlightIndex}_${sidebarItem.time}_${sidebarItem.label}`;

            if (!this.historicalKeySet.has(uniqueKey)) {
              this.historicalKeySet.add(uniqueKey);
              this.historicalSidebarItems.push(sidebarItem);
            }
          }
        },
        error: (error: any) =>
          console.error('Failed to load historical similarity for', paramName, error),
      });

    this.subscriptions.add(historicalSimilaritySubscription);
  }

  private autoSelectParam(paramName: string): void {
    if (!this.parameters.includes(paramName)) return;
    if (!this.selected.has(paramName)) {
      this.toggleParam(paramName);
    }
  }
}