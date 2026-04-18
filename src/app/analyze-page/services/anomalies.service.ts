import { Injectable } from '@angular/core';
import * as Highcharts from 'highcharts';
import { TelemetrySensorFields } from '../../common/interfaces/telemetry-sensor-fields.interface';
import { AnalyzeChartsService } from './analyze-charts.service';

@Injectable({ providedIn: 'root' })
export class AnomaliesService {
  public constructor(private readonly chartsService: AnalyzeChartsService) {}

  public loadAndShowAnomalies(
    parameterName: string,
    flightData: TelemetrySensorFields[],
    flightMeta: any,
    chart: Highcharts.Chart,
  ): void {
    const anomalyWindows = flightMeta?.anomalies?.[parameterName] ?? [];
    const historicalSimilarityPoints =
      flightMeta?.historicalSimilarity?.[parameterName] ?? [];

    const anomalyTimes: number[] = anomalyWindows.map((window: any) =>
      Number(window.representativeEpoch),
    );

    const historicalWindows = historicalSimilarityPoints.map((point: any) => ({
      start: Number(point.startEpoch),
      end: Number(point.endEpoch),
      anomalyTime: Number(point.anomalyTime),
    }));

    const allAnomalyPoints = this.chartsService.mapAnomalyEpochSecondsToXY(
      flightData,
      parameterName,
      anomalyTimes,
    );

    const { redPoints, yellowPoints } = this.splitAnomalyPointsByHistorical(
      anomalyTimes,
      allAnomalyPoints,
      historicalWindows,
    );

    this.chartsService.addOrReplaceAnomaliesSeries(
      chart,
      parameterName,
      redPoints,
    );

    this.chartsService.addOrReplaceHistoricalSimilaritySeries(
      chart,
      parameterName,
      yellowPoints,
    );
  }

  private splitAnomalyPointsByHistorical(
    anomalyTimes: number[],
    allAnomalyPoints: [number, number][],
    historicalWindows: { start: number; end: number; anomalyTime: number }[],
  ): { redPoints: [number, number][]; yellowPoints: [number, number][] } {
    const redPoints: [number, number][] = [];
    const yellowPoints: [number, number][] = [];

    for (let pointIndex = 0; pointIndex < anomalyTimes.length; pointIndex++) {
      const anomalyTime = anomalyTimes[pointIndex];
      const pointXY = allAnomalyPoints[pointIndex];

      const isHistorical = historicalWindows.some(
        (window) =>
          anomalyTime >= window.start && anomalyTime <= window.end,
      );

      if (isHistorical) {
        yellowPoints.push(pointXY);
      } else {
        redPoints.push(pointXY);
      }
    }

    return { redPoints, yellowPoints };
  }
}