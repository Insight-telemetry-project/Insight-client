import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddFlightButtonComponent } from './add-flight-button.component';

describe('AddFlightButtonComponent', () => {
  let component: AddFlightButtonComponent;
  let fixture: ComponentFixture<AddFlightButtonComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [AddFlightButtonComponent]
    });
    fixture = TestBed.createComponent(AddFlightButtonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
