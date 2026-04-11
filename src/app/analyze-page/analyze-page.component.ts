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
  GridType,
  CompactType,
  DisplayGrid,
} from 'angular-gridster2';

import { FlightArchiveService } from '../services/flight-archive.service';
import { TelemetrySensorFields } from '../common/interfaces/telemetry-sensor-fields.interface';
import { AnalyzeChartsService } from './services/analyze-charts.service';
import { AnomaliesService } from './services/anomalies.service';
import { HistoricalSimilarityService } from './services/historical-similarity.service';
import { RelatedParamsService } from './services/related-params.service';
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

  @ViewChildren('historicalMiniChart')
  public historicalMiniChartElements!: QueryList<ElementRef<HTMLDivElement>>;

  public masterIndex: number = 0;
  public flightData: TelemetrySensorFields[] = [];
  public parameters: string[] = [];
  public selected: Set<string> = new Set<string>();
  public paramSearchText: string = '';
  public flightMeta: any;
  public sidebarMode: 'related' | 'historical' = 'related';
  public historicalSortBy: 'time' | 'score' = 'time';
  public hoveredHistoricalId: string | null = null;
  public paramSortBy: 'anomalies' | 'historical' = 'anomalies';
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
  private historicalMiniCharts: Map<string, import('highcharts').Chart> =
    new Map();
  private pendingParamToAutoSelect: string | null = null;
  private sidebarParam: string | null = null;
  public constructor(
    private readonly route: ActivatedRoute,
    private readonly archiveService: FlightArchiveService,
    private readonly router: Router,
    private readonly chartsService: AnalyzeChartsService,
    private readonly anomaliesService: AnomaliesService,
    private readonly changeDetectorRef: ChangeDetectorRef,
    public readonly related: RelatedParamsService,
    public readonly historicalSimilarityService: HistoricalSimilarityService,
  ) {}

  public get historicalSidebarItems(): HistoricalSidebarItem[] {
    return this.historicalSimilarityService.sidebarItems;
  }

  public get gridHeight(): number {
    if (this.gridItems.length === 0) return 0;
    const rowHeight = (this.gridOptions.fixedRowHeight as number) ?? 420;
    const margin = (this.gridOptions.margin as number) ?? 14;
    const maxRowIndex = Math.max(
      ...this.gridItems.map(
        (gridItem) => (gridItem.y ?? 0) + (gridItem.rows ?? 1),
      ),
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

    let filtered: string[] =
      searchQuery.length === 0
        ? this.parameters
        : this.parameters.filter((parameterName: string) =>
            parameterName.toLowerCase().includes(searchQuery),
          );

    return filtered.sort((a: string, b: string) => {
      const aCounts = this.getSpecialPointsCountForParameter(a);
      const bCounts = this.getSpecialPointsCountForParameter(b);

      if (this.paramSortBy === 'historical') {
        return bCounts.historicalCount - aCounts.historicalCount;
      }

      return bCounts.anomalyCount - aCounts.anomalyCount;
    });
  }

  public ngOnInit(): void {
    const routeParamSubscription: Subscription = this.route.paramMap.subscribe(
      (paramMap) => {
        this.masterIndex = Number(paramMap.get('masterIndex'));
        this.selected.clear();
        this.clearGrid();
        this.related.clear();
        this.historicalSimilarityService.reset();

        this.miniCharts.forEach((miniChart) => miniChart.destroy());
        this.miniCharts.clear();
        this.paramSearchText = '';
        this.pendingParamToAutoSelect =
          this.route.snapshot.queryParamMap.get('param');
        this.loadFlight();
      },
    );

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
          if (!(chartSeries.options as any).id?.startsWith('history:'))
            continue;

          for (const seriesPoint of chartSeries.points) {
            const pointHistoricalId = (seriesPoint.options as any)?.custom
              ?.historicalId;

            if (
              targetHistoricalId &&
              pointHistoricalId === targetHistoricalId
            ) {
              seriesPoint.setState('hover');
            } else {
              seriesPoint.setState('');
            }
          }
        }
      }
    });

    setTimeout(() => {
      this.drawHistoricalMiniCharts();
    });

    this.historicalMiniChartElements.changes.subscribe(() => {
      setTimeout(() => {
        this.drawHistoricalMiniCharts();
      });
    });
  }

  public ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.clearGrid();
    this.chartsService.destroyMiniCharts(this.miniCharts);
    this.related.clear();
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

      if (this.sidebarParam === paramName) {
        const remainingParams = Array.from(this.selected);

        if (remainingParams.length > 0) {
          const lastParam = remainingParams[remainingParams.length - 1];
          this.sidebarParam = lastParam;

          this.related.clear();
          this.historicalSimilarityService.reset();

          if (this.sidebarMode === 'related') {
            this.related.openFor(
              this.masterIndex,
              lastParam,
              this.subscriptions,
            );
          }

          if (this.sidebarMode === 'historical') {
            const gridItem = this.gridItems.find((g) => g.param === lastParam);

            if (gridItem && gridItem.chart) {
              this.historicalSimilarityService.loadAndShowHistoricalSimilarity(
                lastParam,
                this.flightData,
                this.flightMeta,
                gridItem.chart,
              );
            }

            setTimeout(() => {
              this.drawHistoricalMiniCharts();
            });
          }
        } else {
          this.sidebarParam = null;
          this.related.clear();
          this.historicalSimilarityService.reset();
        }
      }

      return;
    }

    this.selected.add(paramName);
    this.sidebarParam = paramName;

    this.addGridItem(paramName);

    this.related.clear();
    this.historicalSimilarityService.reset();

    if (this.sidebarMode === 'related') {
      this.related.openFor(this.masterIndex, paramName, this.subscriptions);
    }

    if (this.sidebarMode === 'historical') {
      const gridItem = this.gridItems.find((grid) => grid.param === paramName);

      if (gridItem && gridItem.chart) {
        this.historicalSimilarityService.loadAndShowHistoricalSimilarity(
          paramName,
          this.flightData,
          this.flightMeta,
          gridItem.chart,
        );
      }

      setTimeout(() => {
        this.drawHistoricalMiniCharts();
      });
    }
  }

  public onRelatedParamClick(paramName: string): void {
    if (this.selected.has(paramName)) {
      this.removeGridItem(paramName);
      this.selected.delete(paramName);

      if (this.sidebarParam === paramName) {
        this.sidebarParam = null;

        this.related.clear();
        this.historicalSimilarityService.reset();
      }

      return;
    }

    this.selected.add(paramName);
    this.sidebarParam = paramName;

    this.addGridItem(paramName);

    this.related.clear();
    this.historicalSimilarityService.reset();

    if (this.sidebarMode === 'related') {
      this.related.openFor(this.masterIndex, paramName, this.subscriptions);
    }
  }

  public toggleRelatedList(): void {
    this.related.toggle(this.masterIndex, this.subscriptions);
  }

  public toggleAnomalies(gridChartItem: GridChartItem): void {
    if (!gridChartItem.chart) return;
    gridChartItem.showAnomalies = !gridChartItem.showAnomalies;
    const anomaliesSeries = gridChartItem.chart.series.find(
      (seriesItem: any) =>
        seriesItem.options.id === `anomalies:${gridChartItem.param}`,
    );
    if (anomaliesSeries) {
      gridChartItem.showAnomalies
        ? anomaliesSeries.show()
        : anomaliesSeries.hide();
    }
  }

  public toggleHistory(gridChartItem: GridChartItem): void {
    if (!gridChartItem.chart) return;
    gridChartItem.showHistory = !gridChartItem.showHistory;
    const historySeries = gridChartItem.chart.series.find(
      (seriesItem: any) =>
        seriesItem.options.id === `history:${gridChartItem.param}`,
    );
    if (historySeries) {
      gridChartItem.showHistory ? historySeries.show() : historySeries.hide();
    }
  }

  public onParamSearchChange(searchValue: string): void {
  this.paramSearchText = searchValue;

  setTimeout(() => {
    this.drawMiniCharts();
  });
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
    const historicalId: string =
      historicalItem.comparedFlightIndex + '_' + historicalItem.time;
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
    const newGridChartItem: GridChartItem = {
      param: paramName,
      cols: 4,
      rows: 1,
      x: 0,
      y: this.gridItems.length,
      chart: undefined,
      showAnomalies: true,
      showHistory: true,
    };

    this.gridItems.push(newGridChartItem);
    this.changeDetectorRef.detectChanges();
    setTimeout(() => {
  window.dispatchEvent(new Event('resize'));
}, 50);

    Promise.resolve().then(() => this.initGridChart(newGridChartItem));
  }

  private removeGridItem(paramName: string): void {
  const gridItemIndex: number = this.gridItems.findIndex(
    (gridItem) => gridItem.param === paramName,
  );
  if (gridItemIndex === -1) return;

  const itemToRemove: any = this.gridItems[gridItemIndex];

  if (itemToRemove.resizeObserver) {
    itemToRemove.resizeObserver.disconnect();
  }

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
    requestAnimationFrame(() => this.initGridChart(gridChartItem));
    return;
  }

  const element = gridChartElementRef.nativeElement;

  if (element.offsetHeight === 0 || element.offsetWidth === 0) {
    requestAnimationFrame(() => this.initGridChart(gridChartItem));
    return;
  }

  gridChartItem.chart = this.chartsService.createGridChart(
    element,
    gridChartItem.param,
    this.flightData,
  );

  const chartInstance = gridChartItem.chart;

  const resizeObserver = new ResizeObserver(() => {
    chartInstance.reflow();
  });

  resizeObserver.observe(element);
  (gridChartItem as any).resizeObserver = resizeObserver;

  this.anomaliesService.loadAndShowAnomalies(
    gridChartItem.param,
    this.flightData,
    this.flightMeta,
    chartInstance,
  );

  this.historicalSimilarityService.loadAndShowHistoricalSimilarity(
    gridChartItem.param,
    this.flightData,
    this.flightMeta,
    chartInstance,
  );

  chartInstance.redraw(false);
}

  private loadFlight(): void {
    const metaSub = this.archiveService
      .getFlight(this.masterIndex)
      .subscribe((flightMeta) => {
        this.flightMeta = flightMeta;
      });

    this.subscriptions.add(metaSub);
    const flightSubscription: Subscription = this.archiveService
      .getFlightFields(this.masterIndex)
      .subscribe({
        next: (flightRows: TelemetrySensorFields[]) => {
          this.flightData = (flightRows ?? [])
            .slice()
            .sort(
              (firstRow, secondRow) => firstRow.timestep - secondRow.timestep,
            );

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
    this.loadSpecialPointsCountsForFlight();

    this.subscriptions.add(flightSubscription);
  }

  private drawMiniCharts(): void {
  if (this.flightData.length === 0) return;

  this.miniChartElements.forEach(
    (miniChartElementRef: ElementRef<HTMLDivElement>) => {
      const parameterName =
        miniChartElementRef.nativeElement.dataset['param'];

      if (!parameterName) return;

      if (this.miniCharts.has(parameterName)) {
        return;
      }

      const dataPoints = this.chartsService.buildSeries(
        this.flightData,
        parameterName
      );

      const miniChartInstance = this.chartsService.createMiniChart(
        miniChartElementRef.nativeElement,
        parameterName,
        dataPoints
      );

      this.miniCharts.set(parameterName, miniChartInstance);
    }
  );
}

  private autoSelectParam(paramName: string): void {
    if (!this.parameters.includes(paramName)) return;
    if (!this.selected.has(paramName)) {
      this.toggleParam(paramName);
    }
  }

  private drawHistoricalMiniCharts(): void {
    if (!this.historicalMiniChartElements) return;

    this.historicalMiniChartElements.forEach(
      (elementRef: ElementRef<HTMLDivElement>) => {
        const paramName = elementRef.nativeElement.dataset['param'];
        const timeAttr = elementRef.nativeElement.dataset['time'];
        const flightIndexAttr = elementRef.nativeElement.dataset['flight'];
        const startEpochAttr = elementRef.nativeElement.dataset['start'];
        const endEpochAttr = elementRef.nativeElement.dataset['end'];

        if (!paramName || !flightIndexAttr) return;

        const startEpoch = startEpochAttr ? Number(startEpochAttr) : null;
        const endEpoch = endEpochAttr ? Number(endEpochAttr) : null;
        const chartId = flightIndexAttr + '_' + paramName + '_' + timeAttr;

        let rowsToDisplay = this.flightData;

        if (startEpoch !== null && endEpoch !== null) {
          const padding = (endEpoch - startEpoch) * 0.15;
          rowsToDisplay = this.flightData.filter(
            (row) =>
              row.timestep >= startEpoch - padding &&
              row.timestep <= endEpoch + padding,
          );
        }

        const dataPoints = this.chartsService.buildSeries(
          rowsToDisplay,
          paramName,
        );
        if (this.historicalMiniCharts.has(chartId)) {
  return;
}

const chart = this.chartsService.createMiniChart(
  elementRef.nativeElement,
  paramName,
  dataPoints
);

this.historicalMiniCharts.set(chartId, chart);
      },
    );
  }

  public setSidebarMode(mode: 'related' | 'historical'): void {
    this.sidebarMode = mode;

    if (!this.sidebarParam) return;

    if (mode === 'related') {
      this.related.openFor(
        this.masterIndex,
        this.sidebarParam,
        this.subscriptions,
      );
    }

    if (mode === 'historical') {
      setTimeout(() => {
        this.drawHistoricalMiniCharts();
      });
    }
  }
  private getUniqueHistoricalPointsCount(points: any[]): number {
    if (!points) return 0;

    const uniqueSet: Set<string> = new Set<string>();

    for (const point of points) {
      const key: string = point.comparedFlightIndex + '_' + point.time;

      uniqueSet.add(key);
    }

    return uniqueSet.size;
  }
  public parameterSpecialPointsCountMap = new Map();
  private loadSpecialPointsCountsForFlight(): void {
    this.archiveService
      .getAllSpecialPointsForFlight(this.masterIndex)
      .subscribe((response) => {
        if (!response) return;

        const anomaliesRecord = response.anomalies;
        const historicalRecord = response.historicalSimilarity;

        Object.keys(anomaliesRecord).forEach((parameterName: string) => {
          const anomalyCount: number =
            anomaliesRecord[parameterName]?.length ?? 0;

          const historicalCount: number = this.getUniqueHistoricalPointsCount(
            historicalRecord[parameterName],
          );

          this.parameterSpecialPointsCountMap.set(parameterName, {
            anomalyCount: anomalyCount,
            historicalCount: historicalCount,
          });
        });
      });
  }
  public getSpecialPointsCountForParameter(parameterName: string): {
    anomalyCount: number;
    historicalCount: number;
  } {
    return (
      this.parameterSpecialPointsCountMap.get(parameterName) ?? {
        anomalyCount: 0,
        historicalCount: 0,
      }
    );
  }
  public setParamSort(sortType: 'anomalies' | 'historical'): void {
    this.paramSortBy = sortType;
  }
  public trackByParam(index: number, param: string): string {
  return param;
}
}
