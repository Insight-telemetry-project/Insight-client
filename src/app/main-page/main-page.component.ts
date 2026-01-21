import { Component, OnInit } from '@angular/core';
import { FlightArchiveService } from '../services/flight-archive.service';
import { FlightSummary } from '../common/interfaces/flight-summary.interface';

@Component({
  selector: 'app-main-page',
  templateUrl: './main-page.component.html',
  styleUrls: ['./main-page.component.scss']
})
export class MainPageComponent implements OnInit {
  public flights: FlightSummary[] = [];
  public searchText: string = '';

  public constructor(private readonly flightArchiveService: FlightArchiveService) {}

  public ngOnInit(): void {
    this.loadFlights();
  }

  public get filteredFlights(): FlightSummary[] {
    const query: string = this.searchText.trim();
    if (query.length === 0) return this.flights;

    return this.flights.filter((flight: FlightSummary) =>
      String(flight.flightNumber).includes(query)
    );
  }

  public onSearchChange(value: string): void {
    this.searchText = value;
  }

  public clearSearch(): void {
    this.searchText = '';
  }

  public onAddFlight(): void {
  }

  public onFlightSelected(flightNumber: number): void {
  }

  private loadFlights(): void {
    this.flightArchiveService.getAllFlights().subscribe({
      next: (result: FlightSummary[]) => {
        this.flights = result ?? [];
      },
      error: () => {
        this.flights = [];
      }
    });
  }
}
