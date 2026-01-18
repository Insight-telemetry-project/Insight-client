import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UploadChoiceCardComponent } from './upload-choice-card.component';

describe('UploadChoiceCardComponent', () => {
  let component: UploadChoiceCardComponent;
  let fixture: ComponentFixture<UploadChoiceCardComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [UploadChoiceCardComponent]
    });
    fixture = TestBed.createComponent(UploadChoiceCardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
