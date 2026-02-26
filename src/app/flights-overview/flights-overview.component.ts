import { Component, OnInit } from '@angular/core';
import { FlightArchiveService } from '../services/flight-archive.service';
import { FlightSummary } from '../common/interfaces/flight-summary.interface';
import { TelemetrySensorFields } from '../common/interfaces/telemetry-sensor-fields.interface';
import { forkJoin } from 'rxjs';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Router } from '@angular/router';

interface ParameterOverview {
  name: string;
  anomalies: number;
  historicalPoints: number;
}

@Component({
  selector: 'app-flights-overview',
  templateUrl: './flights-overview.component.html',
  styleUrls: ['./flights-overview.component.scss'],
})
export class FlightsOverviewComponent implements OnInit {
  public flights: FlightSummary[] = [];
  public expandedFlight: number | null = null;
  public parametersMap: Map<number, ParameterOverview[]> = new Map();

  public rawAnomaliesMap: Map<number, Record<string, number[]>> = new Map<
    number,
    Record<string, number[]>
  >();

  public searchTerm: string = '';
  public sortBy: 'anomalies' | 'historical' = 'historical';

  public constructor(
    private readonly archiveService: FlightArchiveService,
    private readonly router: Router,
  ) {}

  public ngOnInit(): void {
    this.archiveService.getAllFlights().subscribe((flights: FlightSummary[]) => {
      this.flights = flights ?? [];

      this.flights.forEach((flight: FlightSummary) => {
        this.loadAnomaliesForFlight(flight.flightNumber);
      });
    });
  }

  public toggleFlight(masterIndex: number): void {
    if (this.expandedFlight === masterIndex) {
      this.expandedFlight = null;
      return;
    }

    this.expandedFlight = masterIndex;

    if (this.parametersMap.has(masterIndex)) {
      return;
    }

    this.archiveService
      .getAllSpecialPointsForFlight(masterIndex)
      .subscribe((response) => {
        if (!response) {
          this.parametersMap.set(masterIndex, []);
          return;
        }

        this.rawAnomaliesMap.set(masterIndex, response.anomalies);

        const parameterOverviewList: ParameterOverview[] = Object.keys(
          response.anomalies,
        ).map((parameterName: string) => ({
          name: parameterName,
          anomalies: response.anomalies[parameterName]?.length ?? 0,
          historicalPoints: response.historicalSimilarity[parameterName]?.length ?? 0,
        }));

        this.parametersMap.set(masterIndex, parameterOverviewList);
      });
  }

  public isExpanded(masterIndex: number): boolean {
    return this.expandedFlight === masterIndex;
  }

  public getTotalAnomalies(masterIndex: number): number {
    const anomaliesRecord: Record<string, number[]> | undefined =
      this.rawAnomaliesMap.get(masterIndex);

    if (!anomaliesRecord) {
      return 0;
    }

    const anomalyArrays: number[][] = Object.values(anomaliesRecord) as number[][];

    const totalAnomalyCount: number = anomalyArrays.reduce(
      (runningTotal: number, anomalyArray: number[]) => runningTotal + anomalyArray.length,
      0,
    );

    return totalAnomalyCount;
  }

  public getDurationText(totalSeconds: number): string {
    const secondsInDay: number = 86400;
    const secondsInHour: number = 3600;
    const secondsInMinute: number = 60;

    const days: number = Math.floor(totalSeconds / secondsInDay);
    const remainingAfterDays: number = totalSeconds % secondsInDay;

    const hours: number = Math.floor(remainingAfterDays / secondsInHour);
    const remainingAfterHours: number = remainingAfterDays % secondsInHour;

    const minutes: number = Math.floor(remainingAfterHours / secondsInMinute);
    const seconds: number = remainingAfterHours % secondsInMinute;

    const durationParts: string[] = [];

    if (days > 0) durationParts.push(`${days}d`);
    if (hours > 0 || days > 0) durationParts.push(`${hours}h`);
    if (minutes > 0 || hours > 0 || days > 0) durationParts.push(`${minutes}m`);
    durationParts.push(`${seconds}s`);

    return durationParts.join(' ');
  }

  public getVisibleParameters(masterIndex: number): ParameterOverview[] {
    const allParameters: ParameterOverview[] = this.parametersMap.get(masterIndex) ?? [];

    const filteredParameters: ParameterOverview[] = allParameters.filter(
      (parameterOverview: ParameterOverview) =>
        parameterOverview.name.toLowerCase().includes(this.searchTerm.toLowerCase()),
    );

    const sortedParameters: ParameterOverview[] = filteredParameters.sort(
      (firstParam: ParameterOverview, secondParam: ParameterOverview) => {
        if (this.sortBy === 'historical') {
          return secondParam.historicalPoints - firstParam.historicalPoints;
        }
        return secondParam.anomalies - firstParam.anomalies;
      },
    );

    return sortedParameters;
  }

  public onSearchChange(searchValue: string): void {
    this.searchTerm = searchValue;
  }

  public clearSearch(): void {
    this.searchTerm = '';
  }

  public setSort(sortType: 'anomalies' | 'historical'): void {
    this.sortBy = sortType;
  }

  public openParameter(masterIndex: number, paramName: string): void {
    this.router.navigate(
      ['/archive', masterIndex],
      { queryParams: { param: paramName } },
    );
  }

  private loadAnomaliesForFlight(masterIndex: number): void {
    if (this.parametersMap.has(masterIndex)) return;

    this.archiveService
      .getAllSpecialPointsForFlight(masterIndex)
      .subscribe((response) => {
        if (!response) {
          this.parametersMap.set(masterIndex, []);
          return;
        }

        this.rawAnomaliesMap.set(masterIndex, response.anomalies);

        const parameterOverviewList: ParameterOverview[] = Object.keys(
          response.anomalies,
        ).map((parameterName: string) => ({
          name: parameterName,
          anomalies: response.anomalies[parameterName]?.length ?? 0,
          historicalPoints: response.historicalSimilarity[parameterName]?.length ?? 0,
        }));

        this.parametersMap.set(masterIndex, parameterOverviewList);
      });
  }
}