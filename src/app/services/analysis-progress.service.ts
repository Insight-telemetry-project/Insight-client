import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject } from 'rxjs';

export interface AnalysisProgress {
  flightId: number;
  completedParameters: number;
  totalParameters: number;
  parameter: string;
}

@Injectable({
  providedIn: 'root',
})
export class AnalysisProgressService {
  private connection!: signalR.HubConnection;

  private progressSubject = new Subject<AnalysisProgress>();

  public progress$ = this.progressSubject.asObservable();

  public connect(flightId: number): void {
    if (!this.connection) {
      this.connection = new signalR.HubConnectionBuilder()
        .withUrl('https://localhost:7274/analysis-progress', {
          withCredentials: true,
        })
        .withAutomaticReconnect()
        .build();

      this.connection.on('analysis-progress', (progress: AnalysisProgress) => {
        console.log('progress arrived', progress);
        this.progressSubject.next(progress);
      });

      this.connection.start().then(() => {
        this.connection.invoke('JoinFlight', flightId);
      });
    } else {
      this.connection.invoke('JoinFlight', flightId);
    }
  }

  public disconnect(): void {
    if (this.connection) {
      this.connection.stop();
    }
  }
}
