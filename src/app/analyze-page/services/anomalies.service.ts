import { Injectable } from '@angular/core';
import { Subscription } from 'rxjs';
import { FlightArchiveService } from '../../services/flight-archive.service';
import { TelemetrySensorFields } from '../../common/interfaces/telemetry-sensor-fields.interface';
import { AnalyzeChartsService } from './analyze-charts.service';

@Injectable({ providedIn: 'root' })
export class AnomaliesService {
  public constructor(
    private readonly archiveService: FlightArchiveService,
    private readonly chartsService: AnalyzeChartsService,
  ) {}

  public loadAndShowAnomalies(
    masterIndex: number,
    paramName: string,
    flightData: TelemetrySensorFields[],
    chart: import('highcharts').Chart,
    subscriptions: Subscription,
  ): void {
    const anomaliesSubscription: Subscription = this.archiveService
      .getFlightPointsParam(masterIndex, paramName)
      .subscribe({
        next: (anomalyEpochSecondsList: number[]) => {
          const anomalyPoints: [number, number][] =
            this.chartsService.mapAnomalyEpochSecondsToXY(
              flightData,
              paramName,
              anomalyEpochSecondsList,
            );
          this.chartsService.addOrReplaceAnomaliesSeries(chart, paramName, anomalyPoints);
        },
        error: (error: any) =>
          console.error('Failed to load anomalies for', paramName, error),
      });

    subscriptions.add(anomaliesSubscription);
  }
}