import { Injectable } from '@angular/core';
import { Subscription } from 'rxjs';
import { FlightArchiveService } from '../../services/flight-archive.service';

@Injectable({ providedIn: 'root' })
export class RelatedParamsService {
  public relatedOpen: boolean = false;
  public relatedParams: string[] = [];
  public relatedLoading: boolean = false;
  public relatedError: string | null = null;
  public relatedForParam: string | null = null;

  private relatedSub: Subscription | null = null;
  public sidebarMode: 'related' | 'historical' = 'related';

  public constructor(private readonly archiveService: FlightArchiveService) {}

  public clear(): void {
    this.relatedOpen = false;
    this.relatedParams = [];
    this.relatedLoading = false;
    this.relatedError = null;
    this.relatedForParam = null;

    if (this.relatedSub) {
      this.relatedSub.unsubscribe();
      this.relatedSub = null;
    }
  }

  public openFor(masterIndex: number, param: string, subs: Subscription): void {
    this.relatedForParam = param;
    this.relatedOpen = true;
    this.load(masterIndex, param, subs);
  }

  public closeIfOwner(param: string): void {
    if (this.relatedForParam !== param) return;
    this.clear();
  }

  public toggle(masterIndex: number, subs: Subscription): void {
    if (!this.relatedForParam) return;

    this.relatedOpen = !this.relatedOpen;

    if (this.relatedOpen) {
      this.load(masterIndex, this.relatedForParam, subs);
    }
  }

  public load(masterIndex: number, param: string, subs: Subscription): void {
    this.relatedLoading = true;
    this.relatedError = null;
    this.relatedParams = [];

    if (this.relatedSub) {
      this.relatedSub.unsubscribe();
      this.relatedSub = null;
    }

    this.relatedSub = this.archiveService.getFlightConnectionsParam(masterIndex, param).subscribe({
      next: (items: string[]) => {
        this.relatedParams = (items ?? []).slice();
        this.relatedLoading = false;
      },
      error: (err: any) => {
        console.error('Failed to load related params for', param, err);
        this.relatedError = 'Failed to load related parameters';
        this.relatedLoading = false;
      }
    });

    subs.add(this.relatedSub);
  }
}
