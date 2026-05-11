import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject } from 'rxjs';
import { environment } from 'src/environments/environment';

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
  private startPromise: Promise<void> | null = null;

  private progressSubject = new Subject<AnalysisProgress>();
  public progress$ = this.progressSubject.asObservable();

  private analysisFinishedSubject = new Subject<number>();
  public analysisFinished$ = this.analysisFinishedSubject.asObservable();

  private joinedFlights = new Set<number>();

  private analysisStageSubject = new Subject<{
    flightId: number;
    stage: string;
  }>();
  public analysisStage$ = this.analysisStageSubject.asObservable();

  public async connect(flightId: number): Promise<void> {
    if (!this.connection) {
      this.connection = new signalR.HubConnectionBuilder()
        .withUrl(`${environment.signalR}/analysis-progress`, {
          withCredentials: true,
        })
        .withAutomaticReconnect()
        .build();

      this.connection.on('analysis-progress', (progress: AnalysisProgress) => {
        console.log('progress arrived', progress);
        this.progressSubject.next(progress);
      });

      this.connection.on('analysis-finished', (data: any) => {
        this.analysisFinishedSubject.next(data.flightId);
      });

      this.connection.on('analysis-stage', (data: any) => {
        this.analysisStageSubject.next({
          flightId: data.flightId,
          stage: data.stage,
        });
      });
    }

    if (this.connection.state === signalR.HubConnectionState.Disconnected) {
      this.startPromise = this.connection.start();
    }

    if (this.startPromise) {
      await this.startPromise;
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
