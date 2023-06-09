import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { environment } from "src/environments/environment";

@Injectable({
  providedIn: 'root'
})
export class ConversationService {
  readonly BaseURI = environment.apiBaseUrl;
  constructor(private http: HttpClient) {

  }
  getAll() {
    return this.http.get(this.BaseURI + '/conversation');
  }
}
