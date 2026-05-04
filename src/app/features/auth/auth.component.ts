import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { catchError, of } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [FormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './auth.component.html',
  styleUrl: './auth.component.scss',
})
export class AuthComponent {
  token     = '';
  realmId   = '32';
  showToken = false;
  loading   = signal(false);
  error     = signal('');

  features = [
    { label: 'Real-time SSE execution dashboard with per-agent progress' },
    { label: 'AI Pipeline Builder — problem statement to live workflow' },
    { label: 'Advanced artifact search across all 5 resource types' },
    { label: 'Projects & Use Cases for team-level organization' },
    { label: 'In-studio AI assistant powered by AAVA Revelio' },
  ];

  private auth   = inject(AuthService);
  private http   = inject(HttpClient);
  private router = inject(Router);
  private notify = inject(NotificationService);

  connect(): void {
    const token  = this.token.trim();
    const realm  = (this.realmId || '32').trim();
    if (!token) return;

    this.loading.set(true);
    this.error.set('');

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'x-realm-id':    realm,
      'Content-Type':  'application/json',
    });

    // Verify token with a lightweight, known-good endpoint
    this.http.get<any>(
      `${environment.aavaBaseUrl}/agents/user?page=1&records=1&isDeleted=false`,
      { headers }
    ).pipe(
      catchError(err => {
        const status  = err.status ?? 0;
        const message = err.error?.message ?? err.error?.error ?? err.message ?? '';

        let friendly = '';
        if (status === 0) {
          friendly = 'Cannot reach AAVA (network error or CORS). Make sure the dev server proxy is running.';
        } else if (status === 401 || status === 403) {
          friendly = `Token rejected by AAVA (HTTP ${status}). Check your PAT — it may be expired or for a different realm.`;
        } else if (status === 404) {
          friendly = `AAVA endpoint not found (HTTP 404). Base URL may be misconfigured.`;
        } else {
          friendly = `AAVA returned HTTP ${status}${message ? ': ' + message : ''}. Try again or contact support.`;
        }

        this.loading.set(false);
        this.error.set(friendly);
        return of(null);
      })
    ).subscribe(res => {
      if (!res) return; // error already handled

      // Token is valid — store it and derive user from JWT payload
      this.auth.setToken(token);
      this.auth.setRealm(realm);

      // Try to extract name/email from JWT payload (non-sensitive, just for display)
      let name = 'Studio User';
      let email = '';
      let role: any = 'SUPER_ADMIN';
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        name  = payload.name  ?? payload.sub ?? payload.email ?? name;
        email = payload.email ?? payload.sub ?? '';
        role  = payload.role  ?? payload.authorities?.[0] ?? role;
      } catch { /* JWT decode failed — use defaults */ }

      this.auth.setUser({ id: 0, name, email, role, realmId: realm });
      this.loading.set(false);
      this.notify.success(`Welcome, ${name}!`);
      this.router.navigate(['/studio/search']);
    });
  }
}
