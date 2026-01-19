import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FlightArchiveService } from '../../services/flight-archive.service';
import { FlightSummary } from '../../../common/interfaces/flight-summary.interface';

type ModalState = 'idle' | 'loading' | 'error' | 'ready';

@Component({
  selector: 'app-flights-modal',
  templateUrl: './flights-modal.component.html',
  styleUrls: ['./flights-modal.component.scss']
})
export class FlightsModalComponent implements OnChanges {
  @Input() public isOpen: boolean = false;

  @Output() public closed: EventEmitter<void> = new EventEmitter<void>();
  @Output() public flightSelected: EventEmitter<number> = new EventEmitter<number>();

  public state: ModalState = 'idle';
  public flights: FlightSummary[] = [];
  public errorMessage: string = '';

  public constructor(private readonly flightArchiveService: FlightArchiveService) {}

  public ngOnChanges(changes: SimpleChanges): void {
    if (!changes['isOpen']) return;

    if (this.isOpen) {
      this.fetchFlights();
      return;
    }

    this.resetState();
  }

  public close(): void {
    this.closed.emit();
  }

  public onBackdropClick(event: MouseEvent): void {
    const target: HTMLElement = event.target as HTMLElement;
    if (target.classList.contains('backdrop')) {
      this.close();
    }
  }

  public selectFlight(flightNumber: number): void {
    this.flightSelected.emit(flightNumber);
  }

  public retry(): void {
    this.fetchFlights();
  }

  private fetchFlights(): void {
    this.state = 'loading';
    this.errorMessage = '';
    this.flights = [];

    this.flightArchiveService.getAllFlights().subscribe({
      next: (result: FlightSummary[]) => {
        this.flights = result ?? [];
        this.state = 'ready';
      },
      error: () => {
        this.state = 'error';
        this.errorMessage = 'Failed to load flights. Check server.';
      }
    });
  }

  private resetState(): void {
    this.state = 'idle';
    this.errorMessage = '';
    this.flights = [];
  }
}
