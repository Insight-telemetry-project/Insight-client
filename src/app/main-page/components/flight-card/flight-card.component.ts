import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FlightSummary } from '../../../common/interfaces/flight-summary.interface';
import Swal from 'sweetalert2';
import { FlightArchiveService } from 'src/app/services/flight-archive.service';

@Component({
  selector: 'app-flight-card',
  templateUrl: './flight-card.component.html',
  styleUrls: ['./flight-card.component.scss']
})
export class FlightCardComponent {
  @Input() public flight!: FlightSummary;
  @Output() public selected: EventEmitter<number> = new EventEmitter<number>();
  @Output() public flightDeleted: EventEmitter<number> = new EventEmitter<number>();

  private readonly flightArchiveService: FlightArchiveService;

  constructor(flightArchiveService: FlightArchiveService) {
    this.flightArchiveService = flightArchiveService;
  }

  public onSelect(): void {
    this.selected.emit(this.flight.flightNumber);
  }

  public getDurationText(): string {
    const totalSeconds: number = Number(this.flight.flightLenght) || 0;
    const secondsInDay: number = 86400;
    const secondsInHour: number = 3600;
    const secondsInMinute: number = 60;

    const days: number = Math.floor(totalSeconds / secondsInDay);
    const remainingSecondsAfterDays: number = totalSeconds % secondsInDay;
    const hours: number = Math.floor(remainingSecondsAfterDays / secondsInHour);
    const remainingSecondsAfterHours: number = remainingSecondsAfterDays % secondsInHour;
    const minutes: number = Math.floor(remainingSecondsAfterHours / secondsInMinute);
    const seconds: number = remainingSecondsAfterHours % secondsInMinute;

    const timeParts: string[] = [];
    if (days > 0) timeParts.push(`${days}d`);
    if (hours > 0 || days > 0) timeParts.push(`${hours}h`);
    if (minutes > 0 || hours > 0 || days > 0) timeParts.push(`${minutes}m`);
    timeParts.push(`${seconds}s`);

    return timeParts.join(' ');
  }

  public onDelete(): void {
    Swal.fire({
      title: "Are you sure?",
      text: `You are about to delete flight ${this.flight.flightNumber}.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#b060ff",
      cancelButtonColor: "rgba(255, 255, 255, 0.1)",
      confirmButtonText: "Yes, delete it!",
      background: "#1a1428",
      color: "#fff"
    }).then((sweetAlertResult) => {
      if (sweetAlertResult.isConfirmed) {
        this.flightArchiveService.deleteFlight(this.flight.flightNumber).subscribe({
          next: () => {
            Swal.fire({
              title: "Deleted!",
              text: "The flight data has been removed.",
              icon: "success",
              background: "#1a1428",
              color: "#fff",
              confirmButtonColor: "#b060ff"
            });
            this.flightDeleted.emit(this.flight.flightNumber);
          },
          error: (serverError) => {
            Swal.fire({
              title: "Error!",
              text: "Something went wrong while deleting.",
              icon: "error",
              background: "#1a1428",
              color: "#fff"
            });
            console.error(serverError);
          }
        });
      }
    });
  }
}