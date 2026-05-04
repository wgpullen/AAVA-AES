import { Component, Input, inject } from '@angular/core';
import { RouterLink, Router, NavigationEnd } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CommonModule } from '@angular/common';
import { filter, map } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink, MatIconModule, MatButtonModule, MatTooltipModule, CommonModule],
  template: `
    <header class="header">
      <div class="header-left">
        <div class="page-title">{{ pageTitle() }}</div>
      </div>
      <div class="header-right">
        <div class="realm-pill">
          <mat-icon>domain</mat-icon>
          Realm {{ auth.realm() }}
        </div>

        <!-- Dark / Light mode toggle -->
        <button class="hdr-btn" (click)="theme.toggle()"
                [matTooltip]="theme.isDark() ? 'Switch to light mode' : 'Switch to dark mode'">
          <mat-icon>{{ theme.isDark() ? 'light_mode' : 'dark_mode' }}</mat-icon>
        </button>

        <a routerLink="/studio/assistant" class="hdr-btn"
           matTooltip="AES Assistant">
          <mat-icon>smart_toy</mat-icon>
        </a>
      </div>
    </header>
  `,
  styles: [`
    .header {
      height: var(--aes-header-height);
      background: var(--aes-bg-header);
      border-bottom: 1px solid var(--aes-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
      flex-shrink: 0;
      z-index: 50;
    }
    .page-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--aes-text-primary);
      letter-spacing: 0.01em;
    }
    .header-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .realm-pill {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      font-weight: 500;
      color: var(--aes-text-muted);
      background: var(--aes-bg-elevated);
      padding: 4px 10px;
      border-radius: 20px;
      border: 1px solid var(--aes-border);
      mat-icon { font-size: 14px; width: 14px; height: 14px; }
    }
    .hdr-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 34px;
      border-radius: var(--aes-radius-md);
      background: none;
      border: none;
      cursor: pointer;
      color: var(--aes-text-secondary);
      text-decoration: none;
      transition: color 0.15s, background 0.15s;
      &:hover { color: var(--aes-accent); background: var(--aes-bg-hover); }
      mat-icon { font-size: 20px; width: 20px; height: 20px; }
    }
  `],
})
export class HeaderComponent {
  @Input() sidebarCollapsed = false;
  auth  = inject(AuthService);
  theme = inject(ThemeService);

  private router = inject(Router);

  private titleMap: Record<string, string> = {
    'dashboard': 'Dashboard',
    'search':    'Artifact Search',
    'execute':   'Execute & Watch',
    'builder':   'Pipeline Builder',
    'projects':  'Projects & Use Cases',
    'examples':  'Example Runs',
    'assistant': 'AES Assistant',
  };

  pageTitle = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map(() => {
        const seg = this.router.url.split('/').pop()?.split('?')[0] ?? '';
        return this.titleMap[seg] ?? 'Autonomous Engineering Studio';
      })
    ),
    { initialValue: this.getInitialTitle() }
  );

  private getInitialTitle(): string {
    const seg = this.router.url.split('/').pop()?.split('?')[0] ?? '';
    return this.titleMap[seg] ?? 'Autonomous Engineering Studio';
  }
}
