import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FlightsModalComponent } from './flights-modal.component';

describe('FlightsModalComponent', () => {
  let component: FlightsModalComponent;
  let fixture: ComponentFixture<FlightsModalComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [FlightsModalComponent]
    });
    fixture = TestBed.createComponent(FlightsModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
