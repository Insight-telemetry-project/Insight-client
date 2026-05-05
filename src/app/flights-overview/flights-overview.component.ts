import {
  Component,
  OnInit,
  OnDestroy,
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
import { HistoricalSimilarityService } from '../analyze-page/services/historical-similarity.service';
import { ParameterOverview } from '../common/interfaces/parameter-overview.interface';
import { FlightAnalysisProgress } from '../common/interfaces/flight-analysis-progress.interface';
import { SpecialPointsResponse } from '../common/interfaces/special-points-response.interface';
import {
  SortType,
  FlightSortType,
  ExportFormat,
  AnalysisStage,
  DragEventType,
} from '../common/interfaces/flights-overview.types';

@Component({
  selector: 'app-flights-overview',
  templateUrl: './flights-overview.component.html',
  styleUrls: ['./flights-overview.component.scss'],
})
export class FlightsOverviewComponent implements OnInit, OnDestroy {
  @ViewChild('fileInput') public fileInput!: ElementRef<HTMLInputElement>;

  public isUploading: boolean = false;
  public selectedFile: File | null = null;
  public flights: FlightSummary[] = [];
  public expandedFlight: number | null = null;
  public parametersMap: Map<number, ParameterOverview[]> = new Map();
  public rawAnomaliesMap: Map<number, Record<string, number[]>> = new Map();
  public progressMap: Map<number, FlightAnalysisProgress> = new Map();
  public searchTerm: string = '';
  public sortBy: SortType = 'historical';
  public flightSearchTerm: string = '';
  public flightSortBy: FlightSortType = 'number';
  public preparingMap: Map<number, boolean> = new Map();
  public isUploadModalOpen: boolean = false;
  public isDropActive: boolean = false;
  public isExportModalOpen: boolean = false;
  public flightAnalysisStageMap: Map<number, AnalysisStage> = new Map();
  public selectedFlights: number[] = [];
  public exportFormat: ExportFormat = 'json';

  public constructor(
    private readonly archiveService: FlightArchiveService,
    private readonly telemetryDeviceService: TelemetryDeviceService,
    private readonly router: Router,
    private readonly progressService: AnalysisProgressService,
    private readonly historicalSimilarityService: HistoricalSimilarityService,
  ) {}

  public ngOnInit(): void {
    this.loadFlights();

    this.progressService.progress$.subscribe((progressUpdate) => {
      this.preparingMap.delete(progressUpdate.flightId);

      this.progressMap.set(progressUpdate.flightId, {
        completed: progressUpdate.completedParameters,
        total: progressUpdate.totalParameters,
      });
    });

    this.progressService.analysisStage$.subscribe((stageData) => {
      this.flightAnalysisStageMap.set(stageData.flightId, stageData.stage);
    });

    this.progressService.analysisFinished$.subscribe(
      (finishedFlightId: number) => {
        this.flightAnalysisStageMap.set(finishedFlightId, 'finished');
        this.progressMap.delete(finishedFlightId);

        this.refreshFlightData(finishedFlightId);
        this.refreshAllFlightsData();

        this.progressService.leaveFlight(finishedFlightId);
      },
    );
  }

  public ngOnDestroy(): void {
    this.progressService.disconnect();
  }

  public openExportModal(): void {
    this.isExportModalOpen = true;
  }

  public closeExportModal(): void {
    this.isExportModalOpen = false;
  }

  public toggleFlightSelection(flightNumber: number): void {
    const index: number = this.selectedFlights.indexOf(flightNumber);

    if (index > -1) {
      this.selectedFlights.splice(index, 1);
    } else {
      this.selectedFlights.push(flightNumber);
    }
  }

  public setExportFormat(format: ExportFormat): void {
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

    const dragEventWithRelatedTarget: DragEventType =
      event as unknown as DragEventType;
    const relatedTarget: EventTarget | null =
      dragEventWithRelatedTarget.relatedTarget ?? null;

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

  public toggleFlight(masterIndex: number): void {
    if (this.expandedFlight === masterIndex) {
      this.expandedFlight = null;
      return;
    }

    this.expandedFlight = masterIndex;

    if (this.parametersMap.has(masterIndex)) return;

    this.archiveService
      .getAllSpecialPointsForFlight(masterIndex)
      .subscribe((specialPointsResponse: SpecialPointsResponse | null) => {
        if (!specialPointsResponse) {
          this.parametersMap.set(masterIndex, []);
          return;
        }

        this.rawAnomaliesMap.set(
          masterIndex,
          specialPointsResponse.anomalies,
        );

        const parameterOverviewList: ParameterOverview[] =
          this.buildParameterOverviewList(specialPointsResponse);

        this.parametersMap.set(masterIndex, parameterOverviewList);
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
      (totalCount: number, anomalyArray: number[]) =>
        totalCount + anomalyArray.length,
      0,
    );
  }

  public getVisibleParameters(masterIndex: number): ParameterOverview[] {
    const allParameters: ParameterOverview[] =
      this.parametersMap.get(masterIndex) ?? [];

    const filteredParameters: ParameterOverview[] = allParameters.filter(
      (parameterItem) =>
        parameterItem.name
          .toLowerCase()
          .includes(this.searchTerm.toLowerCase()),
    );

    return filteredParameters.sort(
      (parameterA: ParameterOverview, parameterB: ParameterOverview) =>
        this.sortBy === 'historical'
          ? parameterB.historicalPoints - parameterA.historicalPoints
          : parameterB.anomalies - parameterA.anomalies,
    );
  }

  public onSearchChange(value: string): void {
    this.searchTerm = value;
  }

  public clearSearch(): void {
    this.searchTerm = '';
  }

  public setSort(sortType: SortType): void {
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
      this.executeDeleteFlight(flightNumber);
    });
  }

  public removeSelectedFile(): void {
    this.selectedFile = null;
  }

  public exportFlights(): void {
    for (const flightNumber of this.selectedFlights) {
      this.archiveService
        .exportFlight(flightNumber, this.exportFormat)
        .subscribe((exportFileBlob: Blob) => {
          const downloadUrl: string =
            window.URL.createObjectURL(exportFileBlob);

          const downloadLink: HTMLAnchorElement = document.createElement('a');

          downloadLink.href = downloadUrl;
          downloadLink.download = `flight_${flightNumber}.zip`;

          downloadLink.click();

          window.URL.revokeObjectURL(downloadUrl);
        });
    }

    this.closeExportModal();
  }

  public getProgressPercent(flightNumber: number): number {
    const flightProgress: FlightAnalysisProgress | undefined =
      this.progressMap.get(flightNumber);

    if (!flightProgress) return 0;

    return Math.floor(
      (flightProgress.completed / flightProgress.total) * 100,
    );
  }

  public getVisibleFlights(): FlightSummary[] {
    const filteredFlights: FlightSummary[] = this.flights.filter(
      (flight: FlightSummary) =>
        flight.flightNumber.toString().includes(this.flightSearchTerm),
    );

    return filteredFlights.sort(
      (flightA: FlightSummary, flightB: FlightSummary) => {
        if (this.flightSortBy === 'number') {
          return flightB.flightNumber - flightA.flightNumber;
        }

        if (this.flightSortBy === 'anomalies') {
          return (
            this.getTotalAnomalies(flightB.flightNumber) -
            this.getTotalAnomalies(flightA.flightNumber)
          );
        }

        if (this.flightSortBy === 'historical') {
          return (
            this.getTotalHistorical(flightB.flightNumber) -
            this.getTotalHistorical(flightA.flightNumber)
          );
        }

        return 0;
      },
    );
  }

  public getTotalHistorical(masterIndex: number): number {
    const parametersList: ParameterOverview[] | undefined =
      this.parametersMap.get(masterIndex);
    if (!parametersList) return 0;

    return parametersList.reduce(
      (totalPoints: number, parameterItem: ParameterOverview) =>
        totalPoints + parameterItem.historicalPoints,
      0,
    );
  }

  public getDurationText(totalSeconds: number): string {
    const secondsInDay: number = 86400;
    const secondsInHour: number = 3600;
    const secondsInMinute: number = 60;

    const days: number = Math.floor(totalSeconds / secondsInDay);
    const remainingAfterDays: number = totalSeconds % secondsInDay;

    const hours: number = Math.floor(remainingAfterDays / secondsInHour);
    const remainingAfterHours: number = remainingAfterDays % secondsInHour;

    const minutes: number = Math.floor(
      remainingAfterHours / secondsInMinute,
    );
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
      const flightExists: boolean = this.isFlightAlreadyExists(
        extractedFlightNumber,
      );

      if (flightExists) {
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
        this.onUploadSuccess();
      },
      error: () => {
        this.isUploading = false;
      },
    });
  }

  public getFlightAnalysisStatusText(flightId: number): string {
    const analysisStage: AnalysisStage | undefined =
      this.flightAnalysisStageMap.get(flightId);
    const flightProgress: FlightAnalysisProgress | undefined =
      this.progressMap.get(flightId);

    if (analysisStage === 'historical') {
      return 'Searching historical points...';
    }

    if (analysisStage === 'causality') {
      return 'Analyzing flight causality...';
    }

    if (flightProgress) {
      return `Analyzing ${flightProgress.completed}/${flightProgress.total}`;
    }

    if (analysisStage === 'finished') {
      return 'Analysis completed';
    }

    return '';
  }

  private loadFlights(): void {
    this.archiveService.getAllFlights().subscribe({
      next: (loadedFlights: FlightSummary[]) => {
        this.flights = loadedFlights ?? [];
        this.flights.forEach((flight: FlightSummary) => {
          this.loadAnomaliesForFlight(flight.flightNumber);
        });
      },
      error: () => {
        this.flights = [];
      },
    });
  }

  private loadAnomaliesForFlight(masterIndex: number): void {
    if (this.parametersMap.has(masterIndex)) return;

    this.archiveService
      .getAllSpecialPointsForFlight(masterIndex)
      .subscribe((specialPointsResponse: SpecialPointsResponse | null) => {
        if (!specialPointsResponse) {
          this.parametersMap.set(masterIndex, []);
          return;
        }

        this.rawAnomaliesMap.set(masterIndex, specialPointsResponse.anomalies);

        const parameterOverviewList: ParameterOverview[] =
          this.buildParameterOverviewList(specialPointsResponse);

        this.parametersMap.set(masterIndex, parameterOverviewList);
      });
  }

  private buildParameterOverviewList(
    specialPointsResponse: SpecialPointsResponse,
  ): ParameterOverview[] {
    return Object.keys(specialPointsResponse.anomalies).map(
      (parameterName: string) => ({
        name: parameterName,
        anomalies:
          specialPointsResponse.anomalies[parameterName]?.length ?? 0,
        historicalPoints:
          this.historicalSimilarityService.getUniqueHistoricalCount(
            specialPointsResponse.historicalSimilarity[parameterName],
          ),
      }),
    );
  }

  private refreshFlightData(flightId: number): void {
    this.archiveService
      .getAllSpecialPointsForFlight(flightId)
      .subscribe((specialPointsResponse: SpecialPointsResponse | null) => {
        if (!specialPointsResponse) return;

        this.rawAnomaliesMap.set(flightId, specialPointsResponse.anomalies);

        const parameterOverviewList: ParameterOverview[] =
          this.buildParameterOverviewList(specialPointsResponse);

        this.parametersMap.set(flightId, parameterOverviewList);
      });
  }

  private refreshAllFlightsData(): void {
    this.flights.forEach((flight: FlightSummary) => {
      this.refreshFlightData(flight.flightNumber);
    });
  }

  private onUploadSuccess(): void {
    this.expandedFlight = null;

    const existingFlightIds: Set<number> = new Set(
      this.flights.map((flight: FlightSummary) => flight.flightNumber),
    );

    this.archiveService
      .getAllFlights()
      .subscribe((loadedFlights: FlightSummary[]) => {
        this.flights = loadedFlights ?? [];

        this.parametersMap.clear();
        this.rawAnomaliesMap.clear();

        this.flights.forEach((flight: FlightSummary) => {
          this.loadAnomaliesForFlight(flight.flightNumber);
        });

        const newFlightsList: FlightSummary[] = this.flights.filter(
          (flight: FlightSummary) =>
            !existingFlightIds.has(flight.flightNumber),
        );

        newFlightsList.forEach((flight: FlightSummary) => {
          this.preparingMap.set(flight.flightNumber, true);
          this.progressService.connect(flight.flightNumber);
        });
      });

    this.selectedFile = null;
    this.isUploading = false;
    this.closeUploadModal();
  }

  private executeDeleteFlight(flightNumber: number): void {
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

        this.refreshAllFlightsData();

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
  }

  private isDraggingFiles(event: DragEvent): boolean {
    const types: readonly string[] | undefined = event.dataTransfer?.types;
    if (!types) return false;
    return Array.from(types).includes('Files');
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
}