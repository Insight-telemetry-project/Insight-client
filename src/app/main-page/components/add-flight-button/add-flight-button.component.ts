import { Component, ElementRef, EventEmitter, Output, ViewChild } from '@angular/core';

@Component({
  selector: 'app-add-flight-button',
  templateUrl: './add-flight-button.component.html',
  styleUrls: ['./add-flight-button.component.scss']
})
export class AddFlightButtonComponent {
  @Output() public filePicked: EventEmitter<File> = new EventEmitter<File>();

  @ViewChild('fileInput', { static: false })
  public fileInputRef!: ElementRef<HTMLInputElement>;

  public openFilePicker(): void {
    const input: HTMLInputElement | null = this.fileInputRef?.nativeElement ?? null;
    if (!input) return;
    input.value = '';
    input.click();
  }

  public onFileSelected(event: Event): void {
    const input: HTMLInputElement = event.target as HTMLInputElement;
    const file: File | null = input.files?.item(0) ?? null;
    if (!file) return;
    this.filePicked.emit(file);
  }
}
