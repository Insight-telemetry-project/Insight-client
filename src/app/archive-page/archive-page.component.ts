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

@Component({
  selector: 'app-archive-page',
  templateUrl: './archive-page.component.html',
  styleUrls: ['./archive-page.component.scss']
})
export class ArchivePageComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mainChart') public mainChartEl!: ElementRef<HTMLDivElement>;
  @ViewChildren('miniChart') public miniChartEls!: QueryList<ElementRef<HTMLDivElement>>;

  public masterIndex: number = 0;
  public flightData: TelemetrySensorFields[] = [];
  public parameters: string[] = [];
  public selected: Set<string> = new Set<string>();

  private subs: Subscription = new Subscription();

  private mainChart: Highcharts.Chart | null = null;
  private miniCharts: Map<string, Highcharts.Chart> = new Map<string, Highcharts.Chart>();

  public constructor(
    private readonly route: ActivatedRoute,
    private readonly archiveService: FlightArchiveService,
    private readonly router: Router
  ) {}

  public ngOnInit(): void {
    const sub: Subscription = this.route.paramMap.subscribe((params) => {
      this.masterIndex = Number(params.get('masterIndex'));
      this.selected.clear();
      this.destroyCharts();
      this.loadFlight();
    });

    this.subs.add(sub);
  }

  public ngAfterViewInit(): void {
    this.createEmptyMainChart();

    const sub: Subscription = this.miniChartEls.changes.subscribe(() => {
      this.drawMiniCharts();
    });

    this.subs.add(sub);
  }

  public ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.destroyCharts();
  }

  public goBack(): void {
    this.router.navigate(['/']);
  }

  private loadFlight(): void {
    const sub: Subscription = this.archiveService.getFlightFields(this.masterIndex).subscribe({
      next: (rows: TelemetrySensorFields[]) => {
        const sortedRows: TelemetrySensorFields[] = (rows ?? [])
          .slice()
          .sort((a, b) => a.timestep - b.timestep);

        this.flightData = sortedRows;

        const firstFields: Record<string, number> = this.flightData[0]?.fields ?? {};
        this.parameters = Object.keys(firstFields);

        this.updateMainChartSeries();
      },
      error: (err: any) => {
        console.error('Failed to load flight:', err);
        this.flightData = [];
        this.parameters = [];
        this.updateMainChartSeries();
      }
    });

    this.subs.add(sub);
  }

  public toggleParam(param: string): void {
    if (this.selected.has(param)) {
      this.selected.delete(param);
      this.removeAnomaliesSeries(param);
    } else {
      this.selected.add(param);
    }

    this.updateMainChartSeries();
  }

  public isSelected(param: string): boolean {
    return this.selected.has(param);
  }

  private createEmptyMainChart(): void {
    const options: Highcharts.Options = {
      chart: {
        backgroundColor: 'transparent',
        zooming: { type: 'x' },
        panning: { enabled: true, type: 'x' },
        panKey: 'shift'
      },
      title: { text: '' },
      credits: { enabled: false },
      legend: {
        enabled: true,
        itemStyle: {
        color: '#ffffff',
        fontSize: '12px',
        fontWeight: '400'
      },
      itemHoverStyle: {
      color: '#ff2d2d'
    }
  },

      xAxis: {
        type: 'datetime',
        title: { text: 'Time', style: { color: '#ffffff' } },
        labels: { style: { color: '#cfcfe6' } }
      },
      yAxis: {
        title: { text: '', style: { color: '#ffffff' } },
        labels: { style: { color: '#cfcfe6' } }
      },
      tooltip: { shared: true },
      series: []
    };

    this.mainChart = Highcharts.chart(this.mainChartEl.nativeElement as HTMLElement, options);
  }

  private updateMainChartSeries(): void {
    if (!this.mainChart) return;

    while (this.mainChart.series.length > 0) {
      this.mainChart.series[0].remove(false);
    }

    const selectedParams: string[] = Array.from(this.selected.values());

    for (const param of selectedParams) {
      const dataPoints: [number, number][] = this.buildSeries(param);

      this.mainChart.addSeries(
        {
          type: 'line',
          name: param,
          data: dataPoints,
          turboThreshold: 0
        } as Highcharts.SeriesOptionsType,
        false
      );
    }

    this.mainChart.redraw();

    for (const param of selectedParams) {
      this.loadAndShowAnomalies(param);
    }
  }

  private drawMiniCharts(): void {
    if (this.flightData.length === 0) return;

    for (const chart of this.miniCharts.values()) {
      chart.destroy();
    }
    this.miniCharts.clear();

    this.miniChartEls.forEach((ref: ElementRef<HTMLDivElement>) => {
      const param: string | undefined = ref.nativeElement.dataset['param'];
      if (!param) return;

      const dataPoints: [number, number][] = this.buildSeries(param);

      const chart: Highcharts.Chart = Highcharts.chart(ref.nativeElement as HTMLElement, {
        chart: {
          backgroundColor: 'transparent',
          height: 140,
          margin: [10, 10, 25, 35]
        },
        title: { text: '' },
        credits: { enabled: false },
        legend: { enabled: false },
        xAxis: { type: 'datetime', visible: false },
        yAxis: { title: { text: '' }, visible: false },
        tooltip: { enabled: false },
        plotOptions: {
          series: {
            animation: false,
            marker: { enabled: false },
            lineWidth: 1
          }
        },
        series: [
          {
            type: 'line',
            name: param,
            data: dataPoints,
            turboThreshold: 0
          } as Highcharts.SeriesLineOptions
        ]
      });

      this.miniCharts.set(param, chart);
    });
  }

  private buildSeries(param: string): [number, number][] {
    const points: [number, number][] = [];

    for (const row of this.flightData) {
      const value: number | undefined = row.fields[param];
      if (value === undefined || value === null) continue;

      const timeMs: number = row.timestep * 1000;
      points.push([timeMs, value]);
    }

    return points;
  }

  private buildTimeToValueMap(param: string): Map<number, number> {
    const map: Map<number, number> = new Map<number, number>();

    for (const row of this.flightData) {
      const value: number | undefined = row.fields[param];
      if (value === undefined || value === null) continue;

      map.set(row.timestep, value);
    }

    return map;
  }

  private mapAnomalyEpochSecondsToXY(param: string, anomalyEpochSeconds: number[]): [number, number][] {
    const points: [number, number][] = [];
    const timeToValue: Map<number, number> = this.buildTimeToValueMap(param);

    for (const t of anomalyEpochSeconds) {
      const y: number | undefined = timeToValue.get(t);
      if (y === undefined) continue;

      points.push([t * 1000, y]);
    }

    return points;
  }

  private loadAndShowAnomalies(param: string): void {
    const sub: Subscription = this.archiveService.getFlightPointsParam(this.masterIndex, param).subscribe({
      next: (anomalyTimes: number[]) => {
        const points: [number, number][] = this.mapAnomalyEpochSecondsToXY(param, anomalyTimes);
        this.addAnomaliesScatterToMainChart(param, points);
      },
      error: (err: any) => console.error('Failed to load anomalies for', param, err)
    });

    this.subs.add(sub);
  }

  private addAnomaliesScatterToMainChart(param: string, points: [number, number][]): void {
  if (!this.mainChart) return;

  const seriesId: string = `anomalies:${param}`;

  const existing: Highcharts.Series | undefined =
    this.mainChart.series.find((s: Highcharts.Series) => (s.options as any).id === seriesId);

  if (existing) {
    existing.remove(false);
  }

  this.mainChart.addSeries(
    {
      type: 'scatter',
      id: seriesId as any,
      name: `${param} anomalies`,
      data: points,
      color: '#ff2d2d',
      marker: {
        enabled: true,
        radius: 5,
        symbol: 'circle',
        fillColor: '#ff2d2d',
        lineColor: '#ffffff',
        lineWidth: 1,
        states: {
          hover: {
            enabled: true,
            radius: 8,
            fillColor: '#ff0000',
            lineColor: '#000000',
            lineWidth: 2
          }
        }
      },
      states: {
        hover: {
          enabled: true
        }
      },
      tooltip: {
        useHTML: true,
        pointFormat: `
          <b style="color:#ff2d2d">Anomaly</b><br/>
          <b>${param}</b>: {point.y}<br/>
          Time: {point.x:%H:%M:%S}
        `
      }
    } as Highcharts.SeriesOptionsType,
    false
  );

  this.mainChart.redraw();
}


  private removeAnomaliesSeries(param: string): void {
    if (!this.mainChart) return;

    const seriesId: string = `anomalies:${param}`;

    const existing: Highcharts.Series | undefined =
      this.mainChart.series.find((s: Highcharts.Series) => (s.options as any).id === seriesId);

    if (existing) {
      existing.remove(false);
      this.mainChart.redraw();
    }
  }

  private destroyCharts(): void {
    if (this.mainChart) {
      this.mainChart.destroy();
      this.mainChart = null;
    }

    for (const chart of this.miniCharts.values()) {
      chart.destroy();
    }
    this.miniCharts.clear();
  }
}
