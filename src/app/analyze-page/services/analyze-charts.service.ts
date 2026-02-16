import { Injectable } from '@angular/core';
import * as Highcharts from 'highcharts/highstock';
import { TelemetrySensorFields } from '../../common/interfaces/telemetry-sensor-fields.interface';

@Injectable({ providedIn: 'root' })
export class AnalyzeChartsService {
  public createMainChart(container: HTMLElement): Highcharts.Chart {
  const options: Highcharts.Options = {
    chart: {
  backgroundColor: 'transparent',
  zooming: { type: 'x' },
  panning: { enabled: true, type: 'x' },
  panKey: 'shift',

  events: {
    load: function () {
      const chart = this;

      chart.container.ondblclick = function () {
        chart.xAxis[0].setExtremes(undefined, undefined);
      };
    }
  }
},

    title: { text: '' },
    credits: { enabled: false },
    legend: {
      enabled: true,
      itemStyle: { color: '#ffffff', fontSize: '12px', fontWeight: '400' },
      itemHoverStyle: { color: '#948f8f' }
    },
    xAxis: {
      type: 'datetime',
      title: { text: 'Time', style: { color: '#ffffff' } },
      labels: { style: { color: '#cfcfe6' } },
      gridLineColor: 'rgba(255,255,255,0.08)',
      gridLineWidth: 1
    },
    yAxis: {
      opposite: false,
      title: { text: '', style: { color: '#ffffff' } },
      labels: { style: { color: '#cfcfe6' } },
      gridLineColor: 'rgba(255,255,255,0.08)',
      gridLineWidth: 1
},

    navigator: {
  enabled: true,
  height: 60,

  xAxis: {
    gridLineWidth: 0,
    lineWidth: 0,
    tickLength: 0,
  },
},

scrollbar: {
  enabled: false
},

rangeSelector: {
  enabled: false
},

    tooltip: {
      shared: false,
      snap: 80,
      useHTML: true
    },
    plotOptions: {
  series: {
    states: {
      inactive: {
        opacity: 1
      }
    }
  },
  areaspline: {
    marker: { enabled: false }
  },
  scatter: {
    stickyTracking: true
  }
}
,
    series: []
  };

  return Highcharts.stockChart(container, options);
}




 public updateMainChartSeries(
  chart: Highcharts.Chart,
  flightData: TelemetrySensorFields[],
  selectedParams: string[]
): void {

  while (chart.series.length > 0) {
    chart.series[0].remove(false);
  }

  const colors: string[] = Highcharts.getOptions().colors as string[];

  for (let index: number = 0; index < selectedParams.length; index++) {

    const param: string = selectedParams[index];
    const dataPoints: [number, number][] = this.buildSeries(flightData, param);

    const baseColor: string =
      colors?.[index % colors.length] ?? '#00bfff';

    const softTop: string =
      Highcharts.color(baseColor).setOpacity(0.25).get('rgba') as string;

    const softBottom: string =
      Highcharts.color(baseColor).setOpacity(0.02).get('rgba') as string;

    chart.addSeries(
      {
        type: 'areaspline',
        name: param,
        data: dataPoints,
        color: baseColor,
        lineWidth: 1.5,
        marker: { enabled: false },
        threshold: null,
        fillColor: {
          linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
          stops: [
            [0, softTop],
            [1, softBottom]
          ]
        },
        shadow: false
      } as Highcharts.SeriesOptionsType,
      false
    );
  }

  chart.update({
    navigator: {
      enabled: selectedParams.length > 0
    }
  }, false);

  chart.redraw();
}


  public addOrReplaceAnomaliesSeries(
    chart: Highcharts.Chart,
    param: string,
    points: [number, number][]
  ): void {
    const seriesId: string = `anomalies:${param}`;

    const existing: Highcharts.Series | undefined =
      chart.series.find((s: Highcharts.Series) => (s.options as any).id === seriesId);

    if (existing) {
      existing.remove(false);
    }

    chart.addSeries(
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
        states: { hover: { enabled: true } },
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

    chart.redraw();
  }

  public removeAnomaliesSeries(chart: Highcharts.Chart, param: string): void {
    const seriesId: string = `anomalies:${param}`;

    const existing: Highcharts.Series | undefined =
      chart.series.find((s: Highcharts.Series) => (s.options as any).id === seriesId);

    if (existing) {
      existing.remove(false);
      chart.redraw();
    }
  }

  public createMiniChart(
    container: HTMLElement,
    param: string,
    dataPoints: [number, number][]
  ): Highcharts.Chart {
    return Highcharts.chart(container, {
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
        lineWidth: 1,
        enableMouseTracking: false,
        states: {
          hover: {
            enabled: false
          }
        },
        marker: {
          enabled: false,
          states: {
            hover: {
              enabled: false
            }
          }
        }
      }
    },
      series: [
        {
          type: 'line',
          name: param,
          data: dataPoints,
          color: '#8b5cf6',
          turboThreshold: 0
        } as Highcharts.SeriesLineOptions
      ]
    });
  }

  public destroyChart(chart: Highcharts.Chart | null): void {
    if (chart) chart.destroy();
  }

  public destroyMiniCharts(miniCharts: Map<string, Highcharts.Chart>): void {
    for (const chart of miniCharts.values()) {
      chart.destroy();
    }
    miniCharts.clear();
  }

  public buildSeries(flightData: TelemetrySensorFields[], param: string): [number, number][] {
    const points: [number, number][] = [];

    for (const row of flightData) {
      const value: number | undefined = row.fields[param];
      if (value === undefined || value === null) continue;

      points.push([row.timestep * 1000, value]);
    }

    return points;
  }

  public mapAnomalyEpochSecondsToXY(
    flightData: TelemetrySensorFields[],
    param: string,
    anomalyEpochSeconds: number[]
  ): [number, number][] {
    const timeToValue: Map<number, number> = new Map<number, number>();

    for (const row of flightData) {
      const value: number | undefined = row.fields[param];
      if (value === undefined || value === null) continue;
      timeToValue.set(row.timestep, value);
    }

    const points: [number, number][] = [];

    for (const t of anomalyEpochSeconds) {
      const y: number | undefined = timeToValue.get(t);
      if (y === undefined) continue;
      points.push([t * 1000, y]);
    }

    return points;
  }

  public addOrReplaceHistoricalSimilaritySeries(
  chart: Highcharts.Chart,
  param: string,
  points: Highcharts.PointOptionsObject[]
): void {
  const seriesId: string = `history:${param}`;

  const existing: Highcharts.Series | undefined =
    chart.series.find((s: Highcharts.Series) => (s.options as any).id === seriesId);

  if (existing) {
    existing.remove(false);
  }

  chart.addSeries(
    {
      type: 'scatter',
      id: seriesId as any,
      name: `${param} similar past`,
      data: points,
      color: '#ffd400',
      zIndex: 20,
      enableMouseTracking: true,
      stickyTracking: true,
      tooltip: {
        shared: false,
        useHTML: true,
        pointFormat: `
          <div style="min-width:220px">
            <div style="font-weight:700;margin-bottom:6px">
              Similar historical point
            </div>
            <div><b>${param}</b>: {point.y}</div>
            <div>Time: {point.x:%H:%M:%S}</div>
            <div style="opacity:0.9;margin-top:6px">
              {point.custom.info}
            </div>
          </div>
        `
      },
      marker: {
        enabled: true,
        symbol: 'circle',
        radius: 6,
        fillColor: '#ffd400',
        lineColor: '#000000',
        lineWidth: 2,
        states: {
          hover: {
            enabled: true,
            radius: 9,
            lineWidth: 3
          }
        }
      },
      states: {
        hover: {
          enabled: true
        }
      }
    } as Highcharts.SeriesOptionsType,
    false
  );

  chart.redraw();
}



public mapHistoricalSimilarityToPoints(
  flightData: TelemetrySensorFields[],
  param: string,
  items: any[]
): Highcharts.PointOptionsObject[] {
  const timeToValue: Map<number, number> = new Map<number, number>();

  for (const row of flightData) {
    const value: number | undefined = row.fields[param];
    if (value === undefined || value === null) continue;
    timeToValue.set(row.timestep, value);
  }

  const points: Highcharts.PointOptionsObject[] = [];

  for (const item of items) {

    const start: number = Number(item.startIndex);
    const end: number = Number(item.endIndex);
    const t: number = Math.round((start + end) / 2);

    const y: number | undefined = timeToValue.get(t);
    if (y === undefined) continue;

    points.push({
      x: t * 1000,
      y,
      custom: {
        info: `Matched flight ${item.comparedFlightIndex}, label ${item.label}, score ${Number(item.finalScore).toFixed(2)}`
      }
    });
  }

  return points;
}


}
