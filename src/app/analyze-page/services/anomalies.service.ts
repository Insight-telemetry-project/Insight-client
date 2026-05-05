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

    const anomalyTimes: number[] = anomalyWindows.map((window: any) =>
      Number(window.representativeEpoch),
    );

    const allAnomalyPoints = this.chartsService.mapAnomalyEpochSecondsToXY(
      flightData,
      parameterName,
      anomalyTimes,
    );

    this.chartsService.addOrReplaceAnomaliesSeries(
      chart,
      parameterName,
      allAnomalyPoints,
    );
  }
}