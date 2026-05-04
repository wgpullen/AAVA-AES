import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CommonModule } from '@angular/common';
import { catchError, of } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { RealmService } from '../../core/services/realm.service';
import { NotificationService } from '../../core/services/notification.service';
import { ArtifactCacheService } from '../../core/services/artifact-cache.service';
import { environment } from '../../../environments/environment';

interface RealmOption {
  id: string;
  name: string;
}

// Known realms as confirmed fallback (from AAVA spec + network traces May 2026)
const KNOWN_REALMS: RealmOption[] = [
  { id: '32', name: 'platformengineeringallteam' },
  { id: '59', name: 'Executive' },
  { id: '75', name: 'asc-markets-all' },
  { id: '1',  name: 'Ascendion' },
];

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [FormsModule, CommonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './auth.component.html',
  styleUrl: './auth.component.scss',
})
export class AuthComponent {
  token        = '';
  showToken    = false;
  selectedRealm: string = '';

  loading       = signal(false);
  loadingRealms = signal(false);
  realms        = signal<RealmOption[]>([]);
  realmsFetched = signal(false);
  error         = signal('');

  features = [
    { label: 'Real-time SSE execution dashboard with per-agent progress' },
    { label: 'AI Pipeline Builder — problem statement to live workflow' },
    { label: 'Advanced artifact search across all 5 resource types + guardrails' },
    { label: 'Projects & Use Cases for team-level organization' },
    { label: 'In-studio AI assistant powered by AAVA Revelio' },
  ];

  private auth   = inject(AuthService);
  private realm  = inject(RealmService);
  private cache  = inject(ArtifactCacheService);
  private http   = inject(HttpClient);
  private router = inject(Router);
  private notify = inject(NotificationService);

  get canLoadRealms(): boolean {
    return this.token.trim().length > 20 && !this.loadingRealms();
  }

  get canConnect(): boolean {
    return !!this.token.trim() && !!this.selectedRealm && !this.loading();
  }

  loadRealms(): void {
    const token = this.token.trim();
    if (!token) return;

    this.loadingRealms.set(true);
    this.error.set('');
    this.realms.set([]);
    this.selectedRealm = '';

    // Use realm 1 (Ascendion root) as bootstrap realm for the realm-list call
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'x-realm-id': '1',
      'Content-Type': 'application/json',
    });

    this.http.get<any>(
      `${environment.aavaBaseUrl}/api/auth/realms`,
      { headers }
    ).pipe(
      catchError(() => of(null))
    ).subscribe(res => {
      this.loadingRealms.set(false);
      this.realmsFetched.set(true);

      const raw: any[] = res?.data ?? res?.realmList ?? res?.realms ??
                         (Array.isArray(res) ? res : []);

      if (raw.length) {
        const fetched: RealmOption[] = raw.map((r: any) => ({
          id:   String(r.realmId ?? r.id ?? r.realm_id ?? ''),
          name: r.realmName ?? r.name ?? r.realm ?? `Realm ${r.realmId ?? r.id}`,
        })).filter(r => r.id);

        // Merge fetched with known, fetched takes priority
        const knownNotFetched = KNOWN_REALMS.filter(
          k => !fetched.some(f => f.id === k.id)
        );
        this.realms.set([...fetched, ...knownNotFetched]);
      } else {
        // API returned nothing or failed — fall back to confirmed known realms
        this.realms.set([...KNOWN_REALMS]);
      }

      // Auto-select the most common realm
      const primary = this.realms().find(r => r.id === '32') ?? this.realms()[0];
      if (primary) this.selectedRealm = primary.id;
    });
  }

  connect(): void {
    const token = this.token.trim();
    const realm = this.selectedRealm;
    if (!token || !realm) return;

    this.loading.set(true);
    this.error.set('');

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'x-realm-id': realm,
      'Content-Type': 'application/json',
    });

    this.http.get<any>(
      `${environment.aavaBaseUrl}/agents/user?page=1&records=1&isDeleted=false`,
      { headers }
    ).pipe(
      catchError(err => {
        const status  = err.status ?? 0;
        const message = err.error?.message ?? err.error?.error ?? err.message ?? '';
        let friendly = '';
        if (status === 0) {
          friendly = 'Cannot reach AAVA (network/CORS). Make sure the dev server proxy is running.';
        } else if (status === 401 || status === 403) {
          friendly = `Token rejected by AAVA (HTTP ${status}). Check your PAT — it may be expired.`;
        } else if (status === 404) {
          friendly = `AAVA endpoint not found (HTTP 404). Proxy may be misconfigured.`;
        } else {
          friendly = `AAVA returned HTTP ${status}${message ? ': ' + message : ''}. Try again or contact support.`;
        }
        this.loading.set(false);
        this.error.set(friendly);
        return of(null);
      })
    ).subscribe(res => {
      if (!res) return;

      this.auth.setToken(token);
      this.auth.setRealm(realm);

      // Register all fetched realms in RealmService for the header switcher
      this.realms().forEach(r => this.realm.addRealm(r));
      this.realm.setActive(realm);

      let name = 'Studio User', email = '', role: any = 'SUPER_ADMIN';
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        name  = payload.name  ?? payload.sub ?? payload.email ?? name;
        email = payload.email ?? payload.sub ?? '';
        role  = payload.role  ?? payload.authorities?.[0] ?? role;
      } catch {}

      this.auth.setUser({ id: 0, name, email, role, realmId: realm });
      this.loading.set(false);
      this.notify.success(`Welcome, ${name}!`);
      this.cache.preload(); // pre-load all artifacts in background immediately after login
      this.router.navigate(['/studio/dashboard']);
    });
  }
}
