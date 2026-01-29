import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FlightSummary } from '../../../common/interfaces/flight-summary.interface';

@Component({
  selector: 'app-flight-card',
  templateUrl: './flight-card.component.html',
  styleUrls: ['./flight-card.component.scss']
})
export class FlightCardComponent {
  @Input() public flight!: FlightSummary;
  @Output() public selected: EventEmitter<number> = new EventEmitter<number>();

  public onSelect(): void {
    this.selected.emit(this.flight.flightNumber);
  }

  public getDurationText(): string {
    const totalSeconds: number = Number(this.flight.flightLenght) || 0;

    const secondsInDay: number = 86400;
    const secondsInHour: number = 3600;
    const secondsInMinute: number = 60;

    const days: number = Math.floor(totalSeconds / secondsInDay);
    const afterDays: number = totalSeconds % secondsInDay;

    const hours: number = Math.floor(afterDays / secondsInHour);
    const afterHours: number = afterDays % secondsInHour;

    const minutes: number = Math.floor(afterHours / secondsInMinute);
    const seconds: number = afterHours % secondsInMinute;

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0 || days > 0) parts.push(`${hours}h`);
    if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);

    return parts.join(' ');
  }
}
