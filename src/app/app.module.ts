import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';

import { MainPageComponent } from './main-page/main-page.component';
import { FlightsGridComponent } from './main-page/components/flight-grid/flight-grid.component';
import { FlightCardComponent } from './main-page/components/flight-card/flight-card.component';
import { FileDropOverlayComponent } from './main-page/components/file-drop-overlay/file-drop-overlay.component';

@NgModule({
  declarations: [
    AppComponent,
    MainPageComponent,
    FlightsGridComponent,
    FlightCardComponent,
    FileDropOverlayComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    HttpClientModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule {}
