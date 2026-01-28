import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FlightSummary } from '../../../common/interfaces/flight-summary.interface';

@Component({
  selector: 'app-flights-grid',
  templateUrl: './flight-grid.component.html',
  styleUrls: ['./flight-grid.component.scss']
})
export class FlightsGridComponent {
  @Input() public flights: FlightSummary[] = [];
  @Output() public flightSelected: EventEmitter<number> = new EventEmitter<number>();
  @Output() public flightDeleted: EventEmitter<number> = new EventEmitter<number>();

  public selectFlight(flightNumber: number): void {
    this.flightSelected.emit(flightNumber);
  }

  public deleteFlight(flightNumber: number): void {
    this.flightDeleted.emit(flightNumber);
  }

  public trackByFlightNumber(index: number, item: FlightSummary): number {
    return item.flightNumber;
  }
}
