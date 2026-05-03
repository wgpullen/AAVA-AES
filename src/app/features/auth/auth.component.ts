import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/services/auth.service';
import { AavaApiService } from '../../core/services/aava-api.service';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [FormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <div class="auth-page">
      <div class="auth-card aes-fade-in">
        <div class="auth-logo">
          <div class="logo-glow">⚡</div>
          <h1>Autonomous Engineering Studio</h1>
          <p>Connect your AAVA Personal Access Token to continue</p>
        </div>

        <form class="auth-form" (ngSubmit)="connect()">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>AAVA Personal Access Token</mat-label>
            <mat-icon matPrefix>key</mat-icon>
            <input matInput [(ngModel)]="token" name="token"
                   [type]="showToken ? 'text' : 'password'"
                   placeholder="eyJ..." required autocomplete="off" />
            <button mat-icon-button matSuffix type="button" (click)="showToken = !showToken">
              <mat-icon>{{ showToken ? 'visibility_off' : 'visibility' }}</mat-icon>
            </button>
          </mat-form-field>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Realm ID</mat-label>
            <mat-icon matPrefix>domain</mat-icon>
            <input matInput [(ngModel)]="realmId" name="realm" placeholder="32" />
            <mat-hint>Default realm is 32 (platformengineeringallteam)</mat-hint>
          </mat-form-field>

          @if (error()) {
            <div class="auth-error">
              <mat-icon>error_outline</mat-icon>
              {{ error() }}
            </div>
          }

          <button mat-flat-button color="primary" type="submit" class="connect-btn"
                  [disabled]="!token || loading()">
            @if (loading()) {
              <mat-spinner diameter="18" />
              Connecting...
            } @else {
              <mat-icon>electric_bolt</mat-icon>
              Connect to AAVA
            }
          </button>
        </form>

        <div class="auth-hint">
          <mat-icon>info_outline</mat-icon>
          Your token is stored only in this browser session and never sent anywhere except AAVA.
        </div>
      </div>
    </div>
  `,
  styleUrl: './auth.component.scss',
})
export class AuthComponent {
  token   = '';
  realmId = '32';
  showToken = false;
  loading = signal(false);
  error   = signal('');

  private auth    = inject(AuthService);
  private api     = inject(AavaApiService);
  private router  = inject(Router);
  private notify  = inject(NotificationService);

  connect(): void {
    if (!this.token) return;
    this.loading.set(true);
    this.error.set('');
    this.auth.setToken(this.token);
    this.auth.setRealm(this.realmId || '32');

    this.api.getCurrentUser().subscribe({
      next: user => {
        this.auth.setUser({
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as any,
          realmId: this.realmId || '32',
        });
        this.notify.success(`Welcome, ${user.name}!`);
        this.router.navigate(['/studio/search']);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Invalid token or unable to reach AAVA. Check your PAT and try again.');
        this.auth.logout();
      },
    });
  }
}
