import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UploadPcapComponent } from './upload-pcap.component';

describe('UploadPcapComponent', () => {
  let component: UploadPcapComponent;
  let fixture: ComponentFixture<UploadPcapComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [UploadPcapComponent]
    });
    fixture = TestBed.createComponent(UploadPcapComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
