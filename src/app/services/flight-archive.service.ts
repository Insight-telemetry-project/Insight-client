import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { FlightSummary } from '../common/interfaces/flight-summary.interface';

@Injectable({
  providedIn: 'root'
})
export class FlightArchiveService {
  private readonly baseUrl: string = 'https://localhost:7219/TelemetryDataArchive';

  public constructor(private readonly http: HttpClient) {}

  public getAllFlights(): Observable<FlightSummary[]> {
    return this.http.get<FlightSummary[]>(`${this.baseUrl}/all-flight`);
  }
}
