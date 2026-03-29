import {
  Component,
  OnInit,
  HostListener,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { FlightArchiveService } from '../services/flight-archive.service';
import { FlightSummary } from '../common/interfaces/flight-summary.interface';
import { Router } from '@angular/router';
import { TelemetryDeviceService } from '../services/telemetry-device.services';
import Swal from 'sweetalert2';
import { AnalysisProgressService } from '../services/analysis-progress.service';

interface ParameterOverview {
  name: string;
  anomalies: number;
  historicalPoints: number;
}

@Component({
  selector: 'app-flights-overview',
  templateUrl: './flights-overview.component.html',
  styleUrls: ['./flights-overview.component.scss'],
})
export class FlightsOverviewComponent implements OnInit {
  @ViewChild('fileInput') public fileInput!: ElementRef<HTMLInputElement>;
  public isUploading: boolean = false;
  public selectedFile: File | null = null;
  public flights: FlightSummary[] = [];
  public expandedFlight: number | null = null;
  public parametersMap: Map<number, ParameterOverview[]> = new Map();
  public rawAnomaliesMap: Map<number, Record<string, number[]>> = new Map();
  public progressMap: Map<number, { completed: number; total: number }> =
    new Map();
  public searchTerm: string = '';
  public sortBy: 'anomalies' | 'historical' = 'historical';
  public flightSearchTerm: string = '';
  public flightSortBy: 'anomalies' | 'historical' | 'number' = 'number';
  public preparingMap: Map<number, boolean> = new Map();
  public isUploadModalOpen: boolean = false;
  public isDropActive: boolean = false;
  isExportModalOpen: boolean = false;
  public flightAnalysisStageMap: Map<number, string> = new Map();
  selectedFlights: number[] = [];

  exportFormat: string = 'json';

  public constructor(
    private readonly archiveService: FlightArchiveService,
    private readonly telemetryDeviceService: TelemetryDeviceService,
    private readonly router: Router,
    private readonly progressService: AnalysisProgressService,
  ) {}

  public ngOnInit(): void {
  this.loadFlights();

  this.progressService.progress$.subscribe((progress) => {
    this.preparingMap.delete(progress.flightId);

    this.progressMap.set(progress.flightId, {
      completed: progress.completedParameters,
      total: progress.totalParameters,
    });
  });

  this.progressService.analysisStage$.subscribe((data) => {
    this.flightAnalysisStageMap.set(data.flightId, data.stage);
  });

  this.progressService.analysisFinished$.subscribe((flightId: number) => {
    this.flightAnalysisStageMap.set(flightId, 'finished');
    this.progressMap.delete(flightId);

    this.refreshFlightData(flightId);
    this.refreshAllFlightsData();

    this.progressService.leaveFlight(flightId);
  });
}

  ngOnDestroy(): void {
    this.progressService.disconnect();
  }
  private loadFlights(): void {
    this.archiveService.getAllFlights().subscribe({
      next: (flights: FlightSummary[]) => {
        this.flights = flights ?? [];
        this.flights.forEach((flight: FlightSummary) => {
          this.loadAnomaliesForFlight(flight.flightNumber);
        });
      },
      error: () => {
        this.flights = [];
      },
    });
  }
  openExportModal(): void {
    this.isExportModalOpen = true;
  }

  closeExportModal(): void {
    this.isExportModalOpen = false;
  }

  toggleFlightSelection(flightNumber: number): void {
    const index: number = this.selectedFlights.indexOf(flightNumber);

    if (index > -1) {
      this.selectedFlights.splice(index, 1);
    } else {
      this.selectedFlights.push(flightNumber);
    }
  }

  setExportFormat(format: string): void {
    this.exportFormat = format;
  }
  public openUploadModal(): void {
    this.isUploadModalOpen = true;
  }

  public closeUploadModal(): void {
    if (this.isUploading) return;
    this.isUploadModalOpen = false;
    this.isDropActive = false;
  }

  public onAddFlight(): void {
    const inputElement: HTMLInputElement | null =
      this.fileInput?.nativeElement ?? null;

    if (!inputElement) return;

    inputElement.value = '';
    inputElement.click();
  }

  public onFilePicked(event: Event): void {
    const inputElement: HTMLInputElement = event.target as HTMLInputElement;
    const file: File | null = inputElement.files?.item(0) ?? null;
    if (!file) return;

    const fileName: string = file.name.toLowerCase();
    const isAllowed: boolean =
      fileName.endsWith('.pcap') || fileName.endsWith('.pcapng');

    if (!isAllowed) return;

    this.selectedFile = file;
  }

  @HostListener('window:dragenter', ['$event'])
  public onWindowDragEnter(event: DragEvent): void {
    if (!this.isDraggingFiles(event)) return;
    event.preventDefault();
    this.isDropActive = true;
  }

  @HostListener('window:dragover', ['$event'])
  public onWindowDragOver(event: DragEvent): void {
    if (!this.isDraggingFiles(event)) return;
    event.preventDefault();
    this.isDropActive = true;

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  @HostListener('window:dragleave', ['$event'])
  public onWindowDragLeave(event: DragEvent): void {
    if (!this.isDropActive) return;

    const relatedTarget: EventTarget | null =
      (event as any).relatedTarget ?? null;

    if (relatedTarget === null) {
      this.isDropActive = false;
    }
  }

  @HostListener('window:drop', ['$event'])
  public onWindowDrop(event: DragEvent): void {
    if (!this.isDropActive) return;

    event.preventDefault();
    this.isDropActive = false;

    const file: File | null = event.dataTransfer?.files?.item(0) ?? null;
    if (!file) return;

    const fileName: string = file.name.toLowerCase();
    const isAllowed: boolean =
      fileName.endsWith('.pcap') || fileName.endsWith('.pcapng');

    if (!isAllowed) return;

    this.selectedFile = file;
  }

  private isDraggingFiles(event: DragEvent): boolean {
    const types: readonly string[] | undefined = event.dataTransfer?.types;
    if (!types) return false;
    return Array.from(types).includes('Files');
  }

  public toggleFlight(masterIndex: number): void {
    if (this.expandedFlight === masterIndex) {
      this.expandedFlight = null;
      return;
    }

    this.expandedFlight = masterIndex;

    if (this.parametersMap.has(masterIndex)) return;

    this.archiveService
      .getAllSpecialPointsForFlight(masterIndex)
      .subscribe((response) => {
        if (!response) {
          this.parametersMap.set(masterIndex, []);
          return;
        }

        this.rawAnomaliesMap.set(masterIndex, response.anomalies);

        const list: ParameterOverview[] = Object.keys(response.anomalies).map(
          (parameterName: string) => ({
            name: parameterName,
            anomalies: response.anomalies[parameterName]?.length ?? 0,
            historicalPoints:
              response.historicalSimilarity[parameterName]?.length ?? 0,
          }),
        );

        this.parametersMap.set(masterIndex, list);
      });
  }

  public isExpanded(masterIndex: number): boolean {
    return this.expandedFlight === masterIndex;
  }

  public getTotalAnomalies(masterIndex: number): number {
    const anomaliesRecord: Record<string, number[]> | undefined =
      this.rawAnomaliesMap.get(masterIndex);

    if (!anomaliesRecord) return 0;

    const anomalyArrays: number[][] = Object.values(
      anomaliesRecord,
    ) as number[][];

    return anomalyArrays.reduce(
      (total: number, arr: number[]) => total + arr.length,
      0,
    );
  }

  public getVisibleParameters(masterIndex: number): ParameterOverview[] {
    const all: ParameterOverview[] = this.parametersMap.get(masterIndex) ?? [];

    const filtered: ParameterOverview[] = all.filter((p) =>
      p.name.toLowerCase().includes(this.searchTerm.toLowerCase()),
    );

    return filtered.sort((a, b) =>
      this.sortBy === 'historical'
        ? b.historicalPoints - a.historicalPoints
        : b.anomalies - a.anomalies,
    );
  }

  public onSearchChange(value: string): void {
    this.searchTerm = value;
  }

  public clearSearch(): void {
    this.searchTerm = '';
  }

  public setSort(sortType: 'anomalies' | 'historical'): void {
    this.sortBy = sortType;
  }

  public openParameter(masterIndex: number, paramName: string): void {
    if (paramName) {
      this.router.navigate(['/archive', masterIndex], {
        queryParams: { param: paramName },
      });
    } else {
      this.router.navigate(['/archive', masterIndex]);
    }
  }

  public deleteFlight(flightNumber: number): void {
    Swal.fire({
      title: 'Delete flight?',
      text: `Flight #${flightNumber} will be permanently removed.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, delete it',
      cancelButtonText: 'Cancel',
      background: '#120d22',
      color: 'rgba(255, 255, 255, 0.88)',
      confirmButtonColor: '#7c3aed',
      cancelButtonColor: 'rgba(60, 30, 100, 0.6)',
      customClass: {
        popup: 'swal-dark-popup',
        confirmButton: 'swal-confirm-btn',
        cancelButton: 'swal-cancel-btn',
      },
    }).then((result) => {
      if (!result.isConfirmed) return;

      this.archiveService.deleteFlight(flightNumber).subscribe({
        next: () => {
          this.flights = this.flights.filter(
            (flight: FlightSummary) => flight.flightNumber !== flightNumber,
          );

          this.parametersMap.delete(flightNumber);
          this.rawAnomaliesMap.delete(flightNumber);

          if (this.expandedFlight === flightNumber) {
            this.expandedFlight = null;
          }

          Swal.fire({
            title: 'Deleted!',
            text: `Flight #${flightNumber} has been removed.`,
            icon: 'success',
            background: '#120d22',
            color: 'rgba(255, 255, 255, 0.88)',
            confirmButtonColor: '#7c3aed',
            customClass: {
              popup: 'swal-dark-popup',
              confirmButton: 'swal-confirm-btn',
            },
          });
        },
        error: () => {
          Swal.fire({
            title: 'Error',
            text: 'Failed to delete the flight. Please try again.',
            icon: 'error',
            background: '#120d22',
            color: 'rgba(255, 255, 255, 0.88)',
            confirmButtonColor: '#7c3aed',
            customClass: {
              popup: 'swal-dark-popup',
              confirmButton: 'swal-confirm-btn',
            },
          });
        },
      });
    });
  }

  private loadAnomaliesForFlight(masterIndex: number): void {
    if (this.parametersMap.has(masterIndex)) return;

    this.archiveService
      .getAllSpecialPointsForFlight(masterIndex)
      .subscribe((response) => {
        if (!response) {
          this.parametersMap.set(masterIndex, []);
          return;
        }

        this.rawAnomaliesMap.set(masterIndex, response.anomalies);

        const list: ParameterOverview[] = Object.keys(response.anomalies).map(
          (parameterName: string) => ({
            name: parameterName,
            anomalies: response.anomalies[parameterName]?.length ?? 0,
            historicalPoints:
              response.historicalSimilarity[parameterName]?.length ?? 0,
          }),
        );

        this.parametersMap.set(masterIndex, list);
      });
  }

  public getDurationText(totalSeconds: number): string {
    const secondsInDay: number = 86400;
    const secondsInHour: number = 3600;
    const secondsInMinute: number = 60;

    const days: number = Math.floor(totalSeconds / secondsInDay);
    const remainingAfterDays: number = totalSeconds % secondsInDay;

    const hours: number = Math.floor(remainingAfterDays / secondsInHour);
    const remainingAfterHours: number = remainingAfterDays % secondsInHour;

    const minutes: number = Math.floor(remainingAfterHours / secondsInMinute);
    const seconds: number = remainingAfterHours % secondsInMinute;

    const parts: string[] = [];

    if (days > 0) parts.push(`${days}d`);
    if (hours > 0 || days > 0) parts.push(`${hours}h`);
    if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);

    return parts.join(' ');
  }

  public uploadSelectedFile(): void {
    if (!this.selectedFile || this.isUploading) return;
    const fileName: string = this.selectedFile.name;
    const extractedFlightNumber: number | null =
      this.extractFlightNumberFromFileName(fileName);

    if (extractedFlightNumber !== null) {
      const exists: boolean = this.isFlightAlreadyExists(extractedFlightNumber);

      if (exists) {
        Swal.fire({
          title: 'Flight already exists',
          text: `Flight #${extractedFlightNumber} already exists in the system.`,
          icon: 'warning',
          background: '#120d22',
          color: 'rgba(255, 255, 255, 0.88)',
          confirmButtonText: 'OK',
          confirmButtonColor: '#7c3aed',
          customClass: {
            popup: 'swal-dark-popup',
            confirmButton: 'swal-confirm-btn',
          },
        });

        return;
      }
    }
    this.isUploading = true;

    this.telemetryDeviceService.uploadPcap(this.selectedFile).subscribe({
      next: () => {
        this.expandedFlight = null;

        const existingFlightIds: Set<number> = new Set(
          this.flights.map((flight: FlightSummary) => flight.flightNumber),
        );

        this.archiveService
          .getAllFlights()
          .subscribe((flights: FlightSummary[]) => {
            this.flights = flights ?? [];

            this.parametersMap.clear();
            this.rawAnomaliesMap.clear();

            this.flights.forEach((flight: FlightSummary) => {
              this.loadAnomaliesForFlight(flight.flightNumber);
            });

            const newFlights: FlightSummary[] = this.flights.filter(
              (flight: FlightSummary) =>
                !existingFlightIds.has(flight.flightNumber),
            );

            newFlights.forEach((flight: FlightSummary) => {
              this.preparingMap.set(flight.flightNumber, true);
              this.progressService.connect(flight.flightNumber);
            });
          });

        this.selectedFile = null;
        this.isUploading = false;
        this.closeUploadModal();
      },
      error: () => {
        this.isUploading = false;
      },
    });
  }
  public removeSelectedFile(): void {
    this.selectedFile = null;
  }
  public exportFlights(): void {
    for (const flightNumber of this.selectedFlights) {
      this.archiveService
        .exportFlight(flightNumber, this.exportFormat)
        .subscribe((fileBlob: Blob) => {
          const url: string = window.URL.createObjectURL(fileBlob);

          const link: HTMLAnchorElement = document.createElement('a');

          link.href = url;
          link.download = `flight_${flightNumber}.zip`;

          link.click();

          window.URL.revokeObjectURL(url);
        });
    }

    this.closeExportModal();
  }

  public getProgressPercent(flightNumber: number): number {
    const progress = this.progressMap.get(flightNumber);

    if (!progress) return 0;

    return Math.floor((progress.completed / progress.total) * 100);
  }
  private refreshFlightData(flightId: number): void {
    this.archiveService
      .getAllSpecialPointsForFlight(flightId)
      .subscribe((response) => {
        if (!response) return;

        this.rawAnomaliesMap.set(flightId, response.anomalies);

        const list: ParameterOverview[] = Object.keys(response.anomalies).map(
          (parameterName: string) => ({
            name: parameterName,
            anomalies: response.anomalies[parameterName]?.length ?? 0,
            historicalPoints:
              response.historicalSimilarity[parameterName]?.length ?? 0,
          }),
        );

        this.parametersMap.set(flightId, list);
      });
  }
  private refreshAllFlightsData(): void {
    this.flights.forEach((flight: FlightSummary) => {
      this.archiveService
        .getAllSpecialPointsForFlight(flight.flightNumber)
        .subscribe((response) => {
          if (!response) return;

          this.rawAnomaliesMap.set(flight.flightNumber, response.anomalies);

          const list: ParameterOverview[] = Object.keys(response.anomalies).map(
            (parameterName: string) => ({
              name: parameterName,
              anomalies: response.anomalies[parameterName]?.length ?? 0,
              historicalPoints:
                response.historicalSimilarity[parameterName]?.length ?? 0,
            }),
          );

          this.parametersMap.set(flight.flightNumber, list);
        });
    });
  }
  public getVisibleFlights(): FlightSummary[] {
    let filtered: FlightSummary[] = this.flights.filter(
      (flight: FlightSummary) =>
        flight.flightNumber.toString().includes(this.flightSearchTerm),
    );

    return filtered.sort((a: FlightSummary, b: FlightSummary) => {
      if (this.flightSortBy === 'number') {
        return b.flightNumber - a.flightNumber;
      }

      if (this.flightSortBy === 'anomalies') {
        return (
          this.getTotalAnomalies(b.flightNumber) -
          this.getTotalAnomalies(a.flightNumber)
        );
      }

      if (this.flightSortBy === 'historical') {
        const histA = this.getTotalHistorical(a.flightNumber);
        const histB = this.getTotalHistorical(b.flightNumber);
        return histB - histA;
      }

      return 0;
    });
  }
  public getTotalHistorical(masterIndex: number): number {
    const params = this.parametersMap.get(masterIndex);
    if (!params) return 0;

    return params.reduce(
      (sum: number, p: ParameterOverview) => sum + p.historicalPoints,
      0,
    );
  }
  private isNumeric(value: string): boolean {
    return /^\d+$/.test(value);
  }
  private extractFlightNumberFromFileName(fileName: string): number | null {
    const nameWithoutExtension: string = fileName.split('.')[0];

    if (!this.isNumeric(nameWithoutExtension)) {
      return null;
    }

    return Number(nameWithoutExtension);
  }
  private isFlightAlreadyExists(flightNumber: number): boolean {
    return this.flights.some(
      (flight: FlightSummary) => flight.flightNumber === flightNumber,
    );
  }
  public getFlightAnalysisStatusText(flightId: number): string {
  const stage = this.flightAnalysisStageMap.get(flightId);
  const progress = this.progressMap.get(flightId);

  if (stage === 'historical') {
    return 'Searching historical points...';
  }

  if (stage === 'causality') {
    return 'Analyzing flight causality...';
  }

  if (progress) {
    return `Analyzing ${progress.completed}/${progress.total}`;
  }

  if (stage === 'finished') {
    return 'Analysis completed';
  }

  return '';
}
}
