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

  private joinedFlights = new Set<number>();

  public async connect(flightId: number): Promise<void> {
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
    }

    if (this.connection.state === signalR.HubConnectionState.Disconnected) {
      await this.connection.start();
    }

    if (
      this.connection.state === signalR.HubConnectionState.Connected &&
      !this.joinedFlights.has(flightId)
    ) {
      await this.connection.invoke('JoinFlight', flightId);
      this.joinedFlights.add(flightId);
    }
  }

  public async leaveFlight(flightId: number): Promise<void> {
    if (
      this.connection &&
      this.connection.state === signalR.HubConnectionState.Connected &&
      this.joinedFlights.has(flightId)
    ) {
      await this.connection.invoke('LeaveFlight', flightId);
      this.joinedFlights.delete(flightId);
    }
  }

  public async disconnect(): Promise<void> {
    if (
      this.connection &&
      this.connection.state === signalR.HubConnectionState.Connected
    ) {
      await this.connection.stop();
      this.joinedFlights.clear();
    }
  }
}