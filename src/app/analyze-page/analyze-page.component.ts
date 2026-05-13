import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
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
import { SelectedPoint } from '../common/interfaces/selected-point .interface';
import { FlightMetadata } from '../common/interfaces/flight-metadata.interface';
import { SpecialPointsCountMap } from '../common/interfaces/special-points-count-map.interface';
import { SpecialPointsResponse } from '../common/interfaces/special-points-response.interface';
import { HistoricalHoverEventDetail } from '../common/interfaces/historical-hover-event-detail.interface';
import { SeriesWithId } from '../common/interfaces/series-with-id.interface';
import { GridItemWithObserver } from '../common/interfaces/grid-item-with-observer.interface';
import { SidebarModeType } from '../common/interfaces/analyze-page.types';
import { Investigation } from '../common/interfaces/investigation.interface';

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
  public selectedPoint: SelectedPoint | null = null;
  public modalPoint: SelectedPoint | null = null;
  public hoveredHistoricalId: string | null = null;
  public flightInvestigations: Map<string, Investigation> = new Map();
  private comparedFlightInvestigations: Map<number, Investigation[]> =
    new Map();
  private loadedComparedFlightIds: Set<number> = new Set();
  private comparedFlightHistoricalLinks: Map<string, number> = new Map();
  private loadedHistoricalLinksKeys: Set<string> = new Set();
  public showInvestigationModal: boolean = false;
  public investigationName: string = '';
  public investigationDescription: string = '';
  public investigationSaving: boolean = false;
  public showInvestigationReport: boolean = false;
  public currentReport: Investigation | null = null;
  public isOwnInvestigation: boolean = false;
  public isEditingInvestigation: boolean = false;
  public editingName: string = '';
  public editingDescription: string = '';
  public investigationDeleting: boolean = false;
  public zoomedParams: Set<string> = new Set();
  public syncingParam: string | null = null;
  private zoomedExtremesMap: Map<string, { min: number; max: number }> =
    new Map();
  private isSyncing = false;
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
  public expandedGroups: Set<string> = new Set<string>();
  public parameterSpecialPointsCountMap: Map<string, SpecialPointsCountMap> =
    new Map();

  private subscriptions: Subscription = new Subscription();
  private miniCharts: Map<string, import('highcharts').Chart> = new Map();
  private historicalMiniCharts: Map<string, import('highcharts').Chart> =
    new Map();
  private comparedFlightDataCache: Map<number, TelemetrySensorFields[]> =
    new Map();
  private pendingParamToAutoSelect: string | null = null;
  private pendingHighlight: {
    param: string;
    sourceFlightIndex: number;
    label: string;
  } | null = null;
  private sidebarParam: string | null = null;
  private cachedGroupedHistoricalItems: HistoricalGroupItem[] = [];
  private lastHistoricalSortBy: 'time' | 'score' = 'time';

  public constructor(
    private readonly route: ActivatedRoute,
    private readonly archiveService: FlightArchiveService,
    private readonly router: Router,
    private readonly chartsService: AnalyzeChartsService,
    private readonly anomaliesService: AnomaliesService,
    private readonly changeDetectorRef: ChangeDetectorRef,
    private readonly ngZone: NgZone,
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
    return this.historicalSimilarityService.buildSortedSidebarItems(
      this.historicalSortBy,
    );
  }

  public filteredParameters: string[] = [];

  private rebuildFilteredParameters(): void {
    const searchQuery: string = this.paramSearchText.trim().toLowerCase();

    const filtered: string[] =
      searchQuery.length === 0
        ? this.parameters.slice()
        : this.parameters.filter((parameterName: string) =>
            parameterName.toLowerCase().includes(searchQuery),
          );

    this.filteredParameters = filtered.sort((a: string, b: string) => {
      const aCounts = this.getSpecialPointsCountForParameter(a);
      const bCounts = this.getSpecialPointsCountForParameter(b);

      if (this.paramSortBy === 'historical') {
        return bCounts.historicalCount - aCounts.historicalCount;
      }

      return bCounts.anomalyCount - aCounts.anomalyCount;
    });
  }

  public get groupedHistoricalItems(): HistoricalGroupItem[] {
    if (
      this.lastHistoricalSortBy !== this.historicalSortBy ||
      this.cachedGroupedHistoricalItems.length === 0
    ) {
      this.lastHistoricalSortBy = this.historicalSortBy;
      this.cachedGroupedHistoricalItems =
        this.historicalSimilarityService.buildGroupedHistoricalItems(
          this.sortedHistoricalItems,
        );
    }
    return this.cachedGroupedHistoricalItems;
  }

  public ngOnInit(): void {
    const routeParamSubscription: Subscription = this.route.paramMap.subscribe(
      (paramMap) => {
        this.masterIndex = Number(paramMap.get('masterIndex'));
        this.selected.clear();
        this.clearGrid();
        this.related.clear();
        this.sidebarParam = null;
        this.sidebarMode = 'related';
        this.historicalSimilarityService.reset();
        this.cachedGroupedHistoricalItems = [];
        this.resetHistoricalLinks();
        this.miniCharts.forEach((miniChart) => miniChart.destroy());
        this.miniCharts.clear();
        this.chartsService.destroyMiniCharts(this.historicalMiniCharts);
        this.comparedFlightDataCache.clear();
        this.paramSearchText = '';
        const queryParamMap = this.route.snapshot.queryParamMap;
        this.pendingParamToAutoSelect = queryParamMap.get('param');

        const sourceFlightIndexParam = queryParamMap.get('sourceFlightIndex');
        const labelParam = queryParamMap.get('label');

        if (
          this.pendingParamToAutoSelect &&
          sourceFlightIndexParam &&
          labelParam
        ) {
          this.pendingHighlight = {
            param: this.pendingParamToAutoSelect,
            sourceFlightIndex: Number(sourceFlightIndexParam),
            label: labelParam,
          };
        } else {
          this.pendingHighlight = null;
        }

        this.loadFlight();
        this.loadInvestigations();
      },
    );

    this.subscriptions.add(routeParamSubscription);

    const itemsAddedSub =
      this.historicalSimilarityService.itemsAdded$.subscribe((newItems) => {
        const uniqueFlightIds = new Set(
          newItems.map((item) => item.comparedFlightIndex),
        );
        for (const flightId of uniqueFlightIds) {
          if (!this.loadedComparedFlightIds.has(flightId)) {
            this.loadedComparedFlightIds.add(flightId);
            this.archiveService.getInvestigationsForFlight(flightId).subscribe({
              next: (list) => {
                this.comparedFlightInvestigations.set(flightId, list);
                this.changeDetectorRef.detectChanges();
              },
            });
          }
        }

        const uniqueCombos = new Set(
          newItems.map((item) => `${item.comparedFlightIndex}|${item.param}`),
        );
        for (const combo of uniqueCombos) {
          if (this.loadedHistoricalLinksKeys.has(combo)) continue;
          this.loadedHistoricalLinksKeys.add(combo);

          const pipeIdx = combo.indexOf('|');
          const comparedFlightIndex = Number(combo.slice(0, pipeIdx));
          const param = combo.slice(pipeIdx + 1);

          const tYValues = this.historicalSimilarityService.sidebarItems
            .filter(
              (i) =>
                i.comparedFlightIndex === comparedFlightIndex &&
                i.param === param,
            )
            .map((i) => i.time)
            .sort((a, b) => a - b);

          this.archiveService
            .getFlightHistoricalSimilarity(comparedFlightIndex, param)
            .subscribe({
              next: (records) => {
                const tXValues = records
                  .filter((r) => r.comparedFlightIndex === this.masterIndex)
                  .map((r) => Number(r.anomalyTime))
                  .sort((a, b) => a - b);

                const pairCount = Math.min(tYValues.length, tXValues.length);
                for (let i = 0; i < pairCount; i++) {
                  this.comparedFlightHistoricalLinks.set(
                    `${comparedFlightIndex}|${param}|${tYValues[i]}`,
                    tXValues[i],
                  );
                }
                this.changeDetectorRef.detectChanges();
              },
            });
        }
      });
    this.subscriptions.add(itemsAddedSub);

    this.ngZone.runOutsideAngular(() => {
      window.addEventListener('historical-hover', (event: Event) => {
        const customEvent = event as CustomEvent<string | null>;
        this.hoveredHistoricalId = customEvent.detail;
        this.changeDetectorRef.detectChanges();
      });
    });
  }

  public ngAfterViewInit(): void {
    this.ngZone.runOutsideAngular(() => {
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

      window.addEventListener('anomaly-click', (event: Event) => {
        const customEvent = event as CustomEvent<{
          type: 'anomaly' | 'historical';
          x: number;
          y: number;
          param: string;
          clientX: number;
          clientY: number;
        }>;

        const point = customEvent.detail;

        this.ngZone.run(() => {
          this.selectedPoint = null;
          this.modalPoint = point;
          this.investigationName = '';
          this.investigationDescription = '';
          this.investigationSaving = false;
          this.showInvestigationModal = true;
        });
      });

      window.addEventListener('click', (event: MouseEvent) => {
        if (this.showInvestigationReport || this.showInvestigationModal) return;
        const target = event.target as HTMLElement;
        if (
          target.closest('.highcharts-point') ||
          target.closest('.anomaly-popup') ||
          target.closest('.inv-overlay')
        )
          return;

        this.selectedPoint = null;
        this.changeDetectorRef.detectChanges();
      });

      window.addEventListener('chart-zoom-update', (event: Event) => {
        if (this.isSyncing) return;
        const { param, min, max } = (
          event as CustomEvent<{ param: string; min: number; max: number }>
        ).detail;

        if (this.syncingParam === param) {
          this.zoomedExtremesMap.set(param, { min, max });
          this.applySyncExtremes(min, max, param);
        } else if (!this.syncingParam) {
          this.zoomedParams.add(param);
          this.zoomedExtremesMap.set(param, { min, max });
        }
        this.changeDetectorRef.detectChanges();
      });

      window.addEventListener('chart-zoom-reset', (event: Event) => {
        if (this.isSyncing) return;
        const { param } = (event as CustomEvent<{ param: string }>).detail;
        this.zoomedParams.delete(param);
        this.zoomedExtremesMap.delete(param);
        if (this.syncingParam === param) {
          this.syncingParam = null;
          this.applySyncReset(param);
        }
        this.changeDetectorRef.detectChanges();
      });
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
    this.chartsService.destroyMiniCharts(this.historicalMiniCharts);
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
      this.handleParamDeselect(paramName);
      return;
    }

    this.handleParamSelect(paramName);
  }

  public onRelatedParamClick(paramName: string): void {
    if (this.selected.has(paramName)) {
      this.removeGridItem(paramName);
      this.selected.delete(paramName);

      if (this.sidebarParam === paramName) {
        this.sidebarParam = null;
        this.related.clear();
        this.historicalSimilarityService.reset();
        this.resetHistoricalLinks();
      }

      return;
    }

    this.selected.add(paramName);
    this.addGridItem(paramName);
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
    this.rebuildFilteredParameters();

    setTimeout(() => {
      this.drawMiniCharts();
    });
  }

  public clearParamSearch(): void {
    this.paramSearchText = '';
    this.rebuildFilteredParameters();
    setTimeout(() => this.drawMiniCharts());
  }

  public navigateToHistoricalFlight(sidebarItem: HistoricalSidebarItem): void {
    this.router.navigate(['/archive', sidebarItem.comparedFlightIndex], {
      queryParams: {
        param: sidebarItem.param,
        sourceFlightIndex: this.masterIndex,
        label: sidebarItem.label,
      },
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

  public toggleSync(param: string): void {
    if (this.syncingParam === param) {
      this.syncingParam = null;
      return;
    }
    this.syncingParam = param;
    const extremes = this.zoomedExtremesMap.get(param);
    if (extremes) {
      this.applySyncExtremes(extremes.min, extremes.max, param);
    }
  }

  public onGridCardClick(event: MouseEvent, item: GridChartItem): void {
    const target = event.target as HTMLElement;
    if (target.closest('.gridChartBody') || target.closest('.gridChartActions'))
      return;
    this.selectParamForSidebar(item.param);
  }

  public isParamVisible(paramName: string): boolean {
    const searchQuery: string = this.paramSearchText.trim().toLowerCase();
    if (searchQuery.length === 0) return true;
    return paramName.toLowerCase().includes(searchQuery);
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
      const gridItem = this.gridItems.find(
        (g) => g.param === this.sidebarParam,
      );
      if (gridItem && gridItem.chart) {
        this.historicalSimilarityService.loadAndShowHistoricalSimilarity(
          this.sidebarParam,
          this.flightData,
          this.flightMeta,
          gridItem.chart,
        );
      }
      setTimeout(() => this.drawHistoricalMiniCharts());
    }
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
    this.rebuildFilteredParameters();
  }

  public trackByParam(index: number, param: string): string {
    return param;
  }

  public trackByGridItem(index: number, item: GridChartItem): string {
    return item.param;
  }

  public getParamOrder(param: string): number {
    const index = this.filteredParameters.indexOf(param);
    return index === -1 ? 0 : index;
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

  private handleParamSelect(paramName: string): void {
    this.selected.add(paramName);
    this.addGridItem(paramName);

    if (this.sidebarParam) return;

    this.sidebarParam = paramName;
    this.related.clear();
    this.historicalSimilarityService.reset();

    if (this.sidebarMode === 'related') {
      this.related.openFor(this.masterIndex, paramName, this.subscriptions);
    }

    if (this.sidebarMode === 'historical') {
      this.related.relatedForParam = paramName;
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

  private handleParamDeselect(paramName: string): void {
    this.removeGridItem(paramName);
    this.selected.delete(paramName);

    if (this.sidebarParam !== paramName) return;

    const remainingParams = Array.from(this.selected);

    if (remainingParams.length === 0) {
      this.sidebarParam = null;
      this.related.clear();
      this.historicalSimilarityService.reset();
      return;
    }

    const lastParam = remainingParams[remainingParams.length - 1];
    this.sidebarParam = lastParam;

    this.related.clear();
    this.historicalSimilarityService.reset();

    if (this.sidebarMode === 'related') {
      this.related.openFor(this.masterIndex, lastParam, this.subscriptions);
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
    this.zoomedParams.delete(paramName);
    this.zoomedExtremesMap.delete(paramName);
    if (this.syncingParam === paramName) {
      this.syncingParam = null;
    }

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
      const observer = (gridItem as GridItemWithObserver).resizeObserver;
      if (observer) {
        observer.disconnect();
        (gridItem as GridItemWithObserver).resizeObserver = undefined;
      }
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
      if (!gridChartItem.chart || !(chartInstance as any).renderer) return;
      this.ngZone.runOutsideAngular(() => chartInstance.reflow());
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

    if (this.syncingParam) {
      const extremes = this.zoomedExtremesMap.get(this.syncingParam);
      if (extremes) {
        chartInstance.xAxis[0].setExtremes(extremes.min, extremes.max, true, false);
      }
    }

    chartInstance.redraw(false);
  }

  private loadFlight(): void {
    const metaSubscription = this.archiveService
      .getFlight(this.masterIndex)
      .subscribe((flightMetadata: FlightMetadata) => {
        this.flightMeta = flightMetadata;
      });

    this.subscriptions.add(metaSubscription);

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
          this.rebuildFilteredParameters();

          setTimeout(() => {
            this.drawMiniCharts();
            if (this.pendingParamToAutoSelect) {
              const pendingParam = this.pendingParamToAutoSelect;
              this.pendingParamToAutoSelect = null;
              setTimeout(() => this.autoSelectParam(pendingParam), 300);
            }
          });
        },
        error: () => {
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

        const existingChart = this.miniCharts.get(parameterName);
        if (existingChart) {
          if (document.body.contains(existingChart.container)) return;
          existingChart.destroy();
          this.miniCharts.delete(parameterName);
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

    if (this.pendingHighlight && this.pendingHighlight.param === paramName) {
      const highlight = this.pendingHighlight;
      this.pendingHighlight = null;
      setTimeout(() => this.applyPendingHighlight(highlight, 0), 500);
    }
  }

  private applyPendingHighlight(
    highlight: {
      param: string;
      sourceFlightIndex: number;
      label: string;
    },
    retryCount: number,
  ): void {
    const gridItem = this.gridItems.find((g) => g.param === highlight.param);
    if (!gridItem || !gridItem.chart) {
      if (retryCount < 10) {
        setTimeout(
          () => this.applyPendingHighlight(highlight, retryCount + 1),
          300,
        );
      }
      return;
    }

    const historicalSimilarityMap =
      (this.flightMeta?.['historicalSimilarity'] as
        | Record<string, any[]>
        | undefined) ?? {};
    const similarityEntries: any[] =
      historicalSimilarityMap[highlight.param] ?? [];

    const matchingEntry = similarityEntries.find(
      (entry: any) =>
        Number(entry.comparedFlightIndex) === highlight.sourceFlightIndex &&
        entry.label === highlight.label,
    );

    let anomalyTimeMs: number;
    let windowSpanMs: number;

    if (matchingEntry) {
      anomalyTimeMs = Number(matchingEntry.anomalyTime) * 1000;
      const startMs = Number(matchingEntry.startEpoch) * 1000;
      const endMs = Number(matchingEntry.endEpoch) * 1000;
      windowSpanMs = Math.max(endMs - startMs, 0);
    } else {
      const flightStartSec = this.flightData[0]?.timestep ?? 0;
      const flightEndSec =
        this.flightData[this.flightData.length - 1]?.timestep ?? flightStartSec;
      anomalyTimeMs = ((flightStartSec + flightEndSec) / 2) * 1000;
      windowSpanMs = 0;
    }

    const minHalfWindowMs = 120 * 1000;
    const halfWindowMs = Math.max(windowSpanMs * 3, minHalfWindowMs);

    const zoomMin = anomalyTimeMs - halfWindowMs;
    const zoomMax = anomalyTimeMs + halfWindowMs;

    gridItem.chart.xAxis[0].setExtremes(zoomMin, zoomMax, true, false);

    if (!matchingEntry) return;

    const targetHistoricalId = `${highlight.sourceFlightIndex}_${Number(matchingEntry.anomalyTime)}`;
    const chart = gridItem.chart;

    let targetPointExists = false;

    for (const series of chart.series) {
      const seriesId = (series.options as any)?.id;
      if (!seriesId || !seriesId.startsWith('history:')) continue;

      for (const point of series.points) {
        const historicalId = (point.options as any)?.custom?.historicalId;
        if (historicalId === targetHistoricalId) {
          targetPointExists = true;
          break;
        }
      }

      if (targetPointExists) break;
    }

    if (!targetPointExists && retryCount < 10) {
      setTimeout(
        () => this.applyPendingHighlight(highlight, retryCount + 1),
        300,
      );
      return;
    }

    if (!targetPointExists) return;

    setTimeout(() => {
      let freshTargetPoint: import('highcharts').Point | null = null;
      for (const series of chart.series) {
        const seriesId = (series.options as any)?.id;
        if (!seriesId || !seriesId.startsWith('history:')) continue;
        for (const point of series.points) {
          const historicalId = (point.options as any)?.custom?.historicalId;
          if (historicalId === targetHistoricalId) {
            freshTargetPoint = point;
            break;
          }
        }
        if (freshTargetPoint) break;
      }

      if (!freshTargetPoint) return;

      this.hoveredHistoricalId = targetHistoricalId;

      freshTargetPoint.setState('hover');
      this.renderHistoricalHalo(freshTargetPoint, chart);

      window.dispatchEvent(
        new CustomEvent('historical-card-hover', {
          detail: targetHistoricalId,
        }),
      );

      const clearHover = () => {
        this.hoveredHistoricalId = null;
        freshTargetPoint!.setState('');
        this.removeHistoricalHalo(freshTargetPoint!.series);
        window.dispatchEvent(
          new CustomEvent('historical-card-hover', { detail: null }),
        );
      };

      setTimeout(() => {
        window.addEventListener('pointerdown', clearHover, { once: true });
      }, 100);
    }, 400);
  }

  private drawHistoricalMiniCharts(): void {
    this.cachedGroupedHistoricalItems = [];
    if (!this.historicalMiniChartElements) return;

    const masterStart = this.flightData[0]?.timestep ?? 0;
    const masterEnd =
      this.flightData[this.flightData.length - 1]?.timestep ?? 0;
    const masterRange = masterEnd - masterStart;

    this.historicalMiniChartElements.forEach(
      (elementRef: ElementRef<HTMLDivElement>) => {
        const paramName = elementRef.nativeElement.dataset['param'];
        const timeAttr = elementRef.nativeElement.dataset['time'];
        const flightIndexAttr = elementRef.nativeElement.dataset['flight'];

        if (!paramName || !flightIndexAttr) return;

        const comparedFlightIndex = Number(flightIndexAttr);
        const anomalyTime = timeAttr ? Number(timeAttr) : masterStart;
        const chartId = flightIndexAttr + '_' + paramName + '_' + timeAttr;

        const existingChart = this.historicalMiniCharts.get(chartId);
        if (existingChart) {
          if (document.body.contains(existingChart.container)) return;
          existingChart.destroy();
          this.historicalMiniCharts.delete(chartId);
        }

        const buildChart = (comparedFlightData: TelemetrySensorFields[]) => {
          const existing = this.historicalMiniCharts.get(chartId);
          if (existing && document.body.contains(existing.container)) return;

          const comparedStart = comparedFlightData[0]?.timestep ?? 0;
          const comparedEnd =
            comparedFlightData[comparedFlightData.length - 1]?.timestep ?? 0;
          const comparedRange = comparedEnd - comparedStart;

          const relativePos =
            masterRange > 0 ? (anomalyTime - masterStart) / masterRange : 0.5;
          const centerInCompared = comparedStart + relativePos * comparedRange;
          const halfWindow = 100;

          const windowedRows = comparedFlightData.filter(
            (row) =>
              row.timestep >= centerInCompared - halfWindow &&
              row.timestep <= centerInCompared + halfWindow,
          );

          const dataPoints = this.chartsService.buildSeries(
            windowedRows,
            paramName,
          );
          const chart = this.chartsService.createHistoricalMiniChart(
            elementRef.nativeElement,
            paramName,
            dataPoints,
          );
          this.historicalMiniCharts.set(chartId, chart);
        };

        if (this.comparedFlightDataCache.has(comparedFlightIndex)) {
          buildChart(this.comparedFlightDataCache.get(comparedFlightIndex)!);
        } else {
          this.archiveService.getFlightFields(comparedFlightIndex).subscribe({
            next: (data) => {
              const sortedData = (data ?? [])
                .slice()
                .sort((a, b) => a.timestep - b.timestep);
              this.comparedFlightDataCache.set(comparedFlightIndex, sortedData);
              buildChart(sortedData);
            },
            error: (err) => {
              console.error(
                '[HistoricalMiniCharts] failed to fetch flight fields for flight:',
                comparedFlightIndex,
                err,
              );
            },
          });
        }
      },
    );
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
            anomalyCount,
            historicalCount,
          });
        });

        this.rebuildFilteredParameters();
      });
  }

  private applySyncExtremes(
    min: number,
    max: number,
    sourceParam: string,
  ): void {
    this.isSyncing = true;
    for (const item of this.gridItems) {
      if (!item.chart || item.param === sourceParam) continue;
      item.chart.xAxis[0].setExtremes(min, max, true, false);
    }
    this.isSyncing = false;
  }

  private applySyncReset(sourceParam: string): void {
    this.isSyncing = true;
    for (const item of this.gridItems) {
      if (!item.chart || item.param === sourceParam) continue;
      item.chart.xAxis[0].setExtremes(undefined, undefined, true, false);
    }
    this.isSyncing = false;
  }

  private selectParamForSidebar(paramName: string): void {
    if (this.sidebarParam === paramName) return;
    this.sidebarParam = paramName;
    this.related.clear();
    this.historicalSimilarityService.reset();

    if (this.sidebarMode === 'related') {
      this.related.openFor(this.masterIndex, paramName, this.subscriptions);
      return;
    }

    this.related.relatedForParam = paramName;
    const gridItem = this.gridItems.find((g) => g.param === paramName);
    if (gridItem && gridItem.chart) {
      this.historicalSimilarityService.loadAndShowHistoricalSimilarity(
        paramName,
        this.flightData,
        this.flightMeta,
        gridItem.chart,
      );
    }
    setTimeout(() => this.drawHistoricalMiniCharts());
  }

  private onHistoricalHover(anomalyTime: string | null): void {
    this.hoveredHistoricalId = anomalyTime ? '_' + anomalyTime : null;

    const container = document.querySelector('.sidebarContent') as HTMLElement;

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

      const xAxis = (chartInstance as any).xAxis?.[0];
      const xMin: number | undefined = xAxis?.min;
      const xMax: number | undefined = xAxis?.max;

      for (const series of chartInstance.series) {
        const seriesId = (series.options as any)?.id;

        if (!seriesId || !seriesId.startsWith('history:')) continue;

        let matchedPoint: any = null;
        for (const point of series.points as any[]) {
          const historicalId = point?.options?.custom?.historicalId;

          const pointTime = historicalId
            ? historicalId.split('_').slice(1).join('_')
            : null;

          const inVisibleRange =
            xMin == null ||
            xMax == null ||
            (point.x != null && point.x >= xMin && point.x <= xMax);

          if (anomalyTime && pointTime === anomalyTime && inVisibleRange) {
            point.setState('hover');
            matchedPoint = point;
          } else {
            point.setState('');
          }
        }

        if (matchedPoint) {
          this.renderHistoricalHalo(matchedPoint, chartInstance);
        } else {
          this.removeHistoricalHalo(series);
        }
      }
    }
  }

  private renderHistoricalHalo(
    point: any,
    chart: Highcharts.Chart,
  ): void {
    const series = point.series as any;
    const haloOptions = series.options?.states?.hover?.halo;

    if (
      !haloOptions ||
      !haloOptions.size ||
      point.plotX == null ||
      point.plotY == null ||
      typeof point.haloPath !== 'function'
    ) {
      return;
    }

    if (!series.halo) {
      series.halo = (chart as any).renderer
        .path()
        .add(series.markerGroup || series.group);
    }

    const fillColor =
      haloOptions.attributes?.fill || series.color || '#fde047';

    series.halo
      .attr({
        d: point.haloPath(haloOptions.size),
        fill: fillColor,
        'fill-opacity': haloOptions.opacity ?? 0.45,
        zIndex: -1,
      })
      .show();

    series.halo.point = point;
  }

  private removeHistoricalHalo(series: any): void {
    if (series && series.halo) {
      series.halo.hide();
    }
  }
  private resetHistoricalLinks(): void {
    this.comparedFlightHistoricalLinks.clear();
    this.loadedHistoricalLinksKeys.clear();
  }

  private loadInvestigations(): void {
    this.comparedFlightInvestigations.clear();
    this.loadedComparedFlightIds.clear();
    this.resetHistoricalLinks();
    this.archiveService.getInvestigationsForFlight(this.masterIndex).subscribe({
      next: (list) => {
        this.flightInvestigations = new Map(
          list.map((inv) => [`${inv.param}_${inv.time}`, inv]),
        );
        this.changeDetectorRef.detectChanges();
      },
    });
  }

  public getInvestigationForCard(
    param: string,
    time: number,
    comparedFlightIndex: number,
  ): Investigation | null {
    const currentFlightInv = this.flightInvestigations.get(`${param}_${time}`);
    if (currentFlightInv) return currentFlightInv;

    const tX = this.comparedFlightHistoricalLinks.get(
      `${comparedFlightIndex}|${param}|${time}`,
    );
    if (tX !== undefined) {
      const comparedList =
        this.comparedFlightInvestigations.get(comparedFlightIndex);
      if (comparedList) {
        return (
          comparedList.find((inv) => inv.param === param && inv.time === tX) ??
          null
        );
      }
    }

    return null;
  }

  public openInvestigationReport(
    event: MouseEvent,
    param: string,
    time: number,
    comparedFlightIndex: number,
  ): void {
    event.stopPropagation();
    const inv = this.getInvestigationForCard(param, time, comparedFlightIndex);
    if (!inv) return;
    this.currentReport = inv;
    this.isOwnInvestigation = inv.masterIndex === this.masterIndex;
    this.isEditingInvestigation = false;
    this.showInvestigationReport = true;
    this.changeDetectorRef.detectChanges();
  }

  public closeInvestigationReport(): void {
    this.showInvestigationReport = false;
    this.isEditingInvestigation = false;
    this.changeDetectorRef.detectChanges();
  }

  public startEditingInvestigation(): void {
    if (!this.currentReport) return;
    this.editingName = this.currentReport.name;
    this.editingDescription = this.currentReport.description;
    this.isEditingInvestigation = true;
    this.changeDetectorRef.detectChanges();
  }

  public cancelEditing(): void {
    this.isEditingInvestigation = false;
    this.changeDetectorRef.detectChanges();
  }

  public saveEditedInvestigation(): void {
    if (
      !this.currentReport?.id ||
      !this.editingName.trim() ||
      !this.editingDescription.trim()
    )
      return;
    this.investigationSaving = true;
    this.archiveService
      .updateInvestigation(
        this.currentReport.id,
        this.editingName.trim(),
        this.editingDescription.trim(),
      )
      .subscribe({
        next: (updated) => {
          this.flightInvestigations.set(
            `${updated.param}_${updated.time}`,
            updated,
          );
          this.currentReport = updated;
          this.isEditingInvestigation = false;
          this.investigationSaving = false;
          this.changeDetectorRef.detectChanges();
        },
        error: () => {
          this.investigationSaving = false;
          this.changeDetectorRef.detectChanges();
        },
      });
  }

  public deleteCurrentInvestigation(): void {
    if (!this.currentReport?.id) return;
    this.investigationDeleting = true;
    this.archiveService.deleteInvestigation(this.currentReport.id).subscribe({
      next: () => {
        this.flightInvestigations.delete(
          `${this.currentReport!.param}_${this.currentReport!.time}`,
        );
        this.investigationDeleting = false;
        this.showInvestigationReport = false;
        this.currentReport = null;
        this.changeDetectorRef.detectChanges();
      },
      error: () => {
        this.investigationDeleting = false;
        this.changeDetectorRef.detectChanges();
      },
    });
  }

  public openInvestigationModal(): void {
    this.investigationName = '';
    this.investigationDescription = '';
    this.investigationSaving = false;
    this.showInvestigationModal = true;
    this.changeDetectorRef.detectChanges();
  }

  public closeInvestigationModal(): void {
    this.showInvestigationModal = false;
    this.deselectAllChartPoints();
    this.changeDetectorRef.detectChanges();
  }

  private deselectAllChartPoints(): void {
    this.ngZone.runOutsideAngular(() => {
      for (const gridItem of this.gridItems) {
        const chart = gridItem.chart as any;
        if (!chart || typeof chart.getSelectedPoints !== 'function') continue;
        const selected = chart.getSelectedPoints();
        for (const point of selected) {
          point.select(false, false);
        }
      }
    });
  }

  public saveInvestigation(): void {
    if (
      !this.modalPoint ||
      !this.investigationName.trim() ||
      !this.investigationDescription.trim()
    )
      return;

    const payload: Investigation = {
      name: this.investigationName.trim(),
      description: this.investigationDescription.trim(),
      masterIndex: this.masterIndex,
      param: this.modalPoint.param,
      time: Math.round(this.modalPoint.x / 1000),
      value: this.modalPoint.y,
    };

    this.investigationSaving = true;
    this.archiveService.createInvestigation(payload).subscribe({
      next: (created) => {
        this.flightInvestigations.set(
          `${created.param}_${created.time}`,
          created,
        );
        this.investigationSaving = false;
        this.showInvestigationModal = false;
        this.deselectAllChartPoints();
        this.changeDetectorRef.detectChanges();
      },
      error: () => {
        this.investigationSaving = false;
        this.changeDetectorRef.detectChanges();
      },
    });
  }
  public onTimeGroupHover(group: HistoricalGroupItem): void {
    if (!group.items || group.items.length === 0) return;

    const firstItem = group.items[0];

    const historicalId = firstItem.comparedFlightIndex + '_' + firstItem.time;

    this.hoveredHistoricalId = historicalId;

    window.dispatchEvent(
      new CustomEvent('historical-card-hover', {
        detail: historicalId,
      }),
    );
  }
}
