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

  constructor(
    private readonly archive: FlightArchiveService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.archive.getAllFlights().subscribe((flights) => {
      this.flights = flights ?? [];

      this.flights.forEach((flight) => {
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

    this.archive
      .getAllSpecialPointsForFlight(masterIndex)
      .subscribe((response) => {
        if (!response) {
          this.parametersMap.set(masterIndex, []);
          return;
        }

        this.rawAnomaliesMap.set(masterIndex, response.anomalies);

        const overview: ParameterOverview[] = Object.keys(
          response.anomalies,
        ).map((parameterName) => ({
          name: parameterName,
          anomalies: response.anomalies[parameterName]?.length ?? 0,
          historicalPoints:
            response.historicalSimilarity[parameterName]?.length ?? 0,
        }));

        this.parametersMap.set(masterIndex, overview);
      });
  }

  public isExpanded(id: number): boolean {
    return this.expandedFlight === id;
  }

  public getTotalAnomalies(id: number): number {
    const anomalies: Record<string, number[]> | undefined =
      this.rawAnomaliesMap.get(id);

    if (!anomalies) {
      return 0;
    }

    const values: number[][] = Object.values(anomalies) as number[][];

    const total: number = values.reduce((sum: number, arr: number[]) => {
      return sum + arr.length;
    }, 0);

    return total;
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

    const parts: string[] = [];

    if (days > 0) parts.push(`${days}d`);
    if (hours > 0 || days > 0) parts.push(`${hours}h`);
    if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);

    return parts.join(' ');
  }
  private loadAnomaliesForFlight(masterIndex: number): void {
    if (this.parametersMap.has(masterIndex)) return;

    this.archive
      .getAllSpecialPointsForFlight(masterIndex)
      .subscribe((response) => {
        if (!response) {
          this.parametersMap.set(masterIndex, []);
          return;
        }

        this.rawAnomaliesMap.set(masterIndex, response.anomalies);

        const overview: ParameterOverview[] = Object.keys(
          response.anomalies,
        ).map((parameterName) => ({
          name: parameterName,
          anomalies: response.anomalies[parameterName]?.length ?? 0,
          historicalPoints:
            response.historicalSimilarity[parameterName]?.length ?? 0,
        }));

        this.parametersMap.set(masterIndex, overview);
      });
  }
  public getVisibleParameters(masterIndex: number): ParameterOverview[] {

  const data: ParameterOverview[] =
    this.parametersMap.get(masterIndex) ?? [];

  const filtered: ParameterOverview[] =
    data.filter(p =>
      p.name.toLowerCase().includes(this.searchTerm.toLowerCase())
    );

  const sorted: ParameterOverview[] =
    filtered.sort((a, b) => {
      if (this.sortBy === 'historical') {
        return b.historicalPoints - a.historicalPoints;
      }
      return b.anomalies - a.anomalies;
    });

  return sorted;
}
public onSearchChange(value: string): void {
  this.searchTerm = value;
}

public clearSearch(): void {
  this.searchTerm = '';
}

public setSort(type: 'anomalies' | 'historical'): void {
  this.sortBy = type;
}
public openParameter(masterIndex: number, paramName: string): void {
  this.router.navigate(
    ['/archive', masterIndex],
    { queryParams: { param: paramName } }
  );
}
}
