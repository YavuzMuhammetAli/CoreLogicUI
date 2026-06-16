import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
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
  private readonly platformId = inject(PLATFORM_ID);

  constructor(private http: HttpClient) {}

  private get storage(): Storage | null {
    return isPlatformBrowser(this.platformId) ? localStorage : null;
  }

  login(dto: LoginDto): Observable<AccessTokenResponse> {
    return this.http.post<AccessTokenResponse>(`${this.baseUrl}/login`, dto).pipe(
      tap(res => {
        if (res.success && res.data?.token) {
          this.storage?.setItem('access_token', res.data.token);
        }
      })
    );
  }

  register(dto: RegisterDto): Observable<any> {
    return this.http.post(`${this.baseUrl}/register`, dto);
  }

  logout(): void {
    this.storage?.removeItem('access_token');
  }

  isLoggedIn(): boolean {
    return !!this.storage?.getItem('access_token');
  }

  /** JWT payload'ını çözümleyip kullanıcı bilgisini döndürür. */
  getUserFromToken(): { name: string; email: string; initials: string } | null {
    const token = this.storage?.getItem('access_token');
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const name: string = payload['unique_name'] ?? payload['name'] ?? '';
      const email: string = payload['email'] ?? '';
      // Ad yoksa e-postanın @ öncesi kısmını görünen ad olarak kullan
      const display = name || email.split('@')[0] || '';
      const source = name || email;
      const parts = name.trim().split(' ').filter(Boolean);
      const initials = parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : source.slice(0, 2).toUpperCase();
      return { name: display, email, initials };
    } catch {
      return null;
    }
  }
}
