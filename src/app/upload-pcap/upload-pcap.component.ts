import { Component, ElementRef, HostListener, ViewChild } from '@angular/core';

type UploadMode = 'upload' | 'existing';

@Component({
  selector: 'app-upload-pcap',
  templateUrl: './upload-pcap.component.html',
  styleUrls: ['./upload-pcap.component.scss']
})
export class UploadPcapComponent {
  @ViewChild('fileInput', { static: true }) private readonly fileInputRef!: ElementRef<HTMLInputElement>;

  public isDragActive: boolean = false;
  public selectedFileName: string | null = null;
  public isFlightsModalOpen: boolean = false;

  public onUploadClick(): void {
    this.fileInputRef.nativeElement.value = '';
    this.fileInputRef.nativeElement.click();
  }

  public onFileInputChange(event: Event): void {
    const input: HTMLInputElement = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
  }
    const file: File = input.files[0];
    this.handleSelectedFile(file);
  }

  public onFileDropped(file: File): void {
    this.isDragActive = false;
    this.handleSelectedFile(file);
  }

  private handleSelectedFile(file: File): void {
    if (!this.isAllowedFile(file)) return;
    this.selectedFileName = file.name;
    this.handleMode('upload');
  }

  private isAllowedFile(file: File): boolean {
    const lowerName: string = file.name.toLowerCase();
    return lowerName.endsWith('.pcap') || lowerName.endsWith('.pcapng');
  }

  private handleMode(mode: UploadMode): void {
    if (mode === 'existing') {
      console.log('Continue with existing flight');
      return;
    }

    console.log('Upload selected file:', this.selectedFileName);
  }

  @HostListener('window:dragenter', ['$event'])
  public onWindowDragEnter(event: DragEvent): void {
    if (!this.hasFiles(event)) return;
    event.preventDefault();
    this.isDragActive = true;
  }

  @HostListener('window:dragover', ['$event'])
  public onWindowDragOver(event: DragEvent): void {
    if (!this.isDragActive) return;
    event.preventDefault();
  }

  @HostListener('window:dragleave', ['$event'])
  public onWindowDragLeave(event: DragEvent): void {
    if (!this.isDragActive) return;

    const relatedTarget: EventTarget | null = event.relatedTarget;
    if (relatedTarget === null) {
      this.isDragActive = false;
    }
  }

  @HostListener('window:drop', ['$event'])
  public onWindowDrop(event: DragEvent): void {
    if (!this.isDragActive) return;
    event.preventDefault();
    this.isDragActive = false;
  }

  private hasFiles(event: DragEvent): boolean {
    const types: readonly string[] | null = event.dataTransfer?.types ?? null;
    if (!types) return false;
    return Array.from(types).includes('Files');
  }

  public onContinueExisting(): void {
  this.isFlightsModalOpen = true;
}

public onFlightsModalClosed(): void {
  this.isFlightsModalOpen = false;
}

public onFlightSelected(flightNumber: number): void {
  this.isFlightsModalOpen = false;
  console.log('Selected flight:', flightNumber);
}
}
