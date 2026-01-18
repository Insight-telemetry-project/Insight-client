import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-upload-choice-card',
  templateUrl: './upload-choice-card.component.html',
  styleUrls: ['./upload-choice-card.component.scss']
})
export class UploadChoiceCardComponent {
  @Input() public title: string = '';
  @Input() public description: string = '';
  @Input() public iconText: string = '';
  @Input() public disabled: boolean = false;

  @Output() public action: EventEmitter<void> = new EventEmitter<void>();

  public onClick(): void {
    if (this.disabled) return;
    this.action.emit();
  }
}
