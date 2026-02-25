import { Component, OnInit } from '@angular/core';
import { FlightArchiveService } from '../services/flight-archive.service';
import { FlightSummary } from '../common/interfaces/flight-summary.interface';
import { TelemetrySensorFields } from '../common/interfaces/telemetry-sensor-fields.interface';
import { forkJoin } from 'rxjs';

interface ParameterOverview {
  name: string;
  anomalies: number;
  historicalPoints: number;
}

@Component({
  selector: 'app-flights-overview',
  templateUrl: './flights-overview.component.html',
  styleUrls: ['./flights-overview.component.scss']
})
export class FlightsOverviewComponent implements OnInit {

  public flights: FlightSummary[] = [];
  public expandedFlight: number | null = null;
  public parametersMap: Map<number, ParameterOverview[]> = new Map();

  constructor(private readonly archive: FlightArchiveService) {}

  ngOnInit(): void {
    this.archive.getAllFlights().subscribe(f => this.flights = f ?? []);
  }

  toggleFlight(masterIndex: number): void {

    if (this.expandedFlight === masterIndex) {
      this.expandedFlight = null;
      return;
    }

    this.expandedFlight = masterIndex;

    if (this.parametersMap.has(masterIndex)) return;

    this.archive.getFlightFields(masterIndex).subscribe(snapshots => {

      if (!snapshots || snapshots.length === 0) {
        this.parametersMap.set(masterIndex, []);
        return;
      }

      const paramNames = Object.keys(snapshots[0].fields);
      const historicalPoints = snapshots.length;

      const calls = paramNames.map(p =>
        this.archive.getFlightHistoricalSimilarity(masterIndex, p)
      );

      forkJoin(calls).subscribe(results => {

        const overview: ParameterOverview[] = paramNames.map((name, i) => ({
          name,
          anomalies: results[i].length,
          historicalPoints
        }));

        this.parametersMap.set(masterIndex, overview);
      });
    });
  }

  isExpanded(id: number): boolean {
    return this.expandedFlight === id;
  }

  getTotalAnomalies(id: number): number {
    return this.parametersMap.get(id)?.reduce((s, p) => s + p.anomalies, 0) ?? 0;
  }

  getAnomalyColor(count: number): string {
    if (count === 0) return '#22c55e';
    if (count <= 2) return '#f59e0b';
    return '#ef4444';
  }
}