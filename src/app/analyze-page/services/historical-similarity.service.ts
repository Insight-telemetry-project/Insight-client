import { Injectable } from '@angular/core';
import * as Highcharts from 'highcharts';
import { TelemetrySensorFields } from '../../common/interfaces/telemetry-sensor-fields.interface';
import { HistoricalSidebarItem } from '../../common/interfaces/historical-sidebar-item.interface';
import { AnalyzeChartsService } from './analyze-charts.service';

@Injectable({ providedIn: 'root' })
export class HistoricalSimilarityService {
  public sidebarItems: HistoricalSidebarItem[] = [];

  private historicalKeySet: Set<string> = new Set<string>();

  public constructor(
    private readonly chartsService: AnalyzeChartsService,
  ) {}

  public reset(): void {
    this.sidebarItems = [];
    this.historicalKeySet.clear();
  }

  public loadAndShowHistoricalSimilarity(
    parameterName: string,
    flightData: TelemetrySensorFields[],
    flightMeta: any,
    chart: Highcharts.Chart,
  ): void {

    const historicalSimilarityPoints =
      flightMeta?.historicalSimilarity?.[parameterName] ?? [];

    const similarityChartPoints =
      this.chartsService.mapHistoricalSimilarityToPoints(
        flightData,
        parameterName,
        historicalSimilarityPoints,
      );

    this.chartsService.addOrReplaceHistoricalSimilaritySeries(
      chart,
      parameterName,
      similarityChartPoints,
    );

    this.appendSidebarItems(parameterName, historicalSimilarityPoints);
  }

  private appendSidebarItems(
    parameterName: string,
    historicalSimilarityPoints: any[],
  ): void {

    const newSidebarItems: HistoricalSidebarItem[] =
      historicalSimilarityPoints.map((similarityPoint: any) => {

        const midpointTime: number = Number(similarityPoint.anomalyTime);

        return {
          param: parameterName,
          comparedFlightIndex: similarityPoint.comparedFlightIndex,
          label: similarityPoint.label,
          score: Number(similarityPoint.finalScore),
          time: midpointTime,
        };
      });

    for (const sidebarItem of newSidebarItems) {
      const uniqueKey: string =
        `${sidebarItem.param}_${sidebarItem.comparedFlightIndex}_${sidebarItem.time}_${sidebarItem.label}`;

      if (!this.historicalKeySet.has(uniqueKey)) {
        this.historicalKeySet.add(uniqueKey);
        this.sidebarItems.push(sidebarItem);
      }
    }
  }
}