import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';

@Component({
  selector: 'app-file-drop-overlay',
  templateUrl: './file-drop-overlay.component.html',
  styleUrls: ['./file-drop-overlay.component.scss']
})
export class FileDropOverlayComponent {
  @Input() public isActive: boolean = false;
  @Output() public fileDropped: EventEmitter<File> = new EventEmitter<File>();

  @HostListener('dragover', ['$event'])
  public onDragOver(event: DragEvent): void {
    if (!this.isActive) return;
    event.preventDefault();
  }

  @HostListener('drop', ['$event'])
  public onDrop(event: DragEvent): void {
    if (!this.isActive) return;
    event.preventDefault();

    const file: File | null = event.dataTransfer?.files?.item(0) ?? null;
    if (!file) return;

    this.fileDropped.emit(file);
  }
}
