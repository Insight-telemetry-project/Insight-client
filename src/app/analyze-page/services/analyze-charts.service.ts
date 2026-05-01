import { Injectable, NgZone } from '@angular/core';
import * as Highcharts from 'highcharts';
import { TelemetrySensorFields } from '../../common/interfaces/telemetry-sensor-fields.interface';
@Injectable({ providedIn: 'root' })
export class AnalyzeChartsService {
  constructor(private ngZone: NgZone) {
    (window as any).ngZoneRef = this.ngZone;
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
        point: {
          events: {
            click: function (event: Highcharts.PointClickEventObject) {
              const point = this as Highcharts.Point;

              const zone = (
                window as unknown as {
                  ngZoneRef: import('@angular/core').NgZone;
                }
              ).ngZoneRef;

              if (zone) {
                const mouseEvent = event as unknown as MouseEvent;
                const matchesCount =
                  (point.options as any).custom?.matchesCount ?? 1;
                zone.run(() => {
                  window.dispatchEvent(
                    new CustomEvent('anomaly-click', {
                      detail: {
                        type: 'anomaly',
                        x: point.x,
                        y: point.y,
                        param: paramName,
                        clientX: mouseEvent.clientX,
                        clientY: mouseEvent.clientY,
                        matchesCount: matchesCount,
                      },
                    }),
                  );
                });
              }
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

        tooltip: {
          useHTML: true,
          pointFormat: `
    <b style="color:#facc15">Historical</b><br/>
    <b>${paramName}</b>: {point.y}<br/>
    Time: {point.x:%H:%M:%S}
  `,
        },

        point: {
          events: {
            mouseOver: function () {
              if (!this || this.y === undefined) return;

              const historicalId: string | undefined = (this.options as any)
                ?.custom?.historicalId;

              if (!historicalId) return;

              const anomalyTime: string = historicalId
                .split('_')
                .slice(1)
                .join('_');

              const zone = (window as any).ngZoneRef;

              if (zone) {
                zone.run(() => {
                  window.dispatchEvent(
                    new CustomEvent('historical-point-hover', {
                      detail: { historicalId, anomalyTime },
                    }),
                  );
                });
              }
            },
            mouseOut: function () {
              const zone = (window as any).ngZoneRef;

              if (zone) {
                zone.run(() => {
                  window.dispatchEvent(
                    new CustomEvent('historical-point-hover', {
                      detail: null,
                    }),
                  );
                });
              }
            },
            click: function (event: Highcharts.PointClickEventObject) {
              const point = this as Highcharts.Point;

              const historicalId = (
                point.options as {
                  custom?: { historicalId?: string };
                }
              ).custom?.historicalId;

              const zone = (
                window as unknown as {
                  ngZoneRef: import('@angular/core').NgZone;
                }
              ).ngZoneRef;

              if (zone) {
                const mouseEvent = event as unknown as MouseEvent;
                zone.run(() => {
                  window.dispatchEvent(
                    new CustomEvent('anomaly-click', {
                      detail: {
                        type: 'historical',
                        x: point.x,
                        y: point.y,
                        param: paramName,
                        historicalId: historicalId,
                        clientX: mouseEvent.clientX,
                        clientY: mouseEvent.clientY,
                      },
                    }),
                  );
                });
              }
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
    const times: number[] = [];
    const values: number[] = [];

    for (const row of flightData) {
      const value = row.fields[paramName];
      if (value === undefined || value === null) continue;

      times.push(row.timestep);
      values.push(value);
    }

    const findClosestIndex = (target: number): number => {
      let left = 0;
      let right = times.length - 1;

      while (left <= right) {
        const mid = Math.floor((left + right) / 2);

        if (times[mid] === target) return mid;

        if (times[mid] < target) left = mid + 1;
        else right = mid - 1;
      }

      if (left >= times.length) return times.length - 1;
      if (right < 0) return 0;

      return Math.abs(times[left] - target) < Math.abs(times[right] - target)
        ? left
        : right;
    };

    const mappedPoints: Highcharts.PointOptionsObject[] = [];

    for (const similarityItem of similarityItems) {
      const anomalyTime = Number(similarityItem.anomalyTime);

      const index = findClosestIndex(anomalyTime);
      const closestTime = times[index];
      const yValue = values[index];

      const historicalId =
        similarityItem.comparedFlightIndex + '_' + anomalyTime;

      mappedPoints.push({
        x: closestTime * 1000,
        y: yValue,
        custom: {
          historicalId: historicalId,
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
    const fullData: [number, number][] = this.buildSeries(
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

    return this.ngZone.runOutsideAngular(() => {
      return Highcharts.chart(container, {
        chart: {
          backgroundColor: 'transparent',
          animation: false,
          zooming: {
            type: 'x',
            resetButton: {
              theme: {
                fill: 'rgba(15, 20, 40, 0.88)',
                stroke: 'rgba(100, 200, 255, 0.45)',
                r: 6,
                'stroke-width': 1,
                style: {
                  color: 'rgba(100, 200, 255, 0.9)',
                  fontSize: '11px',
                  fontWeight: '600',
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                },
                states: {
                  hover: {
                    fill: 'rgba(60, 160, 255, 0.22)',
                    stroke: 'rgba(100, 200, 255, 0.75)',
                    style: { color: '#64c8ff' },
                  },
                },
              },
              position: { align: 'right', verticalAlign: 'top', x: -8, y: 8 },
            },
          } as any,
          panning: {
            enabled: true,
            type: 'x',
          },
          panKey: 'ctrl',

          events: {
            load: function () {
              const chart = this;
              chart.container.ondblclick = function () {
                chart.zoomOut();
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
          events: {
            afterSetExtremes: (() => {
              let rafId: number | null = null;
              return function (e: any) {
                const snapshot = { userMin: e.userMin, userMax: e.userMax, min: e.min, max: e.max };
                if (rafId !== null) cancelAnimationFrame(rafId);
                rafId = requestAnimationFrame(() => {
                  rafId = null;
                  const zone = (window as any).ngZoneRef;
                  if (!zone) return;
                  const isReset = snapshot.userMin == null && snapshot.userMax == null;
                  zone.run(() => {
                    window.dispatchEvent(new CustomEvent(
                      isReset ? 'chart-zoom-reset' : 'chart-zoom-update',
                      { detail: isReset
                          ? { param: paramName }
                          : { param: paramName, min: snapshot.min, max: snapshot.max } },
                    ));
                  });
                });
              };
            })(),
          },
        },
        yAxis: {
          title: { text: '' },
          gridLineColor: 'rgba(255,255,255,0.08)',
          gridLineWidth: 1,
          labels: { style: { color: '#cfcfe6' } },
        },
        tooltip: {
          shared: true,
          snap: 10,
          xDateFormat: '%H:%M:%S',
        },
        plotOptions: {
          series: {
            animation: false,
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
            stickyTracking: false,
          },
        },
        series: [
          {
            type: 'areaspline',
            name: paramName,
            data: fullData,
            turboThreshold: 0,
            enableMouseTracking: true,
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
    });
  }
  splitAnomaliesByHistorical(
    anomalyTimes: number[],
    historicalWindows: { start: number; end: number }[],
  ) {
    const red: number[] = [];
    const yellow: number[] = [];

    for (const t of anomalyTimes) {
      let isHistorical = false;

      for (const window of historicalWindows) {
        if (t >= window.start && t <= window.end) {
          isHistorical = true;
          break;
        }
      }

      if (isHistorical) yellow.push(t);
      else red.push(t);
    }

    return { red, yellow };
  }
}
