import { Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { FlightArchiveService } from '../services/flight-archive.service';
import { FlightSummary } from '../common/interfaces/flight-summary.interface';
import { TelemetryDeviceService } from '../services/telemetry-device.services';

@Component({
  selector: 'app-main-page',
  templateUrl: './main-page.component.html',
  styleUrls: ['./main-page.component.scss']
})
export class MainPageComponent implements OnInit {
  @ViewChild('fileInput') public fileInput!: ElementRef<HTMLInputElement>;

  public flights: FlightSummary[] = [];
  public searchText: string = '';
  public isDropActive: boolean = false;

  public constructor(
    private readonly flightArchiveService: FlightArchiveService,
    private readonly telemetryDeviceService: TelemetryDeviceService,
    private readonly router: Router
  ) {}

  public ngOnInit(): void {
    this.loadFlights();
  }

  public get filteredFlights(): FlightSummary[] {
    const query: string = this.searchText.trim();
    if (query.length === 0) return this.flights;

    return this.flights.filter((flight: FlightSummary) =>
      String(flight.flightNumber).includes(query)
    );
  }

  public onSearchChange(value: string): void {
    this.searchText = value;
  }

  public clearSearch(): void {
    this.searchText = '';
  }

  public onAddFlight(): void {
    const inputElement: HTMLInputElement | null = this.fileInput?.nativeElement ?? null;
    if (!inputElement) return;

    inputElement.value = '';
    inputElement.click();
  }

  public onFilePicked(event: Event): void {
    const inputElement: HTMLInputElement = event.target as HTMLInputElement;
    const file: File | null = inputElement.files?.item(0) ?? null;
    if (!file) return;

    this.handlePcapFile(file);
  }

  public onFileDropped(file: File): void {
    this.isDropActive = false;
    this.handlePcapFile(file);
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
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  @HostListener('window:dragleave', ['$event'])
  public onWindowDragLeave(event: DragEvent): void {
    if (!this.isDropActive) return;

    const relatedTarget: EventTarget | null = (event as any).relatedTarget ?? null;
    if (relatedTarget === null) {
      this.isDropActive = false;
    }
  }

  @HostListener('window:drop', ['$event'])
  public onWindowDrop(event: DragEvent): void {
    if (!this.isDropActive) return;
    event.preventDefault();
    this.isDropActive = false;
  }

  public onFlightSelected(flightNumber: number): void {
    this.router.navigate(['/archive', flightNumber]);
  }

  public onFlightDeleted(flightNumber: number): void {
    this.flights = this.flights.filter((flight: FlightSummary) => flight.flightNumber !== flightNumber);
  }

  private loadFlights(): void {
    this.flightArchiveService.getAllFlights().subscribe({
      next: (result: FlightSummary[]) => {
        this.flights = result ?? [];
      },
      error: () => {
        this.flights = [];
      }
    });
  }

  private isDraggingFiles(event: DragEvent): boolean {
    const types: readonly string[] | undefined = event.dataTransfer?.types;
    if (!types) return false;
    return Array.from(types).includes('Files');
  }

  private handlePcapFile(file: File): void {
    const fileName: string = file.name.toLowerCase();
    const isAllowed: boolean = fileName.endsWith('.pcap') || fileName.endsWith('.pcapng');
    if (!isAllowed) return;

    this.telemetryDeviceService.uploadPcap(file).subscribe({
      next: () => {
        this.loadFlights();
      },
      error: (err: any) => console.error('Failed to upload PCAP file:', err)
    });
  }
}
