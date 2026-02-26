import { Injectable } from '@angular/core';
import { Subscription } from 'rxjs';
import { FlightArchiveService } from '../../services/flight-archive.service';
import { TelemetrySensorFields } from '../../common/interfaces/telemetry-sensor-fields.interface';
import { HistoricalSimilarityPoint } from '../../common/interfaces/historical-similarity-point.interface';
import { HistoricalSidebarItem } from '../../common/interfaces/historical-sidebar-item.interface';
import { AnalyzeChartsService } from './analyze-charts.service';

@Injectable({ providedIn: 'root' })
export class HistoricalSimilarityService {
  public sidebarItems: HistoricalSidebarItem[] = [];

  private historicalKeySet: Set<string> = new Set<string>();

  public constructor(
    private readonly archiveService: FlightArchiveService,
    private readonly chartsService: AnalyzeChartsService,
  ) {}

  public reset(): void {
    this.sidebarItems = [];
    this.historicalKeySet.clear();
  }

  public loadAndShowHistoricalSimilarity(
    masterIndex: number,
    paramName: string,
    flightData: TelemetrySensorFields[],
    chart: import('highcharts').Chart,
    subscriptions: Subscription,
  ): void {
    const historicalSubscription: Subscription = this.archiveService
      .getFlightHistoricalSimilarity(masterIndex, paramName)
      .subscribe({
        next: (historicalSimilarityPoints: HistoricalSimilarityPoint[]) => {
          const similarityChartPoints: import('highcharts').PointOptionsObject[] =
            this.chartsService.mapHistoricalSimilarityToPoints(
              flightData,
              paramName,
              historicalSimilarityPoints,
            );

          this.chartsService.addOrReplaceHistoricalSimilaritySeries(
            chart,
            paramName,
            similarityChartPoints,
          );

          this.appendSidebarItems(paramName, historicalSimilarityPoints);
        },
        error: (error: any) =>
          console.error('Failed to load historical similarity for', paramName, error),
      });

    subscriptions.add(historicalSubscription);
  }

  private appendSidebarItems(
    paramName: string,
    historicalSimilarityPoints: HistoricalSimilarityPoint[],
  ): void {
    const newSidebarItems: HistoricalSidebarItem[] = historicalSimilarityPoints.map(
      (similarityPoint: HistoricalSimilarityPoint) => {
        const startIndex: number = Number(similarityPoint.startIndex);
        const endIndex: number = Number(similarityPoint.endIndex);
        const midpointTime: number = Math.round((startIndex + endIndex) / 2);

        return {
          param: paramName,
          comparedFlightIndex: similarityPoint.comparedFlightIndex,
          label: similarityPoint.label,
          score: Number(similarityPoint.finalScore),
          time: midpointTime,
        };
      },
    );

    for (const sidebarItem of newSidebarItems) {
      const uniqueKey: string = `${sidebarItem.param}_${sidebarItem.comparedFlightIndex}_${sidebarItem.time}_${sidebarItem.label}`;

      if (!this.historicalKeySet.has(uniqueKey)) {
        this.historicalKeySet.add(uniqueKey);
        this.sidebarItems.push(sidebarItem);
      }
    }
  }
}