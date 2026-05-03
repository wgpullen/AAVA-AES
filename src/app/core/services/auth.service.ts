import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';

export interface AesUser {
  id: number;
  email: string;
  name: string;
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
  realmId: string;
}

const TOKEN_KEY = 'aes_pat';
const USER_KEY  = 'aes_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _token  = signal<string | null>(null);
  private _user   = signal<AesUser | null>(null);
  private _realm  = signal<string>('32');

  readonly token  = computed(() => this._token());
  readonly user   = computed(() => this._user());
  readonly realm  = computed(() => this._realm());
  readonly isAuthenticated = computed(() => !!this._token());
  readonly isSuperAdmin    = computed(() => this._user()?.role === 'SUPER_ADMIN');
  readonly isAdmin         = computed(() => ['ADMIN','SUPER_ADMIN'].includes(this._user()?.role ?? ''));

  constructor(private router: Router) {
    // Restore from session storage
    const stored = sessionStorage.getItem(TOKEN_KEY);
    if (stored) this._token.set(stored);
    const storedUser = sessionStorage.getItem(USER_KEY);
    if (storedUser) {
      try { this._user.set(JSON.parse(storedUser)); } catch {}
    }
    // Check URL for token param (AAVA passes it on launch)
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) {
      this.setToken(urlToken);
      // Clean URL
      const clean = new URL(window.location.href);
      clean.searchParams.delete('token');
      window.history.replaceState({}, '', clean.toString());
    }
  }

  setToken(token: string): void {
    this._token.set(token);
    sessionStorage.setItem(TOKEN_KEY, token);
  }

  setUser(user: AesUser): void {
    this._user.set(user);
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  setRealm(realmId: string): void {
    this._realm.set(realmId);
  }

  logout(): void {
    this._token.set(null);
    this._user.set(null);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    this.router.navigate(['/auth']);
  }
}
