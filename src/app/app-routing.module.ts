import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { UploadPcapComponent } from './upload-pcap/upload-pcap.component';

const routes: Routes = [
  { path: 'upload', component: UploadPcapComponent },
  { path: '', redirectTo: 'upload', pathMatch: 'full' },
  { path: '**', redirectTo: 'upload' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
