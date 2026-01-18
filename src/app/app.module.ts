import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { UploadPcapComponent } from './upload-pcap/upload-pcap.component';
import { FileDropOverlayComponent } from './upload-pcap/components/file-drop-overlay/file-drop-overlay.component';
import { UploadChoiceCardComponent } from './upload-pcap/components/upload-choice-card/upload-choice-card.component';

@NgModule({
  declarations: [
    AppComponent,
    UploadPcapComponent,
    FileDropOverlayComponent,
    UploadChoiceCardComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
