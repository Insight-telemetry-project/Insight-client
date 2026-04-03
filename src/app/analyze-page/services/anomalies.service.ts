import { Injectable } from '@angular/core';
import * as Highcharts from 'highcharts';
import { TelemetrySensorFields } from '../../common/interfaces/telemetry-sensor-fields.interface';
import { AnalyzeChartsService } from './analyze-charts.service';
import { AnomalyWindow } from '../../common/interfaces/anomaly-window.interface';

@Injectable({ providedIn: 'root' })
export class AnomaliesService {
  public constructor(
    private readonly chartsService: AnalyzeChartsService,
  ) {}

  public loadAndShowAnomalies(
  parameterName: string,
  flightData: TelemetrySensorFields[],
  flightMeta: any,
  chart: Highcharts.Chart,
): void {

  const anomalyWindows = flightMeta?.anomalies?.[parameterName] ?? [];
  const historicalSimilarityPoints =
    flightMeta?.historicalSimilarity?.[parameterName] ?? [];

  const anomalyTimes: number[] =
    anomalyWindows.map((window: any) => Number(window.representativeEpoch));

  const historicalWindows = historicalSimilarityPoints.map((point: any) => ({
    start: Number(point.startEpoch),
    end: Number(point.endEpoch),
    anomalyTime: Number(point.anomalyTime),
  }));

  
  const allAnomalyPoints =
    this.chartsService.mapAnomalyEpochSecondsToXY(
      flightData,
      parameterName,
      anomalyTimes,
    );

  const redPoints: [number, number][] = [];
  const yellowPoints: [number, number][] = [];

  for (let i = 0; i < anomalyTimes.length; i++) {
    const anomalyTime = anomalyTimes[i];
    const pointXY = allAnomalyPoints[i];

    let isHistorical = false;

    for (const window of historicalWindows) {
      if (anomalyTime >= window.start && anomalyTime <= window.end) {
        isHistorical = true;
        break;
      }
    }

    if (isHistorical) {
      yellowPoints.push(pointXY);
    } else {
      redPoints.push(pointXY);
    }
  }

  
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
}