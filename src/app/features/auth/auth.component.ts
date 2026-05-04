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
  templateUrl: './auth.component.html',
  styleUrl: './auth.component.scss',
})
export class AuthComponent {
  token     = '';
  realmId   = '32';

  features = [
    { label: 'Real-time SSE execution dashboard with per-agent progress' },
    { label: 'AI Pipeline Builder — problem statement to live workflow' },
    { label: 'Advanced artifact search across all 5 resource types' },
    { label: 'Projects & Use Cases for team-level organization' },
    { label: 'In-studio AI assistant powered by AAVA Revelio' },
  ];
  showToken = false;
  loading   = signal(false);
  error     = signal('');

  private auth   = inject(AuthService);
  private api    = inject(AavaApiService);
  private router = inject(Router);
  private notify = inject(NotificationService);

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
        this.notify.success(`Welcome back, ${user.name}!`);
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
