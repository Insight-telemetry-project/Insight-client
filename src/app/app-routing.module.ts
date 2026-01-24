import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MainPageComponent } from './main-page/main-page.component';
import { ArchivePageComponent } from './archive-page/archive-page.component';

const routes: Routes = [
  { path: '', component: MainPageComponent },
  { path: 'archive/:masterIndex', component: ArchivePageComponent },
  { path: '**', redirectTo: '' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
