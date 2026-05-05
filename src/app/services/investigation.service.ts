import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Investigation } from '../common/interfaces/investigation.interface';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root',
})
export class InvestigationService {
  private readonly baseUrl: string = `${environment.archiveApi}/investigations`;

  public constructor(private readonly http: HttpClient) {}

  // public createInvestigation(investigation: Investigation): Observable<Investigation> {
  //   return this.http.post<Investigation>(this.baseUrl, investigation);
  // }

  // public getInvestigationsForFlight(masterIndex: number): Observable<Investigation[]> {
  //   return this.http.get<Investigation[]>(`${this.baseUrl}/flight/${masterIndex}`);
  // }
}
