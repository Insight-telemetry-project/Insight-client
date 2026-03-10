import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { TelemetrySensorFields } from '../common/interfaces/telemetry-sensor-fields.interface';
import { FlightSummary } from '../common/interfaces/flight-summary.interface';
import { HistoricalSimilarityPoint } from '../common/interfaces/historical-similarity-point.interface';
import { FlightPoints } from '../common/interfaces/flight-points';

@Injectable({
  providedIn: 'root'
})
export class FlightArchiveService {
  private readonly baseUrl: string = 'https://localhost:7219/TelemetryDataArchive';

  public constructor(private readonly http: HttpClient) {}

  public getAllFlights(): Observable<FlightSummary[]> {
    return this.http.get<FlightSummary[]>(`${this.baseUrl}/all-flight`);
  }

  public getFlightFields(masterIndex: number): Observable<TelemetrySensorFields[]> {
    return this.http.get<TelemetrySensorFields[]>(`${this.baseUrl}/fields/${masterIndex}`);
  }

  public deleteFlight(masterIndex: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/delete-flight/${masterIndex}`);
  }

  public getFlightPointsParam(masterIndex: number, parameter: string): Observable<number[]> {
  const encodedParameter: string = encodeURIComponent(parameter);

  return this.http.get<number[]>(
    `${this.baseUrl}/get-flight-points/${masterIndex}/${encodedParameter}`
  );
}
  public getFlightConnectionsParam(masterIndex: number, parameter: string): Observable<string[]> {
  const encodedParameter: string = encodeURIComponent(parameter);

  return this.http.get<string[]>(
    `${this.baseUrl}/get-flight-connections/${masterIndex}/${encodedParameter}`
  );
}

  public getFlightHistoricalSimilarity(masterIndex: number, parameter: string): Observable<HistoricalSimilarityPoint[]> {
  const encodedParameter: string = encodeURIComponent(parameter);

  return this.http.get<HistoricalSimilarityPoint[]>(
    `${this.baseUrl}/get-flight-historical-similarity/${masterIndex}/${encodedParameter}`
  );
}

public getAllSpecialPointsForFlight(masterIndex: number): Observable<FlightPoints> {
  return this.http.get<FlightPoints>(
    `${this.baseUrl}/get-all-special-points-for-flight/${masterIndex}`
  );
}

public exportFlight(masterIndex: number, format: string): Observable<Blob> {
  return this.http.get(
    `${this.baseUrl}/export/${masterIndex}/${format}`,
    { responseType: 'blob' }
  );
}

}