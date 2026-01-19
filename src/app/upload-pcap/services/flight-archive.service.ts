import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { FlightSummary } from '../../common/interfaces/flight-summary.interface';

@Injectable({ providedIn: 'root' })
export class FlightArchiveService {
  private readonly baseUrl: string = 'https://localhost:7219/TelemetryDataArchive';

  public constructor(private readonly httpClient: HttpClient) {}

  public getAllFlights(): Observable<FlightSummary[]> {
    return this.httpClient.get<FlightSummary[]>(`${this.baseUrl}/all-flight`);
  }
}
