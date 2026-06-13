import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface LoginDto {
  email: string;
  password: string;
}

export interface RegisterDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  tc: string;
  birthDay: string;
  createdBy: number;
  lastModifiedBy: number;
}

export interface AccessTokenResponse {
  success: boolean;
  message: string;
  data: {
    token: string;
    expiration: string;
  };
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly baseUrl = `${environment.apiBaseUrl}/Auth`;

  constructor(private http: HttpClient) {}

  login(dto: LoginDto): Observable<AccessTokenResponse> {
    return this.http.post<AccessTokenResponse>(`${this.baseUrl}/login`, dto).pipe(
      tap(res => {
        if (res.success && res.data?.token) {
          localStorage.setItem('access_token', res.data.token);
        }
      })
    );
  }

  register(dto: RegisterDto): Observable<any> {
    return this.http.post(`${this.baseUrl}/register`, dto);
  }

  logout(): void {
    localStorage.removeItem('access_token');
  }

  isLoggedIn(): boolean {
    return !!localStorage.getItem('access_token');
  }
}
