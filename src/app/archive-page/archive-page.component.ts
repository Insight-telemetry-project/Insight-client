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
import { ActivatedRoute } from '@angular/router';
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
    private readonly archiveService: FlightArchiveService
  ) {}

  public ngOnInit(): void {
    const sub = this.route.paramMap.subscribe((params) => {
      this.masterIndex = Number(params.get('masterIndex'));
      this.selected.clear();
      this.destroyCharts();
      this.loadFlight();
    });

    this.subs.add(sub);
  }

  public ngAfterViewInit(): void {
    this.createEmptyMainChart();


    const sub = this.miniChartEls.changes.subscribe(() => {
      this.drawMiniCharts();
    });
    this.subs.add(sub);
  }

  public ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.destroyCharts();
  }

  private loadFlight(): void {
    this.archiveService.getFlightFields(this.masterIndex).subscribe({
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
  }


  public toggleParam(param: string): void {
    if (this.selected.has(param)) {
      this.selected.delete(param);
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
      legend: { enabled: true },
      xAxis: {
        type: 'datetime',
        title: { text: 'Time' }
      },
      yAxis: {
        title: { text: '' }
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

      const chart = Highcharts.chart(ref.nativeElement as HTMLElement, {
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
