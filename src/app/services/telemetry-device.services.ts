import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class TelemetryDeviceService {
  private readonly baseUrl: string = 'https://localhost:7130';

  public constructor(private readonly httpClient: HttpClient) {}

  public uploadPcap(file: File): Observable<unknown> {
    const formData: FormData = new FormData();
    formData.append('pcapFile', file, file.name);

    return this.httpClient.post(
      `${this.baseUrl}/packets/decode-stream-file`,
      formData
    );
  }
}
