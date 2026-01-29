import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FlightGridComponent } from './flight-grid.component';

describe('FlightGridComponent', () => {
  let component: FlightGridComponent;
  let fixture: ComponentFixture<FlightGridComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [FlightGridComponent]
    });
    fixture = TestBed.createComponent(FlightGridComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
