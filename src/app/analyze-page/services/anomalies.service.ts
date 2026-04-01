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

  console.log("------------- DEBUG HISTORICAL MATCHING -------------");
  console.log("Total anomalies:", anomalyTimes.length);
  console.log("Total historical records:", historicalSimilarityPoints.length);

  // כמה anomalies באמת מופיעות בהיסטורי
  const anomaliesThatAreHistorical = new Set<number>();

  for (const historicalPoint of historicalSimilarityPoints) {
    anomaliesThatAreHistorical.add(Number(historicalPoint.anomalyTime));
  }

  console.log("Unique anomalies that are historical:", anomaliesThatAreHistorical.size);

  console.log("AnomalyTimes:", anomalyTimes);
  console.log("Historical anomalyTimes:",
    historicalSimilarityPoints.map((p: any) => Number(p.anomalyTime))
  );

  // בדיקת התאמה לפי חלונות
  for (const anomalyTime of anomalyTimes) {
    let matched = false;

    for (const window of historicalWindows) {
      if (anomalyTime >= window.start && anomalyTime <= window.end) {
        matched = true;
        console.log("MATCH:", anomalyTime, "inside", window.start, "-", window.end);
        break;
      }
    }

    if (!matched) {
      console.log("NO MATCH:", anomalyTime);
    }
  }

  console.log("------------------------------------------------------");

  // מיפוי כל האנומליות לנקודות XY
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

  console.log("RED POINTS:", redPoints.length);
  console.log("YELLOW POINTS:", yellowPoints.length);

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