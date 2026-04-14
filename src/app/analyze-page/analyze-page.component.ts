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
import { HistoricalGroupItem } from '../common/interfaces/historical-groupItem.interface';

interface FlightMetadata {
  [key: string]: unknown;
}

interface SpecialPointsCountMap {
  anomalyCount: number;
  historicalCount: number;
}

interface SpecialPointsResponse {
  anomalies: Record<string, number[]>;
  historicalSimilarity: Record<string, Array<{ anomalyTime: number }>>;
}

interface CustomEventDetail {
  detail: string | null;
}

interface HistoricalHoverEventDetail {
  anomalyTime: string | null;
}

interface SeriesWithId {
  options: Record<string, unknown> & { id?: string };
  show(): void;
  hide(): void;
}

interface PointWithCustom {
  options: Record<string, unknown>;
  setState(state: string): void;
}

interface GridItemWithObserver extends GridChartItem {
  resizeObserver?: ResizeObserver;
}

type SidebarModeType = 'related' | 'historical';

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
  public flightMeta: FlightMetadata | null = null;
  public sidebarMode: SidebarModeType = 'related';
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

  private cachedGroupedHistoricalItems: HistoricalGroupItem[] = [];
  private lastHistoricalSortBy: 'time' | 'score' = 'time';
  public parameterSpecialPointsCountMap: Map<string, SpecialPointsCountMap> =
    new Map();
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

    window.addEventListener('historical-hover', (event: Event) => {
      const customEvent = event as CustomEvent<string | null>;
      this.hoveredHistoricalId = customEvent.detail;
    });
  }

  public ngAfterViewInit(): void {
    window.addEventListener('historical-point-hover', (event: Event) => {
      const customEvent = event as CustomEvent<HistoricalHoverEventDetail>;
      this.onHistoricalHover(customEvent.detail?.anomalyTime ?? null);
    });

    window.addEventListener('historical-card-hover', (event: Event) => {
      const customEvent = event as CustomEvent<string | null>;
      const targetId: string | null = customEvent.detail;
      const anomalyTime: string | null = targetId
        ? targetId.split('_').slice(1).join('_')
        : null;
      this.onHistoricalHover(anomalyTime);
    });

    setTimeout(() => {
      this.cachedGroupedHistoricalItems = [];
      this.drawHistoricalMiniCharts();
    });

    this.historicalMiniChartElements.changes.subscribe(() => {
      this.drawHistoricalMiniCharts();
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

          const gridItem = this.gridItems.find((g) => g.param === lastParam);

          if (gridItem && gridItem.chart) {
            this.historicalSimilarityService.loadAndShowHistoricalSimilarity(
              lastParam,
              this.flightData,
              this.flightMeta,
              gridItem.chart,
            );
          }

          this.drawHistoricalMiniCharts();
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
      (seriesItem: unknown) => {
        const seriesWithId = seriesItem as SeriesWithId;
        return seriesWithId.options?.id === `anomalies:${gridChartItem.param}`;
      },
    );
    if (anomaliesSeries) {
      const series = anomaliesSeries as unknown as SeriesWithId;
      gridChartItem.showAnomalies ? series.show() : series.hide();
    }
  }

  public toggleHistory(gridChartItem: GridChartItem): void {
    if (!gridChartItem.chart) return;
    gridChartItem.showHistory = !gridChartItem.showHistory;
    const historySeries = gridChartItem.chart.series.find(
      (seriesItem: unknown) => {
        const seriesWithId = seriesItem as SeriesWithId;
        return seriesWithId.options?.id === `history:${gridChartItem.param}`;
      },
    );
    if (historySeries) {
      const series = historySeries as unknown as SeriesWithId;
      gridChartItem.showHistory ? series.show() : series.hide();
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

  public onHistoricalCardHover(historicalItem: HistoricalSidebarItem): void {
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

    const itemToRemove: GridItemWithObserver = this.gridItems[
      gridItemIndex
    ] as GridItemWithObserver;

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
    (gridChartItem as GridItemWithObserver).resizeObserver = resizeObserver;

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
      .subscribe((flightMetadata: FlightMetadata) => {
        this.flightMeta = flightMetadata;
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
        error: (errorData: unknown) => {
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

  private autoSelectParam(paramName: string): void {
    if (!this.parameters.includes(paramName)) return;
    if (!this.selected.has(paramName)) {
      this.toggleParam(paramName);
    }
  }

  private drawHistoricalMiniCharts(): void {
    this.cachedGroupedHistoricalItems = [];
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
          const existingChart = this.historicalMiniCharts.get(chartId);

          if (existingChart) {
            existingChart.destroy();
          }

          this.historicalMiniCharts.delete(chartId);
        }

        const chart = this.chartsService.createMiniChart(
          elementRef.nativeElement,
          paramName,
          dataPoints,
        );

        this.historicalMiniCharts.set(chartId, chart);
      },
    );
  }

  public setSidebarMode(mode: SidebarModeType): void {
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
      this.drawHistoricalMiniCharts();
    }
  }

  private loadSpecialPointsCountsForFlight(): void {
    this.archiveService
      .getAllSpecialPointsForFlight(this.masterIndex)
      .subscribe((response: SpecialPointsResponse | null) => {
        if (!response) return;

        const anomaliesRecord = response.anomalies;
        const historicalRecord = response.historicalSimilarity;

        Object.keys(anomaliesRecord).forEach((parameterName: string) => {
          const anomalyCount: number =
            anomaliesRecord[parameterName]?.length ?? 0;

          const historicalCount: number =
            this.historicalSimilarityService.getUniqueHistoricalCount(
              historicalRecord[parameterName],
            );
          this.parameterSpecialPointsCountMap.set(parameterName, {
            anomalyCount: anomalyCount,
            historicalCount: historicalCount,
          });
        });
      });
  }

  public getSpecialPointsCountForParameter(
    parameterName: string,
  ): SpecialPointsCountMap {
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

  private onHistoricalHover(anomalyTime: string | null): void {
this.hoveredHistoricalId = anomalyTime ? '_' + anomalyTime : null;    const container = document.querySelector('.sidebarContent') as HTMLElement;

    if (anomalyTime && container) {
      const matchedCards = (
        Array.from(
          document.querySelectorAll('.historicalCardNew[data-id]'),
        ) as HTMLElement[]
      ).filter(
        (cardElement) =>
          cardElement.getAttribute('data-id')?.split('_').slice(1).join('_') ===
          anomalyTime,
      );

      matchedCards.forEach((cardElement, cardIndex) => {
        cardElement.classList.add('hovered');
        if (cardIndex === 0) {
          const containerRect = container.getBoundingClientRect();
          const elementRect = cardElement.getBoundingClientRect();
          const isVisible =
            elementRect.top >= containerRect.top &&
            elementRect.bottom <= containerRect.bottom;
          if (!isVisible) {
            container.scrollTo({
              top:
                container.scrollTop +
                elementRect.top -
                containerRect.top -
                container.clientHeight / 2 +
                cardElement.clientHeight / 2,
              behavior: 'smooth',
            });
          }
        }
      });
    } else {
      document
        .querySelectorAll('.historicalCardNew.hovered')
        .forEach((cardElement) => cardElement.classList.remove('hovered'));
    }

    for (const gridItem of this.gridItems) {
      const chartInstance = gridItem.chart;
      if (!chartInstance) continue;

      for (const series of chartInstance.series) {
        const seriesId = (series.options as any)?.id;

        if (!seriesId || !seriesId.startsWith('history:')) continue;

        for (const point of series.points as any[]) {
          const historicalId = point?.options?.custom?.historicalId;

          const pointTime = historicalId
            ? historicalId.split('_').slice(1).join('_')
            : null;

          if (anomalyTime && pointTime === anomalyTime) {
            point.setState('hover');
          } else {
            point.setState('');
          }
        }
      }
    }
  }

  public expandedGroups: Set<string> = new Set<string>();

  public get groupedHistoricalItems(): HistoricalGroupItem[] {
    if (
      this.lastHistoricalSortBy !== this.historicalSortBy ||
      this.cachedGroupedHistoricalItems.length === 0
    ) {
      this.lastHistoricalSortBy = this.historicalSortBy;
      const historicalItemsByTime = new Map<string, HistoricalSidebarItem[]>();

      for (const historicalItem of this.sortedHistoricalItems) {
        const timeKey: string = String(historicalItem.time);
        if (!historicalItemsByTime.has(timeKey)) {
          historicalItemsByTime.set(timeKey, []);
        }
        historicalItemsByTime.get(timeKey)!.push(historicalItem);
      }

      this.cachedGroupedHistoricalItems = Array.from(
        historicalItemsByTime.entries(),
      ).map(([timeKey, groupItems]: [string, HistoricalSidebarItem[]]) => ({
        id: timeKey,
        items: groupItems,
      }));
    }
    return this.cachedGroupedHistoricalItems;
  }

  public toggleGroup(groupId: string): void {
    if (this.expandedGroups.has(groupId)) {
      this.expandedGroups.delete(groupId);
    } else {
      this.expandedGroups.add(groupId);
    }
    this.changeDetectorRef.detectChanges();
  }

  public trackByGroupId(
    index: number,
    historicalGroupItem: HistoricalGroupItem,
  ): string {
    return historicalGroupItem.id;
  }
}
