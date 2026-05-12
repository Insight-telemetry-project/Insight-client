import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MainPageComponent } from './main-page/main-page.component';
import { AnalyzePageComponent } from './analyze-page/analyze-page.component';
import { FlightsOverviewComponent } from './flights-overview/flights-overview.component';

const routes: Routes = [
  { path: '', component: FlightsOverviewComponent },

  { path: 'archive/:masterIndex', component: AnalyzePageComponent },
  {
    path: 'flights-overview',
    component: FlightsOverviewComponent,
  },
  { path: '**', redirectTo: '' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
