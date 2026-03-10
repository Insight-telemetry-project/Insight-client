import { Injectable } from '@angular/core';
import * as Highcharts from 'highcharts';
import { TelemetrySensorFields } from '../../common/interfaces/telemetry-sensor-fields.interface';

@Injectable({ providedIn: 'root' })
export class AnalyzeChartsService {
  public createMainChart(container: HTMLElement): Highcharts.Chart {
    return Highcharts.chart(container, {
      chart: {
        backgroundColor: 'transparent',
        zooming: { type: 'x' },
        panning: {
          enabled: true,
          type: 'x',
        },
        resetZoomButton: {
          theme: {
            display: 'none',
          },
        },
        events: {
          load: function () {
            const chart = this;
            chart.container.ondblclick = function () {
              chart.xAxis[0].setExtremes(undefined, undefined);
            };
          },
        },
      },
      title: { text: '' },
      credits: { enabled: false },
      legend: {
        enabled: true,
        itemStyle: { color: '#ffffff', fontSize: '12px', fontWeight: '400' },
        itemHoverStyle: { color: '#948f8f' },
      },
      xAxis: {
        type: 'datetime',
        title: { text: 'Time', style: { color: '#ffffff' } },
        labels: { style: { color: '#cfcfe6' } },
        gridLineColor: 'rgba(255,255,255,0.08)',
        gridLineWidth: 1,
      },
      yAxis: {
        title: { text: '', style: { color: '#ffffff' } },
        labels: { style: { color: '#cfcfe6' } },
        gridLineColor: 'rgba(255,255,255,0.08)',
        gridLineWidth: 1,
      },
      tooltip: {
        shared: false,
        snap: 80,
        useHTML: true,
      },
      plotOptions: {
        series: {
          states: {
            inactive: {
              opacity: 1,
            },
          },
        },
        areaspline: {
          marker: { enabled: false },
        },
        scatter: {
          stickyTracking: true,
        },
      },
      series: [],
    });
  }

  public updateMainChartSeries(
    chart: Highcharts.Chart,
    flightData: TelemetrySensorFields[],
    selectedParams: string[],
  ): void {
    while (chart.series.length > 0) {
      chart.series[0].remove(false);
    }

    const availableColors = Highcharts.getOptions().colors as string[];

    for (
      let paramIndex: number = 0;
      paramIndex < selectedParams.length;
      paramIndex++
    ) {
      const paramName: string = selectedParams[paramIndex];
      const dataPoints: [number, number][] = this.buildSeries(
        flightData,
        paramName,
      );
      const baseColor: string =
        availableColors?.[paramIndex % availableColors.length] ?? '#00bfff';
      const gradientTopColor: string = Highcharts.color(baseColor)
        .setOpacity(0.25)
        .get('rgba') as string;
      const gradientBottomColor: string = Highcharts.color(baseColor)
        .setOpacity(0.02)
        .get('rgba') as string;

      chart.addSeries(
        {
          type: 'areaspline',
          name: paramName,
          data: dataPoints,
          color: baseColor,
          lineWidth: 1.5,
          marker: { enabled: false },
          threshold: null,
          softThreshold: false,
          fillColor: {
            linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
            stops: [
              [0, gradientTopColor],
              [1, gradientBottomColor],
            ],
          },
          shadow: false,
        } as Highcharts.SeriesOptionsType,
        false,
      );
    }

    chart.redraw();
  }

  public addOrReplaceAnomaliesSeries(
    chart: Highcharts.Chart,
    paramName: string,
    anomalyPoints: [number, number][],
  ): void {
    const seriesId: string = `anomalies:${paramName}`;

    const existingSeries: Highcharts.Series | undefined = chart.series.find(
      (series: Highcharts.Series) => (series.options as any).id === seriesId,
    );

    if (existingSeries) {
      existingSeries.remove(false);
    }

    chart.addSeries(
      {
        type: 'scatter',
        id: seriesId as any,
        name: `${paramName} anomalies`,
        data: anomalyPoints,
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
              lineWidth: 2,
            },
          },
        },
        states: { hover: { enabled: true } },
        tooltip: {
          useHTML: true,
          pointFormat: `
            <b style="color:#ff2d2d">Anomaly</b><br/>
            <b>${paramName}</b>: {point.y}<br/>
            Time: {point.x:%H:%M:%S}
          `,
        },
      } as Highcharts.SeriesOptionsType,
      false,
    );

    chart.redraw();
  }

  public removeAnomaliesSeries(
    chart: Highcharts.Chart,
    paramName: string,
  ): void {
    const seriesId: string = `anomalies:${paramName}`;
    const existingSeries: Highcharts.Series | undefined = chart.series.find(
      (series: Highcharts.Series) => (series.options as any).id === seriesId,
    );
    if (existingSeries) {
      existingSeries.remove(false);
      chart.redraw();
    }
  }

  public createMiniChart(
    container: HTMLElement,
    paramName: string,
    dataPoints: [number, number][],
  ): Highcharts.Chart {
    return Highcharts.chart(container, {
      chart: {
        backgroundColor: 'transparent',
        height: 140,
        margin: [10, 10, 25, 35],
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
          lineWidth: 1,
          enableMouseTracking: false,
          states: {
            hover: {
              enabled: false,
            },
          },
        },
      },

      series: [
        {
          type: 'line',
          name: paramName,
          data: dataPoints,
          color: '#8b5cf6',
          turboThreshold: 0,
        } as Highcharts.SeriesLineOptions,
      ],
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

  public buildSeries(
    flightData: TelemetrySensorFields[],
    paramName: string,
  ): [number, number][] {
    const dataPoints: [number, number][] = [];

    for (const row of flightData) {
      const value: number | undefined = row.fields[paramName];
      if (value === undefined || value === null) continue;
      dataPoints.push([row.timestep * 1000, value]);
    }

    return dataPoints;
  }

  public mapAnomalyEpochSecondsToXY(
    flightData: TelemetrySensorFields[],
    paramName: string,
    anomalyEpochSeconds: number[],
  ): [number, number][] {
    const timestepToValueMap: Map<number, number> = new Map<number, number>();

    for (const row of flightData) {
      const value: number | undefined = row.fields[paramName];
      if (value === undefined || value === null) continue;
      timestepToValueMap.set(row.timestep, value);
    }

    const anomalyPoints: [number, number][] = [];

    for (const epochSecond of anomalyEpochSeconds) {
      const yValue: number | undefined = timestepToValueMap.get(epochSecond);
      if (yValue === undefined) continue;
      anomalyPoints.push([epochSecond * 1000, yValue]);
    }

    return anomalyPoints;
  }

  public addOrReplaceHistoricalSimilaritySeries(
    chart: Highcharts.Chart,
    paramName: string,
    points: Highcharts.PointOptionsObject[],
  ): void {
    const seriesId: string = `history:${paramName}`;

    const uniquePointsMap: Map<string, Highcharts.PointOptionsObject> = new Map<
      string,
      Highcharts.PointOptionsObject
    >();

    for (const point of points) {
      const uniqueKey: string =
        (point as any)?.custom?.historicalId ?? `${point.x}_${point.y}`;

      if (!uniquePointsMap.has(uniqueKey)) {
        uniquePointsMap.set(uniqueKey, point);
      }
    }

    const dedupedPoints: Highcharts.PointOptionsObject[] = Array.from(
      uniquePointsMap.values(),
    );

    const existingSeries: Highcharts.Series | undefined = chart.series.find(
      (series: Highcharts.Series) => (series.options as any)?.id === seriesId,
    );

    if (existingSeries) {
      existingSeries.remove(false);
    }

    chart.addSeries(
      {
        id: seriesId,
        name: 'Historical',
        type: 'scatter',
        data: dedupedPoints,
        zIndex: 7,
        color: '#facc15',
        enableMouseTracking: true,

        point: {
          events: {
            mouseOver: function () {
              const historicalId: string | undefined = (this.options as any)
                ?.custom?.historicalId;

              if (historicalId) {
                window.dispatchEvent(
                  new CustomEvent('historical-point-hover', {
                    detail: historicalId,
                  }),
                );
              }
            },
            mouseOut: function () {
              window.dispatchEvent(
                new CustomEvent('historical-point-hover', {
                  detail: null,
                }),
              );
            },
          },
        },

        marker: {
          symbol: 'circle',
          radius: 6,
          fillColor: '#facc15',
          lineColor: '#000000',
          lineWidth: 2,
          states: {
            hover: {
              radius: 8,
              fillColor: '#fde047',
              lineColor: '#000000',
              lineWidth: 3,
            },
          },
        },

        states: {
          hover: {
            halo: {
              size: 14,
              opacity: 0.45,
              attributes: {
                fill: '#fde047',
              },
            },
          },
        },
      } as Highcharts.SeriesOptionsType,
      false,
    );

    chart.redraw();
  }

  public mapHistoricalSimilarityToPoints(
    flightData: TelemetrySensorFields[],
    paramName: string,
    similarityItems: any[],
  ): Highcharts.PointOptionsObject[] {
    const timestepToValueMap: Map<number, number> = new Map<number, number>();

    for (const row of flightData) {
      const value: number | undefined = row.fields[paramName];
      if (value === undefined || value === null) continue;
      timestepToValueMap.set(row.timestep, value);
    }

    const mappedPoints: Highcharts.PointOptionsObject[] = [];

    for (const similarityItem of similarityItems) {
      const startIndex: number = Number(similarityItem.startIndex);
      const endIndex: number = Number(similarityItem.endIndex);
      const midpointTimestep: number = Math.round((startIndex + endIndex) / 2);

      const yValue: number | undefined =
        timestepToValueMap.get(midpointTimestep);
      if (yValue === undefined) continue;

      mappedPoints.push({
        x: midpointTimestep * 1000,
        y: yValue,
        custom: {
          info: `Matched flight ${similarityItem.comparedFlightIndex}, label ${similarityItem.label}, score ${Number(similarityItem.finalScore).toFixed(2)}`,
          historicalId:
            similarityItem.comparedFlightIndex + '_' + midpointTimestep,
        },
      });
    }

    return mappedPoints;
  }

  public createGridChart(
    container: HTMLElement,
    paramName: string,
    flightData: TelemetrySensorFields[],
  ): Highcharts.Chart {
    const dataPoints: [number, number][] = this.buildSeries(
      flightData,
      paramName,
    );
    const baseColor: string = '#8b5cf6';
    const gradientTopColor: string = Highcharts.color(baseColor)
      .setOpacity(0.25)
      .get('rgba') as string;
    const gradientBottomColor: string = Highcharts.color(baseColor)
      .setOpacity(0.02)
      .get('rgba') as string;

    return Highcharts.chart(container, {
      chart: {
        backgroundColor: 'transparent',
        zooming: { type: 'x' },
        panning: {
          enabled: true,
          type: 'x',
        },
        events: {
          load: function () {
            const chart = this;
            chart.container.ondblclick = function () {
              chart.xAxis[0].setExtremes(undefined, undefined);
            };
          },
        },
      },
      title: { text: '' },
      credits: { enabled: false },
      legend: { enabled: false },
      xAxis: {
        type: 'datetime',
        gridLineColor: 'rgba(255,255,255,0.08)',
        gridLineWidth: 1,
        labels: { style: { color: '#cfcfe6' } },
      },
      yAxis: {
        title: { text: '' },
        gridLineColor: 'rgba(255,255,255,0.08)',
        gridLineWidth: 1,
        labels: { style: { color: '#cfcfe6' } },
      },
      tooltip: {
        shared: false,
        snap: 80,
        useHTML: true,
      },
      plotOptions: {
        series: {
          states: {
            inactive: {
              opacity: 1,
            },
          },
        },
        areaspline: {
          marker: { enabled: false },
        },
        scatter: {
          stickyTracking: true,
        },
      },
      series: [
        {
          type: 'areaspline',
          name: paramName,
          data: dataPoints,
          color: baseColor,
          lineWidth: 1.5,
          marker: { enabled: false },
          threshold: null,
          softThreshold: false,
          fillColor: {
            linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
            stops: [
              [0, gradientTopColor],
              [1, gradientBottomColor],
            ],
          },
          shadow: false,
        } as Highcharts.SeriesOptionsType,
      ],
    });
  }
}
