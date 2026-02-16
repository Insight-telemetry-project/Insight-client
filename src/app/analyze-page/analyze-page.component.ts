import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  QueryList,
  ViewChild,
  ViewChildren
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import * as Highcharts from 'highcharts';

import { FlightArchiveService } from '../services/flight-archive.service';
import { TelemetrySensorFields } from '../common/interfaces/telemetry-sensor-fields.interface';
import { AnalyzeChartsService } from './services/analyze-charts.service';
import { RelatedParamsService } from './services/related-params.service';
import { HistoricalSimilarityPoint } from '../common/interfaces/historical-similarity-point.interface';

@Component({
  selector: 'app-analyze-page',
  templateUrl: './analyze-page.component.html',
  styleUrls: ['./analyze-page.component.scss']
})
export class AnalyzePageComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mainChart') public mainChartEl!: ElementRef<HTMLDivElement>;
  @ViewChildren('miniChart') public miniChartEls!: QueryList<ElementRef<HTMLDivElement>>;

  public masterIndex: number = 0;
  public flightData: TelemetrySensorFields[] = [];
  public parameters: string[] = [];
  public selected: Set<string> = new Set<string>();
  public paramSearchText: string = '';

  public constructor(
    private readonly route: ActivatedRoute,
    private readonly archiveService: FlightArchiveService,
    private readonly router: Router,
    private readonly charts: AnalyzeChartsService,
    public readonly related: RelatedParamsService
  ) {}

  private subs: Subscription = new Subscription();
  private mainChart: Highcharts.Chart | null = null;
  private miniCharts: Map<string, Highcharts.Chart> = new Map<string, Highcharts.Chart>();

  public ngOnInit(): void {
    const sub: Subscription = this.route.paramMap.subscribe((params) => {
      this.masterIndex = Number(params.get('masterIndex'));
      this.selected.clear();
      this.destroyCharts();
      this.related.clear();
      this.loadFlight();
      this.paramSearchText = '';
    });

    this.subs.add(sub);
  }

 public ngAfterViewInit(): void {
  this.mainChart =
    this.charts.createMainChart(this.mainChartEl.nativeElement as HTMLElement);
}

  public ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.destroyCharts();
    this.related.clear();
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
    this.selected.delete(param);
    if (this.mainChart) {
      this.charts.removeAnomaliesSeries(this.mainChart, param);
    }
  } else {
    this.selected.add(param);
    this.related.openFor(this.masterIndex, param, this.subs);
  }

  this.related.relatedOpen = this.selected.size > 0;

  this.refreshMainChart();
}


  public toggleRelatedList(): void {
    this.related.toggle(this.masterIndex, this.subs);
  }

  public onRelatedParamClick(param: string): void {
    if (this.selected.has(param)) {
      this.selected.delete(param);
      if (this.mainChart) this.charts.removeAnomaliesSeries(this.mainChart, param);
    } else {
      this.selected.add(param);
    }

    this.refreshMainChart();
  }

  private loadFlight(): void {
  const sub: Subscription =
    this.archiveService.getFlightFields(this.masterIndex).subscribe({
      next: (rows: TelemetrySensorFields[]) => {
        const sortedRows: TelemetrySensorFields[] = (rows ?? [])
          .slice()
          .sort((a, b) => a.timestep - b.timestep);

        this.flightData = sortedRows;

        const firstFields: Record<string, number> =
          this.flightData[0]?.fields ?? {};

        this.parameters = Object.keys(firstFields);

        this.refreshMainChart();

        setTimeout(() => {
          this.drawMiniCharts();
        });
      },
      error: (err: any) => {
        console.error('Failed to load flight:', err);
        this.flightData = [];
        this.parameters = [];
        this.refreshMainChart();
      }
    });

  this.subs.add(sub);
}


  private refreshMainChart(): void {
    if (!this.mainChart) return;

    const selectedParams: string[] = Array.from(this.selected.values());
    this.charts.updateMainChartSeries(this.mainChart, this.flightData, selectedParams);

    for (const param of selectedParams) {
      this.loadAndShowAnomalies(param);
      this.loadAndShowHistoricalSimilarity(param);

    }
  }

  private drawMiniCharts(): void {
  if (this.flightData.length === 0) return;
  if (this.miniCharts.size > 0) return;

  this.miniChartEls.forEach((ref: ElementRef<HTMLDivElement>) => {
    const param: string | undefined = ref.nativeElement.dataset['param'];
    if (!param) return;

    const dataPoints: [number, number][] =
      this.charts.buildSeries(this.flightData, param);

    const chart: Highcharts.Chart =
      this.charts.createMiniChart(
        ref.nativeElement as HTMLElement,
        param,
        dataPoints
      );

    this.miniCharts.set(param, chart);
  });
}


  private loadAndShowAnomalies(param: string): void {
    const sub: Subscription = this.archiveService.getFlightPointsParam(this.masterIndex, param).subscribe({
      next: (anomalyTimes: number[]) => {
        if (!this.mainChart) return;

        const points: [number, number][] =
          this.charts.mapAnomalyEpochSecondsToXY(this.flightData, param, anomalyTimes);

        this.charts.addOrReplaceAnomaliesSeries(this.mainChart, param, points);
      },
      error: (err: any) => console.error('Failed to load anomalies for', param, err)
    });

    this.subs.add(sub);
  }

  private destroyCharts(): void {
    this.charts.destroyChart(this.mainChart);
    this.mainChart = null;

    this.charts.destroyMiniCharts(this.miniCharts);
  }

  private loadAndShowHistoricalSimilarity(param: string): void {
  const sub: Subscription =
    this.archiveService.getFlightHistoricalSimilarity(this.masterIndex, param).subscribe({
      next: (items: HistoricalSimilarityPoint[]) => {
        if (!this.mainChart) return;

        const points: Highcharts.PointOptionsObject[] =
          this.charts.mapHistoricalSimilarityToPoints(this.flightData, param, items);

        this.charts.addOrReplaceHistoricalSimilaritySeries(this.mainChart, param, points);
      },
      error: (err: any) => console.error('Failed to load historical similarity for', param, err)
    });

  this.subs.add(sub);
}
public get filteredParameters(): string[] {
  const query: string = this.paramSearchText.trim().toLowerCase();
  if (query.length === 0) return this.parameters;

  return this.parameters.filter((p: string) => p.toLowerCase().includes(query));
}
public onParamSearchChange(value: string): void {
  this.paramSearchText = value;
}

public clearParamSearch(): void {
  this.paramSearchText = '';
}

}
